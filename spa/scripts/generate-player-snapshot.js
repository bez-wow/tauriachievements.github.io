const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parsePlayersCsv, readTextIfExists } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const lastUpdatedPath = path.join(__dirname, "..", "src", "lastUpdated.txt");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.snapshot.json");
const headOutputPath = path.join(outputDir, "players.head.snapshot.json");
const GIT_FILE_MAX_BUFFER = 1024 * 1024 * 64;

// The ladder's default view is "top of the achievement-point ranking, unfiltered,
// at most 1000 rows". That answer lives entirely in the highest-ranked slice, so we
// publish it as a separate file the app can paint from while the full set streams in
// behind it. Anything else the user asks for - a search, another sort, a realm or
// class filter - needs every player and triggers a load of players.snapshot.json.
const HEAD_PLAYER_COUNT = 25000;

function generatePlayerSnapshot() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source CSV: ${sourcePath}`);
  }

  const csvText = fs.readFileSync(sourcePath, "utf8");
  const normalizedRows = parsePlayersCsv(csvText);
  const currentTimestamp = getCurrentSnapshotTimestamp();
  const previousRows = loadPreviousSnapshotPlayers(toDayKey(currentTimestamp));

  if (normalizedRows.length === 0) {
    throw new Error("Players.csv does not contain any data rows.");
  }

  const realms = new Set();
  const factions = new Set();

  for (const row of normalizedRows) {
    realms.add(row.realm);
    factions.add(row.faction);
  }

  const realmList = Array.from(realms).sort((left, right) => left.localeCompare(right));
  const factionList = Array.from(factions).sort((left, right) => left.localeCompare(right));
  const realmIndex = new Map(realmList.map((realm, idx) => [realm, idx]));
  const factionIndex = new Map(factionList.map((faction, idx) => [faction, idx]));
  const previousPlayersByKey = new Map(previousRows.map((player) => [getPlayerKey(player), player]));
  const previousNameClassKeys = new Set(previousRows.map((player) => getNameClassKey(player)));
  const currentAchievementRanks = buildRankMap(normalizedRows, compareAchievementPoints);
  const currentHonorableKillRanks = buildRankMap(normalizedRows, compareHonorableKills);
  const currentAppearanceRanks = buildRankMap(normalizedRows, compareAppearances);
  const currentAchievementsTotalRanks = buildRankMap(normalizedRows, compareAchievementsTotal);
  const currentPlayedTimeRanks = buildRankMap(normalizedRows, comparePlayedTime);
  const previousAchievementRanks = buildRankMap(previousRows, compareAchievementPoints);
  const previousHonorableKillRanks = buildRankMap(previousRows, compareHonorableKills);
  const previousAppearanceRanks = buildRankMap(
    previousRows.filter((player) => player.hasAppearanceCount),
    compareAppearances
  );
  const previousAchievementsTotalRanks = buildRankMap(
    previousRows.filter((player) => player.hasAchievementsTotal),
    compareAchievementsTotal
  );
  const previousPlayedTimeRanks = buildRankMap(
    previousRows.filter((player) => player.hasPlayedTime),
    comparePlayedTime
  );

  const snapshot = {
    v: 2,
    r: realmList,
    f: factionList,
    p: normalizedRows.map((player) => {
      const playerKey = getPlayerKey(player);
      const previousPlayer = previousPlayersByKey.get(playerKey);
      const currentAchievementRank = currentAchievementRanks.get(playerKey) ?? 0;
      const previousAchievementRank = previousAchievementRanks.get(playerKey) ?? 0;
      const currentHonorableKillRank = currentHonorableKillRanks.get(playerKey) ?? 0;
      const previousHonorableKillRank = previousHonorableKillRanks.get(playerKey) ?? 0;
      const currentAppearanceRank = currentAppearanceRanks.get(playerKey) ?? 0;
      const previousAppearanceRank = previousAppearanceRanks.get(playerKey) ?? 0;
      const canCompareAppearances = previousPlayer?.hasAppearanceCount === true;
      const currentAchievementsTotalRank = currentAchievementsTotalRanks.get(playerKey) ?? 0;
      const previousAchievementsTotalRank = previousAchievementsTotalRanks.get(playerKey) ?? 0;
      const canCompareAchievementsTotal = previousPlayer?.hasAchievementsTotal === true
        && previousPlayer.achievementsTotal >= 0
        && player.achievementsTotal >= 0;
      const currentPlayedTimeRank = currentPlayedTimeRanks.get(playerKey) ?? 0;
      const previousPlayedTimeRank = previousPlayedTimeRanks.get(playerKey) ?? 0;
      const canComparePlayedTime = previousPlayer?.hasPlayedTime === true;

      const serializedPlayer = [
        player.name,
        player.race,
        player.gender,
        player.playerClass,
        realmIndex.get(player.realm),
        player.guild,
        player.achievementPoints,
        player.honorableKills,
        factionIndex.get(player.faction),
        previousPlayer ? player.achievementPoints - previousPlayer.achievementPoints : 0,
        previousAchievementRank && currentAchievementRank ? previousAchievementRank - currentAchievementRank : 0,
        previousPlayer ? player.honorableKills - previousPlayer.honorableKills : 0,
        previousHonorableKillRank && currentHonorableKillRank ? previousHonorableKillRank - currentHonorableKillRank : 0,
        previousRows.length > 0 && !previousNameClassKeys.has(getNameClassKey(player)),
        player.appearanceCount,
        canCompareAppearances ? player.appearanceCount - previousPlayer.appearanceCount : 0,
        canCompareAppearances && previousAppearanceRank && currentAppearanceRank
          ? previousAppearanceRank - currentAppearanceRank
          : 0,
        player.characterAge ?? "",
        player.achievementsTotal,
        canCompareAchievementsTotal ? player.achievementsTotal - previousPlayer.achievementsTotal : 0,
        canCompareAchievementsTotal && previousAchievementsTotalRank && currentAchievementsTotalRank
          ? previousAchievementsTotalRank - currentAchievementsTotalRank
          : 0,
        player.playedTime,
        canComparePlayedTime ? player.playedTime - previousPlayer.playedTime : 0,
        canComparePlayedTime && previousPlayedTimeRank && currentPlayedTimeRank
          ? previousPlayedTimeRank - currentPlayedTimeRank
          : 0,
        player.ilvl,
      ];

      return serializedPlayer;
    }),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(snapshot));
  fs.writeFileSync(
    headOutputPath,
    JSON.stringify(buildHeadSnapshot(snapshot, normalizedRows, currentAchievementRanks))
  );

  logGeneratedFile(outputPath);
  logGeneratedFile(headOutputPath);
}

// The head holds the globally top-ranked players in global rank order, so the first
// page of the default view is byte-identical to what the full snapshot would produce.
// Realm and faction lists are copied whole: the index columns must resolve the same
// way in both files, or an upgrade to the full set would silently remap every row.
function buildHeadSnapshot(snapshot, normalizedRows, achievementRanks) {
  const rankedEntries = [];

  for (let index = 0; index < normalizedRows.length; index++) {
    const rank = achievementRanks.get(getPlayerKey(normalizedRows[index]));

    if (rank && rank <= HEAD_PLAYER_COUNT) {
      rankedEntries.push({ index, rank });
    }
  }

  rankedEntries.sort((left, right) => left.rank - right.rank);

  return {
    v: snapshot.v,
    r: snapshot.r,
    f: snapshot.f,
    t: snapshot.p.length,
    p: rankedEntries.map((entry) => snapshot.p[entry.index]),
  };
}

function logGeneratedFile(filePath) {
  const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), filePath)} (${sizeKb} kB)`);
}

