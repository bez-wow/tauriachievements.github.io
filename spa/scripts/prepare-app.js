// Turns the raw data in src/ into the files the app loads. Players.csv is parsed once here
// and the parsed rows are handed to every generator, instead of each generator reading and
// parsing the 20+ MB file on its own.
const { generateDataManifest } = require("./generate-data-manifest");
const { generateGuildRankingsSnapshot } = require("./generate-guild-rankings");
const { generatePlayerHistorySnapshot } = require("./generate-player-history");
const { generatePlayerSnapshot } = require("./generate-player-snapshot");
const { generateServerStatsSnapshot } = require("./generate-server-stats");
const { loadPlayerSnapshots } = require("./load-player-snapshots");

const snapshots = loadPlayerSnapshots();

generatePlayerSnapshot(snapshots);
generatePlayerHistorySnapshot(snapshots);
generateServerStatsSnapshot(snapshots.currentPlayers);
generateGuildRankingsSnapshot(snapshots.currentPlayers);

// Last, so it hashes the files generated above.
generateDataManifest();
