"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const { prepareVaultFile } = require("../lib/nexus/document-vault-files");

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

  const migration = read("db/migrations/011_document_vault.sql");
  const inventoryMigration = read("db/migrations/016_document_vault_inventory.sql");
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
  const profileStore = read("lib/nexus/organization-profile-store.js");
  assert.ok(profileStore.includes("nexus_organization_credentials"));
  assert.ok(profileStore.includes("confirmation_source"));

  const store = read("lib/nexus/document-vault-store.js");
  assert.ok(store.includes("ORDER BY created_at DESC"));
  assert.ok(store.includes("tenderInventory"));
  assert.ok(store.includes("usableInTenders"));
  assert.ok(store.includes("octet_length(v.file_data)"));
  assert.ok(store.includes("ensureInventorySchema"));
  assert.ok(migration.includes("ON DELETE RESTRICT"));

  const handler = read("lib/nexus/document-vault-handler.js");
  assert.ok(handler.includes("requireAdmin(req, res)"));
  assert.ok(handler.includes('action === "history"'));
  assert.ok(handler.includes('action === "preview"'));
  assert.ok(handler.includes('action === "file"'));
  assert.ok(handler.includes('action === "inventory"'));
  assert.ok(!handler.includes("DELETE FROM"));

  const shell = read("admin/document-vault-shell.html");
  assert.ok(shell.includes('accept=".pdf,.docx,.xlsx,.zip"'));
  assert.ok(shell.includes("Date de délivrance"));
  assert.ok(shell.includes("Date d'expiration"));
  assert.ok(shell.includes("Historique des versions"));
  assert.ok(shell.includes("Document officiel LILOTOP SARL utilisable"));

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
