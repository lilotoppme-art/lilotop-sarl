"use strict";

const AdmZip = require("adm-zip");

function xml(value) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function paragraph(text, { bold = false, size = 22, color = "243746", after = 120 } = {}) {
  return `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function simpleDocx({ title, subtitle, paragraphs }) {
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`));
  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`));
  zip.addFile("docProps/core.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>${xml(title)}</dc:title><dc:creator>LILOTOP NEXUS AI</dc:creator><dc:description>Brouillon interne soumis a validation humaine.</dc:description>
</cp:coreProperties>`));
  const body = [
    paragraph(title, { bold: true, size: 32, color: "0B1F33", after: 80 }),
    paragraph(subtitle, { bold: true, size: 20, color: "A47C2C", after: 280 }),
    ...paragraphs.map((item) => paragraph(item.text, item))
  ].join("");
  zip.addFile("word/document.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/></w:sectPr></w:body></w:document>`));
  return zip.toBuffer();
}

function organizationChartDraftDocx() {
  return simpleDocx({
    title: "Organigramme LILOTOP SARL",
    subtitle: "BROUILLON - A VALIDER PAR LA DIRECTION GENERALE",
    paragraphs: [
      { text: "Direction Generale", bold: true, size: 24, color: "0B1F33", after: 80 },
      { text: "Joel Kongolo - Founder & Chief Executive Officer (CEO)", size: 22, after: 260 },
      { text: "Fonction : A COMPLETER | Titulaire : A COMPLETER", bold: true, size: 21, after: 160 },
      { text: "Fonction : A COMPLETER | Titulaire : A COMPLETER", bold: true, size: 21, after: 160 },
      { text: "Fonction : A COMPLETER | Titulaire : A COMPLETER", bold: true, size: 21, after: 160 },
      { text: "Fonction : A COMPLETER | Titulaire : A COMPLETER", bold: true, size: 21, after: 300 },
      { text: "Aucun nom ni poste non confirme n'a ete ajoute. Ce document ne doit pas etre joint a une soumission avant validation de la Direction Generale.", size: 19, color: "596A78" }
    ]
  });
}

module.exports = { organizationChartDraftDocx, simpleDocx };
