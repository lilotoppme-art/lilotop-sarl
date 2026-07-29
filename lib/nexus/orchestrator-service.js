"use strict";

const validation = require("../business-radar/validation");
const { analyzeWorkflowOpportunity } = require("./orchestrator-ai");
const { buildRfqDraft, searchSuppliers } = require("./supplier-ai");
const supplierStore = require("./supplier-store");
const store = require("./orchestrator-store");

const MAX_SOURCED_PRODUCTS = 3;

const AGENTS = Object.freeze([
  { key: "mining-watch-ai", name: "Agent Veille Miniere", role: "Detection des signaux" },
  { key: "tender-ai", name: "Agent Appels d'Offres", role: "Qualification de l'opportunite" },
  { key: "commercial-ai", name: "Agent Commercial", role: "Analyse et recommandation" },
  { key: "supplier-ai", name: "Agent Fournisseurs", role: "Sourcing et RFQ" },
  { key: "tender-response-ai", name: "Agent Reponse AO", role: "Constitution du dossier" }
]);

function safeError(error) {
  return String(error?.message || "Workflow step failed").slice(0, 900);
}

function workflowInput(opportunity) {
  return {
    title: opportunity.title,
    client: opportunity.organization,
    country: opportunity.country,
    sector: opportunity.sector,
    type: opportunity.opportunityType,
    description: opportunity.description,
    sourceUrl: opportunity.sourceUrl,
    deadline: opportunity.deadlineAt,
    estimatedValue: opportunity.estimatedValue,
    currency: opportunity.currency,
    existingSummary: opportunity.aiSummary,
    existingAnalysis: opportunity.aiAnalysis
  };
}

function documentsFor(dossier) {
  const analysis = dossier.analysis || {};
  const products = analysis.products || [];
  return [
    {
      key: "executive-analysis",
      title: "Analyse executive",
      type: "markdown",
      content: analysis.executiveSummary || "Analyse non disponible."
    },
    {
      key: "compliance-checklist",
      title: "Checklist documentaire",
      type: "markdown",
      content: (analysis.requiredDocuments || []).length
        ? analysis.requiredDocuments.map((item) => `- [ ] ${item}`).join("\n")
        : "- [ ] Confirmer les documents requis avec l'acheteur"
    },
    {
      key: "products-and-quantities",
      title: "Produits et quantites",
      type: "markdown",
      content: products.length
        ? products.map((item) => `- ${item.name}: ${item.quantity || "a confirmer"}`).join("\n")
        : "- Aucun produit explicitement extrait"
    },
    {
      key: "supplier-report",
      title: "Rapport fournisseurs",
      type: "markdown",
      content: (dossier.sourcing || []).map((entry) => [
        `## ${entry.product.name}`,
        ...entry.suppliers.map((supplier) => `- ${supplier.name} (${supplier.country}) - ${supplier.reliabilityScore}/100`)
      ].join("\n")).join("\n\n") || "Aucun sourcing disponible."
    },
    {
      key: "rfq-register",
      title: "Registre RFQ",
      type: "markdown",
      content: (dossier.rfqs || []).map((rfq) => `- ${rfq.subject} - ${rfq.supplier.name}`).join("\n")
        || "Aucune RFQ preparee."
    }
  ];
}

async function runAction(workflow, actorEmail, definition, execute) {
  const action = await store.startAction(
    workflow.id,
    definition.agentKey,
    definition.actionKey,
    definition.label,
    definition.input,
    actorEmail
  );
  try {
    const output = await execute();
    await store.completeAction(action.id, definition.output ? definition.output(output) : output);
    return output;
  } catch (error) {
    await store.failAction(action.id, safeError(error));
    throw error;
  }
}

async function analyzeStep(workflow, actorEmail) {
  const dossier = workflow.dossier;
  const analysis = await runAction(workflow, actorEmail, {
    agentKey: "commercial-ai",
    actionKey: "analyze-opportunity",
    label: "Analyse OpenAI et extraction des exigences",
    input: { opportunityId: workflow.opportunityId },
    output: (result) => ({
      productCount: result.products.length,
      documentCount: result.requiredDocuments.length,
      model: result.model
    })
  }, () => analyzeWorkflowOpportunity(workflowInput(dossier.opportunity)));

  const nextDossier = {
    ...dossier,
    analysis,
    sourceIndex: 0
  };
  return store.advanceWorkflow(workflow.id, {
    status: "running",
    currentStep: analysis.products.length ? "source-suppliers" : "prepare-rfqs",
    dossier: nextDossier,
    estimatedValue: analysis.budget.amount ?? workflow.estimatedValue,
    currency: analysis.budget.currency || workflow.currency
  });
}

