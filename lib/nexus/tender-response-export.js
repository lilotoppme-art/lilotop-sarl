"use strict";

const AdmZip = require("adm-zip");

function text(value) {
  return String(value || "").trim();
}

function list(title, items = []) {
  return [`# ${title}`, "", ...(items.length ? items.map((item) => `- ${text(item)}`) : ["- Aucun element"])].join("\n");
}

function addText(zip, filename, content) {
  zip.addFile(filename, Buffer.from(`${text(content)}\n`, "utf8"));
}

function buildExportArchive(analysis) {
  const zip = new AdmZip();
  const info = analysis.keyInformation || {};
  const documents = analysis.generatedDocuments || {};
  addText(zip, "00-RESUME-EXECUTIF.md", [
    "# Resume executif", "", analysis.executiveSummary, "",
    `- Objet : ${text(info.subject)}`,
    `- Client : ${text(info.client)}`,
    `- Organisme : ${text(info.organization)}`,
    `- Numero DAO : ${text(info.tenderNumber)}`,
    `- Pays : ${text(info.country)}`,
    `- Date limite : ${text(info.deadline)}`,
    `- Budget : ${text(info.budget)}`,
    `- Conformite : ${analysis.compliance?.compliancePercent || 0}%`, "",
    "> DOSSIER BROUILLON - VALIDATION HUMAINE OBLIGATOIRE AVANT SOUMISSION"
  ].join("\n"));
  addText(zip, "01-LETTRE-DE-SOUMISSION-BROUILLON.md", documents.submissionLetter);
  addText(zip, "02-OFFRE-TECHNIQUE-BROUILLON.md", documents.technicalOffer);
  addText(zip, "03-OFFRE-FINANCIERE-MODELE.md", documents.financialOfferTemplate);
  addText(zip, "04-CHECKLIST-CONFORMITE.md", list("Checklist de conformite", documents.complianceChecklist));
  addText(zip, "05-TABLEAU-CONFORMITE.md", list("Tableau de conformite", documents.conformityTable));
  addText(zip, "06-PLANNING-EXECUTION.md", list("Planning d'execution", documents.executionPlan));
  addText(zip, "07-PIECES-JOINTES.md", list("Liste des pieces jointes", documents.attachmentsList));
  addText(zip, "08-RISQUES-ET-ACTIONS.md", [
    list("Risques", analysis.risks), "", list("Actions recommandees", analysis.recommendedActions)
  ].join("\n"));
  return zip.toBuffer();
}

function ascii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/[()\\]/g, (character) => `\\${character}`);
}

function buildPdfExport(analysis) {
  const eol = "\r\n";
  const info = analysis.keyInformation || {};
  const documents = analysis.generatedDocuments || {};
  const lines = [
    "LILOTOP SARL - DOSSIER DE REPONSE AO (BROUILLON)",
    `Objet: ${info.subject || "A confirmer"}`,
    `Client: ${info.client || "A confirmer"}`,
    `Numero DAO: ${info.tenderNumber || "A confirmer"}`,
    `Date limite: ${info.deadline || "A confirmer"}`,
    `Conformite: ${analysis.compliance?.compliancePercent || 0}%`, "",
    "RESUME EXECUTIF", analysis.executiveSummary, "",
    "LETTRE DE SOUMISSION", documents.submissionLetter, "",
    "OFFRE TECHNIQUE", documents.technicalOffer, "",
    "OFFRE FINANCIERE - MODELE SANS PRIX INVENTE", documents.financialOfferTemplate, "",
    "VALIDATION HUMAINE OBLIGATOIRE AVANT TOUT ENVOI"
  ].flatMap((line) => String(line || "").split(/\r?\n/)).flatMap((line) => {
    const chunks = line.match(/.{1,95}(?:\s|$)/g);
    return chunks?.map((chunk) => chunk.trim()) || [""];
  });
  const pages = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  const objects = [null, null, null];
  const pageIds = [];
  pages.forEach((pageLines) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    const commands = pageLines.map((line) => `(${ascii(line)}) Tj T*`).join(eol);
    const stream = `BT /F1 9 Tf 48 794 Td 13 TL${eol}${commands}${eol}ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>${eol}stream${eol}${stream}${eol}endstream`);
  });
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let pdf = `%PDF-1.4${eol}%LILOTOP${eol}`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj${eol}${object}${eol}endobj${eol}`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref${eol}0 ${objects.length + 1}${eol}0000000000 65535 f ${eol}`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n ${eol}`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>${eol}startxref${eol}${xref}${eol}%%EOF${eol}`;
  return Buffer.from(pdf, "ascii");
}

module.exports = { buildExportArchive, buildPdfExport };
