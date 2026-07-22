const KEYWORDS = ["mine", "mining", "cobalt", "copper", "cuivre", "logistics", "logistique", "infrastructure", "energy", "energie", "industrial", "procurement", "supply", "rdc", "congo"];

function scoreOpportunity(item, now = new Date()) {
  const text = `${item.title || ""} ${item.description || ""} ${item.sector || ""}`.toLowerCase();
  const matchedKeywords = KEYWORDS.filter((keyword) => text.includes(keyword));
  const relevance = Math.min(45, matchedKeywords.length * 7);
  const completenessFields = ["organization", "country", "description", "sourceUrl", "deadlineAt"];
  const completeness = completenessFields.filter((field) => item[field]).length * 5;
  let urgency = 0;
  if (item.deadlineAt) {
    const days = Math.ceil((new Date(item.deadlineAt) - now) / 86400000);
    urgency = days >= 0 && days <= 14 ? 20 : days <= 45 ? 12 : days <= 90 ? 6 : 0;
  }
  const strategic = /rdc|congo|afrique centrale|central africa/i.test(`${item.country} ${text}`) ? 10 : 0;
  const total = Math.min(100, relevance + completeness + urgency + strategic);
  return { total, relevance, completeness, urgency, strategic, matchedKeywords };
}

module.exports = { scoreOpportunity };
