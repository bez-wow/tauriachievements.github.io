using MythicPlusGuildAndCharScan;
using Tauri.Core.Infrastructure;
using static AchievementLadder.Tests.MythicPlusExportServiceTests;

namespace AchievementLadder.Tests;

public sealed class MythicPlusGuildAndCharScanServiceTests
{
    private const string Tauri = "[HU] Tauri WoW Server";

    [Fact]
    public async Task ScanAsync_AddsNewGuildsPerRealmAndGuildlessCharacters()
    {
        var root = CreateTempDirectory();
        try
        {
            var guildsDirectory = Path.Combine(root, "Guilds");
            var guildlessPath = Path.Combine(root, "guildless-characters.txt");
            Directory.CreateDirectory(guildsDirectory);
            // Known names, without a trailing newline, in a different case than the API.
            File.WriteAllText(Path.Combine(guildsDirectory, "evermoon-guilds.txt"), "outlaws");
            File.WriteAllText(guildlessPath, "Known-[EN] Evermoon");

            var apiClient = new FakeChallengeApiClient(
                IndexJson(),
                new()
                {
                    [(Evermoon, 200)] = LeaderboardJson(
                        Run(
                            15,
                            2_000_000,
                            300,
                            [],
                            Member("Alpha", Evermoon, 6, "Blood", 0, "Outlaws"),
                            Member("Beta", Evermoon, 2, "Holy", 1, ""),
                            Member("Known", Evermoon, 3, "Marksmanship", 2, "")
                        ),
                        // Gamma was guildless back then but has a guild in a newer run.
                        Run(
                            10,
                            2_000_000,
                            100,
                            [],
                            Member("Gamma", Evermoon, 10, "Windwalker", 2, "")
                        )
                    ),
                    [(Evermoon, 197)] = LeaderboardJson(
                        Run(
                            12,
                            2_000_000,
                            200,
                            [],
                            Member("Gamma", Evermoon, 10, "Windwalker", 2, "New Order"),
                            Member("Delta", Tauri, 1, "Arms", 2, "Tauri Guild")
                        )
                    ),
                    [(Evermoon, 239)] = LeaderboardJson(),
                    [(WoD, 200)] = LeaderboardJson(
                        Run(
                            9,
                            2_000_000,
                            50,
                            [],
                            Member("Epsilon", WoD, 4, "Combat", 2, "Dark Ones"),
                            Member("Zeta", WoD, 8, "Frost", 2, "")
                        )
                    ),
                    [(WoD, 197)] = LeaderboardJson(),
                    [(WoD, 239)] = LeaderboardJson(),
                }
            );
            var service = new MythicPlusGuildAndCharScanService(
                guildsDirectory,
                guildlessPath,
                apiClient
            );

            var result = await service.ScanAsync([Evermoon, WoD], CancellationToken.None);

            Assert.Empty(result.Failures);
            Assert.Equal(
                (4, 7, 3, 2),
                (
                    result.RunCount,
                    result.CharacterCount,
                    result.NewGuildCount,
                    result.NewGuildlessCharacterCount
                )
            );
            Assert.Equal(
                ["outlaws", "New Order"],
                File.ReadAllLines(Path.Combine(guildsDirectory, "evermoon-guilds.txt"))
            );
            Assert.Equal(
                ["Tauri Guild"],
                File.ReadAllLines(Path.Combine(guildsDirectory, "tauri-guilds.txt"))
            );
            Assert.Equal(
                ["Dark Ones"],
                File.ReadAllLines(Path.Combine(guildsDirectory, "wod-guilds.txt"))
            );
            Assert.Equal(
                ["Known-[EN] Evermoon", "Beta-[EN] Evermoon", "Zeta-[HU] Warriors of Darkness"],
                File.ReadAllLines(guildlessPath)
            );
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ScanAsync_KeepsWhatWasReadWhenALeaderboardFails()
    {
        var root = CreateTempDirectory();
        try
        {
            var guildsDirectory = Path.Combine(root, "Guilds");
            var apiClient = new FakeChallengeApiClient(
                IndexJson(),
                new()
                {
                    [(Evermoon, 200)] = LeaderboardJson(
                        Run(
                            15,
                            2_000_000,
                            300,
                            [],
                            Member("Alpha", Evermoon, 6, "Blood", 0, "Outlaws")
                        )
                    ),
                }
            );
            var service = new MythicPlusGuildAndCharScanService(
                guildsDirectory,
                Path.Combine(root, "guildless-characters.txt"),
                apiClient
            );

            var result = await service.ScanAsync([Evermoon], CancellationToken.None);

            Assert.Equal(2, result.Failures.Count);
            Assert.Equal(
                ["Outlaws"],
                File.ReadAllLines(Path.Combine(guildsDirectory, "evermoon-guilds.txt"))
            );
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ScanAsync_ReportsAnUnreadableIndexWithoutWritingAnything()
    {
        var root = CreateTempDirectory();
        try
        {
            var service = new MythicPlusGuildAndCharScanService(
                Path.Combine(root, "Guilds"),
                Path.Combine(root, "guildless-characters.txt"),
                new FailingApiClient()
            );

            var result = await service.ScanAsync([Evermoon], CancellationToken.None);

            Assert.Contains("challenge index", Assert.Single(result.Failures));
            Assert.Empty(Directory.EnumerateFileSystemEntries(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private sealed class FailingApiClient : ITauriApiClient
    {
        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        ) => Task.FromResult(TauriApiResponseResult.Failure("API down."));
    }
}
