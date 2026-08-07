"use strict";

const validation = require("../business-radar/validation");
const { json, requireAdmin } = require("../business-radar/http");
const { parseVaultUpload, prepareVaultFile, sanitizeFilename } = require("./document-vault-files");
const store = require("./document-vault-store");

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

function metadata(fields) {
  const category = text(fields.category, 40, true);
  if (!store.CATEGORIES.includes(category)) {
    throw Object.assign(new Error("Catégorie documentaire invalide."), { code: "VALIDATION_ERROR" });
  }
  const issuedOn = date(fields.issuedOn);
  const expiresOn = date(fields.expiresOn);
  if (issuedOn && expiresOn && expiresOn < issuedOn) {
    throw Object.assign(new Error("La date d'expiration doit suivre la date de délivrance."), { code: "VALIDATION_ERROR" });
  }
  return {
    documentId: fields.documentId ? validation.uuid(fields.documentId) : "",
    title: text(fields.title, 240, true),
    category,
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
  if (action === "preview") {
    const version = await store.getVersion(validation.uuid(url.searchParams.get("version")));
    return version
      ? json(res, 200, { ok: true, data: version })
      : json(res, 404, { ok: false, error: "Version introuvable", code: "NOT_FOUND" });
  }
  if (action === "file") {
    const version = await store.getVersion(validation.uuid(url.searchParams.get("version")), true);
    if (!version) return json(res, 404, { ok: false, error: "Version introuvable", code: "NOT_FOUND" });
    const inline = url.searchParams.get("disposition") === "inline" && version.extension === "pdf";
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
  if (action !== "upload") return json(res, 404, { ok: false, error: "Action inconnue" });
  const upload = await parseVaultUpload(req);
  const saved = await store.saveVersion(metadata(upload.fields), await prepareVaultFile(upload.file), session.email);
  return json(res, 201, { ok: true, data: saved });
}

module.exports = async function documentVaultHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "list";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
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
