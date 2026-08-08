"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

async function testOpenAiContract() {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-orchestrator-key";
  process.env.OPENAI_MODEL = "gpt-test";
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "gpt-test",
        output_text: JSON.stringify({
          lilotopFit: true,
          opportunityScore: 86,
          priority: "tres-prioritaire",
          fitRationale: "Besoin industriel correspondant aux activites LILOTOP.",
          executiveSummary: "Appel d'offres industriel qualifie.",
          country: "RDC",
          deadline: "2026-09-30",
          budget: { amount: 100000, currency: "USD" },
          products: [{ name: "Billes de broyage", quantity: "100 tonnes" }],
          requiredDocuments: ["RCCM"],
          requirements: ["Livraison a Kolwezi"],
          risks: ["Delai court"],
          recommendedActions: ["Confirmer les specifications"]
        })
      })
    };
  };

  delete require.cache[require.resolve("../lib/nexus/orchestrator-ai")];
  const { analyzeWorkflowOpportunity } = require("../lib/nexus/orchestrator-ai");
  const result = await analyzeWorkflowOpportunity({ title: "AO industriel" });
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.options.headers.Authorization, "Bearer test-orchestrator-key");
  const request = JSON.parse(captured.options.body);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.input[0].content, /Mining Supply/);
  assert.match(request.input[0].content, /Infrastructure/);
  assert.equal(result.products[0].quantity, "100 tonnes");
  assert.equal(result.opportunityScore, 86);
  assert.equal(result.model, "gpt-test");

  global.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
}

