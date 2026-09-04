const assert = require("assert");
const { Readable } = require("stream");
const { hashPassword, verifyPassword, createSession, verifySession } = require("../lib/business-radar/auth");
const { scoreOpportunity } = require("../lib/business-radar/scoring");
const { opportunityFingerprint } = require("../lib/business-radar/fingerprint");
const { opportunity, source } = require("../lib/business-radar/validation");
const { noAiAnalysis } = require("../lib/business-radar/ai");
const { privateAddress } = require("../lib/business-radar/connectors/http");
const { deadlineIntake, extractDocumentLinks, intakeOpportunity } = require("../lib/nexus/opportunity-intake");

function capture() {
  return { statusCode: 200, headers: {}, body: "", setHeader(key, value) { this.headers[key] = value; }, end(value = "") { this.body = value; } };
}

(async () => {
  const encoded = hashPassword("A-secure-test-password-2026");
  assert(encoded.startsWith("pbkdf2:"));
  assert(verifyPassword("A-secure-test-password-2026", encoded));
  assert(verifyPassword("A-secure-test-password-2026", encoded.replaceAll(":", "$")));
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

  const ecobank = opportunity({
    reference: "ECD/021/RFP/2026",
    title: "ECD/021/RFP/2026 — Maintenance des systèmes de climatisation du siège",
    organization: "Ecobank RDC",
    country: "RDC",
    city: "Kinshasa",
    deadlineAt: "2026-09-15T23:59:59+01:00",
    sourceUrl: "https://www.tala-com.com/appels-offres/ecobank-rdc-s-a-5/",
    sourceType: "html"
  });
  assert.equal(ecobank.externalId, "ECD/021/RFP/2026");
  assert.equal(opportunityFingerprint(ecobank), opportunityFingerprint({ ...ecobank, sourceUrl: "https://www.ecobank.com/another-copy" }));
  const timing = deadlineIntake(ecobank.deadlineAt, new Date("2026-09-04T12:00:00+01:00"));
  assert.equal(timing.status, "OUVERT");
  assert.equal(timing.internalDeadline, "2026-09-14T22:59:59.000Z");
  assert.equal(deadlineIntake("2026-08-01", new Date("2026-09-04")).status, "EXPIRÉ / NO-GO");
  assert.deepEqual(extractDocumentLinks(`
    <a href="/wp-content/uploads/2026/09/ecobank.pdf">RFP</a>
    <a href="/wp-content/uploads/2026/09/ecobank.xlsx">Annexe</a>
    <a href="javascript:alert(1)">Non</a>
  `, ecobank.sourceUrl), [
    "https://www.tala-com.com/wp-content/uploads/2026/09/ecobank.pdf",
    "https://www.tala-com.com/wp-content/uploads/2026/09/ecobank.xlsx"
  ]);

  const state = { workflows: new Map(), documents: [], intake: null, updates: 0 };
  const stores = {
    business: { async updateOpportunityIntake(id, intake, documentUrls) { state.intake = { id, intake, documentUrls }; } },
    orchestrator: {
      async createWorkflow(item) {
        if (!state.workflows.has(item.id)) state.workflows.set(item.id, { id: "wf-ecobank", opportunityId: item.id, dossier: { opportunity: item } });
        return state.workflows.get(item.id);
      },
      async listWorkflowDocuments() { return state.documents; },
      async saveWorkflowDocument(workflow, document) {
        const saved = { ...document, id: `doc-${state.documents.length + 1}`, workflowId: workflow.id, retrievedAt: "2026-09-04T12:00:00.000Z" };
        state.documents.push(saved); return saved;
      },
      async updateDossier(id, dossier) { state.updates += 1; return { id, opportunityId: ecobank.id, dossier }; }
    }
  };
  const intakeResult = await intakeOpportunity({
    ...ecobank, id: "00000000-0000-4000-8000-000000000021",
    rawData: { reference: "ECD/021/RFP/2026", city: "Kinshasa", documentUrls: [
      "https://www.tala-com.com/wp-content/uploads/2026/09/ecobank.pdf",
      "https://www.tala-com.com/wp-content/uploads/2026/09/ecobank.xlsx"
    ] }
  }, {
    stores,
    now: new Date("2026-09-04T12:00:00+01:00"),
    retrieveDocument: async (url) => ({
      sourceUrl: url, finalUrl: url, filename: url.split("/").pop(), mimeType: url.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 100, sha256: url, extractedText: "Ecobank RDC ECD/021/RFP/2026", buffer: Buffer.from("fixture")
    })
  });
  assert.equal(intakeResult.intake.reference, "ECD/021/RFP/2026");
  assert.equal(intakeResult.documents.length, 2);
  assert.equal(intakeResult.workflow.dossier.tenderSource.retrievalStatus, "RÉCUPÉRÉ");
  assert.equal(intakeResult.workflow.dossier.intake.externalActionPerformed, false);
  assert.equal(state.workflows.size, 1);

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
