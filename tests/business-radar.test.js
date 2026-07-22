const assert = require("assert");
const { Readable } = require("stream");
const { hashPassword, verifyPassword, createSession, verifySession } = require("../lib/business-radar/auth");
const { scoreOpportunity } = require("../lib/business-radar/scoring");
const { opportunityFingerprint } = require("../lib/business-radar/fingerprint");
const { opportunity, source } = require("../lib/business-radar/validation");
const { noAiAnalysis } = require("../lib/business-radar/ai");
const { privateAddress } = require("../lib/business-radar/connectors/http");

function capture() {
  return { statusCode: 200, headers: {}, body: "", setHeader(key, value) { this.headers[key] = value; }, end(value = "") { this.body = value; } };
}

(async () => {
  const encoded = hashPassword("A-secure-test-password-2026");
  assert(verifyPassword("A-secure-test-password-2026", encoded));
  assert(!verifyPassword("wrong", encoded));

  process.env.ADMIN_EMAIL = "admin@lilotopsarl.com";
  process.env.AUTH_SECRET = "test-secret-with-more-than-thirty-two-characters";
  process.env.APP_URL = "https://preview.example.com";
  const token = createSession("admin@lilotopsarl.com", 1000);
  const req = { headers: { cookie: `lilotop_radar_session=${encodeURIComponent(token)}` } };
  assert.equal(verifySession(req, 2000).email, "admin@lilotopsarl.com");
  assert.equal(verifySession(req, 9 * 60 * 60 * 1000), null);

  const item = opportunity({ title: "Mining supply copper RDC", country: "RDC", sector: "Mining", description: "Industrial procurement and logistics", deadlineAt: "2026-08-01", sourceType: "manual" });
  const scored = scoreOpportunity(item, new Date("2026-07-22"));
  assert(scored.total >= 70);
  assert.equal(opportunityFingerprint(item), opportunityFingerprint({ ...item, title: item.title.toUpperCase() }));
  assert.throws(() => source({ name: "Bad", type: "rss", url: "file:///etc/passwd" }), /HTTP or HTTPS/);
  assert.equal(noAiAnalysis({ ...item, score: scored.total }).mode, "no_ai");
  assert(privateAddress("127.0.0.1"));
  assert(privateAddress("192.168.1.20"));
  assert(privateAddress("100.64.0.1"));
  assert(privateAddress("224.0.0.1"));
  assert(privateAddress("::ffff:127.0.0.1"));
  assert(privateAddress("fe80::1"));
  assert(!privateAddress("8.8.8.8"));

  delete require.cache[require.resolve("../api/cron-business-radar")];
  process.env.CRON_SECRET = "cron-test-secret-with-thirty-two-characters";
  const cron = require("../api/cron-business-radar");
  const cronReq = Readable.from([]); cronReq.method = "GET"; cronReq.headers = { authorization: "Bearer wrong" };
  const cronRes = capture(); await cron(cronReq, cronRes);
  assert.equal(cronRes.statusCode, 401);

  const page = require("../api/business-radar-page");
  const pageRes = capture(); page({ method: "GET", headers: {} }, pageRes);
  assert.equal(pageRes.statusCode, 200);
  assert(!pageRes.body.includes("{{AUTHENTICATED}}"));
  assert(pageRes.body.includes('data-authenticated="false"'));
  assert.equal(pageRes.headers["X-Robots-Tag"], "noindex, nofollow, noarchive");

  delete process.env.OPENAI_API_KEY;
  console.log("business radar tests ok");
})().catch((error) => { console.error(error); process.exit(1); });
