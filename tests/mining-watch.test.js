"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  MINING_SOURCES,
  NEED_TYPES,
  buildRequest,
  classifyScore,
  normalizeCriteria,
  searchMiningSignals
} = require("../lib/nexus/mining-watch-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(MINING_SOURCES.length, 11);
assert.ok(MINING_SOURCES.some(({ id }) => id === "kamoa-copper"));
assert.ok(MINING_SOURCES.some(({ id }) => id === "tenke-fungurume"));
assert.ok(MINING_SOURCES.some(({ id }) => id === "rio-tinto"));
assert.strictEqual(NEED_TYPES.length, 8);
assert.strictEqual(classifyScore(90), "Tres prioritaire");
assert.strictEqual(classifyScore(75), "Prioritaire");
assert.strictEqual(classifyScore(60), "Moyen");
assert.strictEqual(classifyScore(20), "Faible");

const criteria = normalizeCriteria({
  countries: ["RDC", "Haut-Katanga"],
  needs: ["Reactifs", "Equipements"],
  keywords: "extension usine cuivre",
  publishedAfter: "2026-01-01",
  sources: ["kamoa-copper", "tenke-fungurume", "glencore"]
});
assert.strictEqual(criteria.sources.length, 3);
assert.strictEqual(criteria.needs.length, 2);

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
          watchSummary: "Un signal minier documente.",
          globalRisks: ["Calendrier a confirmer"],
          globalRecommendations: ["Contacter les achats"],
          signals: [{
            title: "Extension d'une usine de traitement",
            company: "Societe Miniere Test",
            sourceName: "Communique officiel",
            sourceUrl: "https://example.com/mining-signal",
            country: "RDC",
            location: "Lualaba",
            signalType: "Extension d'usine",
            detectedNeed: "Equipements et reactifs",
            timing: "2026-2027",
            opportunityScore: 91,
            executiveSummary: "Extension confirmee.",
            opportunity: "Qualifier les besoins industriels.",
            risks: ["Aucun appel d'offres publie"],
            recommendedActions: ["Identifier le responsable achats"],
            evidence: "Communique officiel accessible."
          }]
        })
      })
    };
  };

  const result = await searchMiningSignals(criteria, {
    fetchImpl,
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.strictEqual(captured.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(captured.options.headers.Authorization, "Bearer test-api-key");
  assert.deepStrictEqual(JSON.parse(captured.options.body).tools, [{ type: "web_search" }]);
  assert.strictEqual(result.signals[0].classification, "Tres prioritaire");
  assert.strictEqual(result.signals[0].opportunityScore, 91);

  await assert.rejects(
    () => searchMiningSignals(criteria, {
      fetchImpl,
      config: { openaiApiKey: "", openaiModel: "gpt-test" }
    }),
    (error) => error.code === "OPENAI_NOT_CONFIGURED"
  );

  const migration = read("db/migrations/006_mining_watch_ai_agent.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS mining_ai_searches"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));
  assert.ok(!migration.includes("tender_ai_searches"));

  const shell = read("admin/mining-watch-shell.html");
  assert.ok(shell.includes("Lancer la veille minière"));
  assert.ok(shell.includes("Historique des veilles"));
  assert.ok(shell.includes("Architecture ERP-compatible"));

  const client = read("admin/mining-watch.js");
  assert.ok(client.includes('/api/mining-watch?action='));
  assert.ok(client.includes("rerun-mining-search"));
  assert.ok(client.includes("opportunityScore"));

  const api = read("lib/nexus/mining-watch-handler.js");
  assert.ok(api.includes("requireAdmin(req, res)"));
  assert.ok(api.includes('action === "sources"'));
  assert.ok(api.includes('action === "dashboard"'));

  const nexusClient = read("admin/nexus.js");
  assert.ok(nexusClient.includes("loadMiningDashboard"));
  assert.ok(nexusClient.includes('data-metric-key="opportunities"'));

  const vercelConfig = JSON.parse(read("vercel.json"));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/mining-watch" && destination === "/api/nexus-page?handler=mining-page"
  ));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/api/mining-watch" && destination === "/api/nexus-page?handler=mining-api"
  ));

  console.log("Mining Watch AI agent tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
