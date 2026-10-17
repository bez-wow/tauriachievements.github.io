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
    public async Task ExecuteAsync_CountsEachRatedArenaGameOfTheSeasonOncePerBracket()
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
                    // Rated 3v3 and skirmishes are both bracket type 3; only the rated one counts.
                    // Cid's side (1) wins.
                    [201] = Success(
                        ArenaJson(
                            201,
                            bracketType: 3,
                            isRanked: true,
                            seasonStart + 120,
                            "Ann",
                            winner: 0,
                            side0: (1500, -15),
                            side1: (1450, 15)
                        )
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

            Assert.Equal(
                [("2v2", 2), ("3v3", 1)],
                firstRun.RatedArenaBrackets.Select(bracket =>
                    (bracket.Bracket, bracket.NewGameCount)
                )
            );
            Assert.Equal(
                [("2v2", 0, 2), ("3v3", 0, 1)],
                rerun.RatedArenaBrackets.Select(bracket =>
                    (bracket.Bracket, bracket.NewGameCount, bracket.TotalGameCount)
                )
            );

            var twos = await ReadArenaGamesAsync(rerun.RatedArenaBrackets[0].Path);
            Assert.Equal(
                "rated-2v2-arena-games.json",
                Path.GetFileName(rerun.RatedArenaBrackets[0].Path)
            );
            Assert.Equal(204, twos.LastMatchId);
            Assert.Equal(
                [
                    ("Anna", "Evermoon", 2, 2, 0, 1532),
                    ("Bob", "Tauri", 2, 2, 0, 1532),
                    ("Cid", "WoD", 2, 0, 2, 1588),
                ],
                twos.Players
            );

            var threes = await ReadArenaGamesAsync(rerun.RatedArenaBrackets[1].Path);
            Assert.Equal(
                "rated-3v3-arena-games.json",
                Path.GetFileName(rerun.RatedArenaBrackets[1].Path)
            );
            Assert.Equal(204, threes.LastMatchId);
            Assert.Equal(
                [
                    ("Ann", "Evermoon", 1, 0, 1, 1485),
                    ("Bob", "Tauri", 1, 0, 1, 1485),
                    ("Cid", "WoD", 1, 1, 0, 1465),
                ],
                threes.Players
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

    [Fact]
    public async Task ExecuteAsync_ResolvesArenaGuidAliasesAndPreservesUnknownMembers()
    {
        var testRoot = Path.Combine(
            Path.GetTempPath(),
            $"battleground-collector-tests-{Guid.NewGuid():N}"
        );
        var projectRoot = Path.Combine(testRoot, "BattlegroundCollector");
        var frontendSrc = Path.Combine(testRoot, "frontend", "src");
        var dataDirectory = Path.Combine(projectRoot, "Data");
        Directory.CreateDirectory(dataDirectory);
        Directory.CreateDirectory(frontendSrc);

        try
        {
            await File.WriteAllTextAsync(
                Path.Combine(dataDirectory, ArenaCharacterIdentityMap.FileName),
                """
                {
                  "aliases": [
                    {
                      "sourceGuid": 10,
                      "realm": "Evermoon",
                      "canonicalGuid": 20,
                      "canonicalRealm": "Evermoon",
                      "name": "Wuhji",
                      "class": 11
                    }
                  ]
                }
                """
            );

            var seasonStart = RatedArenaGameCounter.SeasonStart.ToUnixTimeSeconds();
            var apiClient = new MatchSequenceApiClient(
                new Dictionary<int, TauriApiResponseResult>
                {
                    // The historical GUID no longer resolves a name, but the alias recovers it.
                    [300] = Success(
                        ArenaJson(
                            300,
                            bracketType: 3,
                            isRanked: true,
                            seasonStart + 60,
                            "",
                            firstGuid: 10,
                            winner: 1,
                            side0: (1500, 12)
                        )
                    ),
                    [301] = Success(
                        ArenaJson(
                            301,
                            bracketType: 3,
                            isRanked: true,
                            seasonStart + 120,
                            "Wuhji",
                            firstGuid: 20,
                            winner: 0,
                            side0: (1512, -10)
                        )
                    ),
                    // Once known, the canonical GUID keeps counting when its name is blank too.
                    [302] = Success(
                        ArenaJson(
                            302,
                            bracketType: 3,
                            isRanked: true,
                            seasonStart + 180,
                            "",
                            firstGuid: 20,
                            winner: 1,
                            side0: (1502, 15)
                        )
                    ),
                    // A genuinely unknown GUID is retained for a later identity repair.
                    [303] = Success(
                        ArenaJson(
                            303,
                            bracketType: 3,
                            isRanked: true,
                            seasonStart + 240,
                            "",
                            firstGuid: 30,
                            winner: 1,
                            side0: (0, 96)
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

            var result = await collector.ExecuteAsync(
                new BattlegroundCollectorOptions(
                    300,
                    "[EN] Evermoon",
                    "Evermoon",
                    null,
                    null
                ),
                CancellationToken.None
            );

            var threesPath = result.RatedArenaBrackets.Single(bracket =>
                bracket.Bracket == "3v3"
            ).Path;
            using var output = JsonDocument.Parse(await File.ReadAllTextAsync(threesPath));
            var wuhji = output
                .RootElement.GetProperty("players")
                .EnumerateArray()
                .Single(player => player.GetProperty("name").GetString() == "Wuhji");
            Assert.Equal(20, wuhji.GetProperty("guid").GetInt32());
            Assert.Equal(3, wuhji.GetProperty("games").GetInt32());
            Assert.Equal(2, wuhji.GetProperty("wins").GetInt32());
            Assert.Equal(1, wuhji.GetProperty("losses").GetInt32());
            Assert.Equal(1517, wuhji.GetProperty("rating").GetInt32());

            var unresolved = output
                .RootElement.GetProperty("unresolvedPlayers")
                .EnumerateArray()
                .Single(player => player.GetProperty("guid").GetInt32() == 30);
            Assert.Equal(1, unresolved.GetProperty("games").GetInt32());
            Assert.Equal(1, unresolved.GetProperty("wins").GetInt32());
            Assert.Equal(0, unresolved.GetProperty("losses").GetInt32());
            Assert.Equal(96, unresolved.GetProperty("rating").GetInt32());
            Assert.Equal(303, unresolved.GetProperty("firstMatchId").GetInt32());
            Assert.Equal(303, unresolved.GetProperty("lastMatchId").GetInt32());

            // Adding an identity later repairs the saved unresolved aggregate on the next run;
            // the season's match API does not need to be scanned again.
            await File.WriteAllTextAsync(
                Path.Combine(dataDirectory, ArenaCharacterIdentityMap.FileName),
                """
                {
                  "aliases": [
                    {
                      "sourceGuid": 10,
                      "realm": "Evermoon",
                      "canonicalGuid": 20,
                      "canonicalRealm": "Evermoon",
                      "name": "Wuhji",
                      "class": 11
                    },
                    {
                      "sourceGuid": 30,
                      "realm": "Evermoon",
                      "canonicalGuid": 40,
                      "canonicalRealm": "Evermoon",
                      "name": "Recovered",
                      "class": 11
                    }
                  ]
                }
                """
            );
            await collector.ExecuteAsync(
                new BattlegroundCollectorOptions(
                    null,
                    "[EN] Evermoon",
                    "Evermoon",
                    null,
                    null
                ),
                CancellationToken.None
            );

            using var repairedOutput = JsonDocument.Parse(
                await File.ReadAllTextAsync(threesPath)
            );
            var recovered = repairedOutput
                .RootElement.GetProperty("players")
                .EnumerateArray()
                .Single(player => player.GetProperty("name").GetString() == "Recovered");
            Assert.Equal(40, recovered.GetProperty("guid").GetInt32());
            Assert.Equal(1, recovered.GetProperty("games").GetInt32());
            Assert.DoesNotContain(
                repairedOutput.RootElement.GetProperty("unresolvedPlayers").EnumerateArray(),
                player => player.GetProperty("guid").GetInt32() == 30
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

    private static async Task<(
        int LastMatchId,
        List<(string? Name, string? Realm, int Games, int Wins, int Losses, int Rating)> Players
    )> ReadArenaGamesAsync(string path)
    {
        using var output = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        var players = output
            .RootElement.GetProperty("players")
            .EnumerateArray()
            .Select(player =>
                (
                    player.GetProperty("name").GetString(),
                    player.GetProperty("realm").GetString(),
                    player.GetProperty("games").GetInt32(),
                    player.GetProperty("wins").GetInt32(),
                    player.GetProperty("losses").GetInt32(),
                    player.GetProperty("rating").GetInt32()
                )
            )
            .ToList();

        return (output.RootElement.GetProperty("lastMatchId").GetInt32(), players);
    }

    // An arena game: the first player and Bob are side 0, Cid and a deleted character
    // without a name side 1. Each side is given its rating going in and its change.
    private static string ArenaJson(
        int matchId,
        int bracketType,
        bool isRanked,
        long startTime,
        string firstName,
        int firstGuid = 1,
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
                { "guid": {{firstGuid}}, "realmName": "[EN] Evermoon", "side": 0, "personal_rating": {{side0.Rating}}, "personal_rating_change": {{side0.Change}}, "specid": 103, "character-minimal-data": { "charname": "{{firstName}}", "class": 4 } },
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
