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
    message_id_header text, in_reply_to text, references_header text, sender text NOT NULL, recipient text, reply_to text,
    subject text, received_at timestamptz, rfq_id text, workflow_id uuid, supplier text, lot_number integer,
    matching_status text NOT NULL, body_text text, attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    extraction jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE TABLE IF NOT EXISTS nexus_supplier_outbound_authorizations (
    rfq_id text PRIMARY KEY, supplier text NOT NULL, recipient text NOT NULL,
    lot_number integer, authorized_by text NOT NULL, authorized_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'AUTHORIZED', provider_message_id text,
    sent_at timestamptz, last_error text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  ); ALTER TABLE nexus_supplier_inbound_messages ADD COLUMN IF NOT EXISTS reply_to text`);
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
async function markSynced(mailbox) {
  await ensureSchema();
  const result = await query(`UPDATE nexus_gmail_connections
    SET last_sync_at=now(),updated_at=now() WHERE mailbox=$1
    RETURNING mailbox,scopes,connected_at,last_sync_at`, [mailbox]);
  return result.rows[0] || null;
}
async function knownMessageIds(ids) {
  await ensureSchema();
  const values = (ids || []).filter(Boolean);
  if (!values.length) return new Set();
  const result = await query("SELECT gmail_message_id FROM nexus_supplier_inbound_messages WHERE gmail_message_id = ANY($1::text[])", [values]);
  return new Set(result.rows.map((row) => row.gmail_message_id));
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
      gmail_message_id,gmail_thread_id,message_id_header,in_reply_to,references_header,sender,recipient,reply_to,
      subject,received_at,rfq_id,workflow_id,supplier,lot_number,matching_status,body_text,attachments,extraction
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)
    ON CONFLICT (gmail_message_id) DO UPDATE SET matching_status=EXCLUDED.matching_status,
      rfq_id=EXCLUDED.rfq_id,supplier=EXCLUDED.supplier,lot_number=EXCLUDED.lot_number,
      attachments=EXCLUDED.attachments,extraction=EXCLUDED.extraction
    RETURNING id`, [
    original.gmailMessageId, original.gmailThreadId, original.messageId, original.inReplyTo, original.references,
    original.from, original.to, original.replyTo, original.subject, original.receivedAt, record.rfqId, record.workflowId || null,
    record.supplier, record.lotNumber, record.matchingStatus, original.bodyText,
    JSON.stringify(record.attachments || []), JSON.stringify(record.extraction || {})
  ]);
  return result.rows[0];
}
async function authorizeOutbound({ rfqId, supplier, recipient, lotNumber, authorizedBy, metadata }) {
  await ensureSchema();
  const result = await query(`INSERT INTO nexus_supplier_outbound_authorizations
    (rfq_id,supplier,recipient,lot_number,authorized_by,metadata)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT (rfq_id) DO UPDATE SET supplier=EXCLUDED.supplier,recipient=EXCLUDED.recipient,
      lot_number=EXCLUDED.lot_number,authorized_by=EXCLUDED.authorized_by,authorized_at=now(),
      status='AUTHORIZED',provider_message_id=NULL,sent_at=NULL,last_error=NULL,
      metadata=EXCLUDED.metadata,updated_at=now()
    RETURNING rfq_id,supplier,recipient,lot_number,authorized_by,authorized_at,status`,
  [rfqId, supplier, recipient, lotNumber ?? null, authorizedBy, JSON.stringify(metadata || {})]);
  return result.rows[0];
}
async function outboundAuthorization(rfqId) {
  await ensureSchema();
  const result = await query(`SELECT rfq_id,supplier,recipient,lot_number,authorized_by,
    authorized_at,status,provider_message_id,sent_at,last_error,metadata
    FROM nexus_supplier_outbound_authorizations WHERE rfq_id=$1`, [rfqId]);
  return result.rows[0] || null;
}
async function markOutboundSent(rfqId, providerMessageId) {
  await ensureSchema();
  const result = await query(`UPDATE nexus_supplier_outbound_authorizations
    SET status='SENT',provider_message_id=$2,sent_at=now(),last_error=NULL,updated_at=now()
    WHERE rfq_id=$1 AND status='AUTHORIZED'
    RETURNING rfq_id,status,provider_message_id,sent_at`, [rfqId, providerMessageId]);
  return result.rows[0] || null;
}
async function markOutboundFailed(rfqId, error) {
  await ensureSchema();
  await query(`UPDATE nexus_supplier_outbound_authorizations
    SET status='FAILED',last_error=$2,updated_at=now() WHERE rfq_id=$1`, [rfqId, String(error || "Gmail send failed").slice(0, 500)]);
}
async function latestInboundByRfq(rfqId) {
  await ensureSchema();
  const result = await query(`SELECT gmail_message_id,gmail_thread_id,message_id_header,sender,recipient,reply_to,
    subject,received_at,rfq_id,supplier,lot_number,matching_status,attachments,extraction,created_at
    FROM nexus_supplier_inbound_messages WHERE rfq_id=$1 ORDER BY created_at DESC LIMIT 1`, [rfqId]);
  return result.rows[0] || null;
}
module.exports = { archiveInboundMessage, authorizeOutbound, connectionStatus, ensureSchema, knownMessageIds, latestInboundByRfq, loadConnection, markOutboundFailed, markOutboundSent, markSynced, outboundAuthorization, saveConnection };
