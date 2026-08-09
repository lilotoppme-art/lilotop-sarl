"use strict";

const crypto = require("crypto");
const { radarConfig } = require("./config");
const { hashPassword, clearSessionCookie } = require("./auth");
const { json, parseJson } = require("./http");
const store = require("./admin-auth-store");
const { sendWebsiteEmail } = require("../email/sendWebsiteEmail");

const RESET_TTL_MINUTES = 30;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;
const requestAttempts = new Map();

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function validNewPassword(value) {
  const password = String(value || "");
  return password.length >= 14
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function clientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function ipHash(req) {
  return sha256(clientIp(req));
}

function rateLimited(req) {
  const key = ipHash(req);
  const now = Date.now();
  const entry = requestAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + 15 * 60 * 1000;
  }
  entry.count += 1;
  requestAttempts.set(key, entry);
  return entry.count > 5;
}

function allowedOrigin(req, configuredUrl) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim().toLowerCase();
  const allowed = host === "lilotopsarl.com"
    || host === "www.lilotopsarl.com"
    || host === "lilotop-sarl.vercel.app"
    || /^lilotop-sarl-[a-z0-9-]+-lilotoppme-arts-projects\.vercel\.app$/.test(host);
  if (allowed) return `https://${host}`;
  return String(configuredUrl || "").replace(/\/+$/, "");
}

function resetEmail({ resetUrl, expiresMinutes }) {
  const safeUrl = String(resetUrl).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    subject: "Reinitialisation de votre acces administrateur NEXUS AI",
    text: [
      "Une reinitialisation du mot de passe administrateur NEXUS AI a ete demandee.",
      `Ouvrez ce lien dans les ${expiresMinutes} prochaines minutes :`,
      resetUrl,
      "Ce lien est personnel et utilisable une seule fois.",
      "Si vous n'etes pas a l'origine de cette demande, ignorez cet e-mail."
    ].join("\n\n"),
    html: `<p>Une reinitialisation du mot de passe administrateur <strong>NEXUS AI</strong> a ete demandee.</p>
      <p><a href="${safeUrl}">Definir un nouveau mot de passe</a></p>
      <p>Ce lien expire dans ${expiresMinutes} minutes et ne peut etre utilise qu'une seule fois.</p>
      <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet e-mail.</p>`
  };
}

async function requestReset(req, res, body) {
  const config = radarConfig();
  if (!config.adminEmail || !config.adminPasswordHash || !config.databaseUrl) {
    return json(res, 503, { ok: false, error: "La recuperation administrateur n'est pas configuree." });
  }
  if (rateLimited(req)) return json(res, 429, { ok: false, error: "Trop de demandes. Reessayez dans 15 minutes." });

  const email = String(body.email || "").trim().toLowerCase();
  const generic = { ok: true, message: "Si cette adresse correspond au compte administrateur, un lien de reinitialisation a ete envoye." };
  if (email !== config.adminEmail) return json(res, 200, generic);

  const rawToken = generateResetToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const actorIpHash = ipHash(req);
  await store.createReset({
    email: config.adminEmail,
    initialPasswordHash: config.adminPasswordHash,
    tokenHash,
    expiresAt,
    ipHash: actorIpHash
  });
  const origin = allowedOrigin(req, config.appUrl);
  const resetUrl = `${origin}/admin/nexus/reset-password?token=${encodeURIComponent(rawToken)}`;
  const message = resetEmail({ resetUrl, expiresMinutes: RESET_TTL_MINUTES });
  try {
    const delivery = await sendWebsiteEmail({
      to: config.adminEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: `admin-password-reset-${tokenHash}`
    });
    await store.recordEvent("password_reset_email_sent", config.adminEmail, actorIpHash, { providerMessageId: delivery.id });
  } catch (error) {
    await store.recordEvent("password_reset_email_failed", config.adminEmail, actorIpHash, { code: error.code || "EMAIL_DELIVERY_FAILED" });
    return json(res, 502, { ok: false, error: "Le lien n'a pas pu etre envoye. Reessayez plus tard." });
  }
  return json(res, 200, generic);
}

async function createForcedChangeToken(req, config = radarConfig()) {
  const rawToken = generateResetToken();
  await store.createReset({
    email: config.adminEmail,
    initialPasswordHash: config.adminPasswordHash,
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    ipHash: ipHash(req)
  });
  return rawToken;
}

async function completeReset(req, res, body) {
  const token = String(body.token || "");
  const newPassword = String(body.password || "");
  if (token.length < 40 || !validNewPassword(newPassword)) {
    return json(res, 400, { ok: false, error: "Lien invalide ou mot de passe insuffisamment securise." });
  }
  const actorIpHash = ipHash(req);
  const result = await store.consumeReset({
    tokenHash: sha256(token),
    newPasswordHash: hashPassword(newPassword),
    ipHash: actorIpHash
  });
  if (!result) {
    await store.recordEvent("password_reset_rejected", null, actorIpHash, { reason: "invalid_expired_or_used" });
    return json(res, 400, { ok: false, error: "Ce lien est invalide, expire ou deja utilise." });
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  return json(res, 200, { ok: true, message: "Mot de passe modifie. Vous pouvez maintenant vous connecter." });
}

async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  let body;
  try {
    body = await parseJson(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid request" });
  }
  try {
    if (body.action === "request") return await requestReset(req, res, body);
    if (body.action === "complete") return await completeReset(req, res, body);
    return json(res, 400, { ok: false, error: "Action invalide" });
  } catch (error) {
    console.error("[admin-password-reset] request failed", { code: error.code || "RESET_ERROR" });
    return json(res, 500, { ok: false, error: "La reinitialisation est momentanement indisponible." });
  }
}

module.exports = {
  RESET_TTL_MINUTES,
  allowedOrigin,
  createForcedChangeToken,
  generateResetToken,
  handler,
  resetEmail,
  sha256,
  validNewPassword
};
