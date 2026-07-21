const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@lilotopsarl.com";
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "LILOTOP SARL <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RFQ_SEND_ACK = process.env.RFQ_SEND_ACK === "true";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 8 * 1024 * 1024;
const MAX_BODY_SIZE = 9 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

const rateStore = new Map();

const requestTypes = new Set(["price-request", "procurement-request", "partnership-request", "technical-request", "tender", "other"]);
const sectors = new Set(["mining", "metallurgy", "industry", "energy", "infrastructure", "construction", "oil-gas", "public-institution", "other"]);
const categories = new Set([
  "mining-chemical-reagents",
  "sulfuric-acid",
  "quicklime",
  "flocculants",
  "activated-carbon",
  "sx-extractants",
  "sodium-sulfate",
  "grinding-media",
  "lubricants",
  "fuels",
  "industrial-supplies",
  "road-solutions",
  "strategic-advisory",
  "industrial-project",
  "other",
]);
const frequencies = new Set(["one-time", "monthly", "quarterly", "annual", "framework", "unknown"]);
const currencies = new Set(["USD", "EUR", "CDF", "ZAR", "Other"]);
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

const labels = {
  requestType: {
    "price-request": "Demande de prix",
    "procurement-request": "Demande d'approvisionnement",
    "partnership-request": "Demande de partenariat",
    "technical-request": "Demande technique",
    tender: "Appel d'offres",
    other: "Autre",
  },
  sector: {
    mining: "Mines",
    metallurgy: "Metallurgie",
    industry: "Industrie",
    energy: "Energie",
    infrastructure: "Infrastructures",
    construction: "BTP",
    "oil-gas": "Petrole et gaz",
    "public-institution": "Institution publique",
    other: "Autre",
  },
  category: {
    "mining-chemical-reagents": "Reactifs chimiques miniers",
    "sulfuric-acid": "Acide sulfurique",
    quicklime: "Chaux vive",
    flocculants: "Floculants",
    "activated-carbon": "Charbon actif",
    "sx-extractants": "Extractants SX",
    "sodium-sulfate": "Sulfate de sodium",
    "grinding-media": "Billes de broyage",
    lubricants: "Lubrifiants",
    fuels: "Carburants",
    "industrial-supplies": "Fournitures industrielles",
    "road-solutions": "Solutions routieres",
    "strategic-advisory": "Conseil strategique",
    "industrial-project": "Projet industriel",
    other: "Autre",
  },
  purchaseFrequency: {
    "one-time": "Achat ponctuel",
    monthly: "Mensuel",
    quarterly: "Trimestriel",
    annual: "Annuel",
    framework: "Contrat cadre",
    unknown: "A confirmer",
  },
};

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

function parseMultipart(raw, boundary) {
  const fields = {};
  const files = [];
  const delimiter = `--${boundary}`;
  const parts = raw.toString("latin1").split(delimiter);

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
    const name = disposition.name;
    if (!name) continue;

    if (disposition.filename) {
      const buffer = Buffer.from(content, "latin1");
      if (!buffer.length) continue;
      files.push({
        fieldName: name,
        filename: sanitizeFilename(disposition.filename),
        contentType: clean(headers["content-type"], 120),
        buffer,
      });
    } else {
      fields[name] = Buffer.from(content, "latin1").toString("utf8").trim();
    }
  }

  return { fields, files };
}

async function parseRequest(req) {
  if (typeof req.body === "object" && req.body && !Buffer.isBuffer(req.body)) {
    return { fields: req.body, files: [] };
  }

  const contentType = getHeader(req, "content-type");
  const raw = await readRawBody(req);

  if (contentType.includes("multipart/form-data")) {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
    if (!boundary) throw new Error("Missing multipart boundary");
    return parseMultipart(raw, boundary);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { fields: Object.fromEntries(new URLSearchParams(raw.toString("utf8"))), files: [] };
  }

  const text = raw.toString("utf8");
  return { fields: text ? JSON.parse(text) : {}, files: [] };
}

