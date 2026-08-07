"use strict";

const validation = require("../business-radar/validation");
const { json, parseJson, requireAdmin } = require("../business-radar/http");
const { extractTenderDocument, parseUploadRequest } = require("./tender-response-documents");
const { prepareTenderResponse } = require("./tender-response-ai");
const store = require("./tender-response-store");
const { buildExportArchive, buildPdfExport } = require("./tender-response-export");
const documentVaultStore = require("./document-vault-store");
const crmStore = require("./crm-store");

const DOCUMENT_KEYS = new Set([
  "submissionLetter", "technicalOffer", "financialOfferTemplate",
  "complianceChecklist", "conformityTable", "executionPlan", "attachmentsList"
]);

function safeError(error) {
  if (["VALIDATION_ERROR", "UNSUPPORTED_DOCUMENT", "DOCUMENT_PARSE_ERROR"].includes(error.code)) {
    return { status: 400, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "UPLOAD_TOO_LARGE") {
    return { status: 413, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "NOT_FOUND") {
    return { status: 404, body: { ok: false, error: error.message, code: error.code } };
  }
  if (["DATABASE_NOT_CONFIGURED", "OPENAI_NOT_CONFIGURED"].includes(error.code)) {
    return { status: 503, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "42P01") {
    return { status: 503, body: { ok: false, error: "La migration Reponse AO AI est requise.", code: "TENDER_RESPONSE_MIGRATION_REQUIRED" } };
  }
  if (String(error.code || "").startsWith("TENDER_RESPONSE_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { ok: false, error: "La preparation du dossier a echoue.", code: "TENDER_RESPONSE_ERROR" } };
}

async function findAnalysis(id) {
  const analysis = await store.getAnalysis(validation.uuid(id));
  if (!analysis) throw Object.assign(new Error("Dossier introuvable."), { code: "NOT_FOUND" });
  return analysis;
}

async function get(res, action, url) {
  if (action === "history") return json(res, 200, { ok: true, data: await store.listHistory(url.searchParams.get("limit")) });
  if (action === "result") return json(res, 200, { ok: true, data: await findAnalysis(url.searchParams.get("id")) });
  if (action === "dashboard") return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  if (action === "export" || action === "export-pdf") {
    const analysis = await findAnalysis(url.searchParams.get("id"));
    const isPdf = action === "export-pdf";
    const exportBuffer = isPdf ? buildPdfExport(analysis) : buildExportArchive(analysis);
    res.statusCode = 200;
    res.setHeader("Content-Type", isPdf ? "application/pdf" : "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="LILOTOP-Dossier-AO-${analysis.id}.${isPdf ? "pdf" : "zip"}"`
    );
    res.setHeader("Cache-Control", "no-store, private");
    return res.end(exportBuffer);
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function prepare(req, res, session) {
  const { fields, file } = await parseUploadRequest(req);
  const document = await extractTenderDocument(file);
  const vaultDocuments = await documentVaultStore.listDocuments();
  const prepared = await prepareTenderResponse(document, fields, { vaultDocuments });
  const saved = await store.saveAnalysis(prepared, session.email);
  await crmStore.syncTenderResponse(saved, session.email);
  return json(res, 201, { ok: true, data: saved });
}

async function revise(req, res, session) {
  const payload = await parseJson(req);
  const base = await findAnalysis(payload.id);
  const documentKey = String(payload.documentKey || "");
  if (!DOCUMENT_KEYS.has(documentKey)) {
    throw Object.assign(new Error("Document de brouillon invalide."), { code: "VALIDATION_ERROR" });
  }
  const current = base.generatedDocuments?.[documentKey];
  const isList = Array.isArray(current);
  const content = isList
    ? String(payload.content || "").split(/\r?\n/).map((item) => item.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean).slice(0, 100)
    : String(payload.content || "").trim().slice(0, 40000);
  if ((!isList && !content) || (isList && !content.length)) {
    throw Object.assign(new Error("Le brouillon modifie ne peut pas etre vide."), { code: "VALIDATION_ERROR" });
  }
  const saved = await store.saveRevision(base, {
    status: "draft",
    generatedDocuments: { [documentKey]: content },
    workflow: {
      comment: String(payload.comment || `Modification de ${documentKey}`).trim().slice(0, 500),
      sendAuthorized: false
    }
  }, session.email);
  return json(res, 201, { ok: true, data: saved });
}

async function decide(req, res, session) {
  const payload = await parseJson(req);
  const base = await findAnalysis(payload.id);
  const decision = String(payload.decision || "");
  if (!["validate", "return", "authorize"].includes(decision)) {
    throw Object.assign(new Error("Decision invalide."), { code: "VALIDATION_ERROR" });
  }
  if (decision === "authorize" && base.status !== "validated") {
    throw Object.assign(new Error("Validez d'abord le dossier final avant d'autoriser l'envoi."), { code: "VALIDATION_ERROR" });
  }
  const saved = await store.saveRevision(base, {
    status: decision === "return" ? "draft" : "validated",
    workflow: {
      comment: String(payload.comment || ({
        validate: "Dossier valide par la Direction Generale",
        return: "Dossier retourne pour correction",
        authorize: "Envoi autorise - aucune expedition automatique"
      })[decision]).trim().slice(0, 500),
      sendAuthorized: decision === "authorize"
    }
  }, session.email);
  return json(res, 201, { ok: true, data: saved });
}

async function post(req, res, action, session) {
  if (action === "prepare") return prepare(req, res, session);
  if (action === "revise") return revise(req, res, session);
  if (action === "decision") return decide(req, res, session);
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

module.exports = async function tenderResponseHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "history";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Methode non autorisee" });
  } catch (error) {
    console.error("[tender-response-ai] request failed", {
      code: error.code || "UNKNOWN", message: error.message, cause: error.cause?.message || null
    });
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};
