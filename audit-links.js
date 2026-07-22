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
const rewrites = fs.existsSync("vercel.json") ? new Set((JSON.parse(fs.readFileSync("vercel.json", "utf8")).rewrites || []).map((item) => item.source)) : new Set();
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
      href.startsWith("/api/") ||
      href.startsWith("#") ||
      href.startsWith("data:")
    ) {
      continue;
    }
    href = href.split(/[?#]/)[0];
    if (!href) continue;
    if (rewrites.has(href)) continue;
    const target = path.normalize(href.startsWith("/") ? path.join(".", href.slice(1)) : path.join(base, href));
    if (!fs.existsSync(target) && !fs.existsSync(`${target}.html`)) missing.push({ file, href, target });
  }
}

if (missing.length) {
  console.error(JSON.stringify(missing, null, 2));
  process.exit(1);
}

console.log("internal links ok");
