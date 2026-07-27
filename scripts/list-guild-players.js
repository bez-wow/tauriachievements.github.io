const fs = require("fs");
const path = require("path");
const { parsePlayersCsv } = require("./player-data-utils");

const DEFAULT_SOURCE = path.join(__dirname, "..", "src", "Players.csv");
const DEFAULT_API_URL = "http://chapi.tauri.hu/apiIndex.php";
const CLASS_NAMES = { 1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest", 6: "Death Knight", 7: "Shaman", 8: "Mage", 9: "Warlock", 10: "Monk", 11: "Druid", 12: "Demon Hunter" };
const RACE_NAMES = { 1: "Human", 2: "Orc", 3: "Dwarf", 4: "Night Elf", 5: "Undead", 6: "Tauren", 7: "Gnome", 8: "Troll", 9: "Goblin", 10: "Blood Elf", 11: "Draenei", 22: "Worgen", 24: "Pandaren", 25: "Pandaren", 26: "Pandaren" };
const API_REALMS = { evermoon: "[EN] Evermoon", tauri: "[HU] Tauri WoW Server", wod: "[HU] Warriors of Darkness" };

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!["--realm", "--guild", "--source", "--concurrency"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
  }
  return options;
}

function findGuildPlayers(players, realm, guild) {
  const normalizedRealm = realm.trim().toLocaleLowerCase();
  const normalizedGuild = guild.trim().toLocaleLowerCase();

  return players
    .filter((player) => player.realm.trim().toLocaleLowerCase() === normalizedRealm
      && player.guild.trim().toLocaleLowerCase() === normalizedGuild)
    .map((player) => ({
      name: player.name,
      class: CLASS_NAMES[player.playerClass] ?? `Unknown (${player.playerClass})`,
      race: RACE_NAMES[player.race] ?? `Unknown (${player.race})`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getApiRealm(realm) {
  return API_REALMS[realm.trim().toLocaleLowerCase()] ?? realm.trim();
}

async function fetchArtifactSummary(playerName, realm, api, fetchImpl = fetch) {
  const separator = api.baseUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${api.baseUrl}${separator}apikey=${encodeURIComponent(api.apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: api.secret,
      url: "character-artifact",
      params: { r: getApiRealm(realm), n: playerName },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const artifact = payload?.response?.artifacts?.[0];
  if (!artifact) {
    return { artifactItemLevel: null, traitsSpent: 0, artifactStatus: "No artifact" };
  }

  const powers = artifact?.artifact?.artifactpowers;
  const traitsSpent = Array.isArray(powers)
    ? powers.reduce((total, power) => total + (Number(power?.purchasedrank) || 0), 0)
    : 0;

  return {
    artifactItemLevel: Number(artifact.ItemLevel) || 0,
    traitsSpent,
    artifactStatus: "OK",
  };
}

async function addArtifactTraits(players, realm, api, concurrency = 4, fetchImpl = fetch) {
  const results = new Array(players.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < players.length) {
      const index = nextIndex++;
      try {
        results[index] = { ...players[index], ...await fetchArtifactSummary(players[index].name, realm, api, fetchImpl) };
      } catch (error) {
        results[index] = {
          ...players[index], artifactItemLevel: null, traitsSpent: null,
          artifactStatus: `Failed: ${error.message}`,
        };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), players.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function printHelp() {
  console.log([
    "List all known players in a guild.", "", "Usage:",
    "  npm run guild:players -- --realm <realm> --guild <guild name>", "", "Options:",
    "  --realm   Realm to search (required)", "  --guild   Guild name to search (required)",
    "  --source       Optional path to a Players.csv file",
    "  --concurrency  Simultaneous artifact calls (default: 4)",
    "  --help         Show this help", "",
    "Environment:", "  TAURI_API_KEY     API key (required)",
    "  TAURI_API_SECRET  API secret (required)",
    "  TAURI_API_URL     API URL (optional)",
  ].join("\n"));
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.realm || !options.guild) {
    throw new Error("Both --realm and --guild are required. Use --help for an example.");
  }
  const apiKey = process.env.TAURI_API_KEY;
  const secret = process.env.TAURI_API_SECRET;
  if (!apiKey || !secret) {
    throw new Error("TAURI_API_KEY and TAURI_API_SECRET environment variables are required.");
  }
  const concurrency = Number(options.concurrency ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error("--concurrency must be an integer between 1 and 20.");
  }

  const source = options.source ? path.resolve(options.source) : DEFAULT_SOURCE;
  if (!fs.existsSync(source)) {
    throw new Error(`Player data file not found: ${source}`);
  }

  const players = parsePlayersCsv(fs.readFileSync(source, "utf8"));
  const matches = findGuildPlayers(players, options.realm, options.guild);
  const guildPlayers = await addArtifactTraits(matches, options.realm, {
    baseUrl: process.env.TAURI_API_URL || DEFAULT_API_URL, apiKey, secret,
  }, concurrency);
  console.log(`Guild: ${options.guild} | Realm: ${options.realm} | Players: ${guildPlayers.length}`);
  console.table(guildPlayers.map((player) => ({
    Name: player.name, Class: player.class, Race: player.race,
    "Artifact item level": player.artifactItemLevel ?? "N/A",
    "Traits spent": player.traitsSpent ?? "N/A",
    Status: player.artifactStatus,
  })));
  if (guildPlayers.length === 0) {
    console.log("No matching players were found in the source data.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { addArtifactTraits, fetchArtifactSummary, findGuildPlayers, getApiRealm, parseArguments };
