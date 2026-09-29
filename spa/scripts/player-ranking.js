// The one definition of how every leaderboard is ordered. The build uses it to compute
// ranks and rank deltas, and ships RANKINGS inside the player snapshot so the browser
// orders its ladders by exactly the same rules instead of keeping its own copy.
//
// Each ranking is a list of numeric fields compared highest-first. Ties that survive the
// whole list fall back to the achievement-point order (see sortByRanking), which itself
// ends on the player key, so every ranking is total and deterministic.
const RANKINGS = Object.freeze({
  achievementPoints: Object.freeze(["achievementPoints", "honorableKills"]),
  honorableKills: Object.freeze(["honorableKills", "achievementPoints"]),
  achievementsTotal: Object.freeze(["achievementsTotal", "achievementPoints", "honorableKills"]),
  playedTime: Object.freeze(["playedTime", "achievementPoints", "honorableKills"]),
  appearanceCount: Object.freeze(["appearanceCount", "achievementPoints", "honorableKills"]),
  ilvl: Object.freeze(["ilvl", "achievementPoints", "honorableKills"]),
});

// Falling back to achievement-point order is only equivalent to falling back to the player
// key when every ranking also compares achievement points and honorable kills: players still
// tied after that are tied on both, and the achievement-point order lists them by key.
for (const [name, fields] of Object.entries(RANKINGS)) {
  if (!fields.includes("achievementPoints") || !fields.includes("honorableKills")) {
    throw new Error(`Ranking "${name}" must compare achievementPoints and honorableKills.`);
  }
}

function getPlayerKey(player) {
  return `${player.realm}::${player.name}`;
}

function compareByFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      if (right[field] !== left[field]) {
        return right[field] - left[field];
      }
    }

    return 0;
  };
}

const compareAchievementPointsFields = compareByFields(RANKINGS.achievementPoints);

/** The canonical order: achievement points, then honorable kills, then player key. */
function compareAchievementPoints(left, right) {
  return compareAchievementPointsFields(left, right)
    || getPlayerKey(left).localeCompare(getPlayerKey(right));
}

/** Players in the canonical achievement-point order. Every other ranking starts from this. */
function sortByAchievementPoints(players) {
  return [...players].sort(compareAchievementPoints);
}

/**
 * Orders players that are already in achievement-point order by the named ranking.
 * Array#sort is stable, so remaining ties keep their achievement-point order.
 */
function sortByRanking(playersInAchievementOrder, rankingName) {
  const fields = RANKINGS[rankingName];
  if (!fields) {
    throw new Error(`Unknown ranking: ${rankingName}`);
  }

  return rankingName === "achievementPoints"
    ? [...playersInAchievementOrder]
    : [...playersInAchievementOrder].sort(compareByFields(fields));
}

/** Map of player key -> 1-based rank for one ranking. */
function buildRankMap(playersInAchievementOrder, rankingName) {
  const ranks = new Map();
  const sorted = sortByRanking(playersInAchievementOrder, rankingName);

  for (let index = 0; index < sorted.length; index++) {
    ranks.set(getPlayerKey(sorted[index]), index + 1);
  }

  return ranks;
}

module.exports = {
  RANKINGS,
  buildRankMap,
  compareAchievementPoints,
  getPlayerKey,
  sortByAchievementPoints,
  sortByRanking,
};
