using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Tauri.Core.Configuration;
using Tauri.Core.Dtos;
using Tauri.Core.Infrastructure;

namespace GuildCharacterExporter;

public sealed class GuildCharacterExportService(
    string solutionRoot,
    TauriApiOptions apiOptions,
    ITauriApiClient apiClient,
    int retryRounds = 3,
    TimeSpan? retryRoundDelay = null
)
{
    private const int ProgressInterval = 25;
    private const string RetryFileName = "MissingGuildsToScan.txt";

    // A large batch of "guild not found" answers more likely means the API misbehaved than
    // that hundreds of guilds disbanded overnight, so pruning is skipped above this share.
    private const double MaxPrunedGuildShare = 0.05;

    private static readonly RealmSource[] RealmSources =
    [
        new("evermoon-guilds.txt", "[EN] Evermoon", "Evermoon"),
        new("tauri-guilds.txt", "[HU] Tauri WoW Server", "Tauri"),
        new("wod-guilds.txt", "[HU] Warriors of Darkness", "WoD"),
    ];

    private readonly string _solutionRoot = Path.GetFullPath(solutionRoot);
    private readonly TauriApiOptions _apiOptions = apiOptions;
    private readonly ITauriApiClient _apiClient = apiClient;
    private readonly int _guildWorkerCount = Math.Max(4, apiOptions.MaxConcurrentRequests * 2);
    private readonly int _retryRounds = Math.Max(0, retryRounds);
    private readonly TimeSpan _retryRoundDelay = retryRoundDelay ?? TimeSpan.FromSeconds(30);

    /// <param name="retryOnly">
    /// Scan only the guilds left in the retry file by an earlier run and merge them into the
    /// existing GuildCharacters.txt, instead of rebuilding it from every known guild.
    /// </param>
    public async Task<GuildCharacterExportResult> ExportAsync(
        bool retryOnly,
        CancellationToken cancellationToken
    )
    {
        var guildDataDirectory = Path.Combine(_solutionRoot, "AchievementLadder", "Data", "Guilds");
        if (!Directory.Exists(guildDataDirectory))
        {
            throw new DirectoryNotFoundException(
                $"Could not find guild data folder: {guildDataDirectory}"
            );
        }

        var outputPath = Path.Combine(
            _solutionRoot,
            "AchievementLadder",
            "Data",
            "GuildCharacters",
            "GuildCharacters.txt"
        );
        var retryOutputPath = Path.Combine(
            ProjectPaths.GetWorkDirectory(_solutionRoot),
            RetryFileName
        );
        var knownGuilds = LoadGuilds(guildDataDirectory)
            .DistinctBy(guild => (guild.GuildName.ToLowerInvariant(), guild.ApiRealm))
            .ToList();
        var guilds = retryOnly
            ? LoadRetryGuilds(retryOutputPath)
                .DistinctBy(guild => (guild.GuildName.ToLowerInvariant(), guild.ApiRealm))
                .ToList()
            : knownGuilds;

        if (retryOnly && guilds.Count == 0)
        {
            Console.WriteLine($"{RetryFileName} is empty - nothing to retry.");
            return new GuildCharacterExportResult(
                0,
                LoadExistingCharacterLines(outputPath).Count,
                0,
                0,
                0,
                outputPath,
                retryOutputPath,
                UsedRetryInput: true
            );
        }

        Console.WriteLine(
            retryOnly
                ? $"Retry mode: scanning {guilds.Count} guilds from {RetryFileName}..."
                : $"Scanning {guilds.Count} guilds..."
        );
        Console.WriteLine(
            $"API settings: concurrency={_apiOptions.MaxConcurrentRequests}, timeout={_apiOptions.RequestTimeoutSeconds}s, retries={_apiOptions.MaxRetryAttempts}"
        );

        var existingCharacterLines = retryOnly
            ? LoadExistingCharacterLines(outputPath)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var characterLines = new ConcurrentDictionary<string, byte>(
            existingCharacterLines.Select(line => new KeyValuePair<string, byte>(line, 0)),
            StringComparer.OrdinalIgnoreCase
        );
        if (retryOnly)
        {
            Console.WriteLine(
                $"Loaded {characterLines.Count} existing character rows to merge retry results."
            );
        }

        var deadGuilds = new ConcurrentBag<GuildSource>();
        var pendingGuilds = guilds;

        for (var round = 0; ; round++)
        {
            if (round > 0)
            {
                Console.WriteLine(
                    $"Retry round {round}/{_retryRounds}: {pendingGuilds.Count} guilds failed, retrying in {_retryRoundDelay.TotalSeconds:0}s..."
                );
                await Task.Delay(_retryRoundDelay, cancellationToken);
            }

            pendingGuilds = await ScanGuildsAsync(
                pendingGuilds,
                characterLines,
                deadGuilds,
                cancellationToken
            );

            if (pendingGuilds.Count == 0 || round >= _retryRounds)
            {
                break;
            }
        }

        var orderedRetryGuilds = pendingGuilds
            .OrderBy(guild => guild.DisplayRealm, StringComparer.OrdinalIgnoreCase)
            .ThenBy(guild => guild.GuildName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        await WriteRetryGuildsAsync(retryOutputPath, orderedRetryGuilds, cancellationToken);

        var prunedGuildCount = await PruneDeadGuildsAsync(
            guildDataDirectory,
            deadGuilds.ToList(),
            knownGuilds.Count,
            cancellationToken
        );

        var orderedLines = characterLines
            .Keys.OrderBy(line => line, StringComparer.OrdinalIgnoreCase)
            .ToList();

        await WriteLinesAsync(outputPath, orderedLines, cancellationToken);

        return new GuildCharacterExportResult(
            guilds.Count,
            orderedLines.Count,
            orderedRetryGuilds.Count,
            deadGuilds.Count,
            prunedGuildCount,
            outputPath,
            retryOutputPath,
            retryOnly
        );
    }

    /// <returns>The guilds that failed for a reason worth retrying.</returns>
    private async Task<List<GuildSource>> ScanGuildsAsync(
        IReadOnlyList<GuildSource> guilds,
        ConcurrentDictionary<string, byte> characterLines,
        ConcurrentBag<GuildSource> deadGuilds,
        CancellationToken cancellationToken
    )
    {
        var retryGuilds = new ConcurrentBag<GuildSource>();
        var processedGuildCount = 0;
        var progressLock = new Lock();

        await Parallel.ForEachAsync(
            guilds,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = _guildWorkerCount,
                CancellationToken = cancellationToken,
            },
            async (guild, ct) =>
            {
                var result = await LoadGuildMembersAsync(_apiClient, guild, ct);
                switch (result.Status)
                {
                    case GuildLoadStatus.Succeeded:
                        foreach (var memberName in result.Members)
                        {
                            characterLines.TryAdd($"{memberName}-{guild.DisplayRealm}", 0);
                        }
                        break;
                    case GuildLoadStatus.NotFound:
                        deadGuilds.Add(guild);
                        break;
                    default:
                        retryGuilds.Add(guild);
                        break;
                }

                var processed = Interlocked.Increment(ref processedGuildCount);
                if (processed % ProgressInterval == 0 || processed == guilds.Count)
                {
                    lock (progressLock)
                    {
                        Console.WriteLine($"Loaded guilds {processed}/{guilds.Count}");
                    }
                }
            }
        );

        return retryGuilds.ToList();
    }

    /// <summary>
    /// Removes guilds the API reports as nonexistent from the realm guild lists. A guild that
    /// is later re-founded under the same name is added back by BattlegroundCollector.
    /// </summary>
    private static async Task<int> PruneDeadGuildsAsync(
        string guildDataDirectory,
        IReadOnlyList<GuildSource> deadGuilds,
        int knownGuildCount,
        CancellationToken cancellationToken
    )
    {
        if (deadGuilds.Count == 0)
        {
            return 0;
        }

        var maxPrunable = (int)(knownGuildCount * MaxPrunedGuildShare);
        if (deadGuilds.Count > maxPrunable)
        {
            Console.Error.WriteLine(
                $"{deadGuilds.Count} guilds reported as not found, more than the {maxPrunable} allowed per run. Guild lists were left unchanged; check the API and rerun."
            );
            return 0;
        }

        var prunedCount = 0;

        foreach (var source in RealmSources)
        {
            var deadNames = deadGuilds
                .Where(guild => guild.ApiRealm == source.ApiRealm)
                .Select(guild => guild.GuildName)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var path = Path.Combine(guildDataDirectory, source.FileName);
            if (deadNames.Count == 0 || !File.Exists(path))
            {
                continue;
            }

            var keptLines = new List<string>();
            foreach (var rawLine in File.ReadLines(path, Encoding.UTF8))
            {
                var guildName = rawLine.Trim().TrimStart('﻿');
                if (string.IsNullOrWhiteSpace(guildName))
                {
                    continue;
                }

                if (deadNames.Contains(guildName))
                {
                    Console.WriteLine(
                        $"  - Removed '{guildName}' from {source.FileName} (guild not found)"
                    );
                    prunedCount++;
                    continue;
                }

                keptLines.Add(guildName);
            }

            await WriteLinesAsync(path, keptLines, cancellationToken);
        }

        return prunedCount;
    }

    private static IEnumerable<GuildSource> LoadGuilds(string guildDataDirectory)
    {
        foreach (var source in RealmSources)
        {
            var path = Path.Combine(guildDataDirectory, source.FileName);
            if (!File.Exists(path))
            {
                continue;
            }

            foreach (var rawLine in File.ReadLines(path))
            {
                var guildName = rawLine?.Trim();
                if (string.IsNullOrWhiteSpace(guildName))
                {
                    continue;
                }

                yield return new GuildSource(guildName, source.ApiRealm, source.DisplayRealm);
            }
        }
    }

    private static IEnumerable<GuildSource> LoadRetryGuilds(string path)
    {
        if (!File.Exists(path))
        {
            yield break;
        }

        var lineNumber = 0;
        foreach (var rawLine in File.ReadLines(path, Encoding.UTF8))
        {
            lineNumber++;

            var line = rawLine?.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var parts = line.Split('\t', 2, StringSplitOptions.TrimEntries);
            if (
                parts.Length != 2
                || string.IsNullOrWhiteSpace(parts[0])
                || string.IsNullOrWhiteSpace(parts[1])
            )
            {
                throw new InvalidDataException(
                    $"Could not parse {Path.GetFileName(path)} line {lineNumber}. Expected format: Realm<TAB>GuildName."
                );
            }

            var source = ResolveRealmSource(parts[0]);
            if (source is null)
            {
                var knownRealms = string.Join(
                    ", ",
                    RealmSources.Select(realmSource => realmSource.DisplayRealm)
                );
                throw new InvalidDataException(
                    $"Could not parse {Path.GetFileName(path)} line {lineNumber}: unknown realm '{parts[0]}'. Known realms: {knownRealms}."
                );
            }

            yield return new GuildSource(parts[1], source.ApiRealm, source.DisplayRealm);
        }
    }

    private static RealmSource? ResolveRealmSource(string realmName)
    {
        return RealmSources.FirstOrDefault(source =>
            string.Equals(source.DisplayRealm, realmName, StringComparison.OrdinalIgnoreCase)
            || string.Equals(source.ApiRealm, realmName, StringComparison.OrdinalIgnoreCase)
        );
    }

    private static HashSet<string> LoadExistingCharacterLines(string path)
    {
        var lines = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path))
        {
            return lines;
        }

        foreach (var rawLine in File.ReadLines(path, Encoding.UTF8))
        {
            var line = rawLine?.Trim();
            if (!string.IsNullOrWhiteSpace(line))
            {
                lines.Add(line);
            }
        }

        return lines;
    }

    private static async Task<GuildLoadResult> LoadGuildMembersAsync(
        ITauriApiClient apiClient,
        GuildSource guild,
        CancellationToken cancellationToken
    )
    {
        var result = await apiClient.FetchResponseElementAsync(
            "guild-info",
            new { r = guild.ApiRealm, gn = guild.GuildName },
            $"guild '{guild.GuildName}' on {guild.DisplayRealm}",
            cancellationToken
        );

        if (result.ApiErrorCode == TauriApiResponseResult.GuildNotFoundErrorCode)
        {
            return GuildLoadResult.NotFound();
        }

        if (!result.Succeeded || result.ResponseElement is not { } response)
        {
            return GuildLoadResult.Failure();
        }

        if (
            response.ValueKind != JsonValueKind.Object
            || !response.TryGetProperty("guildList", out var guildListElement)
            || guildListElement.ValueKind != JsonValueKind.Object
        )
        {
            Console.Error.WriteLine(
                $"Could not load guild '{guild.GuildName}' on {guild.DisplayRealm}: response did not contain a guildList object."
            );
            return GuildLoadResult.Failure();
        }

        try
        {
            var guildInfo = response.Deserialize<GuildInfoInner>();
            if (guildInfo?.guildList is null)
            {
                Console.Error.WriteLine(
                    $"Could not load guild '{guild.GuildName}' on {guild.DisplayRealm}: response did not contain guild members."
                );
                return GuildLoadResult.Failure();
            }

            var members = guildInfo
                .guildList.Values.Where(member => member.level >= 70)
                .Select(member => member.name?.Trim())
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Cast<string>()
                .ToList();

            return GuildLoadResult.Success(members);
        }
        catch (JsonException ex)
        {
            Console.Error.WriteLine(
                $"Could not parse guild '{guild.GuildName}' on {guild.DisplayRealm}: {ex.Message}"
            );
            return GuildLoadResult.Failure();
        }
    }

    private static Task WriteLinesAsync(
        string path,
        IReadOnlyList<string> lines,
        CancellationToken cancellationToken
    ) => AtomicFile.WriteLinesAsync(path, lines, cancellationToken);

    private static async Task WriteRetryGuildsAsync(
        string path,
        IReadOnlyList<GuildSource> guilds,
        CancellationToken cancellationToken
    )
    {
        var lines = guilds.Select(guild => $"{guild.DisplayRealm}\t{guild.GuildName}").ToList();

        await WriteLinesAsync(path, lines, cancellationToken);
    }

    private sealed record RealmSource(string FileName, string ApiRealm, string DisplayRealm);

    private sealed record GuildSource(string GuildName, string ApiRealm, string DisplayRealm);

    private enum GuildLoadStatus
    {
        Succeeded,
        NotFound,
        Failed,
    }

    private readonly record struct GuildLoadResult(
        GuildLoadStatus Status,
        IReadOnlyList<string> Members
    )
    {
        public static GuildLoadResult Success(IReadOnlyList<string> members) =>
            new(GuildLoadStatus.Succeeded, members);

        public static GuildLoadResult NotFound() => new(GuildLoadStatus.NotFound, []);

        public static GuildLoadResult Failure() => new(GuildLoadStatus.Failed, []);
    }
}
