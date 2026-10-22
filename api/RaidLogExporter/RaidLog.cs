namespace RaidLogExporter;

/// <summary>
/// A log id is only unique within the realm whose API answered for it, so a log is always
/// named by both.
/// </summary>
public readonly record struct RaidLogKey(string Realm, int LogId);

/// <summary>A boss kill as the encounter ranking lists it, before its details are read.</summary>
public sealed record ListedRaidLog(
    RaidLogKey Key,
    string ApiRealm,
    int EncounterId,
    int DifficultyId
);

/// <summary>
/// A guild is its id on its realm; the name can change. An empty name means the guild could
/// not be named yet (see <see cref="RaidGuildResolver"/>).
/// </summary>
public sealed record RaidGuild(int Id, string Name, string Realm, int Faction);

/// <param name="Guild">The guild the log names for this member, often empty.</param>
/// <param name="Talents">
/// The talent picked on each tier, top to bottom: its column, <c>0</c> to <c>2</c> from the left,
/// or <c>.</c> for a tier left empty. Empty when the log has no talents for the member.
/// </param>
/// <param name="Trinkets">The trinkets worn during the kill, none to two.</param>
public sealed record RaidLogMember(
    string Name,
    string Realm,
    int ClassId,
    int SpecId,
    int Race,
    int Gender,
    string Guild,
    int ItemLevel,
    long DamageDone,
    long HealingDone,
    long AbsorbDone,
    long Overhealing,
    long DamageTaken,
    int Interrupts,
    int Dispels,
    string Talents,
    IReadOnlyList<RaidTrinket> Trinkets
);

/// <summary>
/// A trinket as a log describes it. One item can be worn at several item levels (Warforged,
/// Titanforged), so the item level is part of what it is.
/// </summary>
/// <param name="Quality">0 (poor) to 7 (heirloom), as WoW colours item names.</param>
/// <param name="Icon">Icon name without host or extension.</param>
public sealed record RaidTrinket(int Id, int ItemLevel, string Name, int Quality, string Icon);

/// <summary>A talent a spec can pick, as TauriShoot's talent calculator lists it.</summary>
/// <param name="Icon">Icon name without host or extension.</param>
public sealed record RaidTalent(int SpellId, string Name, string Icon);

/// <summary>
/// A spec's talent tiers, top to bottom, each with its choices left to right; the columns a
/// member's <see cref="RaidLogMember.Talents"/> pick from. A choice TauriShoot leaves out is null.
/// </summary>
public sealed record RaidSpecTalents(int SpecId, IReadOnlyList<IReadOnlyList<RaidTalent?>> Tiers);

public sealed record RaidSpellTooltip(
    int SpellId,
    IReadOnlyList<string> Details,
    string Description
);

/// <param name="KilledAt">Unix seconds.</param>
/// <param name="Faction">The side most members play for.</param>
/// <param name="Deaths">Deaths during the kill attempt itself.</param>
/// <param name="Items">The loot, one entry per item that dropped.</param>
public sealed record RaidLog(
    RaidLogKey Key,
    int EncounterId,
    int DifficultyId,
    long KilledAt,
    long FightMilliseconds,
    RaidGuild? Guild,
    int Faction,
    int Wipes,
    int Deaths,
    int Resurrects,
    IReadOnlyList<RaidLogMember> Members,
    IReadOnlyList<int> Items
);

/// <summary>
/// The kills an export added since the one before it. The leaderboard scores everyone again
/// without them to show how ranks and scores moved since that export.
/// </summary>
/// <param name="PreviousGeneratedAt">When the export they are new to read the rankings.</param>
/// <param name="NewLogs">Oldest first.</param>
public sealed record RaidScanChanges(
    DateTimeOffset PreviousGeneratedAt,
    IReadOnlyList<RaidLogKey> NewLogs
);

/// <param name="Quality">0 (poor) to 5 (legendary), as WoW colours item names.</param>
/// <param name="Icon">Icon name without host or extension.</param>
public sealed record RaidItem(int Id, string Name, int Quality, string Icon);
