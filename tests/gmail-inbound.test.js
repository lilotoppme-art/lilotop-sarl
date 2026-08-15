"use strict";

const assert = require("assert");
const gmail = require("../lib/nexus/gmail-inbound");
const outbound = require("../lib/nexus/gmail-outbound");
const identities = require("../lib/nexus/email-identities");
const fs = require("fs");
const path = require("path");

function run() {
  const missing = gmail.readiness({ EMAIL_REPLY_TO: "contact@lilotopsarl.com" });
  assert.equal(missing.configured, false);
  assert.ok(missing.missing.includes("GOOGLE_OAUTH_CLIENT_ID"));

  const configuredEnv = {
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://preview.example.vercel.app/api/nexus-gmail/callback",
    GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY: "x".repeat(32),
    GMAIL_INBOUND_MAILBOX: "contact@lilotopsarl.com"
  };
  const configured = gmail.readiness(configuredEnv);
  assert.equal(configured.configured, true);
  assert.deepEqual(configured.scopes, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send"
  ]);

  process.env.AUTH_SECRET = "test-auth-secret-that-is-at-least-32-characters";
  const state = gmail.stateToken(1_000);
  assert.equal(gmail.verifyState(state, 1_001), true);
  assert.equal(gmail.verifyState(state, 1_000 + (11 * 60 * 1000)), false);

  const rfqs = [{
    id: "UNOPS-62389-L1-HILTI",
    trackingId: "NEXUS-RFQ-ITB2026-62389-HILTI-L1",
    supplier: "Hilti",
    lotNumber: 1,
    contactEmail: "customercare.za@hilti.com"
  }];
  const result = gmail.processSupplierReply({
    gmailMessageId: "gmail-test-1",
    gmailThreadId: "thread-test-1",
    messageId: "<reply@example.test>",
    from: "customercare.za@hilti.com",
    to: "contact@lilotopsarl.com",
    subject: "Re: NEXUS-RFQ-ITB2026-62389-HILTI-L1",
    receivedAt: "2026-08-14T10:00:00.000Z",
    bodyText: "Currency: USD\nUnit price: 125.50\nTotal price: 753.00\nIncoterm: DAP Lilongwe\nLead time: 30 days\nWarranty: 12 months\nValidity: 45 days\nCountry of origin: Germany",
    attachments: [{ filename: "quotation.pdf", mimeType: "application/pdf", size: 1200, gmailAttachmentId: "att-1" }]
  }, rfqs);
  assert.equal(result.matchingStatus, "REPONSE RATTACHEE");
  assert.equal(result.rfqId, "UNOPS-62389-L1-HILTI");
  assert.equal(result.attachments[0].filename, "quotation.pdf");
  assert.equal(result.extraction.currency, "USD");
  assert.equal(result.extraction.unitPrice, 125.5);
  assert.equal(result.extraction.totalPrice, 753);
  assert.equal(result.extraction.incoterm, "DAP Lilongwe");
  const classifiedQuote = gmail.classifySupplierResponse({
    from: "sales@example.test", subject: "Quotation", bodyText: "Currency: USD\nTotal price: 753.00", attachments: [], extraction: result.extraction
  });
  assert.equal(classifiedQuote.category, "A. COTATION RECUE");
  assert.equal(classifiedQuote.quotationExploitable, true);
  assert.equal(gmail.classifySupplierResponse({ from: "mailer-daemon@example.test", subject: "Delivery Status Notification", bodyText: "Undeliverable" }).category, "F. MESSAGE AUTOMATIQUE");

  const uncertain = gmail.processSupplierReply({
    gmailMessageId: "gmail-test-2", from: "unknown@example.test", subject: "Quotation", bodyText: "Thank you"
  }, rfqs);
  assert.equal(uncertain.matchingStatus, "REPONSE A CLASSER MANUELLEMENT");
  assert.equal(uncertain.rfqId, null);

  const normalized = gmail.normalizeGmailMessage({
    id: "gmail-3",
    threadId: "thread-3",
    internalDate: String(Date.parse("2026-08-14T11:00:00.000Z")),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "customercare.za@hilti.com" },
        { name: "To", value: "admin@lilotopsarl.com" },
        { name: "Subject", value: "Re: NEXUS-RFQ-ITB2026-62389-HILTI-L1" }
      ],
      parts: [
        { mimeType: "text/plain", body: { data: Buffer.from("Currency: USD").toString("base64url") } },
        { filename: "quote.pdf", mimeType: "application/pdf", body: { attachmentId: "att-3", size: 2048 } }
      ]
    }
  });
  assert.equal(normalized.gmailMessageId, "gmail-3");
  assert.equal(normalized.bodyText, "Currency: USD");
  assert.equal(normalized.attachments[0].filename, "quote.pdf");

  const handlerSource = fs.readFileSync(path.join(__dirname, "..", "lib", "nexus", "gmail-inbound-handler.js"), "utf8");
  const orchestratorStoreSource = fs.readFileSync(path.join(__dirname, "..", "lib", "nexus", "orchestrator-store.js"), "utf8");
  assert.match(handlerSource, /in:inbox -in:sent newer_than:30d/);
  assert.match(handlerSource, /excludeOutboundMessages/);
  assert.match(handlerSource, /excludeInternalMessages/);
  assert.match(handlerSource, /internalMailboxes\.includes\(senderMailbox\)/);
  assert.match(handlerSource, /listMatchedInbound/);
  assert.match(handlerSource, /sync-supplier-replies/);
  assert.match(orchestratorStoreSource, /rfq_id <> 'NEXUS-INTERNAL-EMAIL-ROUTING-TEST'/);
  assert.match(handlerSource, /includes\("SENT"\)/);

  const raw = outbound.buildRawMessage({
    from: "LILOTOP SARL <contact@lilotopsarl.com>",
    to: "contact@lilotopsarl.com",
    replyTo: "contact@lilotopsarl.com",
    subject: "NEXUS internal send test",
    text: "Currency: USD\nTotal price: 376.50",
    attachments: [{ filename: "quote.csv", contentType: "text/csv", content: Buffer.from("total,currency\n376.50,USD\n") }]
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /From: LILOTOP SARL <contact@lilotopsarl\.com>/);
  assert.match(decoded, /Reply-To: contact@lilotopsarl\.com/);
  assert.match(decoded, /filename="quote\.csv"/);
  assert.equal(typeof outbound.messageMetadata, "function");

  assert.equal(outbound.assertIdentityArchitecture({
    ADMIN_EMAIL: "admin@lilotopsarl.com",
    RFQ_FROM: "LILOTOP SARL <contact@lilotopsarl.com>",
    RFQ_REPLY_TO: "contact@lilotopsarl.com",
    GMAIL_INBOUND_MAILBOX: "admin@lilotopsarl.com"
  }).configured, true);
  assert.throws(() => outbound.assertIdentityArchitecture({
    ADMIN_EMAIL: "admin@lilotopsarl.com",
    RFQ_FROM: "admin@lilotopsarl.com",
    RFQ_REPLY_TO: "contact@lilotopsarl.com",
    GMAIL_INBOUND_MAILBOX: "admin@lilotopsarl.com"
  }), /identity architecture mismatch/);

  const identityStatus = identities.readiness({
    ADMIN_EMAIL: "admin@lilotopsarl.com",
    RFQ_FROM: "LILOTOP SARL <contact@lilotopsarl.com>",
    RFQ_REPLY_TO: "contact@lilotopsarl.com",
    GMAIL_INBOUND_MAILBOX: "admin@lilotopsarl.com"
  });
  assert.equal(identityStatus.configured, true);
  assert.equal(identityStatus.nexusAdmin, "admin@lilotopsarl.com");
  assert.equal(identityStatus.rfqFromMailbox, "contact@lilotopsarl.com");
  assert.equal(identityStatus.rfqReplyTo, "contact@lilotopsarl.com");
  assert.equal(identityStatus.inboundMailbox, "admin@lilotopsarl.com");

  console.log("Gmail inbound tests passed");
}

run();
