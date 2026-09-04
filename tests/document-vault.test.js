"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const {
  analyzePreparedVaultFile, analyzeVaultDocument, prepareVaultFile, proposeExperienceAssociation
} = require("../lib/nexus/document-vault-files");
const { buildUnopsExperienceAudit } = require("../lib/nexus/document-vault-matching");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventaire");
  sheet.addRow(["Document", "Version", "Expiration"]);
  sheet.addRow(["RCCM", "2026", "2027-12-31"]);
  const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const xlsx = await prepareVaultFile({
    filename: "inventaire.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsxBuffer
  });
  assert.strictEqual(xlsx.extension, "xlsx");
  assert.ok(xlsx.previewText.includes("Inventaire"));
  assert.ok(xlsx.previewText.includes("RCCM"));
  assert.strictEqual(xlsx.sha256.length, 64);

  const zip = new AdmZip();
  zip.addFile("RCCM.pdf", Buffer.from("test"));
  zip.addFile("HSE/politique.docx", Buffer.from("test"));
  const archive = await prepareVaultFile({
    filename: "administratif.zip",
    contentType: "application/zip",
    buffer: zip.toBuffer()
  });
  assert.strictEqual(archive.extension, "zip");
  assert.ok(archive.previewText.includes("RCCM.pdf"));
  assert.ok(archive.previewText.includes("politique.docx"));

  const image = await prepareVaultFile({
    filename: "preuve-livraison.jpg",
    contentType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.strictEqual(image.extension, "jpg");
  const analysis = analyzeVaultDocument({
    ...image,
    sourceFilename: "PO-2024-client-minier.jpg",
    previewText: "Client: Mine Example\nObjet: Fourniture de câbles électriques\nDate: 2024-04-12"
  });
  assert.strictEqual(analysis.categoryCode, "04-experience-references");
  assert.strictEqual(analysis.experience.client, "Mine Example");
  assert.strictEqual(analysis.experience.value, "");

  const original = Buffer.from("untouched-original");
  const originalCopy = Buffer.from(original);
  const poAnalysis = analyzeVaultDocument({
    sourceFilename: "RM-1202060.pdf", extension: "pdf", buffer: original,
    previewText: [
      "PURCHASE ORDER", "Client: GECAMINES", "PO No: RM 1202060",
      "Issue date: 2024-05-17", "Subject: Fourniture de câbles électriques",
      "Products: Câbles industriels", "Quantity: 24 bobines", "Amount: 12500 USD",
      "Country: RDC", "Delivery place: Lubumbashi", "Incoterm: DAP",
      "Delivery period: 30 jours", "Client reference: GCM-ELEC-24", "Version: 2"
    ].join("\n")
  });
  assert.strictEqual(poAnalysis.categoryCode, "04-experience-references");
  assert.strictEqual(poAnalysis.title, "Fourniture de câbles électriques");
  assert.strictEqual(poAnalysis.version, "2");
  assert.strictEqual(poAnalysis.experience.client, "GECAMINES");
  assert.strictEqual(poAnalysis.experience.quantities, "24 bobines");
  assert.strictEqual(poAnalysis.experience.incoterm, "DAP");
  assert.strictEqual(poAnalysis.experience.groupReference, "RM 1202060");
  assert.deepStrictEqual(original, originalCopy);
  assert.strictEqual(poAnalysis.documentType, "BON DE COMMANDE / PURCHASE ORDER");
  assert.strictEqual(poAnalysis.fileFormat, "PDF");

  const scannedPdf = {
    sourceFilename: "copie-document-test.pdf", extension: "pdf",
    mimeType: "application/pdf", buffer: Buffer.from("fixture-pdf-sans-texte"),
    previewText: ""
  };
  let ocrRequest;
  const scannedAnalysis = await analyzePreparedVaultFile(scannedPdf, {}, {
    openaiApiKey: "test-key-never-sent",
    openaiModel: "test-model",
    fetchImpl: async (url, options) => {
      ocrRequest = { url, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ output_text: JSON.stringify({
          documentType: "PURCHASE ORDER", clientAuthority: "Client industriel",
          reference: "PO-2024-001", date: "2024-05-17",
          subject: "Fourniture d'équipements électriques", supplier: "Fournisseur test",
          products: "Équipements électriques", quantities: "24 unités", amount: "12500",
          currency: "USD", deliveryPlace: "Site industriel", incoterm: "DAP",
          leadTime: "30 jours", signaturesOrStamps: "Signature et cachet visibles"
        }) })
      };
    }
  });
  assert.strictEqual(ocrRequest.url, "https://api.openai.com/v1/responses");
  assert.ok(ocrRequest.body.input[0].content.some((item) => item.type === "input_file"));
  assert.strictEqual(scannedAnalysis.documentType, "BON DE COMMANDE / PURCHASE ORDER");
  assert.strictEqual(scannedAnalysis.fileFormat, "PDF");
  assert.strictEqual(scannedAnalysis.issuingAuthority, "Client industriel");
  assert.strictEqual(scannedAnalysis.reference, "PO-2024-001");
  assert.strictEqual(scannedAnalysis.issuedOn, "2024-05-17");
  assert.strictEqual(scannedAnalysis.experience.subject, "Fourniture d'équipements électriques");
  assert.strictEqual(scannedAnalysis.experience.value, "12500");
  assert.strictEqual(scannedAnalysis.experience.currency, "USD");
  assert.strictEqual(scannedAnalysis.categoryCode, "04-experience-references");

  const deliveryAnalysis = analyzeVaultDocument({
    sourceFilename: "preuve-livraison-equipement.pdf", extension: "pdf",
    previewText: [
      "LILOTOP SARL", "RCCM: CD/TEST/001", "Impôt: A0000000A",
      "BON DE LIVRAISON", "N° Bon de commande Client Mining SA : PO-2024-077",
      "Date de livraison: 2024-06-10", "Client Mining SA", "Site industriel",
      "DESIGNATION", "UNITE", "QUANTITE", "OBSERVATIONS ET RESERVES DU CLIENT",
      "1", "Banc d'essais électrique 15 kW", "PCE", "2",
      "Signature et cachet du client", "Réceptionné sans réserve"
    ].join("\n")
  });
  assert.strictEqual(deliveryAnalysis.categoryCode, "04-experience-references");
  assert.strictEqual(deliveryAnalysis.documentType, "BON DE LIVRAISON");
  assert.strictEqual(deliveryAnalysis.issuingAuthority, "Client Mining SA");
  assert.strictEqual(deliveryAnalysis.reference, "PO-2024-077");
  assert.strictEqual(deliveryAnalysis.issuedOn, "2024-06-10");
  assert.strictEqual(deliveryAnalysis.experience.productsServices, "Banc d'essais électrique 15 kW");
  assert.strictEqual(deliveryAnalysis.experience.quantities, "2");
  assert.strictEqual(deliveryAnalysis.experience.deliveryProofAvailable, true);
  assert.strictEqual(deliveryAnalysis.experience.performanceCertificateAvailable, false);
  const association = proposeExperienceAssociation(deliveryAnalysis, [{
    id: "existing-po", title: "Commande équipement", reference: "PO-2024-077",
    issuingAuthority: "Client Mining SA", description: "Banc d'essais électrique",
    experience: {
      contract_number: "PO-2024-077", client_name: "Client Mining SA",
      products_services: "Banc d'essais électrique 15 kW"
    }
  }]);
  assert.strictEqual(association.reference, "PO-2024-077");
  assert.strictEqual(association.confidence, "ÉLEVÉE");
  assert.strictEqual(association.validationRequired, true);

  const gecaminesExperiences = [{
    id: "rm-1202060", title: "RM 1202060 Q", reference: "RM 1202060 Q",
    issuingAuthority: "GECAMINES S.A.", experience: {
      contract_number: "ACH/OPA/01106/2021", client_name: "GECAMINES S.A.",
      products_services: "Équipement industriel"
    }
  }, {
    id: "rm-1202061", title: "RM 1202061 Q", reference: "RM 1202061 Q",
    issuingAuthority: "GECAMINES S.A.", experience: {
      contract_number: "ACH/OPA/01105/2021", client_name: "GECAMINES S.A.",
      products_services: "Appareil pour mesures électriques SVERKER 780"
    }
  }];
  const proofFor = (reference, productsServices) => ({
    reference,
    experience: {
      documentRole: "delivery_note", groupReference: reference,
      client: "GECAMINES SA", productsServices
    }
  });
  const association2061 = proposeExperienceAssociation(
    proofFor("RM 1202061 Q", "SVERKER 780"), gecaminesExperiences
  );
  assert.strictEqual(association2061.documentId, "rm-1202061");
  assert.strictEqual(association2061.reference, "RM 1202061 Q");
  const association2060 = proposeExperienceAssociation(
    proofFor("RM 1202060 Q", "SVERKER 780"), gecaminesExperiences
  );
  assert.strictEqual(association2060.documentId, "rm-1202060");
  assert.strictEqual(association2060.reference, "RM 1202060 Q");
  const ambiguousAssociation = proposeExperienceAssociation(
    proofFor("RÉFÉRENCE INCONNUE", ""), gecaminesExperiences
  );
  assert.strictEqual(ambiguousAssociation.ambiguous, true);
  assert.strictEqual(ambiguousAssociation.documentId, "");
  assert.strictEqual(ambiguousAssociation.reference, "ASSOCIATION À CONFIRMER PAR LE DG");

  const audit = buildUnopsExperienceAudit([{
    id: "experience-1", title: "PO câbles", description: "Fourniture électrique",
    categoryCode: "04-experience-references", filePresent: true, previewText: "livré avec succès",
    sourceFilename: "po.pdf", experience: {
      subject: "Fourniture de câbles électriques", contract_date: "2024-04-12",
      execution_status: "Livré avec succès", dg_validated: false
    }
  }]);
  assert.strictEqual(audit.rows[0].lots[2].status, "À CONFIRMER");
  assert.strictEqual(audit.lots[1].confirmed, 0);

  const linkedProofAudit = buildUnopsExperienceAudit([{
    id: "po-with-proof", title: "PO outillage", description: "Fourniture d'outillage",
    documentType: "BON DE COMMANDE / PURCHASE ORDER",
    categoryCode: "04-experience-references", filePresent: true, previewText: "",
    sourceFilename: "po-outillage.pdf", experience: {
      subject: "Fourniture de perceuses", contract_date: "2023-03-10",
      execution_status: "", delivery_proof_available: true, dg_validated: true
    }
  }, {
    id: "delivery-proof", title: "Bon de livraison", description: "Livraison de perceuses",
    documentType: "BON DE LIVRAISON", categoryCode: "04-experience-references",
    filePresent: true, previewText: "BON DE LIVRAISON", sourceFilename: "bl.pdf",
    extractedMetadata: { experience: { documentRole: "delivery_note" } },
    experience: {
      subject: "Livraison de perceuses", contract_date: "2023-03-15",
      execution_status: "Réceptionné", delivery_proof_available: true, dg_validated: false
    }
  }]);
  assert.strictEqual(linkedProofAudit.rows.length, 1);
  assert.strictEqual(linkedProofAudit.rows[0].documentId, "po-with-proof");
  assert.strictEqual(linkedProofAudit.rows[0].lots[1].status, "OUI");
  assert.ok(!linkedProofAudit.rows[0].lots[1].justification.includes("livraison réussie non prouvée"));

  const migration = read("db/migrations/011_document_vault.sql");
  const inventoryMigration = read("db/migrations/016_document_vault_inventory.sql");
  const permanentMigration = read("db/migrations/018_document_vault_permanent.sql");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS document_vault_documents"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS document_vault_versions"));
  assert.ok(migration.includes("file_data bytea NOT NULL"));
  assert.ok(migration.includes("UNIQUE (document_id, version_label)"));
  assert.ok(!migration.includes("DROP TABLE"));
  assert.ok(!migration.includes("DELETE FROM"));
  assert.ok(inventoryMigration.includes("usable_for_tenders"));
  assert.ok(inventoryMigration.includes("organization_name"));
  assert.ok(!inventoryMigration.includes("DROP TABLE"));
  assert.ok(!inventoryMigration.includes("DELETE FROM"));
  assert.ok(permanentMigration.includes("document_vault_experiences"));
  assert.ok(permanentMigration.includes("document_vault_tender_links"));
  const profileStore = read("lib/nexus/organization-profile-store.js");
  assert.ok(profileStore.includes("nexus_organization_credentials"));
  assert.ok(profileStore.includes("confirmation_source"));

  const store = read("lib/nexus/document-vault-store.js");
  assert.ok(store.includes("ORDER BY created_at DESC"));
  assert.ok(store.includes("tenderInventory"));
  assert.ok(store.includes("usableInTenders"));
  assert.ok(store.includes("octet_length(v.file_data)"));
  assert.ok(store.includes("ensureInventorySchema"));
  assert.ok(store.includes("permanent-vault-2"));
  assert.ok(migration.includes("ON DELETE RESTRICT"));

  const handler = read("lib/nexus/document-vault-handler.js");
  assert.ok(handler.includes("requireAdmin(req, res)"));
  assert.ok(handler.includes('action === "history"'));
  assert.ok(handler.includes('action === "preview"'));
  assert.ok(handler.includes('action === "file"'));
  assert.ok(handler.includes('action === "inventory"'));
  assert.ok(handler.includes('action === "unops-experience-audit"'));
  assert.ok(handler.includes('action === "reanalyze"'));
  assert.ok(handler.includes('action === "correct-metadata"'));
  assert.ok(handler.includes('["analyze", "upload"]'));
  assert.ok(handler.includes('action !== "validate-experience"'));
  assert.ok(handler.includes('req.method === "PATCH"'));
  assert.ok(!handler.includes("DELETE FROM"));

  const shell = read("admin/document-vault-shell.html");
  assert.ok(shell.includes('accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"'));
  assert.ok(shell.includes("04 — Expériences &amp; références"));
  assert.ok(read("admin/document-vault.js").includes("Finalisé pour soumission"));
  assert.ok(shell.includes("Date de délivrance"));
  assert.ok(shell.includes("Date d'expiration"));
  assert.ok(shell.includes("Historique des versions"));
  assert.ok(shell.includes("Document officiel LILOTOP SARL utilisable"));
  assert.ok(shell.includes("Informations détectées automatiquement"));
  assert.ok(shell.includes('id="vault-experience-association"'));
  assert.ok(shell.includes("Correction proposée"));
  assert.ok(shell.includes('id="vault-correction-confirm"'));

  assert.ok(store.includes("correctMetadata"));
  assert.ok(store.includes("correctionHistory"));
  assert.ok(store.includes("delivery_proof_available=true"));
  assert.ok(store.includes("associatedEvidence"));
  assert.ok(store.includes("DELETE FROM document_vault_experiences WHERE document_id=$1"));
  assert.ok(!store.includes("performance_certificate_available=true"));

  const tenderHandler = read("lib/nexus/tender-response-handler.js");
  assert.ok(tenderHandler.includes("documentVaultStore.listDocuments()"));
  const tenderAi = read("lib/nexus/tender-response-ai.js");
  assert.ok(tenderAi.includes("expiredDocuments"));
  assert.ok(tenderAi.includes("vaultDocuments"));

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus/document-vault"
    && destination === "/api/nexus-page?handler=document-vault-page"
  ));
  assert.ok(vercel.rewrites.some(({ source, destination }) =>
    source === "/api/document-vault"
    && destination === "/api/nexus-page?handler=document-vault-api"
  ));

  console.log("Document Vault tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
