const { emailConfig } = require("./config");
const { createResendClient } = require("./resend");

const sentKeys = new Map();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_ATTACHMENT_TOTAL = 8 * 1024 * 1024;

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function extractAddress(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || "").trim()).filter(Boolean);
}

function assertRecipients(to) {
  const recipients = normalizeList(to);
  if (!recipients.length || recipients.some((item) => !isEmail(item))) {
    const error = new Error("Invalid email recipient");
    error.code = "INVALID_RECIPIENT";
    throw error;
  }
  return recipients;
}

function assertSender(from) {
  if (!isEmail(extractAddress(from))) {
    const error = new Error("Invalid email sender");
    error.code = "INVALID_SENDER";
    throw error;
  }
}

function assertAttachments(attachments = []) {
  const total = attachments.reduce((sum, item) => {
    const raw = item.content || "";
    return sum + Buffer.byteLength(raw, "base64");
  }, 0);
  if (total > MAX_ATTACHMENT_TOTAL) {
    const error = new Error("Attachments too large");
    error.code = "ATTACHMENTS_TOO_LARGE";
    throw error;
  }
}

function rememberKey(key) {
  if (!key) return null;
  const now = Date.now();
  for (const [storedKey, expiresAt] of sentKeys.entries()) {
    if (expiresAt < now) sentKeys.delete(storedKey);
  }
  if (sentKeys.has(key)) {
    const error = new Error("Duplicate submission");
    error.code = "DUPLICATE_SUBMISSION";
    throw error;
  }
  sentKeys.set(key, now + IDEMPOTENCY_TTL_MS);
  return key;
}

function jsonError(error) {
  if (error.code === "EMAIL_SERVICE_NOT_CONFIGURED") {
    return { status: 503, body: { ok: false, error: "Email service is not configured", code: error.code } };
  }
  if (error.code === "INVALID_RECIPIENT" || error.code === "INVALID_SENDER" || error.code === "ATTACHMENTS_TOO_LARGE") {
    return { status: 400, body: { ok: false, error: "Email request is invalid", code: error.code } };
  }
  if (error.code === "DUPLICATE_SUBMISSION") {
    return { status: 409, body: { ok: false, error: "Duplicate submission", code: error.code } };
  }
  return { status: 502, body: { ok: false, error: "Email delivery failed", code: "EMAIL_DELIVERY_FAILED" } };
}

async function sendWebsiteEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  attachments = [],
  idempotencyKey,
}) {
  const config = emailConfig();
  const recipients = assertRecipients(to);
  assertSender(config.from);
  if (replyTo && !isEmail(replyTo)) {
    const error = new Error("Invalid reply-to");
    error.code = "INVALID_RECIPIENT";
    throw error;
  }
  assertAttachments(attachments);
  rememberKey(idempotencyKey);

  const payload = {
    from: config.from,
    to: recipients,
    subject,
    html,
    text,
    attachments,
  };
  if (replyTo) payload.reply_to = replyTo;

  console.info("[email] sending website email", {
    subject,
    toCount: recipients.length,
    attachmentCount: attachments.length,
    environment: config.environment,
    testMode: config.testMode,
  });

  const result = await createResendClient().send(payload);
  const id = result?.data?.id || result?.id || null;
  return { ok: true, id };
}

module.exports = {
  sendWebsiteEmail,
  jsonError,
  isEmail,
};
