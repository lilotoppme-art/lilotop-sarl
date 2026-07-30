"use strict";

const crypto = require("crypto");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".zip"]);

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
    throw vaultError("Format non pris en charge. Utilisez PDF, DOCX, XLSX ou ZIP.", "UNSUPPORTED_DOCUMENT");
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

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseVaultUpload,
  prepareVaultFile,
  sanitizeFilename
};
