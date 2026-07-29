"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  PRIORITY_CATEGORIES,
  buildRequest,
  buildRfqDraft,
  normalizeCriteria,
  searchSuppliers,
  validateRfqInput
} = require("../lib/nexus/supplier-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(Object.keys(PRIORITY_CATEGORIES).length, 15);
assert.strictEqual(PRIORITY_CATEGORIES.quicklime, "Chaux vive");

const criteria = normalizeCriteria({
  category: "grinding-media",
  product: "Billes de broyage forgées 90 mm",
  countries: ["Afrique du Sud", "Chine"],
  requirements: "Livraison vers Kolwezi"
});
assert.strictEqual(criteria.categoryLabel, "Billes de broyage");
assert.deepStrictEqual(criteria.countries, ["Afrique du Sud", "Chine"]);
assert.throws(
  () => normalizeCriteria({ category: "invalid", product: "Pompes" }),
  (error) => error.code === "VALIDATION_ERROR"
);

const request = buildRequest(criteria, { openaiModel: "gpt-test" });
assert.strictEqual(request.model, "gpt-test");
assert.deepStrictEqual(request.tools, [{ type: "web_search" }]);
assert.strictEqual(request.text.format.type, "json_schema");
assert.strictEqual(request.text.format.schema.additionalProperties, false);

const rfqInput = validateRfqInput({
  searchId: "11111111-1111-4111-8111-111111111111",
  supplierKey: "1234567890abcdef12345678",
  description: "Billes de broyage forgées 90 mm",
  quantity: "100 tonnes",
  incoterm: "DAP",
  desiredDelivery: "Sous 45 jours",
  paymentTerms: "À convenir après validation"
});
const draft = buildRfqDraft(rfqInput, {
  name: "Supplier Test",
  commercialEmail: "sales@example.com"
}, criteria.product);
assert.ok(draft.subject.includes("RFQ LILOTOP SARL"));
assert.ok(draft.emailBody.includes("100 tonnes"));
assert.ok(draft.emailBody.includes("DAP"));
assert.ok(draft.emailBody.includes("contact@lilotopsarl.com"));
assert.ok(draft.emailBody.includes("ne constitue pas un engagement d'achat"));
assert.throws(
  () => validateRfqInput({ ...rfqInput, searchId: "11111111-1111-1111-1111-111111111111" }),
  (error) => error.code === "VALIDATION_ERROR"
);

(async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          summary: "Un fournisseur documenté.",
          suppliers: [{
            name: "Supplier Test",
            country: "Afrique du Sud",
            website: "https://example.com",
            commercialEmail: "sales@example.com",
            phone: "+27 11 000 0000",
            products: ["Billes de broyage"],
            certifications: ["ISO 9001"],
            reliabilityScore: 88,
            sourceUrl: "https://example.com/contact",
            evidence: "Site officiel et coordonnées publiées."
          }]
        })
      })
    };
  };

  const result = await searchSuppliers(criteria, {
    fetchImpl,
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.strictEqual(captured.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(captured.options.headers.Authorization, "Bearer test-api-key");
  assert.deepStrictEqual(JSON.parse(captured.options.body).tools, [{ type: "web_search" }]);
  assert.strictEqual(result.suppliers[0].reliabilityScore, 88);
  assert.match(result.suppliers[0].supplierKey, /^[0-9a-f]{24}$/);

  const migration = read("db/migrations/009_supplier_ai_rfq.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS supplier_ai_searches"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS supplier_ai_rfqs"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS supplier_ai_favorites"));
  assert.ok(!/\bDROP\b|\bALTER TABLE\b/i.test(migration));

  const shell = read("admin/supplier-ai-shell.html");
  assert.ok(shell.includes("Rechercher des fournisseurs"));
  assert.ok(shell.includes("Préparer RFQ"));
  assert.ok(shell.includes("Envoyer le RFQ"));
  assert.ok(shell.includes("Historique des RFQ"));

  const client = read("admin/supplier-ai.js");
  assert.ok(client.includes('/api/supplier-ai?action='));
  assert.ok(client.includes("location.href = result.mailto"));
  assert.ok(client.includes('"confirm-sent"'));
  assert.ok(!/resend|sendWebsiteEmail/i.test(client));

  const handler = read("lib/nexus/supplier-handler.js");
  assert.ok(handler.includes("requireAdmin(req, res)"));
  assert.ok(handler.includes('"open-rfq"'));
  assert.ok(handler.includes('"confirm-sent"'));
  assert.ok(handler.includes('"mark-responded"'));
  const store = read("lib/nexus/supplier-store.js");
  assert.ok(store.includes("allowedCurrentStatuses"));
  assert.ok(store.includes("status = ANY($4::text[])"));

  const dashboard = read("admin/nexus.js");
  assert.ok(dashboard.includes("loadSupplierAiDashboard"));
  assert.ok(dashboard.includes('"supplier-ai-rfq-sent"'));

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/supplier-ai" && destination === "/api/nexus-page?handler=supplier-page"
  ));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/api/supplier-ai" && destination === "/api/nexus-page?handler=supplier-api"
  ));

  console.log("Supplier AI RFQ tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
