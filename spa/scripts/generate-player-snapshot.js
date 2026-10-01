const fs = require("fs");
const path = require("path");
const {
  RANKINGS,
  buildRankMap,
  getPlayerKey,
  sortByAchievementPoints,
} = require("./player-ranking");
const { SECONDS_PER_MINUTE } = require("./player-data-utils");

const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.snapshot.json");
const headOutputPath = path.join(outputDir, "players.head.snapshot.json");
const newPlayersOutputPath = path.join(outputDir, "new-players.snapshot.json");

const SNAPSHOT_VERSION = 4;

// The ladder's default view is "top of the achievement-point ranking, unfiltered,
// at most 1000 rows". That answer lives entirely in the highest-ranked slice, so we
// publish it as a separate file the app can paint from while the full set streams in
// behind it. Anything else the user asks for - a search, another sort, a realm or
// class filter - needs every player and triggers a load of players.snapshot.json.
const HEAD_PLAYER_COUNT = 25000;

// The one definition of a serialized player row. The column names are written into the
// snapshot (`c`), and the app reads each row by those names, so adding, removing or
// reordering a column here can never shift values into the wrong field on the other side.
// `realm` and `faction` hold indexes into the snapshot's `r` and `f` lists. `playedTime` and
// `playedTimeDelta` are whole minutes (the app multiplies them back to seconds); the CSV
// reader has already dropped the seconds, so the division is exact.
const PLAYER_COLUMNS = [
  ["name", (row) => row.player.name],
  ["race", (row) => row.player.race],
  ["gender", (row) => row.player.gender],
  ["class", (row) => row.player.playerClass],
  ["realm", (row, lookups) => lookups.realmIndex.get(row.player.realm)],
  ["guild", (row) => row.player.guild],
  ["faction", (row, lookups) => lookups.factionIndex.get(row.player.faction)],
  ["achievementPoints", (row) => row.player.achievementPoints],
  ["honorableKills", (row) => row.player.honorableKills],
  ["appearanceCount", (row) => row.player.appearanceCount],
  ["achievementsTotal", (row) => row.player.achievementsTotal],
  ["playedTime", (row) => toMinutes(row.player.playedTime)],
  ["ilvl", (row) => row.player.ilvl],
  ["level10Day", (row) => row.player.level10Day],
  ["isNewCharacter", (row) => (row.isNewCharacter ? 1 : 0)],
  ["achievementPointsDelta", (row) => row.achievementPointsDelta],
  ["achievementRankDelta", (row) => row.achievementRankDelta],
  ["honorableKillsDelta", (row) => row.honorableKillsDelta],
  ["honorableKillsRankDelta", (row) => row.honorableKillsRankDelta],
  ["appearanceCountDelta", (row) => row.appearanceCountDelta],
  ["appearanceRankDelta", (row) => row.appearanceRankDelta],
  ["achievementsTotalDelta", (row) => row.achievementsTotalDelta],
  ["achievementsTotalRankDelta", (row) => row.achievementsTotalRankDelta],
  ["playedTimeDelta", (row) => toMinutes(row.playedTimeDelta)],
  ["playedTimeRankDelta", (row) => row.playedTimeRankDelta],
];

/**
 * Builds the three player files from parsed CSV rows:
 * - `full`: every player, in achievement-point rank order;
 * - `head`: the first HEAD_PLAYER_COUNT rows of `full`, with `t` holding the full count;
 * - `newPlayers`: only characters first seen in this scan, for the New Rare Characters page.
 */
function buildPlayerSnapshots(currentPlayers, previousPlayers) {
  const rankedPlayers = sortByAchievementPoints(currentPlayers);
  const rows = buildPlayerRows(rankedPlayers, previousPlayers);
  const lookups = buildLookups(rankedPlayers);
  const toSnapshot = (selectedRows, totalPlayers) => ({
    v: SNAPSHOT_VERSION,
    c: PLAYER_COLUMNS.map(([name]) => name),
    k: RANKINGS,
    r: lookups.realms,
    f: lookups.factions,
    t: totalPlayers,
    p: selectedRows.map((row) => PLAYER_COLUMNS.map(([, getValue]) => getValue(row, lookups))),
  });

  const newRows = rows.filter((row) => row.isNewCharacter);

  return {
    full: toSnapshot(rows, rows.length),
    head: toSnapshot(rows.slice(0, HEAD_PLAYER_COUNT), rows.length),
    newPlayers: toSnapshot(newRows, newRows.length),
  };
}

