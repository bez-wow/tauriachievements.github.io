using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    public void ParseLog_ReadsTalentColumnsAndTrinkets()
    {
        var listed = new ListedRaidLog(new RaidLogKey("Tauri", 7), Tauri, Xavius, Mythic);
        var response = Parse(
            LogJson(
                7,
                Xavius,
                Mythic,
                1,
                300_000,
                null,
                [],
                Member(
                    "Geared",
                    "",
                    1,
                    71,
                    talents: "Za!1212.12",
                    trinkets: [(127842, 835, "Infernal Alchemist Stone"), (133644, 860, "Memento")]
                ),
                Member("Bare", "", 1, 71)
            )
        );

        var log = RaidLogResponseParser.ParseLog(response, listed);

        var (geared, bare) = (log!.Members[0], log.Members[1]);
        Assert.Equal("1212.12", geared.Talents);
        Assert.Equal(
            [
                new RaidTrinket(127842, 835, "Infernal Alchemist Stone", 4, "inv_127842"),
                new RaidTrinket(133644, 860, "Memento", 4, "inv_133644"),
            ],
            geared.Trinkets
        );
        Assert.Equal(("", 0), (bare.Talents, bare.Trinkets.Count));
    }

    [Theory]
    [InlineData("Za!1212212", "1212212")]
    [InlineData("ba!0201120", "0201120")]
    [InlineData("XZ!00.....", "00.....")]
    [InlineData("", "")]
    [InlineData("Za!1213212", "")] // there is no fourth column
    [InlineData("Za!12122121", "")] // nor an eighth tier
    public void ParseTalents_KeepsTheColumnOfEachTier(string code, string expected)
    {
        Assert.Equal(expected, RaidLogResponseParser.ParseTalents(code));
    }

    [Fact]
    public void ParseFragment_PicksTheSpecsOwnTalentElseTheClassWideOne()
    {
        // TauriShoot's shape: tier 0's first choice differs per spec (an object keyed by spec),
        // its second is class-wide (spec "0"), its third is missing; the other tiers are class-wide.
        const string ownTier = """
            [
              {"71": {"tier": "0", "column": "0", "id": "202297", "name": "Dauntless", "icon": "dauntless", "spec": "71"},
               "72": {"tier": "0", "column": "0", "id": "215556", "name": "War Machine", "icon": "war_machine", "spec": "72"}},
              [{"tier": "0", "column": "1", "id": "7384", "name": "Overpower", "icon": "overpower", "spec": "0"}],
              []
            ]
            """;
        const string sharedTier = """
            [[{"tier": "1", "column": "0", "id": "46968", "name": "Shockwave", "icon": "shockwave", "spec": "0"}]]
            """;
        string Fragment(string firstTier, int tiers) =>
            $$"""{"talents": [{{string.Join(",", [firstTier, .. Enumerable.Repeat(sharedTier, tiers - 1)])}}]}""";

        var talents = TauriShootTalentSource.ParseFragment(Parse(Fragment(ownTier, 7)), [71, 72]);

        Assert.NotNull(talents);
        var (arms, fury) = (talents[0], talents[1]);
        Assert.Equal((71, 7), (arms.SpecId, arms.Tiers.Count));
        Assert.Equal(
            [
                new RaidTalent(202297, "Dauntless", "dauntless"),
                new RaidTalent(7384, "Overpower", "overpower"),
                null,
            ],
            arms.Tiers[0]
        );
        Assert.Equal("War Machine", fury.Tiers[0][0]!.Name);
        Assert.Equal(new RaidTalent(46968, "Shockwave", "shockwave"), fury.Tiers[6][0]);

        // A missing tier, or a tier with nothing for the spec, reads as no talents at all.
        Assert.Null(TauriShootTalentSource.ParseFragment(Parse(Fragment(ownTier, 6)), [71]));
        const string armsOnlyTier = """
            [{"71": {"id": "202297", "name": "Dauntless", "icon": "dauntless", "spec": "71"}}]
            """;
        Assert.Null(TauriShootTalentSource.ParseFragment(Parse(Fragment(armsOnlyTier, 7)), [72]));
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
    public void ParsePower_ReadsTheDetailsAndAPlainDescription()
    {
        var tooltip = TauriShootSpellTooltipSource.ParsePower(
            """
            $TauriPower.registerSpell(123986, 0,{icon: 'spell_arcane_arcanetorrent',tooltip_enus: '<table class=\"tooltip-t\"><tr><td><b>Chi Burst<\/b><br />40 yd range<br /><table width=\"100%\"><tr><td>1 sec cast<\/td><th>30 sec cooldown<\/th><\/tr><\/table><\/td><\/tr><\/table><table><tr><td><span class=\"q\">Hurls a torrent of Chi energy up to 40 yds forward, dealing 0 Nature damage to all enemies, and 0 healing to the Monk and all allies in its path.<\/span><\/td><\/tr><\/table>'}, "legion");
            """,
            123986
        );

        Assert.NotNull(tooltip);
        Assert.Equal(123986, tooltip.SpellId);
        Assert.Equal(["40 yd range", "1 sec cast", "30 sec cooldown"], tooltip.Details);
        Assert.Equal(
            "Hurls a torrent of Chi energy up to 40 yds forward, dealing Nature damage to all enemies, and healing to the Monk and all allies in its path.",
            tooltip.Description
        );
    }

    [Fact]
    public void ParsePower_KeepsParagraphsAndGivesAPassiveNoDetails()
    {
        var tooltip = TauriShootSpellTooltipSource.ParsePower(
            """
            $TauriPower.registerSpell(213313, 0,{icon: 'spell_nature_timestop',tooltip_enus: '<table class=\"tooltip-t\"><tr><td><b>Divine Intervention<\/b><br />Instant<\/td><\/tr><\/table><table><tr><td><span class=\"q\">Reduces your Divine Shield cooldown by -20%. In addition, any attack which would kill you instead reduces you to 20% of your maximum health and triggers Divine Shield.<br /><br />Cannot occur while Divine Shield is on cooldown or Forbearance is active. <\/span><\/td><\/tr><\/table>'}, "legion");
            """,
            213313
        );

        Assert.NotNull(tooltip);
        Assert.Empty(tooltip.Details);
        Assert.Equal(
            "Reduces your Divine Shield cooldown by 20%. In addition, any attack which would kill you instead reduces you to 20% of your maximum health and triggers Divine Shield.\n\nCannot occur while Divine Shield is on cooldown or Forbearance is active.",
            tooltip.Description
        );
    }

    [Fact]
    public void ParsePower_ReadsNothingForASpellTauriShootDoesNotKnow()
    {
        Assert.Null(
            TauriShootSpellTooltipSource.ParsePower(
                """$TauriPower.registerSpell(999999999, 0,{}, "legion");""",
                999999999
            )
        );
    }

    [Theory]
    [InlineData(
        """<table class="tooltip-t"><tr><td><b>Grimoire of Sacrifice</b><br /><table width="100%"><tr><td>1% of base mana<br /></td><th>40 yd range<br /></th></tr></table><table width="100%"><tr><td>Instant</td><th>30 sec cooldown</th></tr></table></td></tr></table><table><tr><td>""",
        "40 yd range|Instant|30 sec cooldown"
    )]
    [InlineData(
        """<table class="tooltip-t"><tr><td><b>Channel</b><br />40 yd range<br /><table width="100%"><tr><td>Channeled</td><th>2 min cooldown</th></tr></table></td></tr></table><table><tr><td>""",
        "40 yd range|Channeled|2 min cooldown"
    )]
    [InlineData(
        """<table class="tooltip-t"><tr><td><b>Disengage</b><br />Unlimited range<br /><table width="100%"><tr><td>Instant</td><th>1 sec cooldown</th></tr></table></td></tr></table><table><tr><td>""",
        ""
    )]
    [InlineData(
        """<table class="tooltip-t"><tr><td><b>Dauntless</b><br />Instant</td></tr></table><table><tr><td>""",
        ""
    )]
    public void ReadDetails_KeepsRangeCastAndCooldownButNoCostOrShortCooldown(
        string header,
        string expected
    )
    {
        Assert.Equal(expected, string.Join("|", TauriShootSpellTooltipSource.ReadDetails(header)));
    }

    [Theory]
    [InlineData(
        "Hurls your weapon at an enemy, causing 0 Physical damage and stunning for 5 sec.",
        "Hurls your weapon at an enemy, causing Physical damage and stunning for 5 sec."
    )]
    [InlineData(
        "A powerful shot which deals up to 1550 Physical damage to the target.",
        "A powerful shot which deals Physical damage to the target."
    )]
    [InlineData("Heals up to 6 allies for 0.", "Heals up to 6 allies.")]
    [InlineData(
        "Grants Critical Strike, Haste, or Mastery by 0 for 10 sec.",
        "Grants Critical Strike, Haste, or Mastery for 10 sec."
    )]
    [InlineData("Your abilities cost -10% less Rage.", "Your abilities cost 10% less Rage.")]
    [InlineData(
        "Mortal Strike and Execute hit 2 additional nearby targets.",
        "Mortal Strike and Execute hit 2 additional nearby targets."
    )]
    [InlineData("Abilities cost 0% less Energy while Stealth is active.", "")]
    [InlineData("Restores 25% health every 0 sec1 sec.", "")]
    [InlineData("Grants $192082s% increased movement speed for 5 sec.", "")]
    [InlineData("Reduces all damage you take by %.", "")]
    [InlineData("Heals the target and -1 injured allies.", "")]
    [InlineData("Increases your run speed by -15000% for 3 sec.", "")]
    [InlineData("Reduces the cooldown of Light of Dawn by -1.5.1 sec.", "")]
    public void CleanDescription_DropsStandInAmountsAndHidesUnresolvedOnes(
        string text,
        string expected
    )
    {
        Assert.Equal(expected, TauriShootSpellTooltipSource.CleanDescription(text));
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
                Member(
                    "Mage",
                    "",
                    8,
                    63,
                    race: 10,
                    damage: 60_000_000,
                    talents: "ea!2102121",
                    trinkets: [(1, 850, "Stone"), (2, 835, "Memento")]
                ),
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
                // A Titanforged copy of the same trinket is another entry in the table.
                Member(
                    "Mage",
                    "",
                    8,
                    63,
                    race: 10,
                    damage: 140_000_000,
                    trinkets: [(1, 860, "Stone")]
                ),
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
                new FakeTalentSource(),
                new FakeTooltipSource(),
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
                    "talent-tooltips.json",
                    "talents.json",
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

            // [id, itemLevel, name, quality, icon], in order of first appearance.
            Assert.Equal(
                ["1 850 Stone", "2 835 Memento", "1 860 Stone"],
                boss.RootElement.GetProperty("trinkets")
                    .EnumerateArray()
                    .Select(trinket =>
                        $"{trinket[0].GetInt32()} {trinket[1].GetInt32()} {trinket[2].GetString()}"
                    )
            );
            // A member ends [..., dispels, talents, [trinket, ...]].
            static string Loadout(JsonElement member) =>
                $"{member[10].GetString()} [{string.Join(",", member[11].EnumerateArray().Select(trinket => trinket.GetInt32()))}]";
            Assert.Equal("2102121 [0,1]", Loadout(logs[0][9][0]));
            Assert.Equal(" []", Loadout(logs[0][9][1])); // the priest's log has neither
            Assert.Equal(" [2]", Loadout(logs[1][9][0]));

            using var talents = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "talents.json"))
            );
            // [specId, tiers of [spellId, name, icon] choices, null where there is none].
            var arms = Assert.Single(talents.RootElement.GetProperty("specs").EnumerateArray());
            Assert.Equal(71, arms[0].GetInt32());
            Assert.Equal(7, arms[1].GetArrayLength());
            Assert.Equal(
                "1006 Talent 6",
                $"{arms[1][6][0][0].GetInt32()} {arms[1][6][0][1].GetString()}"
            );
            Assert.Equal(JsonValueKind.Null, arms[1][6][1].ValueKind);
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
                Member("Mage", "", 8, 63, talents: "ea!2102121", trinkets: [(1, 850, "Stone")])
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
    public async Task ExportAsync_ListsTheKillsAddedSinceTheLastExport()
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
                null,
                [],
                Member("Mage", "", 8, 63)
            );
            var directory = PlayerGuildDirectory.Empty;
            async Task<JsonElement> ExportAt(int hour, bool full = false)
            {
                await new RaidLogExportService(
                    outputDirectory,
                    api,
                    new FakeItemSource(),
                    new FakeTalentSource(),
                    new FakeTooltipSource(),
                    directory,
                    new FixedTimeProvider(
                        new DateTimeOffset(2026, 10, 12, hour, 0, 0, TimeSpan.Zero)
                    )
                ).ExportAsync(Options() with { Full = full }, CancellationToken.None);
                return Parse(File.ReadAllText(Path.Combine(outputDirectory, "index.json")));
            }
            static string[] NewLogs(JsonElement index) =>
                [
                    .. index
                        .GetProperty("newLogs")
                        .EnumerateArray()
                        .Select(key => $"{key[0].GetString()} {key[1].GetInt32()}"),
                ];

            // A first export has nothing to compare with.
            var first = await ExportAt(10);
            Assert.False(first.TryGetProperty("previousGeneratedAt", out _));
            Assert.False(first.TryGetProperty("newLogs", out _));

            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 103];
            api.Rankings[(WoD, Nythendra, Normal)] = [103];
            api.Logs[(Tauri, 103)] = LogJson(
                103,
                Nythendra,
                Heroic,
                30,
                100_000,
                null,
                [],
                Member("Mage", "", 8, 63)
            );
            api.Logs[(WoD, 103)] = LogJson(
                103,
                Nythendra,
                Normal,
                20,
                100_000,
                null,
                [],
                Member("Hunter", "", 3, 254)
            );
            var second = await ExportAt(12);
            Assert.Equal(
                "2026-10-12T10:00:00Z",
                second.GetProperty("previousGeneratedAt").GetString()
            );
            Assert.Equal(["WoD 103", "Tauri 103"], NewLogs(second)); // oldest first, as `logs`

            // Nothing new: the last export's changes stay, so a second run the same day keeps them.
            var rerun = await ExportAt(13);
            Assert.Equal("2026-10-12T13:00:00Z", rerun.GetProperty("generatedAt").GetString());
            Assert.Equal(
                "2026-10-12T10:00:00Z",
                rerun.GetProperty("previousGeneratedAt").GetString()
            );
            Assert.Equal(["WoD 103", "Tauri 103"], NewLogs(rerun));

            // --full reads every log again, but only the kill the files didn't have is new.
            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 103, 104];
            api.Logs[(Tauri, 104)] = LogJson(
                104,
                Nythendra,
                Heroic,
                40,
                100_000,
                null,
                [],
                Member("Mage", "", 8, 63)
            );
            var full = await ExportAt(14, full: true);
            Assert.Equal(
                "2026-10-12T13:00:00Z",
                full.GetProperty("previousGeneratedAt").GetString()
            );
            Assert.Equal(["Tauri 104"], NewLogs(full));
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_ReadsEveryLogAgainOverFilesOfAnOlderFormat()
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
                null,
                [5],
                Member("Mage", "", 8, 63, talents: "ea!2102121", trinkets: [(1, 850, "Stone")])
            );
            await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options(), CancellationToken.None);

            // Turn the files into version 1's: no trinket table, members end at their dispels.
            foreach (
                var path in new[] { "index.json", "nythendra-heroic.json" }.Select(name =>
                    Path.Combine(outputDirectory, name)
                )
            )
            {
                var file = JsonNode.Parse(File.ReadAllText(path))!.AsObject();
                file["version"] = 1;
                if (file.Remove("trinkets"))
                {
                    foreach (var log in file["logs"]!.AsArray())
                    {
                        foreach (var member in log![9]!.AsArray())
                        {
                            member!.AsArray().RemoveAt(11);
                            member.AsArray().RemoveAt(10);
                        }
                    }
                }
                File.WriteAllText(path, file.ToJsonString());
            }

            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 103];
            api.Logs[(Tauri, 103)] = LogJson(
                103,
                Nythendra,
                Heroic,
                20,
                100_000,
                null,
                [],
                Member("Mage", "", 8, 63)
            );
            api.Requests.Clear();

            var result = await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options(), CancellationToken.None);

            // Both logs are read again to get the talents and trinkets the old files lack...
            Assert.Equal(2, result.ReadLogCount);
            var mage = result.Dataset.Logs[0].Members[0];
            Assert.Equal(("2102121", 1), (mage.Talents, mage.Trinkets.Count));
            // ...but only the kill they didn't have is new, and the item isn't looked up again.
            using var index = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "index.json"))
            );
            Assert.Equal(
                RaidLogFileWriter.FormatVersion,
                index.RootElement.GetProperty("version").GetInt32()
            );
            Assert.Equal(
                [103],
                index
                    .RootElement.GetProperty("newLogs")
                    .EnumerateArray()
                    .Select(key => key[1].GetInt32())
            );
            Assert.Equal("Item 5", Assert.Single(result.Dataset.Items).Name);
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_GivesEachClassOfANameItsOwnPlayerRowAndMarksTheFormerOnes()
    {
        var outputDirectory = CreateTempDirectory();
        try
        {
            var api = new FakeRaidApiClient();
            api.Rankings[(Tauri, Nythendra, Heroic)] = [100];
            api.Rankings[(Tauri, Xavius, Mythic)] = [101];
            api.Logs[(Tauri, 100)] = LogJson(
                100,
                Nythendra,
                Heroic,
                10,
                100_000,
                null,
                [],
                Member("Deadsolf", "", 10, 269, race: 1, guild: "Old Guild")
            );
            api.Logs[(Tauri, 101)] = LogJson(
                101,
                Xavius,
                Mythic,
                15,
                100_000,
                null,
                [],
                Member("Deadsolf", "", 10, 269, race: 1, guild: "Old Guild")
            );
            await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options(), CancellationToken.None);
            static string[] Players(JsonDocument file) =>
                [
                    .. file
                        .RootElement.GetProperty("players")
                        .EnumerateArray()
                        .Select(player => string.Join("|", player.EnumerateArray())),
                ];
            using (
                var before = JsonDocument.Parse(
                    File.ReadAllText(Path.Combine(outputDirectory, "xavius-mythic.json"))
                )
            )
            {
                Assert.Equal(["Deadsolf|Evermoon|10|1|0|Old Guild"], Players(before));
            }
            var directory = new PlayerGuildDirectory(
                new() { [("Evermoon", "Deadsolf")] = "Warlocks" }
            );

            api.Rankings[(Tauri, Nythendra, Heroic)] = [100, 103];
            api.Logs[(Tauri, 103)] = LogJson(
                103,
                Nythendra,
                Heroic,
                20,
                100_000,
                null,
                [],
                Member("Deadsolf", "", 9, 267, race: 5)
            );
            await Service(outputDirectory, api, directory)
                .ExportAsync(Options(), CancellationToken.None);
            var rerun = await Service(outputDirectory, api, directory)
                .ExportAsync(Options(), CancellationToken.None);

            Assert.Equal(0, rerun.ReadLogCount);
            Assert.Equal(
                [(10, 269, 1), (10, 269, 1), (9, 267, 5)],
                rerun
                    .Dataset.Logs.Select(log => log.Members[0])
                    .Select(member => (member.ClassId, member.SpecId, member.Race))
            );
            using var boss = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "nythendra-heroic.json"))
            );
            Assert.Equal(
                ["Deadsolf|Evermoon|10|1|0|Old Guild|1", "Deadsolf|Evermoon|9|5|0|Warlocks"],
                Players(boss)
            );
            Assert.Equal(
                [0, 1],
                boss.RootElement.GetProperty("logs")
                    .EnumerateArray()
                    .Select(log => log[9][0][0].GetInt32())
            );
            using var otherBoss = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "xavius-mythic.json"))
            );
            Assert.Equal(["Deadsolf|Evermoon|10|1|0|Old Guild|1"], Players(otherBoss));
            using var index = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "index.json"))
            );
            Assert.Equal(
                """[["Deadsolf","Evermoon",9,[10]]]""",
                index.RootElement.GetProperty("formerCharacters").GetRawText().Replace("\n", "")
            );
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_KeepsTheLastTalentsWhenTauriShootCannotBeRead()
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
                null,
                [],
                Member("Warrior", "", 1, 71)
            );
            var talentsPath = Path.Combine(outputDirectory, "talents.json");
            var tooltipsPath = Path.Combine(outputDirectory, "talent-tooltips.json");

            var first = await Service(outputDirectory, api, PlayerGuildDirectory.Empty)
                .ExportAsync(Options(), CancellationToken.None);
            var written = File.ReadAllText(talentsPath);
            var writtenTooltips = File.ReadAllText(tooltipsPath);
            var tooltips = new FakeTooltipSource();
            var second = await Service(
                    outputDirectory,
                    api,
                    PlayerGuildDirectory.Empty,
                    new FakeTalentSource(fails: true),
                    tooltips
                )
                .ExportAsync(Options(), CancellationToken.None);

            Assert.Equal((1, 0), (first.TalentSpecCount, second.TalentSpecCount));
            Assert.Equal(written, File.ReadAllText(talentsPath));
            Assert.Null(second.TalentTooltips);
            Assert.Empty(tooltips.Requests);
            Assert.Equal(writtenTooltips, File.ReadAllText(tooltipsPath));
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_WritesTalentTooltipsAndLooksUpOnlyNewOnes()
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
                null,
                [],
                Member("Warrior", "", 1, 71)
            );
            var first = new FakeTooltipSource();
            var cached = new FakeTooltipSource();
            var full = new FakeTooltipSource();

            var result = await Service(
                    outputDirectory,
                    api,
                    PlayerGuildDirectory.Empty,
                    tooltips: first
                )
                .ExportAsync(Options(), CancellationToken.None);
            await Service(outputDirectory, api, PlayerGuildDirectory.Empty, tooltips: cached)
                .ExportAsync(Options(), CancellationToken.None);
            await Service(outputDirectory, api, PlayerGuildDirectory.Empty, tooltips: full)
                .ExportAsync(Options() with { Full = true }, CancellationToken.None);

            Assert.Equal(new RaidTooltipLookup(7, 7, 7), result.TalentTooltips);
            Assert.Equal(7, first.Requests.Count);
            Assert.Empty(cached.Requests);
            Assert.Equal(7, full.Requests.Count);
            using var file = JsonDocument.Parse(
                File.ReadAllText(Path.Combine(outputDirectory, "talent-tooltips.json"))
            );
            Assert.Equal(1, file.RootElement.GetProperty("version").GetInt32());
            var spells = file.RootElement.GetProperty("spells");
            Assert.Equal(
                Enumerable.Range(1000, 7),
                spells.EnumerateArray().Select(spell => spell[0].GetInt32())
            );
            Assert.Equal("""[1000,["Instant"],"Spell 1000."]""", spells[0].GetRawText());
        }
        finally
        {
            Directory.Delete(outputDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ExportAsync_LeavesOutATooltipThatCannotBeReadAndLooksItUpNextRun()
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
                null,
                [],
                Member("Warrior", "", 1, 71)
            );
            var retry = new FakeTooltipSource();

            var first = await Service(
                    outputDirectory,
                    api,
                    PlayerGuildDirectory.Empty,
                    tooltips: new FakeTooltipSource(1003)
                )
                .ExportAsync(Options(), CancellationToken.None);
            var second = await Service(
                    outputDirectory,
                    api,
                    PlayerGuildDirectory.Empty,
                    tooltips: retry
                )
                .ExportAsync(Options(), CancellationToken.None);

            Assert.Equal(new RaidTooltipLookup(7, 6, 7), first.TalentTooltips);
            Assert.Equal([1003], retry.Requests);
            Assert.Equal(new RaidTooltipLookup(7, 7, 1), second.TalentTooltips);
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
        PlayerGuildDirectory directory,
        IRaidTalentSource? talents = null,
        IRaidSpellTooltipSource? tooltips = null
    ) =>
        new(
            outputDirectory,
            api,
            new FakeItemSource(),
            talents ?? new FakeTalentSource(),
            tooltips ?? new FakeTooltipSource(),
            directory
        );

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
        string guild = "",
        string talents = "",
        (int Id, int ItemLevel, string Name)[]? trinkets = null
    ) =>
        $$"""
            {
              "valid_player": {{(link.Length > 0 ? "true" : "false")}}, "name": "{{name}}",
              "link": "{{link}}", "guildName": "{{guild}}", "class": {{classId}}, "spec": {{specId}},
              "race": {{race}}, "gender": 0, "ilvl": 870, "dmg_done": {{damage}},
              "heal_done": {{heal}}, "absorb_done": {{absorb}}, "overheal": 7, "dmg_taken": 8,
              "talents": "{{talents}}", {{TrinketsJson(trinkets ?? [])}}
              "interrupts": 1, "dispells": 2
            }
            """;

    /// <summary>The API's <c>trinket_0</c> and <c>trinket_1</c>, each followed by a comma.</summary>
    private static string TrinketsJson((int Id, int ItemLevel, string Name)[] trinkets) =>
        string.Concat(
            trinkets.Select(
                (trinket, slot) =>
                    $$"""
                        "trinket_{{slot}}": {
                          "entry": {{trinket.Id}}, "ilevel": {{trinket.ItemLevel}}, "name": "{{trinket.Name}}",
                          "rarity": 4, "icon": "inv_{{trinket.Id}}", "gems": [], "ench": {}
                        },
                        """
            )
        );

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

    /// <summary>Arms with one talent per tier, or nothing, like TauriShoot when it is down.</summary>
    private sealed class FakeTalentSource(bool fails = false) : IRaidTalentSource
    {
        public Task<IReadOnlyList<RaidSpecTalents>?> LoadAsync(
            CancellationToken cancellationToken
        ) =>
            Task.FromResult<IReadOnlyList<RaidSpecTalents>?>(
                fails
                    ? null
                    :
                    [
                        new RaidSpecTalents(
                            71,
                            [
                                .. Enumerable
                                    .Range(0, RaidCatalog.TalentTiers)
                                    .Select(tier =>
                                        (IReadOnlyList<RaidTalent?>)
                                            [
                                                new RaidTalent(
                                                    1000 + tier,
                                                    $"Talent {tier}",
                                                    "icon"
                                                ),
                                                null,
                                                null,
                                            ]
                                    ),
                            ]
                        ),
                    ]
            );
    }

    private sealed class FakeTooltipSource(params int[] failing) : IRaidSpellTooltipSource
    {
        public ConcurrentQueue<int> Requests { get; } = new();

        public Task<RaidSpellTooltip?> LoadAsync(int spellId, CancellationToken cancellationToken)
        {
            Requests.Enqueue(spellId);
            return Task.FromResult<RaidSpellTooltip?>(
                failing.Contains(spellId)
                    ? null
                    : new RaidSpellTooltip(spellId, ["Instant"], $"Spell {spellId}.")
            );
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();
    }
}
