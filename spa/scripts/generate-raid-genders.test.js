const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRaidGenders } = require("./generate-raid-genders");

function player(name, realm, playerClass, gender) {
  return { name, realm, playerClass, gender };
}

function raider(name, realm, classId, gender) {
  return [name, realm, classId, 10, gender, ""];
}

test("lists the ladder's gender where the raid logs disagree", () => {
  const players = [
    player("Sósa", "Evermoon", 8, 1),
    player("Kael", "Tauri", 8, 0),
    player("Light", "Evermoon", 2, 0),
    player("Ama", "Evermoon", 5, 1),
  ];
  const raidPlayers = [
    raider("Sósa", "Evermoon", 8, 0),
    raider("Sósa", "Evermoon", 8, 0),
    raider("Kael", "Tauri", 8, 0),
    raider("Light", "Evermoon", 2, 1),
    raider("Ama", "Evermoon", 5, 0),
  ];

  assert.deepEqual(buildRaidGenders(players, raidPlayers), {
    v: 1,
    female: { Evermoon: ["Ama", "Sósa"] },
    male: { Evermoon: ["Light"] },
  });
});

test("leaves alone a name the ladder has on another realm or class, or not at all", () => {
  const players = [player("Twin", "Tauri", 8, 1), player("Reroll", "Evermoon", 1, 1)];
  const raidPlayers = [raider("Twin", "Evermoon", 8, 0), raider("Reroll", "Evermoon", 8, 0), raider("Ghost", "WoD", 4, 0)];

  assert.deepEqual(buildRaidGenders(players, raidPlayers), { v: 1, female: {}, male: {} });
});
