const { test } = require("node:test");
const assert = require("node:assert/strict");
const { addArtifactTraits, fetchArtifactSummary, findGuildPlayers, getApiRealm, parseArguments } = require("./list-guild-players");

test("reads the configurable realm and guild", () => {
  assert.deepEqual(parseArguments(["--realm", "Evermoon", "--guild", "My Guild"]), {
    realm: "Evermoon", guild: "My Guild",
  });
});

test("matches case-insensitively and maps class and race", () => {
  const result = findGuildPlayers([
    { name: "Zed", realm: "Evermoon", guild: "My Guild", playerClass: 8, race: 1, gender: 0, faction: "Alliance" },
    { name: "Amy", realm: "EVERMOON", guild: "MY GUILD", playerClass: 11, race: 4, gender: 1, faction: "Alliance" },
    { name: "Other", realm: "Tauri", guild: "My Guild", playerClass: 1, race: 2, gender: 0, faction: "Horde" },
  ], "evermoon", "my guild");

  assert.deepEqual(result, [
    { name: "Amy", class: "Druid", race: "Night Elf" },
    { name: "Zed", class: "Mage", race: "Human" },
  ]);
});

test("maps display realms to the API realm names", () => {
  assert.equal(getApiRealm("Evermoon"), "[EN] Evermoon");
  assert.equal(getApiRealm("Custom Realm"), "Custom Realm");
});

test("fetchArtifactSummary sums purchased artifact ranks", async () => {
  let requestBody;
  const fakeFetch = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return {
      ok: true,
      json: async () => ({ response: { artifacts: [{
        ItemLevel: 910,
        artifact: { artifactpowers: [{ purchasedrank: 12 }, { purchasedrank: 8 }] },
      }] } }),
    };
  };

  const result = await fetchArtifactSummary("Amy", "Evermoon", {
    baseUrl: "https://example.test/api", apiKey: "key", secret: "secret",
  }, fakeFetch);

  assert.deepEqual(result, { artifactItemLevel: 910, traitsSpent: 20, artifactStatus: "OK" });
  assert.deepEqual(requestBody, {
    secret: "secret", url: "character-artifact", params: { r: "[EN] Evermoon", n: "Amy" },
  });
});

test("addArtifactTraits preserves a player when their API call fails", async () => {
  const [result] = await addArtifactTraits(
    [{ name: "Amy", class: "Druid", race: "Night Elf" }],
    "Evermoon",
    { baseUrl: "https://example.test/api", apiKey: "key", secret: "secret" },
    1,
    async () => { throw new Error("offline"); },
  );

  assert.equal(result.name, "Amy");
  assert.equal(result.traitsSpent, null);
  assert.equal(result.artifactStatus, "Failed: offline");
});

test("returns an empty list for an unknown guild", () => {
  assert.deepEqual(findGuildPlayers([], "Evermoon", "Missing"), []);
});
