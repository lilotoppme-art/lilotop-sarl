"use strict";

const AdmZip = require("adm-zip");

function text(value) {
  return String(value || "").trim();
}

function list(title, items = []) {
  return [`# ${title}`, "", ...(items.length ? items.map((item) => `- ${text(item)}`) : ["- Aucun élément"])].join("\n");
}

function addText(zip, filename, content) {
  zip.addFile(filename, Buffer.from(`${text(content)}\n`, "utf8"));
}

function buildExportArchive(analysis) {
  const zip = new AdmZip();
  const info = analysis.keyInformation || {};
  const documents = analysis.generatedDocuments || {};
  addText(zip, "00-RESUME-EXECUTIF.md", [
    "# Résumé exécutif",
    "",
    analysis.executiveSummary,
    "",
    `- Objet : ${text(info.subject)}`,
    `- Client : ${text(info.client)}`,
    `- Pays : ${text(info.country)}`,
    `- Date limite : ${text(info.deadline)}`,
    `- Budget : ${text(info.budget)}`,
    `- Conformité : ${analysis.compliance?.compliancePercent || 0}%`,
    "",
    "> DOSSIER BROUILLON - VALIDATION HUMAINE OBLIGATOIRE AVANT SOUMISSION"
  ].join("\n"));
  addText(zip, "01-LETTRE-DE-SOUMISSION-BROUILLON.md", documents.submissionLetter);
  addText(zip, "02-OFFRE-TECHNIQUE-BROUILLON.md", documents.technicalOffer);
  addText(zip, "03-OFFRE-FINANCIERE-MODELE.md", documents.financialOfferTemplate);
  addText(zip, "04-CHECKLIST-CONFORMITE.md", list("Checklist de conformité", documents.complianceChecklist));
  addText(zip, "05-PLANNING-EXECUTION.md", list("Planning d'exécution", documents.executionPlan));
  addText(zip, "06-PIECES-JOINTES.md", list("Liste des pièces jointes", documents.attachmentsList));
  addText(zip, "07-RISQUES-ET-ACTIONS.md", [
    list("Risques", analysis.risks),
    "",
    list("Actions recommandées", analysis.recommendedActions)
  ].join("\n"));
  return zip.toBuffer();
}

module.exports = { buildExportArchive };
