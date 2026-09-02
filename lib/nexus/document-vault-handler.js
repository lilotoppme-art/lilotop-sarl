"use strict";

const validation = require("../business-radar/validation");
const { json, requireAdmin } = require("../business-radar/http");
const { radarConfig } = require("../business-radar/config");
const {
  analyzePreparedVaultFile, parseVaultUpload, prepareVaultFile,
  proposeExperienceAssociation, sanitizeFilename
} = require("./document-vault-files");
const store = require("./document-vault-store");
const { buildUnopsExperienceAudit } = require("./document-vault-matching");

function text(value, max, required = false) {
  const normalized = String(value || "").trim().slice(0, max);
  if (required && !normalized) {
    throw Object.assign(new Error("Les champs obligatoires doivent être renseignés."), { code: "VALIDATION_ERROR" });
  }
  return normalized;
}

function date(value) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw Object.assign(new Error("Une date fournie est invalide."), { code: "VALIDATION_ERROR" });
  }
  return value;
}

const CATEGORY_TO_LEGACY = Object.freeze({
  "01-legal-identity": "legal",
  "02-compliance": "administrative",
  "03-bank-finance": "financial",
  "04-experience-references": "reference",
  "05-lilotop-organization": "administrative",
  "06-suppliers-partners": "technical",
  "07-other": "other"
});

function metadata(fields, analysis) {
  const categoryCode = text(fields.categoryCode, 40) || analysis.categoryCode;
  if (!store.CATEGORY_CODES.includes(categoryCode)) {
    throw Object.assign(new Error("Catégorie documentaire invalide."), { code: "VALIDATION_ERROR" });
  }
  const category = CATEGORY_TO_LEGACY[categoryCode];
  if (!store.CATEGORIES.includes(category)) {
    throw Object.assign(new Error("Catégorie documentaire invalide."), { code: "VALIDATION_ERROR" });
  }
  const issuedOn = date(fields.issuedOn || analysis.issuedOn);
  const expiresOn = date(fields.expiresOn || analysis.expiresOn);
  if (issuedOn && expiresOn && expiresOn < issuedOn) {
    throw Object.assign(new Error("La date d'expiration doit suivre la date de délivrance."), { code: "VALIDATION_ERROR" });
  }
  return {
    documentId: fields.documentId ? validation.uuid(fields.documentId) : "",
    title: text(fields.title, 240, true),
    category,
    categoryCode,
    documentType: text(fields.documentType, 120) || analysis.documentType,
    reference: text(fields.reference, 240) || analysis.reference,
    issuingAuthority: text(fields.issuingAuthority, 240) || analysis.issuingAuthority,
    source: text(fields.source, 240) || analysis.source,
    lifecycleStatus: store.LIFECYCLE_STATUSES.includes(fields.lifecycleStatus)
      ? fields.lifecycleStatus : "needs_review",
    extractedMetadata: analysis,
    experience: analysis.experience,
    description: text(fields.description, 2000),
    version: text(fields.version, 60),
    issuedOn,
    expiresOn,
    notes: text(fields.notes, 2000),
    organizationName: "LILOTOP SARL",
    usableForTenders: fields.usableForTenders === "true" || fields.usableForTenders === "on"
  };
}

