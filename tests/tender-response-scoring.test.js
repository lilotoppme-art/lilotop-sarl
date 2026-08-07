"use strict";

const assert = require("assert");
const {
  WEIGHTS,
  computeTenderEvaluation,
  scoreColor,
  simulateTenderEvaluation
} = require("../lib/nexus/tender-response-scoring");

assert.strictEqual(Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
assert.strictEqual(scoreColor(86), "green");
assert.strictEqual(scoreColor(85), "orange");
assert.strictEqual(scoreColor(70), "orange");
assert.strictEqual(scoreColor(69), "red");

const completeInformation = {
  budget: "1 200 000 USD",
  currency: "USD",
  requestedProducts: ["Pompes industrielles"],
  technicalStandards: ["ISO 9001"],
  incoterms: ["DAP Kolwezi"],
  deliveryConditions: ["90 jours"],
  guarantees: ["Garantie de soumission"]
};

function assessment(score, overrides = {}) {
  return {
    technicalScore: score,
    technicalObservation: "Conformite technique documentee.",
    financialScore: score,
    financialObservation: "Donnees financieres disponibles.",
    experienceScore: score,
    experienceObservation: "References comparables disponibles.",
    supplierScore: score,
    supplierObservation: "Fournisseurs confirmes.",
    logisticsScore: score,
    logisticsObservation: "Schema logistique confirme.",
    competitivenessScore: score,
    competitivenessObservation: "Position concurrentielle favorable.",
    financialDataValidated: true,
    insufficientReferences: false,
    missingSuppliers: false,
    unavailableProducts: [],
    majorRisks: [],
    criticalContractClauses: [],
    recommendations: [],
    ...overrides
  };
}

const strongDao = computeTenderEvaluation({
  compliance: { compliancePercent: 95, missingDocuments: [], expiredDocuments: [] },
  keyInformation: completeInformation,
  assessment: assessment(92)
});
assert.strictEqual(strongDao.color, "green");
assert.strictEqual(strongDao.decision.code, "respond");
assert.ok(strongDao.probability >= 80);

const reservedDao = computeTenderEvaluation({
  compliance: { compliancePercent: 75, missingDocuments: ["ISO"], expiredDocuments: [] },
  keyInformation: completeInformation,
  assessment: assessment(76, { majorRisks: ["Delai contractuel serre"] })
});
assert.strictEqual(reservedDao.color, "orange");
assert.strictEqual(reservedDao.decision.code, "reserve");

const incompleteDao = computeTenderEvaluation({
  compliance: {
    compliancePercent: 30,
    missingDocuments: ["References", "HSE", "Attestation fiscale"],
    expiredDocuments: ["CNSS"]
  },
  keyInformation: {
    budget: "Non publie", currency: "A confirmer", requestedProducts: [],
    technicalStandards: [], incoterms: [], deliveryConditions: [], guarantees: []
  },
  assessment: assessment(80, {
    financialDataValidated: false,
    insufficientReferences: true,
    missingSuppliers: true,
    unavailableProducts: ["Pompe haute pression"],
    majorRisks: ["Delai impossible"],
    criticalContractClauses: ["Penalite illimitee"]
  })
});
assert.strictEqual(incompleteDao.color, "red");
assert.strictEqual(incompleteDao.decision.code, "decline");
assert.ok(incompleteDao.alerts.some((item) => item.includes("Clause critique")));
assert.ok(incompleteDao.recommendations.some((item) => /HSE/.test(item)));

const improvedScenario = simulateTenderEvaluation(reservedDao, {
  priceAdjustment: -12,
  supplierReliability: 95,
  deliveryAdjustmentDays: -20
});
assert.ok(improvedScenario.globalScore > reservedDao.globalScore);
assert.ok(improvedScenario.probability > reservedDao.probability);

const weakerScenario = simulateTenderEvaluation(reservedDao, {
  priceAdjustment: 25,
  supplierReliability: 30,
  deliveryAdjustmentDays: 45
});
assert.ok(weakerScenario.globalScore < reservedDao.globalScore);

const alertHeavyDao = computeTenderEvaluation({
  compliance: {
    compliancePercent: 10,
    missingDocuments: Array.from({ length: 20 }, (_, index) => `Document ${index + 1}`),
    expiredDocuments: []
  },
  keyInformation: completeInformation,
  assessment: assessment(45)
});
const alertHeavyImproved = simulateTenderEvaluation(alertHeavyDao, {
  priceAdjustment: -10,
  supplierReliability: 90,
  deliveryAdjustmentDays: -15
});
assert.ok(alertHeavyImproved.globalScore > alertHeavyDao.globalScore);
assert.ok(alertHeavyImproved.probability >= alertHeavyDao.probability);

console.log("Tender Response scoring tests passed.");
