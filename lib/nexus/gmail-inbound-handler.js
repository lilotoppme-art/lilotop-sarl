"use strict";

const { json, requireAdmin } = require("../business-radar/http");
const gmail = require("./gmail-inbound");
const store = require("./gmail-inbound-store");
const orchestratorStore = require("./orchestrator-store");

function redirect(res, location) {
  res.statusCode = 303; res.setHeader("Location", location); res.setHeader("Cache-Control", "no-store"); res.end();
}

async function exchangeCode(code, cfg) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" })
  });
  const result = await response.json();
  if (!response.ok || !result.refresh_token) throw Object.assign(new Error("Google OAuth token exchange failed"), { code: "GOOGLE_OAUTH_EXCHANGE_FAILED" });
  return result;
}

async function refreshAccessToken(refreshToken, cfg) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw Object.assign(new Error("Google OAuth refresh failed"), { code: "GOOGLE_OAUTH_REFRESH_FAILED" });
  return result.access_token;
}

async function gmailJson(path, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error("Gmail API request failed"), { code: "GMAIL_API_FAILED" });
  return result;
}

async function syncSupplierReplies() {
  const cfg = gmail.config();
  const connection = await store.loadConnection(cfg.mailbox, cfg.encryptionKey);
  if (!connection) throw Object.assign(new Error("Google OAuth consent is required"), { code: "GOOGLE_OAUTH_CONSENT_REQUIRED" });
  const accessToken = await refreshAccessToken(connection.refreshToken, cfg);
  const workflows = await orchestratorStore.listWorkflows(100);
  const workflow = workflows.find((item) => /ITB\/2026\/62389/i.test(String(
    item.dossier?.analysis?.tenderNumber || item.dossier?.tenderResponse?.keyInformation?.tenderNumber || item.dossier?.opportunity?.reference || ""
  )));
  const rfqs = workflow?.dossier?.supplierCycle?.rfqs || [];
  const query = encodeURIComponent('newer_than:30d {subject:"ITB/2026/62389" subject:"NEXUS-RFQ-ITB2026-62389"}');
  const listed = await gmailJson(`messages?q=${query}&maxResults=20`, accessToken);
  const ids = (listed.messages || []).map((item) => item.id);
  const known = await store.knownMessageIds(ids);
  let archived = 0;
  let matched = 0;
  for (const item of (listed.messages || [])) {
    if (known.has(item.id)) continue;
    const source = await gmailJson(`messages/${encodeURIComponent(item.id)}?format=full`, accessToken);
    const record = gmail.processSupplierReply(gmail.normalizeGmailMessage(source), rfqs);
    await store.archiveInboundMessage({ ...record, workflowId: workflow?.id || null });
    archived += 1;
    if (record.rfqId) matched += 1;
  }
  const status = await store.markSynced(cfg.mailbox);
  return { mailbox: cfg.mailbox, checked: ids.length, archived, matched, lastSyncAt: status?.last_sync_at || null, sendPerformed: false };
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/nexus-gmail", "http://localhost");
  const action = url.searchParams.get("action") || "status";
  try {
    if (action === "callback") {
      if (!gmail.verifyState(url.searchParams.get("state")) || !url.searchParams.get("code")) {
        return redirect(res, "/admin/nexus/orchestrator?gmail=authorization_failed#hilti-pilot-rfq");
      }
      const cfg = gmail.config();
      const tokens = await exchangeCode(url.searchParams.get("code"), cfg);
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || String(profile.emailAddress || "").toLowerCase() !== cfg.mailbox) {
        return redirect(res, "/admin/nexus/orchestrator?gmail=mailbox_mismatch#hilti-pilot-rfq");
      }
      await store.saveConnection({ mailbox: cfg.mailbox, refreshToken: tokens.refresh_token, scopes: String(tokens.scope || gmail.GMAIL_READONLY).split(" "), encryptionKey: cfg.encryptionKey });
      return redirect(res, "/admin/nexus/orchestrator?gmail=connected#hilti-pilot-rfq");
    }
    const session = requireAdmin(req, res); if (!session) return;
    const readiness = gmail.readiness();
    if (action === "authorize") return redirect(res, gmail.authorizationUrl());
    if (action === "sync") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "Methode non autorisee" });
      return json(res, 200, { ok: true, data: await syncSupplierReplies() });
    }
    let connection = null;
    if (readiness.configured) connection = await store.connectionStatus(readiness.mailbox);
    return json(res, 200, { ok: true, data: { ...readiness, connected: Boolean(connection), consentRequired: !connection, connection } });
  } catch (error) {
    console.error("[gmail-inbound] request failed", { code: error.code || "GMAIL_INBOUND_ERROR" });
    return json(res, error.code === "GOOGLE_OAUTH_NOT_CONFIGURED" ? 503 : 500, { ok: false, error: error.message, code: error.code || "GMAIL_INBOUND_ERROR" });
  }
};
