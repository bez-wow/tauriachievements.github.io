using System.Net;
using System.Text.Json;
using Tauri.Core.Helpers;

namespace RaidLogExporter;

/// <summary>Maps the API's <c>raid-rank-encounter</c> and <c>raid-log</c> answers to records.</summary>
public static class RaidLogResponseParser
{
    public static IReadOnlyList<ListedRaidLog> ParseRanking(JsonElement response, string apiRealm)
    {
        if (
            response.ValueKind != JsonValueKind.Object
            || !response.TryGetProperty("logs", out var logs)
            || logs.ValueKind != JsonValueKind.Array
        )
        {
            throw new InvalidOperationException("The encounter ranking has no logs array.");
        }

        var realm = DisplayRealm(apiRealm);
        return
        [
            .. logs.EnumerateArray()
                .Where(log => log.ValueKind == JsonValueKind.Object)
                .Select(log => new ListedRaidLog(
                    new RaidLogKey(realm, ReadInt(log, "log_id")),
                    apiRealm,
                    ReadInt(log, "encounter_id"),
                    ReadInt(log, "difficulty")
                ))
                .Where(log => log.Key.LogId > 0),
        ];
    }

    /// <summary>
    /// Reads a log's details, or returns null when they do not describe the listed kill (another
    /// raid, boss or difficulty, or nobody in it).
    /// </summary>
    public static RaidLog? ParseLog(JsonElement response, ListedRaidLog listed)
    {
        if (
            response.ValueKind != JsonValueKind.Object
            || ReadInt(response, "log_id") != listed.Key.LogId
            || ReadInt(response, "map_id") != RaidCatalog.MapId
            || ReadInt(response, "encounter_id") != listed.EncounterId
            || ReadInt(response, "difficulty") != listed.DifficultyId
            || !response.TryGetProperty("members", out var membersElement)
            || membersElement.ValueKind != JsonValueKind.Array
        )
        {
            return null;
        }

        var members = membersElement
            .EnumerateArray()
            .Where(member => member.ValueKind == JsonValueKind.Object)
            .Select(member => ParseMember(member, listed.Key.Realm))
            .Where(member => member is not null)
            .Select(member => member!)
            .ToList();

        if (members.Count == 0)
        {
            return null;
        }

        return new RaidLog(
            listed.Key,
            listed.EncounterId,
            listed.DifficultyId,
            ReadLong(response, "killtime"),
            ReadLong(response, "fight_time"),
            ParseGuild(response, listed.Key.Realm, members),
            MajorityFaction(members),
            ReadInt(response, "wipes"),
            ReadInt(response, "deaths_fight"),
            ReadInt(response, "resurrects_fight"),
            members,
            ParseItems(response)
        );
    }

    /// <summary>
    /// Where a member plays. A member with an armory link is on the realm the link names. Legion
    /// raids of Evermoon and Tauri characters are all logged on Tauri's API, and there the
    /// Evermoon characters come without a link (<c>valid_player: false</c>): checked against the
    /// Mythic+ player list on 2026-10-12, 98,869 of those members were Evermoon characters and
    /// 169 matched a Tauri name. Elsewhere a member without a link plays on the log's realm.
    /// </summary>
    public static string MemberRealm(string link, string logRealm)
    {
        var linkedRealm = ReadLinkRealm(link);
        if (
            linkedRealm is not null
            && CharacterHelpers.TryResolveRealm(linkedRealm, out _, out var realm)
        )
        {
            return realm;
        }

        return logRealm == RaidCatalog.Tauri ? RaidCatalog.Evermoon : logRealm;
    }

    public static string DisplayRealm(string apiRealm) =>
        CharacterHelpers.TryResolveRealm(apiRealm, out _, out var displayRealm)
            ? displayRealm
            : apiRealm;

