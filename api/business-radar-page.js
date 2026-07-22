const fs = require("fs");
const path = require("path");
const { verifySession } = require("../lib/business-radar/auth");

function esc(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

module.exports = function handler(req, res) {
  if (req.method !== "GET") { res.statusCode = 405; return res.end("Method not allowed"); }
  const authenticated = Boolean(verifySession(req));
  const shell = fs.readFileSync(path.join(process.cwd(), "admin", "business-radar-shell.html"), "utf8");
  const html = shell.replaceAll("{{AUTHENTICATED}}", authenticated ? "true" : "false").replace("{{PAGE_TITLE}}", esc(authenticated ? "Business Radar" : "Connexion Business Radar"));
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.end(html);
};
