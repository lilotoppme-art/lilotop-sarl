"use strict";

const crypto = require("crypto");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png", ".zip"]);

function vaultError(message, code) {
  return Object.assign(new Error(message), { code });
}

function sanitizeFilename(value) {
  return path.basename(String(value || "document"))
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .slice(0, 180) || "document";
}

function extension(value) {
  return path.extname(sanitizeFilename(value)).toLowerCase();
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "binary");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw vaultError("Le fichier dépasse la taille maximale autorisée de 3 Mo.", "UPLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseDisposition(value) {
  const result = {};
  for (const part of String(value || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || !rawValue.length) continue;
    result[rawKey.toLowerCase()] = rawValue.join("=").replace(/^"|"$/g, "");
  }
  return result;
}

function parseMultipart(raw, boundary) {
  const fields = {};
  const files = [];
  for (const part of raw.toString("latin1").split(`--${boundary}`)) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const rawHeaders = part.slice(0, headerEnd).trim();
    let content = part.slice(headerEnd + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    if (content.endsWith("--")) content = content.slice(0, -2);
    const headers = {};
    for (const line of rawHeaders.split("\r\n")) {
      const index = line.indexOf(":");
      if (index !== -1) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
    }
    const disposition = parseDisposition(headers["content-disposition"]);
    if (!disposition.name) continue;
    if (disposition.filename) {
      files.push({
        filename: sanitizeFilename(disposition.filename),
        contentType: String(headers["content-type"] || "application/octet-stream").slice(0, 160),
        buffer: Buffer.from(content, "latin1")
      });
    } else {
      fields[disposition.name] = Buffer.from(content, "latin1").toString("utf8").trim();
    }
  }
  return { fields, files };
}

async function parseVaultUpload(req) {
  const contentType = String(req.headers?.["content-type"] || "");
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  if (!contentType.includes("multipart/form-data") || !boundary) {
    throw vaultError("Un formulaire multipart est requis.", "VALIDATION_ERROR");
  }
  const parsed = parseMultipart(await readRawBody(req), boundary);
  if (parsed.files.length !== 1) {
    throw vaultError("Importez exactement un fichier.", "VALIDATION_ERROR");
  }
  const file = parsed.files[0];
  if (!file.buffer.length || file.buffer.length > MAX_UPLOAD_BYTES) {
    throw vaultError("Le fichier est vide ou dépasse la limite de 3 Mo.", "UPLOAD_TOO_LARGE");
  }
  if (!ALLOWED_EXTENSIONS.has(extension(file.filename))) {
    throw vaultError("Format non pris en charge. Utilisez PDF, DOCX, XLSX, JPG, JPEG, PNG ou ZIP.", "UNSUPPORTED_DOCUMENT");
  }
  return { fields: parsed.fields, file };
}

function normalizePreview(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, 20000);
}

async function xlsxPreview(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const lines = [];
  workbook.eachSheet((sheet) => {
    lines.push(`Feuille: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (lines.length >= 220) return;
      lines.push(row.values.slice(1).map((cell) => {
        if (cell && typeof cell === "object") return cell.text || cell.result || JSON.stringify(cell);
        return cell ?? "";
      }).join(" | "));
    });
  });
  return normalizePreview(lines.join("\n"));
}

async function buildPreview(file) {
  const ext = extension(file.filename);
  try {
    if (ext === ".pdf") return normalizePreview((await pdfParse(file.buffer)).text);
    if (ext === ".docx") return normalizePreview((await mammoth.extractRawText({ buffer: file.buffer })).value);
    if (ext === ".xlsx") return xlsxPreview(file.buffer);
    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      return "Image originale conservee. Les informations non lisibles automatiquement restent A CONFIRMER.";
    }
    if (ext === ".zip") {
      const entries = new AdmZip(file.buffer).getEntries()
        .filter((entry) => !entry.isDirectory)
        .slice(0, 100)
        .map((entry) => `${entry.entryName} · ${entry.header.size} octets`);
      return normalizePreview(`Contenu de l'archive (${entries.length} fichier(s))\n${entries.join("\n")}`);
    }
  } catch (cause) {
    throw Object.assign(vaultError("Le fichier est illisible ou endommagé.", "DOCUMENT_PARSE_ERROR"), { cause });
  }
  return "";
}

async function prepareVaultFile(file) {
  const ext = extension(file.filename).slice(1);
  const mimeTypes = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    zip: "application/zip"
  };
  return {
    sourceFilename: file.filename,
    extension: ext,
    mimeType: mimeTypes[ext] || file.contentType,
    fileSize: file.buffer.length,
    sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    buffer: file.buffer,
    previewText: await buildPreview(file)
  };
}

