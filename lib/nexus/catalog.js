"use strict";

const nexusCatalog = Object.freeze({
  phase: "Phase 3",
  productName: "LILOTOP NEXUS AI",
  dashboard: [
    { key: "opportunities", label: "Opportunités", value: "—", note: "Données non connectées" },
    { key: "tenders", label: "Appels d'offres", value: "—", note: "Données non connectées" },
    { key: "tender-responses", label: "Dossiers AO", value: "—", note: "Aucun dossier préparé" },
    { key: "clients", label: "Clients", value: "—", note: "Données non connectées" },
    { key: "suppliers", label: "Fournisseurs", value: "—", note: "Données non connectées" },
    { key: "supplier-ai-found", label: "Fournisseurs trouvés", value: "—", note: "Supplier AI non connecté" },
    { key: "supplier-ai-rfq-prepared", label: "RFQ préparées", value: "—", note: "Supplier AI non connecté" },
    { key: "supplier-ai-rfq-sent", label: "RFQ envoyées", value: "—", note: "Supplier AI non connecté" },
    { key: "supplier-ai-responses", label: "Réponses reçues", value: "—", note: "Supplier AI non connecté" },
    { key: "supplier-ai-favorites", label: "Fournisseurs favoris", value: "—", note: "Supplier AI non connecté" },
    { key: "orchestrator-active", label: "Workflows actifs", value: "—", note: "Orchestrateur non connecté" },
    { key: "orchestrator-opportunities", label: "Opportunités en cours", value: "—", note: "Orchestrateur non connecté" },
    { key: "orchestrator-agents", label: "Agents actifs", value: "—", note: "Orchestrateur non connecté" },
    { key: "orchestrator-average", label: "Temps moyen", value: "—", note: "Orchestrateur non connecté" },
    { key: "orchestrator-value", label: "Valeur potentielle totale", value: "—", note: "Orchestrateur non connecté" },
    { key: "orchestrator-alerts", label: "Alertes critiques", value: "—", note: "Orchestrateur non connecté" },
    { key: "orders", label: "Commandes", value: "—", note: "Données non connectées" },
    { key: "quotes", label: "Devis", value: "—", note: "Données non connectées" },
    { key: "potential-value", label: "Valeur potentielle", value: "—", note: "Données non connectées" },
    { key: "cash-flow", label: "Trésorerie", value: "—", note: "Placeholder financier" },
    { key: "ai-alerts", label: "Alertes IA", value: "—", note: "Analyse non connectée" },
    { key: "recent-activity", label: "Activité récente", value: "—", note: "Journal non connecté" }
  ],
  executivePanels: [
    {
      key: "ai-actions",
      eyebrow: "Aide à la décision",
      title: "Actions recommandées par l'IA",
      statusLabel: "Placeholder",
      emptyTitle: "Aucune recommandation active",
      emptyText: "Les recommandations apparaîtront lorsque les sources de données seront connectées."
    },
    {
      key: "daily-summary",
      eyebrow: "Synthèse exécutive",
      title: "Résumé du jour",
      statusLabel: "Placeholder",
      emptyTitle: "Aucun résumé disponible",
      emptyText: "Le résumé quotidien sera généré dans une phase fonctionnelle ultérieure."
    },
    {
      key: "deadlines",
      eyebrow: "Pilotage",
      title: "Échéances importantes",
      statusLabel: "Placeholder",
      emptyTitle: "Aucune échéance synchronisée",
      emptyText: "Les échéances seront affichées après connexion des modules opérationnels."
    }
  ],
  modules: [
    {
      key: "document-vault",
      name: "Coffre documentaire",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/nexus/document-vault",
      description: "Référentiel versionné des documents administratifs et techniques de LILOTOP."
    },
    {
      key: "nexus-orchestrator",
      name: "Orchestrateur NEXUS AI",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/nexus/orchestrator",
      description: "Coordination des agents, workflows reprenables et dossiers commerciaux uniques."
    },
    {
      key: "business-radar",
      name: "Business Radar",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/business-radar",
      description: "Premier module opérationnel de NEXUS AI."
    },
    {
      key: "commercial-ai",
      name: "Commercial AI",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/nexus/commercial-ai",
      description: "Qualification et analyse IA des opportunités commerciales."
    },
    {
      key: "tender-response-ai",
      name: "Réponse Appels d'Offres AI",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/nexus/tender-response-ai",
      description: "Analyse de dossiers importés, conformité et génération de brouillons."
    },
    {
      key: "supplier-ai",
      name: "Fournisseurs AI",
      status: "active",
      statusLabel: "Actif",
      route: "/admin/nexus/supplier-ai",
      description: "Sourcing international, préparation RFQ et suivi des réponses."
    },
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
