"use strict";

const AdmZip = require("adm-zip");

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e\n]/g, "");
}

function pdfEscape(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function wrap(value, width = 92) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= width) line = line ? `${line} ${word}` : word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function layoutPages(items) {
  const pages = [];
  let page = [];
  let y = 760;
  const nextPage = () => {
    if (page.length) pages.push(page);
    page = [];
    y = 760;
  };
  for (const item of items) {
    const size = item.size || 10;
    const leading = item.leading || size + 4;
    const lines = wrap(item.text, item.width || Math.max(54, Math.round(96 * 10 / size)));
    const needed = (item.before || 0) + lines.length * leading + (item.after || 0);
    if (y - needed < 58) nextPage();
    y -= item.before || 0;
    for (const line of lines) {
      page.push({ ...item, text: line, y });
      y -= leading;
    }
    y -= item.after || 0;
  }
  nextPage();
  return pages;
}

function simplePdf(title, items) {
  const pages = layoutPages(items);
  const objects = [];
  const setObject = (id, value) => { objects[id] = value; };
  const pageRefs = pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ");
  setObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  setObject(2, `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
  setObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const commands = [
      "0.043 0.122 0.200 rg 0 792 595 50 re f",
      `BT /F2 14 Tf 1 1 1 rg 45 812 Td (${pdfEscape(title)}) Tj ET`,
      ...page.map((line) => {
        const font = line.bold ? "F2" : "F1";
        const color = line.color || (line.bold ? "0.043 0.122 0.200" : "0.18 0.24 0.29");
        return `BT /${font} ${line.size || 10} Tf ${color} rg 50 ${line.y} Td (${pdfEscape(line.text)}) Tj ET`;
      }),
      `BT /F1 8 Tf 0.38 0.44 0.49 rg 50 32 Td (LILOTOP SARL - Internal DG review - Page ${index + 1}/${pages.length}) Tj ET`
    ].join("\n");
    setObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    setObject(contentId, `<< /Length ${Buffer.byteLength(commands, "latin1")} >>\nstream\n${commands}\nendstream`);
  });
  let body = "%PDF-1.4\n%NEXUS\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function textSection(title, rows) {
  return [`${title}\n${"=".repeat(title.length)}`, ...rows, ""].join("\n");
}

function buildUnecaEoiArtifacts(submission) {
  const items = [
    { text: "EOI RESPONSE PACKAGE - DG REVIEW", bold: true, size: 18, before: 8, after: 12 },
    { text: submission.subject, bold: true, size: 13, after: 8 },
    { text: `Reference: ${submission.reference}`, bold: true, size: 11, after: 4 },
    { text: `Deadline: ${submission.deadline}`, bold: true, size: 11, after: 14 },
    { text: "IMPORTANT", bold: true, size: 12, color: "0.64 0.40 0.08", after: 4 },
    { text: "Internal validation package only. The official response is the electronic Express interest action on UNGM. No document upload is required by this EOI at this stage.", after: 14 },
    { text: "1. VENDOR RESPONSE INFORMATION", bold: true, size: 13, before: 6, after: 6 },
    ...submission.responseFields.map(([label, value]) => ({ text: `${label}: ${value}`, bold: /DG TO VALIDATE/.test(value), after: 2 })),
    { text: "2. EXPRESSION OF INTEREST DRAFT", bold: true, size: 13, before: 10, after: 6 },
    ...submission.letter.split("\n").filter(Boolean).map((text) => ({ text, after: 4 })),
    { text: "3. ELIGIBILITY DECLARATIONS A-F", bold: true, size: 13, before: 10, after: 6 },
    ...submission.eligibility.map((item) => ({ text: `${item.key}. ${item.declarationDraft} Status: DG TO CONFIRM.`, after: 5 })),
    { text: "4. LINE-BY-LINE CONTROL", bold: true, size: 13, before: 10, after: 6 },
    ...submission.control.map((item) => ({ text: `${item.status} - ${item.label}: ${item.action}`, after: 4 })),
    { text: "5. EMAIL FALLBACK DRAFT", bold: true, size: 13, before: 10, after: 6 },
    ...submission.emailDraft.split("\n").filter(Boolean).map((text) => ({ text, after: 4 })),
    { text: "6. DOCUMENTS REQUIRED BY THIS EOI", bold: true, size: 13, before: 10, after: 6 },
    { text: "None at this stage. Page 2 states that no document needs to be submitted. Do not attach unsolicited documents.", after: 8 }
  ];
  const pdf = simplePdf("UNECA EOIUNECA24536", items);
  const vendorResponse = textSection("VENDOR RESPONSE INFORMATION", submission.responseFields.map(([label, value]) => `${label}: ${value}`));
  const declarations = textSection("ELIGIBILITY DECLARATIONS A-F", submission.eligibility.map((item) => `${item.key}. ${item.declarationDraft}\nStatus: DG TO CONFIRM`));
  const control = textSection("LINE-BY-LINE CONTROL", submission.control.map((item) => `${item.status} | ${item.label} | ${item.action}`));
  const readme = [
    "UNECA EOIUNECA24536 - INTERNAL DG REVIEW PACKAGE",
    "Official submission channel: UNGM electronic Express interest.",
    `Deadline: ${submission.deadline}`,
    "No document upload is required at this EOI stage.",
    "This ZIP is for internal review only and must not be submitted automatically.",
    "No supplier was contacted and no price was generated."
  ].join("\n");
  const zip = new AdmZip();
  zip.addFile("UNECA-EOIUNECA24536-DG-Review.pdf", pdf);
  zip.addFile("01-Vendor-Response-Information.txt", Buffer.from(vendorResponse, "utf8"));
  zip.addFile("02-Expression-of-Interest-Draft.txt", Buffer.from(submission.letter, "utf8"));
  zip.addFile("03-Eligibility-Declarations-A-F.txt", Buffer.from(declarations, "utf8"));
  zip.addFile("04-Line-by-Line-Control.txt", Buffer.from(control, "utf8"));
  zip.addFile("05-Email-Fallback-Draft.txt", Buffer.from(submission.emailDraft, "utf8"));
  zip.addFile("README.txt", Buffer.from(readme, "utf8"));
  return { pdf, zip: zip.toBuffer(), extractedText: items.map((item) => item.text).join("\n") };
}

module.exports = { buildUnecaEoiArtifacts, simplePdf };