const CATEGORY_RULES = Object.freeze([
  ["01-legal-identity", /\b(rccm|id\s*nat|identification nationale|nif|statuts?|acte constitutif)\b/i],
  ["02-compliance", /\b(arsp|fiscal|cnss|inpp|licen[cs]e|agr[ée]ment|hse|attestation)\b/i],
  ["03-bank-finance", /\b(banque|bancaire|financier|bilan|garantie|tr[ée]sorerie)\b/i],
  ["04-experience-references", /\b(contrat|purchase order|bon de commande|\bpo\b|livraison|bonne ex[ée]cution|facture|r[ée]f[ée]rence client)\b/i],
  ["05-lilotop-organization", /\b(organigramme|curriculum|\bcv\b|pouvoir|d[ée]l[ée]gation|profil soci[ée]t[ée])\b/i],
  ["06-suppliers-partners", /\b(oem|fabricant|distributeur|partenaire|certification|catalogue|datasheet|fiche technique)\b/i]
]);

function isoDate(year, month, day) {
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(value.getTime()) || value.getUTCFullYear() !== Number(year)
    || value.getUTCMonth() !== Number(month) - 1 || value.getUTCDate() !== Number(day)) return "";
  return value.toISOString().slice(0, 10);
}

function extractDates(text) {
  const values = [];
  const pattern = /\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b|\b(0?[1-9]|[12]\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](20\d{2})\b/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const value = match[1]
      ? isoDate(match[1], match[2], match[3])
      : isoDate(match[6], match[5], match[4]);
    if (value && !values.includes(value)) values.push(value);
  }
  return values.slice(0, 12);
}

function matchingLine(text, pattern) {
  return String(text || "").split(/\r?\n/)
    .map((line) => line.trim()).find((line) => pattern.test(line))?.slice(0, 300) || "";
}

function valueAfterLabel(text, labels) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(text || "").match(new RegExp(`(?:${escaped})\\s*[:#-]?\\s*([^\\n\\r]{2,180})`, "i"));
  return match?.[1]?.trim() || "";
}

function analyzeVaultDocument(file, input = {}) {
  const searchable = `${file.sourceFilename}\n${input.title || ""}\n${file.previewText || ""}`.slice(0, 50000);
  const content = String(file.previewText || "").slice(0, 50000);
  const categoryCode = CATEGORY_RULES.find(([, pattern]) => pattern.test(searchable))?.[0] || "07-other";
  const dates = extractDates(searchable);
  const expiryLine = matchingLine(searchable, /expir|valid(?:e|it[ée])\s*(?:jusqu|au)|expiry/i);
  const expiryDates = extractDates(expiryLine);
  const issueLine = matchingLine(searchable, /d[ée]livr|[ée]mis|issue date|date du document/i);
  const issueDates = extractDates(issueLine);
  const reference = valueAfterLabel(content, ["reference", "référence", "numero", "numéro", "contract no", "po no"]);
  const authority = valueAfterLabel(content, ["autorité", "authority", "client", "customer", "émis par", "issued by"]);
  const isExperience = categoryCode === "04-experience-references";
  const experience = isExperience ? {
    client: valueAfterLabel(content, ["client", "customer", "acheteur", "buyer"]),
    subject: valueAfterLabel(content, ["objet", "subject", "description"]),
    sector: valueAfterLabel(content, ["secteur", "sector"]),
    productsServices: valueAfterLabel(content, ["produits", "products", "services", "fournitures", "goods"]),
    contractNumber: reference,
    date: issueDates[0] || dates[0] || "",
    executionPeriod: valueAfterLabel(content, ["période d'exécution", "execution period", "delivery period"]),
    value: valueAfterLabel(content, ["valeur", "value", "montant", "amount"]),
    currency: (searchable.match(/\b(USD|EUR|CDF|ZAR|GBP|MWK)\b/i)?.[1] || "").toUpperCase(),
    country: valueAfterLabel(content, ["pays", "country"]),
    executionStatus: valueAfterLabel(content, ["statut d'exécution", "execution status", "status"]),
    clientContact: valueAfterLabel(content, ["contact client", "client contact", "contact person"]),
    deliveryProofAvailable: /preuve de livraison|delivery note|delivery certificate/i.test(searchable),
    performanceCertificateAvailable: /bonne ex[ée]cution|performance certificate|completion certificate/i.test(searchable)
  } : null;
  return {
    categoryCode,
    documentType: file.extension.toUpperCase(),
    reference,
    issuingAuthority: authority,
    issuedOn: issueDates[0] || dates[0] || "",
    expiresOn: expiryDates[0] || "",
    source: input.source || "Import DG",
    needsConfirmation: !reference || !authority || (isExperience && (!experience.client || !experience.subject)),
    experience
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseVaultUpload,
  prepareVaultFile,
  analyzeVaultDocument,
  sanitizeFilename
};
