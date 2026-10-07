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
public sealed class MythicPlusExportService(
    string outputDirectory,
    ITauriApiClient apiClient,
    TimeProvider? timeProvider = null
)
{
    /// <summary>
    /// Leaderboards only grow during a season, so fewer runs than last time means the API
    /// returned a partial answer. A small allowance covers runs the server itself removed.
    /// </summary>
    private const double MaxShrinkFraction = 0.02;

    private readonly ChallengeLeaderboardReader _reader = new(apiClient);
    private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;

    public async Task<MythicPlusExportResult> ExportAsync(
        MythicPlusExporterOptions options,
        CancellationToken cancellationToken
    )
    {
        var index = await _reader.ReadIndexAsync(options.Realms[0], cancellationToken);
        var leaderboards = await _reader.ReadLeaderboardsAsync(
            index,
            options.Realms,
            cancellationToken
        );
        // Every run in the files was on the leaderboards by now, so this is how current they are.
        var scannedAt = _timeProvider.GetUtcNow();

        if (leaderboards.Failures.Count > 0)
        {
            throw new InvalidOperationException(
                "Could not read every leaderboard, nothing was written:"
                    + Environment.NewLine
                    + string.Join(Environment.NewLine, leaderboards.Failures)
            );
        }

        var dataset = MythicPlusDatasetBuilder.Build(index, leaderboards.RunsByChallengeId);
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

        await MythicPlusFileWriter.WriteAsync(
            outputDirectory,
            dataset,
            scannedAt,
            cancellationToken
        );
        return new MythicPlusExportResult(dataset, previousRunCount, outputDirectory);
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
