"use strict";

const assert = require("assert");
const { matchesMonitor, parseUngmNotices } = require("../lib/nexus/itb-monitor");
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
  const credentialHistoryMigration = read("db/migrations/020_nexus_ungm_profile_verification.sql");
  assert.match(credentialHistoryMigration, /ADD COLUMN IF NOT EXISTS details jsonb/);
  assert.match(credentialHistoryMigration, /CREATE TABLE IF NOT EXISTS nexus_organization_credential_history/);
  assert.doesNotMatch(credentialHistoryMigration, /\b(DROP|TRUNCATE)\b|DELETE\s+FROM/i);

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
  assert.match(service, /validate-eoi/);
  assert.match(service, /refreshVaultControl/);
  assert.match(service, /prepareUnopsSupplierCycle/);
  assert.match(service, /recordUnopsSupplierQuotation/);
  assert.match(service, /authorizeUnopsSupplierRfq/);
  assert.match(service, /document\\\(s\\\) restent manquants ou non utilisables/);
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
  assert.match(handler, /action === "prepare-unops-supplier-cycle"/);
  assert.match(handler, /action === "authorize-unops-supplier-rfq"/);
  assert.match(handler, /action === "record-unops-supplier-quotation"/);
  assert.match(handler, /action === "document"/);
  assert.match(handler, /disposition"\) === "inline"/);
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
  const orchestratorStore = read("lib/nexus/orchestrator-store.js");
  const orchestratorCss = read("admin/orchestrator.css");

  assert.match(html, /Lancer Workflow Complet/);
  assert.match(client, /Reprendre Workflow/);
  assert.match(client, /item\.name \|\| item\.title/);
  assert.match(html, /Journal récent/);
  assert.match(orchestratorHandler, /listActions\(null, 40\)/);
  assert.match(orchestratorStore, /source_url = 'https:\/\/www\.ungm\.org\/Public\/Notice\/306489'/);
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
  assert.match(client, /ready-for-express-interest/);
  assert.match(client, /data-record-eoi-submission/);
  assert.match(client, /record-eoi-submission/);
  assert.match(client, /Cotations fournisseurs à autoriser/);
  assert.match(client, /exigences réelles/);
  assert.match(client, /situation du marche/);
  assert.match(client, /organization-chart-preview/);
  assert.match(client, /UNECA - CONDITIONS AVANT SOUMISSION/);
  assert.match(client, /Vendor Response Form - Preview pre-remplie/);
  assert.match(client, /Sept declarations officielles UNGM A-G/);
  assert.match(client, /data-eoi-confirmation/);
  assert.doesNotMatch(client, /OUVRIR UNGM - EXPRESS INTEREST/);
  assert.match(client, /Perimetre commercial confirme/);
  assert.match(client, /PREVISUALISER LE DOSSIER/);
  assert.match(client, /Controle final ligne par ligne/);
  assert.match(client, /Aucun document a joindre a cette etape/);
  assert.match(html, /data-decision="validate-eoi"/);
  assert.match(client, /rfqAuthorizationBlocked/);
  assert.match(client, /COORDONNEES VERIFIEES/);
  assert.match(client, /RFQ FOURNISSEURS/);
  assert.match(client, /REPONSES FOURNISSEURS \/ COTATIONS RECUES/);
  assert.match(client, /COMPARAISON FOURNISSEURS/);
  assert.match(client, /data-prepare-unops-cycle/);
  assert.match(client, /AUTORISER L'ENVOI/);
  assert.match(client, /Texte exact de l'e-mail RFQ/);
  assert.match(client, /data-request-rfq-authorization/);
  assert.match(client, /REVALIDER LES RFQ/);
  assert.match(client, /confirmRfqAuthorization/);
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
  assert.match(dashboard, /UNECA — CONDITIONS AVANT SOUMISSION/);
  assert.match(dashboard, /uneceSubmissionReview\.conditions/);
}

function testUnecaItbMonitoring() {
  const notices = parseUngmNotices(`
    <div role="row" data-noticeid="309999" class="tableRow dataRow notice-table">
      <div class="tableCell resultTitle"><span class="ungm-title ungm-title--small">Invitation to Bid for Africa Hall electrical spare parts</span></div>
      <div class="tableCell deadline" data-description="Deadline"><span>31-Aug-2026 12:00 (GMT 0.00)</span></div>
      <div class="tableCell resultAgency"><span>UNECA</span></div>
      <div class="tableCell"><span><label>Invitation to bid</label></span></div>
      <div class="tableCell resultInfo1" data-description="Reference"><span>ITB-UNECA-AFRICA-HALL</span></div>
    </div>`);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].noticeId, "309999");
  assert.equal(notices[0].reference, "ITB-UNECA-AFRICA-HALL");
  const monitor = { active: true, parentNotice: "306489", matchKeys: ["EOIUNECA24536", "306489", "Africa Hall Building", "Electrical Systems", "LTA"] };
  assert.equal(matchesMonitor(notices[0], monitor), true);
  assert.equal(matchesMonitor({ ...notices[0], noticeId: "306489" }, monitor), false);
  assert.equal(matchesMonitor({ ...notices[0], title: "Office furniture", organization: "UNDP" }, monitor), false);
}

