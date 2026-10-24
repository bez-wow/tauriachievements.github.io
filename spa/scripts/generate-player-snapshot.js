const fs = require("fs");
const path = require("path");
const {
  RANKINGS,
  buildRankMap,
  getPlayerKey,
  sortByAchievementPoints,
} = require("./player-ranking");
const { SECONDS_PER_MINUTE, buildPreviousCharacterLookup } = require("./player-data-utils");

const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.snapshot.json");
const headOutputPath = path.join(outputDir, "players.head.snapshot.json");
const newPlayersOutputPath = path.join(outputDir, "new-players.snapshot.json");

const SNAPSHOT_VERSION = 4;

const HEAD_PLAYER_COUNT = 25000;

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

function buildPlayerSnapshots(currentPlayers, previousPlayers, previousScanTimestamp) {
  const rankedPlayers = sortByAchievementPoints(currentPlayers);
  const rows = buildPlayerRows(rankedPlayers, previousPlayers, previousScanTimestamp);
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

function buildPlayerRows(rankedPlayers, previousPlayers, previousScanTimestamp) {
  const rankedPrevious = sortByAchievementPoints(previousPlayers);
  const findPreviousPlayer = buildPreviousCharacterLookup(rankedPrevious, previousScanTimestamp);
  const previousNameClassKeys = new Set(rankedPrevious.map(getNameClassKey));
  const current = {
    achievementPoints: buildRankMap(rankedPlayers, "achievementPoints"),
    honorableKills: buildRankMap(rankedPlayers, "honorableKills"),
    appearanceCount: buildRankMap(rankedPlayers, "appearanceCount"),
    achievementsTotal: buildRankMap(rankedPlayers, "achievementsTotal"),
    playedTime: buildRankMap(rankedPlayers, "playedTime"),
  };
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
    const previousPlayer = findPreviousPlayer(player);
    const canCompare = previousPlayer !== undefined;
    const canCompareAppearances = previousPlayer?.hasAppearanceCount === true;
    const canCompareAchievementsTotal = previousPlayer?.hasAchievementsTotal === true
      && previousPlayer.achievementsTotal >= 0
      && player.achievementsTotal >= 0;
    const canComparePlayedTime = previousPlayer?.hasPlayedTime === true;

    return {
      player,
      isNewCharacter: rankedPrevious.length > 0 && !previousNameClassKeys.has(getNameClassKey(player)),
      achievementPointsDelta: canCompare ? player.achievementPoints - previousPlayer.achievementPoints : 0,
      achievementRankDelta: canCompare ? rankDelta("achievementPoints", key) : 0,
      honorableKillsDelta: canCompare ? player.honorableKills - previousPlayer.honorableKills : 0,
      honorableKillsRankDelta: canCompare ? rankDelta("honorableKills", key) : 0,
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

function getNameClassKey(player) {
  return `${String(player.name).trim().toLowerCase()}::${player.playerClass}`;
}

function generatePlayerSnapshot({ currentPlayers, previousPlayers, previousScanTimestamp }) {
  const { full, head, newPlayers } = buildPlayerSnapshots(currentPlayers, previousPlayers, previousScanTimestamp);

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
