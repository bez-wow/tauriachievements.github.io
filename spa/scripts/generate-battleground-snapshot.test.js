const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildBattlegroundSnapshots, parseBattleground } = require("./generate-battleground-snapshot");

// Reads a snapshot back into [name, date, minute, seconds] rows, in snapshot order.
function rows(snapshot) {
  return snapshot.days.flatMap(([date, values]) => {
    const result = [];
    for (let index = 0; index < values.length; index += 3) {
      result.push([snapshot.names[values[index]], date, values[index + 1], values[index + 2]]);
    }
    return result;
  });
}

test("reads the collector's start time and duration", () => {
  assert.deepEqual(
    parseBattleground({ name: "Warsong Gulch", startTime: "2026.07.02 06.52", duration: "00:13:47" }),
    { name: "Warsong Gulch", date: "2026-07-02", minuteOfDay: 412, durationSeconds: 827 }
  );
});

test("reads a numeric duration as milliseconds and marks a missing one as unknown", () => {
  assert.equal(parseBattleground({ name: "Arathi Basin", startTime: "2026.07.02 06.52", duration: 600000 }).durationSeconds, 600);
  assert.equal(parseBattleground({ name: "Arathi Basin", startTime: "2026.07.02 06.52" }).durationSeconds, -1);
});

test("skips records without a name or a readable start time", () => {
  const { snapshots, skipped } = buildBattlegroundSnapshots([
    { name: "", startTime: "2026.07.20 10.00", duration: "00:10:00" },
    { name: "Warsong Gulch", duration: "00:10:00" },
    { name: "Arathi Basin", startTime: "2026.13.01 10.00" },
    { name: "Twin Peaks", startTime: "2026.07.20 10.00", duration: "00:10:00" },
  ]);

  assert.equal(skipped, 3);
  assert.deepEqual(rows(snapshots.legion), [["Twin Peaks", "2026-07-20", 600, 600]]);
});

test("starts Legion at 2026-07-15 09:00 and keeps earlier starts in the WoD prepatch", () => {
  const { snapshots } = buildBattlegroundSnapshots([
    { name: "Warsong Gulch", startTime: "2026.07.15 08.59", duration: "00:10:00" },
    { name: "Arathi Basin", startTime: "2026.07.15 09.00", duration: "00:20:00" },
    { name: "Twin Peaks", startTime: "2026.07.16 07.00", duration: "00:15:00" },
  ]);

  assert.equal(snapshots["wod-prepatch"].era, "wod-prepatch");
  assert.deepEqual(rows(snapshots["wod-prepatch"]).map(([name]) => name), ["Warsong Gulch"]);
  assert.deepEqual(rows(snapshots.legion).map(([name]) => name), ["Arathi Basin", "Twin Peaks"]);
});

test("orders days by date and keeps the collector's order within a day", () => {
  const { snapshots } = buildBattlegroundSnapshots([
    { name: "Twin Peaks", startTime: "2026.08.02 22.55", duration: "00:09:28" },
    { name: "Temple of Kotmogu", startTime: "2026.08.01 22.48", duration: "00:15:48" },
    { name: "Twin Peaks", startTime: "2026.08.02 22.37", duration: "00:17:03" },
    { name: "Silvershard Mines", startTime: "2026.08.02 22.42", duration: "00:07:56" },
  ]);

  assert.deepEqual(snapshots.legion.names, ["Temple of Kotmogu", "Twin Peaks", "Silvershard Mines"]);
  assert.deepEqual(snapshots.legion.days.map(([date]) => date), ["2026-08-01", "2026-08-02"]);
  assert.deepEqual(rows(snapshots.legion), [
    ["Temple of Kotmogu", "2026-08-01", 22 * 60 + 48, 948],
    ["Twin Peaks", "2026-08-02", 22 * 60 + 55, 568],
    ["Twin Peaks", "2026-08-02", 22 * 60 + 37, 1023],
    ["Silvershard Mines", "2026-08-02", 22 * 60 + 42, 476],
  ]);
});
