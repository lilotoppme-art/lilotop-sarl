"use strict";

const WEIGHTS = Object.freeze({
  documentary: 20,
  technical: 20,
  financial: 15,
  experience: 10,
  suppliers: 10,
  logistics: 10,
  competitiveness: 15
});

const LABELS = Object.freeze({
  documentary: "Conformite documentaire",
  technical: "Technique",
  financial: "Financier",
  experience: "Experience",
  suppliers: "Fournisseurs",
  logistics: "Logistique",
  competitiveness: "Competitivite estimee"
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)));
}

function cleanList(value, limit = 40) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : [];
}

function isUnknown(value) {
  return !value || /a confirmer|non publie|non disponible|inconnu/i.test(String(value));
}

function unique(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function scoreColor(score) {
  return score > 85 ? "green" : score >= 70 ? "orange" : "red";
}

function decisionFor(score) {
  if (score > 85) return { code: "respond", label: "Repondre", symbol: "check" };
  if (score >= 70) return { code: "reserve", label: "Repondre avec reserves", symbol: "warning" };
  return { code: "decline", label: "Ne pas repondre", symbol: "stop" };
}

function criterion(key, score, observation) {
  return { key, label: LABELS[key], weight: WEIGHTS[key], score: clamp(score), observation: String(observation || "") };
}

function calculateGlobal(criteria) {
  return clamp(criteria.reduce((sum, item) => sum + (item.score * item.weight / 100), 0));
}

function buildDecisionJustification(criteria, alerts, score) {
  const weakest = [...criteria].sort((left, right) => left.score - right.score).slice(0, 3);
  const decision = decisionFor(score);
  const weaknesses = weakest.map((item) => `${item.label}: ${item.score}/100`).join("; ");
  const alertNote = alerts.length ? ` ${alerts.length} alerte(s) prioritaire(s) restent a traiter.` : " Aucun blocage majeur n'est identifie.";
  return `${decision.label} au score global de ${score}/100. Points les plus faibles: ${weaknesses}.${alertNote}`;
}

function computeTenderEvaluation({ compliance = {}, keyInformation = {}, assessment = {} } = {}) {
  const missingDocuments = cleanList(compliance.missingDocuments, 80);
  const expiredDocuments = cleanList(compliance.expiredDocuments, 80);
  const requestedProducts = cleanList(keyInformation.requestedProducts);
  const standards = cleanList(keyInformation.technicalStandards);
  const incoterms = cleanList(keyInformation.incoterms);
  const deliveryConditions = cleanList(keyInformation.deliveryConditions);
  const unavailableProducts = cleanList(assessment.unavailableProducts);
  const majorRisks = cleanList(assessment.majorRisks);
  const criticalClauses = cleanList(assessment.criticalContractClauses);

  const documentaryScore = clamp(compliance.compliancePercent);
  let technicalScore = clamp(assessment.technicalScore);
  let financialScore = clamp(assessment.financialScore);
  let experienceScore = clamp(assessment.experienceScore);
  let supplierScore = clamp(assessment.supplierScore);
  let logisticsScore = clamp(assessment.logisticsScore);
  let competitivenessScore = clamp(assessment.competitivenessScore);

  if (!requestedProducts.length) technicalScore = Math.min(technicalScore, 40);
  else if (!standards.length) technicalScore = Math.min(technicalScore, 70);
  if (unavailableProducts.length) technicalScore = Math.min(technicalScore, 55);

  const financialEvidenceMissing = isUnknown(keyInformation.budget) || isUnknown(keyInformation.currency);
  if (financialEvidenceMissing) financialScore = Math.min(financialScore, 55);
  if (assessment.financialDataValidated !== true) competitivenessScore = Math.min(competitivenessScore, 60);

  const referenceMissing = missingDocuments.some((item) => /reference/i.test(item));
  if (assessment.insufficientReferences || referenceMissing) experienceScore = Math.min(experienceScore, 50);
  if (assessment.missingSuppliers) supplierScore = Math.min(supplierScore, 45);
  if (!incoterms.length || !deliveryConditions.length) logisticsScore = Math.min(logisticsScore, 60);

  const criteria = [
    criterion("documentary", documentaryScore, `${missingDocuments.length} manquant(s), ${expiredDocuments.length} expire(s).`),
    criterion("technical", technicalScore, assessment.technicalObservation || "Adequation technique a confirmer."),
    criterion("financial", financialScore, financialEvidenceMissing ? "Budget, devise ou donnees de prix non valides." : assessment.financialObservation),
    criterion("experience", experienceScore, assessment.experienceObservation || "References similaires a documenter."),
    criterion("suppliers", supplierScore, assessment.supplierObservation || "Disponibilite fournisseurs a confirmer."),
    criterion("logistics", logisticsScore, assessment.logisticsObservation || "Schema logistique a confirmer."),
    criterion("competitiveness", competitivenessScore, assessment.competitivenessObservation || "Competitivite a confirmer apres cotations.")
  ];
  const globalScore = calculateGlobal(criteria);
  const probability = clamp(globalScore * 0.9 - majorRisks.length * 2 - criticalClauses.length);
  const decision = decisionFor(globalScore);

  const alerts = unique([
    ...missingDocuments.map((item) => `Document manquant: ${item}`),
    ...expiredDocuments.map((item) => `Document expire: ${item}`),
    ...(assessment.insufficientReferences ? ["References similaires insuffisantes"] : []),
    ...(assessment.missingSuppliers ? ["Fournisseurs adaptes non confirmes"] : []),
    ...unavailableProducts.map((item) => `Produit indisponible ou non confirme: ${item}`),
    ...majorRisks.map((item) => `Risque majeur: ${item}`),
    ...criticalClauses.map((item) => `Clause critique: ${item}`)
  ]);
  const recommendations = unique([
    ...cleanList(assessment.recommendations),
    ...(referenceMissing || assessment.insufficientReferences ? ["Ajouter une reference similaire validee."] : []),
    ...(assessment.missingSuppliers ? ["Identifier et valider au moins un fournisseur alternatif."] : []),
    ...(keyInformation.guarantees?.length ? ["Confirmer la capacite bancaire pour les garanties demandees."] : []),
    ...(financialEvidenceMissing ? ["Completer et faire valider l'offre financiere."] : []),
    ...(missingDocuments.some((item) => /hse/i.test(item)) ? ["Completer les documents HSE."] : []),
    ...(technicalScore < 70 ? ["Renforcer la reponse technique et l'equipe projet."] : [])
  ]);

  return {
    criteria,
    globalScore,
    probability,
    color: scoreColor(globalScore),
    decision: {
      ...decision,
      justification: buildDecisionJustification(criteria, alerts, globalScore)
    },
    alerts,
    recommendations,
    simulationDefaults: {
      priceAdjustment: 0,
      supplierReliability: supplierScore,
      deliveryAdjustmentDays: 0
    }
  };
}

function simulateTenderEvaluation(evaluation, scenario = {}) {
  const criteria = (evaluation.criteria || []).map((item) => ({ ...item }));
  const byKey = Object.fromEntries(criteria.map((item) => [item.key, item]));
  const priceAdjustment = Math.max(-30, Math.min(30, Number(scenario.priceAdjustment) || 0));
  const supplierReliability = clamp(scenario.supplierReliability ?? byKey.suppliers?.score);
  const deliveryAdjustmentDays = Math.max(-60, Math.min(60, Number(scenario.deliveryAdjustmentDays) || 0));

  byKey.financial.score = clamp(byKey.financial.score - priceAdjustment * 0.7);
  byKey.suppliers.score = supplierReliability;
  byKey.logistics.score = clamp(byKey.logistics.score - deliveryAdjustmentDays * 0.45);
  byKey.competitiveness.score = clamp(
    byKey.competitiveness.score - priceAdjustment * 0.4
      + (supplierReliability - (evaluation.simulationDefaults?.supplierReliability || 0)) * 0.2
      - deliveryAdjustmentDays * 0.15
  );
  const globalScore = calculateGlobal(criteria);
  const probability = clamp(globalScore * 0.9 - (evaluation.alerts?.length || 0));
  const decision = decisionFor(globalScore);
  return {
    criteria,
    globalScore,
    probability,
    color: scoreColor(globalScore),
    decision: {
      ...decision,
      justification: buildDecisionJustification(criteria, evaluation.alerts || [], globalScore)
    }
  };
}

module.exports = {
  LABELS,
  WEIGHTS,
  calculateGlobal,
  computeTenderEvaluation,
  decisionFor,
  scoreColor,
  simulateTenderEvaluation
};
