const store = require("../lib/business-radar/store");
const service = require("../lib/business-radar/service");
const validation = require("../lib/business-radar/validation");
const { json, parseJson, requireAdmin, safeError } = require("../lib/business-radar/http");

function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

async function get(req, res, action, url) {
  if (action === "overview") return json(res, 200, { ok: true, data: await store.overview() });
  if (action === "opportunities") return json(res, 200, { ok: true, data: await store.listOpportunities(Object.fromEntries(url.searchParams)) });
  if (action === "sources") return json(res, 200, { ok: true, data: await store.listSources() });
  if (action === "registrations") return json(res, 200, { ok: true, data: await store.listRegistrations() });
  if (action === "export") {
    const rows = await store.listOpportunities({ ...Object.fromEntries(url.searchParams), limit: 200 });
    const columns = ["title", "organization", "country", "sector", "opportunity_type", "deadline_at", "score", "status", "source_url"];
    const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\n");
    res.statusCode = 200; res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=business-radar-opportunities.csv"); return res.end(`\uFEFF${csv}`);
  }
  if (action === "export-xlsx") {
    const ExcelJS = require("exceljs");
    const rows = await store.listOpportunities({ ...Object.fromEntries(url.searchParams), limit: 200 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Opportunites");
    sheet.columns = [
      ["Titre","title",42],["Organisation","organization",28],["Pays","country",18],["Secteur","sector",22],["Type","opportunity_type",20],["Echeance","deadline_at",20],["Score","score",10],["Statut","status",15],["Source","source_url",45],
    ].map(([header,key,width]) => ({ header, key, width }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF071421" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    res.statusCode = 200; res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", "attachment; filename=business-radar-opportunities.xlsx"); return res.end(Buffer.from(buffer));
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

async function post(req, res, action) {
  const body = await parseJson(req);
  if (action === "run") return json(res, 200, { ok: true, data: await service.runRadar("manual") });
  if (action === "analyze-url") return json(res, 200, { ok: true, data: await service.analyzeUrl(body.url) });
  if (action === "opportunity") return json(res, 201, { ok: true, data: await service.saveOpportunity(body) });
  if (action === "source") return json(res, 201, { ok: true, data: await store.createSource(validation.source(body)) });
  if (action === "status") return json(res, 200, { ok: true, data: await store.updateOpportunityStatus(body.id, validation.status(body.status)) });
  if (action === "registration") {
    if (!validation.clean(body.companyName, 180)) throw validation.validationError("Company name is required", ["companyName"]);
    return json(res, 201, { ok: true, data: await store.createRegistration({ ...body, companyName: validation.clean(body.companyName, 180) }) });
  }
  return json(res, 404, { ok: false, error: "Unknown action" });
}

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const url = new URL(req.url || "/api/business-radar", "http://localhost");
  const action = url.searchParams.get("action") || "overview";
  try {
    if (req.method === "GET") return await get(req, res, action, url);
    if (req.method === "POST") return await post(req, res, action);
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const normalized = safeError(error);
    if (error.fields) normalized.body.fields = error.fields;
    return json(res, normalized.status, normalized.body);
  }
};
