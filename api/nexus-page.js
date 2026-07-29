"use strict";

const fs = require("fs");
const path = require("path");
const { verifySession } = require("../lib/business-radar/auth");
const { nexusCatalog } = require("../lib/nexus/catalog");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function serializeForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const authenticated = Boolean(verifySession(req));
  const template = fs.readFileSync(path.join(process.cwd(), "admin", "nexus-shell.html"), "utf8");
  const pageTitle = authenticated ? "NEXUS AI" : "Connexion NEXUS AI";
  const html = template
    .replaceAll("{{AUTHENTICATED}}", authenticated ? "true" : "false")
    .replace("{{PAGE_TITLE}}", escapeHtml(pageTitle))
    .replace("{{NEXUS_BOOTSTRAP}}", serializeForHtml(nexusCatalog));

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
