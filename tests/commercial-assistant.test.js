"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  assertSendingDisabled,
  normalizeInput,
  prepareCommercialWork
} = require("../lib/nexus/commercial-assistant");
const { normalizeTaskInput } = require("../lib/nexus/commercial-assistant-store");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function output(overrides = {}) {
  return {
    classification: "client",
    urgency: "haute",
    summary: "Demande de prix urgente pour des fournitures industrielles.",
    suggestedSubject: "Re: Demande de cotation",
    draftBody: "Bonjour,\n\nNous accusons réception de votre demande.",
    requestedActions: ["Confirmer la disponibilité"],
    requirements: [],
    checklist: [],
    missingItems: ["Quantité définitive"],
    attachmentSuggestions: ["Fiche technique"],
    commercialConditions: [],
    recommendedActions: ["Qualifier le besoin"],
    financialDraftStatus: "Montants à confirmer",
    ...overrides
  };
}

function fakeFetch(result) {
  return async (url, options) => {
    assert.strictEqual(url, "https://api.openai.com/v1/responses");
    assert.strictEqual(options.headers.Authorization, "Bearer test-api-key");
    const request = JSON.parse(options.body);
    assert.strictEqual(request.text.format.type, "json_schema");
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(result) })
    };
  };
}

(async () => {
  assert.throws(
    () => normalizeInput({ type: "email", content: "Message sans consentement" }),
    (error) => error.code === "VALIDATION_ERROR"
  );

  const email = await prepareCommercialWork({
    type: "email",
    title: "Demande client",
    content: "Merci de nous transmettre une cotation.",
    sender: "client@example.com",
    authorizedContent: true,
    language: "fr",
    attachments: ["specifications.pdf"]
  }, {
    fetchImpl: fakeFetch(output()),
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.strictEqual(email.classification, "client");
  assert.strictEqual(email.urgency, "haute");
  assert.ok(email.summary.includes("Demande de prix"));
  assert.ok(email.draftBody.includes("accusons réception"));
  assert.strictEqual(email.validationRequired, true);
  assert.strictEqual(email.sendingEnabled, false);

  const tender = await prepareCommercialWork({
    type: "tender",
    title: "AO fournitures",
    content: "Cahier des charges avec exigences HSE.",
    language: "fr"
  }, {
    fetchImpl: fakeFetch(output({
      classification: "appel_offres",
      requirements: ["Attestation fiscale", "Plan HSE"],
      checklist: ["Vérifier l'éligibilité"],
      draftBody: "Brouillon de lettre de soumission et offre technique."
    })),
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.deepStrictEqual(tender.requirements, ["Attestation fiscale", "Plan HSE"]);
  assert.ok(tender.checklist.includes("Vérifier l'éligibilité"));

  const quote = await prepareCommercialWork({
    type: "quote",
    title: "Devis brouillon",
    content: "Pompes industrielles, quantités à confirmer.",
    validatedCommercialData: false
  }, {
    fetchImpl: fakeFetch(output({ financialDraftStatus: "Prêt" })),
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" }
  });
  assert.strictEqual(quote.financialDraftStatus, "Bloque: donnees financieres non validees");

  assert.throws(
    () => assertSendingDisabled(),
    (error) => error.code === "COMMERCIAL_SEND_DISABLED"
  );

  const task = normalizeTaskInput({
    title: " Relancer le client ",
    description: "Préparer une relance.",
    dueAt: "2026-08-01T09:00:00Z"
  });
  assert.strictEqual(task.title, "Relancer le client");
  assert.strictEqual(task.dueAt, "2026-08-01T09:00:00Z");

  const migration = read("db/migrations/007_commercial_assistant.sql");
  assert.ok(migration.includes("commercial_ai_work_items"));
  assert.ok(migration.includes("commercial_ai_tasks"));
  assert.ok(migration.includes("commercial_ai_activity"));
  assert.ok(migration.includes("validated_by"));
  assert.ok(!migration.includes("DROP TABLE"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));

  const api = read("api/commercial-ai.js");
  assert.ok(api.includes('action === "prepare"'));
  assert.ok(api.includes('action === "validate"'));
  assert.ok(api.includes('action === "task"'));
  assert.ok(api.includes('action === "send"'));
  assert.ok(api.includes("assertSendingDisabled()"));
  assert.ok(api.includes("gmail.readonly"));
  assert.ok(api.includes("gmail.compose"));
  assert.ok(api.includes("sendingEnabled: false"));

  const store = read("lib/nexus/commercial-assistant-store.js");
  assert.ok(store.includes('logActivity("analysis_created"'));
  assert.ok(store.includes('logActivity("validation_recorded"'));
  assert.ok(store.includes('logActivity("task_created"'));
  assert.ok(store.includes("validated_by = $3"));

  const shell = read("admin/commercial-ai-shell.html");
  for (const label of [
    "Boîte de réception",
    "Brouillons",
    "Appels d'offres",
    "Offres commerciales",
    "Devis",
    "Relances",
    "Tâches",
    "Historique",
    "Validations en attente"
  ]) {
    assert.ok(shell.includes(label), `Missing interface label: ${label}`);
  }
  assert.ok(shell.includes("Envoi désactivé"));

  console.log("Commercial operational assistant tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
