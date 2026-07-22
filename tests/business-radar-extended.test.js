const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { hashPassword } = require("../lib/business-radar/auth");
const { neutralizeFormula, csvCell, exportRow } = require("../lib/business-radar/export");
const { sanitizeFilename, validateMetadata, MAX_BYTES } = require("../lib/business-radar/attachments");
const { alertReasons } = require("../lib/business-radar/notifications");
const validation = require("../lib/business-radar/validation");
const { analyzeOpportunity } = require("../lib/business-radar/ai");

function capture() {
  return { statusCode: 200, headers: {}, body: "", setHeader(key, value) { this.headers[key] = value; }, end(value = "") { this.body = value; } };
}

function request(method, body = {}, headers = {}) {
  const req = Readable.from([]); req.method = method; req.body = body; req.headers = headers; return req;
}

(async () => {
  assert.equal(neutralizeFormula("=HYPERLINK(\"bad\")"), "'=HYPERLINK(\"bad\")");
  assert.equal(neutralizeFormula(" +SUM(A1:A2)"), "' +SUM(A1:A2)");
  assert.equal(csvCell("Bonjour, Kinshasa"), '"Bonjour, Kinshasa"');
  assert.equal(exportRow({ title: "@external", is_demo: 1 }).title, "'@external");

  assert.equal(sanitizeFilename("../Rapport marché 2026.pdf"), "Rapport-marche-2026.pdf");
  assert.equal(validateMetadata({ name: "offre.pdf", type: "application/pdf", size: 1024 }).sizeBytes, 1024);
  assert.throws(() => validateMetadata({ name: "run.exe", type: "application/x-msdownload", size: 20 }), /not allowed/);
  assert.throws(() => validateMetadata({ name: "large.pdf", type: "application/pdf", size: MAX_BYTES + 1 }), /10 MB/);

  const urgent = { score: 82, deadline_at: new Date(Date.now() + 48 * 3600000).toISOString(), ai_analysis: { supplierRegistrationRequired: true } };
  assert.deepEqual(alertReasons(urgent), ["score >= 80", "echeance < 72 heures", "inscription fournisseur requise"]);
  assert.deepEqual(alertReasons({ score: 20, deadline_at: null, ai_analysis: {} }), []);
  assert.throws(() => validation.note({ opportunityId: "bad", content: "Note" }), /Invalid opportunityId/);

  process.env.ADMIN_EMAIL = "admin@lilotopsarl.com";
  process.env.ADMIN_PASSWORD_HASH = hashPassword("Strong-preview-password-2026");
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
  process.env.APP_URL = "https://preview.example.com";
  delete require.cache[require.resolve("../api/business-radar-auth")];
  const auth = require("../api/business-radar-auth");
  const goodRes = capture(); await auth(request("POST", { email: process.env.ADMIN_EMAIL, password: "Strong-preview-password-2026" }, { "x-forwarded-for": "198.51.100.1" }), goodRes);
  assert.equal(goodRes.statusCode, 200); assert.match(goodRes.headers["Set-Cookie"], /HttpOnly/); assert.match(goodRes.headers["Set-Cookie"], /Secure/);
  const badRes = capture(); await auth(request("POST", { email: process.env.ADMIN_EMAIL, password: "wrong-password" }, { "x-forwarded-for": "198.51.100.2" }), badRes);
  assert.equal(badRes.statusCode, 401); assert(!badRes.body.includes("wrong-password"));
  const logoutRes = capture(); await auth(request("POST", { action: "logout" }), logoutRes);
  assert.equal(logoutRes.statusCode, 200); assert.match(logoutRes.headers["Set-Cookie"], /Max-Age=0/);

  const privateApi = require("../api/business-radar");
  const privateRes = capture(); await privateApi(request("GET"), privateRes);
  assert.equal(privateRes.statusCode, 401);

  process.env.CRON_SECRET = "cron-secret-with-at-least-thirty-two-characters";
  const servicePath = require.resolve("../lib/business-radar/service");
  const originalService = require.cache[servicePath];
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { runRadar: async () => ({ status: "completed", sources_checked: 0 }) } };
  delete require.cache[require.resolve("../api/cron-business-radar")];
  const cron = require("../api/cron-business-radar");
  const cronRes = capture(); await cron(request("GET", {}, { authorization: `Bearer ${process.env.CRON_SECRET}` }), cronRes);
  assert.equal(cronRes.statusCode, 200); assert.match(cronRes.body, /completed/);
  if (originalService) require.cache[servicePath] = originalService; else delete require.cache[servicePath];

  process.env.OPENAI_API_KEY = "test-key-never-sent";
  process.env.OPENAI_MODEL = "test-model";
  const originalFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls += 1; return { ok: false, status: 500 }; };
  await assert.rejects(() => analyzeOpportunity({ title: "Test" }), /OpenAI analysis failed/);
  assert.equal(calls, 2); global.fetch = originalFetch; delete process.env.OPENAI_API_KEY;

  const migrationDirectory = path.join(__dirname, "..", "db", "migrations");
  const migrations = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).map((file) => fs.readFileSync(path.join(migrationDirectory, file), "utf8"));
  assert(migrations.every((sql) => !/DROP\s+(TABLE|DATABASE)|TRUNCATE/i.test(sql)));
  assert(migrations.join("\n").includes("IF NOT EXISTS"));

  console.log("business radar extended tests ok");
})().catch((error) => { console.error(error); process.exit(1); });
