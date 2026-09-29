using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Tauri.Core.Configuration;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;
using Tauri.Core.Models;
using Tauri.Core.Shared;

namespace MissingPlayerFinder;

public sealed class MissingPlayerFinderService(
    string solutionRoot,
    string achievementLadderProjectRoot,
    TauriApiOptions apiOptions,
    ITauriApiClient apiClient
)
{
    private static readonly CharacterKeyComparer CharacterComparer = new();
    private static readonly JsonSerializerOptions FrontendJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };
    private const int ProgressInterval = 100;
    private static readonly IReadOnlyDictionary<int, RareItemDefinition> NoRareItems =
        new Dictionary<int, RareItemDefinition>();

    private readonly string _solutionRoot = Path.GetFullPath(solutionRoot);
    private readonly string _achievementLadderProjectRoot = Path.GetFullPath(
        achievementLadderProjectRoot
    );
    private readonly TauriApiOptions _apiOptions = apiOptions;
    private readonly ITauriApiClient _apiClient = apiClient;
    private readonly int _characterWorkerCount = Math.Max(4, apiOptions.MaxConcurrentRequests * 2);

    public async Task<MissingPlayerFinderResult> GenerateAsync(CancellationToken cancellationToken)
    {
        if (!Directory.Exists(_achievementLadderProjectRoot))
        {
            throw new DirectoryNotFoundException(
                $"Could not find AchievementLadder project folder: {_achievementLadderProjectRoot}"
            );
        }

        var frontendSrcDirectory = ProjectPaths.GetFrontendSrcDirectory(_solutionRoot);
        var playersCsvPath = Path.Combine(frontendSrcDirectory, "Players.csv");
        var rareAchievementsPath = Path.Combine(frontendSrcDirectory, "RareAchievements.json");
        var lastUpdatedPath = Path.Combine(frontendSrcDirectory, "lastUpdated.txt");
        var retryOutputPath = Path.Combine(_solutionRoot, "MissingPlayersToScan.txt");

        if (!File.Exists(playersCsvPath))
        {
            throw new FileNotFoundException(
                $"Could not find Players.csv at {playersCsvPath}",
                playersCsvPath
            );
        }

        var sourceCharacters = LoadSourceCharacters(cancellationToken);
        var csvCharacterKeys = LoadCsvCharacterKeys(playersCsvPath, cancellationToken);
        var retryCharacters = LoadRetryCharacters(retryOutputPath, cancellationToken);
        var targets = BuildBackfillTargets(sourceCharacters, csvCharacterKeys, retryCharacters);

        Console.WriteLine($"Missing characters at start: {targets.Count}");
        Console.WriteLine(
            $"API settings: concurrency={_apiOptions.MaxConcurrentRequests}, timeout={_apiOptions.RequestTimeoutSeconds}s, retries={_apiOptions.MaxRetryAttempts}"
        );

        var playersToAppend = new ConcurrentBag<Player>();
        var rareAchievementEntries = new ConcurrentBag<CharacterRareAchievementEntry>();
        var unresolvedCharacters = new ConcurrentBag<CharacterToScan>();
        var processedCount = 0;

        await Parallel.ForEachAsync(
            targets,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = _characterWorkerCount,
                CancellationToken = cancellationToken,
            },
            async (target, ct) =>
            {
                var result = await FetchBackfillAsync(_apiClient, target, ct);

                if (target.RequiresPlayerBackfill && result.Player is { } fetchedPlayer)
                {
                    playersToAppend.Add(fetchedPlayer);
                }

                if (
                    target.RequiresRareAchievementBackfill
                    && result.Succeeded
                    && result.RareAchievements.Count > 0
                )
                {
                    if (result.Player is { } metadataPlayer)
                    {
                        rareAchievementEntries.Add(
                            new CharacterRareAchievementEntry(
                                metadataPlayer.Name,
                                metadataPlayer.Realm,
                                metadataPlayer.Race,
                                metadataPlayer.Gender,
                                metadataPlayer.Class,
                                metadataPlayer.Guild,
                                result.RareAchievements
                            )
                        );
                    }
                }

                if (!result.Succeeded)
                {
                    unresolvedCharacters.Add(target.Character);
                }

                var processed = Interlocked.Increment(ref processedCount);
                if (processed % ProgressInterval == 0 || processed == targets.Count)
                {
                    Console.Write($"\rBackfill progress: {processed}/{targets.Count}");
                }
            }
        );

        if (targets.Count > 0)
        {
            Console.WriteLine();
        }

        var orderedPlayers = playersToAppend
            .OrderByDescending(player => player.AchievementPoints)
            .ThenByDescending(player => player.HonorableKills)
            .ThenBy(player => player.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(player => player.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var orderedRareEntries = rareAchievementEntries
            .Distinct(new RareAchievementEntryComparer())
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var remainingCharacters = unresolvedCharacters
            .Distinct(new CharacterToScanComparer())
            .OrderBy(character => character.DisplayRealm, StringComparer.OrdinalIgnoreCase)
            .ThenBy(character => character.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        await AppendPlayersAsync(playersCsvPath, orderedPlayers, cancellationToken);
        var updatedRareAchievementsPath = await MergeRareAchievementsAsync(
            rareAchievementsPath,
            orderedRareEntries,
            cancellationToken
        );
        var refreshedLastUpdatedPath = await RefreshLastUpdatedAsync(
            lastUpdatedPath,
            orderedPlayers.Count > 0 || updatedRareAchievementsPath is not null,
            cancellationToken
        );

        await WriteMissingCharactersAsync(retryOutputPath, remainingCharacters, cancellationToken);

        return new MissingPlayerFinderResult(
            sourceCharacters.Count,
            csvCharacterKeys.Count,
            targets.Count,
            orderedPlayers.Count,
            orderedRareEntries.Count,
            remainingCharacters.Count,
            playersCsvPath,
            updatedRareAchievementsPath,
            refreshedLastUpdatedPath,
            retryOutputPath
        );
    }

    private HashSet<CharacterToScan> LoadSourceCharacters(CancellationToken cancellationToken)
    {
        var allCharacters = new List<(string Name, string ApiRealm, string DisplayRealm)>();

        CharacterHelpers.LoadDefaultCharacterSources(
            _achievementLadderProjectRoot,
            allCharacters,
            includePvPSeasonCharacters: true
        );

        var result = new HashSet<CharacterToScan>(new CharacterToScanComparer());

        foreach (var character in allCharacters)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (
                string.IsNullOrWhiteSpace(character.Name)
                || character.Name.Contains('#', StringComparison.Ordinal)
                || string.IsNullOrWhiteSpace(character.DisplayRealm)
            )
            {
                continue;
            }

            result.Add(
                new CharacterToScan(
                    character.Name.Trim(),
                    character.ApiRealm.Trim(),
                    character.DisplayRealm.Trim()
                )
            );
        }

        return result;
    }

    private HashSet<CharacterKey> LoadCsvCharacterKeys(
        string playersCsvPath,
        CancellationToken cancellationToken
    )
    {
        using var lines = File.ReadLines(playersCsvPath).GetEnumerator();
        if (!lines.MoveNext())
        {
            return new HashSet<CharacterKey>(CharacterComparer);
        }

        var header = PlayerCsvFormat.ParseLine(lines.Current);
        var nameIndex = PlayerCsvFormat.FindColumnIndex(header, "Name");
        var realmIndex = PlayerCsvFormat.FindColumnIndex(header, "Realm");

        if (nameIndex < 0 || realmIndex < 0)
        {
            throw new InvalidDataException("Players.csv must contain Name and Realm columns.");
        }

        var appearanceCountIndex = PlayerCsvFormat.FindColumnIndex(header, "AppearanceCount");
        var levelIndex = PlayerCsvFormat.FindColumnIndex(header, "Level");

        if (appearanceCountIndex < 0 || levelIndex < 0)
        {
            throw new InvalidDataException(
                "Players.csv must contain AppearanceCount and Level columns. Run AchievementLadder once to regenerate it before appending missing players."
            );
        }

        var result = new HashSet<CharacterKey>(CharacterComparer);

        while (lines.MoveNext())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var line = lines.Current;
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var values = PlayerCsvFormat.ParseLine(line);
            if (nameIndex >= values.Count || realmIndex >= values.Count)
            {
                continue;
            }

            var name = values[nameIndex].Trim();
            var realm = values[realmIndex].Trim();

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(realm))
            {
                continue;
            }

            result.Add(new CharacterKey(name, realm));
        }

        return result;
    }

    private List<BackfillTarget> BuildBackfillTargets(
        HashSet<CharacterToScan> sourceCharacters,
        HashSet<CharacterKey> csvCharacterKeys,
        IReadOnlyList<CharacterToScan> retryCharacters
    )
    {
        var targetMap = new Dictionary<CharacterToScan, ScanRequirements>(
            new CharacterToScanComparer()
        );

        foreach (var character in sourceCharacters)
        {
            if (
                !csvCharacterKeys.Contains(new CharacterKey(character.Name, character.DisplayRealm))
            )
            {
                UpsertTarget(
                    character,
                    requiresPlayerBackfill: true,
                    requiresRareAchievementBackfill: true
                );
            }
        }

        foreach (var retryCharacter in retryCharacters)
        {
            var requiresPlayerBackfill = !csvCharacterKeys.Contains(
                new CharacterKey(retryCharacter.Name, retryCharacter.DisplayRealm)
            );
            UpsertTarget(
                retryCharacter,
                requiresPlayerBackfill,
                requiresRareAchievementBackfill: true
            );
        }

        return targetMap
            .Select(entry => new BackfillTarget(
                entry.Key,
                entry.Value.RequiresPlayerBackfill,
                entry.Value.RequiresRareAchievementBackfill
            ))
            .OrderBy(target => target.Character.DisplayRealm, StringComparer.OrdinalIgnoreCase)
            .ThenBy(target => target.Character.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        void UpsertTarget(
            CharacterToScan character,
            bool requiresPlayerBackfill,
            bool requiresRareAchievementBackfill
        )
        {
            if (!targetMap.TryGetValue(character, out var requirements))
            {
                requirements = new ScanRequirements();
                targetMap[character] = requirements;
            }

            requirements.RequiresPlayerBackfill |= requiresPlayerBackfill;
            requirements.RequiresRareAchievementBackfill |= requiresRareAchievementBackfill;
        }
    }

    private static List<CharacterToScan> LoadRetryCharacters(
        string retryOutputPath,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(retryOutputPath))
        {
            return [];
        }

        var result = new List<CharacterToScan>();

        foreach (var line in File.ReadLines(retryOutputPath))
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (
                !CharacterHelpers.TryExtractCharacterWithRealm(
                    line,
                    out var name,
                    out var apiRealm,
                    out var displayRealm
                )
            )
            {
                continue;
            }

            result.Add(new CharacterToScan(name, apiRealm, displayRealm));
        }

        return result;
    }

    private static async Task<CharacterBackfillResult> FetchBackfillAsync(
        ITauriApiClient apiClient,
        BackfillTarget target,
        CancellationToken cancellationToken
    )
    {
        if (!target.RequiresPlayerBackfill && !target.RequiresRareAchievementBackfill)
        {
            return CharacterBackfillResult.Skipped();
        }

        // A character already in Players.csv only needs its rare achievements refreshed,
        // which the achievements response alone answers.
        var scanResult = await CharacterScanner.ScanAsync(
            apiClient,
            target.Character.Name,
            target.Character.ApiRealm,
            target.Character.DisplayRealm,
            NoRareItems,
            target.RequiresPlayerBackfill
                ? CharacterScanMode.Full
                : CharacterScanMode.AchievementsOnly,
            cancellationToken
        );

        return scanResult.Player is { } player
            ? CharacterBackfillResult.Success(player, scanResult.RareAchievements)
            : CharacterBackfillResult.Failure();
    }

    private static async Task AppendPlayersAsync(
        string playersCsvPath,
        IReadOnlyList<Player> players,
        CancellationToken cancellationToken
    )
    {
        if (players.Count == 0)
        {
            return;
        }

        var directory = Path.GetDirectoryName(playersCsvPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var writeHeader = !File.Exists(playersCsvPath) || new FileInfo(playersCsvPath).Length == 0;
        var needsLeadingNewLine = !writeHeader && NeedsLeadingNewLine(playersCsvPath);

        await using var stream = new FileStream(
            playersCsvPath,
            FileMode.Append,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            useAsync: true
        );
        await using var writer = new StreamWriter(stream, AtomicFile.Utf8NoBom);

        if (writeHeader)
        {
            await writer.WriteLineAsync(PlayerCsvFormat.Header);
        }
        else if (needsLeadingNewLine)
        {
            await writer.WriteLineAsync();
        }

        foreach (var player in players)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await writer.WriteLineAsync(PlayerCsvFormat.FormatRow(player));
        }
    }

    private static async Task<string?> MergeRareAchievementsAsync(
        string rareAchievementsPath,
        IReadOnlyList<CharacterRareAchievementEntry> entries,
        CancellationToken cancellationToken
    )
    {
        if (entries.Count == 0)
        {
            return null;
        }

        RareAchievementExport existingExport;
        if (File.Exists(rareAchievementsPath))
        {
            await using var readStream = new FileStream(
                rareAchievementsPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                64 * 1024,
                useAsync: true
            );
            existingExport =
                await JsonSerializer.DeserializeAsync<RareAchievementExport>(
                    readStream,
                    FrontendJsonOptions,
                    cancellationToken
                )
                ?? throw new InvalidDataException(
                    $"Could not deserialize RareAchievements.json at {rareAchievementsPath}."
                );
        }
        else
        {
            existingExport = new RareAchievementExport(
                DateTimeOffset.UtcNow,
                RareScanCatalog.RareAchievementDefinitions,
                []
            );
        }

        var entryKeys = entries
            .Select(entry => new CharacterKey(entry.Name, entry.Realm))
            .ToHashSet(CharacterComparer);

        var mergedCharacters = existingExport
            .Characters.Where(entry =>
                !entryKeys.Contains(new CharacterKey(entry.Name, entry.Realm))
            )
            .Concat(entries)
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var updatedExport = new RareAchievementExport(
            DateTimeOffset.UtcNow,
            RareScanCatalog.RareAchievementDefinitions,
            mergedCharacters
        );

        await AtomicFile.WriteJsonAsync(
            rareAchievementsPath,
            updatedExport,
            FrontendJsonOptions,
            cancellationToken
        );

        return rareAchievementsPath;
    }

    private static Task WriteMissingCharactersAsync(
        string outputPath,
        IReadOnlyList<CharacterToScan> missingCharacters,
        CancellationToken cancellationToken
    ) =>
        AtomicFile.WriteLinesAsync(
            outputPath,
            missingCharacters.Select(character => $"{character.Name}-{character.DisplayRealm}"),
            cancellationToken
        );

    private static async Task<string?> RefreshLastUpdatedAsync(
        string lastUpdatedPath,
        bool hasExportUpdates,
        CancellationToken cancellationToken
    )
    {
        if (!hasExportUpdates)
        {
            return null;
        }

        var content = DateTimeOffset.UtcNow.ToString(
            "yyyy-MM-ddTHH:mm:ss",
            CultureInfo.InvariantCulture
        );
        await AtomicFile.WriteTextAsync(lastUpdatedPath, content, cancellationToken);
        return lastUpdatedPath;
    }

    private static bool NeedsLeadingNewLine(string path)
    {
        using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite
        );
        if (stream.Length == 0)
        {
            return false;
        }

        stream.Seek(-1, SeekOrigin.End);
        var lastByte = stream.ReadByte();
        return lastByte is not '\n';
    }

    private sealed class ScanRequirements
    {
        public bool RequiresPlayerBackfill { get; set; }

        public bool RequiresRareAchievementBackfill { get; set; }
    }

    private readonly record struct CharacterKey(string Name, string Realm);

    private readonly record struct CharacterToScan(
        string Name,
        string ApiRealm,
        string DisplayRealm
    );

    private readonly record struct BackfillTarget(
        CharacterToScan Character,
        bool RequiresPlayerBackfill,
        bool RequiresRareAchievementBackfill
    );

    private readonly record struct CharacterBackfillResult(
        Player? Player,
        IReadOnlyList<CharacterRareAchievement> RareAchievements,
        bool Succeeded
    )
    {
        public static CharacterBackfillResult Success(
            Player player,
            IReadOnlyList<CharacterRareAchievement> rareAchievements
        ) => new(player, rareAchievements, true);

        public static CharacterBackfillResult Failure() =>
            new(null, Array.Empty<CharacterRareAchievement>(), false);

        public static CharacterBackfillResult Skipped() =>
            new(null, Array.Empty<CharacterRareAchievement>(), true);
    }

    private sealed class CharacterKeyComparer : IEqualityComparer<CharacterKey>
    {
        public bool Equals(CharacterKey x, CharacterKey y) =>
            string.Equals(x.Name, y.Name, StringComparison.OrdinalIgnoreCase)
            && string.Equals(x.Realm, y.Realm, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode(CharacterKey obj)
        {
            return HashCode.Combine(
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Name),
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Realm)
            );
        }
    }

    private sealed class CharacterToScanComparer : IEqualityComparer<CharacterToScan>
    {
        public bool Equals(CharacterToScan x, CharacterToScan y) =>
            string.Equals(x.Name, y.Name, StringComparison.OrdinalIgnoreCase)
            && string.Equals(x.DisplayRealm, y.DisplayRealm, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode(CharacterToScan obj)
        {
            return HashCode.Combine(
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Name),
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.DisplayRealm)
            );
        }
    }

    private sealed class RareAchievementEntryComparer
        : IEqualityComparer<CharacterRareAchievementEntry>
    {
        public bool Equals(CharacterRareAchievementEntry? x, CharacterRareAchievementEntry? y)
        {
            if (x is null || y is null)
            {
                return x is null && y is null;
            }

            return string.Equals(x.Name, y.Name, StringComparison.OrdinalIgnoreCase)
                && string.Equals(x.Realm, y.Realm, StringComparison.OrdinalIgnoreCase);
        }

        public int GetHashCode(CharacterRareAchievementEntry obj)
        {
            return HashCode.Combine(
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Name),
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Realm)
            );
        }
    }
}
