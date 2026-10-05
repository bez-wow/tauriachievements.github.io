using System.Text.Json;
using MythicPlusExporter;
using Tauri.Core.Infrastructure;

namespace AchievementLadder.Tests;

public sealed class MythicPlusExportServiceTests
{
    internal const string Evermoon = "[EN] Evermoon";
    internal const string WoD = "[HU] Warriors of Darkness";

    [Theory]
    [InlineData(18, 1_245_000, 1440, 186.7)] // timed, 86% of the timer
    [InlineData(16, 982_000, 1440, 174.0)] // timed, 68%
    [InlineData(16, 1_440_000, 1440, 170.0)] // exactly on the timer still counts as timed
    [InlineData(16, 2_950_000, 2700, 160.6)] // 9% over: scored as a +15, minus the overrun
    [InlineData(2, 9_000_000, 1440, 0.0)] // far over time never goes negative
    public void Score_RewardsLevelFirstAndTimeSecond(
        int keyLevel,
        long clearTimeMilliseconds,
        int timerSeconds,
        double expected
    )
    {
        Assert.Equal(
            expected,
            MythicPlusScore.Calculate(keyLevel, clearTimeMilliseconds, timerSeconds)
        );
    }

    // The worked examples on /mythic-plus/scoring (spa mythic-plus-scoring-page.component.html).
    // If the formula changes, update that page too.
    [Theory]
    [InlineData(20, 1_837_000, 2340, 202.7)] // BRH +20 in 30:37
    [InlineData(20, 1_623_000, 1800, 201.2)] // COS +20 in 27:03
    [InlineData(18, 1_860_000, 2100, 186.4)] // EOA +18 in 31:00
    [InlineData(18, 1_980_000, 2100, 185.7)] // EOA +18 in 33:00
    [InlineData(17, 1_530_000, 1440, 168.8)] // MOS +17 in 25:30, over time
    [InlineData(20, 2_460_000, 2340, 191.5)] // BRH +20 in 41:00, over time
    [InlineData(19, 2_339_000, 2340, 192.5)] // BRH +19 with one second to spare
    [InlineData(19, 1_404_000, 2340, 197.5)] // BRH +19 at 60% of the timer
    public void Score_MatchesTheScoringPageExamples(
        int keyLevel,
        long clearTimeMilliseconds,
        int timerSeconds,
        double expected
    )
    {
        Assert.Equal(
            expected,
            MythicPlusScore.Calculate(keyLevel, clearTimeMilliseconds, timerSeconds)
        );
    }

    [Fact]
    public void ParseLeaderboard_DropsEmptyAffixSlotsAndUnknownCharacters()
    {
        var response = Parse(
            LeaderboardJson(
                Run(
                    9,
                    1_500_000,
                    100,
                    affixIds: [7, 0, 0],
                    Member("Pashao", Evermoon, 12, "Vengeance", 0, "Хранители Вечности"),
                    "{}",
                    Member("Swag", "[HU] Tauri WoW Server", 3, "Marksmanship", 2, "")
                )
            )
        );

        var run = Assert.Single(ChallengeResponseParser.ParseLeaderboard(response));

        var affix = Assert.Single(run.Affixes);
        Assert.Equal((7, 4), (affix.Id, affix.Level));
        Assert.Collection(
            run.Members,
            tank =>
            {
                Assert.Equal(("Pashao", "Evermoon", "tank"), (tank.Name, tank.Realm, tank.Role));
                Assert.Equal("Хранители Вечности", tank.Guild);
            },
            dps => Assert.Equal(("Swag", "Tauri", "dps"), (dps.Name, dps.Realm, dps.Role))
        );
    }

    [Fact]
    public async Task ExportAsync_MergesRealmLeaderboardsIntoRankedDungeonFiles()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            File.WriteAllText(Path.Combine(outputDirectory, "old-dungeon.json"), "{}");

            var shared = Run(
                15,
                2_000_000,
                300,
                [8, 3, 10],
                Member("Alpha", Evermoon, 6, "Blood", 0, "Outlaws"),
                Member("Beta", Evermoon, 2, "Holy", 1, "")
            );
            var apiClient = new FakeChallengeApiClient(
                IndexJson(),
                new()
                {
                    [(Evermoon, 200)] = LeaderboardJson(
                        Run(
                            14,
                            1_500_000,
                            200,
                            [8, 3, 10],
                            Member("Gamma", Evermoon, 10, "Windwalker", 2, "")
                        ),
                        shared
                    ),
                    // The same run listed on a second leaderboard is kept once.
                    [(WoD, 200)] = LeaderboardJson(shared),
                    [(Evermoon, 197)] = LeaderboardJson(
                        Run(
                            10,
                            2_500_000,
                            100,
                            [5, 0, 0],
                            Member("Alpha", Evermoon, 6, "Blood", 0, "Outlaws")
                        )
                    ),
                    [(WoD, 197)] = LeaderboardJson(),
                    [(Evermoon, 239)] = LeaderboardJson(),
                    [(WoD, 239)] = LeaderboardJson(),
                }
            );
            var service = new MythicPlusExportService(outputDirectory, apiClient);

            var result = await service.ExportAsync(
                new MythicPlusExporterOptions([Evermoon, WoD], AllowShrink: false),
                CancellationToken.None
            );

            Assert.Equal(1, result.Dataset.DuplicateRunCount);
            Assert.Equal(3, result.Dataset.RunCount);
            Assert.Equal(
                ["eoa.json", "hov.json", "index.json"],
                Directory
                    .EnumerateFiles(outputDirectory)
                    .Select(Path.GetFileName)
                    .Order(StringComparer.Ordinal)
            );

