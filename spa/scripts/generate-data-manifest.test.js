const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDataManifest } = require("./generate-data-manifest");

test("lists the served data files with a short content hash", () => {
  const { files } = buildDataManifest();

  assert.match(files["lastUpdated.txt"], /^[0-9a-f]{12}$/);
  assert.match(files["RareAchievements.json"], /^[0-9a-f]{12}$/);
});

test("never lists itself", () => {
  assert.equal(buildDataManifest().files["assets/data/data-manifest.json"], undefined);
});
