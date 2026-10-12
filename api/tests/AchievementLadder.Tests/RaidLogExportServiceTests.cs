using System.Collections.Concurrent;
using System.Text.Json;
using RaidLogExporter;
using Tauri.Core.Infrastructure;

namespace AchievementLadder.Tests;

public sealed class RaidLogExportServiceTests
{
    private const string Tauri = "[HU] Tauri WoW Server";
    private const string Evermoon = "[EN] Evermoon";
    private const string WoD = "[HU] Warriors of Darkness";

    private const int Nythendra = 1853;
    private const int Xavius = 1864;
    private const int Normal = 14;
    private const int Heroic = 15;
    private const int Mythic = 16;

    private const int EvermoonRealmId = 9;
    private const int WoDRealmId = 11;
    private const int TauriRealmId = 12;

    [Theory]
    [InlineData("r=[HU] Tauri WoW Server&amp;n=M#27479630", "Tauri", "Tauri")]
    [InlineData("r=[EN] Evermoon&n=Sósa", "Tauri", "Evermoon")]
    [InlineData("", "Tauri", "Evermoon")] // Evermoon raiders come unlinked on Tauri logs
    [InlineData("", "WoD", "WoD")]
    [InlineData("r=[HU] Warriors of Darkness&amp;n=Pala", "WoD", "WoD")]
    public void MemberRealm_FollowsTheLinkElseTheRealmSharingTauriLogs(
        string link,
        string logRealm,
        string expected
    )
    {
        Assert.Equal(expected, RaidLogResponseParser.MemberRealm(link, logRealm));
    }

    [Fact]
    public void ParseLog_ReadsMembersLootAndDropsAnotherRealmsGuildName()
    {
        var listed = new ListedRaidLog(new RaidLogKey("Tauri", 501), Tauri, Nythendra, Heroic);
        var response = Parse(
            LogJson(
                501,
                Nythendra,
                Heroic,
                killedAt: 1_790_000_000,
                fightMs: 200_000,
                guild: (7440, EvermoonRealmId, "Knights Of Paradise", 0),
                items: [139236, 139197],
                Member("Tank", "", classId: 12, specId: 581, race: 10),
                Member(
                    "Healer",
                    "r=[HU] Tauri WoW Server&amp;n=Healer",
                    2,
                    65,
                    race: 10,
                    guild: "Outlaws"
                ),
                // A Druid logged with a Paladin spec keeps its numbers but loses the spec.
                Member("Oddity", "", classId: 11, specId: 70, race: 4)
            )
        );

        var log = RaidLogResponseParser.ParseLog(response, listed);

        Assert.NotNull(log);
        Assert.Equal((1_790_000_000L, 200_000L), (log.KilledAt, log.FightMilliseconds));
        // The API named Tauri's guild 7440; the guild is Evermoon's 7440, so no name is kept.
        Assert.Equal(new RaidGuild(7440, "", "Evermoon", RaidCatalog.Horde), log.Guild);
        Assert.Equal(RaidCatalog.Horde, log.Faction);
        Assert.Equal([139236, 139197], log.Items);
        Assert.Collection(
            log.Members,
            tank => Assert.Equal(("Tank", "Evermoon", 581), (tank.Name, tank.Realm, tank.SpecId)),
            healer =>
            {
                Assert.Equal(
                    ("Healer", "Tauri", "Outlaws"),
                    (healer.Name, healer.Realm, healer.Guild)
                );
                Assert.Equal(
                    (1_000L, 4_000_000L, 500_000L),
                    (healer.DamageDone, healer.HealingDone, healer.AbsorbDone)
                );
            },
            oddity => Assert.Equal((11, 0), (oddity.ClassId, oddity.SpecId))
        );
    }

    [Fact]
    public void ParseLog_KeepsTheNameOfAGuildOfTheLogsOwnRealm()
    {
        var listed = new ListedRaidLog(new RaidLogKey("Tauri", 7), Tauri, Xavius, Mythic);
        var response = Parse(
            LogJson(
                7,
                Xavius,
                Mythic,
                1,
                300_000,
                (602, TauriRealmId, "Outlaws", 0),
                [],
                Member("A", "", 1, 71)
            )
        );

        var log = RaidLogResponseParser.ParseLog(response, listed);

        Assert.Equal(new RaidGuild(602, "Outlaws", "Tauri", RaidCatalog.Alliance), log!.Guild);
    }

