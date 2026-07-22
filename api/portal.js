const { recipientFor } = require("../lib/email/config");
const { sendWebsiteEmail, jsonError } = require("../lib/email/sendWebsiteEmail");
const radarStore = require("../lib/business-radar/store");

const MAX_FILES = 5;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 8 * 1024 * 1024;
const MAX_BODY_SIZE = 9 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const rateStore = new Map();

const portalTypes = new Set(["supplier", "partnership", "tender"]);
const allowedExtensions = new Set([".pdf", ".xls", ".xlsx", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);
const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

function clean(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()] || req.headers[name];
  return Array.isArray(value) ? value[0] : value || "";
}

function getClientIp(req) {
  return clean(getHeader(req, "x-forwarded-for").split(",")[0] || req.socket?.remoteAddress || "unknown", 80);
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateStore.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
  entry.count += 1;
  rateStore.set(ip, entry);
  return entry.count > RATE_MAX;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_SIZE) {
      const error = new Error("Request body too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
  const result = {};
  for (const part of value.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || !rawValue.length) continue;
    result[rawKey.toLowerCase()] = rawValue.join("=").replace(/^"|"$/g, "");
  }
  return result;
}

function addField(fields, name, value) {
  if (fields[name] === undefined) {
    fields[name] = value;
  } else if (Array.isArray(fields[name])) {
    fields[name].push(value);
  } else {
    fields[name] = [fields[name], value];
  }
}

function sanitizeFilename(filename) {
  return clean(filename, 160).replace(/[\\/:*?"<>|]/g, "-") || "document";
}

function parseMultipart(raw, boundary) {
  const fields = {};
  const files = [];
  const parts = raw.toString("latin1").split(`--${boundary}`);

  for (const part of parts) {
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
    const disposition = parseContentDisposition(headers["content-disposition"] || "");
    if (!disposition.name) continue;

    if (disposition.filename) {
      const buffer = Buffer.from(content, "latin1");
      if (!buffer.length) continue;
      files.push({
        filename: sanitizeFilename(disposition.filename),
        contentType: clean(headers["content-type"], 120),
        buffer,
      });
    } else {
      addField(fields, disposition.name, Buffer.from(content, "latin1").toString("utf8").trim());
    }
  }

  return { fields, files };
}

async function parseRequest(req) {
  if (typeof req.body === "object" && req.body && !Buffer.isBuffer(req.body)) return { fields: req.body, files: [] };
  const contentType = getHeader(req, "content-type");
  const raw = await readRawBody(req);
  if (contentType.includes("multipart/form-data")) {
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const boundary = match?.[1] || match?.[2];
    if (!boundary) throw new Error("Missing multipart boundary");
    return parseMultipart(raw, boundary);
  }
  const text = raw.toString("utf8");
  return { fields: text ? JSON.parse(text) : {}, files: [] };
}

function fileExtension(filename) {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

function validateFiles(files) {
  const errors = [];
  if (files.length > MAX_FILES) errors.push("files_count");
  let total = 0;
  for (const file of files) {
    total += file.buffer.length;
    if (!allowedExtensions.has(fileExtension(file.filename))) errors.push(`file_type:${file.filename}`);
    if (file.contentType && !allowedTypes.has(file.contentType)) errors.push(`file_mime:${file.filename}`);
    if (file.buffer.length > MAX_FILE_SIZE) errors.push(`file_size:${file.filename}`);
  }
  if (total > MAX_TOTAL_FILE_SIZE) errors.push("files_total_size");
  return errors;
}

function makeReference(type, now = new Date()) {
  const prefix = { supplier: "SUP", partnership: "PART", tender: "TND" }[type] || "PRT";
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 160)).filter(Boolean);
  const cleaned = clean(value, 160);
  return cleaned ? [cleaned] : [];
}

function normalize(fields, reference, submittedAt) {
  const portalType = clean(fields.portalType, 40);
  const data = {
    portalType,
    reference,
    submittedAt,
    consent: fields.consent === true || fields.consent === "on" || fields.consent === "true",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "documents" || key === "website" || key === "consent") continue;
    data[key] = Array.isArray(value) ? asArray(value) : clean(value, key === "summary" || key === "capacity" || key === "references" ? 6000 : 400);
  }
  data.categories = asArray(fields.categories);
  return data;
}

function requiredFields(type) {
  if (type === "supplier") {
    return ["company", "country", "city", "contactName", "position", "email", "phone", "servedAreas", "capacity", "leadTime", "incoterms", "currencies", "interest"];
  }
  if (type === "partnership") {
    return ["company", "country", "contactName", "position", "email", "phone", "partnershipType", "sector", "targetMarket", "summary"];
  }
  return ["organization", "country", "contactName", "email", "phone", "tenderReference", "subject", "sector", "deadline", "summary"];
}

function validateData(data) {
  const errors = [];
  if (!portalTypes.has(data.portalType)) return ["portalType"];
  for (const field of requiredFields(data.portalType)) {
    if (!data[field]) errors.push(field);
  }
  if (!isEmail(data.email)) errors.push("email");
  if (data.portalType === "supplier" && !data.categories.length) errors.push("categories");
  if ((data.summary && data.summary.length < 20) || (data.capacity && data.capacity.length < 10)) errors.push("details");
  if (!data.consent) errors.push("consent");
  return errors;
}

