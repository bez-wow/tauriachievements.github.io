const fs = require("fs");
const path = require("path");

const envDir = path.join(__dirname, "..", "src", "environments");
const pairs = [
  ["environment.template.ts", "environment.ts"],
  ["environment.prod.template.ts", "environment.prod.ts"],
  ["environment.dev-proxy.template.ts", "environment.dev-proxy.ts"],
];

function ensureEnvFiles() {
  for (const [templateName, targetName] of pairs) {
    const templatePath = path.join(envDir, templateName);
    const targetPath = path.join(envDir, targetName);

    if (!fs.existsSync(templatePath)) {
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(templatePath, targetPath);
    }
  }
}

if (require.main === module) {
  ensureEnvFiles();
}

module.exports = {
  ensureEnvFiles,
};