function loadPreviousSnapshotPlayers(currentDayKey) {
  const latestHistoricalSource = getLatestHistoricalSource(currentDayKey);

  if (!latestHistoricalSource) {
    return [];
  }

  return parsePlayersCsv(latestHistoricalSource);
}

function getLatestHistoricalSource(currentDayKey) {
  const seenDays = new Set([currentDayKey]);
  const historyEntries = readGitHistoryEntries();

  for (const entry of historyEntries) {
    const timestamp = normalizeTimestamp(entry.commitTimestamp) ?? new Date().toISOString();
    const dayKey = toDayKey(timestamp);

    if (!dayKey || seenDays.has(dayKey)) {
      continue;
    }

    return readGitFile(entry.sha, "src/Players.csv");
  }

  return "";
}

function readGitHistoryEntries() {
  try {
    const output = execFileSync("git", ["log", "--format=%H|%cI", "--", "src/Players.csv"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      maxBuffer: GIT_FILE_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, commitTimestamp] = line.split("|");
        return { sha, commitTimestamp };
      });
  } catch {
    return [];
  }
}

function readGitFile(sha, filePath) {
  try {
    return execFileSync("git", ["show", `${sha}:${filePath}`], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      maxBuffer: GIT_FILE_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function buildRankMap(players, compareFn) {
  const ranks = new Map();
  const sortedPlayers = [...players].sort(compareFn);

  for (let index = 0; index < sortedPlayers.length; index++) {
    ranks.set(getPlayerKey(sortedPlayers[index]), index + 1);
  }

  return ranks;
}

function compareAchievementPoints(left, right) {
  if (right.achievementPoints !== left.achievementPoints) {
    return right.achievementPoints - left.achievementPoints;
  }

  if (right.honorableKills !== left.honorableKills) {
    return right.honorableKills - left.honorableKills;
  }

  return getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function compareHonorableKills(left, right) {
  if (right.honorableKills !== left.honorableKills) {
    return right.honorableKills - left.honorableKills;
  }

  if (right.achievementPoints !== left.achievementPoints) {
    return right.achievementPoints - left.achievementPoints;
  }

  return getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function compareAppearances(left, right) {
  if (right.appearanceCount !== left.appearanceCount) {
    return right.appearanceCount - left.appearanceCount;
  }

  if (right.achievementPoints !== left.achievementPoints) {
    return right.achievementPoints - left.achievementPoints;
  }

  if (right.honorableKills !== left.honorableKills) {
    return right.honorableKills - left.honorableKills;
  }

  return getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function compareAchievementsTotal(left, right) {
  if (right.achievementsTotal !== left.achievementsTotal) {
    return right.achievementsTotal - left.achievementsTotal;
  }

  if (right.achievementPoints !== left.achievementPoints) {
    return right.achievementPoints - left.achievementPoints;
  }

  if (right.honorableKills !== left.honorableKills) {
    return right.honorableKills - left.honorableKills;
  }

  return getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function comparePlayedTime(left, right) {
  if (right.playedTime !== left.playedTime) {
    return right.playedTime - left.playedTime;
  }

  if (right.achievementPoints !== left.achievementPoints) {
    return right.achievementPoints - left.achievementPoints;
  }

  if (right.honorableKills !== left.honorableKills) {
    return right.honorableKills - left.honorableKills;
  }

  return getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function getPlayerKey(player) {
  return `${player.realm}::${player.name}`;
}

function getNameClassKey(player) {
  return `${String(player.name).trim().toLowerCase()}::${player.playerClass}`;
}

function getCurrentSnapshotTimestamp() {
  const candidates = [];
  const lastUpdatedTimestamp = normalizeTimestamp(readTextIfExists(lastUpdatedPath));
  const latestGitTimestamp = normalizeTimestamp(readGitHistoryEntries()[0]?.commitTimestamp);

  if (lastUpdatedTimestamp) {
    candidates.push(lastUpdatedTimestamp);
  }

  if (latestGitTimestamp) {
    candidates.push(latestGitTimestamp);
  }

  if (candidates.length > 0) {
    return candidates.sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[candidates.length - 1];
  }

  // A checkout gives every file a fresh mtime. Using that alongside the data
  // timestamps makes an unrelated deployment look like a new player scan and
  // compares Players.csv with its identical latest commit, zeroing all deltas.
  try {
    const modifiedAt = fs.statSync(sourcePath).mtime;
    if (!Number.isNaN(modifiedAt.getTime())) {
      return modifiedAt.toISOString();
    }
  } catch {
  }

  return new Date().toISOString();
}

function normalizeTimestamp(value) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toDayKey(timestamp) {
  return timestamp ? timestamp.slice(0, 10) : "";
}

if (require.main === module) {
  generatePlayerSnapshot();
}

module.exports = {
  generatePlayerSnapshot,
  buildHeadSnapshot,
  HEAD_PLAYER_COUNT,
  getNameClassKey,
  getPlayerKey,
  buildRankMap,
  compareAchievementPoints,
  compareHonorableKills,
  compareAppearances,
  compareAchievementsTotal,
  comparePlayedTime,
};
