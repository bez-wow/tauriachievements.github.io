const { test } = require("node:test");
const assert = require("node:assert/strict");
const { HEAD_PLAYER_COUNT, buildPlayerSnapshots, getNameClassKey } = require("./generate-player-snapshot");

function player(overrides) {
  return {
    name: "Yolko",
    race: 1,
    gender: 0,
    playerClass: 8,
    realm: "Tauri",
    guild: "Outlaws",
    faction: "Alliance",
    achievementPoints: 1000,
    honorableKills: 10,
    appearanceCount: 0,
    hasAppearanceCount: true,
    achievementsTotal: 0,
    hasAchievementsTotal: true,
    playedTime: 0,
    hasPlayedTime: true,
    ilvl: 0,
    level10Day: 0,
    ...overrides,
  };
}

/** Reads a serialized snapshot back into objects, the way the app does. */
function readRows(snapshot) {
  return snapshot.p.map((row) => {
    const value = Object.fromEntries(snapshot.c.map((column, index) => [column, row[index]]));
    return { ...value, realm: snapshot.r[value.realm], faction: snapshot.f[value.faction] };
  });
}

test("getNameClassKey ignores race, faction, realm, and guild", () => {
  const before = player({ race: 1, faction: "Alliance", realm: "Tauri", guild: "A" });
  const afterChange = player({ race: 7, faction: "Horde", realm: "Evermoon", guild: "B" });

  assert.equal(getNameClassKey(before), getNameClassKey(afterChange));
});

test("getNameClassKey is case-insensitive on the name", () => {
  assert.equal(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "YOLKO" })));
});

test("getNameClassKey distinguishes a different class or name", () => {
  assert.notEqual(getNameClassKey(player({ playerClass: 8 })), getNameClassKey(player({ playerClass: 2 })));
  assert.notEqual(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "Spuky" })));
});

test("rows are written in achievement-point rank order with every column named", () => {
  const { full } = buildPlayerSnapshots(
    [
      player({ name: "Mid", achievementPoints: 900 }),
      player({ name: "Top", achievementPoints: 1000 }),
      player({ name: "Bottom", achievementPoints: 100 }),
    ],
    []
  );

  assert.deepEqual(readRows(full).map((row) => row.name), ["Top", "Mid", "Bottom"]);
  assert.equal(full.c.length, full.p[0].length);
  assert.ok(full.k.honorableKills, "the ranking rules ship with the data");
});

test("realm and faction columns resolve through the lookup lists", () => {
  const { full } = buildPlayerSnapshots([player({ realm: "Evermoon", faction: "Neutral" })], []);

  const [row] = readRows(full);
  assert.equal(row.realm, "Evermoon");
  assert.equal(row.faction, "Neutral");
});

test("deltas and rank deltas compare against the previous scan", () => {
  const previous = [
    player({ name: "Climber", achievementPoints: 500, honorableKills: 1 }),
    player({ name: "Leader", achievementPoints: 900 }),
  ];
  const current = [
    player({ name: "Climber", achievementPoints: 1000, honorableKills: 1 }),
    player({ name: "Leader", achievementPoints: 900 }),
  ];

  const [climber, leader] = readRows(buildPlayerSnapshots(current, previous).full);

  assert.equal(climber.name, "Climber");
  assert.equal(climber.achievementPointsDelta, 500);
  assert.equal(climber.achievementRankDelta, 1);
  assert.equal(leader.achievementRankDelta, -1);
});

test("played time and its delta are written in whole minutes", () => {
  const previous = [player({ playedTime: 90 * 60 })];
  const current = [player({ playedTime: 2 * 86400 + 3 * 3600 + 4 * 60 })];

  const [row] = readRows(buildPlayerSnapshots(current, previous).full);

  assert.equal(row.playedTime, 2 * 1440 + 3 * 60 + 4);
  assert.equal(row.playedTimeDelta, 2 * 1440 + 3 * 60 + 4 - 90);
});

test("new characters are flagged and published on their own", () => {
  const previous = [player({ name: "Veteran" })];
  const current = [player({ name: "Veteran" }), player({ name: "Freshchar" })];

  const { full, newPlayers } = buildPlayerSnapshots(current, previous);

  assert.deepEqual(
    readRows(full).map((row) => [row.name, row.isNewCharacter]),
    [["Freshchar", 1], ["Veteran", 0]]
  );
  assert.deepEqual(readRows(newPlayers).map((row) => row.name), ["Freshchar"]);
});

test("without a previous scan nobody is new", () => {
  const { newPlayers } = buildPlayerSnapshots([player({})], []);

  assert.equal(newPlayers.p.length, 0);
});

test("the head is the top of the full snapshot and records the full player count", () => {
  const players = [];
  for (let index = 0; index < HEAD_PLAYER_COUNT + 25; index++) {
    players.push(player({ name: `P${index}`, achievementPoints: HEAD_PLAYER_COUNT + 25 - index }));
  }

  const { full, head } = buildPlayerSnapshots(players, []);

  assert.equal(head.p.length, HEAD_PLAYER_COUNT);
  assert.equal(head.t, HEAD_PLAYER_COUNT + 25);
  assert.deepEqual(head.p, full.p.slice(0, HEAD_PLAYER_COUNT));
  // Index columns must resolve identically in both files, or upgrading from the head
  // to the full snapshot would remap every player's realm and faction.
  assert.deepEqual(head.r, full.r);
  assert.deepEqual(head.f, full.f);
});
