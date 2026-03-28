const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "src", "Players.csv");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "players.snapshot.json");

function generatePlayerSnapshot() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source CSV: ${sourcePath}`);
  }

  const csvText = fs.readFileSync(sourcePath, "utf8");
  const rows = parseCsv(csvText);

  if (rows.length < 2) {
    throw new Error("Players.csv does not contain any data rows.");
  }

  const header = rows[0];
  const index = buildHeaderIndex(header);
  const normalizedRows = [];
  const realms = new Set();
  const factions = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every((value) => value.trim() === "")) {
      continue;
    }

    const name = getField(row, index, "Name");
    const realm = getField(row, index, "Realm");

    if (!name || !realm) {
      continue;
    }

    const faction = getField(row, index, "Faction") || "Horde";

    realms.add(realm);
    factions.add(faction);

    normalizedRows.push({
      name,
      race: toNumber(getField(row, index, "Race")),
      gender: toNumber(getField(row, index, "Gender")),
      playerClass: toNumber(getField(row, index, "Class")),
      realm,
      guild: getField(row, index, "Guild"),
      achievementPoints: toNumber(getField(row, index, "AchievementPoints")),
      honorableKills: toNumber(getField(row, index, "HonorableKills")),
      faction,
    });
  }

  const realmList = Array.from(realms).sort((left, right) => left.localeCompare(right));
  const factionList = Array.from(factions).sort((left, right) => left.localeCompare(right));
  const realmIndex = new Map(realmList.map((realm, idx) => [realm, idx]));
  const factionIndex = new Map(factionList.map((faction, idx) => [faction, idx]));

  const snapshot = {
    v: 1,
    r: realmList,
    f: factionList,
    p: normalizedRows.map((player) => [
      player.name,
      player.race,
      player.gender,
      player.playerClass,
      realmIndex.get(player.realm),
      player.guild,
      player.achievementPoints,
      player.honorableKills,
      factionIndex.get(player.faction),
    ]),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(snapshot));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB)`);
}

function parseCsv(input) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.map((row) => row.map((value) => value.trim()));
}

function buildHeaderIndex(header) {
  const index = {};
  header.forEach((name, idx) => {
    if (name) {
      index[name.replace(/^\uFEFF/, "").trim()] = idx;
    }
  });
  return index;
}

function getField(row, index, field) {
  const idx = index[field];
  if (idx === undefined) {
    return "";
  }
  return row[idx] ?? "";
}

function toNumber(value) {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

if (require.main === module) {
  generatePlayerSnapshot();
}

module.exports = {
  generatePlayerSnapshot,
};
