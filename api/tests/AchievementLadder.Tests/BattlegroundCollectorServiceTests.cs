using System.Text.Json;
using BattlegroundCollector;
using Tauri.Core.Infrastructure;

namespace AchievementLadder.Tests;

public sealed class BattlegroundCollectorServiceTests
{
    [Fact]
    public async Task ExecuteAsync_AppendsOnlyNewRankedFullResponses()
    {
        var testRoot = Path.Combine(
            Path.GetTempPath(),
            $"battleground-collector-tests-{Guid.NewGuid():N}"
        );
        var projectRoot = Path.Combine(testRoot, "BattlegroundCollector");
        var frontendSrc = Path.Combine(testRoot, "frontend", "src");
        Directory.CreateDirectory(projectRoot);
        Directory.CreateDirectory(frontendSrc);

        try
        {
            var ratedOutputPath = Path.Combine(frontendSrc, "rated-battlegrounds.json");
            await File.WriteAllTextAsync(
                ratedOutputPath,
                """
                [
                  {
                    "matchid": 100,
                    "isranked": true,
                    "sentinel": "existing"
                  }
                ]
                """
            );

            var apiClient = new MatchSequenceApiClient(
                new Dictionary<int, TauriApiResponseResult>
                {
                    [100] = Success(MatchJson(100, "Warsong Gulch", isRanked: true, "duplicate")),
                    [101] = Success(MatchJson(101, "Warsong Gulch", isRanked: false, "unranked")),
                    [102] = Success(
                        MatchJson(102, "Warsong Gulch", isRanked: true, "complete-response")
                    ),
                    [103] = Success(
                        MatchJson(103, "Blade's Edge Arena", isRanked: true, "rated-arena")
                    ),
                }
            );
            var collector = new BattlegroundCollectorService(
                projectRoot,
                testRoot,
                frontendSrc,
                apiClient
            );
            var options = new BattlegroundCollectorOptions(
                100,
                "[EN] Evermoon",
                "Evermoon",
                null,
                null
            );

            var result = await collector.ExecuteAsync(options, CancellationToken.None);

            Assert.Equal(1, result.NewRatedBattlegroundCount);
            Assert.Equal(2, result.TotalRatedBattlegroundCount);
            Assert.Equal(ratedOutputPath, result.RatedOutputPath);

            using var output = JsonDocument.Parse(await File.ReadAllTextAsync(ratedOutputPath));
            var matches = output.RootElement.EnumerateArray().ToList();
            Assert.Equal(
                [100, 102],
                matches.Select(match => match.GetProperty("matchid").GetInt32())
            );
            Assert.Equal("existing", matches[0].GetProperty("sentinel").GetString());
            Assert.Equal("complete-response", matches[1].GetProperty("sentinel").GetString());
            Assert.True(matches[1].GetProperty("nested").GetProperty("preserved").GetBoolean());
        }
        finally
        {
            if (Directory.Exists(testRoot))
            {
                Directory.Delete(testRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task ExecuteAsync_CountsEachRated2v2GameOfTheSeasonOnce()
    {
        var testRoot = Path.Combine(
            Path.GetTempPath(),
            $"battleground-collector-tests-{Guid.NewGuid():N}"
        );
        var projectRoot = Path.Combine(testRoot, "BattlegroundCollector");
        var frontendSrc = Path.Combine(testRoot, "frontend", "src");
        Directory.CreateDirectory(projectRoot);
        Directory.CreateDirectory(frontendSrc);

        try
        {
            var seasonStart = RatedArenaGameCounter.SeasonStart.ToUnixTimeSeconds();
            var apiClient = new MatchSequenceApiClient(
                new Dictionary<int, TauriApiResponseResult>
                {
                    // "winner" names the losing side: Ann and Bob (side 0) win.
                    [200] = Success(
                        ArenaJson(
                            200,
                            bracketType: 2,
                            isRanked: true,
                            seasonStart + 60,
                            "Ann",
                            winner: 1,
                            side0: (1500, 12),
                            side1: (1600, -12)
                        )
                    ),
                    // Rated 3v3 and skirmishes are bracket type 3.
                    [201] = Success(
                        ArenaJson(201, bracketType: 3, isRanked: true, seasonStart + 120, "Ann")
                    ),
                    [202] = Success(
                        ArenaJson(202, bracketType: 3, isRanked: false, seasonStart + 180, "Ann")
                    ),
                    [203] = Success(
                        ArenaJson(203, bracketType: 2, isRanked: true, seasonStart - 60, "Ann")
                    ),
                    // Ann renamed to Anna between games; the guid ties both names together.
                    // No winner recorded: the side that gained rating won.
                    [204] = Success(
                        ArenaJson(
                            204,
                            bracketType: 2,
                            isRanked: true,
                            seasonStart + 240,
                            "Anna",
                            winner: 2,
                            side0: (1512, 20),
                            side1: (1588, 0)
                        )
                    ),
                }
            );
            var collector = new BattlegroundCollectorService(
                projectRoot,
                testRoot,
                frontendSrc,
                apiClient
            );
            var options = new BattlegroundCollectorOptions(
                200,
                "[EN] Evermoon",
                "Evermoon",
                null,
                null
            );

            var firstRun = await collector.ExecuteAsync(options, CancellationToken.None);
            var rerun = await collector.ExecuteAsync(options, CancellationToken.None);

            Assert.Equal(2, firstRun.NewRatedArenaGameCount);
            Assert.Equal(0, rerun.NewRatedArenaGameCount);
            Assert.Equal(2, rerun.TotalRatedArenaGameCount);

            using var output = JsonDocument.Parse(
                await File.ReadAllTextAsync(rerun.RatedArenaGamesPath)
            );
            Assert.Equal(204, output.RootElement.GetProperty("lastMatchId").GetInt32());
            Assert.Equal(2, output.RootElement.GetProperty("matchCount").GetInt32());
            var players = output
                .RootElement.GetProperty("players")
                .EnumerateArray()
                .Select(player =>
                    (
                        Name: player.GetProperty("name").GetString(),
                        Realm: player.GetProperty("realm").GetString(),
                        Games: player.GetProperty("games").GetInt32(),
                        Wins: player.GetProperty("wins").GetInt32(),
                        Losses: player.GetProperty("losses").GetInt32(),
                        Rating: player.GetProperty("rating").GetInt32()
                    )
                )
                .ToList();
            Assert.Equal(
                [
                    ("Anna", "Evermoon", 2, 2, 0, 1532),
                    ("Bob", "Tauri", 2, 2, 0, 1532),
                    ("Cid", "WoD", 2, 0, 2, 1588),
                ],
                players
            );
        }
        finally
        {
            if (Directory.Exists(testRoot))
            {
                Directory.Delete(testRoot, recursive: true);
            }
        }
    }

    // A two-a-side arena game: the first player and Bob are side 0, Cid and a deleted character
    // without a name side 1. Each side is given its rating going in and its change.
    private static string ArenaJson(
        int matchId,
        int bracketType,
        bool isRanked,
        long startTime,
        string firstName,
        int winner = 1,
        (int Rating, int Change) side0 = default,
        (int Rating, int Change) side1 = default
    ) =>
        $$"""
            {
              "matchid": {{matchId}},
              "mapname": "Nagrand Arena",
              "bgtype": {{bracketType}},
              "isranked": {{isRanked.ToString().ToLowerInvariant()}},
              "starttime": {{startTime}},
              "length": 120000,
              "winner": {{winner}},
              "members": [
                { "guid": 1, "realmName": "[EN] Evermoon", "side": 0, "personal_rating": {{side0.Rating}}, "personal_rating_change": {{side0.Change}}, "character-minimal-data": { "charname": "{{firstName}}", "class": 4 } },
                { "guid": 2, "realmName": "[HU] Tauri WoW Server", "side": 0, "personal_rating": {{side0.Rating}}, "personal_rating_change": {{side0.Change}}, "character-minimal-data": { "charname": "Bob", "class": 8 } },
                { "guid": 3, "realmName": "[HU] Warriors of Darkness", "side": 1, "personal_rating": {{side1.Rating}}, "personal_rating_change": {{side1.Change}}, "character-minimal-data": { "charname": "Cid", "class": 1 } },
                { "guid": 4, "realmName": "[EN] Evermoon", "side": 1, "personal_rating": {{side1.Rating}}, "personal_rating_change": {{side1.Change}}, "character-minimal-data": { "charname": "", "class": 5 } }
              ]
            }
            """;

    private static string MatchJson(int matchId, string mapName, bool isRanked, string sentinel) =>
        $$"""
            {
              "matchid": {{matchId}},
              "mapname": "{{mapName}}",
              "starttime": 1789700000,
              "length": 600000,
              "isranked": {{isRanked.ToString().ToLowerInvariant()}},
              "sentinel": "{{sentinel}}",
              "nested": { "preserved": true },
              "members": []
            }
            """;

    private static TauriApiResponseResult Success(string json) =>
        TauriApiResponseResult.Success(JsonDocument.Parse(json).RootElement.Clone());

    private sealed class MatchSequenceApiClient(
        IReadOnlyDictionary<int, TauriApiResponseResult> responses
    ) : ITauriApiClient
    {
        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            cancellationToken.ThrowIfCancellationRequested();
            Assert.Equal("pvp-match", endpoint);

            var parametersJson = JsonSerializer.SerializeToElement(parameters);
            var matchId = int.Parse(parametersJson.GetProperty("matchid").GetString()!);
            return Task.FromResult(
                responses.TryGetValue(matchId, out var response)
                    ? response
                    : TauriApiResponseResult.Failure("End of fake match sequence.")
            );
        }
    }
}
