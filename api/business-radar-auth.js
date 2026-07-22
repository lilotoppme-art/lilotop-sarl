const { radarConfig } = require("../lib/business-radar/config");
const { verifyPassword, createSession, verifySession, sessionCookie, clearSessionCookie } = require("../lib/business-radar/auth");
const { json, parseJson } = require("../lib/business-radar/http");

const attempts = new Map();

function blocked(req) {
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0];
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (entry.resetAt < now) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
  entry.count += 1;
  attempts.set(ip, entry);
  return entry.count > 8;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") return json(res, 200, { ok: true, authenticated: Boolean(verifySession(req)) });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  let body;
  try { body = await parseJson(req); } catch { return json(res, 400, { ok: false, error: "Invalid request" }); }
  if (body.action === "logout") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return json(res, 200, { ok: true });
  }
  if (blocked(req)) return json(res, 429, { ok: false, error: "Too many login attempts" });
  const config = radarConfig();
  if (!config.adminEmail || !config.adminPasswordHash || !config.authSecret) return json(res, 503, { ok: false, error: "Administrator access is not configured", code: "AUTH_NOT_CONFIGURED" });
  const email = String(body.email || "").trim().toLowerCase();
  if (email !== config.adminEmail || !verifyPassword(body.password || "", config.adminPasswordHash)) return json(res, 401, { ok: false, error: "Invalid credentials" });
  res.setHeader("Set-Cookie", sessionCookie(createSession(email)));
  return json(res, 200, { ok: true });
};
