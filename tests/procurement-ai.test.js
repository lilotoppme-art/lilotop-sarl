"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildRequest,
  normalizeSearchCriteria,
  searchInternationalSuppliers
} = require("../lib/nexus/procurement-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const criteria = normalizeSearchCriteria({
  product: "Pompes industrielles",
  countries: ["Allemagne", "Afrique du Sud"],
  supplierTypes: ["manufacturer", "distributor"],
  quantity: "12 unités",
  requirements: "Usage minier en RDC"
});
assert.strictEqual(criteria.product, "Pompes industrielles");
assert.deepStrictEqual(criteria.supplierTypes, ["manufacturer", "distributor"]);
assert.throws(
  () => normalizeSearchCriteria({ product: "x" }),
  (error) => error.code === "VALIDATION_ERROR"
);

const request = buildRequest(criteria, { openaiModel: "gpt-test" });
assert.strictEqual(request.model, "gpt-test");
assert.deepStrictEqual(request.tools, [{ type: "web_search" }]);
assert.strictEqual(request.text.format.type, "json_schema");
assert.strictEqual(request.text.format.schema.additionalProperties, false);

(async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          summary: "Deux fournisseurs documentés.",
          advantages: ["Couverture internationale"],
          risks: ["Délai à confirmer"],
          recommendations: ["Demander un devis formel"],
          suppliers: [
            {
              name: "Supplier Test",
              country: "Allemagne",
              supplierType: "manufacturer",
              qualityScore: 88,
              estimatedLeadTime: "À confirmer",
              estimatedPrice: "Sur devis",
              website: "https://example.com",
              sourceUrl: "https://example.com/products",
              evidence: "Catalogue officiel disponible."
            }
          ]
        })
      })
    };
  };

  const result = await searchInternationalSuppliers(criteria, {
    fetchImpl,
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });

  assert.strictEqual(captured.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(captured.options.headers.Authorization, "Bearer test-api-key");
  assert.deepStrictEqual(JSON.parse(captured.options.body).tools, [{ type: "web_search" }]);
  assert.strictEqual(result.model, "gpt-test");
  assert.strictEqual(result.suppliers[0].qualityScore, 88);
  assert.strictEqual(result.suppliers[0].supplierType, "manufacturer");

  await assert.rejects(
    () => searchInternationalSuppliers(criteria, {
      fetchImpl,
      config: { openaiApiKey: "", openaiModel: "gpt-test" }
    }),
    (error) => error.code === "OPENAI_NOT_CONFIGURED"
  );

  const migration = read("db/migrations/004_procurement_ai_agent.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS procurement_ai_searches"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));
  assert.ok(!migration.includes("commercial_ai_analyses"));

  const shell = read("admin/procurement-ai-shell.html");
  assert.ok(shell.includes("Rechercher des fournisseurs"));
  assert.ok(shell.includes("Historique des recherches"));
  assert.ok(shell.includes("Supply Chain · Procurement · Odoo-ready"));

  const client = read("admin/procurement-ai.js");
  assert.ok(client.includes('/api/procurement-ai?action='));
  assert.ok(client.includes("rerun-search"));
  assert.ok(client.includes("supplier.qualityScore"));

  const api = read("api/procurement-ai.js");
  assert.ok(api.includes("requireAdmin(req, res)"));
  assert.ok(api.includes('action !== "search"'));
  assert.ok(api.includes('action === "dashboard"'));

  const nexusClient = read("admin/nexus.js");
  assert.ok(nexusClient.includes("loadProcurementDashboard"));
  assert.ok(nexusClient.includes('data-metric-key="suppliers"'));

  const vercelConfig = JSON.parse(read("vercel.json"));
  assert.ok(vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/procurement-ai" && destination === "/api/procurement-ai-page"
  ));

  console.log("Procurement AI agent tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
