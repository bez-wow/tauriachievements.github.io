const fs = require("fs");
const path = require("path");

const raidLogDataDir = path.join(__dirname, "..", "src", "raid-log-data");
const outputDir = path.join(__dirname, "..", "src", "assets", "data");
const outputPath = path.join(outputDir, "raid-genders.json");

function buildRaidGenders(players, raidPlayers) {
  const ladder = new Map(players.map((player) => [`${player.realm}/${player.name}`, player]));
  const corrections = { female: new Map(), male: new Map() };
  const seen = new Set();

  for (const [name, realm, classId, , gender] of raidPlayers) {
    const key = `${realm}/${name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const player = ladder.get(key);
    if (!player || player.playerClass !== classId || (player.gender !== 0 && player.gender !== 1) || player.gender === gender) {
      continue;
    }

    const byRealm = player.gender === 1 ? corrections.female : corrections.male;
    if (!byRealm.has(realm)) {
      byRealm.set(realm, []);
    }
    byRealm.get(realm).push(name);
  }

  return { v: 1, female: toSortedObject(corrections.female), male: toSortedObject(corrections.male) };
}

function toSortedObject(byRealm) {
  return Object.fromEntries([...byRealm.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([realm, names]) => [realm, names.sort()]));
}

function readRaidPlayers(dir = raidLogDataDir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "index.json")
    .flatMap((fileName) => JSON.parse(fs.readFileSync(path.join(dir, fileName), "utf8")).players ?? []);
}

function generateRaidGenders(players) {
  const genders = buildRaidGenders(players, readRaidPlayers());
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(genders));

  const count = (byRealm) => Object.values(byRealm).reduce((sum, names) => sum + names.length, 0);
  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${count(genders.female)} female, ${count(genders.male)} male corrections, ${sizeKb} kB)`);
}

module.exports = { buildRaidGenders, generateRaidGenders, readRaidPlayers };
