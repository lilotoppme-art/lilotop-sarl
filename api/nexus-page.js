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
const documentVaultHandler = require("../lib/nexus/document-vault-handler");
const emailDeliveryHandler = require("../lib/email/delivery-handler");
const resendWebhookHandler = require("../lib/email/webhook-handler");
const crmHandler = require("../lib/nexus/crm-handler");
const passwordReset = require("../lib/business-radar/password-reset");

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

function previewBranchHost() {
  const host = String(process.env.VERCEL_BRANCH_URL || "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.vercel\.app$/.test(host) ? host : "";
}

function redirectToStablePreview(req, res, targetPath) {
  if (String(process.env.VERCEL_ENV || "").trim() !== "preview") return false;
  const canonicalHost = previewBranchHost();
  const requestHost = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!canonicalHost || requestHost === canonicalHost) return false;

  res.statusCode = 307;
  res.setHeader("Location", `https://${canonicalHost}${targetPath}`);
  res.setHeader("Cache-Control", "no-store, private");
  res.end();
  return true;
}

function sendPrivateHtml(res, templateName, authenticated, title, bootstrap = null) {
  const template = fs.readFileSync(path.join(process.cwd(), "admin", templateName), "utf8");
  let html = template
    .replaceAll("{{AUTHENTICATED}}", authenticated ? "true" : "false")
    .replaceAll("{{LOGIN_HIDDEN}}", authenticated ? "hidden" : "")
    .replaceAll("{{SHELL_HIDDEN}}", authenticated ? "" : "hidden")
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
  if (delegatedHandler === "document-vault-api") {
    return documentVaultHandler(req, res);
  }
  if (delegatedHandler === "email-delivery-api") {
    return emailDeliveryHandler(req, res);
  }
  if (delegatedHandler === "resend-webhook") {
    return resendWebhookHandler(req, res);
  }
  if (delegatedHandler === "crm-api") {
    return crmHandler(req, res);
  }
  if (delegatedHandler === "admin-password-reset-api") {
    return passwordReset.handler(req, res);
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  if (delegatedHandler === "orchestrator-page"
      && redirectToStablePreview(req, res, "/admin/nexus/orchestrator")) {
    return;
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
  if (delegatedHandler === "document-vault-page") {
    const title = authenticated ? "Coffre documentaire" : "Connexion Coffre documentaire";
    return sendPrivateHtml(res, "document-vault-shell.html", authenticated, title);
  }
  if (delegatedHandler === "crm-page") {
    const title = authenticated ? "CRM IA" : "Connexion CRM IA";
    return sendPrivateHtml(res, "crm-shell.html", authenticated, title);
  }
  if (delegatedHandler === "admin-password-reset-page") {
    return sendPrivateHtml(res, "password-reset-shell.html", false, "Recuperation administrateur NEXUS AI");
  }
  const pageTitle = authenticated ? "NEXUS AI" : "Connexion NEXUS AI";
  return sendPrivateHtml(res, "nexus-shell.html", authenticated, pageTitle, nexusCatalog);
};

module.exports.config = {
  api: { bodyParser: false }
};

module.exports.previewBranchHost = previewBranchHost;
module.exports.redirectToStablePreview = redirectToStablePreview;
