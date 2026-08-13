"use strict";

const NOTICE_REFERENCE = "ITB/2026/62389";
const SELECTED_LOTS = Object.freeze([
  { number: 1, title: "Power Tools", supplier: "Hilti" },
  { number: 2, title: "Electrical Installation Components and consumables", supplier: "Schneider Electric" },
  { number: 10, title: "General Hardware", supplier: "Bossard Group" }
]);

const SUPPLIER_CONTACTS = Object.freeze({
  Hilti: Object.freeze({
    country: "Liechtenstein / support commercial international",
    website: "https://www.hilti.com/",
    email: "us-sales@hilti.com",
    phone: "+1 800-879-8000",
    recipient: "Hilti Customer Service / Sales",
    source: "https://www.hilti.com/engineering/question/how-can-i-update-the-email-address-that-is-a-user-id/vhfe4b"
  }),
  "Bossard Group": Object.freeze({
    country: "Suisse / réseau international",
    website: "https://www.bossard.com/global-en/about-us/contact/",
    email: "bnasales@bossard.com",
    phone: "+1 319 277 5520",
    recipient: "Bossard North America Sales",
    source: "https://www.bossard.com/global-en/about-us/contact/"
  }),
  "Schneider Electric": Object.freeze({
    country: "Afrique du Sud / couverture Malawi",
    website: "https://www.se.com/mw/en/",
    email: "za-ccc@schneider-electric.com",
    phone: "+27 11 230 5880",
    recipient: "Schneider Electric Customer Care - Malawi",
    source: "https://www.se.com/mw/en/"
  })
});

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lotSection(text, lotNumber) {
  const source = String(text || "");
  const startPattern = new RegExp(`ITB\\/2026\\/62389[^\\n]*Lot ${lotNumber}:`, "i");
  const start = source.search(startPattern);
  if (start < 0) return "";
  const remaining = source.slice(start);
  const next = remaining.slice(1).search(/ITB\/2026\/62389[^\n]*Lot \d+:/i);
  return next < 0 ? remaining : remaining.slice(0, next + 1);
}

