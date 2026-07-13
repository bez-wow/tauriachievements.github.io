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

test("parsePlayersCsv reads account-wide achievements and played time when the columns exist", () => {
  const [player] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Realm","Guild","AchievementPoints","HonorableKills","Faction","AchievementsTotal","PlayedTime"',
    '"Shiny",1,0,2,"Tauri","Guild",1000,500,"Alliance",2100,86400'
  ].join("\n"));

  assert.equal(player.achievementsTotal, 2100);
  assert.equal(player.hasAchievementsTotal, true);
  assert.equal(player.playedTime, 86400);
  assert.equal(player.hasPlayedTime, true);
});

test("parsePlayersCsv marks legacy scans without account-wide achievements or played time", () => {
  const [player] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Realm","Guild","AchievementPoints","HonorableKills","Faction"',
    '"Legacy",1,0,2,"Tauri","Guild",1000,500,"Alliance"'
  ].join("\n"));

  assert.equal(player.achievementsTotal, 0);
  assert.equal(player.hasAchievementsTotal, false);
  assert.equal(player.playedTime, 0);
  assert.equal(player.hasPlayedTime, false);
});
