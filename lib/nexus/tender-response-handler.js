"use strict";

const validation = require("../business-radar/validation");
const { json, requireAdmin } = require("../business-radar/http");
const { extractTenderDocument, parseUploadRequest } = require("./tender-response-documents");
const { prepareTenderResponse } = require("./tender-response-ai");
const store = require("./tender-response-store");
const { buildExportArchive } = require("./tender-response-export");

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
  if (error.code === "DATABASE_NOT_CONFIGURED" || error.code === "OPENAI_NOT_CONFIGURED") {
    return { status: 503, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "42P01") {
    return {
      status: 503,
      body: {
        ok: false,
        error: "La migration Réponse Appels d'Offres AI est requise.",
        code: "TENDER_RESPONSE_MIGRATION_REQUIRED"
      }
    };
  }
  if (String(error.code || "").startsWith("TENDER_RESPONSE_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: {
      ok: false,
      error: "La préparation du dossier a échoué.",
      code: "TENDER_RESPONSE_ERROR"
    }
  };
}

async function get(res, action, url) {
  if (action === "history") {
    return json(res, 200, {
      ok: true,
      data: await store.listHistory(url.searchParams.get("limit"))
    });
  }
  if (action === "result") {
    const analysis = await store.getAnalysis(validation.uuid(url.searchParams.get("id")));
    return analysis
      ? json(res, 200, { ok: true, data: analysis })
      : json(res, 404, { ok: false, error: "Dossier introuvable", code: "NOT_FOUND" });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  }
  if (action === "export") {
    const analysis = await store.getAnalysis(validation.uuid(url.searchParams.get("id")));
    if (!analysis) {
      return json(res, 404, { ok: false, error: "Dossier introuvable", code: "NOT_FOUND" });
    }
    const archive = buildExportArchive(analysis);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="LILOTOP-Dossier-AO-${analysis.id}.zip"`
    );
    res.setHeader("Cache-Control", "no-store, private");
    return res.end(archive);
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  if (action !== "prepare") {
    return json(res, 404, { ok: false, error: "Action inconnue" });
  }
  const { fields, file } = await parseUploadRequest(req);
  const document = await extractTenderDocument(file);
  const prepared = await prepareTenderResponse(document, fields);
  return json(res, 201, {
    ok: true,
    data: await store.saveAnalysis(prepared, session.email)
  });
}

module.exports = async function tenderResponseHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "history";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Méthode non autorisée" });
  } catch (error) {
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};
