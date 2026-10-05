using System.Collections.Concurrent;
using Tauri.Core.Infrastructure;

namespace MythicPlusExporter;

/// <param name="RunsByChallengeId">Runs per challenge map, only for maps every realm answered.</param>
/// <param name="Failures">One line per leaderboard that could not be read.</param>
public sealed record ChallengeLeaderboards(
    IReadOnlyDictionary<int, IReadOnlyList<ChallengeRun>> RunsByChallengeId,
    IReadOnlyList<string> Failures
);

/// <summary>
/// Reads the <c>challenge-index</c> and every map's <c>challenge-leaderboard</c> for the
/// given realms. Shared by the /mythic-plus export and the guild and character scan.
/// </summary>
public sealed class ChallengeLeaderboardReader(ITauriApiClient apiClient)
{
    private const string IndexEndpoint = "challenge-index";
    private const string LeaderboardEndpoint = "challenge-leaderboard";
    private const int MaxParallelLeaderboards = 4;

    public async Task<ChallengeIndex> ReadIndexAsync(
        string realm,
        CancellationToken cancellationToken
    )
    {
        var result = await apiClient.FetchResponseElementAsync(
            IndexEndpoint,
            new { r = realm },
            $"challenge index ({realm})",
            cancellationToken
        );

        if (!result.Succeeded || result.ResponseElement is not { } response)
        {
            throw new InvalidOperationException(
                $"Could not read the challenge index: {result.FailureMessage}"
            );
        }

        var index = ChallengeResponseParser.ParseIndex(response);
        if (index.Maps.Count == 0)
        {
            throw new InvalidOperationException("challenge-index returned no challenge maps.");
        }

        return index;
    }

    public async Task<ChallengeLeaderboards> ReadLeaderboardsAsync(
        ChallengeIndex index,
        IReadOnlyList<string> realms,
        CancellationToken cancellationToken
    )
    {
        var runsByChallengeId = new ConcurrentDictionary<int, IReadOnlyList<ChallengeRun>>();
        var failures = new ConcurrentBag<string>();

        await Parallel.ForEachAsync(
            index.Maps,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelLeaderboards,
                CancellationToken = cancellationToken,
            },
            async (map, token) =>
            {
                var runs = new List<ChallengeRun>();
                foreach (var realm in realms)
                {
                    var result = await apiClient.FetchResponseElementAsync(
                        LeaderboardEndpoint,
                        new { r = realm, id = map.ChallengeId },
                        $"{map.Name} ({realm})",
                        token
                    );

                    if (!result.Succeeded || result.ResponseElement is not { } response)
                    {
                        failures.Add($"{map.Name} ({realm}): {result.FailureMessage}");
                        return;
                    }

                    runs.AddRange(ChallengeResponseParser.ParseLeaderboard(response));
                }

                runsByChallengeId[map.ChallengeId] = runs;
                Console.WriteLine($"  {map.Name}: {runs.Count} runs");
            }
        );

        return new ChallengeLeaderboards(
            runsByChallengeId,
            [.. failures.Order(StringComparer.Ordinal)]
        );
    }
}
