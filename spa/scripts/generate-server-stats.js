const fs = require("fs");
const path = require("path");
const { computeServerStats } = require("./compute-server-stats");
const { parsePlayersCsv } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "stats.snapshot.json");
const FILTER_REALMS = ["Evermoon", "Tauri", "WoD"];
const FILTER_LEVELS = [110, 100, 90, 80];
const ALL_FILTER_VALUE = "*";

function statsFilterKey(realm, level) {
  return `${realm ?? ALL_FILTER_VALUE}|${level ?? ALL_FILTER_VALUE}`;
}

function buildServerStatsSnapshot(players) {
  const filters = {};
  const realms = [undefined, ...FILTER_REALMS];
  const levels = [undefined, ...FILTER_LEVELS];

  for (const realm of realms) {
    for (const level of levels) {
      const filteredPlayers = players.filter((player) =>
        (realm === undefined || player.realm === realm)
        && (level === undefined || player.level === level)
      );
      filters[statsFilterKey(realm, level)] = computeServerStats(filteredPlayers);
    }
  }

  return { version: 2, filters };
}

function generateServerStatsSnapshot() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source CSV: ${sourcePath}`);
  }

  const players = parsePlayersCsv(fs.readFileSync(sourcePath, "utf8"));

  if (players.length === 0) {
    throw new Error("Players.csv does not contain any data rows.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(buildServerStatsSnapshot(players)));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(
    `Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB from ${players.length} players)`
  );
}

if (require.main === module) {
  generateServerStatsSnapshot();
}

module.exports = { buildServerStatsSnapshot, generateServerStatsSnapshot, statsFilterKey };
