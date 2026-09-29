using System.Collections.Concurrent;
using System.Globalization;
using Tauri.Core.Configuration;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;
using Tauri.Core.Models;
using Tauri.Core.Shared;

namespace AchievementLadder.Services;

public class PlayerService(
    string projectRoot,
    TauriApiOptions apiOptions,
    ITauriApiClient apiClient,
    PlayerCsvStore csvStore
)
{
    private static readonly CharacterTargetComparer CharacterComparer = new();
    private const int ProgressInterval = 250;
    private const int ProgressBarWidth = 30;
    private readonly int _characterWorkerCount = Math.Max(4, apiOptions.MaxConcurrentRequests * 2);

    public async Task<SyncResult> SyncDataAsync(CancellationToken cancellationToken)
    {
        var solutionRoot = ProjectPaths.FindSolutionRoot(projectRoot);
        var retryOutputPath = Path.Combine(solutionRoot, "MissingPlayersToScan.txt");
        var rareItems = RareItemCatalog.Load(Path.Combine(projectRoot, "Data", "rare-items.txt"));
        var rareItemsById = rareItems.ToDictionary(item => item.Id);
        var allCharacters = new List<(string Name, string ApiRealm, string DisplayRealm)>();
        LoadCharacterSources(allCharacters);

        var distinctCharacters = allCharacters
            .Where(x =>
                !string.IsNullOrWhiteSpace(x.Name)
                && !x.Name.Contains('#', StringComparison.Ordinal)
                && !string.IsNullOrWhiteSpace(x.ApiRealm)
                && !string.IsNullOrWhiteSpace(x.DisplayRealm)
            )
            .Distinct(CharacterComparer)
            .ToList();

        Console.WriteLine($"Scanning {distinctCharacters.Count} characters...");
        Console.WriteLine(
            $"API settings: concurrency={apiOptions.MaxConcurrentRequests}, timeout={apiOptions.RequestTimeoutSeconds}s, retries={apiOptions.MaxRetryAttempts}"
        );
        WriteProgress(0, distinctCharacters.Count);

        var players = new ConcurrentBag<Player>();
        var rareAchievementEntries = new ConcurrentBag<CharacterRareAchievementEntry>();
        var rareItemEntries = new ConcurrentBag<CharacterRareItemEntry>();
        var retryCharacters =
            new ConcurrentBag<(string Name, string ApiRealm, string DisplayRealm)>();
        var totalCharacters = distinctCharacters.Count;
        var done = 0;
        var progressLock = new Lock();

        await Parallel.ForEachAsync(
            distinctCharacters,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = _characterWorkerCount,
                CancellationToken = cancellationToken,
            },
            async (character, ct) =>
            {
                var syncResult = await CharacterScanner.ScanAsync(
                    apiClient,
                    character.Name,
                    character.ApiRealm,
                    character.DisplayRealm,
                    rareItemsById,
                    CharacterScanMode.Full,
                    ct
                );

                if (syncResult.Player is { } player)
                {
                    players.Add(player);

                    if (syncResult.RareAchievements.Count > 0)
                    {
                        rareAchievementEntries.Add(
                            new CharacterRareAchievementEntry(
                                player.Name,
                                player.Realm,
                                player.Race,
                                player.Gender,
                                player.Class,
                                player.Guild,
                                syncResult.RareAchievements
                            )
                        );
                    }

                    if (syncResult.RareItems.Count > 0)
                    {
                        rareItemEntries.Add(
                            new CharacterRareItemEntry(
                                player.Name,
                                player.Realm,
                                player.Race,
                                player.Gender,
                                player.Class,
                                player.Guild,
                                syncResult.RareItems
                            )
                        );
                    }
                }

                if (!syncResult.Succeeded)
                {
                    retryCharacters.Add(character);
                }

                var processed = Interlocked.Increment(ref done);
                if (processed % ProgressInterval == 0 || processed == totalCharacters)
                {
                    lock (progressLock)
                    {
                        WriteProgress(processed, totalCharacters);
                    }
                }
            }
        );

        if (totalCharacters > 0)
        {
            Console.WriteLine();
        }

        var orderedPlayers = players
            .OrderByDescending(player => player.AchievementPoints)
            .ThenByDescending(player => player.HonorableKills)
            .ThenBy(player => player.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(player => player.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var orderedRareAchievementEntries = rareAchievementEntries
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var orderedRetryCharacters = retryCharacters
            .Distinct(CharacterComparer)
            .OrderBy(character => character.DisplayRealm, StringComparer.OrdinalIgnoreCase)
            .ThenBy(character => character.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var orderedRareItemEntries = rareItemEntries
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.Realm, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var generatedAt = DateTimeOffset.UtcNow;

        var playersCsvPath = await csvStore.WriteAsync(
            orderedPlayers,
            "Players.csv",
            cancellationToken
        );
        var rareAchievementsPath = await csvStore.WriteJsonAsync(
            "RareAchievements.json",
            new RareAchievementExport(
                generatedAt,
                RareScanCatalog.RareAchievementDefinitions,
                orderedRareAchievementEntries
            ),
            cancellationToken
        );
        var rareItemsPath = await csvStore.WriteJsonAsync(
            "RareItems.json",
            new RareItemExport(generatedAt, rareItems, orderedRareItemEntries),
            cancellationToken
        );
        var lastUpdatedPath = await csvStore.WriteTextAsync(
            "lastUpdated.txt",
            generatedAt.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture),
            cancellationToken
        );

        await AtomicFile.WriteLinesAsync(
            retryOutputPath,
            orderedRetryCharacters.Select(character =>
                $"{character.Name}-{character.DisplayRealm}"
            ),
            cancellationToken
        );

        return new SyncResult(
            orderedPlayers.Count,
            orderedRetryCharacters.Count,
            playersCsvPath,
            rareAchievementsPath,
            rareItemsPath,
            lastUpdatedPath,
            retryOutputPath
        );

        void LoadCharacterSources(List<(string Name, string ApiRealm, string DisplayRealm)> output)
        {
            CharacterHelpers.LoadDefaultCharacterSources(
                projectRoot,
                output,
                includePvPSeasonCharacters: true,
                includeRealmFirstCharacters: true
            );
        }
    }

    private static void WriteProgress(int processed, int total)
    {
        if (total <= 0)
        {
            Console.WriteLine("Progress: [------------------------------] 0/0 (100.0%)");
            return;
        }

        var ratio = (double)processed / total;
        var filledWidth = Math.Min(
            ProgressBarWidth,
            (int)Math.Round(ratio * ProgressBarWidth, MidpointRounding.AwayFromZero)
        );
        var bar = new string('#', filledWidth) + new string('-', ProgressBarWidth - filledWidth);

        Console.Write($"\rProgress: [{bar}] {processed}/{total} ({ratio:P1})");
    }

    private sealed class CharacterTargetComparer
        : IEqualityComparer<(string Name, string ApiRealm, string DisplayRealm)>
    {
        public bool Equals(
            (string Name, string ApiRealm, string DisplayRealm) x,
            (string Name, string ApiRealm, string DisplayRealm) y
        ) =>
            string.Equals(x.Name, y.Name, StringComparison.OrdinalIgnoreCase)
            && string.Equals(x.DisplayRealm, y.DisplayRealm, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode((string Name, string ApiRealm, string DisplayRealm) obj)
        {
            return HashCode.Combine(
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Name),
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.DisplayRealm)
            );
        }
    }
}
