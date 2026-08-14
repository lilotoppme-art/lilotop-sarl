"use strict";

const { json, requireAdmin } = require("../business-radar/http");
const gmail = require("./gmail-inbound");
const store = require("./gmail-inbound-store");

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
    let connection = null;
    if (readiness.configured) connection = await store.connectionStatus(readiness.mailbox);
    return json(res, 200, { ok: true, data: { ...readiness, connected: Boolean(connection), consentRequired: !connection, connection } });
  } catch (error) {
    console.error("[gmail-inbound] request failed", { code: error.code || "GMAIL_INBOUND_ERROR" });
    return json(res, error.code === "GOOGLE_OAUTH_NOT_CONFIGURED" ? 503 : 500, { ok: false, error: error.message, code: error.code || "GMAIL_INBOUND_ERROR" });
  }
};
