const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SPA_ROOT = path.join(__dirname, "..");
const PLAYERS_CSV_PATHSPEC = "src/Players.csv";
const GIT_FILE_MAX_BUFFER = 1024 * 1024 * 64;
const COMMIT_LINE_PATTERN = /^([0-9a-f]{40})\|(.+)$/;

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toEpochDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 0;
  }

  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? 0 : Math.round(time / MS_PER_DAY);
}

const SECONDS_PER_MINUTE = 60;

function toWholeMinuteSeconds(value) {
  return Math.floor(toNumber(value) / SECONDS_PER_MINUTE) * SECONDS_PER_MINUTE;
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
      level: toNumber(getField(row, index, "Level")),
      realm,
      guild: getField(row, index, "Guild"),
      achievementPoints: toNumber(getField(row, index, "AchievementPoints")),
      honorableKills: toNumber(getField(row, index, "HonorableKills")),
      appearanceCount: toNumber(getField(row, index, "AppearanceCount")),
      hasAppearanceCount,
      achievementsTotal: toNumber(getField(row, index, "AchievementsTotal")),
      hasAchievementsTotal,
      playedTime: toWholeMinuteSeconds(getField(row, index, "PlayedTime")),
      hasPlayedTime,
      ilvl: toNumber(getField(row, index, "ilvl")),
      level10Day: toEpochDay(getField(row, index, "Level10Date")),
      faction: getField(row, index, "Faction") || "Neutral",
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

function readPlayersCsvHistory() {
  let output;
  try {
    output = execFileSync(
      "git",
      ["log", "--follow", "--format=%H|%cI", "--name-status", "--", PLAYERS_CSV_PATHSPEC],
      {
        cwd: SPA_ROOT,
        encoding: "utf8",
        maxBuffer: GIT_FILE_MAX_BUFFER,
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
  } catch {
    console.warn("Could not read Players.csv history from git log. Deltas will be empty.");
    return [];
  }

  return parseGitHistoryOutput(output);
}

function parseGitHistoryOutput(output) {
  const entries = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const commitMatch = COMMIT_LINE_PATTERN.exec(line);
    if (commitMatch) {
      entries.push({ sha: commitMatch[1], commitTimestamp: commitMatch[2], filePath: undefined });
      continue;
    }

    const current = entries[entries.length - 1];
    if (current && !current.filePath) {
      const [status, ...paths] = line.split("\t");
      current.isPureRename = status === "R100";
      current.filePath = paths[paths.length - 1];
    }
  }

  return entries
    .filter((entry) => entry.filePath && !entry.isPureRename)
    .map(({ sha, commitTimestamp, filePath }) => ({ sha, commitTimestamp, filePath }));
}

function readGitFile(sha, repoFilePath) {
  try {
    return execFileSync("git", ["show", `${sha}:${repoFilePath}`], {
      cwd: SPA_ROOT,
      encoding: "utf8",
      maxBuffer: GIT_FILE_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    console.warn(`Could not read ${repoFilePath} at ${sha.slice(0, 7)} from git.`);
    return "";
  }
}

module.exports = {
  SECONDS_PER_MINUTE,
  toEpochDay,
  parseGitHistoryOutput,
  parsePlayersCsv,
  readGitFile,
  readPlayersCsvHistory,
  readTextIfExists,
};
