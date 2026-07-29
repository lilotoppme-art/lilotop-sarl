"use strict";

const fs = require("fs");
const path = require("path");
const { verifySession } = require("../lib/business-radar/auth");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }
  const authenticated = Boolean(verifySession(req));
  const template = fs.readFileSync(path.join(process.cwd(), "admin", "procurement-ai-shell.html"), "utf8");
  const title = authenticated ? "Achats AI" : "Connexion Achats AI";
  const html = template
    .replaceAll("{{AUTHENTICATED}}", authenticated ? "true" : "false")
    .replace("{{PAGE_TITLE}}", escapeHtml(title));

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.end(html);
};
