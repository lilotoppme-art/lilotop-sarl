"use strict";

const fs = require("fs");
const path = require("path");
const { verifySession } = require("../lib/business-radar/auth");
const { nexusCatalog } = require("../lib/nexus/catalog");
const tenderHandler = require("../lib/nexus/tender-handler");
const miningWatchHandler = require("../lib/nexus/mining-watch-handler");
const tenderResponseHandler = require("../lib/nexus/tender-response-handler");
const supplierHandler = require("../lib/nexus/supplier-handler");
const orchestratorHandler = require("../lib/nexus/orchestrator-handler");

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

function sendPrivateHtml(res, templateName, authenticated, title, bootstrap = null) {
  const template = fs.readFileSync(path.join(process.cwd(), "admin", templateName), "utf8");
  let html = template
    .replaceAll("{{AUTHENTICATED}}", authenticated ? "true" : "false")
    .replace("{{PAGE_TITLE}}", escapeHtml(title));
  if (bootstrap) {
    html = html.replace("{{NEXUS_BOOTSTRAP}}", serializeForHtml(bootstrap));
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.end(html);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const delegatedHandler = url.searchParams.get("handler");
  if (delegatedHandler === "tender-api") {
    return tenderHandler(req, res);
  }
  if (delegatedHandler === "mining-api") {
    return miningWatchHandler(req, res);
  }
  if (delegatedHandler === "tender-response-api") {
    return tenderResponseHandler(req, res);
  }
  if (delegatedHandler === "supplier-api") {
    return supplierHandler(req, res);
  }
  if (delegatedHandler === "orchestrator-api") {
    return orchestratorHandler(req, res);
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const authenticated = Boolean(verifySession(req));
  if (delegatedHandler === "tender-page") {
    const title = authenticated ? "Appels d'Offres AI" : "Connexion Appels d'Offres AI";
    return sendPrivateHtml(res, "tender-ai-shell.html", authenticated, title);
  }
  if (delegatedHandler === "mining-page") {
    const title = authenticated ? "Veille Miniere AI" : "Connexion Veille Miniere AI";
    return sendPrivateHtml(res, "mining-watch-shell.html", authenticated, title);
  }
  if (delegatedHandler === "tender-response-page") {
    const title = authenticated ? "Réponse Appels d'Offres AI" : "Connexion Réponse Appels d'Offres AI";
    return sendPrivateHtml(res, "tender-response-shell.html", authenticated, title);
  }
  if (delegatedHandler === "supplier-page") {
    const title = authenticated ? "Fournisseurs AI" : "Connexion Fournisseurs AI";
    return sendPrivateHtml(res, "supplier-ai-shell.html", authenticated, title);
  }
  if (delegatedHandler === "orchestrator-page") {
    const title = authenticated ? "Orchestrateur NEXUS AI" : "Connexion Orchestrateur NEXUS AI";
    return sendPrivateHtml(res, "orchestrator-shell.html", authenticated, title);
  }
  const pageTitle = authenticated ? "NEXUS AI" : "Connexion NEXUS AI";
  return sendPrivateHtml(res, "nexus-shell.html", authenticated, pageTitle, nexusCatalog);
};
