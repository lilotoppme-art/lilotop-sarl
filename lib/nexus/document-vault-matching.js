"use strict";

const UNOPS_LOTS = Object.freeze([
  { lot: 1, label: "Power Tools", pattern: /power tool|outillage|perceuse|meuleuse|marteau|drill|grinder|hilti|makita|enerpac/i },
  { lot: 2, label: "Electrical Installation Components", pattern: /electri|câble|cable|disjoncteur|breaker|luminaire|éclairage|lighting|switchgear/i },
  { lot: 10, label: "General Hardware", pattern: /hardware|quincaillerie|visserie|fixation|fastener|échelle|ladder|plomberie|tuyau|pipe/i }
]);

function year(value) {
  return value ? Number(String(value).slice(0, 4)) : 0;
}

function evaluateExperience(document, lot) {
  const experience = document.experience || {};
  const searchable = [experience.subject, experience.sector, experience.products_services,
    document.title, document.description, document.previewText].filter(Boolean).join(" ");
  const relevantPeriod = year(experience.contract_date) >= 2021 && year(experience.contract_date) <= 2025;
  const delivered = /livr|deliver|achev|complet|success/i.test(experience.execution_status || document.previewText || "");
  const productMatch = lot.pattern.test(searchable);
  const realFile = document.filePresent === true;
  const validated = experience.dg_validated === true;
  const status = realFile && validated && relevantPeriod && delivered && productMatch
    ? "OUI"
    : realFile && productMatch ? "À CONFIRMER" : "NON";
  const reasons = [];
  if (!realFile) reasons.push("fichier original inaccessible");
  if (!productMatch) reasons.push("objet du document non compatible avec le lot");
  if (!relevantPeriod) reasons.push("date hors période 2021-2025 ou non confirmée");
  if (!delivered) reasons.push("livraison réussie non prouvée");
  if (!validated) reasons.push("métadonnées non validées par le DG");
  return { status, justification: reasons.length ? reasons.join(" ; ") : "Preuve réelle, pertinente, livrée et validée" };
}

function buildUnopsExperienceAudit(documents = []) {
  const experiences = documents.filter((item) => item.categoryCode === "04-experience-references" && item.experience);
  const rows = experiences.map((document) => ({
    documentId: document.id,
    experience: document.title,
    sourceFilename: document.sourceFilename,
    lots: Object.fromEntries(UNOPS_LOTS.map((lot) => [lot.lot, evaluateExperience(document, lot)]))
  }));
  const lots = UNOPS_LOTS.map((lot) => {
    const confirmed = rows.filter((row) => row.lots[lot.lot].status === "OUI").length;
    return { lot: lot.lot, label: lot.label, confirmed, required: 2, compliant: confirmed >= 2 };
  });
  return { tenderReference: "ITB/2026/62389", rows, lots };
}

module.exports = { UNOPS_LOTS, buildUnopsExperienceAudit, evaluateExperience };

