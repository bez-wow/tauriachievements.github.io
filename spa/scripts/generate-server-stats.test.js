const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildServerStatsSnapshot, statsFilterKey } = require("./generate-server-stats");

function player(realm, level) {
  return {
    name: `${realm}-${level}`,
    race: 1,
    playerClass: 1,
    realm,
    level,
    guild: "",
    faction: "Alliance",
    achievementPoints: 100,
    honorableKills: 10,
  };
}

test("builds aggregates for combined realm and level filters", () => {
  const snapshot = buildServerStatsSnapshot([
    player("Tauri", 110),
    player("Tauri", 100),
    player("Evermoon", 110),
  ]);

  assert.equal(snapshot.filters[statsFilterKey()].totalPlayers, 3);
  assert.equal(snapshot.filters[statsFilterKey("Tauri")].totalPlayers, 2);
  assert.equal(snapshot.filters[statsFilterKey(undefined, 110)].totalPlayers, 2);
  assert.equal(snapshot.filters[statsFilterKey("Tauri", 110)].totalPlayers, 1);
  assert.equal(snapshot.filters[statsFilterKey("WoD", 80)].totalPlayers, 0);
});
