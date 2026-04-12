const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parsePlayersCsv, readTextIfExists } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const lastUpdatedPath = path.join(__dirname, "..", "src", "lastUpdated.txt");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.snapshot.json");
const GIT_FILE_MAX_BUFFER = 1024 * 1024 * 64;

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
  const currentAchievementRanks = buildRankMap(normalizedRows, compareAchievementPoints);
  const currentHonorableKillRanks = buildRankMap(normalizedRows, compareHonorableKills);
  const previousAchievementRanks = buildRankMap(previousRows, compareAchievementPoints);
  const previousHonorableKillRanks = buildRankMap(previousRows, compareHonorableKills);

  const snapshot = {
    v: 1,
    r: realmList,
    f: factionList,
    p: normalizedRows.map((player) => {
      const playerKey = getPlayerKey(player);
      const previousPlayer = previousPlayersByKey.get(playerKey);
      const currentAchievementRank = currentAchievementRanks.get(playerKey) ?? 0;
      const previousAchievementRank = previousAchievementRanks.get(playerKey) ?? 0;
      const currentHonorableKillRank = currentHonorableKillRanks.get(playerKey) ?? 0;
      const previousHonorableKillRank = previousHonorableKillRanks.get(playerKey) ?? 0;

      return [
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
      ];
    }),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(snapshot));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB)`);
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

function getPlayerKey(player) {
  return `${player.realm}::${player.name}`;
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

  try {
    const modifiedAt = fs.statSync(sourcePath).mtime;
    if (!Number.isNaN(modifiedAt.getTime())) {
      candidates.push(modifiedAt.toISOString());
    }
  } catch {
    // Ignore stat failures and fall back to the lastUpdated value or the current time.
  }

  if (candidates.length === 0) {
    return new Date().toISOString();
  }

  return candidates.sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[candidates.length - 1];
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
};