function testDossierDocuments() {
  const {
    applyOrganizationCredential,
    buildFinalValidation,
    buildUnecaEoiSubmission,
    markUnecaEoiSubmitted,
    buildUnecaSubmissionReview,
    buildUnecaEoiCompliance,
    documentMatrixFor,
    documentsFor,
    isUnecaEoi24536,
    organizationChartDraft,
    scopeComplianceToRequirements,
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

  const partialSourcingDocuments = documentsFor({
    analysis: { executiveSummary: "Resume", products: [] },
    sourcing: [{ product: { name: "Outillage" } }],
    rfqs: [{ subject: "RFQ Outillage" }]
  });
  assert.match(
    partialSourcingDocuments.find((item) => item.key === "supplier-report").content,
    /Aucun fournisseur exploitable identifie/
  );
  assert.match(
    partialSourcingDocuments.find((item) => item.key === "rfq-register").content,
    /Fournisseur a confirmer/
  );

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
  const normalizedCredentialCompliance = applyOrganizationCredential({
    ...initialCompliance,
    rows: undefined,
    documentControl: initialCompliance.rows
  }, {
    status: "registered", registrationNumber: "673735", evidencePresent: false
  });
  assert.equal(normalizedCredentialCompliance.documentControl.length, 17);
  assert.equal(normalizedCredentialCompliance.compliancePercent, 35);
  const scopedCompliance = scopeComplianceToRequirements(normalizedCredentialCompliance, [
    "Document 1",
    "Form A: Bid Submission Form"
  ]);
  assert.deepStrictEqual(scopedCompliance.rows.map((row) => row.document), ["Document 1"]);
  assert.equal(scopedCompliance.compliancePercent, 100);
  const generableCompliance = scopeComplianceToRequirements({
    rows: [{ document: "Form A: Bid Submission Form", status: "missing" }]
  }, ["Form A: Bid Submission Form"]);
  assert.equal(generableCompliance.rows[0].status, "generable");
  assert.deepStrictEqual(generableCompliance.generableDocuments, ["Form A: Bid Submission Form"]);
  const credentialRow = documentMatrixFor({ compliance: { documentControl: credentialCompliance.rows } })[14];
  assert.equal(credentialRow.statusLabel, "INFORMATION CONFIRMÉE – PREUVE À AJOUTER");

  assert.equal(isUnecaEoi24536({ opportunity: { reference: "EOIUNECA24536" } }), true);
  assert.equal(isUnecaEoi24536({ opportunity: { title: "Autre appel d'offres" } }), false);
  const verifiedUngmCredential = {
    status: "registered", registrationNumber: "673735", evidencePresent: false,
    details: {
      profileVerifiedByDg: true,
      registeredOrganizations: 29,
      eligibilityDeclaration: { status: "validated", conditionsCount: 7 }
    }
  };
  const uneceCompliance = buildUnecaEoiCompliance(verifiedUngmCredential);
  assert.equal(uneceCompliance.rows.length, 4);
  assert.equal(uneceCompliance.compliancePercent, 100);
  assert.equal(uneceCompliance.documentaryReadinessPercent, 100);
  assert.equal(uneceCompliance.documentSubmissionRequired, false);
  assert.equal(uneceCompliance.missingDocuments.length, 0);
  assert.equal(uneceCompliance.generableDocuments.length, 0);
  const uneceMatrix = documentMatrixFor({ compliance: { documentControl: uneceCompliance.rows } });
  assert.equal(uneceMatrix[2].statusLabel, "INFORMATION CONFIRMÉE – PREUVE À AJOUTER");
  assert.match(uneceMatrix[2].sourcePage, /pages 2 et 3/);
  const chart = organizationChartDraft();
  assert.equal(chart.nodes[0].name, "Joël Kongolo");
  assert.ok(chart.nodes.slice(1).every((node) => node.name === "À COMPLÉTER"));
  const uneceSheet = buildFinalValidation({
    opportunity: { reference: "EOIUNECA24536" },
    analysis: { risks: ["12 document(s) restent manquants ou non utilisables pour cet appel d'offres."] }
  }, {
    compliance: { ...uneceCompliance, documentControl: uneceCompliance.rows },
    risks: ["1 document(s) restent manquants ou non utilisables pour cet appel d'offres."]
  }, []);
  assert.equal(uneceSheet.risks.length, 0);

  const submissionReview = buildUnecaSubmissionReview({
    finalValidation: {
      supplierRfqs: [
        { manufacturer: "ABB", product: "Electrical systems" },
        { manufacturer: "ABB", product: "Lamps and lightbulbs" },
        { manufacturer: "Signify", product: "Lighting fixtures" }
      ]
    }
  }, verifiedUngmCredential, {
    id: "chart-document",
    versionId: "chart-version",
    sourceFilename: "LILOTOP-Organigramme-Brouillon.docx"
  });
  assert.equal(submissionReview.conditions.length, 4);
  assert.equal(submissionReview.progressPercent, 100);
  assert.equal(submissionReview.vendorResponseForm.fields.find(([label]) => label === "UNGM Vendor ID Number")[1], "673735");
  assert.equal(submissionReview.vendorResponseForm.fields.find(([label]) => label === "Address")[1], "Boulevard du 30 Juin, no 144, Immeuble Didi, 3eme niveau, Kinshasa/Gombe");
  assert.equal(submissionReview.vendorResponseForm.fields.find(([label]) => label === "Fax Number")[1], "N/A");
  assert.equal(submissionReview.vendorResponseForm.fields.find(([label]) => label === "RCCM")[1], "CD/KIN/RCCM/16-B-8380");
  assert.equal(submissionReview.vendorResponseForm.fields.find(([label]) => label === "National Identification")[1], "01-9-N04151K");
  assert.equal(submissionReview.eligibility.length, 7);
  assert.ok(submissionReview.eligibility.every((item) => item.status === "CONFORME"));
  assert.ok(submissionReview.eligibility.every((item) => item.response === "OUI - VALIDE PAR LE DG DANS UNGM"));
  assert.match(submissionReview.eligibility[0].requirement, /Security Council Consolidated Sanctions List/);
  assert.match(submissionReview.eligibility[5].requirement, /undue risk to the United Nations/);
  assert.match(submissionReview.eligibility[6].requirement, /litigation with a United Nations entity/);
  assert.equal(submissionReview.ungmComparison.automaticallyAccessible, false);
  assert.equal(submissionReview.commercialScope.families.length, 4);
  assert.equal(submissionReview.commercialScope.rfqs.length, 3);
  assert.equal(submissionReview.organizationChart.status, "BROUILLON CONSERVE DANS LE COFFRE - NON JOINT A UNECA");

  const eoiSubmission = buildUnecaEoiSubmission(submissionReview);
  assert.equal(eoiSubmission.reference, "EOIUNECA24536");
  assert.equal(eoiSubmission.deadline, "14 August 2026, 23:59 (GMT-4)");
  assert.equal(eoiSubmission.requiredDocuments.length, 0);
  assert.equal(eoiSubmission.eligibilityPercent, 100);
  assert.equal(eoiSubmission.submissionPerformed, false);
  assert.equal(eoiSubmission.emailSent, false);

  const submittedDossier = markUnecaEoiSubmitted({
    opportunity: { reference: "EOIUNECA24536" },
    pipelineStatus: "ready-for-express-interest",
    validations: { eoiDgConfirmations: { "ungm-vendor-number": { status: "validated" } } },
    uneceSubmissionReview: submissionReview,
    uneceEoiSubmission: eoiSubmission,
    finalValidation: { uneceSubmissionReview: submissionReview, uneceEoiSubmission: eoiSubmission }
  }, "2026-08-13T12:00:00.000Z", "admin@lilotopsarl.com");
  assert.equal(submittedDossier.pipelineStatus, "eoi-submitted-waiting-itb");
  assert.equal(submittedDossier.eoiLifecycle.status, "EOI SUBMITTED");
  assert.equal(submittedDossier.eoiLifecycle.submissionPerformed, true);
  assert.equal(submittedDossier.eoiLifecycle.emailSent, false);
  assert.equal(submittedDossier.eoiLifecycle.rfqSent, false);
  assert.equal(submittedDossier.itbMonitoring.active, true);
  assert.equal(submittedDossier.itbMonitoring.parentNotice, "306489");
  assert.equal(submittedDossier.validations.eoiDgConfirmations["ungm-vendor-number"].status, "validated");
  assert.equal(eoiSubmission.dgValidationItems.length, 2);
  assert.equal(eoiSubmission.readyItems.length, 4);
  assert.equal(eoiSubmission.expressInterestPayload.length, 5);
  assert.match(eoiSubmission.channel, /Express interest/);
  assert.match(eoiSubmission.letter, /UNGM Vendor Number 673735/);
  assert.doesNotMatch(eoiSubmission.letter, /ISO|CNSS|INPP|ARSP|price quote/i);
  assert.ok(eoiSubmission.control.some((item) => item.label === "Required attachments at EOI stage" && item.status === "CONFORME"));

  const { EOI_DG_CONFIRMATION_KEYS, eoiDgConfirmationSummary } = require("../lib/nexus/orchestrator-service");
  assert.equal(EOI_DG_CONFIRMATION_KEYS.length, 10);
  assert.deepEqual(eoiDgConfirmationSummary({}), {
    required: 10,
    validated: 0,
    problems: 0,
    complete: false,
    status: "VALIDATION DG REQUISE"
  });
  const allConfirmed = Object.fromEntries(EOI_DG_CONFIRMATION_KEYS.map((key) => [key, { status: "validated" }]));
  assert.equal(eoiDgConfirmationSummary(allConfirmed).status, "PRET POUR VALIDATION FINALE DG / EXPRESS INTEREST");
  allConfirmed["eligibility-f"] = { status: "problem" };
  assert.equal(eoiDgConfirmationSummary(allConfirmed).status, "VALIDATION DG REQUISE");

  const AdmZip = require("adm-zip");
  const { buildUnecaEoiArtifacts } = require("../lib/nexus/generated-eoi-package");
  const eoiArtifacts = buildUnecaEoiArtifacts(eoiSubmission);
  assert.equal(eoiArtifacts.pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  const packageZip = new AdmZip(eoiArtifacts.zip);
  assert.ok(packageZip.getEntry("UNECA-EOIUNECA24536-DG-Review.pdf"));
  assert.ok(packageZip.getEntry("01-Vendor-Response-Information.txt"));
  assert.ok(packageZip.getEntry("03-Eligibility-Declarations-A-G.txt"));
  assert.ok(packageZip.getEntry("05-Email-Fallback-Draft.txt"));

  const { organizationChartDraftDocx } = require("../lib/nexus/generated-documents");
  const chartZip = new AdmZip(organizationChartDraftDocx());
  const chartXml = chartZip.readAsText("word/document.xml");
  assert.match(chartXml, /Organigramme LILOTOP SARL/);
  assert.match(chartXml, /A COMPLETER/);
  assert.doesNotMatch(chartXml, /CNSS|INPP|ISO|agrement/i);
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

function testOfficialAttachmentFlow() {
  const service = read("lib/nexus/orchestrator-service.js");
  const handler = read("lib/nexus/orchestrator-handler.js");
  const client = read("admin/orchestrator.js");
  assert.match(service, /async function attachOfficialSources/);
  assert.match(service, /externalAction: false/);
  assert.match(service, /combinedSourceDocument/);
  assert.match(handler, /action === "attach-official-sources"/);
  assert.match(client, /data-official-sources-form/);
  assert.match(client, /Rattacher les documents et relancer l'analyse/);
  assert.match(service, /async function uploadOfficialSource/);
  assert.match(handler, /action === "upload-official-source"/);
  assert.match(client, /data-official-upload-form/);
  const documentReader = read("lib/nexus/tender-response-documents.js");
  assert.match(documentReader, /ExcelJS/);
  assert.match(documentReader, /ext === "\.xlsx"/);
  assert.match(documentReader, /extractSpreadsheetXml/);
}

(async () => {
  testArchitecture();
  testCommercialAnalysisBridge();
  testOfficialAttachmentFlow();
  testInterfaceAndRoutes();
  testUnecaItbMonitoring();
  testDossierDocuments();
  testOfficialTenderSourcePolicy();
  await testOpenAiContract();
  console.log("NEXUS Orchestrator tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
