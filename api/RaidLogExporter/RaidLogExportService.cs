using System.Collections.Concurrent;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

public sealed record RaidLogExportResult(
    RaidDataset Dataset,
    int PreviousLogCount,
    int ReadLogCount,
    IReadOnlyList<RaidLogKey> SkippedLogs,
    string OutputDirectory,
    int TalentSpecCount,
    RaidTooltipLookup? TalentTooltips
);

public sealed record RaidTooltipLookup(int SpellCount, int WrittenCount, int LookedUpCount);

public sealed class RaidLogExportService(
    string outputDirectory,
    ITauriApiClient apiClient,
    IRaidItemSource itemSource,
    IRaidTalentSource talentSource,
    IRaidSpellTooltipSource tooltipSource,
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
    private const int MaxParallelTooltips = 4;

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
        var scannedAt = _timeProvider.GetUtcNow();

        var previous = RaidLogFileReader.Read(outputDirectory);
        var cached =
            options.Full || previous.OutOfDate ? PreviousRaidExport.Empty.Logs : previous.Logs;
        var toRead = rankings.Logs.Where(log => !cached.ContainsKey(log.Key)).ToList();

        if (previous.OutOfDate)
        {
            Console.WriteLine("The files are in an older format: reading every log again.");
        }

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
        var talents = await talentSource.LoadAsync(cancellationToken);
        (IReadOnlyList<RaidSpellTooltip> Tooltips, RaidTooltipLookup Lookup)? tooltips = talents
            is null
            ? null
            : await LoadTooltipsAsync(
                talents,
                options.Full
                    ? new Dictionary<int, RaidSpellTooltip>()
                    : RaidLogFileReader.ReadTalentTooltips(outputDirectory),
                cancellationToken
            );

        await RaidLogFileWriter.WriteAsync(
            outputDirectory,
            dataset,
            scannedAt,
            ScanChanges(previous, dataset),
            talents,
            tooltips?.Tooltips,
            cancellationToken
        );
        return new RaidLogExportResult(
            dataset,
            previous.LogCount,
            toRead.Count,
            details.Mismatched,
            outputDirectory,
            talents?.Count ?? 0,
            tooltips?.Lookup
        );
    }

    private async Task<(
        IReadOnlyList<RaidSpellTooltip> Tooltips,
        RaidTooltipLookup Lookup
    )> LoadTooltipsAsync(
        IReadOnlyList<RaidSpecTalents> talents,
        IReadOnlyDictionary<int, RaidSpellTooltip> known,
        CancellationToken cancellationToken
    )
    {
        var spellIds = talents
            .SelectMany(spec => spec.Tiers)
            .SelectMany(tier => tier)
            .OfType<RaidTalent>()
            .Select(talent => talent.SpellId)
            .Distinct()
            .Order()
            .ToList();
        var missing = spellIds.Where(id => !known.ContainsKey(id)).ToList();
        var loaded = new ConcurrentDictionary<int, RaidSpellTooltip>();

        await Parallel.ForEachAsync(
            missing,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelTooltips,
                CancellationToken = cancellationToken,
            },
            async (id, token) =>
            {
                if (await tooltipSource.LoadAsync(id, token) is { } tooltip)
                {
                    loaded[id] = tooltip;
                }
            }
        );

        var tooltips = spellIds
            .Select(id => known.GetValueOrDefault(id) ?? loaded.GetValueOrDefault(id))
            .OfType<RaidSpellTooltip>()
            .ToList();
        return (tooltips, new RaidTooltipLookup(spellIds.Count, tooltips.Count, missing.Count));
    }

    /// <summary>
    /// The kills the last export did not have, which the leaderboard's rank and score changes
    /// come from; measured against its boss files, so --full changes nothing here. A run that
    /// finds no new kill moved no score, so it keeps the last export's changes, and running
    /// twice in a row doesn't wipe them.
    /// </summary>
    private static RaidScanChanges? ScanChanges(PreviousRaidExport previous, RaidDataset dataset)
    {
        if (previous.GeneratedAt is not { } previousGeneratedAt || previous.Logs.Count == 0)
        {
            return null;
        }

        var added = dataset
            .Logs.Where(log => !previous.Logs.ContainsKey(log.Key))
            .Select(log => log.Key)
            .ToList();
        return added.Count > 0 ? new RaidScanChanges(previousGeneratedAt, added) : previous.Changes;
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
