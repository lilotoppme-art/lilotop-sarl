const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { query } = require("../lib/business-radar/db");
const { json, safeError } = require("../lib/business-radar/http");

function matches(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  if (process.env.VERCEL_ENV === "production") return json(res, 403, { ok: false, error: "Migrations are disabled in Production" });
  const secret = String(process.env.MIGRATION_SECRET || "");
  if (secret.length < 32 || !matches(req.headers?.authorization, `Bearer ${secret}`)) return json(res, 401, { ok: false, error: "Invalid migration authorization" });
  try {
    const directory = path.join(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(directory).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
    for (const file of files) await query(fs.readFileSync(path.join(directory, file), "utf8"));
    const tables = await query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('sources','opportunities','supplier_registrations','radar_runs','notifications','opportunity_notes','opportunity_attachments') ORDER BY tablename`);
    const indexes = await query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND (tablename='opportunities' OR tablename='opportunity_notes' OR tablename='opportunity_attachments') ORDER BY indexname`);
    return json(res, 200, { ok: true, data: { migrations: files, tables: tables.rows.map((row) => row.tablename), indexes: indexes.rows.map((row) => row.indexname) } });
  } catch (error) {
    const normalized = safeError(error);
    return json(res, normalized.status, normalized.body);
  }
};
