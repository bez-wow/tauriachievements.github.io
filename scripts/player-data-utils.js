const fs = require("fs");

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

function parsePlayersCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0];
  const index = buildHeaderIndex(header);
  const hasAppearanceCount = index.AppearanceCount !== undefined;
  const hasAchievementsTotal = index.AchievementsTotal !== undefined;
  const hasPlayedTime = index.PlayedTime !== undefined;
  const players = [];

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

    players.push({
      name,
      race: toNumber(getField(row, index, "Race")),
      gender: toNumber(getField(row, index, "Gender")),
      playerClass: toNumber(getField(row, index, "Class")),
      realm,
      guild: getField(row, index, "Guild"),
      achievementPoints: toNumber(getField(row, index, "AchievementPoints")),
      honorableKills: toNumber(getField(row, index, "HonorableKills")),
      appearanceCount: toNumber(getField(row, index, "AppearanceCount")),
      hasAppearanceCount,
      achievementsTotal: toNumber(getField(row, index, "AchievementsTotal")),
      hasAchievementsTotal,
      playedTime: toNumber(getField(row, index, "PlayedTime")),
      hasPlayedTime,
      characterAge: getField(row, index, "CharacterAge"),
      faction: getField(row, index, "Faction") || "Horde",
    });
  }

  return players;
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return fs.readFileSync(filePath, "utf8");
}

module.exports = {
  parsePlayersCsv,
  readTextIfExists,
};
