const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parsePlayersCsv, readTextIfExists } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const lastUpdatedPath = path.join(__dirname, "..", "src", "lastUpdated.txt");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.history.snapshot.json");
const playerProfileMetaOutputPath = path.join(outputDir, "player-profile.meta.json");
const playerProfileBucketDir = path.join(outputDir, "player-profile-buckets");

const SNAPSHOT_DAY_LIMIT = 21;
const MOVERS_LIMIT = 20;
const PLAYER_PROFILE_BUCKET_COUNT = 128;
const GIT_FILE_MAX_BUFFER = 1024 * 1024 * 64;

function generatePlayerHistorySnapshot() {
  const snapshotSources = collectSnapshotSources();
  const trackedKeys = collectTrackedPlayerKeys(snapshotSources);
  const { playerHistories, movers } = buildPlayerHistories(snapshotSources, trackedKeys);
  const currentPlayers = parsePlayersCsv(snapshotSources[snapshotSources.length - 1]?.loadCsvText?.() ?? "");

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
  generatePlayerProfileBuckets(snapshotSources, currentPlayers, playerHistories);

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

function generatePlayerProfileBuckets(snapshotSources, currentPlayers, playerHistories) {
  const buckets = Array.from({ length: PLAYER_PROFILE_BUCKET_COUNT }, () => []);
  const snapshots = snapshotSources.map((source) => source.timestamp);

  for (const player of currentPlayers) {
    const playerKey = getPlayerKey(player);
    const history = playerHistories.get(playerKey);
    if (!history) {
      continue;
    }

    const bucketId = getPlayerProfileBucketId(playerKey);
    buckets[bucketId].push(serializePlayerProfileRecord(playerKey, history));
  }

  fs.mkdirSync(playerProfileBucketDir, { recursive: true });
  fs.writeFileSync(playerProfileMetaOutputPath, JSON.stringify({
    v: 1,
    g: new Date().toISOString(),
    b: PLAYER_PROFILE_BUCKET_COUNT,
    s: snapshots,
  }));

  for (let index = 0; index < PLAYER_PROFILE_BUCKET_COUNT; index++) {
    const bucketLabel = formatBucketLabel(index);
    const bucketPath = path.join(playerProfileBucketDir, `${bucketLabel}.json`);
    const bucketPayload = {
      v: 1,
      p: buckets[index].sort((left, right) => left[0].localeCompare(right[0])),
    };

    fs.writeFileSync(bucketPath, JSON.stringify(bucketPayload));
  }

  console.log(
    `Generated ${path.relative(process.cwd(), playerProfileMetaOutputPath)} and ${PLAYER_PROFILE_BUCKET_COUNT} player profile buckets (${currentPlayers.length} current players)`
  );
}

function serializePlayerProfileRecord(playerKey, history) {
  const firstSeenIndex = findFirstDefinedIndex(history.achievementPoints);
  const lastSeenIndex = findLastDefinedIndex(history.achievementPoints);

  return [
    playerKey,
    firstSeenIndex,
    lastSeenIndex,
    getBestRank(history.achievementRanks),
    getBestRank(history.honorableRanks),
    serializeHistorySeries(history.achievementPoints),
    serializeHistorySeries(history.honorableKills),
  ];
}

function serializeHistorySeries(values) {
  const serialized = [];

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      continue;
    }

    serialized.push(index, value);
  }

  return serialized;
}

function getBestRank(ranks) {
  let bestRank = 0;

  for (const rank of ranks) {
    if (!Number.isFinite(rank) || rank <= 0) {
      continue;
    }

    if (bestRank === 0 || rank < bestRank) {
      bestRank = rank;
    }
  }

  return bestRank;
}

function findFirstDefinedIndex(values) {
  for (let index = 0; index < values.length; index++) {
    if (Number.isFinite(values[index])) {
      return index;
    }
  }

  return -1;
}

function findLastDefinedIndex(values) {
  for (let index = values.length - 1; index >= 0; index--) {
    if (Number.isFinite(values[index])) {
      return index;
    }
  }

  return -1;
}

function getPlayerProfileBucketId(playerKey) {
  let hash = 2166136261;

  for (let index = 0; index < playerKey.length; index++) {
    hash ^= playerKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % PLAYER_PROFILE_BUCKET_COUNT;
}

function formatBucketLabel(index) {
  return index.toString(16).padStart(2, "0");
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
