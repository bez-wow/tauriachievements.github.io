const { ensureEnvFiles } = require("./prepare-envs");
const { generatePlayerHistorySnapshot } = require("./generate-player-history");
const { generatePlayerSnapshot } = require("./generate-player-snapshot");

ensureEnvFiles();
generatePlayerSnapshot();
generatePlayerHistorySnapshot();