function subjectFor(data) {
  if (data.portalType === "supplier") return `[FOURNISSEUR LILOTOP] - ${data.company} - ${data.country}`;
  if (data.portalType === "partnership") return `[PARTENARIAT LILOTOP] - ${data.company} - ${data.partnershipType} - ${data.country}`;
  return `[TENDER LILOTOP] - ${data.tenderReference} - ${data.organization} - ${data.deadline}`;
}

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function structuredSubmission(data, files) {
  return {
    reference: data.reference,
    submittedAt: data.submittedAt,
    portalType: data.portalType,
    fields: data,
    documents: files.map((file) => ({ filename: file.filename, contentType: file.contentType, size: file.buffer.length })),
    automationReady: {
      aiQualification: "prepared_not_connected",
      odooCrm: "prepared_not_connected",
      odooPurchase: data.portalType === "supplier" ? "prepared_not_connected" : "not_applicable",
      cloudStorage: "prepared_not_connected",
      trackingBoard: "prepared_not_connected",
    },
  };
}

function textMessage(data, files, structured) {
  const lines = [
    "Nouvelle soumission Portail B2B LILOTOP SARL",
    "",
    `Reference: ${data.reference}`,
    `Date et heure: ${data.submittedAt}`,
    `Type: ${data.portalType}`,
    "",
    "Champs soumis:",
  ];
  for (const [key, value] of Object.entries(data)) {
    if (key === "consent") continue;
    lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value || "-"}`);
  }
  lines.push("", "Documents joints:");
  lines.push(files.length ? files.map((file) => `- ${file.filename} (${file.buffer.length} octets)`).join("\n") : "Aucun document joint");
  lines.push("", "JSON structure:", JSON.stringify(structured, null, 2));
  return lines.join("\n");
}

function htmlMessage(data, files, structured) {
  const rows = Object.entries(data)
    .filter(([key]) => key !== "consent")
    .map(([key, value]) => `<tr><td style="border:1px solid #d7dde5;font-weight:700;width:220px">${esc(key)}</td><td style="border:1px solid #d7dde5">${esc(Array.isArray(value) ? value.join(", ") : value || "-")}</td></tr>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#0d1622;line-height:1.55"><h2 style="margin:0 0 8px;color:#081728">Portail B2B LILOTOP SARL</h2><p><strong>${esc(data.reference)}</strong></p><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:780px">${rows}</table><h3>Documents joints</h3><ul>${files.length ? files.map((file) => `<li>${esc(file.filename)} (${file.buffer.length} octets)</li>`).join("") : "<li>Aucun document joint</li>"}</ul><h3>Données structurees</h3><pre style="white-space:pre-wrap;background:#f3f5f8;border:1px solid #d7dde5;padding:14px">${esc(JSON.stringify(structured, null, 2))}</pre></div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (isRateLimited(getClientIp(req))) return json(res, 429, { ok: false, error: "Too many requests" });

  let parsed;
  try {
    parsed = await parseRequest(req);
  } catch (error) {
    const code = error.code === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_BODY";
    return json(res, code === "BODY_TOO_LARGE" ? 413 : 400, { ok: false, error: "Invalid request body", code });
  }

  const { fields, files } = parsed;
  if (clean(fields.website, 120)) return json(res, 200, { ok: true });

  const portalType = clean(fields.portalType, 40);
  const reference = makeReference(portalType);
  const data = normalize(fields, reference, new Date().toISOString());
  const fieldErrors = validateData(data);
  const fileErrors = validateFiles(files);

  if (fieldErrors.length || fileErrors.length) {
    return json(res, 400, { ok: false, error: "Validation failed", fields: fieldErrors, files: fileErrors });
  }

  const structured = structuredSubmission(data, files);
  const attachments = files.map((file) => ({ filename: file.filename, content: file.buffer.toString("base64") }));

  try {
    const delivery = await sendWebsiteEmail({
      to: recipientFor(data.portalType),
      replyTo: data.email,
      subject: subjectFor(data),
      text: textMessage(data, files, structured),
      html: htmlMessage(data, files, structured),
      attachments,
      idempotencyKey: reference,
    });
    if (data.portalType === "supplier") {
      try {
        await radarStore.createRegistration({
          companyName: data.company,
          contactName: data.contactName,
          email: data.email,
          phone: data.phone,
          country: data.country,
          categories: data.categories,
          notes: data.capacity,
          sourceReference: reference,
          rawData: structured,
        });
      } catch (radarError) {
        console.info("[business-radar] supplier registration not persisted", { code: radarError.code || "PERSISTENCE_FAILED" });
      }
    }
    return json(res, 200, { ok: true, reference, deliveryId: delivery.id });
  } catch (error) {
    const normalized = jsonError(error);
    return json(res, normalized.status, { ...normalized.body, reference });
  }
};
