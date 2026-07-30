"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { extractTenderDocument } = require("../lib/nexus/tender-response-documents");
const {
  prepareTenderResponse,
  responseSchema,
  splitAvailableDocuments
} = require("../lib/nexus/tender-response-ai");
const { buildExportArchive } = require("../lib/nexus/tender-response-export");

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
    country: "RDC",
    deadline: "2026-09-15",
    budget: "Non publié",
    qualificationCriteria: ["RCCM", "Références similaires"],
    requiredDocuments: ["Attestation fiscale", "Plan HSE"],
    requestedProducts: ["Pompes industrielles"],
    deliveryConditions: ["Livraison à Kolwezi"],
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
  generatedDocuments: {
    submissionLetter: "Brouillon de lettre de soumission.",
    technicalOffer: "Brouillon d'offre technique.",
    financialOfferTemplate: "Prix unitaire: [À compléter avec donnée validée]",
    complianceChecklist: ["RCCM: disponible", "Plan HSE: manquant"],
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
  assert.strictEqual(result.compliance.compliancePercent, 33);
  assert.deepStrictEqual(result.compliance.expiredDocuments, []);
  assert.strictEqual(result.submissionEnabled, false);
  assert.strictEqual(result.validationRequired, true);
  assert.ok(result.generatedDocuments.financialOfferTemplate.includes("À compléter"));

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
    "05-PLANNING-EXECUTION.md",
    "06-PIECES-JOINTES.md",
    "07-RISQUES-ET-ACTIONS.md"
  ]);

  const migration = read("db/migrations/008_tender_response_ai.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS tender_response_analyses"));
  assert.ok(!migration.includes("DROP TABLE"));
  assert.ok(!migration.includes("ALTER TABLE opportunities"));

  const store = read("lib/nexus/tender-response-store.js");
  assert.ok(store.includes("INSERT INTO radar_runs"));
  assert.ok(store.includes('"tender-response-ai"'));

  const shell = read("admin/tender-response-shell.html");
  assert.ok(shell.includes("Préparer le dossier"));
  assert.ok(shell.includes("Exporter le dossier"));
  assert.ok(shell.includes("Validation humaine obligatoire"));
  assert.ok(shell.includes('accept=".pdf,.docx,.zip"'));

  const handler = read("lib/nexus/tender-response-handler.js");
  assert.ok(handler.includes("requireAdmin(req, res)"));
  assert.ok(handler.includes("tenderInventory"));
  assert.ok(handler.includes('action === "export"'));
  assert.ok(handler.includes('action !== "prepare"'));

  const nexusClient = read("admin/nexus.js");
  assert.ok(nexusClient.includes("loadTenderResponseDashboard"));
  assert.ok(nexusClient.includes('data-metric-key="tender-responses"'));

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
