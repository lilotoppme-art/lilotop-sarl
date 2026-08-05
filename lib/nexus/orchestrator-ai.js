"use strict";

const { radarConfig } = require("../business-radar/config");

const WORKFLOW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lilotopFit: { type: "boolean" },
    opportunityScore: { type: "integer", minimum: 0, maximum: 100 },
    priority: { type: "string", enum: ["tres-prioritaire", "prioritaire", "moyen", "faible"] },
    fitRationale: { type: "string" },
    executiveSummary: { type: "string" },
    country: { type: ["string", "null"] },
    deadline: { type: ["string", "null"] },
    budget: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: ["number", "null"] },
        currency: { type: ["string", "null"] }
      },
      required: ["amount", "currency"]
    },
    products: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: ["string", "null"] }
        },
        required: ["name", "quantity"]
      }
    },
    requiredDocuments: {
      type: "array",
      maxItems: 30,
      items: { type: "string" }
    },
    requirements: {
      type: "array",
      maxItems: 30,
      items: { type: "string" }
    },
    risks: {
      type: "array",
      maxItems: 20,
      items: { type: "string" }
    },
    recommendedActions: {
      type: "array",
      maxItems: 20,
      items: { type: "string" }
    }
  },
  required: [
    "lilotopFit",
    "opportunityScore",
    "priority",
    "fitRationale",
    "executiveSummary",
    "country",
    "deadline",
    "budget",
    "products",
    "requiredDocuments",
    "requirements",
    "risks",
    "recommendedActions"
  ]
};

function outputText(body) {
  return body.output_text
    || body.output?.flatMap((entry) => entry.content || [])
      .find((entry) => entry.type === "output_text")?.text;
}

async function analyzeWorkflowOpportunity(opportunity) {
  const config = radarConfig();
  if (!config.openaiApiKey) {
    throw Object.assign(new Error("OpenAI is not configured"), {
      code: "OPENAI_NOT_CONFIGURED"
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openaiModel,
        reasoning: { effort: "low" },
        input: [
          {
            role: "system",
            content: [
              "Tu coordonnes les agents IA de LILOTOP SARL pour qualifier un appel d'offres industriel.",
              "Evalue explicitement l'adequation avec les activites LILOTOP et attribue un score prudent de 0 a 100.",
              "Extrais uniquement les informations explicitement presentes.",
              "N'invente jamais une quantite, une date, un budget, un document ou une exigence.",
              "Utilise null ou un tableau vide lorsque l'information manque."
            ].join(" ")
          },
          { role: "user", content: JSON.stringify(opportunity) }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "nexus_orchestrator_analysis",
            strict: true,
            schema: WORKFLOW_SCHEMA
          }
        },
        max_output_tokens: 1800
      })
    });
  } catch (error) {
    throw Object.assign(new Error(
      error.name === "AbortError"
        ? "OpenAI orchestration timed out"
        : "OpenAI orchestration request failed"
    ), { code: "ORCHESTRATOR_AI_FAILED", cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw Object.assign(new Error(`OpenAI orchestration failed (${response.status})`), {
      code: "ORCHESTRATOR_AI_FAILED"
    });
  }
  const body = await response.json();
  const text = outputText(body);
  if (!text) {
    throw Object.assign(new Error("OpenAI returned no orchestration analysis"), {
      code: "ORCHESTRATOR_AI_FAILED"
    });
  }
  return {
    ...JSON.parse(text),
    model: body.model || config.openaiModel
  };
}

module.exports = {
  WORKFLOW_SCHEMA,
  analyzeWorkflowOpportunity
};
