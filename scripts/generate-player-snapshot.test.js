const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getNameClassKey,
  getPlayerKey,
  buildRankMap,
  compareAchievementPoints,
  compareHonorableKills,
  compareAppearances,
  buildHeadSnapshot,
  HEAD_PLAYER_COUNT,
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

function headFixture() {
  // Deliberately out of rank order, so a head built by slicing the source array
  // rather than by rank would fail these assertions.
  const rows = [
    ranked("Mid", 900, 0),
    ranked("Top", 1000, 0),
    ranked("Bottom", 100, 0),
    ranked("Second", 950, 0),
  ];

  return {
    rows,
    snapshot: {
      v: 2,
      r: ["Tauri"],
      f: ["Alliance"],
      // Stand-ins for serialized rows; buildHeadSnapshot only reorders them.
      p: rows.map((row) => [row.name, row.achievementPoints]),
    },
    ranks: buildRankMap(rows, compareAchievementPoints),
  };
}

test("buildHeadSnapshot keeps the globally top-ranked players in global rank order", () => {
  const { rows, snapshot, ranks } = headFixture();

  const head = buildHeadSnapshot(snapshot, rows, ranks);

  assert.deepEqual(head.p.map((row) => row[0]), ["Top", "Second", "Mid", "Bottom"]);
});

test("buildHeadSnapshot records the full player count so the app knows the head is a slice", () => {
  const { rows, snapshot, ranks } = headFixture();

  assert.equal(buildHeadSnapshot(snapshot, rows, ranks).t, 4);
});

test("buildHeadSnapshot copies the realm and faction lists whole", () => {
  const { rows, snapshot, ranks } = headFixture();

  const head = buildHeadSnapshot(snapshot, rows, ranks);

  // Index columns must resolve identically in both files, or upgrading from the head
  // to the full snapshot would remap every player's realm and faction.
  assert.deepEqual(head.r, snapshot.r);
  assert.deepEqual(head.f, snapshot.f);
  assert.equal(head.v, snapshot.v);
});

test("buildHeadSnapshot drops players ranked past the cap", () => {
  const rows = [];
  for (let index = 0; index < HEAD_PLAYER_COUNT + 25; index++) {
    rows.push(ranked(`P${index}`, HEAD_PLAYER_COUNT + 25 - index, 0));
  }

  const snapshot = { v: 2, r: ["Tauri"], f: ["Alliance"], p: rows.map((row) => [row.name]) };
  const head = buildHeadSnapshot(snapshot, rows, buildRankMap(rows, compareAchievementPoints));

  assert.equal(head.p.length, HEAD_PLAYER_COUNT);
  assert.equal(head.t, HEAD_PLAYER_COUNT + 25);
  assert.equal(head.p[0][0], "P0");
});

test("a head smaller than the cap holds everyone", () => {
  const { rows, snapshot, ranks } = headFixture();

  assert.equal(buildHeadSnapshot(snapshot, rows, ranks).p.length, rows.length);
});
