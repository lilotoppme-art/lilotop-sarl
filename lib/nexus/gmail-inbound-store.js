"use strict";

const crypto = require("crypto");
const { query } = require("../business-radar/db");

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await query(`CREATE TABLE IF NOT EXISTS nexus_gmail_connections (
    mailbox text PRIMARY KEY, refresh_token_encrypted text NOT NULL, scopes text[] NOT NULL,
    connected_at timestamptz NOT NULL DEFAULT now(), last_sync_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE TABLE IF NOT EXISTS nexus_supplier_inbound_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gmail_message_id text UNIQUE NOT NULL, gmail_thread_id text,
    message_id_header text, in_reply_to text, references_header text, sender text NOT NULL, recipient text,
    subject text, received_at timestamptz, rfq_id text, workflow_id uuid, supplier text, lot_number integer,
    matching_status text NOT NULL, body_text text, attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    extraction jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  schemaReady = true;
}
function key(secret) { return crypto.createHash("sha256").update(secret).digest(); }
function encrypt(value, secret) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decrypt(value, secret) {
  const [iv, tag, encrypted] = String(value || "").split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw Object.assign(new Error("Invalid encrypted OAuth token"), { code: "OAUTH_TOKEN_INVALID" });
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
async function saveConnection({ mailbox, refreshToken, scopes, encryptionKey }) {
  await ensureSchema();
  await query(`INSERT INTO nexus_gmail_connections (mailbox,refresh_token_encrypted,scopes)
    VALUES ($1,$2,$3) ON CONFLICT (mailbox) DO UPDATE SET refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
    scopes=EXCLUDED.scopes,updated_at=now()`, [mailbox, encrypt(refreshToken, encryptionKey), scopes]);
}
async function connectionStatus(mailbox) {
  await ensureSchema();
  const result = await query("SELECT mailbox,scopes,connected_at,last_sync_at FROM nexus_gmail_connections WHERE mailbox=$1", [mailbox]);
  return result.rows[0] || null;
}
async function loadConnection(mailbox, encryptionKey) {
  await ensureSchema();
  const result = await query("SELECT mailbox,refresh_token_encrypted,scopes,connected_at,last_sync_at FROM nexus_gmail_connections WHERE mailbox=$1", [mailbox]);
  const row = result.rows[0];
  return row ? { ...row, refreshToken: decrypt(row.refresh_token_encrypted, encryptionKey), refresh_token_encrypted: undefined } : null;
}
async function archiveInboundMessage(record) {
  await ensureSchema();
  const original = record.original;
  const result = await query(`INSERT INTO nexus_supplier_inbound_messages (
      gmail_message_id,gmail_thread_id,message_id_header,in_reply_to,references_header,sender,recipient,
      subject,received_at,rfq_id,workflow_id,supplier,lot_number,matching_status,body_text,attachments,extraction
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
    ON CONFLICT (gmail_message_id) DO UPDATE SET matching_status=EXCLUDED.matching_status,
      rfq_id=EXCLUDED.rfq_id,supplier=EXCLUDED.supplier,lot_number=EXCLUDED.lot_number,
      attachments=EXCLUDED.attachments,extraction=EXCLUDED.extraction
    RETURNING id`, [
    original.gmailMessageId, original.gmailThreadId, original.messageId, original.inReplyTo, original.references,
    original.from, original.to, original.subject, original.receivedAt, record.rfqId, record.workflowId || null,
    record.supplier, record.lotNumber, record.matchingStatus, original.bodyText,
    JSON.stringify(record.attachments || []), JSON.stringify(record.extraction || {})
  ]);
  return result.rows[0];
}
module.exports = { archiveInboundMessage, connectionStatus, ensureSchema, loadConnection, saveConnection };
