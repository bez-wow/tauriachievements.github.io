const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseGitHistoryOutput, parsePlayersCsv, toEpochDay } = require("./player-data-utils");

test("parsePlayersCsv reads character level", () => {
  const [player] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Level","Realm","Guild","AchievementPoints","HonorableKills","Faction"',
    '"Tester",1,0,2,110,"Tauri","",100,20,"Alliance"',
  ].join("\n"));

  assert.equal(player.level, 110);
});

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

test("parseGitHistoryOutput keeps each commit's path and skips pure renames", () => {
  const moveSha = "a".repeat(40);
  const syncSha = "c".repeat(40);
  const oldSha = "b".repeat(40);
  const entries = parseGitHistoryOutput([
    `${syncSha}|2026-09-30T18:00:00+02:00`,
    "",
    "M\tspa/src/Players.csv",
    `${moveSha}|2026-09-29T16:36:35+02:00`,
    "",
    "R100\tsrc/Players.csv\tspa/src/Players.csv",
    `${oldSha}|2026-09-28T19:57:39+02:00`,
    "",
    "M\tsrc/Players.csv",
    "",
  ].join("\n"));

  assert.deepEqual(entries, [
    { sha: syncSha, commitTimestamp: "2026-09-30T18:00:00+02:00", filePath: "spa/src/Players.csv" },
    { sha: oldSha, commitTimestamp: "2026-09-28T19:57:39+02:00", filePath: "src/Players.csv" },
  ]);
});

test("parsePlayersCsv turns Level10Date into a day number and leaves a missing faction Neutral", () => {
  const [known, unknown] = parsePlayersCsv([
    '"Name","Race","Gender","Class","Realm","Guild","AchievementPoints","HonorableKills","Faction","Level10Date"',
    '"Old",1,0,2,"Tauri","",100,20,"Alliance","2019-04-02"',
    '"Mystery",1,0,2,"Tauri","",100,20,"",""',
  ].join("\n"));

  assert.equal(known.level10Day, toEpochDay("2019-04-02"));
  assert.equal(new Date(known.level10Day * 86400000).toISOString().slice(0, 10), "2019-04-02");
  assert.equal(unknown.level10Day, 0);
  assert.equal(unknown.faction, "Neutral");
});
