const { generatePlayerHistorySnapshot } = require("./generate-player-history");
const { generatePlayerSnapshot } = require("./generate-player-snapshot");
const { generateServerStatsSnapshot } = require("./generate-server-stats");

generatePlayerSnapshot();
generatePlayerHistorySnapshot();
generateServerStatsSnapshot();
