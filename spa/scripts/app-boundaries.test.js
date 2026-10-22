const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { areaOf, findBoundaryViolations, isAllowed, specifiersIn } = require("./app-boundaries");

test("a file's area is its top folder, or its feature under features/", () => {
  assert.equal(areaOf("app.routes.ts"), "root");
  assert.equal(areaOf("core/url-state.ts"), "core");
  assert.equal(areaOf("shared/spec-charts/spec-popularity.ts"), "shared");
  assert.equal(areaOf("features/raids/raid-logs.ts"), "features/raids");
});

test("a feature never imports another feature", () => {
  assert.equal(isAllowed("features/raids", "features/raids"), true);
  assert.equal(isAllowed("features/raids", "features/mythic-plus"), false);
});

test("only features import players, and nothing imports a feature or the root", () => {
  for (const lower of ["core", "shared", "game"]) {
    assert.equal(isAllowed(lower, "players"), false);
    assert.equal(isAllowed(lower, "features/ladder"), false);
    assert.equal(isAllowed(lower, "root"), false);
  }
  assert.equal(isAllowed("players", "features/ladder"), false);
  assert.equal(isAllowed("features/ladder", "players"), true);
  assert.equal(isAllowed("features/ladder", "game"), true);
  assert.equal(isAllowed("players", "core"), true);
  assert.equal(isAllowed("game", "shared"), true);
  assert.equal(isAllowed("root", "features/raids"), true);
});

test("imports, lazy routes, stylesheets and SCSS modules all count", () => {
  const source = [
    "import { a } from './a';",
    "export { b } from '../b';",
    "loadComponent: () => import('./features/c/c-page.component')",
    "templateUrl: './d.component.html',",
    "styleUrls: ['../../shared/e.scss', './f.component.scss'],",
    "@use '../g' as *;",
    "import { Component } from '@angular/core';",
  ].join("\n");
  assert.deepEqual(specifiersIn(source).sort(), [
    "../../shared/e.scss",
    "../b",
    "../g",
    "./a",
    "./d.component.html",
    "./f.component.scss",
    "./features/c/c-page.component",
  ]);
});

test("the app keeps to its boundaries", () => {
  assert.deepEqual(findBoundaryViolations(path.join(__dirname, "../src/app")), []);
});
