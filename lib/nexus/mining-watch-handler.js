"use strict";

const validation = require("../business-radar/validation");
const { json, parseJson, requireAdmin } = require("../business-radar/http");
const miningStore = require("./mining-watch-store");
const { MINING_SOURCES, NEED_TYPES, searchMiningSignals } = require("./mining-watch-ai");

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
        error: "La migration Veille Miniere AI est requise.",
        code: "MINING_WATCH_MIGRATION_REQUIRED"
      }
    };
  }
  if (String(error.code || "").startsWith("MINING_WATCH_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { ok: false, error: "La requete Veille Miniere AI a echoue.", code: "MINING_WATCH_ERROR" }
  };
}

async function get(res, action, url) {
  if (action === "sources") {
    return json(res, 200, { ok: true, data: { sources: MINING_SOURCES, needs: NEED_TYPES } });
  }
  if (action === "history") {
    return json(res, 200, {
      ok: true,
      data: await miningStore.listHistory(url.searchParams.get("limit"))
    });
  }
  if (action === "result") {
    const id = validation.uuid(url.searchParams.get("id"));
    const result = await miningStore.getSearch(id);
    return result
      ? json(res, 200, { ok: true, data: result })
      : json(res, 404, { ok: false, error: "Recherche introuvable", code: "NOT_FOUND" });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await miningStore.dashboardSummary() });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  if (action !== "search") {
    return json(res, 404, { ok: false, error: "Action inconnue" });
  }
  const body = await parseJson(req);
  const result = await searchMiningSignals(body);
  return json(res, 201, {
    ok: true,
    data: await miningStore.saveSearch(result, session.email)
  });
}

module.exports = async function miningWatchHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "history";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Methode non autorisee" });
  } catch (error) {
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};
