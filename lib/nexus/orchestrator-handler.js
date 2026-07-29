"use strict";

const validation = require("../business-radar/validation");
const { json, parseJson, requireAdmin } = require("../business-radar/http");
const store = require("./orchestrator-store");
const { AGENTS, resumeWorkflow } = require("./orchestrator-service");

function safeError(error) {
  if (error.code === "VALIDATION_ERROR") {
    return { status: 400, code: error.code, error: error.message };
  }
  if (error.code === "NOT_FOUND") {
    return { status: 404, code: error.code, error: error.message };
  }
  if (error.code === "42P01") {
    return {
      status: 503,
      code: "ORCHESTRATOR_MIGRATION_REQUIRED",
      error: "La migration Orchestrateur NEXUS AI est requise."
    };
  }
  if (["DATABASE_NOT_CONFIGURED", "OPENAI_NOT_CONFIGURED"].includes(error.code)) {
    return { status: 503, code: error.code, error: error.message };
  }
  if (String(error.code || "").includes("AI_FAILED")) {
    return { status: 502, code: error.code, error: error.message };
  }
  return {
    status: 500,
    code: "ORCHESTRATOR_ERROR",
    error: "L'etape d'orchestration a echoue."
  };
}

async function get(res, action, url) {
  if (action === "bootstrap") {
    const [opportunities, workflows, dashboard, actions] = await Promise.all([
      store.listOpportunities(30),
      store.listWorkflows(30),
      store.dashboardSummary(),
      store.listActions(null, 120)
    ]);
    return json(res, 200, {
      ok: true,
      data: { opportunities, workflows, dashboard, actions, agents: AGENTS }
    });
  }
  if (action === "workflow") {
    const id = validation.uuid(url.searchParams.get("id"), "id");
    const workflow = await store.getWorkflow(id);
    if (!workflow) return json(res, 404, { ok: false, error: "Workflow introuvable", code: "NOT_FOUND" });
    return json(res, 200, {
      ok: true,
      data: { workflow, actions: await store.listActions(id, 300) }
    });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  const body = await parseJson(req);
  if (action === "start") {
    const opportunityId = validation.uuid(body.opportunityId, "opportunityId");
    const opportunity = await store.getOpportunity(opportunityId);
    if (!opportunity) {
      return json(res, 404, {
        ok: false,
        error: "Opportunite reelle introuvable",
        code: "NOT_FOUND"
      });
    }
    return json(res, 201, {
      ok: true,
      data: await store.createWorkflow(opportunity, session.email)
    });
  }
  if (action === "resume") {
    return json(res, 200, {
      ok: true,
      data: await resumeWorkflow(body.id, session.email)
    });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

module.exports = async function orchestratorHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "bootstrap";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Methode non autorisee" });
  } catch (error) {
    console.error("[nexus-orchestrator] request failed", {
      code: error.code || "UNKNOWN",
      message: error.message
    });
    const normalized = safeError(error);
    return json(res, normalized.status, {
      ok: false,
      error: normalized.error,
      code: normalized.code
    });
  }
};
