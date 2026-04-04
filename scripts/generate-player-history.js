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
  const { playerHistories, movers } = buildPlayerHistories(snapshotSources, trackedKeys);

  const payload = {
    v: 1,
    g: new Date().toISOString(),
    c: playerHistories.size,
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
    `Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB, ${snapshotSources.length} snapshots, ${playerHistories.size} tracked players)`
  );
}

function collectSnapshotSources() {
  const sources = [];
  const currentTimestamp = normalizeTimestamp(readTextIfExists(lastUpdatedPath)) ?? new Date().toISOString();
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

function buildPlayerHistories(snapshotSources, trackedKeys) {
  const playerHistories = new Map();
  const snapshotCount = snapshotSources.length;

  for (let snapshotIndex = 0; snapshotIndex < snapshotCount; snapshotIndex++) {
    const players = parsePlayersCsv(snapshotSources[snapshotIndex].loadCsvText());
    const achievementSorted = [...players].sort(compareAchievementPoints);
    const honorableKillsSorted = [...players].sort(compareHonorableKills);

    assignRanks(playerHistories, trackedKeys, snapshotIndex, achievementSorted, "achievement");
    assignRanks(playerHistories, trackedKeys, snapshotIndex, honorableKillsSorted, "honorableKills");
  }

  return {
    playerHistories,
    movers: {
      achievementPoints: computeTopMovers(playerHistories, "achievementRanks", "achievementPoints"),
      honorableKills: computeTopMovers(playerHistories, "honorableRanks", "honorableKills"),
    },
  };
}

function assignRanks(playerHistories, trackedKeys, snapshotIndex, sortedPlayers, field) {
  for (let index = 0; index < sortedPlayers.length; index++) {
    const player = sortedPlayers[index];
    const playerKey = getPlayerKey(player);

    if (!trackedKeys.has(playerKey)) {
      continue;
    }

    const existing = playerHistories.get(playerKey) ?? {
      achievementRanks: [],
      honorableRanks: [],
      achievementPoints: [],
      honorableKills: [],
      race: 0,
      gender: 0,
      classId: 0,
    };

    if (field === "achievement") {
      existing.achievementRanks[snapshotIndex] = index + 1;
    } else {
      existing.honorableRanks[snapshotIndex] = index + 1;
    }

    existing.achievementPoints[snapshotIndex] = player.achievementPoints;
    existing.honorableKills[snapshotIndex] = player.honorableKills;
    existing.race = player.race;
    existing.gender = player.gender;
    existing.classId = player.playerClass;

    playerHistories.set(playerKey, existing);
  }
}

function computeTopMovers(playerHistories, field, sortMetric) {
  let snapshotCount = 0;
  for (const history of playerHistories.values()) {
    snapshotCount = Math.max(snapshotCount, history[field]?.length ?? 0);
  }

  if (snapshotCount < 2) {
    return [];
  }

  const currentSnapshotIndex = snapshotCount - 1;
  const previousSnapshotIndex = currentSnapshotIndex - 1;
  const movers = [];

  for (const [playerKey, history] of playerHistories.entries()) {
    const ranks = history[field];
    const currentRank = ranks[currentSnapshotIndex] ?? 0;
    const previousRank = ranks[previousSnapshotIndex] ?? 0;

    if (!currentRank || !previousRank) {
      continue;
    }

    const delta = previousRank - currentRank;
    if (delta <= 0) {
      continue;
    }

    const previousAchievementPoints = history.achievementPoints[previousSnapshotIndex] ?? 0;
    const currentAchievementPoints = history.achievementPoints[currentSnapshotIndex] ?? 0;
    const previousHonorableKills = history.honorableKills[previousSnapshotIndex] ?? 0;
    const currentHonorableKills = history.honorableKills[currentSnapshotIndex] ?? 0;
    const achievementPointsDelta = currentAchievementPoints - previousAchievementPoints;
    const honorableKillsDelta = currentHonorableKills - previousHonorableKills;

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
      history.race ?? 0,
      history.gender ?? 0,
      history.classId ?? 0,
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
