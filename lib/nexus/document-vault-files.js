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
  ["04-experience-references", /\b(contrat|purchase order|bon de commande|bon de livraison|bordereau de livraison|delivery note|pv de (?:livraison|r[ée]ception)|quantit[ée] livr[ée]e|bonne ex[ée]cution|facture|r[ée]f[ée]rence client)\b/i],
  ["01-legal-identity", /\b(rccm|id\s*nat|identification nationale|nif|statuts?|acte constitutif)\b/i],
  ["02-compliance", /\b(arsp|fiscal|cnss|inpp|licen[cs]e|agr[ée]ment|hse|attestation)\b/i],
  ["03-bank-finance", /\b(banque|bancaire|financier|bilan|garantie|tr[ée]sorerie)\b/i],
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

function fileStem(filename) {
  return String(filename || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function detectedVersion(text) {
  return String(text || "").match(/\b(?:version|rev(?:ision)?)\s*[:#-]?\s*([a-z0-9][a-z0-9._-]{0,24})\b/i)?.[1] || "";
}

function detectedDescription(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8).slice(0, 3).join(" · ").slice(0, 600);
}

function documentRole(text) {
  if (/\b(attestation de bonne ex[ée]cution|certificat de bonne ex[ée]cution|performance certificate|completion certificate)\b/i.test(text)) return "performance_certificate";
  if (/\b(pv de r[ée]ception|proc[eè]s[- ]verbal de r[ée]ception|attestation de r[ée]ception|acceptance certificate)\b/i.test(text)) return "acceptance_certificate";
  if (/\b(bon de livraison|bordereau de livraison|delivery note|pv de livraison)\b/i.test(text)) return "delivery_note";
  if (/\b(purchase order|bon de commande|\bpo\b)\b/i.test(text)) return "purchase_order";
  if (/\b(contrat|contract|march[ée])\b/i.test(text)) return "contract";
  if (/\b(facture|invoice)\b/i.test(text)) return "invoice";
  return "";
}

const DOCUMENT_TYPE_LABELS = Object.freeze({
  purchase_order: "BON DE COMMANDE / PURCHASE ORDER",
  contract: "CONTRAT",
  invoice: "FACTURE",
  delivery_note: "BON DE LIVRAISON",
  acceptance_certificate: "PV DE RÉCEPTION",
  performance_certificate: "ATTESTATION DE BONNE EXÉCUTION"
});

function businessDocumentType(text) {
  if (/\b(datasheet|fiche technique)\b/i.test(text)) return "DATASHEET / FICHE TECHNIQUE";
  if (/\b(quotation|quote|devis|offre de prix)\b/i.test(text)) return "QUOTATION / DEVIS";
  if (/\b(attestation|certificate)\b/i.test(text)) return "ATTESTATION";
  return DOCUMENT_TYPE_LABELS[documentRole(text)] || "";
}

function compactLines(text) {
  return String(text || "").split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function referencedOrder(text) {
  const line = compactLines(text).find((value) =>
    /(?:bon de commande|purchase order|order reference|r[ée]f[ée]rence (?:po|commande|contrat))/i.test(value)
    && /[:#]/.test(value));
  if (!line) return { reference: "", party: "" };
  const match = line.match(/(?:n[°o.]?\s*)?(?:bon de commande|purchase order|order reference|r[ée]f[ée]rence (?:po|commande|contrat))\s*([^:#]{0,100})[:#]\s*(.{2,120})$/i);
  return {
    reference: match?.[2]?.trim() || "",
    party: match?.[1]?.replace(/^[\s-]+|[\s-]+$/g, "").trim() || ""
  };
}

function likelyRecipient(text, orderParty = "") {
  const labeled = valueAfterLabel(text, [
    "client destinataire", "destinataire", "livré à", "livre a", "deliver to", "ship to", "consignee"
  ]);
  if (labeled) return labeled;
  const company = compactLines(text).find((line) =>
    !/lilotop/i.test(line)
    && !/bon de commande|purchase order|order reference/i.test(line)
    && !/\b(rccm|id\s*nat|imp[oô]t|cnss|t[ée]l|phone|e-?mail|www\.)\b/i.test(line)
    && /\b(sa|sarl|ltd|limited|inc\.?|corp(?:oration)?)\b/i.test(line)
    && line.length <= 140);
  return company || orderParty;
}

function deliveryLineItems(text) {
  const lines = compactLines(text);
  const designationIndex = lines.findIndex((line) =>
    /^(d[ée]signation|description|item|produit)s?$/i.test(line));
  if (designationIndex === -1) return { products: "", quantities: "" };
  const rawTable = lines.slice(designationIndex + 1, designationIndex + 24);
  const tableEnd = rawTable.findIndex((line) => /^(signature|cachet|r[ée]ceptionn[ée])/i.test(line));
  const table = tableEnd === -1 ? rawTable : rawTable.slice(0, tableEnd);
  const ignored = /^(unit[ée]?|unit|quantit[ée]?|quantity|qty|observations?.*|r[ée]serves?.*|n[°o]?|signature|cachet)$/i;
  const products = table.filter((line) =>
    !ignored.test(line) && !/^\d+(?:[.,]\d+)?$/.test(line)
    && !/^(pce|pcs?|unit[ée]?s?|kg|m|m2|m3|lot)$/i.test(line)
    && line.length >= 5).slice(0, 8);
  const quantities = products.map((product) => {
    const productIndex = table.indexOf(product);
    return table.slice(productIndex + 1, productIndex + 4)
      .find((line) => /^\d+(?:[.,]\d+)?$/.test(line)) || "";
  }).filter(Boolean);
  return { products: products.join("; "), quantities: quantities.join("; ") };
}

function normalizedMatchValue(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function wordSet(value) {
  return new Set(normalizedMatchValue(value).split(" ").filter((word) => word.length >= 4));
}

function overlap(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter((word) => b.has(word)).length / Math.min(a.size, b.size);
}

function proposeExperienceAssociation(analysis, documents = []) {
  if (!analysis?.experience || !["delivery_note", "acceptance_certificate", "performance_certificate"]
    .includes(analysis.experience.documentRole)) return null;
  const analysisReferences = [analysis.experience.groupReference, analysis.experience.contractNumber,
    analysis.reference, analysis.orderReference, analysis.documentReference]
    .map(normalizedMatchValue).filter(Boolean);
  const candidates = documents.filter((item) => item.experience).map((item) => {
    const experience = item.experience || {};
    const candidateReferences = [item.reference, experience.group_reference, experience.contract_number,
      experience.client_reference].filter(Boolean);
    const normalizedReferences = candidateReferences.map(normalizedMatchValue).filter(Boolean);
    const matchedReferenceIndex = normalizedReferences.findIndex((candidate) => analysisReferences.some((proof) =>
      proof === candidate || (proof.length >= 6 && candidate.length >= 6
        && (proof.includes(candidate) || candidate.includes(proof)))));
    const referenceMatch = matchedReferenceIndex >= 0;
    const candidateReference = referenceMatch ? candidateReferences[matchedReferenceIndex]
      : candidateReferences[0] || item.title || "";
    const clientMatch = overlap(analysis.experience.client, experience.client_name || item.issuingAuthority);
    const productMatch = overlap(analysis.experience.productsServices, experience.products_services || item.description);
    const proofDate = String(analysis.experience.date || analysis.issuedOn || "").slice(0, 10);
    const candidateDate = String(experience.contract_date || item.issuedOn || "").slice(0, 10);
    const dateMatch = Boolean(proofDate && candidateDate && proofDate === candidateDate);
    const score = (clientMatch * 0.35) + (productMatch * 0.5) + (dateMatch ? 0.15 : 0);
    return { item, candidateReference, score, referenceMatch };
  });
  const exactMatches = candidates.filter((candidate) => candidate.referenceMatch);
  if (exactMatches.length === 1) return {
    documentId: exactMatches[0].item.id,
    reference: exactMatches[0].candidateReference || exactMatches[0].item.title,
    confidence: "ÉLEVÉE",
    validationRequired: true
  };
  if (exactMatches.length > 1) return {
    documentId: "",
    reference: "ASSOCIATION À CONFIRMER PAR LE DG",
    confidence: "FAIBLE",
    validationRequired: true,
    ambiguous: true
  };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.25) return null;
  const second = candidates[1];
  if (second && second.score >= 0.25 && Math.abs(best.score - second.score) < 0.05) return {
    documentId: "",
    reference: "ASSOCIATION À CONFIRMER PAR LE DG",
    confidence: "FAIBLE",
    validationRequired: true,
    ambiguous: true
  };
  return {
    documentId: best.item.id,
    reference: best.candidateReference || best.item.title,
    confidence: best.score >= 0.75 ? "ÉLEVÉE" : best.score >= 0.45 ? "MOYENNE" : "FAIBLE",
    validationRequired: true
  };
}

function hasUsableText(value) {
  const letters = String(value || "").match(/[A-Za-zÀ-ÿ]/g)?.length || 0;
  return letters >= 80;
}

function outputText(body) {
  return body?.output_text || body?.output?.flatMap((entry) => entry.content || [])
    .find((entry) => entry.type === "output_text")?.text || "";
}

async function extractScannedPdfMetadata(file, options = {}) {
  if (!options.openaiApiKey) {
    throw vaultError(
      "Ce PDF est numérisé et nécessite le moteur OCR sécurisé configuré pour lire son contenu.",
      "DOCUMENT_ANALYSIS_UNAVAILABLE"
    );
  }
  const fields = [
    "documentType", "clientAuthority", "reference", "orderReference", "date", "deliveryDate", "subject", "supplier",
    "products", "quantities", "amount", "currency", "deliveryPlace", "incoterm",
    "leadTime", "signaturesOrStamps", "receptionStatus"
  ];
  const properties = Object.fromEntries(fields.map((key) => [key, { type: "string" }]));
  const request = {
    model: options.openaiModel,
    reasoning: { effort: "low" },
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Lis visuellement ce document professionnel numérisé et extrais uniquement les informations réellement visibles.",
            "N'invente rien. Retourne une chaîne vide pour toute donnée absente ou ambiguë.",
            "documentType doit être un type métier (par exemple BON DE COMMANDE, PURCHASE ORDER, CONTRAT, FACTURE, BON DE LIVRAISON, PV DE RÉCEPTION, ATTESTATION, DATASHEET ou QUOTATION), jamais PDF.",
            "Si BON DE LIVRAISON, DELIVERY NOTE, BORDEREAU DE LIVRAISON ou PV DE LIVRAISON est visible, documentType doit être BON DE LIVRAISON même si le document cite un PO.",
            "Pour une preuve de livraison, clientAuthority est le destinataire/réceptionnaire, reference est le numéro du bon s'il existe, orderReference est la référence PO/contrat, deliveryDate est la date de livraison et receptionStatus décrit uniquement une réception visible.",
            "Ignore RCCM, numéro fiscal, CNSS, téléphone, e-mail et adresse de l'émetteur pour déterminer type, client et référence métier.",
            "date doit être au format YYYY-MM-DD seulement si elle est certaine. products et quantities peuvent contenir plusieurs lignes fidèlement résumées."
          ].join(" ")
        },
        {
          type: "input_file",
          filename: file.sourceFilename,
          file_data: `data:application/pdf;base64,${file.buffer.toString("base64")}`
        }
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "document_vault_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties,
          required: fields
        }
      }
    },
    max_output_tokens: 1800
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await (options.fetchImpl || fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
  } catch (cause) {
    throw Object.assign(vaultError("L'analyse OCR du document a échoué.", "DOCUMENT_ANALYSIS_FAILED"), { cause });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw vaultError(`L'analyse OCR du document a échoué (${response.status}).`, "DOCUMENT_ANALYSIS_FAILED");
  }
  try {
    const extracted = JSON.parse(outputText(await response.json()));
    return Object.fromEntries(fields.map((key) => [key, String(extracted[key] || "").trim()]));
  } catch (cause) {
    throw Object.assign(vaultError("La réponse OCR du document est invalide.", "DOCUMENT_ANALYSIS_FAILED"), { cause });
  }
}

function inputOrDetected(input, key, detected) {
  return String(input[key] || detected || "").trim();
}

function analyzeVaultDocument(file, input = {}, extracted = {}) {
  const detectedContent = [
    extracted.documentType, extracted.clientAuthority, extracted.reference, extracted.orderReference,
    extracted.date, extracted.deliveryDate,
    extracted.subject, extracted.supplier, extracted.products, extracted.quantities,
    extracted.amount, extracted.currency, extracted.deliveryPlace, extracted.incoterm,
    extracted.leadTime, extracted.signaturesOrStamps, extracted.receptionStatus
  ].filter(Boolean).join("\n");
  const content = `${file.previewText || ""}\n${detectedContent}`.trim().slice(0, 50000);
  const searchable = `${file.sourceFilename}\n${input.title || ""}\n${content}`.slice(0, 50000);
  const role = documentRole(content) || documentRole(file.sourceFilename);
  const categoryCode = role
    ? "04-experience-references"
    : CATEGORY_RULES.find(([, pattern]) => pattern.test(searchable))?.[0] || "07-other";
  const dates = extractDates(searchable);
  const expiryLine = matchingLine(searchable, /expir|valid(?:e|it[ée])\s*(?:jusqu|au)|expiry/i);
  const expiryDates = extractDates(expiryLine);
  const issueLine = matchingLine(searchable, /d[ée]livr|[ée]mis|issue date|date du document/i);
  const issueDates = extractDates(issueLine);
  const order = referencedOrder(content);
  const genericReference = extracted.reference || valueAfterLabel(content, [
    "purchase order no", "purchase order number", "bon de commande n°", "bon de commande no",
    "reference", "référence", "numero", "numéro", "contract no", "po no", "p.o. no"
  ]);
  const reference = ["delivery_note", "acceptance_certificate", "performance_certificate"].includes(role)
    ? extracted.orderReference || order.reference || genericReference
    : genericReference;
  const detectedRecipient = likelyRecipient(content, order.party);
  const authority = ["delivery_note", "acceptance_certificate"].includes(role)
    ? detectedRecipient || extracted.clientAuthority
    : extracted.clientAuthority || valueAfterLabel(content, [
    "autorité", "authority", "client", "customer", "acheteur", "buyer", "émis par", "issued by"
  ]);
  const isExperience = categoryCode === "04-experience-references";
  const delivered = deliveryLineItems(content);
  const subject = extracted.subject || delivered.products
    || valueAfterLabel(content, ["objet", "subject", "description", "purpose"]);
  const client = authority || valueAfterLabel(content, ["client", "customer", "acheteur", "buyer"]);
  const experience = isExperience ? {
    client: inputOrDetected(input, "experienceClient", client),
    subject: inputOrDetected(input, "experienceSubject", subject),
    sector: valueAfterLabel(content, ["secteur", "sector"]),
    productsServices: inputOrDetected(input, "experienceProducts", delivered.products || extracted.products || valueAfterLabel(content, ["produits", "products", "services", "fournitures", "goods"])),
    quantities: inputOrDetected(input, "experienceQuantities", delivered.quantities || extracted.quantities || valueAfterLabel(content, ["quantités", "quantities", "quantity", "qty"])),
    contractNumber: reference,
    date: extracted.deliveryDate || extracted.date || issueDates[0] || dates[0] || "",
    executionPeriod: valueAfterLabel(content, ["période d'exécution", "execution period", "delivery period"]),
    value: inputOrDetected(input, "experienceValue", extracted.amount || valueAfterLabel(content, ["valeur", "value", "montant", "amount", "total"])),
    currency: inputOrDetected(input, "experienceCurrency", extracted.currency || (searchable.match(/\b(USD|EUR|CDF|ZAR|GBP|MWK)\b/i)?.[1] || "")).toUpperCase(),
    country: inputOrDetected(input, "experienceCountry", valueAfterLabel(content, ["pays", "country"])),
    deliveryPlace: inputOrDetected(input, "experienceDeliveryPlace", extracted.deliveryPlace || valueAfterLabel(content, ["lieu de livraison", "delivery place", "delivery location", "destination"])),
    incoterm: inputOrDetected(input, "experienceIncoterm", extracted.incoterm || searchable.match(/\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b/i)?.[1]?.toUpperCase()),
    leadTime: inputOrDetected(input, "experienceLeadTime", extracted.leadTime || valueAfterLabel(content, ["délai", "lead time", "delivery period"])),
    clientReference: inputOrDetected(input, "experienceClientReference", valueAfterLabel(content, ["référence client", "client reference", "customer reference"])),
    documentRole: role,
    groupReference: inputOrDetected(input, "experienceGroupReference", reference),
    executionStatus: extracted.receptionStatus || valueAfterLabel(content, ["statut d'exécution", "execution status", "status"]),
    clientContact: valueAfterLabel(content, ["contact client", "client contact", "contact person"]),
    deliveryProofAvailable: ["delivery_note", "acceptance_certificate"].includes(role)
      || /preuve de livraison|delivery note|delivery certificate/i.test(searchable),
    performanceCertificateAvailable: /bonne ex[ée]cution|performance certificate|completion certificate/i.test(searchable)
  } : null;
  return {
    categoryCode,
    title: input.title || subject || matchingLine(content, /\S/) || fileStem(file.sourceFilename),
    documentType: DOCUMENT_TYPE_LABELS[role] || extracted.documentType || businessDocumentType(searchable),
    fileFormat: file.extension.toUpperCase(),
    documentReference: extracted.reference || "",
    orderReference: extracted.orderReference || order.reference || "",
    version: detectedVersion(searchable),
    reference,
    issuingAuthority: authority,
    issuedOn: extracted.deliveryDate || extracted.date || issueDates[0] || dates[0] || "",
    expiresOn: expiryDates[0] || "",
    description: role === "delivery_note" && subject ? `Livraison : ${subject}`.slice(0, 600) : detectedDescription(content),
    notes: valueAfterLabel(content, ["notes", "note", "remarques", "remarks"]),
    source: input.source || "Import DG",
    needsConfirmation: !reference || !authority || !(DOCUMENT_TYPE_LABELS[role] || businessDocumentType(searchable))
      || (isExperience && (!experience.client || !experience.subject)),
    experience
  };
}

async function analyzePreparedVaultFile(file, input = {}, options = {}) {
  const scannedPdf = file.extension === "pdf" && !hasUsableText(file.previewText);
  const extracted = scannedPdf ? await extractScannedPdfMetadata(file, options) : {};
  return analyzeVaultDocument(file, input, extracted);
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseVaultUpload,
  prepareVaultFile,
  analyzeVaultDocument,
  analyzePreparedVaultFile,
  extractScannedPdfMetadata,
  proposeExperienceAssociation,
  sanitizeFilename
};
