const { radarConfig } = require("./config");

function noAiAnalysis(item) {
  const summary = [item.title, item.organization, item.country, item.deadlineAt ? `Echeance: ${item.deadlineAt.slice(0, 10)}` : ""].filter(Boolean).join(" - ");
  return { mode: "no_ai", summary, fit: item.score >= 70 ? "fort" : item.score >= 45 ? "moyen" : "a_verifier", risks: [], nextActions: ["Verifier la source", "Qualifier les exigences", "Confirmer l'echeance"] };
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
      risks: { type: "array", items: { type: "string" } },
      nextActions: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "fit", "risks", "nextActions"],
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openaiModel,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: "Tu analyses des opportunites B2B industrielles pour LILOTOP SARL en RDC. Reste factuel, ne cree aucune information absente et reponds dans la langue de la source." },
        { role: "user", content: JSON.stringify(item) },
      ],
      text: { format: { type: "json_schema", name: "business_radar_analysis", strict: true, schema } },
      max_output_tokens: 900,
    }),
  });
  if (!response.ok) throw Object.assign(new Error(`OpenAI analysis failed (${response.status})`), { code: "AI_ANALYSIS_FAILED" });
  const body = await response.json();
  const outputText = body.output_text || body.output?.flatMap((entry) => entry.content || []).find((entry) => entry.type === "output_text")?.text;
  if (!outputText) throw Object.assign(new Error("OpenAI returned no analysis"), { code: "AI_ANALYSIS_FAILED" });
  return { mode: "openai", ...JSON.parse(outputText) };
}

module.exports = { analyzeOpportunity, noAiAnalysis };
