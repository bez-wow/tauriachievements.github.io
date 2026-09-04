const fs = require("fs");
const path = require("path");
const { computeServerStats } = require("./compute-server-stats");
const { parsePlayersCsv } = require("./player-data-utils");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "stats.snapshot.json");

function generateServerStatsSnapshot() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source CSV: ${sourcePath}`);
  }

  const players = parsePlayersCsv(fs.readFileSync(sourcePath, "utf8"));

  if (players.length === 0) {
    throw new Error("Players.csv does not contain any data rows.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(computeServerStats(players)));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(
    `Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB from ${players.length} players)`
  );
}

if (require.main === module) {
  generateServerStatsSnapshot();
}

module.exports = { generateServerStatsSnapshot };
