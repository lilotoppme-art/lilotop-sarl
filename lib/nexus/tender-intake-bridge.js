"use strict";

const businessService = require("../business-radar/service");

function clean(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function referenceFrom(tender = {}) {
  if (tender.reference) return clean(tender.reference, 200);
  const text = `${tender.title || ""} ${tender.evidence || ""} ${tender.sourceUrl || ""}`;
  const match = text.match(/\b(?:EOI|ITB|RFP|RFQ|AO|ECD|UNGM)[\s/-]*[A-Z0-9][A-Z0-9./_-]{3,}\b/i);
  return clean(match?.[0], 200);
}

function deadlineFrom(value) {
  const source = clean(value, 120).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const iso = source.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return `${iso[1]}T23:59:59.999Z`;
  const months = { janvier:0,january:0,fevrier:1,february:1,mars:2,march:2,avril:3,april:3,mai:4,may:4,juin:5,june:5,juillet:6,july:6,aout:7,august:7,septembre:8,september:8,octobre:9,october:9,novembre:10,november:10,decembre:11,december:11 };
  const written = source.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if (!written || months[written[2]] === undefined) return null;
  return new Date(Date.UTC(Number(written[3]), months[written[2]], Number(written[1]), 23, 59, 59, 999)).toISOString();
}

function tenderOpportunity(tender = {}, search = {}) {
  const deadlineAt = deadlineFrom(tender.deadline);
  return {
    reference: referenceFrom(tender),
    title: clean(tender.title, 240),
    organization: clean(tender.organization, 200),
    country: clean(tender.country, 100),
    city: clean(tender.city, 100),
    sector: clean(tender.sector, 120),
    opportunityType: "Appel d'offres",
    description: clean([tender.summary, tender.evidence].filter(Boolean).join("\n"), 8000),
    sourceUrl: clean(tender.sourceUrl, 1200),
    deadlineAt,
    estimatedValue: Number.isFinite(Number(tender.estimatedAmount)) ? Number(tender.estimatedAmount) : null,
    currency: clean(tender.currency, 12),
    tags: ["Veille AO", ...(search.criteria?.sectors || [])].slice(0, 20),
    sourceType: "manual",
    isDemo: false,
    documentUrls: Array.isArray(tender.documentUrls) ? tender.documentUrls : [],
    detectedBy: "tender-ai",
    sourceName: clean(tender.sourceName, 200),
    deadlineLabel: clean(tender.deadline, 120),
    deadlineTimeConfirmed: /\d{1,2}:\d{2}/.test(String(tender.deadline || "")),
    priority: tender.classification || null,
    tenderAiScore: tender.interestScore || 0
  };
}

async function ingestTenderSearch(search, options = {}) {
  const save = options.saveOpportunity || businessService.saveOpportunity;
  const results = [];
  for (const tender of search.tenders || []) {
    try {
      const opportunity = tenderOpportunity(tender, search);
      if (!opportunity.title || !opportunity.sourceUrl) throw new Error("Titre ou source officielle absent");
      const saved = await save(opportunity);
      results.push({ status: "imported", tender: tender.title, opportunityId: saved.id, workflowId: saved.workflowId || null });
    } catch (error) {
      results.push({ status: "rejected", tender: tender.title || "AO sans titre", reason: String(error.message).slice(0, 240) });
    }
  }
  return {
    imported: results.filter((item) => item.status === "imported").length,
    rejected: results.filter((item) => item.status === "rejected").length,
    results,
    externalActions: []
  };
}

module.exports = { deadlineFrom, ingestTenderSearch, referenceFrom, tenderOpportunity };
