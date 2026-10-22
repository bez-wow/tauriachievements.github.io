using System.Collections.Concurrent;
using System.Text.Json;
using RaidLogExporter;
using RaidLogGuildAndCharScan;
using Tauri.Core.Infrastructure;
using static AchievementLadder.Tests.MythicPlusExportServiceTests;

namespace AchievementLadder.Tests;

public sealed class RaidLogGuildAndCharScanServiceTests
{
    private const string Evermoon = "[EN] Evermoon";
    private const string Tauri = "[HU] Tauri WoW Server";
    private const string WoD = "[HU] Warriors of Darkness";

    [Fact]
    public async Task ScanAsync_LooksUpEveryRaiderOnceAndFilesTheirCurrentGuild()
    {
        var root = CreateTempDirectory();
        try
        {
            var raidLogDirectory = Path.Combine(root, "raid-log-data");
            var guildsDirectory = Path.Combine(root, "Guilds");
            var guildlessPath = Path.Combine(root, "guildless-characters.txt");
            Directory.CreateDirectory(guildsDirectory);
            // Known names, without a trailing newline, in a different case than the API.
            File.WriteAllText(Path.Combine(guildsDirectory, "evermoon-guilds.txt"), "outlaws");
            File.WriteAllText(guildlessPath, "Known-[EN] Evermoon");

            await WriteExportAsync(
                raidLogDirectory,
                // The log still names Alpha's old guild; the character sheet decides.
                Log(
                    "Tauri",
                    1,
                    1853,
                    15,
                    Raider("Alpha", "Evermoon", "Old Guild"),
                    Raider("Beta", "Evermoon"),
                    Raider("Known", "Evermoon"),
                    Raider("Gone", "Evermoon"),
                    Raider("Odd", "Evermoon")
                ),
                Log(
                    "Tauri",
                    2,
                    1864,
                    16,
                    Raider("ALPHA", "Evermoon"),
                    Raider("Delta", "Tauri", "Tauri Guild"),
                    Raider("Flaky", "Evermoon")
                ),
                Log("WoD", 1, 1853, 14, Raider("Epsilon", "WoD"), Raider("Zeta", "WoD"))
            );

            var apiClient = new FakeCharacterSheetClient(
                new()
                {
                    [(Evermoon, "Alpha")] = Sheet("Outlaws"),
                    [(Evermoon, "Beta")] = Sheet(""),
                    [(Evermoon, "Known")] = Sheet(""),
                    [(Evermoon, "Gone")] = TauriApiResponseResult.Failure(
                        "API returned 400 Bad Request (error 6: character not found)",
                        TauriApiResponseResult.CharacterNotFoundErrorCode
                    ),
                    // A sheet without guildName says nothing about the guild.
                    [(Evermoon, "Odd")] = TauriApiResponseResult.Success(Parse("{}")),
                    [(Tauri, "Delta")] = Sheet("Tauri Guild"),
                    [(Evermoon, "Flaky")] = TauriApiResponseResult.Failure("API down."),
                    [(WoD, "Epsilon")] = Sheet("Dark Ones"),
                    [(WoD, "Zeta")] = Sheet(""),
                }
            );
            var service = new RaidLogGuildAndCharScanService(
                raidLogDirectory,
                guildsDirectory,
                guildlessPath,
                apiClient
            );

            var result = await service.ScanAsync(CancellationToken.None);

            Assert.Equal(
                (9, 1, 2, 2),
                (
                    result.RaiderCount,
                    result.NotFoundCount,
                    result.NewGuildCount,
                    result.NewGuildlessCharacterCount
                )
            );
            Assert.Collection(
                result.Failures,
                failure => Assert.StartsWith("Flaky-Evermoon: API down.", failure),
                failure => Assert.StartsWith("Odd-Evermoon:", failure)
            );
            // Each raider once, on their own realm, whatever case a log used.
            Assert.Equal(9, apiClient.Requests.Count);
            Assert.Equal(9, apiClient.Requests.Distinct().Count());
            Assert.All(
                apiClient.Requests,
                request => Assert.Equal("character-sheet", request.Endpoint)
            );

            Assert.Equal(
                ["outlaws"],
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
            // Gone, Odd and Flaky were not read as guildless: only an empty guildName counts.
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
    public async Task ScanAsync_ReportsAMissingExportWithoutWritingAnything()
    {
        var root = CreateTempDirectory();
        try
        {
            var apiClient = new FakeCharacterSheetClient([]);
            var service = new RaidLogGuildAndCharScanService(
                Path.Combine(root, "raid-log-data"),
                Path.Combine(root, "Guilds"),
                Path.Combine(root, "guildless-characters.txt"),
                apiClient
            );

            var result = await service.ScanAsync(CancellationToken.None);

            Assert.Contains("RaidLogExporter", Assert.Single(result.Failures));
            Assert.Empty(apiClient.Requests);
            Assert.Empty(Directory.EnumerateFileSystemEntries(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static async Task WriteExportAsync(string directory, params RaidLog[] logs)
    {
        var dataset = RaidLogDatasetBuilder.Build(
            logs,
            new Dictionary<int, RaidItem>(),
            PlayerGuildDirectory.Empty
        );
        await RaidLogFileWriter.WriteAsync(
            directory,
            dataset,
            DateTimeOffset.UnixEpoch,
            null,
            null,
            null,
            CancellationToken.None
        );
    }

    private static RaidLog Log(
        string realm,
        int logId,
        int encounterId,
        int difficultyId,
        params RaidLogMember[] members
    ) =>
        new(
            new RaidLogKey(realm, logId),
            encounterId,
            difficultyId,
            1_790_000_000 + logId,
            200_000,
            null,
            RaidCatalog.Alliance,
            0,
            0,
            0,
            members,
            []
        );

    private static RaidLogMember Raider(string name, string realm, string guild = "") =>
        new(name, realm, 1, 71, 1, 0, guild, 870, 1_000, 0, 0, 0, 0, 0, 0, "", []);

    private static TauriApiResponseResult Sheet(string guildName) =>
        TauriApiResponseResult.Success(
            Parse(JsonSerializer.Serialize(new { name = "x", guildName }))
        );

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private sealed class FakeCharacterSheetClient(
        Dictionary<(string Realm, string Name), TauriApiResponseResult> sheets
    ) : ITauriApiClient
    {
        private readonly ConcurrentQueue<(string Endpoint, string Realm, string Name)> _requests =
            new();

        public IReadOnlyList<(string Endpoint, string Realm, string Name)> Requests =>
            [.. _requests];

        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            var request = JsonSerializer.SerializeToElement(parameters);
            var realm = request.GetProperty("r").GetString()!;
            var name = request.GetProperty("n").GetString()!;
            _requests.Enqueue((endpoint, realm, name));

            return Task.FromResult(
                sheets.TryGetValue((realm, name), out var sheet)
                    ? sheet
                    : TauriApiResponseResult.Failure($"No fake sheet for {name} on {realm}.")
            );
        }
    }
}
