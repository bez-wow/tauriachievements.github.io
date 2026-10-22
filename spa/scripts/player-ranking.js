const RANKINGS = Object.freeze({
  achievementPoints: Object.freeze(["achievementPoints", "honorableKills"]),
  honorableKills: Object.freeze(["honorableKills", "achievementPoints"]),
  achievementsTotal: Object.freeze(["achievementsTotal", "achievementPoints", "honorableKills"]),
  playedTime: Object.freeze(["playedTime", "achievementPoints", "honorableKills"]),
  appearanceCount: Object.freeze(["appearanceCount", "achievementPoints", "honorableKills"]),
  ilvl: Object.freeze(["ilvl", "achievementPoints", "honorableKills"]),
});

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

function compareAchievementPoints(left, right) {
  return compareAchievementPointsFields(left, right)
    || getPlayerKey(left).localeCompare(getPlayerKey(right));
}

function sortByAchievementPoints(players) {
  return [...players].sort(compareAchievementPoints);
}

function sortByRanking(playersInAchievementOrder, rankingName) {
  const fields = RANKINGS[rankingName];
  if (!fields) {
    throw new Error(`Unknown ranking: ${rankingName}`);
  }

  return rankingName === "achievementPoints"
    ? [...playersInAchievementOrder]
    : [...playersInAchievementOrder].sort(compareByFields(fields));
}

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
