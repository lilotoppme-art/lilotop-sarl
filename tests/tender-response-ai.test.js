"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { extractTenderDocument } = require("../lib/nexus/tender-response-documents");
const {
  buildDocumentControl,
  prepareTenderResponse,
  responseSchema,
  splitAvailableDocuments
} = require("../lib/nexus/tender-response-ai");
const { buildExportArchive, buildPdfExport } = require("../lib/nexus/tender-response-export");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function makeDocx(text) {
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + "</Types>"
  ));
  zip.addFile("_rels/.rels", Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + "</Relationships>"
  ));
  zip.addFile("word/document.xml", Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  ));
  return zip.toBuffer();
}

const aiOutput = {
  executiveSummary: "Dossier de fourniture industrielle à préparer avant l'échéance.",
  keyInformation: {
    subject: "Fourniture de pompes industrielles",
    client: "Client Test",
    organization: "Direction des achats",
    country: "RDC",
    project: "Extension usine",
    tenderNumber: "DAO-2026-001",
    publicationDate: "2026-08-01",
    deadline: "2026-09-15",
    currency: "USD",
    contractType: "Fournitures",
    budget: "Non publié",
    qualificationCriteria: ["RCCM", "Références similaires"],
    guarantees: ["Garantie de soumission"],
    requiredDocuments: ["Attestation fiscale", "Plan HSE"],
    requestedProducts: ["Pompes industrielles"],
    requestedServices: ["Mise en service"],
    quantities: ["12 unités"],
    technicalStandards: ["ISO 9001"],
    deliveryConditions: ["Livraison à Kolwezi"],
    incoterms: ["DAP Kolwezi"],
    paymentTerms: ["30 jours"],
    evaluationCriteria: ["Conformité technique", "Délai"]
  },
  compliance: {
    availableDocuments: ["RCCM"],
    missingDocuments: ["Attestation fiscale", "Plan HSE"],
    expiredDocuments: [],
    compliancePercent: 33
  },
  risks: ["Délai court"],
  recommendedActions: ["Obtenir l'attestation fiscale"],
  assessment: {
    technicalScore: 82,
    technicalObservation: "Produits et norme identifiés.",
    financialScore: 70,
    financialObservation: "Prix à compléter.",
    experienceScore: 68,
    experienceObservation: "Références à documenter.",
    supplierScore: 55,
    supplierObservation: "Fournisseurs à confirmer.",
    logisticsScore: 76,
    logisticsObservation: "DAP Kolwezi identifié.",
    competitivenessScore: 65,
    competitivenessObservation: "Cotations requises.",
    financialDataValidated: false,
    insufficientReferences: true,
    missingSuppliers: true,
    unavailableProducts: [],
    majorRisks: ["Délai court"],
    criticalContractClauses: ["Garantie de soumission"],
    recommendations: ["Obtenir des cotations fournisseurs."]
  },
  generatedDocuments: {
    submissionLetter: "Brouillon de lettre de soumission.",
    technicalOffer: "Brouillon d'offre technique.",
    financialOfferTemplate: "Prix unitaire: [À compléter avec donnée validée]",
    complianceChecklist: ["RCCM: disponible", "Plan HSE: manquant"],
    conformityTable: ["Pompes industrielles | À confirmer | Revue technique"],
    executionPlan: ["J1: validation interne", "J2: finalisation"],
    attachmentsList: ["RCCM", "Attestation fiscale"]
  }
};

