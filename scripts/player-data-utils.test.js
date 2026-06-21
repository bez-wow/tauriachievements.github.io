const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlayersCsv } = require("./player-data-utils");

test("parsePlayersCsv reads appearance counts when the column exists", () => {
  const [player] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Realm","Guild","AchievementPoints","HonorableKills","Faction","AppearanceCount"',
    '"Shiny",1,0,2,"Tauri","Guild",1000,500,"Alliance",321'
  ].join("\n"));

  assert.equal(player.appearanceCount, 321);
  assert.equal(player.hasAppearanceCount, true);
});

test("parsePlayersCsv marks legacy scans without appearance data", () => {
  const [player] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Realm","Guild","AchievementPoints","HonorableKills","Faction"',
    '"Legacy",1,0,2,"Tauri","Guild",1000,500,"Alliance"'
  ].join("\n"));

  assert.equal(player.appearanceCount, 0);
  assert.equal(player.hasAppearanceCount, false);
});