function failure(error) {
  if (["VALIDATION_ERROR", "UNSUPPORTED_DOCUMENT", "DOCUMENT_PARSE_ERROR"].includes(error.code)) {
    return { status: 400, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "UPLOAD_TOO_LARGE") {
    return { status: 413, body: { ok: false, error: error.message, code: error.code } };
  }
  if (["DOCUMENT_ANALYSIS_UNAVAILABLE", "DOCUMENT_ANALYSIS_FAILED"].includes(error.code)) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "NOT_FOUND") {
    return { status: 404, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "23505") {
    return { status: 409, body: { ok: false, error: "Cette version existe déjà pour ce document.", code: "VERSION_ALREADY_EXISTS" } };
  }
  if (error.code === "42P01") {
    return { status: 503, body: { ok: false, error: "La migration du coffre documentaire est requise.", code: "VAULT_MIGRATION_REQUIRED" } };
  }
  return { status: 500, body: { ok: false, error: "L'opération documentaire a échoué.", code: "DOCUMENT_VAULT_ERROR" } };
}

function boolean(value) {
  return value === true || value === "true";
}

function experienceMetadata(input = {}) {
  const result = {
    clientName: text(input.clientName, 240), subject: text(input.subject, 500),
    sector: text(input.sector, 240), productsServices: text(input.productsServices, 1000),
    contractNumber: text(input.contractNumber, 240), contractDate: date(input.contractDate),
    executionPeriod: text(input.executionPeriod, 240), contractValue: text(input.contractValue, 120),
    currency: text(input.currency, 12).toUpperCase(), country: text(input.country, 120),
    executionStatus: text(input.executionStatus, 240), clientContact: text(input.clientContact, 500),
    deliveryProofAvailable: boolean(input.deliveryProofAvailable),
    performanceCertificateAvailable: boolean(input.performanceCertificateAvailable),
    dgValidated: boolean(input.dgValidated)
  };
  if (result.dgValidated && (!result.clientName || !result.subject || !result.contractNumber
    || !result.contractDate || !result.executionStatus)) {
    throw Object.assign(new Error(
      "Client, objet, numéro, date et statut d'exécution sont requis pour valider une expérience."
    ), { code: "VALIDATION_ERROR" });
  }
  return result;
}

function correctedMetadata(input = {}) {
  const categoryCode = text(input.categoryCode, 40);
  if (!store.CATEGORY_CODES.includes(categoryCode)) {
    throw Object.assign(new Error("Catégorie documentaire invalide."), { code: "VALIDATION_ERROR" });
  }
  return {
    categoryCode,
    category: CATEGORY_TO_LEGACY[categoryCode],
    documentType: text(input.documentType, 120, true),
    reference: text(input.reference, 240),
    issuingAuthority: text(input.issuingAuthority, 240),
    issuedOn: date(input.issuedOn),
    description: text(input.description, 2000),
    extractedMetadata: input.extractedMetadata && typeof input.extractedMetadata === "object"
      ? input.extractedMetadata : {},
    experience: experienceMetadata(input.experience || {}),
    associationDocumentId: input.confirmAssociation && input.associationDocumentId
      ? validation.uuid(input.associationDocumentId) : ""
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function get(res, action, url) {
  if (action === "list") {
    return json(res, 200, { ok: true, data: await store.listDocuments({
      search: url.searchParams.get("search") || "",
      category: url.searchParams.get("category") || "",
      status: url.searchParams.get("status") || ""
    }) });
  }
  if (action === "history") {
    return json(res, 200, {
      ok: true,
      data: await store.listHistory(validation.uuid(url.searchParams.get("id")))
    });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  }
  if (action === "inventory") {
    return json(res, 200, { ok: true, data: await store.tenderInventory() });
  }
  if (action === "unops-experience-audit") {
    return json(res, 200, { ok: true, data: buildUnopsExperienceAudit(await store.listDocuments()) });
  }
  if (action === "preview") {
    const version = await store.getVersion(validation.uuid(url.searchParams.get("version")));
    return version
      ? json(res, 200, { ok: true, data: version })
      : json(res, 404, { ok: false, error: "Version introuvable", code: "NOT_FOUND" });
  }
  if (action === "file") {
    const version = await store.getVersion(validation.uuid(url.searchParams.get("version")), true);
    if (!version) return json(res, 404, { ok: false, error: "Version introuvable", code: "NOT_FOUND" });
    const inline = url.searchParams.get("disposition") === "inline"
      && ["pdf", "jpg", "jpeg", "png"].includes(version.extension);
    res.statusCode = 200;
    res.setHeader("Content-Type", version.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(version.fileData.length));
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${sanitizeFilename(version.sourceFilename)}"`
    );
    res.setHeader("Cache-Control", "no-store, private");
    return res.end(version.fileData);
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  if (action === "reanalyze") {
    const payload = await readJson(req);
    const version = await store.getVersion(validation.uuid(payload.versionId), true);
    if (!version) return json(res, 404, { ok: false, error: "Version introuvable", code: "NOT_FOUND" });
    const prepared = {
      sourceFilename: version.sourceFilename, extension: version.extension,
      mimeType: version.mimeType, fileSize: version.fileSize, sha256: version.sha256,
      buffer: version.fileData, previewText: version.previewText
    };
    const config = radarConfig();
    const documents = await store.listDocuments();
    const analysis = await analyzePreparedVaultFile(prepared, {}, {
      openaiApiKey: config.openaiApiKey, openaiModel: config.openaiModel
    });
    analysis.experienceAssociation = proposeExperienceAssociation(
      analysis, documents.filter((item) => item.id !== version.id)
    );
    const current = documents.find((item) => item.id === version.id) || version;
    return json(res, 200, { ok: true, data: { current, proposed: analysis } });
  }
  if (!["analyze", "upload"].includes(action)) {
    return json(res, 404, { ok: false, error: "Action inconnue" });
  }
  const upload = await parseVaultUpload(req);
  const prepared = await prepareVaultFile(upload.file);
  const config = radarConfig();
  const analysis = await analyzePreparedVaultFile(prepared, upload.fields, {
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel
  });
  analysis.experienceAssociation = proposeExperienceAssociation(analysis, await store.listDocuments());
  if (action === "analyze") {
    return json(res, 200, { ok: true, data: analysis });
  }
  const saved = await store.saveVersion(metadata(upload.fields, analysis), prepared, session.email);
  return json(res, 201, { ok: true, data: saved });
}

async function patch(req, res, action, session) {
  const payload = await readJson(req);
  if (action === "correct-metadata") {
    const saved = await store.correctMetadata(
      validation.uuid(payload.documentId), validation.uuid(payload.versionId),
      correctedMetadata(payload.proposed), session.email
    );
    return json(res, 200, { ok: true, data: saved });
  }
  if (action !== "validate-experience") return json(res, 404, { ok: false, error: "Action inconnue" });
  const saved = await store.updateExperience(
    validation.uuid(payload.documentId), experienceMetadata(payload), session.email
  );
  return json(res, 200, { ok: true, data: saved });
}

module.exports = async function documentVaultHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "list";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    if (req.method === "PATCH") return await patch(req, res, action, session);
    return json(res, 405, { ok: false, error: "Méthode non autorisée" });
  } catch (error) {
    console.error("[document-vault] request failed", {
      code: error.code || "UNKNOWN",
      message: error.message
    });
    const normalized = failure(error);
    return json(res, normalized.status, normalized.body);
  }
};
