"use strict";

const identities = require("./email-identities");

function clean(value) { return String(value || "").trim(); }

function encodeHeader(value) {
  const text = clean(value);
  return /^[\x20-\x7e]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function safeFilename(value) {
  return clean(value).replace(/[\r\n"\\]/g, "_") || "attachment.bin";
}

function base64Lines(buffer) {
  return Buffer.from(buffer).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}

function buildRawMessage({ from, to, replyTo, subject, text, attachments = [] }) {
  if (!clean(from) || !clean(to) || !clean(replyTo) || !clean(subject) || !clean(text)) {
    throw Object.assign(new Error("Gmail message fields are incomplete"), { code: "GMAIL_MESSAGE_INVALID" });
  }
  const boundary = `nexus_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${clean(from)}`,
    `To: ${clean(to)}`,
    `Reply-To: ${clean(replyTo)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ];
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(Buffer.from(text, "utf8"))}`
  ];
  for (const attachment of attachments) {
    if (!attachment?.content) continue;
    const filename = safeFilename(attachment.filename);
    parts.push(`--${boundary}\r\nContent-Type: ${clean(attachment.contentType) || "application/octet-stream"}; name="${filename}"\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(attachment.content)}`);
  }
  const mime = `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--\r\n`;
  return Buffer.from(mime, "utf8").toString("base64url");
}

async function sendMessage({ accessToken, message }) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildRawMessage(message) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) {
    const reason = result?.error?.message || "Gmail send failed";
    throw Object.assign(new Error(reason), { code: "GMAIL_SEND_FAILED", status: response.status });
  }
  return { id: result.id, threadId: result.threadId || null, labelIds: result.labelIds || [] };
}

async function messageMetadata({ accessToken, id }) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { messageIdHeader: null };
  const headers = result?.payload?.headers || [];
  return { messageIdHeader: headers.find((item) => String(item.name).toLowerCase() === "message-id")?.value || null };
}

function assertIdentityArchitecture(env = process.env) {
  const status = identities.readiness(env);
  if (!status.configured) throw Object.assign(new Error("NEXUS email identities are incomplete"), { code: "EMAIL_IDENTITIES_INCOMPLETE" });
  if (status.nexusAdmin !== "admin@lilotopsarl.com"
      || status.rfqFromMailbox !== "contact@lilotopsarl.com"
      || status.rfqReplyTo !== "contact@lilotopsarl.com"
      || status.inboundMailbox !== "admin@lilotopsarl.com") {
    throw Object.assign(new Error("NEXUS email identity architecture mismatch"), { code: "EMAIL_IDENTITY_MISMATCH" });
  }
  return status;
}

module.exports = { assertIdentityArchitecture, buildRawMessage, messageMetadata, sendMessage };
