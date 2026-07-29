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
    ["Business Radar", "Actif"],
    ["Commercial AI", "À venir"],
    ["Achats AI", "À venir"],
    ["Appels d'offres AI", "À venir"],
    ["CRM", "À venir"],
    ["Finance", "À venir"],
    ["Odoo", "À venir"]
  ],
  "Le catalogue des modules NEXUS doit rester strictement statique."
);

assert.strictEqual(nexusCatalog.modules.filter((module) => module.status === "active").length, 1);
assert.strictEqual(nexusCatalog.modules[0].route, "/admin/business-radar");

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
    "Clients",
    "Fournisseurs",
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
assert.ok(shell.includes('id="activity-journal"'));
assert.ok(shell.includes('id="panel-ai-actions"'));
assert.ok(shell.includes('id="panel-daily-summary"'));
assert.ok(shell.includes('id="panel-deadlines"'));
assert.ok(shell.includes("{{NEXUS_BOOTSTRAP}}"));

const stylesheet = read("admin/nexus.css");
assert.ok(stylesheet.includes("[hidden]"), "Les vues masquées doivent respecter l'attribut HTML hidden.");
assert.ok(stylesheet.includes("display: none !important"));

const pageRoute = read("api/nexus-page.js");
assert.ok(pageRoute.includes('require("../lib/business-radar/auth")'));
assert.ok(pageRoute.includes('"X-Robots-Tag", "noindex, nofollow, noarchive"'));

console.log("NEXUS AI Phase 2 dashboard tests passed.");
