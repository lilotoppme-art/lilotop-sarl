const { verifySession } = require("./auth");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function parseJson(req, maxBytes = 256 * 1024) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error("Request body too large"), { code: "BODY_TOO_LARGE" });
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function requireAdmin(req, res) {
  const session = verifySession(req);
  if (!session) {
    json(res, 401, { ok: false, error: "Authentication required", code: "AUTH_REQUIRED" });
    return null;
  }
  return session;
}

function safeError(error) {
  const known = new Set(["VALIDATION_ERROR", "DATABASE_NOT_CONFIGURED", "AUTH_NOT_CONFIGURED", "UNSAFE_URL", "FETCH_FAILED", "NOT_FOUND", "ATTACHMENTS_NOT_CONFIGURED"]);
  return {
    status: error.code === "VALIDATION_ERROR" || error.code === "UNSAFE_URL" ? 400 : error.code === "NOT_FOUND" ? 404 : ["DATABASE_NOT_CONFIGURED", "ATTACHMENTS_NOT_CONFIGURED"].includes(error.code) ? 503 : 500,
    body: { ok: false, error: known.has(error.code) ? error.message : "Business Radar request failed", code: error.code || "RADAR_ERROR" },
  };
}

module.exports = { json, parseJson, requireAdmin, safeError };
