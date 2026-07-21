const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeTopMoversForSnapshots } = require("./generate-player-history");

function player(name, appearanceCount, hasAppearanceCount = true) {
  return {
    name,
    realm: "Tauri",
    race: 1,
    gender: 0,
    playerClass: 2,
    guild: "Guild",
    achievementPoints: 1000,
    honorableKills: 500,
    appearanceCount,
    hasAppearanceCount,
  };
}

test("appearance movers track and order gains between scans", () => {
  const previous = [player("SmallGain", 100), player("BigGain", 100)];
  const current = [player("SmallGain", 105), player("BigGain", 120)];

  const movers = computeTopMoversForSnapshots(current, previous, "appearanceCount");

  assert.deepEqual(movers.map((mover) => mover[0]), ["Tauri::BigGain", "Tauri::SmallGain"]);
  assert.deepEqual(movers.map((mover) => mover[14]), [20, 5]);
  assert.equal(movers[0][15], 100);
  assert.equal(movers[0][16], 120);
});

test("a legacy scan without AppearanceCount is used as a baseline, not a gain", () => {
  const previous = [player("Baseline", 0, false)];
  const current = [player("Baseline", 500)];

  assert.deepEqual(computeTopMoversForSnapshots(current, previous, "appearanceCount"), []);
});

test("played time movers track and order time gained between scans", () => {
  const previous = [
    { ...player("SmallGain", 100), playedTime: 1000, hasPlayedTime: true },
    { ...player("BigGain", 100), playedTime: 1000, hasPlayedTime: true },
  ];
  const current = [
    { ...player("SmallGain", 100), playedTime: 1600, hasPlayedTime: true },
    { ...player("BigGain", 100), playedTime: 4600, hasPlayedTime: true },
  ];

  const movers = computeTopMoversForSnapshots(current, previous, "playedTime");

  assert.deepEqual(movers.map((mover) => mover[0]), ["Tauri::BigGain", "Tauri::SmallGain"]);
  assert.deepEqual(movers.map((mover) => mover[17]), [3600, 600]);
  assert.equal(movers[0][18], 1000);
  assert.equal(movers[0][19], 4600);
});

test("a legacy scan without PlayedTime is used as a baseline, not a gain", () => {
  const previous = [{ ...player("Baseline", 100), playedTime: 0, hasPlayedTime: false }];
  const current = [{ ...player("Baseline", 100), playedTime: 5000, hasPlayedTime: true }];

  assert.deepEqual(computeTopMoversForSnapshots(current, previous, "playedTime"), []);
});
