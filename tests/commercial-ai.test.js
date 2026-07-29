"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  analyzeCommercialOpportunity,
  classifyScore,
  opportunityPayload
} = require("../lib/nexus/commercial-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(classifyScore(100), "Très prioritaire");
assert.strictEqual(classifyScore(85), "Très prioritaire");
assert.strictEqual(classifyScore(84), "Prioritaire");
assert.strictEqual(classifyScore(70), "Prioritaire");
assert.strictEqual(classifyScore(69), "Moyen");
assert.strictEqual(classifyScore(45), "Moyen");
assert.strictEqual(classifyScore(44), "Faible");
assert.strictEqual(classifyScore(-10), "Faible");

const safePayload = opportunityPayload({
  title: "Fourniture industrielle",
  description: "Description source",
  raw_data: { ignored: true },
  source_url: "https://example.com/opportunity"
});
assert.strictEqual(safePayload.title, "Fourniture industrielle");
assert.strictEqual(safePayload.sourceUrl, "https://example.com/opportunity");
assert.ok(!Object.prototype.hasOwnProperty.call(safePayload, "raw_data"));

(async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          score: 91,
          executiveSummary: "Opportunité stratégique pour LILOTOP.",
          strengths: ["Adéquation sectorielle", "Besoin clairement exprimé"],
          risks: ["Délai à confirmer"],
          recommendedActions: ["Valider les exigences", "Préparer une offre"]
        })
      })
    };
  };
  const analysis = await analyzeCommercialOpportunity(
    {
      title: "Approvisionnement minier RDC",
      organization: "Acheteur de test",
      country: "RDC",
      description: "Fourniture de consommables industriels."
    },
    {
      fetchImpl,
      config: {
        openaiApiKey: "test-api-key",
        openaiModel: "gpt-test"
      }
    }
  );

  assert.strictEqual(request.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(request.options.headers.Authorization, "Bearer test-api-key");
  assert.strictEqual(JSON.parse(request.options.body).text.format.type, "json_schema");
  assert.strictEqual(analysis.score, 91);
  assert.strictEqual(analysis.classification, "Très prioritaire");
  assert.strictEqual(analysis.model, "gpt-test");
  assert.deepStrictEqual(analysis.recommendedActions, ["Valider les exigences", "Préparer une offre"]);

  await assert.rejects(
    () => analyzeCommercialOpportunity({ title: "Test" }, {
      fetchImpl,
      config: { openaiApiKey: "", openaiModel: "gpt-test" }
    }),
    (error) => error.code === "OPENAI_NOT_CONFIGURED"
  );

  const migration = read("db/migrations/003_commercial_ai_agent.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS commercial_ai_analyses"));
  assert.ok(migration.includes("REFERENCES opportunities(id) ON DELETE CASCADE"));
  assert.ok(migration.includes("score BETWEEN 0 AND 100"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));

  const shell = read("admin/commercial-ai-shell.html");
  assert.ok(shell.includes("Historique des analyses"));
  assert.ok(shell.includes("Relancer l'analyse"));

  const client = read("admin/commercial-ai.js");
  assert.ok(client.includes("Analyser avec l'IA"));
  assert.ok(client.includes('/api/commercial-ai?action='));
  assert.ok(client.includes("searchOpportunities"));
  assert.ok(client.includes("loadHistory"));

  const api = read("api/commercial-ai.js");
  assert.ok(api.includes("requireAdmin(req, res)"));
  assert.ok(api.includes('action === "analyze"'));
  assert.ok(api.includes('action === "search"'));

  const vercelConfig = JSON.parse(read("vercel.json"));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/commercial-ai" && destination === "/api/commercial-ai-page"
  ));

  console.log("Commercial AI agent tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
