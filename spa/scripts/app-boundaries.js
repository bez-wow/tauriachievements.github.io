const fs = require("node:fs");
const path = require("node:path");

const SPECIFIER_PATTERNS = [
  /\bfrom\s+["'](\.[^"']+)["']/g,
  /\bimport\s+["'](\.[^"']+)["']/g,
  /\bimport\(\s*["'](\.[^"']+)["']\s*\)/g,
  /@(?:use|forward|import)\s+["'](\.[^"']+)["']/g,
  /\b(?:templateUrl|styleUrl)\s*:\s*["'](\.[^"']+)["']/g,
];

function areaOf(appRelativePath) {
  const parts = appRelativePath.split("/");
  if (parts.length === 1) {
    return "root";
  }
  return parts[0] === "features" ? `features/${parts[1]}` : parts[0];
}

function isAllowed(fromArea, toArea) {
  if (fromArea === toArea || fromArea === "root") {
    return true;
  }
  if (toArea === "root" || toArea.startsWith("features/")) {
    return false;
  }
  return toArea !== "players" || fromArea.startsWith("features/");
}

function specifiersIn(text) {
  const found = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.push(match[1]);
    }
  }
  for (const match of text.matchAll(/\bstyleUrls\s*:\s*\[([^\]]*)\]/g)) {
    for (const url of match[1].matchAll(/["'](\.[^"']+)["']/g)) {
      found.push(url[1]);
    }
  }
  return found;
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function findBoundaryViolations(appDir) {
  const toAppPath = (file) => path.relative(appDir, file).split(path.sep).join("/");
  const violations = [];
  for (const file of listFiles(appDir).filter((name) => /\.(ts|scss)$/.test(name))) {
    const from = toAppPath(file);
    for (const specifier of specifiersIn(fs.readFileSync(file, "utf8"))) {
      const target = toAppPath(path.resolve(path.dirname(file), specifier));
      if (!target.startsWith("..") && !isAllowed(areaOf(from), areaOf(target))) {
        violations.push(`${from} -> ${target}`);
      }
    }
  }
  return violations;
}

module.exports = { areaOf, findBoundaryViolations, isAllowed, specifiersIn };
