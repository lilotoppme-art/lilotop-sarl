"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { json, requireAdmin } = require("../business-radar/http");
const gmail = require("./gmail-inbound");
const outbound = require("./gmail-outbound");
const store = require("./gmail-inbound-store");
const orchestratorStore = require("./orchestrator-store");
const identities = require("./email-identities");
const { extractTenderDocument } = require("./tender-response-documents");

const INTERNAL_ROUTING_TEST_RFQ = {
  id: "NEXUS-INTERNAL-EMAIL-ROUTING-TEST",
  trackingId: "NEXUS-RFQ-ROUTING-TEST",
  supplier: "LILOTOP INTERNAL TEST",
  lotNumber: 0,
  contactEmail: "lilotoppme@gmail.com"
};

function redirect(res, location) {
  res.statusCode = 303; res.setHeader("Location", location); res.setHeader("Cache-Control", "no-store"); res.end();
}

async function exchangeCode(code, cfg) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" })
  });
  const result = await response.json();
  if (!response.ok || !result.refresh_token) throw Object.assign(new Error("Google OAuth token exchange failed"), { code: "GOOGLE_OAUTH_EXCHANGE_FAILED" });
  return result;
}

async function refreshAccessToken(refreshToken, cfg) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw Object.assign(new Error("Google OAuth refresh failed"), { code: "GOOGLE_OAUTH_REFRESH_FAILED" });
  return result.access_token;
}

async function gmailJson(path, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error("Gmail API request failed"), { code: "GMAIL_API_FAILED" });
  return result;
}

async function accessTokenAndConnection() {
  const cfg = gmail.config();
  const connection = await store.loadConnection(cfg.mailbox, cfg.encryptionKey);
  if (!connection) throw Object.assign(new Error("Google OAuth consent is required"), { code: "GOOGLE_OAUTH_CONSENT_REQUIRED" });
  return { cfg, connection, accessToken: await refreshAccessToken(connection.refreshToken, cfg) };
}

async function sendAuthorizedSupplierRfq({ workflowId, rfqId }) {
  const workflow = await orchestratorStore.getWorkflow(workflowId);
  const rfq = workflow?.dossier?.supplierCycle?.rfqs?.find((item) => item.id === rfqId);
  if (!rfq || !rfq.authorizedAt || rfq.sentAt) {
    throw Object.assign(new Error("This exact RFQ is not authorized for sending"), { code: "RFQ_NOT_AUTHORIZED" });
  }
  if (!rfq.directEmailVerified || !rfq.rfqPdfReady || rfq.sendRecommendation !== "OUI") {
    throw Object.assign(new Error("The RFQ final control is not compliant for sending"), { code: "RFQ_FINAL_CONTROL_FAILED" });
  }
  const authorization = await store.outboundAuthorization(rfq.id);
  if (!authorization || authorization.status !== "AUTHORIZED" || authorization.recipient !== rfq.contact?.email) {
    throw Object.assign(new Error("Per-RFQ authorization record is missing or mismatched"), { code: "RFQ_AUTHORIZATION_MISMATCH" });
  }
  const identity = outbound.assertIdentityArchitecture();
  const attachments = [];
  for (const filename of (rfq.attachments || [])) {
    const safe = path.basename(filename);
    const filePath = path.join(process.cwd(), "assets", "rfq", safe);
    if (fs.existsSync(filePath)) attachments.push({ filename: safe, contentType: "application/pdf", content: fs.readFileSync(filePath) });
  }
  if (!rfq.attachments?.length || attachments.length !== rfq.attachments.length) {
    throw Object.assign(new Error("The verified RFQ PDF is unavailable"), { code: "RFQ_ATTACHMENT_MISSING" });
  }
  const { accessToken } = await accessTokenAndConnection();
  try {
    const sent = await outbound.sendMessage({ accessToken, message: {
      from: identity.rfqFrom, to: rfq.contact.email, replyTo: identity.rfqReplyTo,
      subject: rfq.subject, text: rfq.emailBody, attachments
    } });
    const metadata = await outbound.messageMetadata({ accessToken, id: sent.id });
    const sendLog = await store.markOutboundSent(rfq.id, sent.id);
    const sentAt = sendLog.sent_at;
    const supplierCycle = {
      ...workflow.dossier.supplierCycle,
      rfqs: workflow.dossier.supplierCycle.rfqs.map((item) => item.id === rfq.id
        ? { ...item, status: "RFQ ENVOYEE", emailSent: true, sentAt, gmailMessageId: sent.id, messageIdHeader: metadata.messageIdHeader }
        : item)
    };
    supplierCycle.counts = {
      ...(supplierCycle.counts || {}),
      sent: supplierCycle.rfqs.filter((item) => item.sentAt).length
    };
    const finalValidation = {
      ...(workflow.dossier.finalValidation || {}),
      supplierCycle,
      supplierRfqs: supplierCycle.rfqs,
      rfqSummary: {
        ...(workflow.dossier.finalValidation?.rfqSummary || {}),
        prepared: supplierCycle.counts.prepared,
        contactsVerified: supplierCycle.rfqs.filter((item) => item.contact?.verified).length,
        sent: supplierCycle.counts.sent,
        readyToSend: supplierCycle.rfqs.filter((item) => item.authorizedAt && !item.sentAt).length
      }
    };
    await orchestratorStore.updateDossier(
      workflow.id,
      { ...workflow.dossier, supplierCycle, finalValidation },
      authorization.authorized_by,
      "send-authorized-unops-supplier-rfq",
      "RFQ UNOPS autorisee envoyee via Gmail API",
      { rfqId: rfq.id, supplier: rfq.supplier, recipient: rfq.contact.email, lotNumber: rfq.lotNumber, gmailMessageId: sent.id, messageIdHeader: metadata.messageIdHeader },
      "supplier-ai"
    );
    return { ...sendLog, gmailMessageId: sent.id, messageIdHeader: metadata.messageIdHeader };
  } catch (error) {
    await store.markOutboundFailed(rfq.id, error.message);
    throw error;
  }
}

