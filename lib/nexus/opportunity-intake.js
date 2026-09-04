"use strict";

const { safeFetch } = require("../business-radar/connectors/http");
const businessStore = require("../business-radar/store");
const orchestratorStore = require("./orchestrator-store");
const { officialUrl, retrieveOfficialDocument } = require("./tender-source");

const DOCUMENT_EXTENSION = /\.(?:pdf|docx|xlsx|zip)(?:$|[?#])/i;
const SYSTEM_ACTOR = "business-radar@nexus.local";

function normalizeReference(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function deadlineIntake(deadlineAt, now = new Date()) {
  if (!deadlineAt) {
    return { status: "ÉCHÉANCE À CONFIRMER", expired: false, officialDeadline: null, internalDeadline: null, remainingHours: null };
  }
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return { status: "ÉCHÉANCE À CONFIRMER", expired: false, officialDeadline: null, internalDeadline: null, remainingHours: null };
  }
  const remainingHours = Math.floor((deadline.getTime() - new Date(now).getTime()) / 3600000);
  return {
    status: remainingHours < 0 ? "EXPIRÉ / NO-GO" : "OUVERT",
    expired: remainingHours < 0,
    officialDeadline: deadline.toISOString(),
    internalDeadline: new Date(deadline.getTime() - 24 * 3600000).toISOString(),
    remainingHours
  };
}

function extractDocumentLinks(html, sourceUrl) {
  const links = [];
  const pattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    let resolved;
    try { resolved = new URL(match[1], sourceUrl).href; } catch { continue; }
    if (!DOCUMENT_EXTENSION.test(resolved)) continue;
    try { officialUrl(resolved); } catch { continue; }
    if (!links.includes(resolved)) links.push(resolved);
    if (links.length >= 8) break;
  }
  return links;
}

async function discoverDocumentUrls(opportunity, options = {}) {
  const raw = opportunity.rawData || {};
  const explicit = [
    ...(Array.isArray(raw.documentUrls) ? raw.documentUrls : []),
    raw.documentUrl
  ].map((item) => typeof item === "string" ? item : item?.url).filter(Boolean);
  const verified = [];
  for (const value of explicit) {
    try {
      const url = officialUrl(value).href;
      if (!verified.includes(url)) verified.push(url);
    } catch { /* An invalid or untrusted source is reported by the intake status. */ }
  }
  if (verified.length || !opportunity.sourceUrl) return verified.slice(0, 8);
  if (DOCUMENT_EXTENSION.test(opportunity.sourceUrl)) {
    try { return [officialUrl(opportunity.sourceUrl).href]; } catch { return []; }
  }
  const fetchPage = options.fetchPage || safeFetch;
  try {
    const page = await fetchPage(opportunity.sourceUrl);
    return extractDocumentLinks(page.text, page.finalUrl || opportunity.sourceUrl);
  } catch {
    return [];
  }
}

function documentFailure(url, error) {
  return {
    url,
    code: String(error?.code || "DOCUMENT_SOURCE_NOT_RETRIEVABLE"),
    reason: String(error?.message || "Document source non récupérable automatiquement").slice(0, 300)
  };
}

async function intakeOpportunity(opportunity, options = {}) {
  const stores = options.stores || { business: businessStore, orchestrator: orchestratorStore };
  const actorEmail = options.actorEmail || SYSTEM_ACTOR;
  const now = options.now || new Date();
  const reference = normalizeReference(opportunity.external_id || opportunity.externalId || opportunity.raw_data?.reference || opportunity.rawData?.reference);
  const deadline = deadlineIntake(opportunity.deadline_at || opportunity.deadlineAt, now);
  const normalized = {
    ...opportunity,
    id: opportunity.id,
    externalId: opportunity.externalId || opportunity.external_id || reference,
    rawData: opportunity.rawData || opportunity.raw_data || {},
    deadlineAt: opportunity.deadlineAt || opportunity.deadline_at || null,
    sourceUrl: opportunity.sourceUrl || opportunity.source_url || null,
    estimatedValue: opportunity.estimatedValue ?? opportunity.estimated_value ?? null,
    opportunityType: opportunity.opportunityType || opportunity.opportunity_type || null,
    aiSummary: opportunity.aiSummary || opportunity.ai_summary || null,
    aiAnalysis: opportunity.aiAnalysis || opportunity.ai_analysis || {},
    analysisMode: opportunity.analysisMode || opportunity.analysis_mode || "no_ai"
  };
  const documentUrls = await discoverDocumentUrls(normalized, options);
  const intake = {
    ...deadline,
    reference,
    country: normalized.country || null,
    city: String(normalized.rawData.city || "").trim() || null,
    priority: String(normalized.rawData.priority || (normalized.country === "RDC" ? "RDC" : "STANDARD")),
    workflowStatus: deadline.expired ? "NON LANCÉ" : "EN ATTENTE DE VALIDATION DG",
    documentRetrievalStatus: documentUrls.length ? "À RÉCUPÉRER" : "DOCUMENT SOURCE NON RÉCUPÉRABLE AUTOMATIQUEMENT",
    documentAction: documentUrls.length ? null : "DOCUMENT SOURCE À OBTENIR",
    documentFailureReason: documentUrls.length ? null : "Aucun document public fiable n'a été trouvé sur la source fournie.",
    externalActionPerformed: false
  };
  await stores.business.updateOpportunityIntake(normalized.id, intake, documentUrls);
  if (deadline.expired) return { opportunity: normalized, intake, workflow: null, documents: [], failures: [] };

  normalized.rawData = { ...normalized.rawData, reference, documentUrls, intake };
  const workflow = await stores.orchestrator.createWorkflow(normalized, actorEmail);
  const existing = await stores.orchestrator.listWorkflowDocuments(workflow.id);
  const documents = [...existing];
  const knownSources = new Set(existing.map((item) => item.sourceUrl));
  const failures = [];
  const retrieve = options.retrieveDocument || retrieveOfficialDocument;
  for (const url of documentUrls) {
    if (knownSources.has(url)) continue;
    try {
      documents.push(await stores.orchestrator.saveWorkflowDocument(workflow, await retrieve(url)));
    } catch (error) {
      failures.push(documentFailure(url, error));
    }
  }
  const retrievalStatus = documents.length
    ? failures.length ? "PARTIELLEMENT RÉCUPÉRÉ" : "RÉCUPÉRÉ"
    : "DOCUMENT SOURCE NON RÉCUPÉRABLE AUTOMATIQUEMENT";
  intake.documentRetrievalStatus = retrievalStatus;
  intake.documentAction = documents.length ? null : "DOCUMENT SOURCE À OBTENIR";
  intake.documentFailureReason = documents.length ? null : failures.map((item) => item.reason).join(" | ") || "Aucun document public récupérable.";
  await stores.business.updateOpportunityIntake(normalized.id, intake, documentUrls);
  const dossier = {
    ...(workflow.dossier || {}),
    opportunity: normalized,
    intake,
    tenderSource: {
      ...(workflow.dossier?.tenderSource || {}),
      sourceUrl: normalized.sourceUrl,
      retrievalStatus,
      retrievalFailures: failures,
      documents: documents.map((item) => ({
        id: item.id, filename: item.filename, mimeType: item.mimeType,
        sizeBytes: item.sizeBytes, sourceUrl: item.sourceUrl, retrievedAt: item.retrievedAt
      }))
    }
  };
  const updated = await stores.orchestrator.updateDossier(
    workflow.id, dossier, actorEmail, "automatic-opportunity-intake",
    "Opportunité réelle transmise automatiquement à NEXUS",
    { reference, documentsRetrieved: documents.length, failures, externalAction: false },
    "business-radar"
  );
  return { opportunity: normalized, intake, workflow: updated, documents, failures };
}

module.exports = { DOCUMENT_EXTENSION, SYSTEM_ACTOR, deadlineIntake, discoverDocumentUrls, extractDocumentLinks, intakeOpportunity, normalizeReference };
