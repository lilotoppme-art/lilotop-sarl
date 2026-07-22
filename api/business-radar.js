const store = require("../lib/business-radar/store");
const service = require("../lib/business-radar/service");
const validation = require("../lib/business-radar/validation");
const { json, parseJson, requireAdmin, safeError } = require("../lib/business-radar/http");
const attachments = require("../lib/business-radar/attachments");
const { csvCell, exportRow } = require("../lib/business-radar/export");

async function get(req, res, action, url) {
  if (action === "overview") return json(res, 200, { ok: true, data: await store.overview() });
  if (action === "opportunities") return json(res, 200, { ok: true, data: await store.listOpportunities(Object.fromEntries(url.searchParams)) });
  if (action === "sources") return json(res, 200, { ok: true, data: await store.listSources() });
  if (action === "registrations") return json(res, 200, { ok: true, data: await store.listRegistrations() });
  if (action === "opportunity-detail") {
    const id = validation.uuid(url.searchParams.get("id"));
    const opportunity = await store.getOpportunity(id);
    if (!opportunity) throw Object.assign(new Error("Opportunity not found"), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: { opportunity, notes: await store.listNotes(id), attachments: { configured: false, items: [] } } });
  }
  if (action === "attachments") return json(res, 200, { ok: true, data: { configured: false, maxBytes: attachments.MAX_BYTES, allowedTypes: [...attachments.ALLOWED_MIME_TYPES], items: [] } });
  if (action === "export") {
    const rows = await store.listOpportunities({ ...Object.fromEntries(url.searchParams), limit: 200 });
    const columns = ["title", "organization", "country", "sector", "opportunity_type", "deadline_at", "estimated_value", "currency", "score", "status", "source_url", "is_favorite", "is_demo"];
    const csv = [columns.join(","), ...rows.map((row) => { const safe = exportRow(row); return columns.map((key) => csvCell(safe[key])).join(","); })].join("\n");
    res.statusCode = 200; res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=business-radar-opportunities.csv"); return res.end(`\uFEFF${csv}`);
  }
  if (action === "export-xlsx") {
    const ExcelJS = require("exceljs");
    const rows = await store.listOpportunities({ ...Object.fromEntries(url.searchParams), limit: 200 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Opportunites");
    sheet.columns = [
      ["Titre","title",42],["Organisation","organization",28],["Pays","country",18],["Secteur","sector",22],["Type","opportunity_type",20],["Echeance","deadline_at",20],["Valeur","estimated_value",16],["Devise","currency",10],["Score","score",10],["Statut","status",15],["Source","source_url",45],["Favori","is_favorite",10],["DEMO","is_demo",10],
    ].map(([header,key,width]) => ({ header, key, width }));
    rows.forEach((row) => sheet.addRow(exportRow(row)));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF071421" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    res.statusCode = 200; res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", "attachment; filename=business-radar-opportunities.xlsx"); return res.end(Buffer.from(buffer));
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

async function post(req, res, action, session) {
  const body = await parseJson(req);
  if (action === "run") return json(res, 200, { ok: true, data: await service.runRadar("manual") });
  if (action === "analyze-url") return json(res, 200, { ok: true, data: await service.analyzeUrl(body.url) });
  if (action === "opportunity") return json(res, 201, { ok: true, data: await service.saveOpportunity(body) });
  if (action === "source") return json(res, 201, { ok: true, data: await store.createSource(validation.source(body)) });
  if (action === "status") return json(res, 200, { ok: true, data: await store.updateOpportunityStatus(validation.uuid(body.id), validation.status(body.status)) });
  if (action === "favorite") {
    const updated = await store.setFavorite(validation.uuid(body.id), body.isFavorite === true);
    if (!updated) throw Object.assign(new Error("Opportunity not found"), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: updated });
  }
  if (action === "note") return json(res, 201, { ok: true, data: await store.createNote({ ...validation.note(body), authorEmail: session.email }) });
  if (action === "note-update") {
    const content = validation.clean(body.content, 4000);
    if (!content) throw validation.validationError("Note content is required", ["content"]);
    const updated = await store.updateNote(validation.uuid(body.id), session.email, content);
    if (!updated) throw Object.assign(new Error("Note not found or not editable"), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true, data: updated });
  }
  if (action === "delete-demo") return json(res, 200, { ok: true, data: await store.deleteDemoData() });
  if (action === "attachment") attachments.notConfigured();
  if (action === "registration") {
    if (!validation.clean(body.companyName, 180)) throw validation.validationError("Company name is required", ["companyName"]);
    return json(res, 201, { ok: true, data: await store.createRegistration({ ...body, companyName: validation.clean(body.companyName, 180) }) });
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

async function remove(req, res, action, session, url) {
  if (action === "note") {
    const deleted = await store.deleteNote(validation.uuid(url.searchParams.get("id")), session.email);
    if (!deleted) throw Object.assign(new Error("Note not found or not editable"), { code: "NOT_FOUND" });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url || "/api/business-radar", "http://localhost");
  const action = url.searchParams.get("action") || "overview";
  try {
    if (req.method === "GET") return await get(req, res, action, url);
    if (req.method === "POST") return await post(req, res, action, session);
    if (req.method === "DELETE") return await remove(req, res, action, session, url);
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const normalized = safeError(error);
    if (error.fields) normalized.body.fields = error.fields;
    return json(res, normalized.status, normalized.body);
  }
};