function buildPlayerRows(rankedPlayers, previousPlayers) {
  const rankedPrevious = sortByAchievementPoints(previousPlayers);
  const previousByKey = new Map(rankedPrevious.map((player) => [getPlayerKey(player), player]));
  const previousNameClassKeys = new Set(rankedPrevious.map(getNameClassKey));
  const current = {
    achievementPoints: buildRankMap(rankedPlayers, "achievementPoints"),
    honorableKills: buildRankMap(rankedPlayers, "honorableKills"),
    appearanceCount: buildRankMap(rankedPlayers, "appearanceCount"),
    achievementsTotal: buildRankMap(rankedPlayers, "achievementsTotal"),
    playedTime: buildRankMap(rankedPlayers, "playedTime"),
  };
  // Older scans predate some columns; players from those scans get no rank to compare against.
  const previous = {
    achievementPoints: buildRankMap(rankedPrevious, "achievementPoints"),
    honorableKills: buildRankMap(rankedPrevious, "honorableKills"),
    appearanceCount: buildRankMap(rankedPrevious.filter((player) => player.hasAppearanceCount), "appearanceCount"),
    achievementsTotal: buildRankMap(rankedPrevious.filter((player) => player.hasAchievementsTotal), "achievementsTotal"),
    playedTime: buildRankMap(rankedPrevious.filter((player) => player.hasPlayedTime), "playedTime"),
  };
  const rankDelta = (ranking, key) => {
    const previousRank = previous[ranking].get(key) ?? 0;
    const currentRank = current[ranking].get(key) ?? 0;
    return previousRank && currentRank ? previousRank - currentRank : 0;
  };

  return rankedPlayers.map((player) => {
    const key = getPlayerKey(player);
    const previousPlayer = previousByKey.get(key);
    const canCompareAppearances = previousPlayer?.hasAppearanceCount === true;
    const canCompareAchievementsTotal = previousPlayer?.hasAchievementsTotal === true
      && previousPlayer.achievementsTotal >= 0
      && player.achievementsTotal >= 0;
    const canComparePlayedTime = previousPlayer?.hasPlayedTime === true;

    return {
      player,
      isNewCharacter: rankedPrevious.length > 0 && !previousNameClassKeys.has(getNameClassKey(player)),
      achievementPointsDelta: previousPlayer ? player.achievementPoints - previousPlayer.achievementPoints : 0,
      achievementRankDelta: rankDelta("achievementPoints", key),
      honorableKillsDelta: previousPlayer ? player.honorableKills - previousPlayer.honorableKills : 0,
      honorableKillsRankDelta: rankDelta("honorableKills", key),
      appearanceCountDelta: canCompareAppearances ? player.appearanceCount - previousPlayer.appearanceCount : 0,
      appearanceRankDelta: canCompareAppearances ? rankDelta("appearanceCount", key) : 0,
      achievementsTotalDelta: canCompareAchievementsTotal
        ? player.achievementsTotal - previousPlayer.achievementsTotal
        : 0,
      achievementsTotalRankDelta: canCompareAchievementsTotal ? rankDelta("achievementsTotal", key) : 0,
      playedTimeDelta: canComparePlayedTime ? player.playedTime - previousPlayer.playedTime : 0,
      playedTimeRankDelta: canComparePlayedTime ? rankDelta("playedTime", key) : 0,
    };
  });
}

function toMinutes(seconds) {
  return Math.trunc(seconds / SECONDS_PER_MINUTE);
}

function buildLookups(players) {
  const sortedUnique = (values) => Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
  const realms = sortedUnique(players.map((player) => player.realm));
  const factions = sortedUnique(players.map((player) => player.faction));

  return {
    realms,
    factions,
    realmIndex: new Map(realms.map((realm, index) => [realm, index])),
    factionIndex: new Map(factions.map((faction, index) => [faction, index])),
  };
}

// A character counts as new when no earlier character had the same name and class. Realm,
// race and faction are left out on purpose: transfers and faction changes are not new.
function getNameClassKey(player) {
  return `${String(player.name).trim().toLowerCase()}::${player.playerClass}`;
}

function generatePlayerSnapshot({ currentPlayers, previousPlayers }) {
  const { full, head, newPlayers } = buildPlayerSnapshots(currentPlayers, previousPlayers);

  fs.mkdirSync(outputDir, { recursive: true });
  writeJson(outputPath, full);
  writeJson(headOutputPath, head);
  writeJson(newPlayersOutputPath, newPlayers);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value));
  const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), filePath)} (${sizeKb} kB)`);
}

module.exports = {
  HEAD_PLAYER_COUNT,
  PLAYER_COLUMNS,
  buildPlayerSnapshots,
  generatePlayerSnapshot,
  getNameClassKey,
};
