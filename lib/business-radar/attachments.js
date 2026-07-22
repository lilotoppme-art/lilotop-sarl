const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);
const MAX_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(value) {
  return String(value || "document")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 180) || "document";
}

function validateMetadata({ name, type, size }) {
  if (!ALLOWED_MIME_TYPES.has(String(type || "").toLowerCase())) throw Object.assign(new Error("File type is not allowed"), { code: "VALIDATION_ERROR" });
  if (!Number.isInteger(Number(size)) || Number(size) < 1 || Number(size) > MAX_BYTES) throw Object.assign(new Error("File must not exceed 10 MB"), { code: "VALIDATION_ERROR" });
  return { originalName: sanitizeFilename(name), mimeType: String(type).toLowerCase(), sizeBytes: Number(size) };
}

function notConfigured() {
  throw Object.assign(new Error("Private attachment storage is not configured in Preview"), { code: "ATTACHMENTS_NOT_CONFIGURED" });
}

module.exports = { ALLOWED_MIME_TYPES, MAX_BYTES, sanitizeFilename, validateMetadata, notConfigured };
