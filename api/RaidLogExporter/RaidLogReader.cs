using System.Collections.Concurrent;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

/// <param name="Logs">Every kill listed, once each.</param>
/// <param name="Failures">One line per ranking that could not be read.</param>
public sealed record RaidRankings(
    IReadOnlyList<ListedRaidLog> Logs,
    IReadOnlyList<string> Failures
);

/// <param name="Logs">The details of every log that could be read and matched its listing.</param>
/// <param name="Failures">One line per log the API did not answer for.</param>
/// <param name="Mismatched">Logs whose details describe a different kill than the ranking listed.</param>
public sealed record RaidLogDetails(
    IReadOnlyList<RaidLog> Logs,
    IReadOnlyList<string> Failures,
    IReadOnlyList<RaidLogKey> Mismatched
);

/// <summary>
/// Lists every kill of the tracked raid through <c>raid-rank-encounter</c> (one request per realm,
/// boss and difficulty, each listing all of that boss's kills) and reads kills' details through
/// <c>raid-log</c>. The rankings are complete: on 2026-10-12 every one of the 540 Emerald
/// Nightmare kills in the realm's last 20,000 <c>raid-last</c> logs was in them.
/// </summary>
public sealed class RaidLogReader(ITauriApiClient apiClient)
{
    private const string RankingEndpoint = "raid-rank-encounter";
    private const string LogEndpoint = "raid-log";
    private const int MaxParallelRankings = 4;
    private const int MaxParallelLogs = 16;

    public async Task<RaidRankings> ReadRankingsAsync(
        IReadOnlyList<string> apiRealms,
        CancellationToken cancellationToken
    )
    {
        var requests =
            from apiRealm in apiRealms
            from boss in RaidCatalog.Bosses
            from difficulty in RaidCatalog.Difficulties
            select (ApiRealm: apiRealm, Boss: boss, Difficulty: difficulty);

        var listed = new ConcurrentBag<ListedRaidLog>();
        var failures = new ConcurrentBag<string>();

        await Parallel.ForEachAsync(
            requests,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelRankings,
                CancellationToken = cancellationToken,
            },
            async (request, token) =>
            {
                var label = $"{request.Boss.Name} {request.Difficulty.Name} ({request.ApiRealm})";
                var result = await apiClient.FetchResponseElementAsync(
                    RankingEndpoint,
                    new
                    {
                        r = request.ApiRealm,
                        encounter = request.Boss.EncounterId,
                        difficulty = request.Difficulty.Id,
                        from = 0,
                        limit = 0,
                    },
                    label,
                    token
                );

                if (!result.Succeeded || result.ResponseElement is not { } response)
                {
                    failures.Add($"{label}: {result.FailureMessage}");
                    return;
                }

                try
                {
                    foreach (
                        var log in RaidLogResponseParser.ParseRanking(response, request.ApiRealm)
                    )
                    {
                        // The ranking for one boss and difficulty only ever lists that kill.
                        if (
                            log.EncounterId == request.Boss.EncounterId
                            && log.DifficultyId == request.Difficulty.Id
                        )
                        {
                            listed.Add(log);
                        }
                    }
                }
                catch (InvalidOperationException error)
                {
                    failures.Add($"{label}: {error.Message}");
                }
            }
        );

        var unique = listed
            .GroupBy(log => log.Key)
            .Select(group => group.First())
            .OrderBy(log => log.Key.Realm, StringComparer.Ordinal)
            .ThenBy(log => log.Key.LogId)
            .ToList();

        return new RaidRankings(unique, [.. failures.Order(StringComparer.Ordinal)]);
    }

    public async Task<RaidLogDetails> ReadLogsAsync(
        IReadOnlyList<ListedRaidLog> listed,
        CancellationToken cancellationToken
    )
    {
        var logs = new ConcurrentBag<RaidLog>();
        var failures = new ConcurrentBag<string>();
        var mismatched = new ConcurrentBag<RaidLogKey>();
        var done = 0;

        await Parallel.ForEachAsync(
            listed,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelLogs,
                CancellationToken = cancellationToken,
            },
            async (log, token) =>
            {
                var label = $"log {log.Key.LogId} ({log.ApiRealm})";
                var result = await apiClient.FetchResponseElementAsync(
                    LogEndpoint,
                    new { r = log.ApiRealm, id = log.Key.LogId },
                    label,
                    token
                );

                if (!result.Succeeded || result.ResponseElement is not { } response)
                {
                    failures.Add($"{label}: {result.FailureMessage}");
                }
                else if (RaidLogResponseParser.ParseLog(response, log) is { } parsed)
                {
                    logs.Add(parsed);
                }
                else
                {
                    mismatched.Add(log.Key);
                }

                var count = Interlocked.Increment(ref done);
                if (count % 500 == 0)
                {
                    Console.WriteLine($"  {count} of {listed.Count} logs read");
                }
            }
        );

        return new RaidLogDetails(
            [.. logs],
            [.. failures.Order(StringComparer.Ordinal)],
            [.. mismatched]
        );
    }
}