(async () => {
  assert.deepStrictEqual(
    splitAvailableDocuments("RCCM\nAttestation fiscale; Plan HSE"),
    ["RCCM", "Attestation fiscale", "Plan HSE"]
  );
  assert.strictEqual(responseSchema().additionalProperties, false);
  const control = buildDocumentControl(["RCCM", "Attestation fiscale"], [{
    id: "doc-1", versionId: "version-1", title: "RCCM LILOTOP", version: "v2",
    status: "valid", expiresOn: null
  }, {
    id: "doc-2", versionId: "version-2", title: "Attestation fiscale", version: "v1",
    status: "expired", expiresOn: "2026-01-01"
  }], []);
  assert.strictEqual(control.rows.find((row) => row.key === "rccm").status, "available");
  assert.strictEqual(control.rows.find((row) => row.key === "tax").status, "expired");
  assert.ok(control.missingDocuments.includes("IDNAT"));

  const docxBuffer = makeDocx("Appel d'offres pour pompes industrielles en RDC.");
  const docx = await extractTenderDocument({
    filename: "dossier.docx",
    buffer: docxBuffer
  });
  assert.strictEqual(docx.sourceType, "docx");
  assert.ok(docx.text.includes("pompes industrielles"));

  const sourceZip = new AdmZip();
  sourceZip.addFile("cahier-des-charges.txt", Buffer.from(
    "Client Test demande des pompes industrielles. Date limite 15 septembre 2026."
  ));
  sourceZip.addFile("annexe.docx", docxBuffer);
  const archive = await extractTenderDocument({
    filename: "dossier.zip",
    buffer: sourceZip.toBuffer()
  });
  assert.strictEqual(archive.sourceType, "zip");
  assert.strictEqual(archive.files.length, 2);
  assert.ok(archive.text.includes("Client Test"));

  const largeDocx = await extractTenderDocument({
    filename: "dao-volumineux.docx",
    buffer: makeDocx("Clause technique DAO volumineux. ".repeat(5000))
  });
  assert.ok(largeDocx.text.length > 100000);

  const incompleteDocx = await extractTenderDocument({
    filename: "dao-incomplet.docx",
    buffer: makeDocx("DAO incomplet sans date limite ni budget.")
  });
  assert.ok(incompleteDocx.text.includes("sans date limite"));

  await assert.rejects(
    () => extractTenderDocument({ filename: "dao-corrompu.zip", buffer: Buffer.from("not-a-zip") }),
    (error) => error.code === "DOCUMENT_PARSE_ERROR"
  );

  let captured;
  const result = await prepareTenderResponse(docx, {
    availableDocuments: "RCCM"
  }, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(aiOutput) })
      };
    },
    config: { openaiApiKey: "test-api-key", openaiModel: "gpt-test" },
    vaultDocuments: [{
      title: "RCCM",
      category: "legal",
      version: "v1",
      status: "valid",
      expiresOn: null
    }]
  });
  assert.strictEqual(captured.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(captured.options.headers.Authorization, "Bearer test-api-key");
  assert.strictEqual(JSON.parse(captured.options.body).text.format.type, "json_schema");
  assert.strictEqual(result.compliance.compliancePercent, 7);
  assert.deepStrictEqual(result.compliance.expiredDocuments, []);
  assert.strictEqual(result.compliance.documentControl.length, 14);
  assert.strictEqual(result.submissionEnabled, false);
  assert.strictEqual(result.validationRequired, true);
  assert.ok(result.generatedDocuments.financialOfferTemplate.includes("À compléter"));
  assert.strictEqual(result.keyInformation.evaluation.criteria.length, 7);
  assert.strictEqual(result.keyInformation.evaluation.decision.code, "decline");
  assert.ok(result.keyInformation.evaluation.recommendations.length > 2);

  const exported = new AdmZip(buildExportArchive({
    ...result,
    id: "00000000-0000-0000-0000-000000000001"
  }));
  const exportedNames = exported.getEntries().map((entry) => entry.entryName);
  assert.deepStrictEqual(exportedNames, [
    "00-RESUME-EXECUTIF.md",
    "01-LETTRE-DE-SOUMISSION-BROUILLON.md",
    "02-OFFRE-TECHNIQUE-BROUILLON.md",
    "03-OFFRE-FINANCIERE-MODELE.md",
    "04-CHECKLIST-CONFORMITE.md",
    "05-TABLEAU-CONFORMITE.md",
    "06-PLANNING-EXECUTION.md",
    "07-PIECES-JOINTES.md",
    "08-RISQUES-ET-ACTIONS.md"
  ]);
  const pdf = buildPdfExport(result);
  assert.ok(pdf.subarray(0, 8).toString("ascii").startsWith("%PDF-1.4"));
  assert.ok(pdf.includes(Buffer.from("VALIDATION HUMAINE OBLIGATOIRE")));
  const parsedPdf = await extractTenderDocument({ filename: "dao.pdf", buffer: pdf });
  assert.strictEqual(parsedPdf.sourceType, "pdf");
  assert.ok(parsedPdf.text.includes("DOSSIER DE REPONSE AO"));

  const migration = read("db/migrations/008_tender_response_ai.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS tender_response_analyses"));
  assert.ok(!migration.includes("DROP TABLE"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));

  const store = read("lib/nexus/tender-response-store.js");
  assert.ok(store.includes("INSERT INTO radar_runs"));
  assert.ok(store.includes('"tender-response-ai"'));
  assert.ok(store.includes("saveRevision"));

  const shell = read("admin/tender-response-shell.html");
  assert.ok(shell.includes("Préparer le dossier"));
  assert.ok(shell.includes("Télécharger ZIP"));
  assert.ok(shell.includes("Télécharger PDF"));
  assert.ok(shell.includes("Tableau des documents"));
  assert.ok(shell.includes("Autoriser l'envoi"));
  assert.ok(shell.includes("Lancer une simulation"));
  assert.ok(shell.includes("Graphique radar des scores"));
  assert.ok(shell.includes("Validation humaine obligatoire"));
  assert.ok(shell.includes('accept=".pdf,.docx,.zip"'));

  const handler = read("lib/nexus/tender-response-handler.js");
  assert.ok(handler.includes("requireAdmin(req, res)"));
  assert.ok(handler.includes("documentVaultStore.listDocuments"));
  assert.ok(handler.includes('action === "export"'));
  assert.ok(handler.includes('action === "export-pdf"'));
  assert.ok(handler.includes('action === "revise"'));
  assert.ok(handler.includes('action === "decision"'));

  const client = read("admin/tender-response.js");
  assert.ok(client.includes('cache: "no-store"'));
  assert.ok(client.includes("synchronizeHistory"));
  assert.ok(client.includes("renderProgress"));
  assert.ok(client.includes("renderDocumentControl"));
  assert.ok(client.includes("setInterval"));
  assert.ok(client.includes("drawRadar"));
  assert.ok(client.includes("simulatedEvaluation"));

  const nexusClient = read("admin/nexus.js");
  assert.ok(nexusClient.includes("loadTenderResponseDashboard"));
  assert.ok(nexusClient.includes('data-metric-key="tender-responses"'));
  assert.ok(nexusClient.includes("dashboard-tender-decision"));

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/tender-response-ai"
    && destination === "/api/nexus-page?handler=tender-response-page"
  ));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/api/tender-response-ai"
    && destination === "/api/nexus-page?handler=tender-response-api"
  ));

  console.log("Tender Response AI tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
