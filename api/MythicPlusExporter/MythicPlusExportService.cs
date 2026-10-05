using System.Collections.Concurrent;
using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace MythicPlusExporter;

public sealed record MythicPlusExportResult(
    MythicPlusDataset Dataset,
    int PreviousRunCount,
    string OutputDirectory
);

/// <summary>
/// Reads every challenge map's leaderboard for each realm group and publishes the
/// /mythic-plus data files. Evermoon and Tauri share one leaderboard, so asking either realm
/// returns both; WoD keeps its own. Nothing is written unless every leaderboard was read,
/// so a flaky API never publishes a partial season.
/// </summary>
public sealed class MythicPlusExportService(string outputDirectory, ITauriApiClient apiClient)
{
    private const string IndexEndpoint = "challenge-index";
    private const string LeaderboardEndpoint = "challenge-leaderboard";
    private const int MaxParallelLeaderboards = 4;

    /// <summary>
    /// Leaderboards only grow during a season, so fewer runs than last time means the API
    /// returned a partial answer. A small allowance covers runs the server itself removed.
    /// </summary>
    private const double MaxShrinkFraction = 0.02;

    public async Task<MythicPlusExportResult> ExportAsync(
        MythicPlusExporterOptions options,
        CancellationToken cancellationToken
    )
    {
        var index = await FetchIndexAsync(options.Realms[0], cancellationToken);
        if (index.Maps.Count == 0)
        {
            throw new InvalidOperationException("challenge-index returned no challenge maps.");
        }

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
                foreach (var realm in options.Realms)
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

        if (!failures.IsEmpty)
        {
            throw new InvalidOperationException(
                "Could not read every leaderboard, nothing was written:"
                    + Environment.NewLine
                    + string.Join(Environment.NewLine, failures.Order(StringComparer.Ordinal))
            );
        }

        var dataset = MythicPlusDatasetBuilder.Build(index, runsByChallengeId);
        var previousRunCount = ReadPreviousRunCount();

        if (
            !options.AllowShrink
            && previousRunCount > 0
            && dataset.RunCount < previousRunCount * (1 - MaxShrinkFraction)
        )
        {
            throw new InvalidOperationException(
                $"The leaderboards shrank from {previousRunCount} to {dataset.RunCount} runs, "
                    + "so the API probably answered only in part. Nothing was written. "
                    + "Run again later, or pass --allow-shrink if the drop is real (a new season)."
            );
        }

        await MythicPlusFileWriter.WriteAsync(outputDirectory, dataset, cancellationToken);
        return new MythicPlusExportResult(dataset, previousRunCount, outputDirectory);
    }

    private async Task<ChallengeIndex> FetchIndexAsync(
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

        return ChallengeResponseParser.ParseIndex(response);
    }

    private int ReadPreviousRunCount()
    {
        var indexPath = Path.Combine(outputDirectory, MythicPlusFileWriter.IndexFileName);
        if (!File.Exists(indexPath))
        {
            return 0;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllBytes(indexPath));
            return
                document.RootElement.TryGetProperty("dungeons", out var dungeons)
                && dungeons.ValueKind == JsonValueKind.Array
                ? dungeons
                    .EnumerateArray()
                    .Sum(dungeon =>
                        dungeon.TryGetProperty("runCount", out var count)
                        && count.TryGetInt32(out var value)
                            ? value
                            : 0
                    )
                : 0;
        }
        catch (JsonException)
        {
            return 0;
        }
    }
}