async function sourceSuppliersStep(workflow, actorEmail) {
  const dossier = workflow.dossier;
  const products = (dossier.analysis?.products || []).slice(0, MAX_SOURCED_PRODUCTS);
  const index = Math.min(Number(dossier.sourceIndex) || 0, products.length);
  if (!products[index]) {
    return store.advanceWorkflow(workflow.id, {
      status: "running",
      currentStep: "prepare-rfqs",
      dossier,
      estimatedValue: workflow.estimatedValue,
      currency: workflow.currency
    });
  }

  const product = products[index];
  const result = await runAction(workflow, actorEmail, {
    agentKey: "supplier-ai",
    actionKey: "source-suppliers",
    label: `Recherche fournisseurs - ${product.name}`,
    input: { product: product.name, country: dossier.analysis.country },
    output: (saved) => ({
      searchId: saved.id,
      product: product.name,
      supplierCount: saved.suppliers.length,
      model: saved.model
    })
  }, async () => {
    const search = await searchSuppliers({
      category: "other",
      product: product.name,
      countries: [],
      requirements: [
        (dossier.analysis.country || dossier.opportunity.country)
          ? `Destination: ${dossier.analysis.country || dossier.opportunity.country}`
          : "",
        product.quantity ? `Quantite: ${product.quantity}` : "",
        dossier.analysis.deadline ? `Date limite: ${dossier.analysis.deadline}` : "",
        ...(dossier.analysis.requirements || []).slice(0, 8)
      ].filter(Boolean).join("\n")
    });
    return supplierStore.saveSearch(search, actorEmail);
  });

  const sourcing = [
    ...(dossier.sourcing || []),
    {
      product,
      searchId: result.id,
      summary: result.summary,
      suppliers: result.suppliers,
      model: result.model,
      createdAt: result.createdAt
    }
  ];
  const nextIndex = index + 1;
  return store.advanceWorkflow(workflow.id, {
    status: "running",
    currentStep: nextIndex < products.length ? "source-suppliers" : "prepare-rfqs",
    dossier: { ...dossier, sourcing, sourceIndex: nextIndex },
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });
}

async function prepareRfqsStep(workflow, actorEmail) {
  const dossier = workflow.dossier;
  const rfqs = [...(dossier.rfqs || [])];

  await runAction(workflow, actorEmail, {
    agentKey: "supplier-ai",
    actionKey: "prepare-rfqs",
    label: "Preparation des RFQ fournisseurs",
    input: { sourcingCount: (dossier.sourcing || []).length },
    output: () => ({ preparedCount: rfqs.length })
  }, async () => {
    for (const sourcing of dossier.sourcing || []) {
      if (!sourcing.suppliers?.length) continue;
      const supplier = sourcing.suppliers.find((item) => item.commercialEmail)
        || sourcing.suppliers[0];
      const draft = buildRfqDraft({
        searchId: validation.uuid(sourcing.searchId, "searchId"),
        supplierKey: supplier.supplierKey,
        description: sourcing.product.name,
        quantity: sourcing.product.quantity || "A confirmer",
        incoterm: "DAP",
        desiredDelivery: dossier.analysis?.deadline
          ? `Avant le ${String(dossier.analysis.deadline).slice(0, 10)}`
          : "A confirmer",
        paymentTerms: "A convenir apres validation interne"
      }, supplier, sourcing.product.name);
      const saved = await supplierStore.createRfq(
        draft,
        supplier,
        sourcing.product.name,
        actorEmail
      );
      rfqs.push(saved);
    }
    return rfqs;
  });

  return store.advanceWorkflow(workflow.id, {
    status: "running",
    currentStep: "finalize",
    dossier: { ...dossier, rfqs },
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });
}

async function finalizeStep(workflow, actorEmail) {
  const dossier = workflow.dossier;
  const documents = await runAction(workflow, actorEmail, {
    agentKey: "tender-response-ai",
    actionKey: "compile-commercial-file",
    label: "Constitution du dossier commercial unique",
    input: {
      supplierSearches: (dossier.sourcing || []).length,
      rfqs: (dossier.rfqs || []).length
    },
    output: (items) => ({ documentCount: items.length })
  }, async () => documentsFor(dossier));

  return store.advanceWorkflow(workflow.id, {
    status: "completed",
    currentStep: "completed",
    dossier: { ...dossier, documents },
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });
}

async function resumeWorkflow(id, actorEmail) {
  let workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) {
    throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  }
  if (workflow.status === "completed") return workflow;

  workflow = await store.advanceWorkflow(workflow.id, {
    status: "running",
    currentStep: workflow.currentStep,
    dossier: workflow.dossier,
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });

  try {
    if (workflow.currentStep === "analyze") return await analyzeStep(workflow, actorEmail);
    if (workflow.currentStep === "source-suppliers") return await sourceSuppliersStep(workflow, actorEmail);
    if (workflow.currentStep === "prepare-rfqs") return await prepareRfqsStep(workflow, actorEmail);
    if (workflow.currentStep === "finalize") return await finalizeStep(workflow, actorEmail);
    return workflow;
  } catch (error) {
    await store.advanceWorkflow(workflow.id, {
      status: "paused",
      currentStep: workflow.currentStep,
      dossier: workflow.dossier,
      estimatedValue: workflow.estimatedValue,
      currency: workflow.currency,
      lastError: safeError(error)
    });
    throw error;
  }
}

module.exports = {
  AGENTS,
  MAX_SOURCED_PRODUCTS,
  documentsFor,
  resumeWorkflow
};