            using var index = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "index.json"))
            );
            var root = index.RootElement;
            // Seat of the Triumvirate has no runs, so it gets no tile.
            Assert.Equal(
                ["eoa", "hov"],
                root.GetProperty("dungeons")
                    .EnumerateArray()
                    .Select(dungeon => dungeon.GetProperty("id").GetString())
            );
            Assert.Equal(
                ["Alpha", "Beta", "Gamma"],
                root.GetProperty("players").EnumerateArray().Select(player => player[0].GetString())
            );
            Assert.Equal(
                [5, 8, 3, 10],
                root.GetProperty("affixes")
                    .EnumerateArray()
                    .Select(affix => affix.GetProperty("id").GetInt32())
            );

            using var hov = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "hov.json"))
            );
            var runs = hov.RootElement.GetProperty("runs").EnumerateArray().ToList();
            Assert.Equal([15, 14], runs.Select(run => run[0].GetInt32()));
            Assert.Equal(0, runs[0][5][0][0].GetInt32()); // Alpha, the first player
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_WritesNothingWhenALeaderboardFails()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var apiClient = new FakeChallengeApiClient(
                IndexJson(),
                new()
                {
                    [(Evermoon, 197)] = LeaderboardJson(),
                    [(Evermoon, 239)] = LeaderboardJson(),
                }
            );
            var service = new MythicPlusExportService(outputDirectory, apiClient);

            var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                service.ExportAsync(
                    new MythicPlusExporterOptions([Evermoon], AllowShrink: false),
                    CancellationToken.None
                )
            );

            Assert.Contains("Halls of Valor", error.Message);
            Assert.Empty(Directory.EnumerateFiles(outputDirectory));
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_RefusesToPublishAShrunkenLeaderboardUnlessAllowed()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var previousIndex = """{"dungeons":[{"id":"hov","runCount":100}]}""";
            var indexPath = Path.Combine(outputDirectory, "index.json");
            File.WriteAllText(indexPath, previousIndex);

            var apiClient = new FakeChallengeApiClient(
                IndexJson(),
                new()
                {
                    [(Evermoon, 197)] = LeaderboardJson(),
                    [(Evermoon, 200)] = LeaderboardJson(
                        Run(10, 1_000_000, 1, [], Member("Alpha", Evermoon, 6, "Blood", 0, ""))
                    ),
                    [(Evermoon, 239)] = LeaderboardJson(),
                }
            );
            var service = new MythicPlusExportService(outputDirectory, apiClient);

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                service.ExportAsync(
                    new MythicPlusExporterOptions([Evermoon], AllowShrink: false),
                    CancellationToken.None
                )
            );
            Assert.Equal(previousIndex, File.ReadAllText(indexPath));

            var result = await service.ExportAsync(
                new MythicPlusExporterOptions([Evermoon], AllowShrink: true),
                CancellationToken.None
            );
            Assert.Equal((100, 1), (result.PreviousRunCount, result.Dataset.RunCount));
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    internal static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mythic-plus-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    internal static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement.Clone();

    internal static string IndexJson() =>
        """
            {
              "dataUrlPrefix": "legion-",
              "challengemodemaps": {
                "239": { "challengeid": 239, "challengemapname": "Seat of the Triumvirate", "bronzemedaltime": 2100 },
                "200": { "challengeid": 200, "challengemapname": "Halls of Valor", "bronzemedaltime": 2700 },
                "197": { "challengeid": 197, "challengemapname": "Eye of Azshara", "bronzemedaltime": 2100 }
              }
            }
            """;

    internal static string LeaderboardJson(params string[] runs) =>
        $$"""{ "challengesdata": [{{string.Join(",", runs)}}] }""";

    internal static string Run(
        int level,
        long clearTimeMilliseconds,
        long completedAt,
        int[] affixIds,
        params string[] members
    ) =>
        $$"""
            {
              "completiontime": {{clearTimeMilliseconds}},
              "completedtime": {{completedAt}},
              "level": {{level}},
              "affixes": [{{string.Join(
                ",",
                affixIds.Select(id =>
                    $$"""{ "id": {{id}}, "name": "Affix {{id}}", "description": "", "icon": "icon_{{id}}" }"""
                )
            )}}],
              "players": [{{string.Join(",", members)}}]
            }
            """;

    internal static string Member(
        string name,
        string realm,
        int classId,
        string spec,
        int role,
        string guild
    ) =>
        $$"""
            {
              "specializationid": 1,
              "specializationrole": {{role}},
              "specializationname": "{{spec}}",
              "playerinfo": {
                "charname": "{{name}}", "realm": "{{realm}}", "guildname": "{{guild}}",
                "class": {{classId}}, "race": 1, "gender": 0
              }
            }
            """;

    internal sealed class FakeChallengeApiClient(
        string indexJson,
        Dictionary<(string Realm, int ChallengeId), string> leaderboards
    ) : ITauriApiClient
    {
        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            var request = JsonSerializer.SerializeToElement(parameters);
            var realm = request.GetProperty("r").GetString()!;

            if (endpoint == "challenge-index")
            {
                return Task.FromResult(TauriApiResponseResult.Success(Parse(indexJson)));
            }

            Assert.Equal("challenge-leaderboard", endpoint);
            var challengeId = request.GetProperty("id").GetInt32();
            return Task.FromResult(
                leaderboards.TryGetValue((realm, challengeId), out var json)
                    ? TauriApiResponseResult.Success(Parse(json))
                    : TauriApiResponseResult.Failure("No fake leaderboard.")
            );
        }
    }
}
