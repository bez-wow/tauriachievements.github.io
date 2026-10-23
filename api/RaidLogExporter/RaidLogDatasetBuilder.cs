namespace RaidLogExporter;

public sealed record RaidPlayer(
    string Name,
    string Realm,
    int ClassId,
    int Race,
    int Gender,
    string Guild,
    bool Former = false
);

/// <param name="Value">Damage or healing per second, rounded.</param>
public sealed record RaidTopPerformer(
    string Name,
    string Realm,
    int ClassId,
    int SpecId,
    long Value,
    RaidLogKey Log
);

/// <summary>One boss on one difficulty: one data file, with its own guild, player and trinket tables.</summary>
/// <param name="Logs">Oldest first, so a new kill is a line added at the end of the file.</param>
/// <param name="Trinkets">Each item at each item level worn, in order of first appearance.</param>
public sealed record RaidEncounter(
    RaidBoss Boss,
    RaidDifficulty Difficulty,
    IReadOnlyList<RaidLog> Logs,
    IReadOnlyList<RaidGuild> Guilds,
    IReadOnlyList<RaidPlayer> Players,
    IReadOnlyList<RaidTrinket> Trinkets,
    RaidTopPerformer? TopDps,
    RaidTopPerformer? TopHps
);

public sealed record RaidFormerCharacters(
    string Name,
    string Realm,
    int ClassId,
    IReadOnlyList<int> FormerClassIds
);

public sealed record RaidDataset(
    IReadOnlyList<RaidEncounter> Encounters,
    IReadOnlyList<RaidLog> Logs,
    IReadOnlyList<RaidGuild> Guilds,
    IReadOnlyList<RaidItem> Items,
    IReadOnlyList<RaidFormerCharacters> FormerCharacters
);

public static class RaidLogDatasetBuilder
{
    public static RaidDataset Build(
        IEnumerable<RaidLog> logs,
        IReadOnlyDictionary<int, RaidItem> items,
        PlayerGuildDirectory guildDirectory
    )
    {
        var ordered = logs.GroupBy(log => log.Key)
            .Select(group => group.First())
            .OrderBy(log => log.KilledAt)
            .ThenBy(log => log.Key.Realm, StringComparer.Ordinal)
            .ThenBy(log => log.Key.LogId)
            .ToList();
        var logsByEncounter = ordered.ToLookup(log => (log.EncounterId, log.DifficultyId));
        var currentClasses = CurrentClasses(ordered);

        var encounters = (
            from boss in RaidCatalog.Bosses
            from difficulty in RaidCatalog.Difficulties
            select BuildEncounter(
                boss,
                difficulty,
                [.. logsByEncounter[(boss.EncounterId, difficulty.Id)]],
                guildDirectory,
                currentClasses
            )
        ).ToList();

        var usedItems = ordered.SelectMany(log => log.Items).ToHashSet();
        return new RaidDataset(
            encounters,
            ordered,
            GuildTable(ordered),
            [.. items.Values.Where(item => usedItems.Contains(item.Id)).OrderBy(item => item.Id)],
            FormerCharacters(ordered, currentClasses)
        );
    }

    public static double PerSecond(long amount, long fightMilliseconds) =>
        fightMilliseconds > 0 ? amount * 1000.0 / fightMilliseconds : 0;

    private static Dictionary<(string Realm, string Name), int> CurrentClasses(
        IEnumerable<RaidLog> oldestFirst
    )
    {
        var classes = new Dictionary<(string Realm, string Name), int>();
        foreach (var member in oldestFirst.SelectMany(log => log.Members))
        {
            classes[(member.Realm, member.Name)] = member.ClassId;
        }

        return classes;
    }

    private static List<RaidFormerCharacters> FormerCharacters(
        IEnumerable<RaidLog> oldestFirst,
        IReadOnlyDictionary<(string Realm, string Name), int> currentClasses
    ) =>
        [
            .. oldestFirst
                .SelectMany(log => log.Members)
                .Where(member => member.ClassId != currentClasses[(member.Realm, member.Name)])
                .GroupBy(member => (member.Realm, member.Name))
                .Select(group => new RaidFormerCharacters(
                    group.Key.Name,
                    group.Key.Realm,
                    currentClasses[group.Key],
                    [.. group.Select(member => member.ClassId).Reverse().Distinct()]
                ))
                .OrderBy(character => character.Realm, StringComparer.Ordinal)
                .ThenBy(character => character.Name, StringComparer.Ordinal),
        ];

