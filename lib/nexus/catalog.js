"use strict";

const nexusCatalog = Object.freeze({
  phase: "Phase 1",
  productName: "LILOTOP NEXUS AI",
  dashboard: [
    { key: "opportunities", label: "Opportunités", value: "—", note: "Données non connectées" },
    { key: "users", label: "Utilisateurs", value: "—", note: "Données non connectées" },
    { key: "active-modules", label: "Modules actifs", value: "1", note: "Business Radar" },
    { key: "last-activity", label: "Dernière activité", value: "—", note: "Aucune activité enregistrée" },
    { key: "system-health", label: "Santé du système", value: "À vérifier", note: "Démonstration uniquement" }
  ],
  modules: [
    {
      key: "business-radar",
      name: "Business Radar",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/business-radar",
      description: "Premier module opérationnel de NEXUS AI."
    },
    { key: "commercial-ai", name: "Commercial AI", status: "coming-soon", statusLabel: "À venir", route: null },
    { key: "purchasing-ai", name: "Achats AI", status: "coming-soon", statusLabel: "À venir", route: null },
    { key: "tender-ai", name: "Appels d'offres AI", status: "coming-soon", statusLabel: "À venir", route: null },
    { key: "crm", name: "CRM", status: "coming-soon", statusLabel: "À venir", route: null },
    { key: "finance", name: "Finance", status: "coming-soon", statusLabel: "À venir", route: null },
    { key: "odoo", name: "Odoo", status: "coming-soon", statusLabel: "À venir", route: null }
  ],
  roles: [
    {
      key: "super-admin",
      name: "Super Administrateur",
      scope: "Administration complète du shell NEXUS AI.",
      permissions: ["Accès intégral", "Gestion des rôles", "Paramètres", "Journal d'activité"]
    },
    {
      key: "executive",
      name: "Direction Générale",
      scope: "Supervision et consultation des indicateurs de direction.",
      permissions: ["Tableau de bord", "Business Radar", "Lecture des modules"]
    },
    {
      key: "sales",
      name: "Commercial",
      scope: "Accès futur aux fonctions commerciales autorisées.",
      permissions: ["Business Radar", "Commercial AI à venir"]
    },
    {
      key: "purchasing",
      name: "Achats",
      scope: "Accès futur aux fonctions achats autorisées.",
      permissions: ["Achats AI à venir", "Fournisseurs à venir"]
    },
    {
      key: "finance",
      name: "Finance",
      scope: "Accès futur aux fonctions financières autorisées.",
      permissions: ["Finance à venir", "Lecture des rapports"]
    },
    {
      key: "accounting",
      name: "Comptabilité",
      scope: "Accès futur aux fonctions comptables autorisées.",
      permissions: ["Comptabilité à venir", "Lecture des rapports"]
    },
    {
      key: "read-only",
      name: "Lecture seule",
      scope: "Consultation des espaces explicitement autorisés.",
      permissions: ["Consultation uniquement"]
    }
  ],
  settings: [
    { key: "openai", name: "OpenAI", statusLabel: "Non configuré", description: "Paramètres IA centralisés à venir." },
    { key: "google-workspace", name: "Gmail / Google Workspace", statusLabel: "Non configuré", description: "Intégration de messagerie à venir." },
    { key: "resend", name: "Resend", statusLabel: "Non configuré", description: "Paramètres d'envoi applicatif à venir." },
    { key: "neon", name: "Neon", statusLabel: "Non configuré", description: "Connexion de données centralisée à venir." },
    { key: "odoo", name: "Odoo", statusLabel: "Non configuré", description: "Intégration ERP à venir." },
    {
      key: "environment",
      name: "Variables d'environnement",
      statusLabel: "Non configuré",
      description: "Inventaire des noms de variables uniquement, sans valeurs."
    }
  ],
  activity: []
});

module.exports = { nexusCatalog };
