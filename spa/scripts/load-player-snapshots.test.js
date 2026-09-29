const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectEarlierDailyScans } = require("./load-player-snapshots");

function commit(sha, commitTimestamp) {
  return { sha, commitTimestamp, filePath: "spa/src/Players.csv" };
}

test("takes the newest scan of each earlier day and skips the current day", () => {
  const history = [
    commit("today-late", "2026-09-29T20:00:00Z"),
    commit("yesterday-late", "2026-09-28T20:00:00Z"),
    commit("yesterday-early", "2026-09-28T08:00:00Z"),
    commit("older", "2026-09-26T12:00:00Z"),
  ];

  const scans = selectEarlierDailyScans(history, "2026-09-29");

  assert.deepEqual(scans.map((scan) => scan.sha), ["yesterday-late", "older"]);
  assert.equal(scans[0].filePath, "spa/src/Players.csv");
});

test("keeps at most 20 earlier days", () => {
  const history = [];
  for (let day = 1; day <= 28; day++) {
    history.push(commit(`day-${day}`, `2026-08-${String(29 - day).padStart(2, "0")}T12:00:00Z`));
  }

  assert.equal(selectEarlierDailyScans(history, "2026-09-29").length, 20);
});