    private static RaidEncounter BuildEncounter(
        RaidBoss boss,
        RaidDifficulty difficulty,
        IReadOnlyList<RaidLog> logs,
        PlayerGuildDirectory guildDirectory,
        IReadOnlyDictionary<(string Realm, string Name), int> currentClasses
    ) =>
        new(
            boss,
            difficulty,
            logs,
            GuildTable(logs),
            PlayerTable(logs, guildDirectory, currentClasses),
            TrinketTable(logs),
            TopPerformer(
                logs,
                member =>
                    RaidCatalog.SpecRole(member.SpecId) is RaidCatalog.Dps or RaidCatalog.Tank,
                member => member.DamageDone
            ),
            TopPerformer(
                logs,
                member => RaidCatalog.SpecRole(member.SpecId) == RaidCatalog.Healer,
                member => member.HealingDone + member.AbsorbDone
            )
        );

    /// <summary>Guilds in order of first appearance.</summary>
    private static List<RaidGuild> GuildTable(IReadOnlyList<RaidLog> logs)
    {
        var guilds = new List<RaidGuild>();
        var positions = new HashSet<(string Realm, int Id)>();
        foreach (var guild in logs.Select(log => log.Guild).OfType<RaidGuild>())
        {
            if (positions.Add((guild.Realm, guild.Id)))
            {
                guilds.Add(guild);
            }
        }

        return guilds;
    }

    private static List<RaidPlayer> PlayerTable(
        IReadOnlyList<RaidLog> logs,
        PlayerGuildDirectory guildDirectory,
        IReadOnlyDictionary<(string Realm, string Name), int> currentClasses
    )
    {
        var players = new List<RaidPlayer>();
        var positions = new Dictionary<(string Realm, string Name, int ClassId), int>();
        foreach (var member in logs.SelectMany(log => log.Members))
        {
            var key = (member.Realm, member.Name, member.ClassId);
            if (!positions.TryGetValue(key, out var position))
            {
                positions[key] = players.Count;
                players.Add(
                    new RaidPlayer(
                        member.Name,
                        member.Realm,
                        member.ClassId,
                        member.Race,
                        member.Gender,
                        member.Guild
                    )
                );
                continue;
            }

            var known = players[position];
            players[position] = known with
            {
                Race = member.Race,
                Gender = member.Gender,
                Guild = member.Guild.Length > 0 ? member.Guild : known.Guild,
            };
        }

        return
        [
            .. players.Select(player =>
                currentClasses[(player.Realm, player.Name)] != player.ClassId
                    ? player with
                    {
                        Former = true,
                    }
                    : player with
                    {
                        Guild = guildDirectory.Find(player.Realm, player.Name) ?? player.Guild,
                    }
            ),
        ];
    }

    /// <summary>
    /// Trinkets in order of first appearance, so a new kill appends rather than renumbers. Name,
    /// quality and icon come from the first log that has the item at that level.
    /// </summary>
    private static List<RaidTrinket> TrinketTable(IReadOnlyList<RaidLog> logs)
    {
        var trinkets = new List<RaidTrinket>();
        var seen = new HashSet<(int Id, int ItemLevel)>();
        foreach (
            var trinket in logs.SelectMany(log => log.Members).SelectMany(member => member.Trinkets)
        )
        {
            if (seen.Add((trinket.Id, trinket.ItemLevel)))
            {
                trinkets.Add(trinket);
            }
        }

        return trinkets;
    }

    /// <summary>The best per-second amount of any member who counts; the earliest kill wins a tie.</summary>
    private static RaidTopPerformer? TopPerformer(
        IReadOnlyList<RaidLog> logs,
        Func<RaidLogMember, bool> counts,
        Func<RaidLogMember, long> amount
    )
    {
        RaidTopPerformer? best = null;
        var bestValue = 0.0;
        foreach (var log in logs)
        {
            foreach (var member in log.Members.Where(counts))
            {
                var value = PerSecond(amount(member), log.FightMilliseconds);
                if (value > bestValue)
                {
                    bestValue = value;
                    best = new RaidTopPerformer(
                        member.Name,
                        member.Realm,
                        member.ClassId,
                        member.SpecId,
                        (long)Math.Round(value),
                        log.Key
                    );
                }
            }
        }

        return best;
    }
}
