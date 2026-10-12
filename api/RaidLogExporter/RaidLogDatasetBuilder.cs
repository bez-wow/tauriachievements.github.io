namespace RaidLogExporter;

/// <param name="Guild">The ladder's current guild for the character, else the last one a log named.</param>
public sealed record RaidPlayer(
    string Name,
    string Realm,
    int ClassId,
    int Race,
    int Gender,
    string Guild
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

/// <summary>One boss on one difficulty: one data file, with its own guild and player tables.</summary>
/// <param name="Logs">Oldest first, so a new kill is a line added at the end of the file.</param>
public sealed record RaidEncounter(
    RaidBoss Boss,
    RaidDifficulty Difficulty,
    IReadOnlyList<RaidLog> Logs,
    IReadOnlyList<RaidGuild> Guilds,
    IReadOnlyList<RaidPlayer> Players,
    RaidTopPerformer? TopDps,
    RaidTopPerformer? TopHps
);

/// <param name="Encounters">Every boss on every difficulty, in catalog order, kills or not.</param>
/// <param name="Logs">Every kill, oldest first.</param>
/// <param name="Guilds">Every guild that has a kill, in order of its first kill.</param>
public sealed record RaidDataset(
    IReadOnlyList<RaidEncounter> Encounters,
    IReadOnlyList<RaidLog> Logs,
    IReadOnlyList<RaidGuild> Guilds,
    IReadOnlyList<RaidItem> Items
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

        var encounters = (
            from boss in RaidCatalog.Bosses
            from difficulty in RaidCatalog.Difficulties
            select BuildEncounter(
                boss,
                difficulty,
                [.. logsByEncounter[(boss.EncounterId, difficulty.Id)]],
                guildDirectory
            )
        ).ToList();

        var usedItems = ordered.SelectMany(log => log.Items).ToHashSet();
        return new RaidDataset(
            encounters,
            ordered,
            GuildTable(ordered),
            [.. items.Values.Where(item => usedItems.Contains(item.Id)).OrderBy(item => item.Id)]
        );
    }

    public static double PerSecond(long amount, long fightMilliseconds) =>
        fightMilliseconds > 0 ? amount * 1000.0 / fightMilliseconds : 0;

    private static RaidEncounter BuildEncounter(
        RaidBoss boss,
        RaidDifficulty difficulty,
        IReadOnlyList<RaidLog> logs,
        PlayerGuildDirectory guildDirectory
    ) =>
        new(
            boss,
            difficulty,
            logs,
            GuildTable(logs),
            PlayerTable(logs, guildDirectory),
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

    /// <summary>
    /// Characters in order of first appearance, so a new kill appends players rather than
    /// renumbering the table. Class, race and gender come from the latest log.
    /// </summary>
    private static List<RaidPlayer> PlayerTable(
        IReadOnlyList<RaidLog> logs,
        PlayerGuildDirectory guildDirectory
    )
    {
        var players = new List<RaidPlayer>();
        var positions = new Dictionary<(string Realm, string Name), int>();
        foreach (var member in logs.SelectMany(log => log.Members))
        {
            var key = (member.Realm, member.Name);
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
                ClassId = member.ClassId,
                Race = member.Race,
                Gender = member.Gender,
                Guild = member.Guild.Length > 0 ? member.Guild : known.Guild,
            };
        }

        return
        [
            .. players.Select(player =>
                guildDirectory.Find(player.Realm, player.Name) is { } guild
                    ? player with
                    {
                        Guild = guild,
                    }
                    : player
            ),
        ];
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
