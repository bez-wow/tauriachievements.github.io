using System.Collections.Concurrent;
using System.Text.Json;
using GuildCharacterExporter;
using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace AchievementLadder.Tests;

public sealed class GuildCharacterExportServiceTests : IDisposable
{
    private readonly string _solutionRoot = Path.Combine(
        Path.GetTempPath(),
        $"guild-character-export-tests-{Guid.NewGuid():N}"
    );

    private string GuildsDirectory =>
        Path.Combine(_solutionRoot, "AchievementLadder", "Data", "Guilds");

    private string OutputPath =>
        Path.Combine(
            _solutionRoot,
            "AchievementLadder",
            "Data",
            "GuildCharacters",
            "GuildCharacters.txt"
        );

    private string RetryPath => Path.Combine(_solutionRoot, ".work", "MissingGuildsToScan.txt");

    public GuildCharacterExportServiceTests()
    {
        Directory.CreateDirectory(GuildsDirectory);
    }

    public void Dispose()
    {
        if (Directory.Exists(_solutionRoot))
        {
            Directory.Delete(_solutionRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_RetriesTransientFailuresWithinTheRun()
    {
        await WriteGuildListAsync("Stable", "Flaky");
        var apiClient = new FakeGuildApiClient(
            new Dictionary<string, Queue<TauriApiResponseResult>>
            {
                ["Stable"] = Responses(Members("Alpha")),
                ["Flaky"] = Responses(
                    TauriApiResponseResult.Failure("Request timed out."),
                    Members("Bravo")
                ),
            }
        );

        var result = await CreateService(apiClient).ExportAsync(false, CancellationToken.None);

        Assert.Equal(0, result.RetryGuildCount);
        Assert.Equal(
            ["Alpha-Evermoon", "Bravo-Evermoon"],
            await File.ReadAllLinesAsync(OutputPath)
        );
        Assert.Empty(await File.ReadAllLinesAsync(RetryPath));
    }

    [Fact]
    public async Task ExportAsync_WritesGuildsThatKeepFailingToTheRetryFile()
    {
        await WriteGuildListAsync("Stable", "Down");
        var apiClient = new FakeGuildApiClient(
            new Dictionary<string, Queue<TauriApiResponseResult>>
            {
                ["Stable"] = Responses(Members("Alpha")),
            }
        );

        var result = await CreateService(apiClient, retryRounds: 2)
            .ExportAsync(false, CancellationToken.None);

        Assert.Equal(1, result.RetryGuildCount);
        Assert.Equal(["Evermoon\tDown"], await File.ReadAllLinesAsync(RetryPath));
        Assert.Equal(3, apiClient.CallCount("Down"));
    }

    [Fact]
    public async Task ExportAsync_PrunesGuildsTheApiReportsAsNotFound()
    {
        var aliveGuilds = Enumerable.Range(1, 19).Select(i => $"Guild {i:00}").ToArray();
        await WriteGuildListAsync([.. aliveGuilds, "Disbanded"]);
        var responses = aliveGuilds.ToDictionary(
            guild => guild,
            guild => Responses(Members($"{guild} Member"))
        );
        responses["Disbanded"] = Responses(GuildNotFound());
        var apiClient = new FakeGuildApiClient(responses);

        var result = await CreateService(apiClient).ExportAsync(false, CancellationToken.None);

        Assert.Equal(1, result.DeadGuildCount);
        Assert.Equal(1, result.PrunedGuildCount);
        Assert.Equal(0, result.RetryGuildCount);
        Assert.Equal(1, apiClient.CallCount("Disbanded"));
        Assert.Equal(
            aliveGuilds,
            await File.ReadAllLinesAsync(Path.Combine(GuildsDirectory, "evermoon-guilds.txt"))
        );
    }

    [Fact]
    public async Task ExportAsync_KeepsGuildListsWhenTooManyGuildsAreReportedMissing()
    {
        await WriteGuildListAsync("One", "Two");
        var apiClient = new FakeGuildApiClient(
            new Dictionary<string, Queue<TauriApiResponseResult>>
            {
                ["One"] = Responses(GuildNotFound()),
                ["Two"] = Responses(GuildNotFound()),
            }
        );

        var result = await CreateService(apiClient).ExportAsync(false, CancellationToken.None);

        Assert.Equal(2, result.DeadGuildCount);
        Assert.Equal(0, result.PrunedGuildCount);
        Assert.Equal(
            ["One", "Two"],
            await File.ReadAllLinesAsync(Path.Combine(GuildsDirectory, "evermoon-guilds.txt"))
        );
    }

    [Fact]
    public async Task ExportAsync_RetryOnlyMergesIntoExistingCharacters()
    {
        await WriteGuildListAsync("Stable", "Flaky");
        Directory.CreateDirectory(Path.GetDirectoryName(OutputPath)!);
        await File.WriteAllLinesAsync(OutputPath, ["Alpha-Evermoon"]);
        Directory.CreateDirectory(Path.GetDirectoryName(RetryPath)!);
        await File.WriteAllLinesAsync(RetryPath, ["Evermoon\tFlaky"]);
        var apiClient = new FakeGuildApiClient(
            new Dictionary<string, Queue<TauriApiResponseResult>>
            {
                ["Flaky"] = Responses(Members("Bravo")),
            }
        );

        var result = await CreateService(apiClient).ExportAsync(true, CancellationToken.None);

        Assert.True(result.UsedRetryInput);
        Assert.Equal(1, result.GuildCount);
        Assert.Equal(0, apiClient.CallCount("Stable"));
        Assert.Equal(
            ["Alpha-Evermoon", "Bravo-Evermoon"],
            await File.ReadAllLinesAsync(OutputPath)
        );
    }

    [Fact]
    public async Task ExportAsync_FullScanIgnoresALeftoverRetryFile()
    {
        await WriteGuildListAsync("Stable");
        Directory.CreateDirectory(Path.GetDirectoryName(RetryPath)!);
        await File.WriteAllLinesAsync(RetryPath, ["Evermoon\tLeftover"]);
        var apiClient = new FakeGuildApiClient(
            new Dictionary<string, Queue<TauriApiResponseResult>>
            {
                ["Stable"] = Responses(Members("Alpha")),
            }
        );

        var result = await CreateService(apiClient).ExportAsync(false, CancellationToken.None);

        Assert.False(result.UsedRetryInput);
        Assert.Equal(0, apiClient.CallCount("Leftover"));
        Assert.Equal(["Alpha-Evermoon"], await File.ReadAllLinesAsync(OutputPath));
        Assert.Empty(await File.ReadAllLinesAsync(RetryPath));
    }

    private GuildCharacterExportService CreateService(
        ITauriApiClient apiClient,
        int retryRounds = 3
    ) =>
        new(
            _solutionRoot,
            new TauriApiOptions { MaxConcurrentRequests = 2 },
            apiClient,
            retryRounds,
            TimeSpan.Zero
        );

    private Task WriteGuildListAsync(params string[] guildNames) =>
        File.WriteAllLinesAsync(Path.Combine(GuildsDirectory, "evermoon-guilds.txt"), guildNames);

    private static Queue<TauriApiResponseResult> Responses(
        params TauriApiResponseResult[] responses
    ) => new(responses);

    private static TauriApiResponseResult Members(params string[] names)
    {
        var guildList = names
            .Select((name, index) => (name, index))
            .ToDictionary(
                member => member.index.ToString(),
                member => new { name = member.name, level = 90 }
            );
        return TauriApiResponseResult.Success(JsonSerializer.SerializeToElement(new { guildList }));
    }

    private static TauriApiResponseResult GuildNotFound() =>
        TauriApiResponseResult.Failure(
            "API returned 400 Bad Request (error 13: guild not found)",
            TauriApiResponseResult.GuildNotFoundErrorCode
        );

    /// <summary>
    /// Serves queued responses per guild name; the last response repeats once the queue is
    /// down to it, and unknown guilds fail as if the request timed out.
    /// </summary>
    private sealed class FakeGuildApiClient(
        IReadOnlyDictionary<string, Queue<TauriApiResponseResult>> responses
    ) : ITauriApiClient
    {
        private readonly ConcurrentDictionary<string, int> _callCounts = new();

        public int CallCount(string guildName) => _callCounts.GetValueOrDefault(guildName);

        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            Assert.Equal("guild-info", endpoint);

            var guildName = JsonSerializer
                .SerializeToElement(parameters)
                .GetProperty("gn")
                .GetString()!;
            _callCounts.AddOrUpdate(guildName, 1, (_, count) => count + 1);

            if (!responses.TryGetValue(guildName, out var queue))
            {
                return Task.FromResult(TauriApiResponseResult.Failure("Request timed out."));
            }

            lock (queue)
            {
                return Task.FromResult(queue.Count > 1 ? queue.Dequeue() : queue.Peek());
            }
        }
    }
}
