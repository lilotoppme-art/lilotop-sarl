const { radarConfig } = require("./config");

function noAiAnalysis(item) {
  const summary = [item.title, item.organization, item.country, item.deadlineAt ? `Echeance: ${item.deadlineAt.slice(0, 10)}` : ""].filter(Boolean).join(" - ");
  return {
    mode: "no_ai", summary, fit: item.score >= 70 ? "fort" : item.score >= 45 ? "moyen" : "a_verifier",
    classification: item.opportunityType || null, country: item.country || null, buyer: item.organization || null,
    products: [], requirements: [], deadline: item.deadlineAt || null, documents: [], supplierRegistrationRequired: false,
    recommendation: "Analyse manuelle requise", risks: [], nextActions: ["Verifier la source", "Qualifier les exigences", "Confirmer l'echeance"],
  };
}

async function analyzeOpportunity(item) {
  const config = radarConfig();
  if (!config.openaiApiKey) return noAiAnalysis(item);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      fit: { type: "string", enum: ["fort", "moyen", "faible", "a_verifier"] },
      classification: { type: ["string", "null"] },
      country: { type: ["string", "null"] },
      buyer: { type: ["string", "null"] },
      products: { type: "array", items: { type: "string" } },
      requirements: { type: "array", items: { type: "string" } },
      deadline: { type: ["string", "null"] },
      documents: { type: "array", items: { type: "string" } },
      supplierRegistrationRequired: { type: "boolean" },
      recommendation: { type: "string" },
      risks: { type: "array", items: { type: "string" } },
      nextActions: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "fit", "classification", "country", "buyer", "products", "requirements", "deadline", "documents", "supplierRegistrationRequired", "recommendation", "risks", "nextActions"],
  };
  const request = {
    model: config.openaiModel,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: "Tu analyses des opportunites B2B industrielles pour LILOTOP SARL en RDC. Utilise uniquement les informations presentes. Laisse null ou un tableau vide lorsque l'information manque. N'invente jamais un acheteur, une date, un document, une valeur ou une exigence." },
      { role: "user", content: JSON.stringify(item) },
    ],
    text: { format: { type: "json_schema", name: "business_radar_analysis", strict: true, schema } },
    max_output_tokens: 1200,
  };
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch (error) {
      if (attempt === 1) throw Object.assign(new Error("OpenAI analysis timed out"), { code: "AI_ANALYSIS_FAILED", cause: error });
    } finally { clearTimeout(timeout); }
    if (response && (response.ok || response.status < 500)) break;
  }
  if (!response?.ok) throw Object.assign(new Error(`OpenAI analysis failed (${response?.status || "unavailable"})`), { code: "AI_ANALYSIS_FAILED" });
  const body = await response.json();
  const outputText = body.output_text || body.output?.flatMap((entry) => entry.content || []).find((entry) => entry.type === "output_text")?.text;
  if (!outputText) throw Object.assign(new Error("OpenAI returned no analysis"), { code: "AI_ANALYSIS_FAILED" });
  return { mode: "openai", ...JSON.parse(outputText) };
}

module.exports = { analyzeOpportunity, noAiAnalysis };
