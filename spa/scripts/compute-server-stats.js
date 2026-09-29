// Server-wide aggregates for the /stats page.
//
// These figures only change when Players.csv is rescanned, so they are computed once at
// build time rather than by every visitor. The page fetches the result and draws it.
//
// The seam with the app: anything that names a threshold ships here, because a bucket
// label is meaningless apart from the bounds that produced it. Anything that names a
// game entity or picks a color stays in the component, so restyling the charts or
// renaming a class never requires regenerating data.

const AP_BREAKS = [0, 1000, 3000, 6000, 10000, 15000, 20000, Infinity];
const AP_LABELS = ["<1k", "1k–3k", "3k–6k", "6k–10k", "10k–15k", "15k–20k", "20k+"];

const HK_BREAKS = [0, 1000, 5000, 10000, 25000, 50000, 100000, Infinity];
const HK_LABELS = ["<1k", "1k–5k", "5k–10k", "10k–25k", "25k–50k", "50k–100k", "100k+"];

const FACTION_ORDER = ["Horde", "Alliance", "Neutral"];
const TOP_GUILD_COUNT = 10;

function computeServerStats(players) {
  if (!players.length) {
    return emptyServerStats();
  }

  const factionCounts = new Map();
  const classCounts = new Map();
  const raceCounts = new Map();
  const guildCounts = new Map();
  const realmCounts = new Map();

  const apBuckets = new Array(AP_LABELS.length).fill(0);
  const hkBuckets = new Array(HK_LABELS.length).fill(0);

  let totalAchievementPoints = 0;
  let maxAchievementPoints = 0;
  let totalHonorableKills = 0;
  let maxHonorableKills = 0;
  let guildedPlayers = 0;

  for (const player of players) {
    increment(factionCounts, player.faction);
    increment(classCounts, player.playerClass);
    increment(raceCounts, player.race);
    increment(realmCounts, player.realm);

    if (player.guild) {
      guildedPlayers++;
      increment(guildCounts, `${player.guild} (${player.realm})`);
    }

    totalAchievementPoints += player.achievementPoints;
    maxAchievementPoints = Math.max(maxAchievementPoints, player.achievementPoints);
    totalHonorableKills += player.honorableKills;
    maxHonorableKills = Math.max(maxHonorableKills, player.honorableKills);

    apBuckets[bucketIndex(AP_BREAKS, player.achievementPoints)]++;
    hkBuckets[bucketIndex(HK_BREAKS, player.honorableKills)]++;
  }

  return {
    totalPlayers: players.length,
    guildedPlayers,
    uniqueGuilds: guildCounts.size,
    avgAchievementPoints: Math.round(totalAchievementPoints / players.length),
    maxAchievementPoints,
    avgHonorableKills: Math.round(totalHonorableKills / players.length),
    maxHonorableKills,
    factions: orderedFactions(factionCounts),
    classes: byDescendingCount(classCounts).map(([id, count]) => ({ id, count })),
    races: byDescendingCount(raceCounts).map(([id, count]) => ({ id, count })),
    guilds: byDescendingCount(guildCounts)
      .slice(0, TOP_GUILD_COUNT)
      .map(([name, count]) => ({ name, count })),
    realms: byDescendingCount(realmCounts).map(([name, count]) => ({ name, count })),
    apBucketLabels: [...AP_LABELS],
    apBucketCounts: apBuckets,
    hkBucketLabels: [...HK_LABELS],
    hkBucketCounts: hkBuckets,
  };
}

function emptyServerStats() {
  return {
    totalPlayers: 0,
    guildedPlayers: 0,
    uniqueGuilds: 0,
    avgAchievementPoints: 0,
    maxAchievementPoints: 0,
    avgHonorableKills: 0,
    maxHonorableKills: 0,
    factions: [],
    classes: [],
    races: [],
    guilds: [],
    realms: [],
    apBucketLabels: [...AP_LABELS],
    apBucketCounts: new Array(AP_LABELS.length).fill(0),
    hkBucketLabels: [...HK_LABELS],
    hkBucketCounts: new Array(HK_LABELS.length).fill(0),
  };
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Index of the highest break the value clears. Lower bound inclusive. */
function bucketIndex(breaks, value) {
  for (let index = breaks.length - 2; index >= 0; index--) {
    if (value >= breaks[index]) {
      return index;
    }
  }

  return 0;
}

function byDescendingCount(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

/** The two playable factions lead, in their conventional order; anything else follows. */
function orderedFactions(factionCounts) {
  const known = FACTION_ORDER.filter((faction) => factionCounts.has(faction));
  const rest = [...factionCounts.keys()].filter((faction) => !FACTION_ORDER.includes(faction));

  return [...known, ...rest].map((name) => ({ name, count: factionCounts.get(name) ?? 0 }));
}

module.exports = {
  computeServerStats,
  emptyServerStats,
  AP_LABELS,
  HK_LABELS,
};
