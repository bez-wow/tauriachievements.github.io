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
        var scores = new double[dataset.Players.Count];

        foreach (var dungeon in dataset.Dungeons)
        {
            var dungeonBest = new double[dataset.Players.Count];
            foreach (var scored in dungeon.Runs)
            {
                foreach (var member in scored.Run.Members)
                {
                    var playerIndex = playerIndexes[(member.Realm, member.Name)];
                    if (scored.Score > dungeonBest[playerIndex])
                    {
                        dungeonBest[playerIndex] = scored.Score;
                    }
                }
            }

            for (var playerIndex = 0; playerIndex < scores.Length; playerIndex++)
            {
                scores[playerIndex] += dungeonBest[playerIndex];
            }
        }

        var ranked = dataset
            .Players.Select(
                (player, index) =>
                    new MythicPlusStanding(
                        player.Name,
                        player.Realm,
                        RoundScore(scores[index]),
                        Rank: 0
                    )
            )
            .OrderByDescending(standing => standing.Score)
            // Matches the browser's `name|realm` tie-break in rankPlayers().
            .ThenBy(standing => $"{standing.Name}|{standing.Realm}", StringComparer.Ordinal)
            .Select((standing, index) => standing with { Rank = index + 1 })
            .ToDictionary(standing => (standing.Realm, standing.Name), standing => standing);

        // Keep the index aligned with the player lookup table for a compact JSON representation.
        return dataset.Players.Select(player => ranked[(player.Realm, player.Name)]).ToList();
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
}
