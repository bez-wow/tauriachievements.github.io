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
    int Dispels
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