async function syncSupplierReplies() {
  const { cfg, accessToken } = await accessTokenAndConnection();
  const identityStatus = identities.readiness();
  const outboundReclassified = await store.excludeOutboundMessages();
  const internalMailboxes = [
    identityStatus.nexusAdmin,
    identityStatus.rfqFromMailbox,
    identityStatus.rfqReplyTo,
    identityStatus.inboundMailbox,
    INTERNAL_ROUTING_TEST_RFQ.contactEmail
  ].filter(Boolean);
  const internalReclassified = await store.excludeInternalMessages(internalMailboxes);
  const workflows = await orchestratorStore.listWorkflows(100);
  const workflow = workflows.find((item) => /ITB\/2026\/62389/i.test(String(
    item.dossier?.analysis?.tenderNumber || item.dossier?.tenderResponse?.keyInformation?.tenderNumber || item.dossier?.opportunity?.reference || ""
  )));
  const rfqs = [...(workflow?.dossier?.supplierCycle?.rfqs || []), INTERNAL_ROUTING_TEST_RFQ];
  const query = encodeURIComponent('in:inbox -in:sent newer_than:30d {subject:"ITB/2026/62389" subject:"NEXUS-RFQ-ITB2026-62389" subject:"NEXUS-RFQ-ROUTING-TEST"}');
  const listed = await gmailJson(`messages?q=${query}&maxResults=20`, accessToken);
  const ids = (listed.messages || []).map((item) => item.id);
  const known = await store.knownMessageIds(ids);
  let archived = 0;
  let matched = 0;
  for (const item of (listed.messages || [])) {
    if (known.has(item.id)) continue;
    const source = await gmailJson(`messages/${encodeURIComponent(item.id)}?format=full`, accessToken);
    if ((source.labelIds || []).includes("SENT")) continue;
    const normalized = gmail.normalizeGmailMessage(source);
    const senderMailbox = identities.mailbox(normalized.from);
    if (internalMailboxes.includes(senderMailbox)) continue;
    const record = gmail.processSupplierReply(normalized, rfqs);
    await store.archiveInboundMessage({ ...record, workflowId: workflow?.id || null });
    archived += 1;
    if (record.rfqId) matched += 1;
  }
  const matchedMessages = workflow ? await store.listMatchedInbound(workflow.id) : [];
  const existingDocuments = workflow ? await orchestratorStore.listWorkflowDocuments(workflow.id) : [];
  const knownAttachmentSources = new Map(existingDocuments.map((document) => [document.sourceUrl, document]));
  const responses = [];
  for (const message of matchedMessages) {
    const rfq = rfqs.find((item) => item.id === message.rfq_id);
    const attachments = [];
    for (const attachment of (message.attachments || [])) {
      const sourceUrl = `gmail://${message.gmail_message_id}/attachment/${attachment.gmailAttachmentId || attachment.filename}`;
      let document = knownAttachmentSources.get(sourceUrl) || null;
      if (!document && attachment.gmailAttachmentId && workflow) {
        try {
          const payload = await gmailJson(`messages/${encodeURIComponent(message.gmail_message_id)}/attachments/${encodeURIComponent(attachment.gmailAttachmentId)}`, accessToken);
          const buffer = Buffer.from(String(payload.data || ""), "base64url");
          if (buffer.length) {
            let extractedText = "";
            try { extractedText = (await extractTenderDocument({ filename: path.basename(attachment.filename), buffer })).text || ""; } catch { extractedText = ""; }
            document = await orchestratorStore.saveWorkflowDocument(workflow, {
              sourceUrl, finalUrl: sourceUrl, filename: path.basename(attachment.filename),
              mimeType: attachment.mimeType || "application/octet-stream", sizeBytes: buffer.length,
              sha256: crypto.createHash("sha256").update(buffer).digest("hex"), extractedText, buffer
            });
            knownAttachmentSources.set(sourceUrl, document);
          }
        } catch { document = null; }
      }
      attachments.push({ filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, documentId: document?.id || null });
    }
    const extraction = message.extraction || {};
    const classification = gmail.classifySupplierResponse({
      from: message.sender, subject: message.subject, bodyText: message.body_text,
      attachments: message.attachments || [], extraction
    });
    responses.push({
      gmailMessageId: message.gmail_message_id, gmailThreadId: message.gmail_thread_id,
      messageIdHeader: message.message_id_header, outboundGmailMessageId: rfq?.gmailMessageId || null,
      outboundMessageIdHeader: rfq?.messageIdHeader || null, rfqId: message.rfq_id,
      supplier: message.supplier, lotNumber: message.lot_number,
      lineNumbers: (rfq?.products || []).map((item) => item.itemNumber),
      sentAt: rfq?.sentAt || null, receivedAt: message.received_at, sender: message.sender,
      subject: message.subject, responseType: classification.category,
      recommendedAction: classification.recommendedAction,
      quotationExploitable: classification.quotationExploitable,
      attachmentCount: attachments.length, attachments, extraction,
      currency: extraction.currency || null, unitPrice: extraction.unitPrice ?? null,
      totalPrice: extraction.totalPrice ?? null, deliveryLeadTime: extraction.deliveryLeadTime || null,
      incoterm: extraction.incoterm || null, technicalCompliance: classification.quotationExploitable ? "INFORMATION INSUFFISANTE" : "NON APPLICABLE"
    });
  }
  if (workflow) {
    const currentCycle = workflow.dossier?.supplierCycle || {};
    const sentCount = (currentCycle.rfqs || []).filter((rfq) => rfq.sentAt).length;
    const responseRfqCount = new Set(responses.map((item) => item.rfqId)).size;
    const exploitableCount = responses.filter((item) => item.quotationExploitable).length;
    const responseStats = {
      total: responses.length,
      quotations: responses.filter((item) => item.responseType.startsWith("A.")).length,
      exploitableQuotations: exploitableCount,
      acknowledgements: responses.filter((item) => item.responseType.startsWith("B.")).length,
      clarificationRequests: responses.filter((item) => item.responseType.startsWith("C.")).length,
      refusals: responses.filter((item) => item.responseType.startsWith("D.")).length,
      redirects: responses.filter((item) => item.responseType.startsWith("E.")).length,
      automaticMessages: responses.filter((item) => item.responseType.startsWith("F.")).length,
      other: responses.filter((item) => item.responseType.startsWith("G.")).length,
      withoutResponse: Math.max(0, sentCount - responseRfqCount)
    };
    const previousIds = (currentCycle.responses || []).map((item) => item.gmailMessageId).sort();
    const nextIds = responses.map((item) => item.gmailMessageId).sort();
    if (JSON.stringify(previousIds) !== JSON.stringify(nextIds)
      || JSON.stringify(currentCycle.responseStats || {}) !== JSON.stringify(responseStats)) {
      const supplierCycle = {
        ...currentCycle, responses, responseStats,
        counts: { ...currentCycle.counts, received: responses.length, missing: responseStats.withoutResponse }
      };
      const finalValidation = {
        ...(workflow.dossier?.finalValidation || {}), supplierCycle,
        quotationsReceived: exploitableCount,
        quotationsMissing: Math.max(0, sentCount - exploitableCount),
        rfqSummary: { ...(workflow.dossier?.finalValidation?.rfqSummary || {}), sent: sentCount, responses: responses.length },
        pricingSummary: { ...(workflow.dossier?.finalValidation?.pricingSummary || {}), quotationsReceived: exploitableCount }
      };
      await orchestratorStore.updateDossier(
        workflow.id, { ...workflow.dossier, supplierCycle, finalValidation },
        "admin@lilotopsarl.com", "sync-supplier-replies",
        "Reponses Gmail fournisseurs synchronisees avec le dossier UNOPS",
        { responses: responses.length, exploitableQuotations: exploitableCount, externalAction: false }, "supplier-ai"
      );
    }
  }
  const status = await store.markSynced(cfg.mailbox);
  return { mailbox: cfg.mailbox, checked: ids.length, archived, matched, outboundReclassified, internalReclassified, lastSyncAt: status?.last_sync_at || null, identities: identityStatus, sendPerformed: false };
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/nexus-gmail", "http://localhost");
  const action = url.searchParams.get("action") || "status";
  try {
    if (action === "callback") {
      if (!gmail.verifyState(url.searchParams.get("state")) || !url.searchParams.get("code")) {
        return redirect(res, "/admin/nexus/orchestrator?gmail=authorization_failed#hilti-pilot-rfq");
      }
      const cfg = gmail.config();
      const tokens = await exchangeCode(url.searchParams.get("code"), cfg);
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || String(profile.emailAddress || "").toLowerCase() !== cfg.mailbox) {
        return redirect(res, "/admin/nexus/orchestrator?gmail=mailbox_mismatch#hilti-pilot-rfq");
      }
      await store.saveConnection({ mailbox: cfg.mailbox, refreshToken: tokens.refresh_token, scopes: String(tokens.scope || `${gmail.GMAIL_READONLY} ${gmail.GMAIL_SEND}`).split(" "), encryptionKey: cfg.encryptionKey });
      return redirect(res, "/admin/nexus/orchestrator?gmail=connected#hilti-pilot-rfq");
    }
    const session = requireAdmin(req, res); if (!session) return;
    const readiness = gmail.readiness();
    if (action === "authorize") return redirect(res, gmail.authorizationUrl());
    if (action === "sync") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "Methode non autorisee" });
      return json(res, 200, { ok: true, data: await syncSupplierReplies() });
    }
    if (action === "send-authorized-rfq") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "Methode non autorisee" });
      const body = await new Promise((resolve, reject) => {
        let raw = ""; req.on("data", (chunk) => { raw += chunk; if (raw.length > 10000) reject(new Error("Payload too large")); });
        req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); } }); req.on("error", reject);
      });
      return json(res, 200, { ok: true, data: await sendAuthorizedSupplierRfq({ workflowId: body.workflowId, rfqId: body.rfqId }) });
    }
    let connection = null;
    if (readiness.configured) connection = await store.connectionStatus(readiness.mailbox);
    return json(res, 200, { ok: true, data: { ...readiness, connected: Boolean(connection), consentRequired: !connection, connection } });
  } catch (error) {
    console.error("[gmail-inbound] request failed", { code: error.code || "GMAIL_INBOUND_ERROR" });
    return json(res, error.code === "GOOGLE_OAUTH_NOT_CONFIGURED" ? 503 : 500, { ok: false, error: error.message, code: error.code || "GMAIL_INBOUND_ERROR" });
  }
};
