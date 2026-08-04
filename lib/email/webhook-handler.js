"use strict";

const crypto = require("crypto");
const deliveryStore = require("./delivery-store");

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_AGE_SECONDS = 5 * 60;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function rawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Payload too large"), { code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function verifySvixSignature({ secret, id, timestamp, signature, body, now = Date.now() }) {
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > MAX_AGE_SECONDS) return false;
  let key;
  try {
    key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return String(signature).split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const left = Buffer.from(value);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
}

async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return json(res, 503, { ok: false, error: "Webhook is not configured" });

  let body;
  try {
    body = await rawBody(req);
  } catch (error) {
    return json(res, error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, error: "Invalid payload" });
  }
  const id = String(req.headers?.["svix-id"] || "");
  const timestamp = String(req.headers?.["svix-timestamp"] || "");
  const signature = String(req.headers?.["svix-signature"] || "");
  if (!verifySvixSignature({ secret, id, timestamp, signature, body })) {
    return json(res, 401, { ok: false, error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid JSON" });
  }
  try {
    const result = await deliveryStore.recordWebhookEvent(event, id);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error("[email] webhook persistence failed", { code: error.code || "DATABASE_ERROR" });
    return json(res, 500, { ok: false, error: "Webhook persistence failed" });
  }
}

module.exports = handler;
module.exports.verifySvixSignature = verifySvixSignature;
