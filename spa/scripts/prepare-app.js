const { generateBattlegroundSnapshots } = require("./generate-battleground-snapshot");
const { generateDataManifest } = require("./generate-data-manifest");
const { generateGuildRankingsSnapshot } = require("./generate-guild-rankings");
const { generatePlayerHistorySnapshot } = require("./generate-player-history");
const { generatePlayerSnapshot } = require("./generate-player-snapshot");
const { generateRaidGenders } = require("./generate-raid-genders");
const { generateServerStatsSnapshot } = require("./generate-server-stats");
const { loadPlayerSnapshots } = require("./load-player-snapshots");

const snapshots = loadPlayerSnapshots();

generatePlayerSnapshot(snapshots);
generatePlayerHistorySnapshot(snapshots);
generateServerStatsSnapshot(snapshots.currentPlayers);
generateGuildRankingsSnapshot(snapshots.currentPlayers);
generateBattlegroundSnapshots();
generateRaidGenders(snapshots.currentPlayers);

generateDataManifest();
