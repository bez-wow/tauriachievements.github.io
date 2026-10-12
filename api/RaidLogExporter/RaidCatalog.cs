namespace RaidLogExporter;

public sealed record RaidDifficulty(int Id, string Slug, string Name, string ShortName);

public sealed record RaidBoss(int EncounterId, string Slug, string Name);

public sealed record RaidSpec(int Id, int ClassId, string Name, string Role);

/// <summary>
/// What the API does not tell us about the tracked raid: its bosses in Encounter Journal order
/// (the API's <c>encounter_order</c> puts Ursoc second), the URL slugs the /raid-logs pages use,
/// and the realm, spec and faction lookups the logs refer to by id. Keep the slugs stable;
/// they are page URLs and file names.
/// </summary>
public static class RaidCatalog
{
    public const int MapId = 1520;
    public const string Slug = "emerald-nightmare";
    public const string Name = "The Emerald Nightmare";

    public const string Evermoon = "Evermoon";
    public const string Tauri = "Tauri";
    public const string WoD = "WoD";

    public const string Dps = "dps";
    public const string Healer = "healer";
    public const string Tank = "tank";

    public const int Alliance = 0;
    public const int Horde = 1;

    /// <summary>In the order the page lists them, easiest first.</summary>
    public static readonly IReadOnlyList<RaidDifficulty> Difficulties =
    [
        new(17, "lfr", "Looking For Raid", "LFR"),
        new(14, "normal", "Normal", "N"),
        new(15, "heroic", "Heroic", "HC"),
        new(16, "mythic", "Mythic", "M"),
    ];

    public static readonly IReadOnlyList<RaidBoss> Bosses =
    [
        new(1853, "nythendra", "Nythendra"),
        new(1873, "ilgynoth", "Il'gynoth, The Heart of Corruption"),
        new(1876, "elerethe-renferal", "Elerethe Renferal"),
        new(1841, "ursoc", "Ursoc"),
        new(1854, "dragons-of-nightmare", "Dragons of Nightmare"),
        new(1877, "cenarius", "Cenarius"),
        new(1864, "xavius", "Xavius"),
    ];

    public static readonly IReadOnlyList<RaidSpec> Specs =
    [
        new(71, 1, "Arms", Dps),
        new(72, 1, "Fury", Dps),
        new(73, 1, "Protection", Tank),
        new(65, 2, "Holy", Healer),
        new(66, 2, "Protection", Tank),
        new(70, 2, "Retribution", Dps),
        new(253, 3, "Beast Mastery", Dps),
        new(254, 3, "Marksmanship", Dps),
        new(255, 3, "Survival", Dps),
        new(259, 4, "Assassination", Dps),
        new(260, 4, "Outlaw", Dps),
        new(261, 4, "Subtlety", Dps),
        new(256, 5, "Discipline", Healer),
        new(257, 5, "Holy", Healer),
        new(258, 5, "Shadow", Dps),
        new(250, 6, "Blood", Tank),
        new(251, 6, "Frost", Dps),
        new(252, 6, "Unholy", Dps),
        new(262, 7, "Elemental", Dps),
        new(263, 7, "Enhancement", Dps),
        new(264, 7, "Restoration", Healer),
        new(62, 8, "Arcane", Dps),
        new(63, 8, "Fire", Dps),
        new(64, 8, "Frost", Dps),
        new(265, 9, "Affliction", Dps),
        new(266, 9, "Demonology", Dps),
        new(267, 9, "Destruction", Dps),
        new(268, 10, "Brewmaster", Tank),
        new(270, 10, "Mistweaver", Healer),
        new(269, 10, "Windwalker", Dps),
        new(102, 11, "Balance", Dps),
        new(103, 11, "Feral", Dps),
        new(104, 11, "Guardian", Tank),
        new(105, 11, "Restoration", Healer),
        new(577, 12, "Havoc", Dps),
        new(581, 12, "Vengeance", Tank),
    ];

    private static readonly Dictionary<int, RaidSpec> SpecsById = Specs.ToDictionary(spec =>
        spec.Id
    );

    /// <summary>The API's realm ids, as in <c>rid</c> and <c>guildrid</c>.</summary>
    private static readonly Dictionary<int, string> RealmsById = new()
    {
        [9] = Evermoon,
        [11] = WoD,
        [12] = Tauri,
    };

    private static readonly HashSet<int> HordeRaces = [2, 5, 6, 8, 9, 10, 26, 27, 28, 31, 35, 36];

    public static RaidDifficulty? FindDifficulty(int id) =>
        Difficulties.FirstOrDefault(difficulty => difficulty.Id == id);

    public static RaidBoss? FindBoss(int encounterId) =>
        Bosses.FirstOrDefault(boss => boss.EncounterId == encounterId);

    public static string? RealmName(int realmId) => RealmsById.GetValueOrDefault(realmId);

    /// <summary>
    /// The spec only when it belongs to the class. A few logs pair a class with another class's
    /// spec (a Druid logged as Retribution); those members keep their numbers but get spec 0,
    /// so no spec ranking counts them.
    /// </summary>
    public static int ValidSpecId(int classId, int specId) =>
        SpecsById.TryGetValue(specId, out var spec) && spec.ClassId == classId ? specId : 0;

    public static string? SpecRole(int specId) => SpecsById.GetValueOrDefault(specId)?.Role;

    public static int RaceFaction(int race) => HordeRaces.Contains(race) ? Horde : Alliance;

    public static string BossFileName(RaidBoss boss, RaidDifficulty difficulty) =>
        $"{boss.Slug}-{difficulty.Slug}.json";
}
