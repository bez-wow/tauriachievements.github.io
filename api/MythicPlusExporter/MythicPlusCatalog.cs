namespace MythicPlusExporter;

public sealed record MythicPlusSeason(string Id, string Name, string Raid, string StartDate);

public sealed record DungeonInfo(string Slug, string ShortName, string IconName);

/// <summary>
/// What the API does not tell us: the season the leaderboard belongs to, and the short name,
/// URL slug and icon of each challenge map. The slugs are the page's <c>?dungeon=</c> values,
/// so keep them stable.
/// </summary>
public static class MythicPlusCatalog
{
    public static readonly MythicPlusSeason Season = new(
        "legion-s1",
        "Legion Season 1",
        "Emerald Nightmare",
        "2026-09-16"
    );

    private const string UnknownIconName = "inv_misc_questionmark";

    private static readonly Dictionary<int, DungeonInfo> Dungeons = new()
    {
        [197] = new("eoa", "EOA", "achievement_dungeon_eyeofazshara"),
        [198] = new("dht", "DHT", "achievement_dungeon_darkheartthicket"),
        [199] = new("brh", "BRH", "achievement_dungeon_blackrookhold"),
        [200] = new("hov", "HOV", "achievement_dungeon_hallsofvalor"),
        [206] = new("nl", "NL", "achievement_dungeon_neltharionslair"),
        [207] = new("votw", "VOTW", "achievement_dungeon_vaultofthewardens"),
        [208] = new("mos", "MOS", "achievement_dungeon_mawofsouls"),
        [209] = new("arc", "ARC", "achievement_dungeon_thearcway"),
        [210] = new("cos", "COS", "achievement_dungeon_courtofstars"),
        [227] = new("lowr", "LOWR", "achievement_raid_karazhan"),
        [233] = new("coen", "COEN", "achievement_dungeon_tombofsargeras"),
        [234] = new("uppr", "UPPR", "achievement_raid_karazhan"),
        [239] = new("seat", "SEAT", "achievement_dungeon_argusdungeon"),
    };

    /// <summary>
    /// Maps the server lists but has not opened yet (Karazhan, Cathedral, Seat). Their
    /// leaderboards are always empty, so they are not read at all. Remove an id when the
    /// dungeon opens; its slug and icon above are already in place.
    /// </summary>
    private static readonly HashSet<int> UnreleasedChallengeIds = [227, 233, 234, 239];

    private static readonly HashSet<string> MinorWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "of",
        "the",
        "to",
    };

    public static bool IsReleased(int challengeId) => !UnreleasedChallengeIds.Contains(challengeId);

    /// <summary>A map the catalog does not know yet still gets a usable slug, label and icon.</summary>
    public static DungeonInfo GetDungeon(int challengeId, string name)
    {
        if (Dungeons.TryGetValue(challengeId, out var dungeon))
        {
            return dungeon;
        }

        var initials = string.Concat(
            name.Split(
                    [' ', ':', '-', '\''],
                    StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
                )
                .Where(word => !MinorWords.Contains(word))
                .Select(word => char.ToUpperInvariant(word[0]))
        );

        return new DungeonInfo(
            $"cm{challengeId}",
            initials.Length > 0 ? initials : $"CM{challengeId}",
            UnknownIconName
        );
    }

    /// <summary>
    /// The API names icons without a host; <c>dataUrlPrefix</c> ("legion-") picks the
    /// expansion's static server.
    /// </summary>
    public static string IconUrl(string dataUrlPrefix, string iconName) =>
        $"https://{dataUrlPrefix}static.tauri.hu/images/icons/large/{iconName}.png";
}