function testArchitecture() {
  const migration = read("db/migrations/010_nexus_orchestrator.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS nexus_workflows/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS nexus_workflow_actions/);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|ALTER\s+TABLE)\b/i);
  const documentMigration = read("db/migrations/015_nexus_tender_documents.sql");
  assert.match(documentMigration, /CREATE TABLE IF NOT EXISTS nexus_workflow_documents/);
  assert.match(documentMigration, /file_data bytea NOT NULL/);
  assert.doesNotMatch(documentMigration, /\b(DROP|TRUNCATE|ALTER\s+TABLE)\b/i);
  const credentialMigration = read("db/migrations/017_nexus_organization_credentials.sql");
  assert.match(credentialMigration, /CREATE TABLE IF NOT EXISTS nexus_organization_credentials/);
  assert.match(credentialMigration, /registration_number text NOT NULL/);
  assert.doesNotMatch(credentialMigration, /\b(DROP|TRUNCATE)\b|DELETE\s+FROM/i);

  const service = read("lib/nexus/orchestrator-service.js");
  assert.match(service, /analyzeWorkflowOpportunity/);
  assert.match(service, /commercialStore\.saveAnalysis/);
  assert.match(service, /searchSuppliers/);
  assert.match(service, /buildRfqDraft/);
  assert.match(service, /prepareTenderResponse/);
  assert.match(service, /documentVaultStore\.tenderInventory/);
  assert.match(service, /retrieveOfficialDocument/);
  assert.match(service, /EN ATTENTE DE COTATION FOURNISSEUR/);
  assert.match(service, /applyDecision/);
  assert.match(service, /refreshVaultControl/);
  assert.match(service, /supplierRfqs/);
  assert.match(service, /sendEnabled: false/);
  assert.match(service, /submissionEnabled: false/);
  assert.match(service, /MAX_SOURCED_PRODUCTS = 3/);
  assert.match(service, /status: "paused"/);
  assert.match(service, /currentStep: "completed"/);
  assert.doesNotMatch(service, /sendEmail|resend|smtp/i);

  const store = read("lib/nexus/orchestrator-store.js");
  assert.match(store, /is_demo = false/);
  assert.match(store, /nexus_workflow_actions/);
  assert.match(store, /activeWorkflows/);
  assert.match(store, /activeAgents: 7/);
  assert.match(store, /updateDossier/);
  assert.match(store, /saveWorkflowDocument/);
  assert.match(store, /ensureDocumentStorage/);

  const handler = read("lib/nexus/orchestrator-handler.js");
  assert.match(handler, /requireAdmin/);
  assert.match(handler, /action === "start"/);
  assert.match(handler, /action === "resume"/);
  assert.match(handler, /action === "dashboard"/);
  assert.match(handler, /action === "detect"/);
  assert.match(handler, /action === "decision"/);
  assert.match(handler, /action === "refresh-vault"/);
  assert.match(handler, /action === "document"/);
  assert.match(handler, /action === "start-official"/);
  assert.match(handler, /businessStore\.upsertOpportunity/);
  assert.doesNotMatch(handler, /sendOpportunityAlert/);
}

function testInterfaceAndRoutes() {
  const html = read("admin/orchestrator-shell.html");
  const client = read("admin/orchestrator.js");
  const routes = read("vercel.json");
  const page = read("api/nexus-page.js");
  const catalog = read("lib/nexus/catalog.js");
  const dashboard = read("admin/nexus.js");
  const orchestratorHandler = read("lib/nexus/orchestrator-handler.js");
  const orchestratorCss = read("admin/orchestrator.css");

  assert.match(html, /Lancer Workflow Complet/);
  assert.match(client, /Reprendre Workflow/);
  assert.match(client, /item\.name \|\| item\.title/);
  assert.match(html, /Journal récent/);
  assert.match(orchestratorHandler, /listActions\(null, 40\)/);
  assert.match(html, /Workflows actifs/);
  assert.match(html, /Valeur potentielle/);
  assert.match(client, /Aucun envoi automatique n'est autorisé/);
  assert.match(client, /DAO et source officielle/);
  assert.match(client, /EN ATTENTE DE COTATION FOURNISSEUR/);
  assert.match(html, /Valider la participation/);
  assert.match(html, /\{\{LOGIN_HIDDEN\}\}/);
  assert.match(html, /\{\{SHELL_HIDDEN\}\}/);
  assert.match(html, /Valider les prix/);
  assert.match(html, /Autoriser l'envoi/);
  assert.match(html, /AUTORISER L'ENVOI DES RFQ/);
  assert.match(html, /Fiche finale de validation/);
  assert.match(client, /validation-required/);
  assert.match(client, /Cotations fournisseurs à autoriser/);
  assert.match(client, /exigences réelles UNECA/);
  assert.match(client, /organization-chart-preview/);
  assert.match(client, /rfqAuthorizationBlocked/);
  assert.match(client, /COORDONNEES VERIFIEES/);
  assert.match(routes, /\/admin\/nexus\/orchestrator/);
  assert.match(routes, /\/api\/nexus-orchestrator/);
  assert.match(page, /orchestrator-page/);
  assert.match(page, /orchestrator-api/);
  assert.match(page, /replaceAll\("\{\{LOGIN_HIDDEN\}\}"/);
  assert.match(page, /replaceAll\("\{\{SHELL_HIDDEN\}\}"/);
  assert.match(client, /reportClientFailure/);
  assert.match(orchestratorCss, /max-height: 720px/);
  assert.match(orchestratorCss, /contain: content/);
  assert.match(catalog, /nexus-orchestrator/);
  assert.match(dashboard, /loadOrchestratorDashboard/);
  assert.match(dashboard, /loadOrchestratorDashboard[\s\S]*workflowPanel/);
  assert.match(dashboard, /État des dossiers/);
}

function testDossierDocuments() {
  const {
    applyOrganizationCredential,
    buildFinalValidation,
    buildUnecaEoiCompliance,
    documentMatrixFor,
    documentsFor,
    isUnecaEoi24536,
    organizationChartDraft,
    supplierComparisonFor
  } = require("../lib/nexus/orchestrator-service");
  const documents = documentsFor({
    analysis: {
      executiveSummary: "Resume",
      requiredDocuments: ["RCCM"],
      products: [{ name: "Pompe", quantity: "2" }]
    },
    sourcing: [{
      product: { name: "Pompe" },
      suppliers: [{ name: "Supplier", country: "ZA", reliabilityScore: 88 }]
    }],
    rfqs: [{ subject: "RFQ Pompe", product: "Pompe", description: "Pompe industrielle",
      quantity: "2", desiredDelivery: "Avant le 30 septembre", supplier: {
        name: "Supplier", commercialEmail: "sales@example.com", website: "https://example.com"
      } }]
  });
  assert.equal(documents.length, 5);
  assert.ok(documents.some((item) => item.key === "supplier-report"));
  assert.ok(documents.some((item) => item.key === "rfq-register"));

  const dossier = {
    opportunity: { title: "AO Pompes", organization: "Client", score: 70, currency: "USD" },
    analysis: { opportunityScore: 82, priority: "prioritaire", risks: ["Délai court"] },
    rfqs: [{ subject: "RFQ Pompe", product: "Pompe", description: "Pompe industrielle",
      quantity: "2", desiredDelivery: "Avant le 30 septembre", supplier: {
        name: "Supplier", commercialEmail: "sales@example.com", website: "https://example.com"
      } }],
    sourcing: [{ product: { name: "Pompe" }, suppliers: [
      { name: "B", reliabilityScore: 60, certifications: [] },
      { name: "A", reliabilityScore: 90, certifications: ["ISO"] }
    ] }]
  };
  const comparison = supplierComparisonFor(dossier);
  assert.equal(comparison[0].supplier, "A");
  assert.equal(comparison[0].price, null);
  assert.equal(comparison[0].priceStatus, "EN ATTENTE DE COTATION FOURNISSEUR");
  const sheet = buildFinalValidation(dossier, {
    compliance: { compliancePercent: 75, missingDocuments: ["RCCM"], expiredDocuments: [] },
    risks: [],
    generatedDocuments: {
      technicalOffer: "Brouillon",
      financialOfferTemplate: "Prix à valider",
      submissionLetter: "Lettre"
    }
  }, comparison);
  assert.equal(sheet.purchaseCost, null);
  assert.equal(sheet.proposedSalePrice, null);
  assert.equal(sheet.sendEnabled, false);
  assert.equal(sheet.submissionEnabled, false);
  assert.equal(sheet.finalStatus, "DOCUMENTS MANQUANTS");
  assert.equal(sheet.quotationsReceived, 0);
  assert.equal(sheet.quotationsMissing, 2);
  assert.equal(sheet.supplierRfqs.length, 1);
  assert.equal(sheet.supplierRfqs[0].coordinatesVerified, true);
  assert.equal(sheet.rfqSendingAuthorized, false);

  const official = buildFinalValidation({
    opportunity: { title: "UNECA", organization: "UNECA", country: "Ethiopia" },
    analysis: { country: "Ethiopia" },
    rfqs: [{ product: "Electrical systems", description: "Electrical systems", quantity: "A confirmer",
      supplier: { name: "ABB", commercialEmail: "product.support@schneider-electric.com", website: "https://example.com" } }]
  }, { compliance: { documentControl: [] } }, []);
  assert.equal(official.supplierRfqs[0].commercialEmail, "contact.center@za.abb.com");
  assert.equal(official.supplierRfqs[0].coordinatesVerified, true);
  assert.equal(official.supplierRfqs[0].readyToSend, false);

  const initialCompliance = {
    rows: Array.from({ length: 17 }, (_, index) => ({
      key: index === 14 ? "dao-15" : `doc-${index + 1}`,
      document: index === 14 ? "UNGM registration completed under full legal name" : `Document ${index + 1}`,
      status: index < 5 ? "available" : "missing"
    })),
    availableDocuments: Array.from({ length: 5 }, (_, index) => `Document ${index + 1}`),
    expiredDocuments: [],
    missingDocuments: Array.from({ length: 12 }, (_, index) => `Document ${index + 6}`),
    compliancePercent: 29
  };
  const credentialCompliance = applyOrganizationCredential(initialCompliance, {
    status: "registered", registrationNumber: "673735", evidencePresent: false
  });
  assert.equal(credentialCompliance.compliancePercent, 35);
  assert.equal(credentialCompliance.availableDocuments.length, 6);
  assert.equal(credentialCompliance.missingDocuments.length, 11);
  const credentialRow = documentMatrixFor({ compliance: { documentControl: credentialCompliance.rows } })[14];
  assert.equal(credentialRow.statusLabel, "INFORMATION CONFIRMÉE – PREUVE À AJOUTER");

  assert.equal(isUnecaEoi24536({ opportunity: { reference: "EOIUNECA24536" } }), true);
  assert.equal(isUnecaEoi24536({ opportunity: { title: "Autre appel d'offres" } }), false);
  const uneceCompliance = buildUnecaEoiCompliance({
    status: "registered", registrationNumber: "673735", evidencePresent: false
  });
  assert.equal(uneceCompliance.rows.length, 4);
  assert.equal(uneceCompliance.compliancePercent, 25);
  assert.equal(uneceCompliance.documentaryReadinessPercent, 100);
  assert.equal(uneceCompliance.documentSubmissionRequired, false);
  assert.equal(uneceCompliance.missingDocuments.length, 1);
  assert.equal(uneceCompliance.generableDocuments.length, 2);
  const uneceMatrix = documentMatrixFor({ compliance: { documentControl: uneceCompliance.rows } });
  assert.equal(uneceMatrix[2].statusLabel, "GÉNÉRABLE PAR NEXUS");
  assert.match(uneceMatrix[2].sourcePage, /pages 2 et 3/);
  const chart = organizationChartDraft();
  assert.equal(chart.nodes[0].name, "Joël Kongolo");
  assert.ok(chart.nodes.slice(1).every((node) => node.name === "À COMPLÉTER"));
}

function testOfficialTenderSourcePolicy() {
  const { officialDocumentUrls, officialUrl } = require("../lib/nexus/tender-source");
  assert.equal(
    officialUrl("https://www.un.org/Depts/ptd/files/test.pdf").hostname,
    "www.un.org"
  );
  assert.throws(
    () => officialUrl("https://example.com/test.pdf"),
    (error) => error.code === "TENDER_SOURCE_NOT_ALLOWED"
  );
  assert.deepEqual(officialDocumentUrls({
    rawData: {
      documentUrls: [
        "https://www.un.org/a.pdf",
        { url: "https://www.un.org/b.pdf" },
        "https://www.un.org/a.pdf"
      ]
    }
  }), ["https://www.un.org/a.pdf", "https://www.un.org/b.pdf"]);
}

function testCommercialAnalysisBridge() {
  const { commercialAnalysisFor } = require("../lib/nexus/orchestrator-service");
  const result = commercialAnalysisFor({
    opportunityScore: 86,
    fitRationale: "Correspondance sectorielle confirmee.",
    executiveSummary: "Opportunite qualifiee.",
    risks: ["Delai court"],
    recommendedActions: ["Valider la participation"],
    model: "gpt-test"
  });
  assert.equal(result.score, 86);
  assert.equal(result.classification, "Très prioritaire");
  assert.deepEqual(result.strengths, ["Correspondance sectorielle confirmee."]);
  assert.equal(result.model, "gpt-test");
}

(async () => {
  testArchitecture();
  testCommercialAnalysisBridge();
  testInterfaceAndRoutes();
  testDossierDocuments();
  testOfficialTenderSourcePolicy();
  await testOpenAiContract();
  console.log("NEXUS Orchestrator tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
