const fs = require("fs");
const path = require("path");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

const missing = [];
for (const file of walk(".").filter((item) => item.endsWith(".html"))) {
  const html = fs.readFileSync(file, "utf8");
  const base = path.dirname(file);
  const re = /(?:href|src)="([^"]+)"/g;
  for (const match of html.matchAll(re)) {
    let href = match[1];
    if (
      !href ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("#") ||
      href.startsWith("data:")
    ) {
      continue;
    }
    href = href.split("#")[0];
    if (!href) continue;
    const target = path.normalize(path.join(base, href));
    if (!fs.existsSync(target)) missing.push({ file, href, target });
  }
}

if (missing.length) {
  console.error(JSON.stringify(missing, null, 2));
  process.exit(1);
}

console.log("internal links ok");
