"use strict";

const validation = require("../lib/business-radar/validation");
const { json, parseJson, requireAdmin } = require("../lib/business-radar/http");
const procurementStore = require("../lib/nexus/procurement-store");
const { searchInternationalSuppliers } = require("../lib/nexus/procurement-ai");
const crmStore = require("../lib/nexus/crm-store");

function safeError(error) {
  if (error.code === "VALIDATION_ERROR") {
    return { status: 400, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "DATABASE_NOT_CONFIGURED" || error.code === "OPENAI_NOT_CONFIGURED") {
    return { status: 503, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "42P01") {
    return {
      status: 503,
      body: {
        ok: false,
        error: "La migration Achats AI est requise.",
        code: "PROCUREMENT_AI_MIGRATION_REQUIRED"
      }
    };
  }
  if (String(error.code || "").startsWith("PROCUREMENT_AI_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { ok: false, error: "La requête Achats AI a échoué.", code: "PROCUREMENT_AI_ERROR" }
  };
}

async function get(res, action, url) {
  if (action === "history") {
    return json(res, 200, {
      ok: true,
      data: await procurementStore.listHistory(url.searchParams.get("limit"))
    });
  }
  if (action === "result") {
    const id = validation.uuid(url.searchParams.get("id"));
    const result = await procurementStore.getSearch(id);
    return result
      ? json(res, 200, { ok: true, data: result })
      : json(res, 404, { ok: false, error: "Recherche introuvable", code: "NOT_FOUND" });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await procurementStore.dashboardSummary() });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  if (action !== "search") {
    return json(res, 404, { ok: false, error: "Action inconnue" });
  }
  const body = await parseJson(req);
  const result = await searchInternationalSuppliers(body);
  const saved = await procurementStore.saveSearch(result, session.email);
  await crmStore.syncSupplierSearch(saved, session.email);
  return json(res, 201, { ok: true, data: saved });
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/procurement-ai", "http://localhost");
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
