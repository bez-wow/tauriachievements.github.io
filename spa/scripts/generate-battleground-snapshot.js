const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const inputPath = path.join(srcDir, "battlegrounds.json");
const outputDir = path.join(srcDir, "assets", "data");

const SNAPSHOT_VERSION = 1;

// Battlegrounds started from this minute on belong to Legion; everything before is the WoD
// prepatch. The app shows one era at a time, so each era is its own file and the default
// (Legion) view never downloads or parses the much larger prepatch history.
const LEGION_START = { date: "2026-07-15", minuteOfDay: 9 * 60 };
const ERAS = ["legion", "wod-prepatch"];

// The collector writes "YYYY.MM.DD HH.MM" start times and "HH:MM:SS" durations.
const START_TIME_PATTERN = /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+(\d{1,2})[.:](\d{2})/;
const DURATION_PATTERN = /^(\d{1,2}):(\d{2}):(\d{2})$/;
const UNKNOWN = -1;

function snapshotFileName(era) {
  return `battlegrounds-${era}.json`;
}

/**
 * Reads one collector record into { name, date, minuteOfDay, durationSeconds }, or
 * undefined when it has no name or no readable start time.
 */
function parseBattleground(record) {
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  const start = START_TIME_PATTERN.exec(typeof record?.startTime === "string" ? record.startTime.trim() : "");
  if (!name || !start) {
    return undefined;
  }

  const [, year, month, day, hour, minute] = start.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const minuteOfDay = hour <= 23 && minute <= 59 ? hour * 60 + minute : UNKNOWN;
  return { name, date, minuteOfDay, durationSeconds: parseDurationSeconds(record.duration) };
}

function parseDurationSeconds(value) {
  if (typeof value === "number") {
    // A bare number is milliseconds, as the app has always read it.
    return Number.isFinite(value) && value >= 0 ? Math.round(value / 1000) : UNKNOWN;
  }

  const match = DURATION_PATTERN.exec(typeof value === "string" ? value.trim() : "");
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : UNKNOWN;
}

function eraOf(battleground) {
  const isLegion = battleground.date > LEGION_START.date
    || (battleground.date === LEGION_START.date && battleground.minuteOfDay >= LEGION_START.minuteOfDay);
  return isLegion ? "legion" : "wod-prepatch";
}

/**
 * Builds one snapshot per era:
 *
 *   { version, era, names: [...], days: [[date, [name, minute, seconds, name, minute, seconds, ...]], ...] }
 *
 * Days are in date order. Each day holds its battlegrounds as flat triples: an index into
 * `names`, the start minute of the day and the duration in seconds (-1 when unknown).
 * Within a day the collector's order is kept, which is the order the app has always used.
 */
function buildBattlegroundSnapshots(records) {
  const parsed = [];
  let skipped = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const battleground = parseBattleground(record);
    if (battleground) {
      parsed.push(battleground);
    } else {
      skipped++;
    }
  }

  // Stable sort: by date only, keeping the collector's order within a day.
  parsed.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));

  const snapshots = {};
  for (const era of ERAS) {
    const names = [];
    const nameIndex = new Map();
    const days = [];

    for (const battleground of parsed) {
      if (eraOf(battleground) !== era) {
        continue;
      }

      if (!nameIndex.has(battleground.name)) {
        nameIndex.set(battleground.name, names.length);
        names.push(battleground.name);
      }

      let day = days[days.length - 1];
      if (!day || day[0] !== battleground.date) {
        day = [battleground.date, []];
        days.push(day);
      }

      day[1].push(nameIndex.get(battleground.name), battleground.minuteOfDay, battleground.durationSeconds);
    }

    snapshots[era] = { version: SNAPSHOT_VERSION, era, names, days };
  }

  return { snapshots, skipped };
}

function generateBattlegroundSnapshots() {
  const records = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const { snapshots, skipped } = buildBattlegroundSnapshots(records);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const era of ERAS) {
    const outputPath = path.join(outputDir, snapshotFileName(era));
    fs.writeFileSync(outputPath, JSON.stringify(snapshots[era]));
    const count = snapshots[era].days.reduce((total, [, values]) => total + values.length / 3, 0);
    const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
    console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${sizeKb} kB, ${count} battlegrounds)`);
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} battleground records without a name or a readable start time`);
  }
}

module.exports = {
  LEGION_START,
  buildBattlegroundSnapshots,
  generateBattlegroundSnapshots,
  parseBattleground,
  snapshotFileName,
};
