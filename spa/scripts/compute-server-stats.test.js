const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeServerStats, emptyServerStats, AP_LABELS, HK_LABELS } = require("./compute-server-stats");

function player(overrides) {
  return {
    name: "Anon",
    race: 1,
    playerClass: 1,
    realm: "Tauri",
    guild: "Guild",
    faction: "Horde",
    achievementPoints: 0,
    honorableKills: 0,
    ...overrides,
  };
}

function sampleRoster() {
  return [
    player({ name: "P1", faction: "Horde", playerClass: 2, race: 2, realm: "Tauri", guild: "G1", achievementPoints: 500, honorableKills: 0 }),
    player({ name: "P2", faction: "Horde", playerClass: 2, race: 2, realm: "Tauri", guild: "G1", achievementPoints: 1000, honorableKills: 1000 }),
    player({ name: "P3", faction: "Alliance", playerClass: 8, race: 1, realm: "Evermoon", guild: "", achievementPoints: 20000, honorableKills: 100000 }),
    player({ name: "P4", faction: "Alliance", playerClass: 8, race: 1, realm: "Evermoon", guild: "G2", achievementPoints: 6000, honorableKills: 5000 }),
  ];
}

test("an empty roster returns zeroed stats with the bucket arrays still sized", () => {
  const stats = computeServerStats([]);

  assert.equal(stats.totalPlayers, 0);
  assert.equal(stats.avgAchievementPoints, 0);
  assert.deepEqual(stats.classes, []);
  assert.deepEqual(stats.apBucketCounts, [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(stats.hkBucketCounts, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(stats.apBucketLabels.length, stats.apBucketCounts.length);
  assert.equal(stats.hkBucketLabels.length, stats.hkBucketCounts.length);
});

test("computes totals, rounded averages, and maximums", () => {
  const stats = computeServerStats(sampleRoster());

  assert.equal(stats.totalPlayers, 4);
  assert.equal(stats.avgAchievementPoints, 6875);
  assert.equal(stats.maxAchievementPoints, 20000);
  assert.equal(stats.avgHonorableKills, 26500);
  assert.equal(stats.maxHonorableKills, 100000);
});

test("counts guilded players and unique guilds keyed by guild plus realm", () => {
  const stats = computeServerStats(sampleRoster());

  assert.equal(stats.guildedPlayers, 3);
  assert.equal(stats.uniqueGuilds, 2);
});

test("the same guild name on two realms counts as two guilds", () => {
  const stats = computeServerStats([
    player({ name: "A", realm: "Tauri", guild: "Twins" }),
    player({ name: "B", realm: "Evermoon", guild: "Twins" }),
  ]);

  assert.equal(stats.uniqueGuilds, 2);
});

test("orders factions Horde, Alliance, then anything else", () => {
  const stats = computeServerStats([
    ...sampleRoster(),
    player({ name: "P5", faction: "Neutral" }),
  ]);

  assert.deepEqual(stats.factions.map((entry) => entry.name), ["Horde", "Alliance", "Neutral"]);
  assert.deepEqual(stats.factions.map((entry) => entry.count), [2, 2, 1]);
});

test("buckets achievement points by threshold, lower bound inclusive", () => {
  const stats = computeServerStats(sampleRoster());

  assert.deepEqual(stats.apBucketLabels, AP_LABELS);
  assert.deepEqual(stats.apBucketCounts, [1, 1, 0, 1, 0, 0, 1]);
});

test("buckets honorable kills by threshold, lower bound inclusive", () => {
  const stats = computeServerStats(sampleRoster());

  assert.deepEqual(stats.hkBucketLabels, HK_LABELS);
  assert.deepEqual(stats.hkBucketCounts, [1, 1, 1, 0, 0, 0, 1]);
});

test("a value exactly on a break falls in the higher bucket", () => {
  const stats = computeServerStats([
    player({ name: "Below", achievementPoints: 2999 }),
    player({ name: "OnBreak", achievementPoints: 3000 }),
  ]);

  assert.deepEqual(stats.apBucketCounts, [0, 1, 1, 0, 0, 0, 0]);
});

test("reports classes and races by id, most populous first", () => {
  const stats = computeServerStats([
    ...sampleRoster(),
    player({ name: "P5", playerClass: 8, race: 1 }),
  ]);

  assert.deepEqual(stats.classes, [{ id: 8, count: 3 }, { id: 2, count: 2 }]);
  assert.deepEqual(stats.races, [{ id: 1, count: 3 }, { id: 2, count: 2 }]);
});

test("puts the most populous guild first and keeps at most ten", () => {
  const roster = [...sampleRoster()];
  for (let index = 0; index < 2; index++) {
    roster.push(player({ name: `Extra${index}`, realm: "Evermoon", guild: "G2" }));
  }
  for (let index = 0; index < 15; index++) {
    roster.push(player({ name: `Solo${index}`, realm: "Tauri", guild: `Guild${index}` }));
  }

  const stats = computeServerStats(roster);

  assert.equal(stats.guilds[0].name, "G2 (Evermoon)");
  assert.equal(stats.guilds[0].count, 3);
  assert.equal(stats.guilds.length, 10);
});

test("counts realms", () => {
  const stats = computeServerStats(sampleRoster());

  assert.deepEqual(stats.realms, [{ name: "Tauri", count: 2 }, { name: "Evermoon", count: 2 }]);
});

test("the empty document carries every key the populated one does", () => {
  assert.deepEqual(Object.keys(emptyServerStats()).sort(), Object.keys(computeServerStats(sampleRoster())).sort());
});
