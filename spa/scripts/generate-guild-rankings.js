const fs = require("fs");
const path = require("path");
const { sortByAchievementPoints, sortByRanking } = require("./player-ranking");

const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "guilds.snapshot.json");

// Must match GUILD_SOURCE_LIMIT_OPTIONS in src/app/guild-presence-options.ts: the Guilds page
// offers exactly these "count guild members among the top N players" choices.
const GUILD_SOURCE_LIMITS = [100, 500, 1000];

/**
 * For each source limit N: which guilds have the most members among the top N players by
 * achievement points, and among the top N by honorable kills.
 */
function buildGuildRankingsSnapshot(players, limits = GUILD_SOURCE_LIMITS) {
  const byAchievementPoints = sortByAchievementPoints(players);
  const byHonorableKills = sortByRanking(byAchievementPoints, "honorableKills");
  const rankingsByLimit = {};

  for (const limit of limits) {
    const achievementPlayers = byAchievementPoints.slice(0, limit);
    const honorableKillPlayers = byHonorableKills.slice(0, limit);

    rankingsByLimit[limit] = {
      achievementLeaderboardSize: achievementPlayers.length,
      honorableKillLeaderboardSize: honorableKillPlayers.length,
      achievementGuilds: buildGuildRanking(achievementPlayers, "achievementPoints"),
      honorableKillGuilds: buildGuildRanking(honorableKillPlayers, "honorableKills"),
    };
  }

  return { v: 1, limits: rankingsByLimit };
}

function buildGuildRanking(players, metric) {
  const guilds = new Map();

  for (const player of players) {
    const guildName = player.guild.trim();
    if (!guildName) {
      continue;
    }

    const key = `${player.realm}::${guildName}`;
    const metricValue = player[metric];
    let guild = guilds.get(key);
    if (!guild) {
      guild = {
        key,
        guild: guildName,
        realm: player.realm,
        playerCount: 0,
        metricTotal: 0,
        topMemberName: player.name,
        topMemberMetricValue: metricValue,
        factions: new Set(),
      };
      guilds.set(key, guild);
    }

    guild.playerCount += 1;
    guild.metricTotal += metricValue;

    if (metricValue > guild.topMemberMetricValue
      || (metricValue === guild.topMemberMetricValue && player.name.localeCompare(guild.topMemberName) < 0)) {
      guild.topMemberName = player.name;
      guild.topMemberMetricValue = metricValue;
    }

    if (player.faction === "Alliance" || player.faction === "Horde") {
      guild.factions.add(player.faction);
    }
  }

  return Array.from(guilds.values())
    .sort(compareGuilds)
    .map((guild, index) => ({
      rank: index + 1,
      key: guild.key,
      guild: guild.guild,
      realm: guild.realm,
      faction: guild.factions.size === 1 ? [...guild.factions][0] : "Mixed",
      playerCount: guild.playerCount,
      topMemberName: guild.topMemberName,
      topMemberMetricValue: guild.topMemberMetricValue,
    }));
}

function compareGuilds(left, right) {
  return right.playerCount - left.playerCount
    || right.metricTotal - left.metricTotal
    || right.topMemberMetricValue - left.topMemberMetricValue
    || left.key.localeCompare(right.key);
}

function generateGuildRankingsSnapshot(players) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(buildGuildRankingsSnapshot(players)));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB)`);
}

module.exports = { GUILD_SOURCE_LIMITS, buildGuildRankingsSnapshot, generateGuildRankingsSnapshot };
