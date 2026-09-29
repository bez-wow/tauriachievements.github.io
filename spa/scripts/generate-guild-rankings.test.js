const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildGuildRankingsSnapshot } = require("./generate-guild-rankings");

function player(name, guild, achievementPoints, honorableKills, faction = "Horde", realm = "Tauri") {
  return { name, guild, achievementPoints, honorableKills, faction, realm };
}

test("ranks guilds by members among the top N players", () => {
  const players = [
    player("A1", "Alpha", 1000, 0),
    player("B1", "Bravo", 900, 0),
    player("A2", "Alpha", 800, 0),
    player("B2", "Bravo", 10, 0),
  ];

  const top3 = buildGuildRankingsSnapshot(players, [3]).limits[3];

  assert.equal(top3.achievementLeaderboardSize, 3);
  assert.deepEqual(
    top3.achievementGuilds.map((guild) => [guild.rank, guild.guild, guild.playerCount]),
    [[1, "Alpha", 2], [2, "Bravo", 1]]
  );
  assert.equal(top3.achievementGuilds[0].topMemberName, "A1");
});

test("honorable-kill rankings use the honorable-kill leaderboard", () => {
  const players = [
    player("Rich", "Alpha", 5000, 1),
    player("Killer", "Bravo", 10, 9000),
  ];

  const top1 = buildGuildRankingsSnapshot(players, [1]).limits[1];

  assert.equal(top1.achievementGuilds[0].guild, "Alpha");
  assert.equal(top1.honorableKillGuilds[0].guild, "Bravo");
  assert.equal(top1.honorableKillGuilds[0].topMemberMetricValue, 9000);
});

test("guildless players are skipped and mixed-faction guilds are marked Mixed", () => {
  const players = [
    player("Solo", "", 1000, 0),
    player("H", "Both", 900, 0, "Horde"),
    player("A", "Both", 800, 0, "Alliance"),
  ];

  const [guild] = buildGuildRankingsSnapshot(players, [10]).limits[10].achievementGuilds;

  assert.equal(guild.guild, "Both");
  assert.equal(guild.faction, "Mixed");
});

test("the same guild name on two realms is two guilds", () => {
  const players = [
    player("X", "Twin", 1000, 0, "Horde", "Tauri"),
    player("Y", "Twin", 900, 0, "Horde", "Evermoon"),
  ];

  assert.equal(buildGuildRankingsSnapshot(players, [10]).limits[10].achievementGuilds.length, 2);
});
