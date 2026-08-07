"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { identityKey, normalizeOrganization, ORGANIZATION_TYPES } = require("../lib/nexus/crm-store");
const { ROLE_PERMISSIONS } = require("../lib/nexus/crm-handler");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(identityKey("Kamoa Kakula", "RDC"), identityKey("KAMOA-KAKULA", "rdc"));
assert.strictEqual(identityKey("Société Minière", "RDC"), "societe-miniere-rdc");
assert.throws(() => identityKey(""), /nom/i);

const organization = normalizeOrganization({
  name: "Kamoa Kakula", type: "client", country: "RDC",
  products: ["Cuivre", "Cuivre"], tags: "Client, Prioritaire"
});
assert.strictEqual(organization.organizationType, "client");
assert.deepStrictEqual(organization.products, ["Cuivre"]);
assert.deepStrictEqual(organization.tags, ["Client", "Prioritaire"]);
assert.ok(ORGANIZATION_TYPES.has("international-organization"));

assert.ok(ROLE_PERMISSIONS.administrator.includes("merge"));
assert.ok(ROLE_PERMISSIONS.executive.includes("read"));
assert.ok(!ROLE_PERMISSIONS["read-only"].includes("write"));

const migration = read("db/migrations/014_nexus_crm.sql");
["crm_organizations", "crm_people", "crm_interactions", "crm_document_links", "crm_role_assignments", "crm_activity_log"]
  .forEach((table) => assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table));
assert.ok(migration.includes("identity_key text NOT NULL UNIQUE"));

const vercel = JSON.parse(read("vercel.json"));
assert.ok(vercel.rewrites.some((route) => route.source === "/admin/nexus/crm"));
assert.ok(vercel.rewrites.some((route) => route.source === "/api/crm"));

const shell = read("admin/crm-shell.html");
["CRM IA central", "Organisations", "Journal", "Nouvelle organisation", "Synchroniser les agents"].forEach((text) => assert.ok(shell.includes(text)));
assert.ok(!shell.includes("<script>") && shell.includes('/admin/crm.js'));
assert.ok(read("lib/nexus/crm-store.js").includes("async function syncExisting"));
assert.ok(read("admin/crm.js").includes("limit: 40"));

const integrations = [
  ["lib/business-radar/service.js", "syncOpportunity"],
  ["api/commercial-ai.js", "syncCommercialAnalysis"],
  ["api/procurement-ai.js", "syncSupplierSearch"],
  ["lib/nexus/tender-response-handler.js", "syncTenderResponse"],
  ["lib/email/delivery-store.js", "syncEmailDelivery"]
];
integrations.forEach(([file, marker]) => assert.ok(read(file).includes(marker), `${file}: ${marker}`));

console.log("NEXUS CRM tests passed.");
