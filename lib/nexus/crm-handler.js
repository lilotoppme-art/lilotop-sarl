"use strict";

const validation = require("../business-radar/validation");
const { json, parseJson, requireAdmin } = require("../business-radar/http");
const store = require("./crm-store");

const ROLE_PERMISSIONS = Object.freeze({
  administrator: ["read", "write", "merge", "archive", "export"],
  executive: ["read", "export"],
  commercial: ["read", "write", "export"],
  purchasing: ["read", "write", "export"],
  "read-only": ["read"]
});

function safeError(error) {
  if (error.code === "VALIDATION_ERROR") return { status: 400, body: { ok: false, error: error.message, code: error.code } };
  if (error.code === "NOT_FOUND") return { status: 404, body: { ok: false, error: error.message, code: error.code } };
  if (error.code === "42P01") return { status: 503, body: { ok: false, error: "La migration CRM est requise.", code: "CRM_MIGRATION_REQUIRED" } };
  if (error.code === "DATABASE_NOT_CONFIGURED") return { status: 503, body: { ok: false, error: error.message, code: error.code } };
  return { status: 500, body: { ok: false, error: "La requête CRM a échoué.", code: "CRM_ERROR" } };
}

function authorize(role, permission) {
  if (!(ROLE_PERMISSIONS[role] || []).includes(permission)) {
    throw Object.assign(new Error("Action non autorisée pour ce rôle."), { code: "FORBIDDEN" });
  }
}

async function get(req, res, action, url, session, role) {
  authorize(role, "read");
  if (action === "dashboard") return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  if (action === "organizations") return json(res, 200, { ok: true, data: await store.listOrganizations(Object.fromEntries(url.searchParams)) });
  if (action === "organization") {
    const data = await store.getOrganization(validation.uuid(url.searchParams.get("id")), session.email);
    if (!data) throw Object.assign(new Error("Organisation introuvable."), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data });
  }
  if (action === "activity") return json(res, 200, { ok: true, data: await store.listActivity(url.searchParams.get("limit")) });
  if (action === "permissions") return json(res, 200, { ok: true, data: { role, permissions: ROLE_PERMISSIONS[role] || [] } });
  return json(res, 404, { ok: false, error: "Action CRM inconnue." });
}

async function post(req, res, action, session, role) {
  authorize(role, action === "merge" ? "merge" : "write");
  const body = await parseJson(req);
  if (action === "sync-existing") return json(res, 200, { ok: true, data: await store.syncExisting(session.email) });
  if (action === "organization") return json(res, 201, { ok: true, data: await store.upsertOrganization(body, session.email) });
  if (action === "person") return json(res, 201, { ok: true, data: await store.addPerson(body, session.email) });
  if (action === "interaction") return json(res, 201, { ok: true, data: await store.addInteraction(body, session.email) });
  if (action === "document") return json(res, 201, { ok: true, data: await store.addDocumentLink(body, session.email) });
  if (action === "merge") return json(res, 200, { ok: true, data: await store.mergeOrganizations(validation.uuid(body.targetId), validation.uuid(body.sourceId), session.email) });
  return json(res, 404, { ok: false, error: "Action CRM inconnue." });
}

async function remove(req, res, action, url, session, role) {
  authorize(role, "archive");
  if (action === "organization") {
    const archived = await store.archiveOrganization(validation.uuid(url.searchParams.get("id")), session.email);
    if (!archived) throw Object.assign(new Error("Organisation introuvable."), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: archived });
  }
  return json(res, 404, { ok: false, error: "Action CRM inconnue." });
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/crm", "http://localhost");
  const action = url.searchParams.get("action") || "dashboard";
  try {
    const role = await store.getRole(session.email);
    if (req.method === "GET") return await get(req, res, action, url, session, role);
    if (req.method === "POST") return await post(req, res, action, session, role);
    if (req.method === "DELETE") return await remove(req, res, action, url, session, role);
    return json(res, 405, { ok: false, error: "Méthode non autorisée." });
  } catch (error) {
    if (error.code === "FORBIDDEN") return json(res, 403, { ok: false, error: error.message, code: error.code });
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};

module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
