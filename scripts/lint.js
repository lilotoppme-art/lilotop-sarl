const { spawnSync } = require("child_process");

const fs = require("fs");
const path = require("path");

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "Google-Workspace-Branding", "gmail-prepared"].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(target);
    return entry.name.endsWith(".js") ? [target] : [];
  });
}

const files = javascriptFiles(".");

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("lint ok");
