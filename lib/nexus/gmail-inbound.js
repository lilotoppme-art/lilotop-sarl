"use strict";

const crypto = require("crypto");
const { radarConfig } = require("../business-radar/config");

const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

function clean(value) { return String(value || "").trim(); }

function config(env = process.env) {
  return {
    clientId: clean(env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: clean(env.GOOGLE_OAUTH_CLIENT_SECRET),
    redirectUri: clean(env.GOOGLE_OAUTH_REDIRECT_URI),
    encryptionKey: clean(env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY),
    mailbox: clean(env.GMAIL_INBOUND_MAILBOX || env.EMAIL_REPLY_TO).toLowerCase()
  };
}

function readiness(env = process.env) {
  const value = config(env);
  const missing = [];
  if (!value.clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!value.clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!value.redirectUri) missing.push("GOOGLE_OAUTH_REDIRECT_URI");
  if (value.encryptionKey.length < 32) missing.push("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY");
  if (!value.mailbox) missing.push("GMAIL_INBOUND_MAILBOX");
  return { configured: !missing.length, missing, mailbox: value.mailbox || null, scope: GMAIL_READONLY };
}

function stateToken(now = Date.now()) {
  const secret = radarConfig().authSecret;
  if (secret.length < 32) throw Object.assign(new Error("AUTH_SECRET is required"), { code: "AUTH_NOT_CONFIGURED" });
  const payload = Buffer.from(JSON.stringify({ exp: now + 10 * 60 * 1000, nonce: crypto.randomBytes(18).toString("hex") })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(token, now = Date.now()) {
  const [payload, signature] = clean(token).split(".");
  const secret = radarConfig().authSecret;
  if (!payload || !signature || secret.length < 32) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp > now; } catch { return false; }
}

function authorizationUrl(env = process.env) {
  const value = config(env);
  const status = readiness(env);
  if (!status.configured) throw Object.assign(new Error(`Google OAuth is not configured: ${status.missing.join(", ")}`), { code: "GOOGLE_OAUTH_NOT_CONFIGURED" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: value.clientId, redirect_uri: value.redirectUri, response_type: "code",
    scope: `openid email ${GMAIL_READONLY}`, access_type: "offline", prompt: "consent",
    include_granted_scopes: "true", login_hint: value.mailbox, state: stateToken()
  }).toString();
  return url.toString();
}

function correlationScore(message, rfq) {
  const subject = clean(message.subject).toLowerCase();
  const sender = clean(message.from).toLowerCase();
  const refs = `${clean(message.inReplyTo)} ${clean(message.references)}`.toLowerCase();
  let score = 0;
  if (rfq.providerMessageId && refs.includes(clean(rfq.providerMessageId).toLowerCase())) score += 100;
  if (subject.includes(clean(rfq.trackingId).toLowerCase())) score += 80;
  const contactEmail = clean(rfq.contactEmail || rfq.contact?.email).toLowerCase();
  if (contactEmail && (sender === contactEmail || sender.includes(`<${contactEmail}>`))) score += 40;
  if (subject.includes("itb/2026/62389")) score += 20;
  if (subject.includes(clean(rfq.supplier).toLowerCase()) && subject.includes(`lot ${rfq.lotNumber}`)) score += 15;
  return score;
}

function matchSupplierReply(message, rfqs) {
  const ranked = (rfqs || []).map((rfq) => ({ rfq, score: correlationScore(message, rfq) })).sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < 60 || (ranked[1] && ranked[1].score === ranked[0].score)) {
    return { status: "REPONSE A CLASSER MANUELLEMENT", rfq: null, confidence: ranked[0]?.score || 0 };
  }
  return { status: "REPONSE RATTACHEE", rfq: ranked[0].rfq, confidence: ranked[0].score };
}

function extractQuotation(text) {
  const source = clean(text);
  const field = (pattern) => source.match(pattern)?.[1]?.trim() || null;
  const amount = (value) => value ? Number(value.replace(/\s/g, "").replace(",", ".")) : null;
  return {
    manufacturer: field(/\b(?:manufacturer|fabricant)\s*[:=-]\s*([^\r\n;]+)/i),
    model: field(/\b(?:model|modele)\s*[:=-]\s*([^\r\n;]+)/i),
    partNumber: field(/\b(?:part number|reference fabricant)\s*[:=-]\s*([^\r\n;]+)/i),
    quantity: amount(field(/\b(?:quantity|quantite)\s*[:=-]\s*([0-9][0-9 ,.]*)/i)),
    currency: field(/\b(?:currency|devise)\s*[:=-]\s*([A-Z]{3})\b/i),
    unitPrice: amount(field(/\b(?:unit price|prix unitaire)\s*[:=-]\s*([0-9][0-9 ,.]+)/i)),
    totalPrice: amount(field(/\b(?:total price|prix total)\s*[:=-]\s*([0-9][0-9 ,.]+)/i)),
    incoterm: field(/\b(?:incoterm)\s*[:=-]\s*([^\r\n;]+)/i),
    deliveryLeadTime: field(/\b(?:lead time|delai)\s*[:=-]\s*([^\r\n;]+)/i),
    warranty: field(/\b(?:warranty|garantie)\s*[:=-]\s*([^\r\n;]+)/i),
    validity: field(/\b(?:validity|validite)\s*[:=-]\s*([^\r\n;]+)/i),
    countryOfOrigin: field(/\b(?:country of origin|pays d'origine)\s*[:=-]\s*([^\r\n;]+)/i),
    taxes: amount(field(/\b(?:taxes|tax)\s*[:=-]\s*([0-9][0-9 ,.]+)/i)),
    freight: amount(field(/\b(?:freight|fret|transport)\s*[:=-]\s*([0-9][0-9 ,.]+)/i)),
    availability: field(/\b(?:availability|disponibilite)\s*[:=-]\s*([^\r\n;]+)/i),
    alternative: field(/\b(?:alternative)\s*[:=-]\s*([^\r\n;]+)/i),
    extractedOnlyWhenPresent: true
  };
}

function processSupplierReply(message, rfqs) {
  const match = matchSupplierReply(message, rfqs);
  return {
    matchingStatus: match.status,
    confidence: match.confidence,
    rfqId: match.rfq?.id || null,
    supplier: match.rfq?.supplier || null,
    lotNumber: match.rfq?.lotNumber || null,
    original: {
      gmailMessageId: clean(message.gmailMessageId),
      gmailThreadId: clean(message.gmailThreadId) || null,
      messageId: clean(message.messageId) || null,
      inReplyTo: clean(message.inReplyTo) || null,
      references: clean(message.references) || null,
      from: clean(message.from),
      to: clean(message.to) || null,
      subject: clean(message.subject),
      receivedAt: message.receivedAt || null,
      bodyText: clean(message.bodyText)
    },
    attachments: (message.attachments || []).map((item) => ({
      filename: clean(item.filename),
      mimeType: clean(item.mimeType),
      size: Number(item.size) || 0,
      gmailAttachmentId: clean(item.gmailAttachmentId) || null
    })),
    extraction: extractQuotation(message.bodyText)
  };
}

function decodeBase64Url(value) {
  if (!value) return "";
  try { return Buffer.from(String(value), "base64url").toString("utf8"); } catch { return ""; }
}

function headerMap(headers) {
  return Object.fromEntries((headers || []).map((item) => [clean(item.name).toLowerCase(), clean(item.value)]));
}

function messageBody(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of (part.parts || [])) {
    const value = messageBody(child);
    if (value) return value;
  }
  return part.body?.data ? decodeBase64Url(part.body.data) : "";
}

function attachmentMetadata(part, output = []) {
  if (!part) return output;
  if (part.filename && part.body?.attachmentId) {
    output.push({
      filename: clean(part.filename),
      mimeType: clean(part.mimeType),
      size: Number(part.body.size) || 0,
      gmailAttachmentId: clean(part.body.attachmentId)
    });
  }
  for (const child of (part.parts || [])) attachmentMetadata(child, output);
  return output;
}

function normalizeGmailMessage(message) {
  const headers = headerMap(message?.payload?.headers);
  return {
    gmailMessageId: clean(message?.id),
    gmailThreadId: clean(message?.threadId),
    messageId: headers["message-id"] || null,
    inReplyTo: headers["in-reply-to"] || null,
    references: headers.references || null,
    from: headers.from || "",
    to: headers.to || null,
    subject: headers.subject || "",
    receivedAt: message?.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
    bodyText: messageBody(message?.payload),
    attachments: attachmentMetadata(message?.payload)
  };
}

module.exports = { GMAIL_READONLY, authorizationUrl, config, correlationScore, extractQuotation, matchSupplierReply, normalizeGmailMessage, processSupplierReply, readiness, stateToken, verifyState };
