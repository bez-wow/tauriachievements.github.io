const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  RANKINGS,
  buildRankMap,
  compareAchievementPoints,
  getPlayerKey,
  sortByAchievementPoints,
  sortByRanking,
} = require("./player-ranking");

function ranked(name, achievementPoints, honorableKills, extra = {}) {
  return { name, realm: "Tauri", achievementPoints, honorableKills, ...extra };
}

const names = (players) => players.map((player) => player.name);

test("buildRankMap assigns 1-based ranks in ranking order", () => {
  const players = sortByAchievementPoints([
    ranked("Low", 800, 0),
    ranked("High", 1000, 0),
    ranked("Mid", 900, 0),
  ]);
  const ranks = buildRankMap(players, "achievementPoints");

  assert.equal(ranks.get(getPlayerKey(ranked("High", 1000, 0))), 1);
  assert.equal(ranks.get(getPlayerKey(ranked("Mid", 900, 0))), 2);
  assert.equal(ranks.get(getPlayerKey(ranked("Low", 800, 0))), 3);
});

test("compareAchievementPoints breaks ties on honorable kills, then on key", () => {
  assert.ok(compareAchievementPoints(ranked("A", 1000, 0), ranked("B", 900, 0)) < 0);
  assert.ok(compareAchievementPoints(ranked("A", 1000, 50), ranked("B", 1000, 10)) < 0);
  assert.ok(compareAchievementPoints(ranked("Bravo", 1000, 10), ranked("Alpha", 1000, 10)) > 0);
});

test("honorable kills rank first by kills, then by achievement points", () => {
  const players = sortByAchievementPoints([
    ranked("RichButFewKills", 99999, 500),
    ranked("ManyKills", 0, 1000),
    ranked("SameKillsLessPoints", 200, 500),
  ]);

  assert.deepEqual(names(sortByRanking(players, "honorableKills")), [
    "ManyKills",
    "RichButFewKills",
    "SameKillsLessPoints",
  ]);
});

test("appearances rank first by appearance count", () => {
  const players = sortByAchievementPoints([
    ranked("Rich", 99999, 99999, { appearanceCount: 500 }),
    ranked("Collector", 0, 0, { appearanceCount: 1000 }),
  ]);

  assert.deepEqual(names(sortByRanking(players, "appearanceCount")), ["Collector", "Rich"]);
});

test("a full tie falls back to player key, exactly like the achievement-point order", () => {
  const players = sortByAchievementPoints([
    ranked("Charlie", 100, 5, { playedTime: 60 }),
    ranked("Alpha", 100, 5, { playedTime: 60 }),
    ranked("Bravo", 100, 5, { playedTime: 60 }),
  ]);

  assert.deepEqual(names(sortByRanking(players, "playedTime")), ["Alpha", "Bravo", "Charlie"]);
});

test("every ranking compares achievement points and honorable kills", () => {
  // sortByRanking relies on this to reproduce the key tie-break without comparing keys.
  for (const fields of Object.values(RANKINGS)) {
    assert.ok(fields.includes("achievementPoints"));
    assert.ok(fields.includes("honorableKills"));
  }
});