    [Fact]
    public void ParseLog_RejectsDetailsOfAnotherKill()
    {
        var listed = new ListedRaidLog(new RaidLogKey("Tauri", 7), Tauri, Xavius, Mythic);

        Assert.Null(
            RaidLogResponseParser.ParseLog(
                Parse(LogJson(7, Xavius, Heroic, 1, 1, null, [], Member("A", "", 1, 71))),
                listed
            )
        );
    }

    [Fact]
    public void ParseTooltipXml_ReadsNameQualityAndIcon()
    {
        var item = TauriShootItemSource.ParseTooltipXml(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <wowhead><item id="139236"><name><![CDATA[Grubby Silver Ring]]></name>
            <quality id="4">Unknown</quality><icon displayId="1">
              inv_70_raid_ring1b
            </icon></item></wowhead>
            """,
            139236
        );

        Assert.Equal(new RaidItem(139236, "Grubby Silver Ring", 4, "inv_70_raid_ring1b"), item);
    }

    [Fact]
    public async Task ExportAsync_WritesBossFilesAndAnIndexOfEveryKill()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            File.WriteAllText(Path.Combine(outputDirectory, "old-boss-heroic.json"), "{}");
            var api = new FakeRaidApiClient();
            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 101];
            api.Rankings[(Tauri, Xavius, Mythic)] = [102];
            api.Rankings[(WoD, Nythendra, Normal)] = [100]; // WoD's log ids are its own
            api.Logs[(Tauri, 100)] = LogJson(
                100,
                Nythendra,
                Heroic,
                1_790_000_000,
                100_000,
                (7440, EvermoonRealmId, "Knights Of Paradise", 0),
                [139236],
                Member("Mage", "", 8, 63, race: 10, damage: 60_000_000),
                Member("Priest", "", 5, 256, race: 10, heal: 30_000_000, absorb: 10_000_000)
            );
            api.Logs[(Tauri, 101)] = LogJson(
                101,
                Nythendra,
                Heroic,
                1_790_100_000,
                200_000,
                null,
                [],
                Member("Mage", "", 8, 63, race: 10, damage: 140_000_000),
                Member(
                    "Warrior",
                    "r=[HU] Tauri WoW Server&amp;n=Warrior",
                    1,
                    71,
                    race: 1,
                    damage: 90_000_000
                )
            );
            api.Logs[(Tauri, 102)] = LogJson(
                102,
                Xavius,
                Mythic,
                1_790_200_000,
                300_000,
                (602, TauriRealmId, "Outlaws", 0),
                [],
                Member("Warrior", "r=[HU] Tauri WoW Server&amp;n=Warrior", 1, 71, race: 1)
            );
            api.Logs[(WoD, 100)] = LogJson(
                100,
                Nythendra,
                Normal,
                1_790_050_000,
                250_000,
                (22361, WoDRealmId, "Mythic", 1),
                [],
                Member("Hunter", "r=[HU] Warriors of Darkness&amp;n=Hunter", 3, 254)
            );
            // Players.csv knows the mage's current guild; guild-info confirms it is guild 7440.
            api.Guilds[(Evermoon, "Competence Optional")] = GuildInfoJson(
                7440,
                "Competence Optional",
                1
            );
            var directory = new PlayerGuildDirectory(
                new() { [("Evermoon", "Mage")] = "Competence Optional" }
            );
            var service = new RaidLogExportService(
                outputDirectory,
                api,
                new FakeItemSource(),
                directory,
                new FixedTimeProvider(
                    new DateTimeOffset(2026, 10, 12, 18, 0, 0, TimeSpan.FromHours(2))
                )
            );

            var result = await service.ExportAsync(Options(), CancellationToken.None);

            Assert.Equal(4, result.Dataset.Logs.Count);
            Assert.Equal(
                [
                    "index.json",
                    "nythendra-heroic.json",
                    "nythendra-normal.json",
                    "xavius-mythic.json",
                ],
                Directory
                    .EnumerateFiles(outputDirectory)
                    .Select(Path.GetFileName)
                    .Order(StringComparer.Ordinal)
            );

            using var index = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "index.json"))
            );
            var root = index.RootElement;
            Assert.Equal("2026-10-12T16:00:00Z", root.GetProperty("generatedAt").GetString());
            Assert.Equal(
                [0, 1, 2, 1],
                root.GetProperty("difficulties")
                    .EnumerateArray()
                    .Select(difficulty => difficulty.GetProperty("kills").GetInt32())
            );
            Assert.Equal(
                [
                    "Competence Optional|Evermoon|1|7440",
                    "Mythic|WoD|1|22361",
                    "Outlaws|Tauri|0|602",
                ],
                root.GetProperty("guilds")
                    .EnumerateArray()
                    .Select(guild =>
                        $"{guild[0].GetString()}|{guild[1].GetString()}|{guild[2].GetInt32()}|{guild[3].GetInt32()}"
                    )
            );
            // [realm, logId, boss, difficulty, killedAt, fightMs, guild, faction, wipes, deaths, members], oldest first.
            Assert.Equal(
                ["Tauri 100 0 15 0", "WoD 100 0 14 1", "Tauri 101 0 15 -1", "Tauri 102 6 16 2"],
                root.GetProperty("logs")
                    .EnumerateArray()
                    .Select(log =>
                        $"{log[0].GetString()} {log[1].GetInt32()} {log[2].GetInt32()} {log[3].GetInt32()} {log[6].GetInt32()}"
                    )
            );

            var heroic = root.GetProperty("top")
                .EnumerateArray()
                .Single(top => top.GetProperty("difficulty").GetString() == "heroic");
            // 140M over 200 s beats 60M over 100 s; the healer counts healing plus absorbs.
            Assert.Equal("Mage", heroic.GetProperty("dps")[0].GetString());
            Assert.Equal(700_000, heroic.GetProperty("dps")[4].GetInt64());
            Assert.Equal(101, heroic.GetProperty("dps")[6].GetInt32());
            Assert.Equal("Priest", heroic.GetProperty("hps")[0].GetString());
            Assert.Equal(400_000, heroic.GetProperty("hps")[4].GetInt64());
            Assert.Equal(
                [139236],
                root.GetProperty("items").EnumerateArray().Select(item => item[0].GetInt32())
            );

            using var boss = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "nythendra-heroic.json"))
            );
            var players = boss.RootElement.GetProperty("players").EnumerateArray().ToList();
            Assert.Equal(
                ["Mage|Evermoon|Competence Optional", "Priest|Evermoon|", "Warrior|Tauri|"],
                players.Select(player =>
                    $"{player[0].GetString()}|{player[1].GetString()}|{player[5].GetString()}"
                )
            );
            var logs = boss.RootElement.GetProperty("logs").EnumerateArray().ToList();
            Assert.Equal([100, 101], logs.Select(log => log[1].GetInt32()));
            Assert.Equal(0, logs[1][9][0][0].GetInt32()); // the mage, first seen in the older kill
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_OnlyReadsKillsTheLastExportDoesNotHave()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var api = new FakeRaidApiClient();
            api.Rankings[(Tauri, Nythendra, Heroic)] = [100];
            api.Logs[(Tauri, 100)] = LogJson(
                100,
                Nythendra,
                Heroic,
                10,
                100_000,
                (7440, EvermoonRealmId, "", 0),
                [5],
                Member("Mage", "", 8, 63)
            );
            api.Guilds[(Evermoon, "Competence Optional")] = GuildInfoJson(
                7440,
                "Competence Optional",
                1
            );
            var directory = new PlayerGuildDirectory(
                new() { [("Evermoon", "Mage")] = "Competence Optional" }
            );

            await Service(outputDirectory, api, directory)
                .ExportAsync(Options(), CancellationToken.None);
            var firstBossFile = File.ReadAllText(
                Path.Combine(outputDirectory, "nythendra-heroic.json")
            );

            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 103];
            api.Logs[(Tauri, 103)] = LogJson(
                103,
                Nythendra,
                Heroic,
                20,
                100_000,
                (7440, EvermoonRealmId, "", 0),
                [],
                Member("Mage", "", 8, 63)
            );
            api.Requests.Clear();

            var result = await Service(outputDirectory, api, directory)
                .ExportAsync(Options(), CancellationToken.None);

            Assert.Equal(1, result.PreviousLogCount);
            Assert.Equal(1, result.ReadLogCount);
            Assert.Equal(
                ["raid-log Tauri 103"],
                api.Requests.Where(request =>
                    !request.StartsWith("raid-rank", StringComparison.Ordinal)
                )
            );
            // The guild was confirmed last run and the item named: neither is asked again.
            Assert.All(
                result.Dataset.Logs,
                log => Assert.Equal("Competence Optional", log.Guild!.Name)
            );
            Assert.Equal("Item 5", Assert.Single(result.Dataset.Items).Name);

            // The older kill is written back unchanged, and the new one goes on a line after it.
            var secondBossFile = File.ReadAllText(
                Path.Combine(outputDirectory, "nythendra-heroic.json")
            );
            var olderKill = firstBossFile
                .Split('\n')
                .Single(line => line.StartsWith("[\"Tauri\",100,", StringComparison.Ordinal));
            Assert.Contains(
                olderKill[..^2] + ",\n[\"Tauri\",103,",
                secondBossFile,
                StringComparison.Ordinal
            );
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_LeavesAGuildUnnamedWhenNoCandidateHasItsId()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var api = new FakeRaidApiClient();
            api.Rankings[(Tauri, Nythendra, Heroic)] = [100];
            api.Logs[(Tauri, 100)] = LogJson(
                100,
                Nythendra,
                Heroic,
                10,
                100_000,
                (8489, EvermoonRealmId, "", 0),
                [],
                Member("Mage", "", 8, 63, race: 10)
            );
            // The raiders' current guild exists, but it is another guild than the one in the log.
            api.Guilds[(Evermoon, "Identity Unknown")] = GuildInfoJson(1234, "Identity Unknown", 0);
            var directory = new PlayerGuildDirectory(
                new() { [("Evermoon", "Mage")] = "Identity Unknown" }
            );

            var result = await Service(outputDirectory, api, directory)
                .ExportAsync(Options(), CancellationToken.None);

            Assert.Equal(
                new RaidGuild(8489, "", "Evermoon", RaidCatalog.Horde),
                Assert.Single(result.Dataset.Logs).Guild
            );
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_WritesNothingWhenARankingCannotBeRead()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var api = new FakeRaidApiClient { FailRankings = true };

            var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                    .ExportAsync(Options(), CancellationToken.None)
            );

            Assert.Contains("nothing was written", error.Message, StringComparison.Ordinal);
            Assert.Empty(Directory.EnumerateFiles(outputDirectory));
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_RefusesToPublishFarFewerKillsUnlessAllowed()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var api = new FakeRaidApiClient();
            var ids = Enumerable.Range(1, 10).ToList();
            api.Rankings[(Tauri, Nythendra, Normal)] = ids;
            foreach (var id in ids)
            {
                api.Logs[(Tauri, id)] = LogJson(
                    id,
                    Nythendra,
                    Normal,
                    id,
                    100_000,
                    null,
                    [],
                    Member("Mage", "", 8, 63)
                );
            }

            await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options(), CancellationToken.None);
            api.Rankings[(Tauri, Nythendra, Normal)] = ids[..5];

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                    .ExportAsync(Options(), CancellationToken.None)
            );
            var result = await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options() with { AllowShrink = true }, CancellationToken.None);

            Assert.Equal(5, result.Dataset.Logs.Count);
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public void PlayerGuildDirectory_ReadsTheLadderCsv()
    {
        var path = Path.Combine(Path.GetTempPath(), $"players-{Guid.NewGuid():N}.csv");
        try
        {
            File.WriteAllLines(
                path,
                [
                    "\"Name\",\"Race\",\"Gender\",\"Class\",\"Level\",\"Realm\",\"Guild\"",
                    "\"Larahh\",4,1,11,110,\"Tauri\",\"Outlaws\"",
                    "\"Sósa\",10,0,8,110,\"Evermoon\",\"Competence, Optional\"",
                    "\"Loner\",1,0,1,110,\"Evermoon\",\"\"",
                ]
            );

            var directory = PlayerGuildDirectory.Load(path);

            Assert.Equal(2, directory.Count);
            Assert.Equal("Outlaws", directory.Find("Tauri", "Larahh"));
            Assert.Equal("Competence, Optional", directory.Find("Evermoon", "Sósa"));
            Assert.Null(directory.Find("Evermoon", "Loner"));
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static RaidLogExporterOptions Options() =>
        new([Tauri, Evermoon, WoD], Full: false, AllowShrink: false);

    private static RaidLogExportService Service(
        string outputDirectory,
        FakeRaidApiClient api,
        PlayerGuildDirectory directory
    ) => new(outputDirectory, api, new FakeItemSource(), directory);

    private static string LogJson(
        int logId,
        int encounterId,
        int difficulty,
        long killedAt,
        long fightMs,
        (int Id, int RealmId, string Name, int Faction)? guild,
        int[] items,
        params string[] members
    )
    {
        var guildData =
            guild is { } value && value.Name.Length > 0
                ? $$"""{"name": "{{value.Name}}", "faction": {{value.Faction}}, "leadername": "x"}"""
                : "{}";
        return $$"""
            {
              "log_id": {{logId}}, "map_id": 1520, "difficulty": {{difficulty}}, "rid": 12,
              "guildid": {{guild?.Id ?? 0}}, "guildrid": {{guild?.RealmId ?? 0}},
              "guilddata": {{guildData}},
              "killtime": {{killedAt}}, "wipes": 1, "deahts_total": 2, "fight_time": {{fightMs}},
              "deaths_fight": 2, "resurrects_fight": 1, "encounter_id": {{encounterId}},
              "member_count": {{members.Length}},
              "members": [{{string.Join(",", members)}}],
              "item_count": {{items.Length}},
              "items": [{{string.Join(
                ",",
                items.Select(id => $$"""{"itemid": {{id}}, "count": 1}""")
            )}}]
            }
            """;
    }

    private static string Member(
        string name,
        string link,
        int classId,
        int specId,
        int race = 1,
        long damage = 1_000,
        long heal = 4_000_000,
        long absorb = 500_000,
        string guild = ""
    ) =>
        $$"""
            {
              "valid_player": {{(link.Length > 0 ? "true" : "false")}}, "name": "{{name}}",
              "link": "{{link}}", "guildName": "{{guild}}", "class": {{classId}}, "spec": {{specId}},
              "race": {{race}}, "gender": 0, "ilvl": 870, "dmg_done": {{damage}},
              "heal_done": {{heal}}, "absorb_done": {{absorb}}, "overheal": 7, "dmg_taken": 8,
              "interrupts": 1, "dispells": 2
            }
            """;

    private static string GuildInfoJson(int id, string name, int faction) =>
        $$"""{"guildid": {{id}}, "guildName": "{{name}}", "gFaction": {{faction}}, "guildList": {} }""";

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"raid-log-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private sealed class FakeRaidApiClient : ITauriApiClient
    {
        public Dictionary<
            (string Realm, int Encounter, int Difficulty),
            List<int>
        > Rankings { get; } = [];
        public Dictionary<(string Realm, int LogId), string> Logs { get; } = [];
        public Dictionary<(string Realm, string Name), string> Guilds { get; } = [];
        public ConcurrentQueue<string> Requests { get; } = new();
        public bool FailRankings { get; init; }

        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            var request = JsonSerializer.SerializeToElement(parameters);
            var realm = request.GetProperty("r").GetString()!;

            switch (endpoint)
            {
                case "raid-rank-encounter":
                {
                    var encounter = request.GetProperty("encounter").GetInt32();
                    var difficulty = request.GetProperty("difficulty").GetInt32();
                    Requests.Enqueue($"raid-rank {realm} {encounter} {difficulty}");
                    if (FailRankings)
                    {
                        return Task.FromResult(TauriApiResponseResult.Failure("Timed out."));
                    }

                    var ids = Rankings.GetValueOrDefault((realm, encounter, difficulty)) ?? [];
                    var logs = ids.Select(id =>
                        $$"""{"rank": 1, "log_id": {{id}}, "encounter_id": {{encounter}}, "difficulty": {{difficulty}} }"""
                    );
                    return Success($$"""{"logs": [{{string.Join(",", logs)}}]}""");
                }

                case "raid-log":
                {
                    var id = request.GetProperty("id").GetInt32();
                    Requests.Enqueue($"raid-log {RaidLogResponseParser.DisplayRealm(realm)} {id}");
                    return Logs.TryGetValue((realm, id), out var json)
                        ? Success(json)
                        : Task.FromResult(TauriApiResponseResult.Failure("No fake log."));
                }

                case "guild-info":
                {
                    var name = request.GetProperty("gn").GetString()!;
                    Requests.Enqueue($"guild-info {realm} {name}");
                    return Guilds.TryGetValue((realm, name), out var json)
                        ? Success(json)
                        : Task.FromResult(TauriApiResponseResult.Failure("guild not found", 13));
                }

                default:
                    throw new InvalidOperationException($"Unexpected endpoint {endpoint}.");
            }
        }

        private static Task<TauriApiResponseResult> Success(string json) =>
            Task.FromResult(TauriApiResponseResult.Success(Parse(json)));
    }

    private sealed class FakeItemSource : IRaidItemSource
    {
        public Task<RaidItem?> LoadAsync(int itemId, CancellationToken cancellationToken) =>
            Task.FromResult<RaidItem?>(new RaidItem(itemId, $"Item {itemId}", 4, "icon"));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();
    }
}
