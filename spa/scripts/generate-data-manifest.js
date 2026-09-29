const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const spaRoot = path.join(__dirname, "..");
const srcDir = path.join(spaRoot, "src");
const generatedDataDir = path.join(srcDir, "assets", "data");
const outputPath = path.join(generatedDataDir, "data-manifest.json");
const DATA_FILE_PATTERN = /\.(json|txt)$/i;

/**
 * Maps every data file the app fetches to a short hash of its content. The app requests
 * `file?v=<hash>`, so browsers can cache each file for as long as it is unchanged and fetch
 * it again as soon as a deploy changes it - no more `?v=Date.now()` defeating the cache.
 *
 * The file list comes from angular.json, so a new data file only needs adding there.
 */
function buildDataManifest() {
  const files = {};

  for (const publicPath of listDataFiles()) {
    const content = fs.readFileSync(path.join(srcDir, publicPath));
    files[publicPath] = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  }

  return { files };
}

// Top-level files listed as assets in angular.json (served from the site root), plus
// everything the build generates into assets/data.
function listDataFiles() {
  const angularConfig = JSON.parse(fs.readFileSync(path.join(spaRoot, "angular.json"), "utf8"));
  const project = Object.values(angularConfig.projects)[0];
  const assetFiles = project.architect.build.options.assets
    .filter((asset) => typeof asset === "string")
    .map((asset) => path.relative(srcDir, path.join(spaRoot, asset)).split(path.sep).join("/"))
    .filter((publicPath) => DATA_FILE_PATTERN.test(publicPath)
      && fs.existsSync(path.join(srcDir, publicPath))
      && fs.statSync(path.join(srcDir, publicPath)).isFile());
  const generatedFiles = fs.existsSync(generatedDataDir)
    ? fs.readdirSync(generatedDataDir)
      .filter((fileName) => DATA_FILE_PATTERN.test(fileName) && path.join(generatedDataDir, fileName) !== outputPath)
      .map((fileName) => `assets/data/${fileName}`)
    : [];

  return [...assetFiles, ...generatedFiles].sort();
}

function generateDataManifest() {
  const manifest = buildDataManifest();

  fs.mkdirSync(generatedDataDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${Object.keys(manifest.files).length} files)`);
}

module.exports = { buildDataManifest, generateDataManifest };
