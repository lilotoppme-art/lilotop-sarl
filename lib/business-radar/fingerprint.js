const crypto = require("crypto");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function opportunityFingerprint(item) {
  const reference = item.reference || item.externalId || item.rawData?.reference;
  const identity = reference
    ? `reference|${reference}`
    : item.sourceUrl
      ? `source|${item.sourceUrl}`
      : `title|${item.title}|${item.organization}|${item.deadlineAt || ""}`;
  return crypto.createHash("sha256").update(normalize(identity)).digest("hex");
}

module.exports = { normalize, opportunityFingerprint };
