const fs = require("fs");
const path = require("path");
const { buildRankMap, getPlayerKey, sortByAchievementPoints } = require("./player-ranking");

const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.history.snapshot.json");

const MOVER_METRICS = ["achievementPoints", "honorableKills", "playedTime", "appearanceCount"];

function buildHistorySnapshot({ currentPlayers, previousPlayers, snapshotTimestamps }) {
  const [achievementPoints, honorableKills, playedTime, appearanceCount] = MOVER_METRICS.map((metric) =>
    computeTopMoversForSnapshots(currentPlayers, previousPlayers, metric)
  );

  return {
    v: 4,
    g: new Date().toISOString(),
    s: snapshotTimestamps,
    m: { a: achievementPoints, h: honorableKills, t: playedTime, p: appearanceCount },
  };
}

function generatePlayerHistorySnapshot(snapshots) {
  const payload = buildHistorySnapshot(snapshots);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(
    `Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB, ${payload.s.length} snapshots)`
  );
}

function computeTopMoversForSnapshots(currentPlayers, previousPlayers, sortMetric) {
  if (currentPlayers.length === 0 || previousPlayers.length === 0) {
    return [];
  }

  const currentRanks = buildRankMap(sortByAchievementPoints(currentPlayers), sortMetric);
  const previousRanks = buildRankMap(sortByAchievementPoints(previousPlayers), sortMetric);
  const previousPlayersByKey = new Map(previousPlayers.map((player) => [getPlayerKey(player), player]));
  const movers = [];

  for (const player of currentPlayers) {
    const playerKey = getPlayerKey(player);
    const previousPlayer = previousPlayersByKey.get(playerKey);
    if (!previousPlayer) {
      continue;
    }

    if (sortMetric === "appearanceCount" && !previousPlayer.hasAppearanceCount) {
      continue;
    }

    // A zero count can mean the appearance data was unavailable during the
    // previous scan. Treat the next positive count as a baseline instead of
    // reporting the character's entire collection as a one-day gain.
    if (sortMetric === "appearanceCount"
      && previousPlayer.appearanceCount === 0
      && player.appearanceCount > 0) {
      continue;
    }

    if (sortMetric === "playedTime" && !previousPlayer.hasPlayedTime) {
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
    const previousAppearanceCount = previousPlayer.hasAppearanceCount ? previousPlayer.appearanceCount : player.appearanceCount;
    const currentAppearanceCount = player.appearanceCount;
    const appearanceCountDelta = currentAppearanceCount - previousAppearanceCount;
    const previousPlayedTime = previousPlayer.hasPlayedTime ? previousPlayer.playedTime : player.playedTime;
    const currentPlayedTime = player.playedTime;
    const playedTimeDelta = currentPlayedTime - previousPlayedTime;
    const metricDelta = sortMetric === "achievementPoints"
      ? achievementPointsDelta
      : sortMetric === "honorableKills"
        ? honorableKillsDelta
        : sortMetric === "playedTime"
          ? playedTimeDelta
          : appearanceCountDelta;

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
      player.guild ?? "",
      appearanceCountDelta,
      previousAppearanceCount,
      currentAppearanceCount,
      playedTimeDelta,
      previousPlayedTime,
      currentPlayedTime,
    ]);
  }

  return movers
    .sort((left, right) => {
      const metricDeltaIndex = sortMetric === "achievementPoints"
        ? 4
        : sortMetric === "honorableKills"
          ? 5
          : sortMetric === "playedTime"
            ? 17
            : 14;
      const leftMetricDelta = left[metricDeltaIndex];
      const rightMetricDelta = right[metricDeltaIndex];

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
    });
}

module.exports = {
  buildHistorySnapshot,
  computeTopMoversForSnapshots,
  generatePlayerHistorySnapshot,
};
