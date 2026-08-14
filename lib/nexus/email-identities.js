"use strict";

function clean(value) { return String(value || "").trim(); }

function mailbox(value) {
  const text = clean(value);
  return (text.match(/<([^>]+)>/)?.[1] || text).trim().toLowerCase();
}

function emailIdentities(env = process.env) {
  return {
    nexusAdmin: mailbox(env.ADMIN_EMAIL),
    rfqFrom: clean(env.RFQ_FROM),
    rfqFromMailbox: mailbox(env.RFQ_FROM),
    rfqReplyTo: mailbox(env.RFQ_REPLY_TO),
    inboundMailbox: mailbox(env.GMAIL_INBOUND_MAILBOX)
  };
}

function readiness(env = process.env) {
  const identities = emailIdentities(env);
  const missing = [];
  if (!identities.nexusAdmin) missing.push("ADMIN_EMAIL");
  if (!identities.rfqFromMailbox) missing.push("RFQ_FROM");
  if (!identities.rfqReplyTo) missing.push("RFQ_REPLY_TO");
  if (!identities.inboundMailbox) missing.push("GMAIL_INBOUND_MAILBOX");
  return { configured: !missing.length, missing, ...identities };
}

module.exports = { emailIdentities, mailbox, readiness };
