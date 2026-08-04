"use strict";

const { query } = require("../business-radar/db");

function clean(value, limit = 1000) {
  return String(value || "").trim().slice(0, limit);
}

function recipientText(value) {
  const recipients = Array.isArray(value) ? value : [value];
  return recipients.map((item) => clean(item, 320)).filter(Boolean).join(", ");
}

async function recordAccepted(data) {
  if (!data.providerMessageId) return null;
  const result = await query(`
    INSERT INTO email_delivery_log
      (provider,sender,reply_to,recipient,subject,status,provider_message_id,metadata,event_at)
    VALUES ($1,$2,$3,$4,$5,'accepted',$6,$7::jsonb,now())
    ON CONFLICT (provider_message_id) DO UPDATE SET
      sender=EXCLUDED.sender, reply_to=EXCLUDED.reply_to,
      recipient=EXCLUDED.recipient, subject=EXCLUDED.subject, updated_at=now()
    RETURNING *`, [
      clean(data.provider || "resend", 40), clean(data.sender, 320),
      clean(data.replyTo, 320) || null, recipientText(data.recipient),
      clean(data.subject, 500) || null, clean(data.providerMessageId, 200),
      JSON.stringify(data.metadata || {})
    ]);
  return result.rows[0] || null;
}

async function recordFailure(data) {
  const result = await query(`
    INSERT INTO email_delivery_log
      (provider,sender,reply_to,recipient,subject,status,provider_message_id,error_code,error_message,metadata,event_at)
    VALUES ($1,$2,$3,$4,$5,'failed',$6,$7,$8,$9::jsonb,now())
    ON CONFLICT (provider_message_id) DO UPDATE SET
      status='failed', error_code=EXCLUDED.error_code,
      error_message=EXCLUDED.error_message, updated_at=now(), event_at=now()
    RETURNING *`, [
      clean(data.provider || "resend", 40), clean(data.sender, 320),
      clean(data.replyTo, 320) || null, recipientText(data.recipient),
      clean(data.subject, 500) || null, clean(data.providerMessageId, 200) || null,
      clean(data.errorCode, 120) || null, clean(data.errorMessage, 1000) || null,
      JSON.stringify(data.metadata || {})
    ]);
  return result.rows[0] || null;
}

function mapEventStatus(type) {
  return ({
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "deferred",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.suppressed": "suppressed",
    "email.failed": "failed"
  })[type] || null;
}

async function recordWebhookEvent(event, eventId) {
  const status = mapEventStatus(event?.type);
  const data = event?.data || {};
  const providerMessageId = clean(data.email_id || data.id, 200);
  if (!status || !providerMessageId || !eventId) return { ignored: true };

  const claimed = await query(`
    INSERT INTO email_delivery_webhook_events (event_id,event_type,provider_message_id)
    VALUES ($1,$2,$3)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id`, [clean(eventId, 200), clean(event.type, 80), providerMessageId]);
  if (!claimed.rowCount) return { duplicate: true };

  const bounce = data.bounce || {};
  const result = await query(`
    INSERT INTO email_delivery_log
      (provider,sender,recipient,subject,status,provider_message_id,provider_event_id,error_code,error_message,bounce_type,metadata,event_at)
    VALUES ('resend',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11::timestamptz,now()))
    ON CONFLICT (provider_message_id) DO UPDATE SET
      status=EXCLUDED.status, provider_event_id=EXCLUDED.provider_event_id,
      error_code=EXCLUDED.error_code, error_message=EXCLUDED.error_message,
      bounce_type=EXCLUDED.bounce_type,
      metadata=email_delivery_log.metadata || EXCLUDED.metadata,
      event_at=EXCLUDED.event_at, updated_at=now()
    RETURNING *`, [
      clean(data.from, 320) || "notifications@updates.lilotopsarl.com",
      recipientText(data.to) || "unknown", clean(data.subject, 500) || null,
      status, providerMessageId, clean(eventId, 200),
      clean(data.error?.code || bounce.code, 120) || null,
      clean(data.error?.message || bounce.message || data.reason, 1000) || null,
      clean(bounce.type, 120) || null, JSON.stringify({ eventType: event.type }),
      data.created_at || event.created_at || null
    ]);
  return { updated: true, row: result.rows[0] };
}

async function listRecent(limit = 100) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  const result = await query(`
    SELECT id,provider,sender,reply_to,recipient,subject,status,provider_message_id,
      error_code,error_message,bounce_type,event_at,created_at,updated_at
    FROM email_delivery_log
    ORDER BY COALESCE(event_at,created_at) DESC LIMIT $1`, [safeLimit]);
  return result.rows;
}

async function summary() {
  const result = await query(`
    SELECT count(*)::int total,
      count(*) FILTER (WHERE status='delivered')::int delivered,
      count(*) FILTER (WHERE status IN ('accepted','sent'))::int pending,
      count(*) FILTER (WHERE status='deferred')::int deferred,
      count(*) FILTER (WHERE status IN ('bounced','complained','suppressed','blocked','failed'))::int alerts
    FROM email_delivery_log WHERE created_at >= now() - interval '30 days'`);
  return result.rows[0];
}

module.exports = { recordAccepted, recordFailure, recordWebhookEvent, mapEventStatus, listRecent, summary };
