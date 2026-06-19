const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getNameClassKey } = require("./generate-player-snapshot");

function player(overrides) {
  return {
    name: "Yolko",
    race: 1,
    gender: 0,
    playerClass: 8,
    realm: "Tauri",
    guild: "Outlaws",
    faction: "Alliance",
    ...overrides,
  };
}

test("getNameClassKey ignores race, faction, realm, and guild", () => {
  const before = player({ race: 1, faction: "Alliance", realm: "Tauri", guild: "A" });
  const afterChange = player({ race: 7, faction: "Horde", realm: "Evermoon", guild: "B" });

  assert.equal(getNameClassKey(before), getNameClassKey(afterChange));
});

test("getNameClassKey is case-insensitive on the name", () => {
  assert.equal(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "YOLKO" })));
});

test("getNameClassKey distinguishes a different class", () => {
  assert.notEqual(getNameClassKey(player({ playerClass: 8 })), getNameClassKey(player({ playerClass: 2 })));
});

test("getNameClassKey distinguishes a different name", () => {
  assert.notEqual(getNameClassKey(player({ name: "Yolko" })), getNameClassKey(player({ name: "Spuky" })));
});

test("newness rule: a faction/race/realm change is not treated as new", () => {
  const previousRows = [player({ race: 1, faction: "Alliance", realm: "Tauri" })];
  const previousNameClassKeys = new Set(previousRows.map(getNameClassKey));

  const movedRealmAndFaction = player({ race: 7, faction: "Horde", realm: "Evermoon" });
  const isNew = !previousNameClassKeys.has(getNameClassKey(movedRealmAndFaction));

  assert.equal(isNew, false);
});

test("newness rule: a genuinely new name or a reused name on a new class is new", () => {
  const previousRows = [player({ name: "Yolko", playerClass: 8 })];
  const previousNameClassKeys = new Set(previousRows.map(getNameClassKey));

  const brandNewName = player({ name: "Freshchar", playerClass: 8 });
  const sameNameNewClass = player({ name: "Yolko", playerClass: 2 });

  assert.equal(previousNameClassKeys.has(getNameClassKey(brandNewName)), false);
  assert.equal(previousNameClassKeys.has(getNameClassKey(sameNameNewClass)), false);
});