function itemStart(line) {
  const match = clean(line).match(/^(\d{1,3})\s+(.+?)\s+(Each|Set|Pair|Pairs|Roll|Meter|Pack|Kit|Kg|Litre|Lot)\s+(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return {
    itemNumber: Number(match[1]),
    product: clean(match[2]),
    unit: match[3],
    quantity: Number(match[4])
  };
}

function parseLot(text, definition) {
  const section = lotSection(text, definition.number);
  const lines = section.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const products = [];
  let current = null;
  for (const line of lines) {
    const next = itemStart(line);
    if (next) {
      if (current) products.push(current);
      current = { ...next, specifications: [] };
      continue;
    }
    if (!current || /^ITB\/2026|^Equipment Description|^\(These are|^Equipment Name|^Picture /i.test(line)) continue;
    current.specifications.push(line);
  }
  if (current) products.push(current);
  return {
    number: definition.number,
    title: definition.title,
    supplier: definition.supplier,
    products: products.map((item) => ({
      ...item,
      reference: `Lot ${definition.number} - Item ${item.itemNumber}`,
      specifications: item.specifications.join("\n"),
      standards: item.specifications.filter((line) => /\b(?:DIN|IEC|ISO|EN|CAT\s+[IVX]+|IP\d{2})\b/i.test(line))
    }))
  };
}

function buildRfq(lot, existing, preparedAt) {
  const contact = SUPPLIER_CONTACTS[lot.supplier];
  const previous = existing || {};
  return {
    id: previous.id || `UNOPS-62389-L${lot.number}-${lot.supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    reference: `${NOTICE_REFERENCE} / Lot ${lot.number}`,
    supplier: lot.supplier,
    lotNumber: lot.number,
    lotTitle: lot.title,
    products: lot.products,
    contact: { ...contact, verified: true },
    preparedAt: previous.preparedAt || preparedAt,
    status: previous.status || "EN ATTENTE D'AUTORISATION DG",
    responseDeadline: previous.responseDeadline || null,
    authorizedAt: previous.authorizedAt || null,
    sentAt: previous.sentAt || null,
    emailSent: false,
    subject: `RFQ LILOTOP SARL - ${NOTICE_REFERENCE} - Lot ${lot.number}: ${lot.title}`,
    destination: "Lilongwe, Malawi",
    delivery: "60 à 90 jours calendaires après signature du contrat",
    incoterm: "DAP Lilongwe, Malawi - Incoterms 2020",
    paymentTerms: "À coter par le fournisseur",
    attachments: ["Schedule of Requirements officiel du lot", "Tableau technique du lot"],
    humanAuthorizationRequired: true
  };
}

function normalizeQuotation(input) {
  if (!input || !input.rfqId || !input.supplier || !input.receivedAt) return null;
  const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    id: clean(input.id || `${input.rfqId}-${input.receivedAt}`),
    rfqId: clean(input.rfqId),
    supplier: clean(input.supplier),
    lotNumber: Number(input.lotNumber) || null,
    receivedAt: input.receivedAt,
    sourceMessageId: clean(input.sourceMessageId) || null,
    currency: clean(input.currency) || null,
    unitPrice: amount(input.unitPrice),
    totalPrice: amount(input.totalPrice),
    transport: amount(input.transport),
    insurance: amount(input.insurance),
    dutiesAndTaxes: amount(input.dutiesAndTaxes),
    localLogistics: amount(input.localLogistics),
    otherDocumentedCosts: amount(input.otherDocumentedCosts),
    incoterm: clean(input.incoterm) || null,
    deliveryLeadTime: clean(input.deliveryLeadTime) || null,
    availability: clean(input.availability) || null,
    warranty: clean(input.warranty) || null,
    paymentTerms: clean(input.paymentTerms) || null,
    validity: clean(input.validity) || null,
    technicalCompliance: clean(input.technicalCompliance) || "À vérifier",
    evidenceDocumentId: clean(input.evidenceDocumentId) || null
  };
}

function calculateComparison(responses) {
  return (responses || []).map(normalizeQuotation).filter(Boolean).map((quote) => {
    const base = quote.totalPrice;
    const documentedCosts = [quote.transport, quote.insurance, quote.dutiesAndTaxes, quote.localLogistics, quote.otherDocumentedCosts];
    const landedCost = base !== null && documentedCosts.every((value) => value !== null)
      ? documentedCosts.reduce((total, value) => total + value, base)
      : null;
    return { ...quote, landedCost, supplierScore: null };
  });
}

function recordSupplierQuotation(cycle, input, now = new Date()) {
  const current = cycle || {};
  const rfq = (current.rfqs || []).find((item) => item.id === clean(input?.rfqId));
  if (!rfq) throw Object.assign(new Error("RFQ fournisseur introuvable"), { code: "VALIDATION_ERROR" });
  if (!clean(input?.sourceMessageId) && !clean(input?.evidenceDocumentId)) {
    throw Object.assign(new Error("Une cotation reelle doit etre rattachee a un message ou document source"), { code: "VALIDATION_ERROR" });
  }
  if (!clean(input?.currency) || !Number.isFinite(Number(input?.totalPrice)) || Number(input.totalPrice) <= 0) {
    throw Object.assign(new Error("La devise et le prix total documente sont obligatoires"), { code: "VALIDATION_ERROR" });
  }
  const quotation = normalizeQuotation({
    ...input,
    id: input.id || `${rfq.id}-${new Date(now).toISOString()}`,
    supplier: rfq.supplier,
    lotNumber: rfq.lotNumber,
    receivedAt: input.receivedAt || new Date(now).toISOString()
  });
  const responses = [
    ...(current.responses || []).filter((item) => item.id !== quotation.id),
    quotation
  ];
  const comparison = calculateComparison(responses);
  const rfqs = (current.rfqs || []).map((item) => item.id === rfq.id
    ? { ...item, status: "COTATION RECUE", respondedAt: quotation.receivedAt }
    : item);
  return {
    ...current,
    rfqs,
    responses,
    comparison,
    counts: {
      ...(current.counts || {}),
      sent: rfqs.filter((item) => item.sentAt).length,
      received: responses.length,
      missing: rfqs.filter((item) => !responses.some((response) => response.rfqId === item.id)).length
    },
    pricing: {
      ...(current.pricing || {}),
      purchaseCost: null,
      landedCost: comparison.length && comparison.every((item) => item.landedCost !== null)
        ? comparison.reduce((total, item) => total + item.landedCost, 0)
        : null,
      marginScenarios: [],
      financialOfferStatus: "INCOMPLETE - DONNEES A VALIDER"
    },
    updatedAt: new Date(now).toISOString()
  };
}

function buildSupplierCycle(scheduleText, previous = {}, now = new Date()) {
  const preparedAt = new Date(now).toISOString();
  const lots = SELECTED_LOTS.map((definition) => parseLot(scheduleText, definition));
  const previousRfqs = new Map((previous.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const rfqs = lots.map((lot) => {
    const id = `UNOPS-62389-L${lot.number}-${lot.supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
    return buildRfq(lot, previousRfqs.get(id), preparedAt);
  });
  const responses = (previous.responses || []).map(normalizeQuotation).filter(Boolean);
  const comparison = calculateComparison(responses);
  return {
    reference: NOTICE_REFERENCE,
    status: "RFQ PREPAREES - VALIDATION DG REQUISE",
    lots,
    rfqs,
    responses,
    comparison,
    counts: {
      lots: lots.length,
      products: lots.reduce((total, lot) => total + lot.products.length, 0),
      prepared: rfqs.length,
      sent: rfqs.filter((rfq) => rfq.sentAt).length,
      received: responses.length,
      missing: rfqs.filter((rfq) => !responses.some((response) => response.rfqId === rfq.id)).length
    },
    pricing: {
      purchaseCost: null,
      landedCost: comparison.length && comparison.every((item) => item.landedCost !== null)
        ? comparison.reduce((total, item) => total + item.landedCost, 0)
        : null,
      marginScenarios: [],
      financialOfferStatus: responses.length ? "INCOMPLETE - DONNEES A VALIDER" : "EN ATTENTE DE COTATIONS FOURNISSEURS"
    },
    technicalOfferStatus: "BROUILLON PREPARE - VALIDATION TECHNIQUE ET FOURNISSEURS REQUISE",
    automaticSending: false,
    automaticSubmission: false,
    updatedAt: preparedAt
  };
}

module.exports = {
  NOTICE_REFERENCE,
  SELECTED_LOTS,
  SUPPLIER_CONTACTS,
  buildSupplierCycle,
  calculateComparison,
  recordSupplierQuotation,
  parseLot
};
