namespace MythicPlusExporter;

public sealed record ScoredRun(ChallengeRun Run, double Score);

public sealed record MythicPlusDungeon(
    ChallengeMap Map,
    DungeonInfo Info,
    IReadOnlyList<ScoredRun> Runs
)
{
    public double BestScore => Runs.Count > 0 ? Runs[0].Score : 0;
}

public sealed record MythicPlusPlayer(
    string Name,
    string Realm,
    string Guild,
    int ClassId,
    int Race,
    int Gender
);

public sealed record MythicPlusSpec(int ClassId, string Name, string Role);

public sealed record MythicPlusDataset(
    string DataUrlPrefix,
    IReadOnlyList<MythicPlusDungeon> Dungeons,
    IReadOnlyList<ChallengeAffix> Affixes,
    IReadOnlyList<MythicPlusSpec> Specs,
    IReadOnlyList<MythicPlusPlayer> Players,
    int DuplicateRunCount
)
{
    public int RunCount => Dungeons.Sum(dungeon => dungeon.Runs.Count);
}

/// <summary>
/// Merges the leaderboards of every realm group into one season dataset: removes runs that
/// appear on more than one leaderboard, scores and ranks each dungeon, and collects the
/// players, specs and affixes the runs reference. Dungeons nobody has run yet are left out,
/// so a map the server lists but has not opened does not show up as an empty tile.
/// </summary>
public static class MythicPlusDatasetBuilder
{
    public static MythicPlusDataset Build(
        ChallengeIndex index,
        IReadOnlyDictionary<int, IReadOnlyList<ChallengeRun>> runsByChallengeId
    )
    {
        var dungeons = new List<MythicPlusDungeon>();
        var duplicateRunCount = 0;

        foreach (var map in index.Maps)
        {
            if (!runsByChallengeId.TryGetValue(map.ChallengeId, out var runs) || runs.Count == 0)
            {
                continue;
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            var ranked = new List<ScoredRun>(runs.Count);
            foreach (var run in runs)
            {
                if (!seen.Add(RunKey(run)))
                {
                    duplicateRunCount++;
                    continue;
                }

                ranked.Add(
                    new ScoredRun(
                        run,
                        MythicPlusScore.Calculate(
                            run.KeyLevel,
                            run.ClearTimeMilliseconds,
                            map.TimerSeconds
                        )
                    )
                );
            }

            ranked.Sort(CompareRanked);
            dungeons.Add(
                new MythicPlusDungeon(
                    map,
                    MythicPlusCatalog.GetDungeon(map.ChallengeId, map.Name),
                    ranked
                )
            );
        }

        var members = dungeons
            .SelectMany(dungeon => dungeon.Runs)
            .SelectMany(scored => scored.Run.Members)
            .ToList();

        // A character's details are a snapshot taken when the leaderboard was read, so every
        // run reports the same guild and race; the first one seen is as good as any.
        var players = members
            .DistinctBy(member => (member.Realm, member.Name))
            .Select(member => new MythicPlusPlayer(
                member.Name,
                member.Realm,
                member.Guild,
                member.ClassId,
                member.Race,
                member.Gender
            ))
            .OrderBy(player => player.Realm, StringComparer.Ordinal)
            .ThenBy(player => player.Name, StringComparer.Ordinal)
            .ToList();

        var specs = members
            .Select(member => new MythicPlusSpec(member.ClassId, member.SpecName, member.Role))
            .Distinct()
            .OrderBy(spec => spec.ClassId)
            .ThenBy(spec => spec.Name, StringComparer.Ordinal)
            .ThenBy(spec => spec.Role, StringComparer.Ordinal)
            .ToList();

        var affixes = dungeons
            .SelectMany(dungeon => dungeon.Runs)
            .SelectMany(scored => scored.Run.Affixes)
            .DistinctBy(affix => affix.Id)
            .OrderBy(affix => affix.Level)
            .ThenBy(affix => affix.Id)
            .ToList();

        return new MythicPlusDataset(
            index.DataUrlPrefix,
            dungeons,
            affixes,
            specs,
            players,
            duplicateRunCount
        );
    }

    /// <summary>Highest score first, then the faster clear, then the earlier finish.</summary>
    private static int CompareRanked(ScoredRun left, ScoredRun right)
    {
        var byScore = right.Score.CompareTo(left.Score);
        if (byScore != 0)
        {
            return byScore;
        }

        var byClearTime = left.Run.ClearTimeMilliseconds.CompareTo(right.Run.ClearTimeMilliseconds);
        if (byClearTime != 0)
        {
            return byClearTime;
        }

        var byCompletion = left.Run.CompletedAt.CompareTo(right.Run.CompletedAt);
        return byCompletion != 0
            ? byCompletion
            : string.CompareOrdinal(RunKey(left.Run), RunKey(right.Run));
    }

    private static string RunKey(ChallengeRun run) =>
        string.Join(
            '|',
            run.KeyLevel,
            run.ClearTimeMilliseconds,
            run.CompletedAt,
            string.Join(
                ',',
                run.Members.Select(member => $"{member.Name}@{member.Realm}")
                    .Order(StringComparer.Ordinal)
            )
        );
}
