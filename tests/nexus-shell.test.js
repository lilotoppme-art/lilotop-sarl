"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { nexusCatalog } = require("../lib/nexus/catalog");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.deepStrictEqual(
  nexusCatalog.modules.map(({ name, statusLabel }) => [name, statusLabel]),
  [
    ["Coffre documentaire", "Actif"],
    ["Orchestrateur NEXUS AI", "Actif"],
    ["Business Radar", "Actif"],
    ["Commercial AI", "Actif"],
    ["Réponse Appels d'Offres AI", "Actif"],
    ["Fournisseurs AI", "Actif"],
    ["Achats AI", "À venir"],
    ["Appels d'offres AI", "À venir"],
    ["CRM IA central", "Actif"],
    ["Finance", "À venir"],
    ["Odoo", "À venir"]
  ],
  "Le catalogue des modules NEXUS doit rester strictement statique."
);

assert.strictEqual(nexusCatalog.modules.filter((module) => module.status === "active").length, 7);
assert.strictEqual(nexusCatalog.modules[0].route, "/admin/nexus/document-vault");
assert.strictEqual(nexusCatalog.modules[1].route, "/admin/nexus/orchestrator");
assert.strictEqual(nexusCatalog.modules[2].route, "/admin/business-radar");
assert.strictEqual(nexusCatalog.modules[3].route, "/admin/nexus/commercial-ai");
assert.strictEqual(nexusCatalog.modules[4].route, "/admin/nexus/tender-response-ai");
assert.strictEqual(nexusCatalog.modules[5].route, "/admin/nexus/supplier-ai");
assert.strictEqual(nexusCatalog.modules[8].route, "/admin/nexus/crm");

assert.deepStrictEqual(
  nexusCatalog.roles.map((role) => role.name),
  [
    "Super Administrateur",
    "Direction Générale",
    "Commercial",
    "Achats",
    "Finance",
    "Comptabilité",
    "Lecture seule"
  ]
);

assert.deepStrictEqual(
  nexusCatalog.settings.map((setting) => setting.name),
  ["OpenAI", "Gmail / Google Workspace", "Resend", "Neon", "Odoo", "Variables d'environnement"]
);
assert.ok(nexusCatalog.settings.every((setting) => setting.statusLabel === "Non configuré"));
assert.deepStrictEqual(nexusCatalog.activity, []);
assert.deepStrictEqual(
  nexusCatalog.dashboard.map((metric) => metric.label),
  [
    "Opportunités",
    "Appels d'offres",
    "Dossiers AO",
    "Clients",
    "Fournisseurs",
    "Fournisseurs trouvés",
    "RFQ préparées",
    "RFQ envoyées",
    "Réponses reçues",
    "Fournisseurs favoris",
    "Workflows actifs",
    "Opportunités en cours",
    "Agents actifs",
    "Temps moyen",
    "Valeur potentielle totale",
    "Alertes critiques",
    "Commandes",
    "Devis",
    "Valeur potentielle",
    "Trésorerie",
    "Alertes IA",
    "Activité récente"
  ]
);
assert.ok(nexusCatalog.dashboard.every((metric) => metric.value === "—"));
assert.deepStrictEqual(
  nexusCatalog.executivePanels.map((panel) => panel.title),
  ["Actions recommandées par l'IA", "Résumé du jour", "Échéances importantes"]
);
assert.ok(nexusCatalog.executivePanels.every((panel) => panel.statusLabel === "Placeholder"));

const serializedCatalog = JSON.stringify(nexusCatalog);
assert.ok(!/api[_-]?key|password|secret|token/i.test(serializedCatalog), "Le catalogue ne doit contenir aucun secret.");

const vercelConfig = JSON.parse(read("vercel.json"));
assert.ok(
  vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/nexus" && destination === "/api/nexus-page"
  ),
  "La route privée /admin/nexus doit cibler le shell NEXUS."
);
assert.ok(
  vercelConfig.rewrites.some(({ source, destination }) =>
    source === "/admin/business-radar" && destination === "/api/business-radar-page"
  ),
  "La route Business Radar existante doit rester intacte."
);

const shell = read("admin/nexus-shell.html");
assert.ok(shell.includes('href="/admin/business-radar"'));
assert.ok(shell.includes('href="/admin/nexus/commercial-ai"'));
assert.ok(shell.includes('href="/admin/nexus/tender-response-ai"'));
assert.ok(shell.includes('href="/admin/nexus/supplier-ai"'));
assert.ok(shell.includes('href="/admin/nexus/crm"'));
assert.ok(shell.includes('id="activity-journal"'));
assert.ok(shell.includes('id="panel-ai-actions"'));
assert.ok(shell.includes('id="panel-daily-summary"'));
assert.ok(shell.includes('id="panel-deadlines"'));
assert.ok(shell.includes("{{NEXUS_BOOTSTRAP}}"));
assert.ok(shell.includes("Mot de passe oubli"));
assert.ok(shell.includes('href="/admin/nexus/reset-password"'));

const resetShell = read("admin/password-reset-shell.html");
const resetClient = read("admin/password-reset.js");
assert.ok(resetShell.includes("Recuperer l'acces NEXUS AI"));
assert.ok(resetClient.includes("/api/admin-password-reset"));

const stylesheet = read("admin/nexus.css");
assert.ok(stylesheet.includes("[hidden]"), "Les vues masquées doivent respecter l'attribut HTML hidden.");
assert.ok(stylesheet.includes("display: none !important"));

const pageRoute = read("api/nexus-page.js");
assert.ok(pageRoute.includes('require("../lib/business-radar/auth")'));
assert.ok(pageRoute.includes('"X-Robots-Tag", "noindex, nofollow, noarchive"'));
assert.ok(pageRoute.includes('delegatedHandler === "admin-password-reset-api"'));
assert.ok(pageRoute.includes("VERCEL_BRANCH_URL"));
assert.ok(pageRoute.includes('redirectToStablePreview(req, res, "/admin/nexus/orchestrator")'));
assert.ok(vercelConfig.rewrites.some(({ source }) => source === "/admin/nexus/reset-password"));

const pageHandler = require("../api/nexus-page");
const previousVercelEnv = process.env.VERCEL_ENV;
const previousBranchUrl = process.env.VERCEL_BRANCH_URL;
process.env.VERCEL_ENV = "preview";
process.env.VERCEL_BRANCH_URL = "lilotop-sarl-git-feature-preview.vercel.app";
const redirectHeaders = {};
const redirectResponse = {
  setHeader(name, value) { redirectHeaders[name] = value; },
  end() { this.ended = true; }
};
assert.equal(pageHandler.redirectToStablePreview(
  { headers: { host: "lilotop-sarl-unique-preview.vercel.app" } },
  redirectResponse,
  "/admin/nexus/orchestrator"
), true);
assert.equal(redirectResponse.statusCode, 307);
assert.equal(redirectHeaders.Location, "https://lilotop-sarl-git-feature-preview.vercel.app/admin/nexus/orchestrator");
assert.equal(pageHandler.redirectToStablePreview(
  { headers: { host: "lilotop-sarl-git-feature-preview.vercel.app" } },
  { setHeader() {}, end() {} },
  "/admin/nexus/orchestrator"
), false);
if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = previousVercelEnv;
if (previousBranchUrl === undefined) delete process.env.VERCEL_BRANCH_URL;
else process.env.VERCEL_BRANCH_URL = previousBranchUrl;

console.log("NEXUS AI Phase 3 shell tests passed.");
