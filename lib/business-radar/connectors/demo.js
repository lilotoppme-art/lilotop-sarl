async function collect(source) {
  const now = Date.now();
  return [
    { externalId: `demo-mining-${new Date().toISOString().slice(0, 10)}`, title: "DEMO - Fourniture de consommables pour operations minieres", organization: "Organisation de demonstration", country: "RDC", sector: "Mining Supply", opportunityType: "Appel d'offres", description: "Donnee fictive destinee uniquement a valider le workflow Business Radar.", sourceUrl: source.url || "https://example.com/demo-mining", publishedAt: new Date(now).toISOString(), deadlineAt: new Date(now + 21 * 86400000).toISOString(), sourceType: "demo", isDemo: true, tags: ["DEMO"] },
    { externalId: `demo-logistics-${new Date().toISOString().slice(0, 10)}`, title: "DEMO - Corridor logistique et transport industriel", organization: "Organisation de demonstration", country: "Afrique centrale", sector: "Logistics", opportunityType: "Partenariat", description: "Donnee fictive destinee uniquement a tester le scoring et les alertes.", sourceUrl: source.url || "https://example.com/demo-logistics", publishedAt: new Date(now).toISOString(), deadlineAt: new Date(now + 45 * 86400000).toISOString(), sourceType: "demo", isDemo: true, tags: ["DEMO"] },
  ];
}

module.exports = { collect };
