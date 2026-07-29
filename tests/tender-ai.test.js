"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  TENDER_SOURCES,
  buildRequest,
  classifyScore,
  isExpiredTender,
  normalizeCriteria,
  searchTenders
} = require("../lib/nexus/tender-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(TENDER_SOURCES.length, 12);
assert.ok(TENDER_SOURCES.some(({ id }) => id === "world-bank"));
assert.ok(TENDER_SOURCES.some(({ id }) => id === "afdb"));
assert.ok(TENDER_SOURCES.some(({ id }) => id === "arsp-rdc"));
assert.ok(TENDER_SOURCES.some(({ id }) => id === "mining-companies"));
assert.strictEqual(classifyScore(90), "Très prioritaire");
assert.strictEqual(classifyScore(75), "Prioritaire");
assert.strictEqual(classifyScore(60), "Moyen");
assert.strictEqual(classifyScore(20), "Faible");
assert.strictEqual(isExpiredTender({ deadline: "2026-07-27 16:00" }, new Date("2026-07-29T12:00:00Z")), true);
assert.strictEqual(isExpiredTender({ deadline: "2026-08-10" }, new Date("2026-07-29T12:00:00Z")), false);
assert.strictEqual(isExpiredTender({ deadline: "À confirmer" }, new Date("2026-07-29T12:00:00Z")), false);

const criteria = normalizeCriteria({
  countries: ["RDC"],
  sectors: ["Mining Supply", "Infrastructure"],
  minimumAmount: "50000 USD",
  deadlineBefore: "2026-12-31",
  organizations: ["Banque Mondiale"],
  keywords: "fournitures industrielles",
  sources: ["world-bank", "afdb", "arsp-rdc"]
});
assert.strictEqual(criteria.sources.length, 3);
assert.strictEqual(criteria.countries[0], "RDC");

const request = buildRequest(criteria, { openaiModel: "gpt-test" });
assert.strictEqual(request.model, "gpt-test");
assert.deepStrictEqual(request.tools, [{ type: "web_search" }]);
assert.strictEqual(request.text.format.type, "json_schema");

(async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          executiveSummary: "Une opportunité documentée.",
          globalRisks: ["Délai court"],
          globalRecommendations: ["Vérifier l'éligibilité"],
          tenders: [{
            title: "Fourniture d'équipements industriels",
            organization: "Organisation Test",
            sourceName: "Banque Mondiale",
            sourceUrl: "https://example.com/tender",
            country: "RDC",
            sector: "Mining Supply",
            estimatedAmount: "Non publié",
            currency: "",
            deadline: "2026-12-01",
            interestScore: 89,
            winChanceScore: 58,
            summary: "Besoin aligné avec LILOTOP.",
            risks: ["Exigences à confirmer"],
            recommendedActions: ["Télécharger le dossier"],
            evidence: "Avis officiel accessible."
          }]
        })
      })
    };
  };

  const result = await searchTenders(criteria, {
    fetchImpl,
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.strictEqual(captured.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(captured.options.headers.Authorization, "Bearer test-api-key");
  assert.deepStrictEqual(JSON.parse(captured.options.body).tools, [{ type: "web_search" }]);
  assert.strictEqual(result.tenders[0].classification, "Très prioritaire");
  assert.strictEqual(result.tenders[0].winChanceScore, 58);

  await assert.rejects(
    () => searchTenders(criteria, {
      fetchImpl,
      config: { openaiApiKey: "", openaiModel: "gpt-test" }
    }),
    (error) => error.code === "OPENAI_NOT_CONFIGURED"
  );

  const migration = read("db/migrations/005_tender_ai_agent.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS tender_ai_searches"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));
  assert.ok(!migration.includes("procurement_ai_searches"));

  const shell = read("admin/tender-ai-shell.html");
  assert.ok(shell.includes("Rechercher des appels d'offres"));
  assert.ok(shell.includes("Historique des recherches"));
  assert.ok(shell.includes("Architecture ERP-compatible"));

  const client = read("admin/tender-ai.js");
  assert.ok(client.includes('/api/tender-ai?action='));
  assert.ok(client.includes("rerun-tender-search"));
  assert.ok(client.includes("winChanceScore"));

  const api = read("lib/nexus/tender-handler.js");
  assert.ok(api.includes("requireAdmin(req, res)"));
  assert.ok(api.includes('action === "sources"'));
  assert.ok(api.includes('action === "dashboard"'));

  const nexusClient = read("admin/nexus.js");
  assert.ok(nexusClient.includes("loadTenderDashboard"));
  assert.ok(nexusClient.includes('data-metric-key="tenders"'));

  const vercelConfig = JSON.parse(read("vercel.json"));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/tender-ai" && destination === "/api/nexus-page?handler=tender-page"
  ));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/api/tender-ai" && destination === "/api/nexus-page?handler=tender-api"
  ));

  console.log("Tender AI agent tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
