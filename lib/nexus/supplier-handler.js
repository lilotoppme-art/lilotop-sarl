"use strict";

const fs = require("fs");
const path = require("path");
const validation = require("../business-radar/validation");
const { query } = require("../business-radar/db");
const { json, parseJson, requireAdmin } = require("../business-radar/http");
const {
  buildRfqDraft,
  searchSuppliers,
  validateRfqInput
} = require("./supplier-ai");
const store = require("./supplier-store");

function safeError(error) {
  if (error.code === "VALIDATION_ERROR") {
    return { status: 400, body: { ok: false, error: error.message, code: error.code } };
  }
  if (error.code === "42P01") {
    return {
      status: 503,
      body: { ok: false, error: "La migration Fournisseurs AI est requise.", code: "SUPPLIER_AI_MIGRATION_REQUIRED" }
    };
  }
  if (["DATABASE_NOT_CONFIGURED", "OPENAI_NOT_CONFIGURED"].includes(error.code)) {
    return { status: 503, body: { ok: false, error: error.message, code: error.code } };
  }
  if (String(error.code || "").startsWith("SUPPLIER_AI_")) {
    return { status: 502, body: { ok: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { ok: false, error: "La requête Fournisseurs AI a échoué.", code: "SUPPLIER_AI_ERROR" } };
}

function buildMailto(rfq) {
  const recipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rfq.supplier.commercialEmail || "")
    ? rfq.supplier.commercialEmail
    : "";
  return `mailto:${recipient}?subject=${encodeURIComponent(rfq.subject)}&body=${encodeURIComponent(rfq.emailBody)}`;
}

async function get(res, action, url) {
  if (action === "migrate-supplier-ai") {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "db", "migrations", "009_supplier_ai_rfq.sql"),
      "utf8"
    );
    await query(sql);
    return json(res, 200, { ok: true, data: { migrated: true } });
  }
  if (action === "history") {
    return json(res, 200, { ok: true, data: await store.listHistory(url.searchParams.get("limit")) });
  }
  if (action === "dashboard") {
    return json(res, 200, { ok: true, data: await store.dashboardSummary() });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

async function post(req, res, action, session) {
  const body = await parseJson(req);
  if (action === "search") {
    const result = await searchSuppliers(body);
    return json(res, 201, { ok: true, data: await store.saveSearch(result, session.email) });
  }
  if (action === "prepare-rfq") {
    const input = validateRfqInput(body);
    const search = await store.getSearch(input.searchId);
    const supplier = search?.suppliers.find((item) => item.supplierKey === input.supplierKey);
    if (!search || !supplier) {
      return json(res, 404, { ok: false, error: "Fournisseur introuvable", code: "NOT_FOUND" });
    }
    const draft = buildRfqDraft(input, supplier, search.criteria.product);
    return json(res, 201, {
      ok: true,
      data: await store.createRfq(draft, supplier, search.criteria.product, session.email)
    });
  }
  if (["open-rfq", "confirm-sent", "mark-responded"].includes(action)) {
    const id = validation.uuid(body.id);
    const status = action === "open-rfq" ? "opened" : action === "confirm-sent" ? "sent" : "responded";
    const rfq = await store.updateRfqStatus(id, status, session.email);
    if (!rfq) return json(res, 404, { ok: false, error: "RFQ introuvable", code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: { ...rfq, mailto: action === "open-rfq" ? buildMailto(rfq) : null } });
  }
  if (action === "toggle-favorite") {
    const searchId = validation.uuid(body.searchId, "searchId");
    const search = await store.getSearch(searchId);
    const supplier = search?.suppliers.find((item) => item.supplierKey === String(body.supplierKey || ""));
    if (!supplier) return json(res, 404, { ok: false, error: "Fournisseur introuvable", code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: await store.toggleFavorite(supplier, session.email) });
  }
  return json(res, 404, { ok: false, error: "Action inconnue" });
}

module.exports = async function supplierHandler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/nexus-page", "http://localhost");
  const action = url.searchParams.get("action") || "history";
  try {
    if (req.method === "GET") return await get(res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    return json(res, 405, { ok: false, error: "Méthode non autorisée" });
  } catch (error) {
    console.error("[supplier-ai] request failed", {
      code: error.code || "UNKNOWN",
      message: error.message
    });
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};
