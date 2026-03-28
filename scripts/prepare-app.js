const { ensureEnvFiles } = require("./prepare-envs");
const { generatePlayerSnapshot } = require("./generate-player-snapshot");

ensureEnvFiles();
generatePlayerSnapshot();
