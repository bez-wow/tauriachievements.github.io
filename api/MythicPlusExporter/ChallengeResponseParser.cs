using System.Text.Json;
using Tauri.Core.Helpers;

namespace MythicPlusExporter;

public sealed record ChallengeIndex(string DataUrlPrefix, IReadOnlyList<ChallengeMap> Maps);

public sealed record ChallengeMap(int ChallengeId, string Name, int TimerSeconds);

public sealed record ChallengeAffix(
    int Id,
    string Name,
    string Description,
    string Icon,
    int Level
);

public sealed record ChallengeMember(
    string Name,
    string Realm,
    string Guild,
    int ClassId,
    int Race,
    int Gender,
    int SpecId,
    string SpecName,
    string Role
);

public sealed record ChallengeRun(
    int KeyLevel,
    long ClearTimeMilliseconds,
    long CompletedAt,
    IReadOnlyList<ChallengeAffix> Affixes,
    IReadOnlyList<ChallengeMember> Members
);

/// <summary>
/// Maps the <c>challenge-index</c> and <c>challenge-leaderboard</c> responses. The API pads
/// the affix list with id 0 for slots a key is too low to have, and returns <c>{}</c> as
/// playerinfo for characters it no longer knows; both are dropped.
/// </summary>
public static class ChallengeResponseParser
{
    private const string DefaultDataUrlPrefix = "legion-";

    /// <summary>Legion affix slots unlock at +4, +7 and +10, and the API lists them in slot order.</summary>
    private static readonly int[] AffixSlotLevels = [4, 7, 10];

    private static readonly string[] RoleNames = ["tank", "healer", "dps"];

    public static ChallengeIndex ParseIndex(JsonElement response)
    {
        var prefix = GetString(response, "dataUrlPrefix");
        var maps = new List<ChallengeMap>();

        if (
            response.TryGetProperty("challengemodemaps", out var mapsElement)
            && mapsElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
        )
        {
            foreach (var map in EnumerateItems(mapsElement))
            {
                var challengeId = GetInt(map, "challengeid");
                var timerSeconds = GetInt(map, "bronzemedaltime");
                if (challengeId > 0 && timerSeconds > 0)
                {
                    maps.Add(
                        new ChallengeMap(
                            challengeId,
                            GetString(map, "challengemapname") is { Length: > 0 } name
                                ? name
                                : $"Challenge {challengeId}",
                            timerSeconds
                        )
                    );
                }
            }
        }

        maps.Sort((left, right) => left.ChallengeId.CompareTo(right.ChallengeId));
        return new ChallengeIndex(prefix.Length > 0 ? prefix : DefaultDataUrlPrefix, maps);
    }

    public static IReadOnlyList<ChallengeRun> ParseLeaderboard(JsonElement response)
    {
        if (
            !response.TryGetProperty("challengesdata", out var runsElement)
            || runsElement.ValueKind is not (JsonValueKind.Object or JsonValueKind.Array)
        )
        {
            return [];
        }

        var runs = new List<ChallengeRun>();
        foreach (var run in EnumerateItems(runsElement))
        {
            var keyLevel = GetInt(run, "level");
            var clearTime = GetLong(run, "completiontime");
            var members = ParseMembers(run);

            if (keyLevel <= 0 || clearTime <= 0 || members.Count == 0)
            {
                continue;
            }

            runs.Add(
                new ChallengeRun(
                    keyLevel,
                    clearTime,
                    GetLong(run, "completedtime"),
                    ParseAffixes(run),
                    members
                )
            );
        }

        return runs;
    }

    private static List<ChallengeAffix> ParseAffixes(JsonElement run)
    {
        var affixes = new List<ChallengeAffix>();
        if (
            !run.TryGetProperty("affixes", out var affixesElement)
            || affixesElement.ValueKind != JsonValueKind.Array
        )
        {
            return affixes;
        }

        var slot = 0;
        foreach (var affix in affixesElement.EnumerateArray())
        {
            var id = GetInt(affix, "id");
            if (id > 0)
            {
                affixes.Add(
                    new ChallengeAffix(
                        id,
                        GetString(affix, "name"),
                        GetString(affix, "description"),
                        GetString(affix, "icon"),
                        AffixSlotLevels[Math.Min(slot, AffixSlotLevels.Length - 1)]
                    )
                );
            }

            slot++;
        }

        return affixes;
    }

    private static List<ChallengeMember> ParseMembers(JsonElement run)
    {
        var members = new List<ChallengeMember>();
        if (
            !run.TryGetProperty("players", out var playersElement)
            || playersElement.ValueKind != JsonValueKind.Array
        )
        {
            return members;
        }

        foreach (var player in playersElement.EnumerateArray())
        {
            if (
                player.ValueKind != JsonValueKind.Object
                || !player.TryGetProperty("playerinfo", out var info)
                || info.ValueKind != JsonValueKind.Object
            )
            {
                continue;
            }

            var name = GetString(info, "charname");
            var specName = GetString(player, "specializationname");
            if (name.Length == 0 || specName.Length == 0)
            {
                continue;
            }

            var rawRealm = GetString(info, "realm");
            var realm = CharacterHelpers.TryResolveRealm(rawRealm, out _, out var displayRealm)
                ? displayRealm
                : rawRealm;
            var roleIndex = GetInt(player, "specializationrole");

            members.Add(
                new ChallengeMember(
                    name,
                    realm,
                    GetString(info, "guildname"),
                    GetInt(info, "class"),
                    GetInt(info, "race"),
                    GetInt(info, "gender"),
                    GetInt(player, "specializationid"),
                    specName,
                    roleIndex is >= 0 and < 3 ? RoleNames[roleIndex] : "dps"
                )
            );
        }

        return members;
    }

    // Keyed objects ({"197": {...}}) and arrays both occur in this API.
    private static IEnumerable<JsonElement> EnumerateItems(JsonElement element) =>
        element.ValueKind == JsonValueKind.Array
            ? element.EnumerateArray()
            : element.EnumerateObject().Select(property => property.Value);

    private static string GetString(JsonElement element, string propertyName) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(propertyName, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim() ?? string.Empty
            : string.Empty;

    private static int GetInt(JsonElement element, string propertyName) =>
        (int)Math.Clamp(GetLong(element, propertyName), int.MinValue, int.MaxValue);

    private static long GetLong(JsonElement element, string propertyName)
    {
        if (
            element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(propertyName, out var value)
        )
        {
            return 0;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt64(out var number) => number,
            JsonValueKind.String when long.TryParse(value.GetString(), out var parsed) => parsed,
            _ => 0,
        };
    }
}
