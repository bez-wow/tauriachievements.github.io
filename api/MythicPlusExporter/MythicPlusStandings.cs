namespace MythicPlusExporter;

/// <summary>
/// One character's overall season standing. <see cref="RankChange"/> is positive when the
/// character climbed and negative when they fell.
/// </summary>
public sealed record MythicPlusStanding(
    string Name,
    string Realm,
    double Score,
    int Rank,
    double? ScoreChange = null,
    int? RankChange = null
);

/// <summary>
/// Builds the compact standings written into index.json. This is one linear pass over the run
/// rosters; the exporter does the comparison once so every browser does not need the previous
/// run files as well as the current ones.
/// </summary>
public static class MythicPlusStandings
{
    public static IReadOnlyList<MythicPlusStanding> Build(MythicPlusDataset dataset)
    {
        var playerIndexes = dataset
            .Players.Select((player, index) => (player, index))
            .ToDictionary(entry => (entry.player.Realm, entry.player.Name), entry => entry.index);
        var best = new BestRuns(dataset.Players.Count);

        foreach (var dungeon in dataset.Dungeons)
        {
            best.StartDungeon();
            foreach (var scored in dungeon.Runs)
            {
                foreach (var member in scored.Run.Members)
                {
                    best.Add(
                        playerIndexes[(member.Realm, member.Name)],
                        scored.Score,
                        scored.Run.ClearTimeMilliseconds
                    );
                }
            }
            best.EndDungeon();
        }

        return Rank(
            dataset.Players.Select(player => (player.Realm, player.Name)).ToList(),
            best.Scores,
            best.Times
        );
    }

    /// <summary>
    /// Ranks players by score, highest first, then by the total clear time of their best runs,
    /// fastest first (matching rankPlayers() in the browser), then by <c>name|realm</c>. Only the
    /// same score and the same total time share a rank, and the places they take are skipped:
    /// 1, 1, 1, 4 (playerRanks() in the browser). The result is aligned with
    /// <paramref name="players"/>.
    /// </summary>
    internal static IReadOnlyList<MythicPlusStanding> Rank(
        IReadOnlyList<(string Realm, string Name)> players,
        IReadOnlyList<double> scores,
        IReadOnlyList<long> times
    )
    {
        var order = Enumerable
            .Range(0, players.Count)
            .Select(index =>
                (
                    Index: index,
                    Score: RoundScore(scores[index]),
                    Time: times[index],
                    Key: $"{players[index].Name}|{players[index].Realm}"
                )
            )
            .OrderByDescending(entry => entry.Score)
            .ThenBy(entry => entry.Time)
            .ThenBy(entry => entry.Key, StringComparer.Ordinal)
            .ToList();

        var standings = new MythicPlusStanding[players.Count];
        var rank = 0;
        for (var position = 0; position < order.Count; position++)
        {
            var entry = order[position];
            if (
                position == 0
                || entry.Score != order[position - 1].Score
                || entry.Time != order[position - 1].Time
            )
            {
                rank = position + 1;
            }

            var (realm, name) = players[entry.Index];
            standings[entry.Index] = new MythicPlusStanding(name, realm, entry.Score, rank);
        }

        return standings;
    }

    public static IReadOnlyList<MythicPlusStanding> Compare(
        IReadOnlyList<MythicPlusStanding> current,
        IReadOnlyDictionary<(string Realm, string Name), MythicPlusStanding> previous
    ) =>
        current
            .Select(standing =>
            {
                if (!previous.TryGetValue((standing.Realm, standing.Name), out var old))
                {
                    return standing;
                }

                return standing with
                {
                    ScoreChange = RoundScore(standing.Score - old.Score),
                    RankChange = old.Rank - standing.Rank,
                };
            })
            .ToList();

    internal static double RoundScore(double score)
    {
        var rounded = Math.Round(score, 1, MidpointRounding.AwayFromZero);
        return rounded == 0 ? 0 : rounded; // Do not serialize negative zero.
    }

    /// <summary>
    /// Each player's best run per dungeon, added up: the highest score, and on the same score
    /// the fastest clear (isBetterRun() in the browser), so its time counts towards the total.
    /// </summary>
    internal sealed class BestRuns(int playerCount)
    {
        private readonly double[] _dungeonScores = new double[playerCount];
        private readonly long[] _dungeonTimes = new long[playerCount];
        private readonly bool[] _played = new bool[playerCount];

        public double[] Scores { get; } = new double[playerCount];
        public long[] Times { get; } = new long[playerCount];

        public void StartDungeon() => Array.Clear(_played);

        public void Add(int playerIndex, double score, long clearTimeMilliseconds)
        {
            if (
                !_played[playerIndex]
                || score > _dungeonScores[playerIndex]
                || (
                    score == _dungeonScores[playerIndex]
                    && clearTimeMilliseconds < _dungeonTimes[playerIndex]
                )
            )
            {
                _played[playerIndex] = true;
                _dungeonScores[playerIndex] = score;
                _dungeonTimes[playerIndex] = clearTimeMilliseconds;
            }
        }

        public void EndDungeon()
        {
            for (var playerIndex = 0; playerIndex < _played.Length; playerIndex++)
            {
                if (_played[playerIndex])
                {
                    Scores[playerIndex] += _dungeonScores[playerIndex];
                    Times[playerIndex] += _dungeonTimes[playerIndex];
                }
            }
        }
    }
}
