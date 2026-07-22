const STATUSES = new Set(["new", "reviewing", "qualified", "monitoring", "submitted", "won", "lost", "archived"]);
const SOURCE_TYPES = new Set(["demo", "rss", "html", "manual"]);

function clean(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw validationError("Invalid date");
  return parsed.toISOString();
}

function validationError(message, fields = []) {
  return Object.assign(new Error(message), { code: "VALIDATION_ERROR", fields });
}

function opportunity(input = {}) {
  const data = {
    title: clean(input.title, 240), organization: clean(input.organization, 200), country: clean(input.country, 100),
    sector: clean(input.sector, 120), opportunityType: clean(input.opportunityType, 120), description: clean(input.description, 8000),
    sourceUrl: clean(input.sourceUrl, 1200), externalId: clean(input.externalId, 200), publishedAt: optionalDate(input.publishedAt),
    deadlineAt: optionalDate(input.deadlineAt), estimatedValue: input.estimatedValue ? Number(input.estimatedValue) : null,
    currency: clean(input.currency, 12), tags: Array.isArray(input.tags) ? input.tags.map((tag) => clean(tag, 60)).filter(Boolean).slice(0, 20) : [],
    sourceType: SOURCE_TYPES.has(input.sourceType) ? input.sourceType : "manual", isDemo: input.isDemo === true,
  };
  if (!data.title) throw validationError("Opportunity title is required", ["title"]);
  if (data.sourceUrl && !/^https?:\/\//i.test(data.sourceUrl)) throw validationError("Source URL must use HTTP or HTTPS", ["sourceUrl"]);
  if (data.estimatedValue !== null && (!Number.isFinite(data.estimatedValue) || data.estimatedValue < 0)) throw validationError("Invalid estimated value", ["estimatedValue"]);
  return data;
}

function source(input = {}) {
  const data = { name: clean(input.name, 180), type: clean(input.type, 30), url: clean(input.url, 1200), country: clean(input.country, 100), active: input.active !== false, config: input.config && typeof input.config === "object" ? input.config : {} };
  if (!data.name || !SOURCE_TYPES.has(data.type)) throw validationError("A valid source name and type are required", ["name", "type"]);
  if (data.type !== "manual" && data.type !== "demo" && !/^https?:\/\//i.test(data.url)) throw validationError("Source URL must use HTTP or HTTPS", ["url"]);
  return data;
}

function status(value) {
  const cleanValue = clean(value, 40);
  if (!STATUSES.has(cleanValue)) throw validationError("Invalid opportunity status", ["status"]);
  return cleanValue;
}

function uuid(value, field = "id") {
  const cleanValue = clean(value, 60);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanValue)) {
    throw validationError(`Invalid ${field}`, [field]);
  }
  return cleanValue;
}

function note(input = {}) {
  const data = { opportunityId: uuid(input.opportunityId, "opportunityId"), content: clean(input.content, 4000) };
  if (!data.content) throw validationError("Note content is required", ["content"]);
  return data;
}

module.exports = { clean, opportunity, source, status, uuid, note, validationError, STATUSES, SOURCE_TYPES };
