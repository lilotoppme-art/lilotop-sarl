const crypto = require("crypto");
const { radarConfig } = require("../lib/business-radar/config");
const { runRadar } = require("../lib/business-radar/service");
const { json, safeError } = require("../lib/business-radar/http");

function matches(left, right) {
  const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  const expected = `Bearer ${radarConfig().cronSecret}`;
  if (radarConfig().cronSecret.length < 32 || !matches(req.headers?.authorization, expected)) return json(res, 401, { ok: false, error: "Invalid cron authorization" });
  try { return json(res, 200, { ok: true, data: await runRadar("cron") }); }
  catch (error) { const normalized = safeError(error); return json(res, normalized.status, normalized.body); }
};
