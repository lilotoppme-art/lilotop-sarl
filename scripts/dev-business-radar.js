const http = require("http");
const fs = require("fs");
const path = require("path");

const page = require("../api/business-radar-page");
const auth = require("../api/business-radar-auth");
const radar = require("../api/business-radar");
const cron = require("../api/cron-business-radar");
const port = Number(process.env.PORT || process.argv[2] || 4173);
const types = { ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };

function staticFile(req, res) {
  const url = new URL(req.url, "http://localhost");
  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const target = path.resolve(process.cwd(), relative);
  if (!target.startsWith(`${process.cwd()}${path.sep}`) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  res.setHeader("Content-Type", `${types[path.extname(target)] || "text/html"}; charset=utf-8`);
  fs.createReadStream(target).pipe(res);
}

http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/admin/business-radar") return page(req, res);
  if (pathname === "/api/business-radar-auth") return auth(req, res);
  if (pathname === "/api/business-radar") return radar(req, res);
  if (pathname === "/api/cron-business-radar") return cron(req, res);
  return staticFile(req, res);
}).listen(port, "127.0.0.1", () => console.log(`Business Radar dev server available at http://127.0.0.1:${port}/admin/business-radar`));