    private static RaidLogMember? ParseMember(JsonElement member, string logRealm)
    {
        var name = ReadString(member, "name").Trim();
        if (name.Length == 0)
        {
            return null;
        }

        var classId = ReadInt(member, "class");
        return new RaidLogMember(
            name,
            MemberRealm(ReadString(member, "link"), logRealm),
            classId,
            RaidCatalog.ValidSpecId(classId, ReadInt(member, "spec")),
            ReadInt(member, "race"),
            ReadInt(member, "gender"),
            ReadString(member, "guildName").Trim(),
            ReadInt(member, "ilvl"),
            ReadLong(member, "dmg_done"),
            ReadLong(member, "heal_done"),
            ReadLong(member, "absorb_done"),
            ReadLong(member, "overheal"),
            ReadLong(member, "dmg_taken"),
            ReadInt(member, "interrupts"),
            ReadInt(member, "dispells")
        );
    }

    /// <summary>
    /// The guild the server credits with the kill; a pickup group has guild id 0. The API looks a
    /// guild's name and faction up on the log's own realm, so it only gets them right for a guild
    /// of that realm. An Evermoon guild on a Tauri log comes back with whatever Tauri guild has the
    /// same id (Competence Optional, Evermoon guild 7440, as Tauri's "Knights Of Paradise"), or
    /// with none. Such a guild keeps its id and realm here, without a name, and its members' side.
    /// </summary>
    private static RaidGuild? ParseGuild(
        JsonElement response,
        string logRealm,
        IReadOnlyList<RaidLogMember> members
    )
    {
        var id = ReadInt(response, "guildid");
        if (id == 0)
        {
            return null;
        }

        var realm = RaidCatalog.RealmName(ReadInt(response, "guildrid")) ?? logRealm;
        if (
            realm != logRealm
            || !response.TryGetProperty("guilddata", out var guildData)
            || guildData.ValueKind != JsonValueKind.Object
        )
        {
            return new RaidGuild(id, "", realm, MajorityFaction(members));
        }

        var faction =
            ReadInt(guildData, "faction") == RaidCatalog.Horde
                ? RaidCatalog.Horde
                : RaidCatalog.Alliance;
        return new RaidGuild(id, ReadString(guildData, "name").Trim(), realm, faction);
    }

    public static int MajorityFaction(IEnumerable<RaidLogMember> members)
    {
        var count = 0;
        var horde = 0;
        foreach (var member in members)
        {
            count++;
            if (RaidCatalog.RaceFaction(member.Race) == RaidCatalog.Horde)
            {
                horde++;
            }
        }

        return horde * 2 > count ? RaidCatalog.Horde : RaidCatalog.Alliance;
    }

    private static IReadOnlyList<int> ParseItems(JsonElement response)
    {
        if (
            !response.TryGetProperty("items", out var items)
            || items.ValueKind != JsonValueKind.Array
        )
        {
            return [];
        }

        var result = new List<int>();
        foreach (var item in items.EnumerateArray())
        {
            var id = item.ValueKind == JsonValueKind.Object ? ReadInt(item, "itemid") : 0;
            if (id <= 0)
            {
                continue;
            }

            var count = Math.Clamp(ReadInt(item, "count"), 1, 10);
            for (var copy = 0; copy < count; copy++)
            {
                result.Add(id);
            }
        }

        return result;
    }

    /// <summary>Links look like <c>r=[HU] Tauri WoW Server&amp;amp;n=Name</c>, HTML-escaped.</summary>
    private static string? ReadLinkRealm(string link)
    {
        if (string.IsNullOrWhiteSpace(link))
        {
            return null;
        }

        foreach (var part in WebUtility.HtmlDecode(link).Split('&'))
        {
            if (part.StartsWith("r=", StringComparison.Ordinal))
            {
                var realm = part[2..].Trim();
                return realm.Length > 0 ? realm : null;
            }
        }

        return null;
    }

    private static int ReadInt(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.Number
        && property.TryGetInt32(out var value)
            ? value
            : 0;

    private static long ReadLong(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.Number
        && property.TryGetInt64(out var value)
            ? value
            : 0;

    private static string ReadString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : string.Empty;
}