function sanitizeFilename(filename) {
  const cleaned = clean(filename, 160).replace(/[\\/:*?"<>|]/g, "-");
  return cleaned || "document";
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
    const ext = fileExtension(file.filename);
    if (!allowedExtensions.has(ext)) errors.push(`file_type:${file.filename}`);
    if (file.contentType && !allowedTypes.has(file.contentType)) errors.push(`file_mime:${file.filename}`);
    if (file.buffer.length > MAX_FILE_SIZE) errors.push(`file_size:${file.filename}`);
  }

  if (total > MAX_TOTAL_FILE_SIZE) errors.push("files_total_size");
  return errors;
}

function makeReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RFQ-${date}-${suffix}`;
}

function normalizeData(fields, reference, submittedAt) {
  return {
    reference,
    submittedAt,
    fullName: clean(fields.fullName, 140),
    position: clean(fields.position, 140),
    company: clean(fields.company, 180),
    email: clean(fields.email, 180),
    phone: clean(fields.phone, 80),
    country: clean(fields.country, 120),
    city: clean(fields.city, 120),
    requestType: clean(fields.requestType, 80),
    sector: clean(fields.sector, 80),
    category: clean(fields.category, 80),
    description: clean(fields.description, 6000),
    quantity: clean(fields.quantity, 120),
    unit: clean(fields.unit, 80),
    purchaseFrequency: clean(fields.purchaseFrequency, 80),
    deliveryLocation: clean(fields.deliveryLocation, 180),
    desiredDeliveryDate: clean(fields.desiredDeliveryDate, 80),
    currency: clean(fields.currency, 20),
    incoterm: clean(fields.incoterm, 80),
    budget: clean(fields.budget, 120),
    consent: fields.consent === true || fields.consent === "on" || fields.consent === "true",
  };
}

function validateData(data) {
  const errors = [];
  for (const field of ["fullName", "position", "company", "phone", "country", "city", "quantity", "unit", "deliveryLocation", "desiredDeliveryDate"]) {
    if (!data[field]) errors.push(field);
  }
  if (!isEmail(data.email)) errors.push("email");
  if (!requestTypes.has(data.requestType)) errors.push("requestType");
  if (!sectors.has(data.sector)) errors.push("sector");
  if (!categories.has(data.category)) errors.push("category");
  if (!frequencies.has(data.purchaseFrequency)) errors.push("purchaseFrequency");
  if (!currencies.has(data.currency)) errors.push("currency");
  if (!data.description || data.description.length < 20) errors.push("description");
  if (!data.consent) errors.push("consent");
  return errors;
}

function label(group, value) {
  return labels[group]?.[value] || value || "-";
}

function structuredRfq(data, files) {
  return {
    reference: data.reference,
    submittedAt: data.submittedAt,
    requester: {
      fullName: data.fullName,
      position: data.position,
      company: data.company,
      email: data.email,
      phone: data.phone,
      country: data.country,
      city: data.city,
    },
    classification: {
      requestType: data.requestType,
      requestTypeLabel: label("requestType", data.requestType),
      sector: data.sector,
      sectorLabel: label("sector", data.sector),
      category: data.category,
      categoryLabel: label("category", data.category),
    },
    commercialDetails: {
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      purchaseFrequency: data.purchaseFrequency,
      purchaseFrequencyLabel: label("purchaseFrequency", data.purchaseFrequency),
      deliveryLocation: data.deliveryLocation,
      desiredDeliveryDate: data.desiredDeliveryDate,
      currency: data.currency,
      incoterm: data.incoterm,
      budget: data.budget,
    },
    documents: files.map((file) => ({
      filename: file.filename,
      contentType: file.contentType,
      size: file.buffer.length,
    })),
    automationReady: {
      aiSummaryStatus: "prepared_not_connected",
      odooOpportunityStatus: "prepared_not_connected",
      supplierRfqStatus: "prepared_not_connected",
    },
  };
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

function textMessage(data, files, structured) {
  return [
    "Nouvelle demande de cotation LILOTOP SARL",
    "",
    `Reference: ${data.reference}`,
    `Date et heure: ${data.submittedAt}`,
    "",
    "Identite du demandeur",
    `Nom: ${data.fullName}`,
    `Fonction: ${data.position}`,
    `Entreprise: ${data.company}`,
    `Email: ${data.email}`,
    `Telephone: ${data.phone}`,
    `Pays: ${data.country}`,
    `Ville: ${data.city}`,
    "",
    "Classification",
    `Type de demande: ${label("requestType", data.requestType)}`,
    `Secteur: ${label("sector", data.sector)}`,
    `Categorie: ${label("category", data.category)}`,
    "",
    "Details commerciaux",
    `Quantite: ${data.quantity}`,
    `Unite: ${data.unit}`,
    `Frequence: ${label("purchaseFrequency", data.purchaseFrequency)}`,
    `Lieu de livraison: ${data.deliveryLocation}`,
    `Date souhaitee: ${data.desiredDeliveryDate}`,
    `Devise: ${data.currency}`,
    `Incoterm: ${data.incoterm || "-"}`,
    `Budget indicatif: ${data.budget || "-"}`,
    "",
    "Description",
    data.description,
    "",
    "Documents joints",
    files.length ? files.map((file) => `- ${file.filename} (${file.buffer.length} octets)`).join("\n") : "Aucun document joint",
    "",
    "JSON structure pour IA/Odoo",
    JSON.stringify(structured, null, 2),
  ].join("\n");
}

function htmlMessage(data, files, structured) {
  const rows = [
    ["Reference", data.reference],
    ["Date et heure", data.submittedAt],
    ["Nom", data.fullName],
    ["Fonction", data.position],
    ["Entreprise", data.company],
    ["Email", data.email],
    ["Telephone", data.phone],
    ["Pays", data.country],
    ["Ville", data.city],
    ["Type de demande", label("requestType", data.requestType)],
    ["Secteur", label("sector", data.sector)],
    ["Categorie", label("category", data.category)],
    ["Quantite", data.quantity],
    ["Unite", data.unit],
    ["Frequence", label("purchaseFrequency", data.purchaseFrequency)],
    ["Lieu de livraison", data.deliveryLocation],
    ["Date souhaitee", data.desiredDeliveryDate],
    ["Devise", data.currency],
    ["Incoterm", data.incoterm || "-"],
    ["Budget indicatif", data.budget || "-"],
  ];

  return `
    <div style="font-family:Arial,sans-serif;color:#0d1622;line-height:1.55">
      <h2 style="margin:0 0 8px;color:#081728">Nouvelle RFQ LILOTOP SARL</h2>
      <p style="margin:0 0 18px;color:#334155"><strong>${esc(data.reference)}</strong></p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:780px">
        ${rows.map(([name, value]) => `<tr><td style="border:1px solid #d7dde5;font-weight:700;width:220px">${esc(name)}</td><td style="border:1px solid #d7dde5">${esc(value)}</td></tr>`).join("")}
      </table>
      <h3 style="margin:24px 0 8px;color:#081728">Description du besoin</h3>
      <p style="white-space:pre-wrap">${esc(data.description)}</p>
      <h3 style="margin:24px 0 8px;color:#081728">Documents joints</h3>
      <ul>${files.length ? files.map((file) => `<li>${esc(file.filename)} (${file.buffer.length} octets)</li>`).join("") : "<li>Aucun document joint</li>"}</ul>
      <h3 style="margin:24px 0 8px;color:#081728">Données structurees pour IA/Odoo</h3>
      <pre style="white-space:pre-wrap;background:#f3f5f8;border:1px solid #d7dde5;padding:14px">${esc(JSON.stringify(structured, null, 2))}</pre>
    </div>
  `;
}

function ackMessage(data) {
  return {
    subject: `[LILOTOP] Accuse de reception ${data.reference}`,
    text: [
      `Bonjour ${data.fullName},`,
      "",
      `Nous avons bien recu votre demande de cotation ${data.reference}.`,
      "L'equipe LILOTOP SARL analysera les informations transmises et reviendra vers vous.",
      "",
      "Cordialement,",
      "LILOTOP SARL",
    ].join("\n"),
  };
}

async function sendEmail(payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = new Error("Email delivery failed");
    error.status = response.status;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (isRateLimited(getClientIp(req))) {
    return json(res, 429, { ok: false, error: "Too many requests" });
  }

  let parsed;
  try {
    parsed = await parseRequest(req);
  } catch (error) {
    const code = error.code === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_BODY";
    return json(res, code === "BODY_TOO_LARGE" ? 413 : 400, { ok: false, error: "Invalid request body", code });
  }

  const { fields, files } = parsed;
  if (clean(fields.website, 120)) {
    return json(res, 200, { ok: true });
  }

  const reference = makeReference();
  const submittedAt = new Date().toISOString();
  const data = normalizeData(fields, reference, submittedAt);
  const fieldErrors = validateData(data);
  const fileErrors = validateFiles(files);

  if (fieldErrors.length || fileErrors.length) {
    return json(res, 400, {
      ok: false,
      error: "Validation failed",
      fields: fieldErrors,
      files: fileErrors,
    });
  }

  if (!RESEND_API_KEY) {
    return json(res, 503, {
      ok: false,
      error: "Email service is not configured",
      code: "EMAIL_SERVICE_NOT_CONFIGURED",
      reference,
    });
  }

  const structured = structuredRfq(data, files);
  const subject = `[RFQ LILOTOP] - ${data.company} - ${label("category", data.category)} - ${data.country}`;
  const attachments = files.map((file) => ({
    filename: file.filename,
    content: file.buffer.toString("base64"),
  }));

  try {
    await sendEmail({
      from: CONTACT_FROM_EMAIL,
      to: [CONTACT_TO_EMAIL],
      reply_to: data.email,
      subject,
      text: textMessage(data, files, structured),
      html: htmlMessage(data, files, structured),
      attachments,
    });

    if (RFQ_SEND_ACK) {
      const ack = ackMessage(data);
      await sendEmail({
        from: CONTACT_FROM_EMAIL,
        to: [data.email],
        reply_to: CONTACT_TO_EMAIL,
        subject: ack.subject,
        text: ack.text,
      });
    }
  } catch {
    return json(res, 502, { ok: false, error: "Email delivery failed", reference });
  }

  return json(res, 200, { ok: true, reference });
};
