"use strict";

const radarStore = require("../lib/business-radar/store");
const radarService = require("../lib/business-radar/service");
const validation = require("../lib/business-radar/validation");
const { json, parseJson, requireAdmin } = require("../lib/business-radar/http");
const commercialStore = require("../lib/nexus/commercial-store");
const { analyzeCommercialOpportunity } = require("../lib/nexus/commercial-ai");

function safeCommercialError(error) {
  if (error.code === "VALIDATION_ERROR") {
    return { status: 400, body: { ok: false, error: error.message, code: error.code } };
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
        error: "Commercial AI database migration is required",
        code: "COMMERCIAL_AI_MIGRATION_REQUIRED"
      }
    };
  }
  if (String(error.code || "").startsWith("COMMERCIAL_AI_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { ok: false, error: "Commercial AI request failed", code: "COMMERCIAL_AI_ERROR" }
  };
}

async function get(req, res, action, url) {
  if (action === "candidates") {
    return json(res, 200, { ok: true, data: await commercialStore.listCandidates(url.searchParams.get("limit")) });
  }
  if (action === "history") {
    const opportunityId = validation.uuid(url.searchParams.get("id"));
    return json(res, 200, { ok: true, data: await commercialStore.listHistory(opportunityId) });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await commercialStore.dashboardSummary() });
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

async function post(req, res, action, session) {
  const body = await parseJson(req);
  if (action === "analyze") {
    const opportunityId = validation.uuid(body.opportunityId);
    const opportunity = await radarStore.getOpportunity(opportunityId);
    if (!opportunity) {
      throw Object.assign(new Error("Opportunity not found"), { code: "NOT_FOUND" });
    }
    const analysis = await analyzeCommercialOpportunity(opportunity);
    return json(res, 201, {
      ok: true,
      data: await commercialStore.saveAnalysis(opportunity, analysis, session.email)
    });
  }
  if (action === "search") {
    const run = await radarService.runRadar("manual");
    return json(res, 200, {
      ok: true,
      data: {
        run,
        candidates: await commercialStore.listCandidates(100)
      }
    });
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/commercial-ai", "http://localhost");
  const action = url.searchParams.get("action") || "candidates";
  try {
    if (req.method === "GET") return await get(req, res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const normalized = safeCommercialError(error);
    return json(res, normalized.status, normalized.body);
  }
};
