"use strict";

const crypto = require("crypto");
const path = require("path");
const { extractTenderDocument, sanitizeFilename } = require("./tender-response-documents");

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const OFFICIAL_HOSTS = new Set([
  "un.org", "www.un.org", "ungm.org", "www.ungm.org",
  "afdb.org", "www.afdb.org", "worldbank.org", "www.worldbank.org",
  "documents1.worldbank.org", "unicef.org", "www.unicef.org",
  "undp.org", "www.undp.org", "unops.org", "www.unops.org"
]);

function sourceError(message, code) {
  return Object.assign(new Error(message), { code });
}

function officialUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw sourceError("L'URL du document officiel est invalide.", "TENDER_SOURCE_INVALID");
  }
  if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw sourceError("Le document doit provenir d'une source officielle autorisee.", "TENDER_SOURCE_NOT_ALLOWED");
  }
  return url;
}

function filenameFor(url, contentType) {
  const fromUrl = sanitizeFilename(path.basename(url.pathname));
  if (/\.(pdf|docx|zip)$/i.test(fromUrl)) return fromUrl;
  if (String(contentType).includes("pdf")) return `${fromUrl || "dao"}.pdf`;
  if (String(contentType).includes("wordprocessingml")) return `${fromUrl || "dao"}.docx`;
  if (String(contentType).includes("zip")) return `${fromUrl || "dao"}.zip`;
  throw sourceError("Le document officiel n'est ni un PDF, ni un DOCX, ni un ZIP.", "TENDER_SOURCE_UNSUPPORTED");
}

async function retrieveOfficialDocument(sourceUrl, options = {}) {
  const requested = officialUrl(sourceUrl);
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetchImpl(requested, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "LILOTOP-NEXUS-AI/1.0 (document retrieval)" }
    });
  } catch (cause) {
    throw Object.assign(sourceError("Le document officiel n'a pas pu etre telecharge.", "TENDER_SOURCE_FETCH_FAILED"), { cause });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw sourceError(`Le document officiel a retourne HTTP ${response.status}.`, "TENDER_SOURCE_FETCH_FAILED");
  }
  const finalUrl = officialUrl(response.url || requested.href).href;
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_DOCUMENT_BYTES) {
    throw sourceError("Le document officiel depasse la limite de 4 Mo.", "TENDER_SOURCE_TOO_LARGE");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw sourceError("Le document officiel est vide ou depasse la limite de 4 Mo.", "TENDER_SOURCE_TOO_LARGE");
  }
  const mimeType = String(response.headers.get("content-type") || "application/octet-stream").split(";")[0];
  const filename = filenameFor(new URL(finalUrl), mimeType);
  const extracted = await extractTenderDocument({ filename, buffer });
  return {
    sourceUrl: requested.href,
    finalUrl,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    extractedText: extracted.text,
    files: extracted.files,
    buffer
  };
}

function officialDocumentUrls(opportunity = {}) {
  const raw = opportunity.rawData || {};
  const values = Array.isArray(raw.documentUrls) ? raw.documentUrls : [];
  return [...new Set(values.map((item) => typeof item === "string" ? item : item?.url).filter(Boolean))].slice(0, 8);
}

module.exports = { MAX_DOCUMENT_BYTES, OFFICIAL_HOSTS, officialDocumentUrls, officialUrl, retrieveOfficialDocument };
