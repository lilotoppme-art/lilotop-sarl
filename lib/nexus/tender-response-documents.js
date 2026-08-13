"use strict";

const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const MAX_EXTRACTED_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_TEXT = 120000;
const MAX_ZIP_ENTRIES = 20;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".zip"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv"]);

function error(message, code) {
  return Object.assign(new Error(message), { code });
}

function sanitizeFilename(filename) {
  const clean = path.basename(String(filename || "document"))
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .slice(0, 180);
  return clean || "document";
}

function extension(filename) {
  return path.extname(sanitizeFilename(filename)).toLowerCase();
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
      throw error("Le fichier dépasse la taille maximale autorisée de 4 Mo.", "UPLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
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
  const delimiter = `--${boundary}`;
  for (const part of raw.toString("latin1").split(delimiter)) {
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
      if (index === -1) continue;
      headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
    }
    const disposition = parseContentDisposition(headers["content-disposition"]);
    if (!disposition.name) continue;
    if (disposition.filename) {
      files.push({
        fieldName: disposition.name,
        filename: sanitizeFilename(disposition.filename),
        contentType: String(headers["content-type"] || "").slice(0, 160),
        buffer: Buffer.from(content, "latin1")
      });
    } else {
      fields[disposition.name] = Buffer.from(content, "latin1").toString("utf8").trim();
    }
  }
  return { fields, files };
}

async function parseUploadRequest(req) {
  const contentType = String(req.headers?.["content-type"] || "");
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  if (!contentType.includes("multipart/form-data") || !boundary) {
    throw error("Un formulaire multipart avec un document est requis.", "VALIDATION_ERROR");
  }
  const parsed = parseMultipart(await readRawBody(req), boundary);
  if (parsed.files.length !== 1) {
    throw error("Importez exactement un fichier PDF, DOCX ou ZIP.", "VALIDATION_ERROR");
  }
  const file = parsed.files[0];
  if (!file.buffer.length || file.buffer.length > MAX_UPLOAD_BYTES) {
    throw error("Le fichier est vide ou dépasse la taille maximale autorisée de 4 Mo.", "UPLOAD_TOO_LARGE");
  }
  if (!ALLOWED_EXTENSIONS.has(extension(file.filename))) {
    throw error("Format non pris en charge. Utilisez PDF, DOCX ou ZIP.", "UNSUPPORTED_DOCUMENT");
  }
  return { fields: parsed.fields, file };
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT);
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function extractSpreadsheetXml(buffer) {
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory
    && (/^xl\/worksheets\/.*\.xml$/i.test(entry.entryName) || entry.entryName === "xl/sharedStrings.xml"));
  const parts = entries.map((entry) => {
    const text = entry.getData().toString("utf8")
      .replace(/<\/row>/gi, "\n")
      .replace(/<\/c>/gi, " | ")
      .replace(/<\/si>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    return `FEUILLE XML: ${entry.entryName}\n${decodeXmlText(text)}`;
  });
  return normalizeExtractedText(parts.join("\n\n"));
}

async function extractSingle(filename, buffer) {
  const ext = extension(filename);
  if (ext === ".pdf") {
    const parsed = await pdfParse(buffer);
    return normalizeExtractedText(parsed.text);
  }
  if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(parsed.value);
  }
  if (ext === ".xlsx") {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const lines = [];
      workbook.eachSheet((worksheet) => {
        lines.push(`FEUILLE: ${worksheet.name}`);
        worksheet.eachRow((row) => {
          const values = [];
          row.eachCell({ includeEmpty: false }, (cell) => {
            const value = cell.text || cell.value;
            if (value !== null && value !== undefined && String(value).trim()) values.push(String(value).trim());
          });
          if (values.length) lines.push(values.join(" | "));
        });
      });
      return normalizeExtractedText(lines.join("\n"));
    } catch {
      return extractSpreadsheetXml(buffer);
    }
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return normalizeExtractedText(buffer.toString("utf8"));
  }
  return "";
}

async function extractZip(file) {
  let archive;
  try {
    archive = new AdmZip(file.buffer);
  } catch (cause) {
    throw Object.assign(error("L'archive ZIP est invalide ou illisible.", "DOCUMENT_PARSE_ERROR"), { cause });
  }
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length || entries.length > MAX_ZIP_ENTRIES) {
    throw error(`Le ZIP doit contenir entre 1 et ${MAX_ZIP_ENTRIES} fichiers.`, "VALIDATION_ERROR");
  }

  const parts = [];
  const files = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const filename = sanitizeFilename(entry.entryName);
    const ext = extension(filename);
    if (![...ALLOWED_EXTENSIONS].filter((item) => item !== ".zip").includes(ext)
      && !TEXT_EXTENSIONS.has(ext)) {
      continue;
    }
    const buffer = entry.getData();
    totalBytes += buffer.length;
    if (totalBytes > MAX_EXTRACTED_BYTES) {
      throw error("Le contenu décompressé dépasse la limite de sécurité.", "UPLOAD_TOO_LARGE");
    }
    const text = await extractSingle(filename, buffer);
    files.push({ filename, extension: ext, bytes: buffer.length, extracted: Boolean(text) });
    if (text) parts.push(`### FICHIER: ${filename}\n${text}`);
  }
  if (!parts.length) {
    throw error("Le ZIP ne contient aucun PDF, DOCX, TXT, MD ou CSV exploitable.", "DOCUMENT_PARSE_ERROR");
  }
  return { text: normalizeExtractedText(parts.join("\n\n")), files };
}

async function extractTenderDocument(file) {
  try {
    const ext = extension(file.filename);
    const extracted = ext === ".zip"
      ? await extractZip(file)
      : {
        text: await extractSingle(file.filename, file.buffer),
        files: [{
          filename: file.filename,
          extension: ext,
          bytes: file.buffer.length,
          extracted: true
        }]
      };
    if (!extracted.text) {
      throw error("Aucun texte exploitable n'a été extrait du document.", "DOCUMENT_PARSE_ERROR");
    }
    return {
      sourceFilename: file.filename,
      sourceType: ext.slice(1),
      files: extracted.files,
      text: extracted.text
    };
  } catch (cause) {
    if (cause.code) throw cause;
    throw Object.assign(error("Le document n'a pas pu être analysé.", "DOCUMENT_PARSE_ERROR"), { cause });
  }
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  extractTenderDocument,
  parseUploadRequest,
  sanitizeFilename
};
