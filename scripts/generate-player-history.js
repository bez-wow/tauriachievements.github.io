const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parsePlayersCsv, readTextIfExists } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const lastUpdatedPath = path.join(__dirname, "..", "src", "lastUpdated.txt");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.history.snapshot.json");

const SNAPSHOT_DAY_LIMIT = 21;
const MOVERS_LIMIT = 20;
const GIT_FILE_MAX_BUFFER = 1024 * 1024 * 64;

function generatePlayerHistorySnapshot() {
  const snapshotSources = collectSnapshotSources();
  const trackedKeys = collectTrackedPlayerKeys(snapshotSources);
  const latestSnapshotSource = snapshotSources[snapshotSources.length - 1];
  const previousSnapshotSource = snapshotSources[snapshotSources.length - 2];
  const latestPlayers = latestSnapshotSource ? parsePlayersCsv(latestSnapshotSource.loadCsvText()) : [];
  const previousPlayers = previousSnapshotSource ? parsePlayersCsv(previousSnapshotSource.loadCsvText()) : [];
  const movers = {
    achievementPoints: computeTopMoversForSnapshots(latestPlayers, previousPlayers, "achievementPoints"),
    honorableKills: computeTopMoversForSnapshots(latestPlayers, previousPlayers, "honorableKills"),
  };

  const payload = {
    v: 1,
    g: new Date().toISOString(),
    c: trackedKeys.size,
    s: snapshotSources.map((source) => source.timestamp),
    m: {
      a: movers.achievementPoints,
      h: movers.honorableKills,
    },
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(
    `Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB, ${snapshotSources.length} snapshots, ${trackedKeys.size} tracked players)`
  );
}

function collectSnapshotSources() {
  const sources = [];
  const currentTimestamp = getCurrentSnapshotTimestamp();
  const currentDayKey = toDayKey(currentTimestamp);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source CSV: ${sourcePath}`);
  }

  sources.push({
    id: "working-tree",
    timestamp: currentTimestamp,
    dayKey: currentDayKey,
    loadCsvText: () => fs.readFileSync(sourcePath, "utf8"),
  });

  for (const historicalSource of getHistoricalGitSources(currentDayKey)) {
    sources.push(historicalSource);
  }

  return sources
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-SNAPSHOT_DAY_LIMIT);
}

function getHistoricalGitSources(currentDayKey) {
  const sources = [];
  const seenDays = new Set([currentDayKey]);
  const historyEntries = readGitHistoryEntries();

  for (const entry of historyEntries) {
    if (sources.length >= SNAPSHOT_DAY_LIMIT - 1) {
      break;
    }

    const timestamp = normalizeTimestamp(entry.commitTimestamp) ?? new Date().toISOString();
    const dayKey = toDayKey(timestamp);
    if (!dayKey || seenDays.has(dayKey)) {
      continue;
    }

    seenDays.add(dayKey);
    sources.push({
      id: entry.sha,
      timestamp,
      dayKey,
      loadCsvText: () => readGitFile(entry.sha, "src/Players.csv"),
    });
  }

  return sources;
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
    console.warn("Skipping history generation from git log. Falling back to the current snapshot only.");
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

function collectTrackedPlayerKeys(snapshotSources) {
  const trackedKeys = new Set();

  for (const source of snapshotSources) {
    const players = parsePlayersCsv(source.loadCsvText());
    collectAllKeys(players, trackedKeys);
  }

  return trackedKeys;
}

function collectAllKeys(players, trackedKeys) {
  for (const player of players) {
    trackedKeys.add(getPlayerKey(player));
  }
}

function computeTopMoversForSnapshots(currentPlayers, previousPlayers, sortMetric) {
  if (currentPlayers.length === 0 || previousPlayers.length === 0) {
    return [];
  }

  const compareFn = sortMetric === "achievementPoints" ? compareAchievementPoints : compareHonorableKills;
  const currentRanks = buildRankMap(currentPlayers, compareFn);
  const previousRanks = buildRankMap(previousPlayers, compareFn);
  const previousPlayersByKey = new Map(previousPlayers.map((player) => [getPlayerKey(player), player]));
  const movers = [];

  for (const player of currentPlayers) {
    const playerKey = getPlayerKey(player);
    const previousPlayer = previousPlayersByKey.get(playerKey);
    if (!previousPlayer) {
      continue;
    }

    const currentRank = currentRanks.get(playerKey) ?? 0;
    const previousRank = previousRanks.get(playerKey) ?? 0;
    if (!currentRank || !previousRank) {
      continue;
    }

    const delta = previousRank - currentRank;
    const previousAchievementPoints = previousPlayer.achievementPoints;
    const currentAchievementPoints = player.achievementPoints;
    const previousHonorableKills = previousPlayer.honorableKills;
    const currentHonorableKills = player.honorableKills;
    const achievementPointsDelta = currentAchievementPoints - previousAchievementPoints;
    const honorableKillsDelta = currentHonorableKills - previousHonorableKills;
    const metricDelta = sortMetric === "achievementPoints"
      ? achievementPointsDelta
      : honorableKillsDelta;

    if (metricDelta <= 0) {
      continue;
    }

    movers.push([
      playerKey,
      delta,
      previousRank,
      currentRank,
      achievementPointsDelta,
      honorableKillsDelta,
      previousAchievementPoints,
      currentAchievementPoints,
      previousHonorableKills,
      currentHonorableKills,
      player.race ?? 0,
      player.gender ?? 0,
      player.playerClass ?? 0,
    ]);
  }

  return movers
    .sort((left, right) => {
      const leftMetricDelta = sortMetric === "achievementPoints" ? left[4] : left[5];
      const rightMetricDelta = sortMetric === "achievementPoints" ? right[4] : right[5];

      if (rightMetricDelta !== leftMetricDelta) {
        return rightMetricDelta - leftMetricDelta;
      }

      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      if (left[3] !== right[3]) {
        return left[3] - right[3];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, MOVERS_LIMIT);
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
  generatePlayerHistorySnapshot();
}

module.exports = {
  generatePlayerHistorySnapshot,
};
