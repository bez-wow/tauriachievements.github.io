using System.Collections.Concurrent;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

/// <param name="ReadLogCount">How many logs' details were asked from the API this run.</param>
/// <param name="SkippedLogs">Listed kills whose details describe another kill; left out.</param>
public sealed record RaidLogExportResult(
    RaidDataset Dataset,
    int PreviousLogCount,
    int ReadLogCount,
    IReadOnlyList<RaidLogKey> SkippedLogs,
    string OutputDirectory
);

/// <summary>
/// Lists every kill of the tracked raid on each realm, reads the details of the ones the last
/// export did not have yet, and publishes the /raid-logs data files. Nothing is written unless
/// every ranking and every new log was read, so a flaky API never publishes a partial raid.
/// </summary>
public sealed class RaidLogExportService(
    string outputDirectory,
    ITauriApiClient apiClient,
    IRaidItemSource itemSource,
    PlayerGuildDirectory guildDirectory,
    TimeProvider? timeProvider = null
)
{
    /// <summary>
    /// Kills only accumulate, so fewer than last time means the API answered in part. A small
    /// allowance covers logs the server itself removed.
    /// </summary>
    private const double MaxShrinkFraction = 0.02;

    private const int MaxParallelItems = 8;

    private readonly RaidLogReader _reader = new(apiClient);
    private readonly RaidGuildResolver _guildResolver = new(apiClient, guildDirectory);
    private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;

    public async Task<RaidLogExportResult> ExportAsync(
        RaidLogExporterOptions options,
        CancellationToken cancellationToken
    )
    {
        var rankings = await _reader.ReadRankingsAsync(options.Realms, cancellationToken);
        if (rankings.Failures.Count > 0)
        {
            throw new InvalidOperationException(
                "Could not read every encounter ranking, nothing was written:"
                    + Environment.NewLine
                    + string.Join(Environment.NewLine, rankings.Failures)
            );
        }
        // Every kill in the files was in the rankings by now, so this is how current they are.
        var scannedAt = _timeProvider.GetUtcNow();

        var previous = RaidLogFileReader.Read(outputDirectory);
        var cached = options.Full ? PreviousRaidExport.Empty.Logs : previous.Logs;
        var toRead = rankings.Logs.Where(log => !cached.ContainsKey(log.Key)).ToList();

        if (toRead.Count > 0)
        {
            Console.WriteLine($"Reading {toRead.Count} new logs...");
        }

        var details = await _reader.ReadLogsAsync(toRead, cancellationToken);
        if (details.Failures.Count > 0)
        {
            throw new InvalidOperationException(
                $"Could not read {details.Failures.Count} logs, nothing was written:"
                    + Environment.NewLine
                    + string.Join(Environment.NewLine, details.Failures.Take(20))
            );
        }

        var fetched = details.Logs.ToDictionary(log => log.Key);
        var logs = await _guildResolver.ResolveAsync(
            [
                .. rankings
                    .Logs.Select(listed =>
                        cached.TryGetValue(listed.Key, out var known)
                            ? known
                            : fetched.GetValueOrDefault(listed.Key)
                    )
                    .OfType<RaidLog>(),
            ],
            cancellationToken
        );

        if (
            !options.AllowShrink
            && previous.LogCount > 0
            && logs.Count < previous.LogCount * (1 - MaxShrinkFraction)
        )
        {
            throw new InvalidOperationException(
                $"The rankings shrank from {previous.LogCount} to {logs.Count} kills, "
                    + "so the API probably answered only in part. Nothing was written. "
                    + "Run again later, or pass --allow-shrink if the drop is real."
            );
        }

        var items = await LoadItemsAsync(logs, previous.Items, cancellationToken);
        var dataset = RaidLogDatasetBuilder.Build(logs, items, guildDirectory);

        await RaidLogFileWriter.WriteAsync(outputDirectory, dataset, scannedAt, cancellationToken);
        return new RaidLogExportResult(
            dataset,
            previous.LogCount,
            toRead.Count,
            details.Mismatched,
            outputDirectory
        );
    }

    /// <summary>
    /// Looks up the items no earlier run named. One that cannot be read is left out and tried
    /// again next run; the page shows its id meanwhile.
    /// </summary>
    private async Task<IReadOnlyDictionary<int, RaidItem>> LoadItemsAsync(
        IReadOnlyList<RaidLog> logs,
        IReadOnlyDictionary<int, RaidItem> known,
        CancellationToken cancellationToken
    )
    {
        var items = new Dictionary<int, RaidItem>(known);
        var missing = logs.SelectMany(log => log.Items)
            .Distinct()
            .Where(id => !items.ContainsKey(id))
            .Order()
            .ToList();
        var loaded = new ConcurrentBag<RaidItem>();

        await Parallel.ForEachAsync(
            missing,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelItems,
                CancellationToken = cancellationToken,
            },
            async (id, token) =>
            {
                if (await itemSource.LoadAsync(id, token) is { } item)
                {
                    loaded.Add(item);
                }
            }
        );

        foreach (var item in loaded)
        {
            items[item.Id] = item;
        }

        return items;
    }
}
