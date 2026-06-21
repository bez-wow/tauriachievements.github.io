const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getNameClassKey,
  getPlayerKey,
  buildRankMap,
  compareAchievementPoints,
  compareHonorableKills,
  compareAppearances,
} = require("./generate-player-snapshot");

function ranked(name, achievementPoints, honorableKills, realm = "Tauri", appearanceCount = 0) {
  return { name, realm, achievementPoints, honorableKills, appearanceCount };
}

function player(overrides) {
  return {
    name: "Yolko",
    race: 1,
    gender: 0,
    playerClass: 8,
    realm: "Tauri",
    guild: "Outlaws",
    faction: "Alliance",
    ...overrides,
  };
}

test("getNameClassKey ignores race, faction, realm, and guild", () => {
  const before = player({ race: 1, faction: "Alliance", realm: "Tauri", guild: "A" });
  const afterChange = player({ race: 7, faction: "Horde", realm: "Evermoon", guild: "B" });

  assert.equal(getNameClassKey(before), getNameClassKey(afterChange));
});

test("getNameClassKey is case-insensitive on the name", () => {
  assert.equal(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "YOLKO" })));
});

test("getNameClassKey distinguishes a different class", () => {
  assert.notEqual(getNameClassKey(player({ playerClass: 8 })), getNameClassKey(player({ playerClass: 2 })));
});

test("getNameClassKey distinguishes a different name", () => {
  assert.notEqual(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "Spuky" })));
});

test("newness rule: a faction/race/realm change is not treated as new", () => {
  const previousRows = [player({ race: 1, faction: "Alliance", realm: "Tauri" })];
  const previousNameClassKeys = new Set(previousRows.map(getNameClassKey));

  const movedRealmAndFaction = player({ race: 7, faction: "Horde", realm: "Evermoon" });
  const isNew = !previousNameClassKeys.has(getNameClassKey(movedRealmAndFaction));

  assert.equal(isNew, false);
});

test("newness rule: a genuinely new name or a reused name on a new class is new", () => {
  const previousRows = [player({ name: "Yolko", playerClass: 8 })];
  const previousNameClassKeys = new Set(previousRows.map(getNameClassKey));

  const brandNewName = player({ name: "Freshchar", playerClass: 8 });
  const sameNameNewClass = player({ name: "Yolko", playerClass: 2 });

  assert.equal(previousNameClassKeys.has(getNameClassKey(brandNewName)), false);
  assert.equal(previousNameClassKeys.has(getNameClassKey(sameNameNewClass)), false);
});

test("buildRankMap assigns 1-based ranks in comparator order", () => {
  const players = [
    ranked("Low", 800, 0),
    ranked("High", 1000, 0),
    ranked("Mid", 900, 0),
  ];
  const ranks = buildRankMap(players, compareAchievementPoints);

  assert.equal(ranks.get(getPlayerKey(ranked("High", 1000, 0))), 1);
  assert.equal(ranks.get(getPlayerKey(ranked("Mid", 900, 0))), 2);
  assert.equal(ranks.get(getPlayerKey(ranked("Low", 800, 0))), 3);
});

test("compareAchievementPoints breaks ties on honorable kills, then on key", () => {
  assert.ok(compareAchievementPoints(ranked("A", 1000, 0), ranked("B", 900, 0)) < 0);
  assert.ok(compareAchievementPoints(ranked("A", 1000, 50), ranked("B", 1000, 10)) < 0);

  const sameMetrics = compareAchievementPoints(
    ranked("Bravo", 1000, 10, "Tauri"),
    ranked("Alpha", 1000, 10, "Tauri")
  );
  assert.ok(sameMetrics > 0);
});

test("compareHonorableKills ranks by honorable kills first", () => {
  assert.ok(compareHonorableKills(ranked("A", 0, 1000), ranked("B", 99999, 500)) < 0);
  assert.ok(compareHonorableKills(ranked("A", 1000, 500), ranked("B", 200, 500)) < 0);
});

test("compareAppearances ranks by appearance count first", () => {
  assert.ok(compareAppearances(ranked("A", 0, 0, "Tauri", 1000), ranked("B", 99999, 99999, "Tauri", 500)) < 0);
  assert.ok(compareAppearances(ranked("A", 1000, 0, "Tauri", 500), ranked("B", 200, 99999, "Tauri", 500)) < 0);
});
