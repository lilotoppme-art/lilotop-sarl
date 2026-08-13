"use strict";

const crypto = require("crypto");
const validation = require("../business-radar/validation");
const { analyzeWorkflowOpportunity } = require("./orchestrator-ai");
const { classifyScore } = require("./commercial-ai");
const commercialStore = require("./commercial-store");
const businessStore = require("../business-radar/store");
const { buildRfqDraft, searchSuppliers } = require("./supplier-ai");
const supplierStore = require("./supplier-store");
const documentVaultStore = require("./document-vault-store");
const { prepareVaultFile } = require("./document-vault-files");
const { organizationChartDraftDocx } = require("./generated-documents");
const { buildUnecaEoiArtifacts } = require("./generated-eoi-package");
const organizationProfileStore = require("./organization-profile-store");
const { buildDocumentControl, prepareTenderResponse } = require("./tender-response-ai");
const { extractTenderDocument, extractTenderTableDocument } = require("./tender-response-documents");
const { officialDocumentUrls, officialUrl, retrieveOfficialDocument } = require("./tender-source");
const store = require("./orchestrator-store");
const { authorizeSupplierRfq, buildSupplierCycle, recordSupplierQuotation } = require("./unops-malawi-rfq");

const MAX_SOURCED_PRODUCTS = 3;

const OFFICIAL_SUPPLIER_CONTACTS = Object.freeze({
  abb: Object.freeze({
    manufacturer: "ABB",
    country: "Afrique du Sud - centre de contact ABB Afrique",
    officialSite: "https://global.abb/",
    commercialEmail: "contact.center@za.abb.com",
    contactForm: "https://new.abb.com/africa/about/contact",
    phone: "+27 10 202 6995",
    service: "ABB Contact Center - ventes, RFQ et commandes",
    verificationSource: "https://new.abb.com/docs/librariesprovider77/default-document-library/abb-contact-directory_2019_09.pdf?sfvrsn=78ca6616_2"
  }),
  signify: Object.freeze({
    manufacturer: "Signify",
    country: "Afrique du Sud - couverture Afrique",
    officialSite: "https://www.signify.com/global",
    commercialEmail: "Customercare.africa.lighting@philips.com",
    contactForm: "https://www.signify.com/en-ng/contact",
    phone: "+27 11 471 5000",
    service: "General Lighting inquiries - Africa",
    verificationSource: "https://www.signify.com/en-ng/contact"
  }),
  schneider: Object.freeze({
    manufacturer: "Schneider Electric",
    country: "Afrique du Sud - couverture Malawi",
    officialSite: "https://www.se.com/mw/en/",
    commercialEmail: "za-ccc@schneider-electric.com",
    contactForm: "https://www.se.com/mw/en/work/support/customer-care/contact-schneider-electric.jsp",
    phone: "+27 11 230 5880",
    service: "Schneider Electric Customer Care - Malawi",
    verificationSource: "https://www.se.com/mw/en/"
  })
});

const AGENTS = Object.freeze([
  { key: "business-radar", name: "Business Radar", role: "Detection et contexte de l'opportunite" },
  { key: "mining-watch-ai", name: "Agent Veille Miniere", role: "Detection des signaux" },
  { key: "tender-ai", name: "Agent Appels d'Offres", role: "Qualification de l'opportunite" },
  { key: "commercial-ai", name: "Agent Commercial", role: "Analyse et recommandation" },
  { key: "supplier-ai", name: "Agent Fournisseurs", role: "Sourcing et RFQ" },
  { key: "tender-response-ai", name: "Agent Reponse AO", role: "Constitution du dossier" },
  { key: "dashboard-dg", name: "Dashboard DG", role: "Supervision et validation humaine" }
]);

const DECISIONS = Object.freeze({
  "validate-participation": "Participation validee",
  reject: "Dossier rejete",
  "request-correction": "Correction demandee",
  "validate-prices": "Prix valides",
  "validate-eoi": "Dossier EOI valide pour soumission manuelle",
  "review-eoi-confirmation": "Confirmation DG UNECA enregistree",
  "authorize-rfqs": "Envoi des RFQ autorise",
  "validate-final": "Dossier final valide",
  "authorize-send": "Envoi autorise"
});

const EOI_DG_CONFIRMATION_KEYS = Object.freeze([
  "ungm-vendor-number",
  "ungm-basic",
  "ungm-profile",
  "eligibility-a",
  "eligibility-b",
  "eligibility-c",
  "eligibility-d",
  "eligibility-e",
  "eligibility-f",
  "eligibility-g"
]);

const UNECA_EOI_SUBMISSION_CONFIRMATION = "We have received your expression of interest.";

function markUnecaEoiSubmitted(dossier = {}, submittedAt, actorEmail) {
  if (!isUnecaEoi24536(dossier)) {
    throw Object.assign(new Error("Le dossier EOI UNECA est introuvable"), { code: "VALIDATION_ERROR" });
  }
  const timestamp = new Date(submittedAt || Date.now()).toISOString();
  const submission = {
    reference: "EOIUNECA24536",
    ungmNotice: "306489",
    ungmVendorNumber: "673735",
    organization: "UNECA / Secretariat de l'ONU",
    status: "EOI SUBMITTED",
    phase: "EOI SUBMITTED - WAITING FOR ITB / SOLICITATION DOCUMENTS",
    action: "Expression of Interest submitted manually by DG",
    result: "SUCCESS",
    confirmation: UNECA_EOI_SUBMISSION_CONFIRMATION,
    submittedAt: timestamp,
    submittedBy: actorEmail,
    submissionPerformed: true,
    submissionMethod: "manual-ungm",
    emailSent: false,
    rfqSent: false,
    automaticSubmission: false
  };
  const monitoring = {
    active: true,
    status: "WAITING FOR ITB",
    parentReference: "EOIUNECA24536",
    parentNotice: "306489",
    officialNoticeUrl: "https://www.ungm.org/Public/Notice/306489",
    matchKeys: ["EOIUNECA24536", "306489", "Africa Hall Building", "Electrical Systems", "LTA"],
    watchFor: [
      "Invitation to Bid (ITB)",
      "technical specifications",
      "quantities",
      "commercial conditions",
      "solicitation documents"
    ],
    onMatch: [
      "Attach the new notice to this existing EOI dossier",
      "Download and analyze the official ITB/DAO documents",
      "Extract products, references, specifications and quantities",
      "Recheck eligibility requirements",
      "Reactivate Supplier AI using published specifications only",
      "Prepare RFQ, technical and financial drafts for human validation"
    ],
    externalActionsAutomatic: false,
    activatedAt: timestamp,
    activatedBy: actorEmail
  };
  const review = dossier.uneceSubmissionReview
    ? {
      ...dossier.uneceSubmissionReview,
      progressPercent: 100,
      dgActions: ["Surveiller la publication de l'ITB ou des documents de sollicitation correspondants"],
      conditions: (dossier.uneceSubmissionReview.conditions || []).map((condition) =>
        condition.key === "vendor-response-form"
          ? {
            ...condition,
            status: "EXPRESSION D'INTERET SOUMISE / EOI SUBMITTED",
            proof: `Confirmation UNGM: ${UNECA_EOI_SUBMISSION_CONFIRMATION}`,
            action: "Aucune - attendre la future ITB / les documents de sollicitation",
            completed: true
          }
          : condition
      ),
      vendorResponseForm: dossier.uneceSubmissionReview.vendorResponseForm
        ? {
          ...dossier.uneceSubmissionReview.vendorResponseForm,
          status: "EOI SUBMITTED - CONFIRMATION UNGM ENREGISTREE",
          fields: (dossier.uneceSubmissionReview.vendorResponseForm.fields || []).map(([label, value]) =>
            label === "Electronic response" ? [label, "SOUMISE MANUELLEMENT AVEC SUCCES SUR UNGM"] : [label, value]
          )
        }
        : dossier.uneceSubmissionReview.vendorResponseForm
    }
    : dossier.uneceSubmissionReview;
  const eoi = dossier.uneceEoiSubmission
    ? {
      ...dossier.uneceEoiSubmission,
      recommendation: "EOI SUBMITTED - WAITING FOR ITB / SOLICITATION DOCUMENTS",
      dgValidationItems: [],
      blockingItem: "Aucun blocage EOI. Surveillance de la future ITB active.",
      submissionPerformed: true,
      emailSent: false,
      submittedAt: timestamp,
      ungmConfirmation: UNECA_EOI_SUBMISSION_CONFIRMATION
    }
    : dossier.uneceEoiSubmission;
  const finalValidation = {
    ...(dossier.finalValidation || {}),
    uneceSubmissionReview: review || dossier.finalValidation?.uneceSubmissionReview,
    uneceEoiSubmission: eoi || dossier.finalValidation?.uneceEoiSubmission,
    finalStatus: "EOI SUBMITTED - WAITING FOR ITB"
  };
  return {
    ...dossier,
    pipelineStatus: "eoi-submitted-waiting-itb",
    eoiLifecycle: submission,
    itbMonitoring: monitoring,
    uneceSubmissionReview: review,
    uneceEoiSubmission: eoi,
    finalValidation
  };
}

function eoiDgConfirmationSummary(confirmations = {}) {
  const validated = EOI_DG_CONFIRMATION_KEYS.filter((key) => confirmations[key]?.status === "validated");
  const problems = EOI_DG_CONFIRMATION_KEYS.filter((key) => confirmations[key]?.status === "problem");
  return {
    required: EOI_DG_CONFIRMATION_KEYS.length,
    validated: validated.length,
    problems: problems.length,
    complete: validated.length === EOI_DG_CONFIRMATION_KEYS.length,
    status: validated.length === EOI_DG_CONFIRMATION_KEYS.length
      ? "PRET POUR VALIDATION FINALE DG / EXPRESS INTEREST"
      : "VALIDATION DG REQUISE"
  };
}

function safeError(error) {
  return String(error?.message || "Workflow step failed").slice(0, 900);
}

function workflowInput(opportunity, sourceDocument = null) {
  return {
    title: opportunity.title,
    client: opportunity.organization,
    country: opportunity.country,
    sector: opportunity.sector,
    type: opportunity.opportunityType,
    description: [
      opportunity.description,
      sourceDocument?.extractedText
        ? `CONTENU DU DOCUMENT OFFICIEL RECUPERE (${sourceDocument.filename}):\n${sourceDocument.extractedText}`
        : null
    ].filter(Boolean).join("\n\n").slice(0, 120000),
    sourceUrl: opportunity.sourceUrl,
    deadline: opportunity.deadlineAt,
    estimatedValue: opportunity.estimatedValue,
    currency: opportunity.currency,
    existingSummary: opportunity.aiSummary,
    existingAnalysis: opportunity.aiAnalysis
  };
}

async function retrieveTenderSources(workflow, actorEmail) {
  const existing = await store.listWorkflowDocuments(workflow.id);
  if (existing.length) return existing;
  const urls = officialDocumentUrls(workflow.dossier?.opportunity);
  if (!urls.length) return [];
  return runAction(workflow, actorEmail, {
    agentKey: "business-radar",
    actionKey: "retrieve-official-tender",
    label: "Recuperation du DAO depuis la source officielle",
    input: { documentCount: urls.length },
    output: (documents) => ({
      downloaded: documents.length,
      filenames: documents.map((item) => item.filename),
      sources: documents.map((item) => item.sourceUrl)
    })
  }, async () => {
    const documents = [];
    for (const url of urls) {
      const downloaded = await retrieveOfficialDocument(url);
      documents.push(await store.saveWorkflowDocument(workflow, downloaded));
    }
    return documents;
  });
}

function combinedSourceDocument(documents = []) {
  if (!documents.length) return null;
  const priority = (filename = "") => {
    if (/Section-II|Schedule/i.test(filename)) return 1;
    if (/Instructions/i.test(filename)) return 2;
    if (/Forms-D/i.test(filename)) return 3;
    if (/Forms-A/i.test(filename)) return 4;
    if (/Technical/i.test(filename)) return 5;
    if (/Price/i.test(filename)) return 6;
    return 7;
  };
  const limit = (filename = "") => {
    if (/Section-II|Schedule/i.test(filename)) return 65000;
    if (/Instructions/i.test(filename)) return 25000;
    if (/Forms-D/i.test(filename)) return 4000;
    if (/Forms-A/i.test(filename)) return 6000;
    if (/Technical/i.test(filename)) return 8000;
    return 6000;
  };
  const ordered = [...documents].sort((left, right) => priority(left.filename) - priority(right.filename));
  return {
    ...documents[0],
    extractedText: ordered.map((document) => [
      `DOCUMENT OFFICIEL: ${document.filename}`,
      String(document.extractedText || "").slice(0, limit(document.filename))
    ].join("\n")).join("\n\n").slice(0, 120000)
  };
}

async function attachOfficialSources(id, input, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });

  const values = Array.isArray(input.documentUrls)
    ? input.documentUrls
    : String(input.documentUrls || "").split(/[\r\n,]+/);
  const documentUrls = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 8);
  if (!documentUrls.length) {
    throw Object.assign(new Error("Ajoutez au moins un document officiel."), { code: "VALIDATION_ERROR" });
  }
  documentUrls.forEach((url) => officialUrl(url));

  return runAction(workflow, actorEmail, {
    agentKey: "business-radar",
    actionKey: "attach-official-sources",
    label: "Sources officielles rattachees au dossier existant",
    input: { documentCount: documentUrls.length },
    output: (updated) => ({ workflowId: updated.id, documentCount: documentUrls.length, externalAction: false })
  }, async () => {
    const dossier = workflow.dossier || {};
    const opportunity = dossier.opportunity || {};
    const rawData = {
      ...(opportunity.rawData || {}),
      documentUrls,
      reference: String(input.reference || opportunity.rawData?.reference || "").trim() || null,
      publicationDate: String(input.publicationDate || opportunity.rawData?.publicationDate || "").trim() || null
    };
    return store.advanceWorkflow(workflow.id, {
      status: "running",
      currentStep: "analyze",
      dossier: {
        ...dossier,
        opportunity: { ...opportunity, rawData },
        pipelineStatus: "detected",
        analysis: null,
        sourcing: [],
        rfqs: [],
        supplierComparison: [],
        tenderResponse: null,
        finalValidation: null,
        documents: [],
        sourceIndex: 0,
        tenderSource: {
          ...(dossier.tenderSource || {}),
          reference: rawData.reference,
          publicationDate: rawData.publicationDate,
          retrievalStatus: "referenced",
          documents: []
        }
      },
      estimatedValue: workflow.estimatedValue,
      currency: workflow.currency
    });
  });
}

async function uploadOfficialSource(id, sourceUrl, file, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const verifiedSourceUrl = officialUrl(sourceUrl).href;
  const extracted = await extractTenderDocument(file);
  return runAction(workflow, actorEmail, {
    agentKey: "business-radar",
    actionKey: "upload-official-source",
    label: `Copie officielle rattachee - ${file.filename}`,
    input: { filename: file.filename, sourceUrl: verifiedSourceUrl },
    output: (document) => ({ documentId: document.id, filename: document.filename, externalAction: false })
  }, () => store.saveWorkflowDocument(workflow, {
    sourceUrl: verifiedSourceUrl,
    finalUrl: verifiedSourceUrl,
    filename: file.filename,
    mimeType: file.contentType || "application/octet-stream",
    sizeBytes: file.buffer.length,
    sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    extractedText: extracted.text,
    buffer: file.buffer
  }));
}

function commercialAnalysisFor(analysis) {
  return {
    score: analysis.opportunityScore,
    classification: classifyScore(analysis.opportunityScore),
    executiveSummary: analysis.executiveSummary,
    strengths: [analysis.fitRationale].filter(Boolean),
    risks: analysis.risks || [],
    recommendedActions: analysis.recommendedActions || [],
    model: analysis.model
  };
}

function commercialOpportunityFor(opportunity) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    organization: opportunity.organization || null,
    country: opportunity.country || null,
    sector: opportunity.sector || null,
    opportunity_type: opportunity.opportunityType || null,
    deadline_at: opportunity.deadlineAt || null,
    source_url: opportunity.sourceUrl || null
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
        `## ${entry.product?.name || "Produit a confirmer"}`,
        ...(entry.suppliers || []).map((supplier) => `- ${supplier.name} (${supplier.country}) - ${supplier.reliabilityScore}/100`),
        ...(entry.suppliers || []).length ? [] : ["- Aucun fournisseur exploitable identifie"]
      ].join("\n")).join("\n\n") || "Aucun sourcing disponible."
    },
    {
      key: "rfq-register",
      title: "Registre RFQ",
      type: "markdown",
      content: (dossier.rfqs || []).map((rfq) => `- ${rfq.subject || "RFQ sans objet"} - ${rfq.supplier?.name || "Fournisseur a confirmer"}`).join("\n")
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
  const sourceDocuments = await retrieveTenderSources(workflow, actorEmail);
  const primarySource = combinedSourceDocument(sourceDocuments);
  const dossier = {
    ...workflow.dossier,
    tenderSource: {
      ...workflow.dossier.tenderSource,
      retrievalStatus: primarySource ? "downloaded" : "unavailable",
      retrievedAt: primarySource?.retrievedAt || null,
      reference: workflow.dossier.opportunity?.rawData?.reference || null,
      publicationDate: workflow.dossier.opportunity?.rawData?.publicationDate || null,
      documents: sourceDocuments.map((item) => ({
        id: item.id,
        filename: item.filename,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        sourceUrl: item.sourceUrl,
        retrievedAt: item.retrievedAt
      }))
    }
  };
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
  }, async () => {
    const result = await analyzeWorkflowOpportunity(workflowInput(dossier.opportunity, primarySource));
    await commercialStore.saveAnalysis(
      commercialOpportunityFor(dossier.opportunity),
      commercialAnalysisFor(result),
      actorEmail
    );
    return result;
  });

  const nextDossier = {
    ...dossier,
    analysis,
    pipelineStatus: analysis.lilotopFit ? "analyzed" : "rejected",
    sourceIndex: 0
  };
  if (!analysis.lilotopFit) {
    return store.advanceWorkflow(workflow.id, {
      status: "completed",
      currentStep: "completed",
      dossier: {
        ...nextDossier,
        finalValidation: buildFinalValidation(nextDossier, null, []),
        validations: { ...dossier.validations, participation: "rejected", sending: "blocked" }
      },
      estimatedValue: analysis.budget.amount ?? workflow.estimatedValue,
      currency: analysis.budget.currency || workflow.currency
    });
  }
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
    dossier: { ...dossier, sourcing, sourceIndex: nextIndex, pipelineStatus: "suppliers-researched" },
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
    dossier: { ...dossier, rfqs, pipelineStatus: "rfqs-prepared" },
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });
}

function supplierComparisonFor(dossier) {
  return (dossier.sourcing || []).flatMap((entry) => (entry.suppliers || []).map((supplier) => ({
    product: entry.product?.name || "Produit non renseigne",
    quantity: entry.product?.quantity || "A confirmer",
    supplier: supplier.name,
    country: supplier.country || null,
    source: supplier.website || supplier.sourceUrl || null,
    reliabilityScore: Number(supplier.reliabilityScore) || 0,
    qualityEvidence: supplier.certifications || [],
    price: null,
    leadTime: null,
    incoterm: null,
    priceStatus: "EN ATTENTE DE COTATION FOURNISSEUR",
    risks: supplier.evidence ? [] : ["Informations fournisseur a confirmer"]
  }))).sort((left, right) => right.reliabilityScore - left.reliabilityScore);
}

function tenderDocumentFor(dossier, sourceDocument = null) {
  const opportunity = dossier.opportunity || {};
  const analysis = dossier.analysis || {};
  return {
    sourceFilename: sourceDocument?.filename || opportunity.sourceUrl || "opportunite-business-radar.json",
    sourceType: sourceDocument ? String(sourceDocument.filename).split(".").pop().toLowerCase() : opportunity.sourceUrl ? "url-reference" : "business-radar",
    files: sourceDocument ? [{
      filename: sourceDocument.filename,
      bytes: sourceDocument.sizeBytes,
      extracted: true
    }] : [opportunity.sourceUrl || "Business Radar"],
    text: sourceDocument?.extractedText || JSON.stringify({
      title: opportunity.title,
      client: opportunity.organization,
      country: analysis.country || opportunity.country,
      deadline: analysis.deadline || opportunity.deadlineAt,
      budget: analysis.budget,
      products: analysis.products,
      requirements: analysis.requirements,
      requiredDocuments: analysis.requiredDocuments,
      sourceUrl: opportunity.sourceUrl
    })
  };
}

function supplierCoordinatesVerified(supplier) {
  const emailDomain = String(supplier.commercialEmail || "").split("@")[1]?.toLowerCase() || "";
  if (!emailDomain) return false;
  try {
    const websiteDomain = new URL(supplier.website || supplier.sourceUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return websiteDomain === emailDomain
      || websiteDomain.endsWith(`.${emailDomain}`)
      || emailDomain.endsWith(`.${websiteDomain}`);
  } catch {
    return false;
  }
}

function officialSupplierContact(supplier) {
  const normalized = String(supplier?.name || "").trim().toLowerCase();
  if (/^abb(?:\b|\s|$)/.test(normalized)) return OFFICIAL_SUPPLIER_CONTACTS.abb;
  if (/^signify(?:\b|\s|$)/.test(normalized)) return OFFICIAL_SUPPLIER_CONTACTS.signify;
  if (/^schneider electric(?:\b|\s|$)/.test(normalized)) return OFFICIAL_SUPPLIER_CONTACTS.schneider;
  return null;
}

function requirementAction(row) {
  if (row.actionRequired) return row.actionRequired;
  if (row.status === "confirmed") return "Ajouter une confirmation ou capture officielle UNGM au Coffre";
  if (row.status === "available") return "Aucune - document reel et utilisable";
  if (row.status === "expired") return "A FOURNIR PAR LILOTOP - remplacer par une version valide";
  if (row.key === "organization-chart") {
    return "GÉNÉRABLE PAR NEXUS - après validation des fonctions et identités";
  }
  if (/vendor response form/i.test(row.document)) {
    return "GÉNÉRABLE PAR NEXUS - depuis le formulaire UNGM officiel, avec validation humaine";
  }
  return "A FOURNIR PAR LILOTOP";
}

function isUnecaEoi24536(dossier = {}) {
  const values = [
    dossier.analysis?.tenderNumber,
    dossier.tenderResponse?.keyInformation?.tenderNumber,
    dossier.opportunity?.reference,
    dossier.opportunity?.sourceUrl,
    dossier.opportunity?.title
  ];
  return values.some((value) => /EOIUNECA24536|ungm\.org\/Public\/Notice\/306489/i.test(String(value || "")));
}

function buildUnecaEoiCompliance(credential) {
  const registrationConfirmed = credential?.status === "registered";
  const profileConfirmed = credential?.details?.profileVerifiedByDg === true;
  const eligibilityConfirmed = credential?.details?.eligibilityDeclaration?.status === "validated"
    && credential?.details?.eligibilityDeclaration?.conditionsCount === 7;
  const rows = [
    {
      key: "ungm-registration",
      document: "Inscription UNGM sous le nom legal complet et profil soumis au Secretariat de l'ONU",
      status: registrationConfirmed ? (credential.evidencePresent ? "available" : "confirmed") : "missing",
      matchingDocument: registrationConfirmed ? `Inscription UNGM LILOTOP SARL - ${credential.registrationNumber}` : null,
      source: registrationConfirmed ? `Profil permanent LILOTOP / CRM - UNGM ${credential.registrationNumber}` : null,
      sourceFilename: null,
      filePresent: Boolean(credential?.evidencePresent),
      usableInTenders: registrationConfirmed,
      registrationNumber: credential?.registrationNumber || null,
      sourcePage: "DAO EOIUNECA24536, pages 2 a 4",
      actionRequired: credential?.evidencePresent
        ? "Aucune"
        : registrationConfirmed
          ? "Verifier le profil UNGM actif et ajouter une preuve officielle au Coffre"
          : "A FOURNIR PAR LILOTOP - confirmer l'inscription UNGM"
    },
    {
      key: "ungm-profile-current",
      document: "Profil UNGM et informations fournisseur maintenus a jour",
      status: profileConfirmed ? "confirmed" : "missing",
      matchingDocument: profileConfirmed ? "Profil UNGM verifie et mis a jour par le DG" : null,
      source: profileConfirmed ? "Validation humaine DG dans le portail UNGM" : null,
      sourcePage: "DAO EOIUNECA24536, page 4 - For Registered Vendors",
      actionRequired: profileConfirmed ? "Aucune" : "Verifier et actualiser dans UNGM les informations et documents du profil fournisseur"
    },
    {
      key: "vendor-response-form",
      document: "Vendor Response Form transmis electroniquement avant le 14 aout 2026",
      status: "confirmed",
      sourcePage: "DAO EOIUNECA24536, pages 2 et 3",
      actionRequired: "Dossier EOI prepare; effectuer uniquement l'action humaine Express interest apres validation finale DG"
    },
    {
      key: "ungm-eligibility-declarations",
      document: "Declaration d'eligibilite UNGM couvrant les sept conditions officielles A a G",
      status: eligibilityConfirmed ? "confirmed" : "generable",
      sourcePage: "DAO EOIUNECA24536, page 4 - Prerequisites for Eligibility",
      actionRequired: eligibilityConfirmed ? "Aucune" : "GENERABLE PAR NEXUS - preparer la checklist A a G; validation DG requise"
    }
  ];
  const satisfied = rows.filter((row) => ["available", "confirmed"].includes(row.status));
  return {
    rows,
    availableDocuments: satisfied.map((row) => row.document),
    expiredDocuments: [],
    missingDocuments: rows.filter((row) => row.status === "missing").map((row) => row.document),
    generableDocuments: rows.filter((row) => row.status === "generable").map((row) => row.document),
    compliancePercent: Math.round((satisfied.length / rows.length) * 100),
    documentaryReadinessPercent: 100,
    documentSubmissionRequired: false,
    realRequirementCount: rows.length
  };
}

async function ensureOrganizationChartDraft(actorEmail) {
  const title = "Organigramme LILOTOP SARL - Brouillon";
  const buffer = organizationChartDraftDocx();
  const prepared = await prepareVaultFile({
    filename: "LILOTOP-Organigramme-Brouillon.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer
  });
  const existing = (await documentVaultStore.listDocuments({ search: title }))
    .find((item) => item.title === title);
  if (existing?.sha256 === prepared.sha256) return existing;
  return documentVaultStore.saveVersion({
    documentId: existing?.id || "",
    title,
    category: "administrative",
    description: "Brouillon d'organigramme conserve pour les futurs appels d'offres. Validation DG requise avant utilisation.",
    version: existing ? `brouillon-${prepared.sha256.slice(0, 8)}` : "brouillon-v1",
    issuedOn: "",
    expiresOn: "",
    notes: "Ne pas joindre automatiquement. Fonctions inconnues marquees A COMPLETER.",
    organizationName: "LILOTOP SARL",
    usableForTenders: false
  }, prepared, actorEmail);
}

function buildUnecaSubmissionReview(dossier, credential, organizationChartDocument = null) {
  const lilotopProfile = {
    legalName: "LILOTOP SARL",
    ungmVendorNumber: "673735",
    address: "Boulevard du 30 Juin, no 144, Immeuble Didi, 3eme niveau, Kinshasa/Gombe",
    cityState: "Kinshasa / Kinshasa",
    country: "Democratic Republic of the Congo",
    postalCode: "N/A - aucun code postal verifie dans les sources LILOTOP",
    phone: "+243 800 982 436",
    email: "contact@lilotopsarl.com",
    website: "https://lilotopsarl.com",
    legalRepresentative: "Joel Kongolo Tshingoma",
    legalRole: "Gerant; Founder & Chief Executive Officer (CEO)",
    fax: "N/A",
    rccm: "CD/KIN/RCCM/16-B-8380",
    nationalId: "01-9-N04151K",
    taxNumber: "A1605834A"
  };
  const registrationConfirmed = credential?.status === "registered"
    && credential?.registrationNumber === "673735";
  const profileConfirmed = credential?.details?.profileVerifiedByDg === true;
  const eligibilityConfirmed = credential?.details?.eligibilityDeclaration?.status === "validated"
    && credential?.details?.eligibilityDeclaration?.conditionsCount === 7;
  const conditions = [
    {
      key: "ungm-registration",
      title: "Nom legal complet dans UNGM et demande soumise au Secretariat de l'ONU",
      daoText: '"registered under its full legal name"',
      page: "Page 3 - Vendor Response",
      status: registrationConfirmed ? "ENREGISTRE / CONFIRME" : "A CONFIRMER PAR LE DG",
      proof: registrationConfirmed ? "UNGM Vendor Number 673735 et inscription Basic soumis avec succes, confirmes par le DG" : "Aucune preuve disponible",
      action: registrationConfirmed ? "Aucune" : "Ouvrir My Submission Statuses et confirmer le statut Registered au niveau Basic avec UN Secretariat",
      completed: registrationConfirmed
    },
    {
      key: "ungm-profile-current",
      title: "Profil UNGM maintenu a jour et nom legal exact",
      daoText: '"information and documentation ... are up to date"',
      page: "Page 4 - For Registered Vendors",
      status: profileConfirmed ? "VERIFIE ET MIS A JOUR PAR LE DG" : "A VALIDER PAR LE DG",
      proof: profileConfirmed
        ? `Validation humaine DG; coordonnees verifiees; ${credential.details.registeredOrganizations || 0} organismes; familles electriques mises a jour`
        : "Le profil detaille UNGM n'est pas public et n'est pas accessible a NEXUS sans session autorisee",
      action: profileConfirmed ? "Aucune" : "Confirmer le nom legal, l'adresse, le contact, les codes UNSPSC et l'absence du statut Profile to update",
      completed: profileConfirmed
    },
    {
      key: "vendor-response-form",
      title: "Expression d'interet transmise electroniquement avant l'echeance",
      daoText: '"Vendor Response Form ... electronically"',
      page: "Pages 2-3",
      status: "PRET POUR VALIDATION FINALE DG - EXPRESS INTEREST NON EFFECTUE",
      proof: "Dossier interne NEXUS prepare; aucune transmission UNGM effectuee",
      action: "Valider le dossier puis utiliser manuellement Express interest avant le 14 aout 2026 a 23:59 GMT-4",
      completed: true
    },
    {
      key: "ungm-eligibility-seven-conditions",
      title: "Declaration des sept conditions officielles d'eligibilite UNGM A-G",
      daoText: '"Declaration of Eligibility - seven statements"',
      page: "Pages 3-4",
      status: eligibilityConfirmed ? "VALIDEE PAR LE DG DANS UNGM" : "A CONFIRMER PAR LE DG",
      proof: eligibilityConfirmed
        ? "Le DG a verifie les sept conditions officielles et enregistre l'option confirmant leur respect dans UNGM"
        : "Brouillons de declarations prepares; aucune auto-attestation par NEXUS",
      action: eligibilityConfirmed ? "Aucune" : "Confirmer individuellement A, B, C, D, E, F et G puis enregistrer la declaration",
      completed: eligibilityConfirmed
    }
  ];
  const vendorResponseForm = {
    status: "INFORMATIONS PREPAREES - ACTION UNGM NON EFFECTUEE",
    submissionMode: "Le DAO ne contient aucun formulaire papier. Reponse officielle: bouton Express interest sur l'avis UNGM 306489.",
    fields: [
      ["Organization", "United Nations Economic Commission for Africa (UNECA)"],
      ["Procurement officer", "Solomon Gebreegziabher"],
      ["EOI reference", "EOIUNECA24536"],
      ["EOI subject", "Procurement of Spare Parts to Reinstate the Electrical Systems of Africa Hall Building - LTA"],
      ["UNGM Vendor ID Number", lilotopProfile.ungmVendorNumber],
      ["Legal Company Name", lilotopProfile.legalName],
      ["Company Contact", `${lilotopProfile.legalRepresentative} - ${lilotopProfile.legalRole}`],
      ["Address", lilotopProfile.address],
      ["City / State", lilotopProfile.cityState],
      ["Postal Code", lilotopProfile.postalCode],
      ["Country", lilotopProfile.country],
      ["Phone Number", lilotopProfile.phone],
      ["Fax Number", lilotopProfile.fax],
      ["Email Address", lilotopProfile.email],
      ["Company Website", lilotopProfile.website],
      ["RCCM", lilotopProfile.rccm],
      ["National Identification", lilotopProfile.nationalId],
      ["Tax Number", lilotopProfile.taxNumber],
      ["UNGM Basic status with UN Secretariat", registrationConfirmed ? "ENREGISTRE / CONFIRME" : "A VALIDER PAR LE DG DANS UNGM"],
      ["Organizations currently registered", profileConfirmed ? String(credential.details.registeredOrganizations || 29) : "A VALIDER PAR LE DG"],
      ["Eligibility declarations A-G", eligibilityConfirmed ? "VALIDEE PAR LE DG" : "A VALIDER PAR LE DG"],
      ["Electronic response", "A EFFECTUER MANUELLEMENT VIA EXPRESS INTEREST"]
    ],
    knownAddresses: [
      "2266 Avenue des Aviateurs, quartier Tshangalele, Lubumbashi",
      "Boulevard du 30 Juin, no 144, Immeuble Didi, 3eme niveau, Kinshasa/Gombe"
    ]
  };
  const eligibility = [
    ["A", "The company, its parent entities, subsidiaries or affiliates are not listed on, or associated with a company or individual listed on, the United Nations Security Council Consolidated Sanctions List or the IIC Oil-for-Food List, unless disclosed in writing to the UN Procurement Division."],
    ["B", "The company, its parent entities, subsidiaries or affiliates are not currently removed or suspended by the United Nations or any other UN organization, including the World Bank."],
    ["C", "The company, its parent entities, subsidiaries or affiliates are not under formal investigation and have not been sanctioned within the preceding three years by any national authority of a United Nations Member State for proscribed practices, including corruption, fraud, coercion, collusion, obstruction or other unethical practice."],
    ["D", "The company has not declared bankruptcy, is not involved in bankruptcy or receivership proceedings, and there is no judgment or pending legal action that could impair its operations in the foreseeable future."],
    ["E", "The company does not employ, or anticipate employing, any person who is or was a United Nations staff member within the last year where that person had prior professional dealings with the vendor during the last three years of UN service, in accordance with ST/SGB/2006/15."],
    ["F", "The company undertakes not to engage in proscribed practices in connection with the United Nations or any other party and to conduct business in a manner that avoids financial, operational, reputational or other undue risk to the United Nations."],
    ["G", "The company, its parent entities, subsidiaries or affiliates have no history of litigation with a United Nations entity."]
  ].map(([key, requirement]) => ({
    key,
    requirement,
    response: eligibilityConfirmed ? "OUI - VALIDE PAR LE DG DANS UNGM" : "OUI - PROPOSITION A VALIDER PAR LE DG",
    proof: eligibilityConfirmed
      ? "Validation humaine DG enregistree dans la Declaration d'eligibilite officielle UNGM"
      : "Confirmation explicite de la Direction Generale requise",
    status: eligibilityConfirmed ? "CONFORME" : "A CONFIRMER",
    declarationDraft: eligibilityConfirmed
      ? `LILOTOP SARL confirme satisfaire a la condition ${key}, validation enregistree par le DG dans UNGM.`
      : `LILOTOP SARL declare, sous reserve de validation et signature de la Direction Generale, satisfaire a la condition ${key}.`
  }));
  const supplierRfqs = dossier.finalValidation?.supplierRfqs || [];
  return {
    reference: "EOIUNECA24536",
    conditions,
    progressPercent: Math.round((conditions.filter((item) => item.completed).length / conditions.length) * 100),
    vendorResponseForm,
    eligibility,
    dgActions: [
      "Effectuer la validation finale DG du dossier EOI",
      "Ouvrir l'avis UNGM 306489 puis cliquer manuellement sur Express interest"
    ],
    organizationChart: organizationChartDocument ? {
      id: organizationChartDocument.id,
      versionId: organizationChartDocument.versionId,
      filename: organizationChartDocument.sourceFilename,
      status: "BROUILLON CONSERVE DANS LE COFFRE - NON JOINT A UNECA"
    } : null,
    commercialScope: {
      families: [
        { code: "39100000", label: "Lampes" },
        { code: "39110000", label: "Eclairages" },
        { code: "39120000", label: "Equipements" },
        { code: "39130000", label: "Dispositifs pour l'administration du cablage electrique" }
      ],
      specifications: "NON PUBLIEES - annoncees dans la future ITB",
      quantities: "NON PUBLIEES - aucune quantite dans l'EOI",
      rfqs: supplierRfqs.map((rfq) => ({
        supplier: rfq.manufacturer || rfq.supplier,
        product: rfq.product,
        status: "BROUILLON - SPECIFICATIONS ET QUANTITES EN ATTENTE"
      }))
    },
    lilotopProfile,
    ungmComparison: {
      automaticallyAccessible: false,
      divergences: [],
      note: profileConfirmed
        ? "Profil UNGM, coordonnees et familles electriques verifies et mis a jour manuellement par le DG; aucune divergence signalee."
        : "Le profil fournisseur detaille UNGM est prive et doit etre verifie par le DG."
    }
  };
}

function buildUnecaEoiSubmission(review) {
  const responseFields = review.vendorResponseForm.fields;
  const dgFields = [
    "Relire et valider la fiche finale DG",
    "Cliquer manuellement sur Express interest dans l'avis UNGM 306489"
  ];
  const letter = [
    "Dear Mr. Gebreegziabher,",
    "LILOTOP SARL, UNGM Vendor Number 673735, hereby expresses its interest in EOIUNECA24536 concerning the procurement of spare parts to reinstate the electrical systems of the Africa Hall Building under a future long-term agreement.",
    "LILOTOP SARL provides industrial procurement and supply-chain coordination services. Subject to the detailed specifications and quantities to be issued with the future Invitation to Bid, our intended scope covers electrical systems and lighting supplies, lamps and lamp components, and lighting fixtures and accessories.",
    "We understand that this EOI is a preliminary market-engagement stage, that detailed specifications will be issued later, and that no price or technical commitment is requested at this stage. Any future offer will rely only on validated manufacturer information, supplier quotations and the final ITB requirements.",
    "Our UNGM Vendor Number is 673735. Our Basic registration, supplier profile, electrical goods and services families, and the seven official eligibility declarations have been reviewed and confirmed by LILOTOP SARL's authorized representative.",
    "Yours faithfully,",
    "Joel Kongolo - Founder & Chief Executive Officer (CEO)",
    "LILOTOP SARL | contact@lilotopsarl.com | https://lilotopsarl.com"
  ].join("\n\n");
  const emailDraft = [
    "FALLBACK ONLY - USE ONLY IF THE UNGM ELECTRONIC RESPONSE CANNOT BE COMPLETED",
    "To: gebreegziabhers@un.org",
    "Subject: EOIUNECA24536 - Expression of Interest - LILOTOP SARL - UNGM 673735",
    "Dear Mr. Gebreegziabher,",
    "LILOTOP SARL (UNGM Vendor Number 673735) intends to express interest electronically in EOIUNECA24536. We are contacting you only because of a technical difficulty with the UNGM electronic response and request your instructions.",
    "No document is attached unless UNECA specifically requests it.",
    "Yours faithfully,",
    "Joel Kongolo | LILOTOP SARL | contact@lilotopsarl.com"
  ].join("\n\n");
  const control = [
    { label: "Full legal name and UNGM application submitted to UN Secretariat", status: review.conditions[0].completed ? "CONFORME" : "A COMPLETER", action: review.conditions[0].action },
    { label: "UNGM profile and documentation up to date", status: review.conditions[1].completed ? "CONFORME" : "A COMPLETER", action: review.conditions[1].action },
    { label: "EOI package ready for electronic Express interest", status: review.conditions[2].completed ? "CONFORME" : "A COMPLETER", action: review.conditions[2].action },
    { label: "Seven official eligibility declarations A-G", status: review.conditions[3].completed ? "CONFORME" : "A COMPLETER", action: review.conditions[3].action },
    { label: "Required attachments at EOI stage", status: "CONFORME", action: "No attachment required; do not add unsolicited documents" },
    { label: "Prices, quantities and detailed specifications", status: "CONFORME", action: "Not requested or published at this EOI stage" }
  ];
  return {
    reference: "EOIUNECA24536",
    subject: "Procurement of Spare Parts to Reinstate the Electrical Systems of Africa Hall Building - LTA",
    deadline: "14 August 2026, 23:59 (GMT-4)",
    channel: "UNGM notice 306489 - electronic Express interest. Email to gebreegziabhers@un.org only if electronic submission is technically impossible.",
    responseFields,
    dgFields,
    letter,
    eligibility: review.eligibility,
    requiredDocuments: [],
    emailDraft,
    control,
    eligibilityPercent: Math.round((review.eligibility.filter((item) => item.status === "CONFORME").length / 7) * 100),
    dossierPercent: Math.round((responseFields.filter(([, value]) => !/A VALIDER|A EFFECTUER/.test(value)).length / responseFields.length) * 100),
    rejectionRisk: "AUCUN BLOCAGE DE CONFORMITE IDENTIFIE; L'ACTION EXPRESS INTEREST RESTE MANUELLE",
    recommendation: "PRET POUR VALIDATION FINALE DG / EXPRESS INTEREST",
    readyItems: [
      "Identite LILOTOP, coordonnees et informations legales reprises des sources internes verifiees",
      "UNGM Vendor Number 673735 et reference EOIUNECA24536 renseignes",
      "Lettre EOI, declarations A-G et dossier interne PDF/ZIP prepares",
      "Aucun document, prix, quantite ou specification detaillee requis a cette etape"
    ],
    dgValidationItems: dgFields,
    blockingItem: "Aucun blocage de conformite identifie. Seule l'action humaine Express interest reste a effectuer.",
    expressInterestPayload: [
      "Avis UNGM 306489 / reference EOIUNECA24536",
      "Fournisseur: LILOTOP SARL / UNGM Vendor Number 673735",
      "Action non contraignante: Express interest",
      "Codes UNSPSC: 39100000, 39110000, 39120000, 39130000",
      "Aucune piece jointe et aucune information de prix a transmettre a cette etape"
    ],
    ungmComparison: review.ungmComparison,
    submissionPerformed: false,
    emailSent: false
  };
}

async function ensureUnecaEoiPackage(workflow, submission) {
  const artifacts = buildUnecaEoiArtifacts(submission);
  const sourceUrl = "https://www.ungm.org/Public/Notice/306489";
  const save = (filename, mimeType, buffer, extractedText) => store.saveWorkflowDocument(workflow, {
    sourceUrl,
    finalUrl: `nexus://unece-eoi/${filename}`,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    extractedText,
    buffer
  });
  const [pdf, zip] = await Promise.all([
    save("UNECA-EOIUNECA24536-DG-Review.pdf", "application/pdf", artifacts.pdf, artifacts.extractedText),
    save("UNECA-EOIUNECA24536-DG-Review.zip", "application/zip", artifacts.zip, "Internal DG review package. No automatic submission or email.")
  ]);
  return {
    status: "PREPARE POUR VALIDATION DG - NON SOUMIS",
    pdf,
    zip,
    documentsRequiredByEoi: 0,
    attachmentsIncluded: 0
  };
}

function applyOrganizationCredential(compliance, credential) {
  if (!credential || credential.status !== "registered") return compliance;
  const rows = (compliance.rows || compliance.documentControl || []).map((row) => {
    if (!/UNGM registration completed under full legal name/i.test(row.document)) return row;
    return {
      ...row,
      status: credential.evidencePresent ? "available" : "confirmed",
      matchingDocument: `Inscription UNGM LILOTOP SARL - ${credential.registrationNumber}`,
      source: `Profil permanent LILOTOP / CRM - UNGM ${credential.registrationNumber}`,
      sourceFilename: null,
      filePresent: credential.evidencePresent,
      usableInTenders: true,
      registrationNumber: credential.registrationNumber,
      actionRequired: credential.evidencePresent
        ? "Aucune"
        : "Ajouter une confirmation ou capture officielle UNGM au Coffre"
    };
  });
  const satisfied = rows.filter((row) => ["available", "confirmed"].includes(row.status));
  const expired = rows.filter((row) => row.status === "expired");
  const missing = rows.filter((row) => row.status === "missing");
  return {
    rows,
    documentControl: rows,
    availableDocuments: satisfied.map((row) => row.document),
    expiredDocuments: expired.map((row) => row.document),
    missingDocuments: missing.map((row) => row.document),
    compliancePercent: rows.length ? Math.round((satisfied.length / rows.length) * 100) : 0
  };
}

function scopeComplianceToRequirements(compliance, requiredDocuments) {
  const requirements = Array.isArray(requiredDocuments)
    ? requiredDocuments.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!requirements.length) return compliance;
  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const rows = (compliance.rows || compliance.documentControl || []).filter((row) => {
    const document = normalize(row.document);
    return requirements.some((requirement) => {
      const candidate = normalize(requirement);
      return candidate === document
        || candidate.startsWith(`${document} `)
        || document.startsWith(`${candidate} `);
    });
  }).map((row) => /^Form [A-D]:/i.test(row.document) && row.status === "missing"
    ? {
      ...row,
      status: "generable",
      actionRequired: "GENERABLE PAR NEXUS - completer avec les donnees validees puis faire signer par le DG"
    }
    : row);
  const available = rows.filter((row) => ["available", "confirmed"].includes(row.status));
  const expired = rows.filter((row) => row.status === "expired");
  const missing = rows.filter((row) => row.status === "missing");
  const generable = rows.filter((row) => row.status === "generable");
  return {
    ...compliance,
    rows,
    documentControl: rows,
    availableDocuments: available.map((row) => row.document),
    expiredDocuments: expired.map((row) => row.document),
    missingDocuments: missing.map((row) => row.document),
    generableDocuments: generable.map((row) => row.document),
    compliancePercent: rows.length ? Math.round((available.length / rows.length) * 100) : 0
  };
}

function documentMatrixFor(response) {
  return (response.compliance?.documentControl || []).map((row) => ({
    requirement: row.document,
    matchingDocument: row.matchingDocument || null,
    filename: row.sourceFilename || null,
    availability: ["available", "confirmed"].includes(row.status) ? "PRESENT" : "MANQUANT",
    validity: row.status === "available" ? "VALIDE" : row.status === "expired" ? "EXPIRE" : row.status === "generable" ? "A VALIDER" : "NON UTILISABLE OU ABSENT",
    statusLabel: row.status === "available"
      ? "DISPONIBLE ET VALIDE"
      : row.status === "expired"
        ? "DISPONIBLE MAIS EXPIRÉ"
        : row.status === "confirmed"
          ? "INFORMATION CONFIRMÉE – PREUVE À AJOUTER"
          : row.status === "generable"
            ? "GÉNÉRABLE PAR NEXUS"
            : requirementAction(row).startsWith("GÉNÉRABLE PAR NEXUS")
              ? "GÉNÉRABLE PAR NEXUS"
              : "MANQUANT",
    issuedOn: row.issuedOn || null,
    expiration: row.expiration || null,
    requirementLevel: String(row.key || "").startsWith("dao-") ? "OBLIGATOIRE" : "CONDITIONNEL",
    storageLocation: row.storageLocation || null,
    sourcePage: row.sourcePage || null,
    actionRequired: requirementAction(row)
  }));
}

function organizationChartDraft() {
  return {
    title: "Organigramme LILOTOP SARL",
    status: "À VALIDER PAR LA DIRECTION GÉNÉRALE",
    note: "Fonction non confirmée = À COMPLÉTER. Aucun nom ni poste n'est inventé.",
    nodes: [
      { level: 0, name: "Joël Kongolo", role: "Founder & Chief Executive Officer (CEO)", confirmed: true },
      { level: 1, name: "À COMPLÉTER", role: "À COMPLÉTER", confirmed: false },
      { level: 1, name: "À COMPLÉTER", role: "À COMPLÉTER", confirmed: false },
      { level: 1, name: "À COMPLÉTER", role: "À COMPLÉTER", confirmed: false },
      { level: 1, name: "À COMPLÉTER", role: "À COMPLÉTER", confirmed: false }
    ]
  };
}

function confirmLilotopUngmRegistration(actorEmail) {
  return organizationProfileStore.confirmCredential({
    organizationName: "LILOTOP SARL",
    platform: "UNGM",
    status: "registered",
    registrationNumber: "673735",
    details: {
      basicStatus: "registered-confirmed",
      basicStatusLabel: "ENREGISTRE / CONFIRME",
      registeredOrganizations: 29,
      profileVerified: true,
      profileVerifiedByDg: true,
      contactsVerified: true,
      goodsServicesCodes: [
        { code: "39100000", label: "Lampes" },
        { code: "39110000", label: "Eclairages" },
        { code: "39120000", label: "Equipements" },
        { code: "39130000", label: "Dispositifs pour l'administration du cablage electrique" }
      ],
      eligibilityDeclaration: {
        status: "validated",
        conditionsCount: 7,
        validatedByDg: true
      },
      source: "verification manuelle du portail UNGM par le DG"
    }
  }, actorEmail);
}

function buildFinalValidation(dossier, tenderResponse, comparison) {
  const analysis = dossier.analysis || {};
  const opportunity = dossier.opportunity || {};
  const recommended = comparison[0] || null;
  const response = tenderResponse || {};
  const documentMatrix = documentMatrixFor(response);
  const quotationLines = comparison.map((item) => ({
    product: item.product,
    supplier: item.supplier,
    source: item.source || null,
    quantity: item.quantity || "A confirmer",
    priceStatus: "EN ATTENTE DE COTATION FOURNISSEUR",
    unitPrice: null,
    transport: null,
    insurance: null,
    dutiesAndTaxes: null,
    localLogistics: null,
    landedCostDrc: null
  }));
  const supplierRfqs = (dossier.rfqs || []).slice(0, MAX_SOURCED_PRODUCTS).map((rfq) => {
    const supplier = rfq.supplier || {};
    const officialContact = officialSupplierContact(supplier);
    const coordinatesVerified = officialContact ? true : supplierCoordinatesVerified(supplier);
    const product = rfq.product || rfq.description || "Produit a confirmer";
    const quantity = rfq.quantity || "A confirmer";
    const responseDeadline = rfq.responseDeadline || "A definir par la DG";
    const destination = analysis.country || opportunity.country || "A confirmer";
    const readyToSend = coordinatesVerified
      && !/a confirmer/i.test(quantity)
      && !/a definir/i.test(responseDeadline)
      && Boolean(rfq.description);
    return {
      id: rfq.id,
      supplier: officialContact?.manufacturer || supplier.name || "Fournisseur a confirmer",
      manufacturer: officialContact?.manufacturer || supplier.name || "A confirmer",
      product,
      country: officialContact?.country || supplier.country || "A confirmer",
      officialSite: officialContact?.officialSite || supplier.website || supplier.sourceUrl || null,
      commercialEmail: officialContact?.commercialEmail || supplier.commercialEmail || null,
      contactForm: officialContact?.contactForm || null,
      phone: officialContact?.phone || supplier.phone || null,
      recipientService: officialContact?.service || "Service commercial a confirmer",
      verificationSource: officialContact?.verificationSource || supplier.website || supplier.sourceUrl || null,
      coordinatesVerified,
      subject: rfq.subject || `RFQ LILOTOP SARL - ${product}`,
      specifications: rfq.description || "Specifications a confirmer",
      quantity,
      incoterm: rfq.incoterm || "DAP",
      destination,
      desiredDelivery: rfq.desiredDelivery || "À confirmer",
      responseDeadline,
      plannedAttachments: ["Specifications techniques officielles du marche - a joindre apres validation du lot retenu"],
      status: rfq.status || "draft",
      readyToSend
    };
  });
  const missingDocuments = response.compliance?.missingDocuments || analysis.requiredDocuments || [];
  const risks = [...new Set([...(analysis.risks || []), ...(response.risks || [])])]
    .filter((risk) => response.compliance?.documentSubmissionRequired !== false
      || !/\d+ document\(s\) restent manquants ou non utilisables/i.test(String(risk)));
  const status = response.compliance?.documentSubmissionRequired === false
    ? quotationLines.length
      ? "EN ATTENTE DE COTATIONS"
      : "CORRECTION REQUISE"
    : missingDocuments.length
      ? "DOCUMENTS MANQUANTS"
      : quotationLines.length
        ? "EN ATTENTE DE COTATIONS"
        : "CORRECTION REQUISE";
  return {
    client: opportunity.organization || response.keyInformation?.client || "A confirmer",
    marketObject: opportunity.title || response.keyInformation?.subject || "A confirmer",
    deadline: analysis.deadline || opportunity.deadlineAt || response.keyInformation?.deadline || null,
    opportunityScore: Number(analysis.opportunityScore ?? opportunity.score) || 0,
    priority: analysis.priority || "moyen",
    compliancePercent: Number(response.compliance?.compliancePercent) || 0,
    documentaryReadinessPercent: Number(response.compliance?.documentaryReadinessPercent ?? response.compliance?.compliancePercent) || 0,
    documentSubmissionRequired: response.compliance?.documentSubmissionRequired !== false,
    recommendedSupplier: recommended?.supplier || null,
    recommendationBasis: recommended ? "Fiabilite documentaire; cotation et delai a valider" : null,
    purchaseCost: null,
    proposedSalePrice: null,
    currency: analysis.budget?.currency || opportunity.currency || null,
    estimatedMargin: null,
    risks,
    missingDocuments,
    expiredDocuments: response.compliance?.expiredDocuments || [],
    technicalOffer: response.generatedDocuments?.technicalOffer || "Brouillon non genere.",
    financialOffer: response.generatedDocuments?.financialOfferTemplate || "Prix a completer avec des donnees validees.",
    submissionLetter: response.generatedDocuments?.submissionLetter || "Brouillon non genere.",
    emailDraft: [
      `Objet : Soumission LILOTOP SARL - ${opportunity.title || "Appel d'offres"}`,
      "",
      "Madame, Monsieur,",
      "",
      "Veuillez trouver ci-joint le dossier de soumission de LILOTOP SARL, sous reserve de validation finale interne.",
      "",
      "Cordialement,",
      "LILOTOP SARL"
    ].join("\n"),
    remainingActions: [
      "Valider la participation",
      "Obtenir et comparer les cotations fournisseurs",
      "Completer et valider les prix",
      "Verifier les documents manquants ou expires",
      "Valider le dossier final",
      "Autoriser manuellement l'envoi"
    ],
    quotationLines,
    supplierRfqs,
    documentMatrix,
    organizationChartDraft: organizationChartDraft(),
    uneceSubmissionReview: dossier.uneceSubmissionReview || null,
    documentSummary: {
      available: documentMatrix.filter((item) => item.availability === "PRESENT").length,
      total: documentMatrix.length,
      toProcess: documentMatrix.filter((item) => item.availability !== "PRESENT").length
    },
    rfqSummary: {
      prepared: supplierRfqs.length,
      contactsVerified: supplierRfqs.filter((item) => item.coordinatesVerified).length,
      sent: 0,
      readyToSend: supplierRfqs.filter((item) => item.readyToSend).length
    },
    pricingSummary: {
      quotationsReceived: 0,
      landedCost: "EN ATTENTE",
      margin: "EN ATTENTE",
      financialOffer: "INCOMPLETE"
    },
    rfqSendingAuthorized: dossier.validations?.rfqSending === "authorized",
    quotationsReceived: 0,
    quotationsMissing: quotationLines.length,
    totalLandedCost: null,
    estimatedProfit: null,
    successProbability: response.keyInformation?.evaluation?.winProbability || null,
    nexusRecommendation: status,
    finalStatus: status,
    sendEnabled: false,
    submissionEnabled: false
  };
}

async function finalizeStep(workflow, actorEmail) {
  const dossier = workflow.dossier;
  const sourceDocuments = await store.listWorkflowDocuments(workflow.id);
  const vaultDocuments = await runAction(workflow, actorEmail, {
    agentKey: "tender-response-ai",
    actionKey: "check-document-vault",
    label: "Comparaison avec le Coffre documentaire LILOTOP",
    input: { requiredDocuments: dossier.analysis?.requiredDocuments || [] },
    output: (items) => ({ total: items.length, expired: items.filter((item) => item.status === "expired").length })
  }, () => documentVaultStore.tenderInventory());

  const supplierComparison = supplierComparisonFor(dossier);
  await runAction(workflow, actorEmail, {
    agentKey: "supplier-ai",
    actionKey: "rank-supplier-responses",
    label: "Classement fournisseurs et preparation de la comparaison",
    input: { supplierCount: supplierComparison.length },
    output: () => ({ ranked: supplierComparison.length, pricesValidated: false })
  }, async () => supplierComparison);

  let tenderResponse = await runAction(workflow, actorEmail, {
    agentKey: "tender-response-ai",
    actionKey: "prepare-tender-response",
    label: "Preparation de l'offre technique et des brouillons de soumission",
    input: {
      supplierSearches: (dossier.sourcing || []).length,
      rfqs: (dossier.rfqs || []).length,
      vaultDocuments: vaultDocuments.length
    },
    output: (result) => ({ compliance: result.compliance.compliancePercent, model: result.model })
  }, () => prepareTenderResponse(tenderDocumentFor(dossier, combinedSourceDocument(sourceDocuments)), {}, { vaultDocuments }));
  const ungmCredential = await confirmLilotopUngmRegistration(actorEmail);
  const credentialCompliance = isUnecaEoi24536(dossier)
    ? buildUnecaEoiCompliance(ungmCredential)
    : scopeComplianceToRequirements(
      applyOrganizationCredential(tenderResponse.compliance, ungmCredential),
      tenderResponse.keyInformation?.requiredDocuments || dossier.analysis?.requiredDocuments || []
    );
  tenderResponse = {
    ...tenderResponse,
    compliance: {
      ...tenderResponse.compliance,
      ...credentialCompliance,
      documentControl: credentialCompliance.rows
    }
  };

  const uneceWorkflow = isUnecaEoi24536(dossier);
  const organizationChartDocument = uneceWorkflow
    ? await ensureOrganizationChartDraft(actorEmail)
    : null;
  const currentVaultDocuments = uneceWorkflow
    ? await documentVaultStore.tenderInventory()
    : vaultDocuments;
  let completedDossier = {
    ...dossier,
    pipelineStatus: "validation-required",
    vaultDocuments: currentVaultDocuments,
    supplierComparison,
    tenderResponse,
    documents: documentsFor({ ...dossier, tenderResponse }),
    finalValidation: buildFinalValidation(dossier, tenderResponse, supplierComparison)
  };
  if (uneceWorkflow) {
    const uneceSubmissionReview = buildUnecaSubmissionReview(
      completedDossier,
      ungmCredential,
      organizationChartDocument
    );
    const uneceEoiSubmission = buildUnecaEoiSubmission(uneceSubmissionReview);
    const uneceEoiPackage = await ensureUnecaEoiPackage(workflow, uneceEoiSubmission);
    completedDossier = {
      ...completedDossier,
      uneceSubmissionReview,
      uneceEoiSubmission,
      uneceEoiPackage,
      finalValidation: {
        ...completedDossier.finalValidation,
        uneceSubmissionReview,
        uneceEoiSubmission,
        uneceEoiPackage
      }
    };
  }

  await runAction(workflow, actorEmail, {
    agentKey: "dashboard-dg",
    actionKey: "publish-validation-sheet",
    label: "Fiche finale transmise au Dashboard DG",
    input: { workflowId: workflow.id },
    output: () => ({ pipelineStatus: "validation-required", humanValidationRequired: true })
  }, async () => completedDossier.finalValidation);

  return store.advanceWorkflow(workflow.id, {
    status: "completed",
    currentStep: "completed",
    dossier: completedDossier,
    estimatedValue: workflow.estimatedValue,
    currency: workflow.currency
  });
}

async function applyDecision(id, decision, input, actorEmail) {
  if (!Object.hasOwn(DECISIONS, decision)) {
    throw Object.assign(new Error("Decision de validation inconnue"), { code: "VALIDATION_ERROR" });
  }
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const dossier = workflow.dossier || {};
  const validations = { ...(dossier.validations || {}) };
  const finalValidation = { ...(dossier.finalValidation || {}) };
  let pipelineStatus = dossier.pipelineStatus || "validation-required";

  if (decision === "validate-participation") validations.participation = "validated";
  if (decision === "authorize-rfqs") {
    if (!(dossier.rfqs || []).length) {
      throw Object.assign(new Error("Aucune RFQ n'est prête à être autorisée"), { code: "VALIDATION_ERROR" });
    }
    const rfqs = finalValidation.supplierRfqs || buildFinalValidation(
      dossier,
      dossier.tenderResponse,
      dossier.supplierComparison || supplierComparisonFor(dossier)
    ).supplierRfqs;
    if (rfqs.some((rfq) => !rfq.coordinatesVerified)) {
      throw Object.assign(new Error("Toutes les coordonnees fournisseurs doivent etre verifiees avant autorisation"), { code: "VALIDATION_ERROR" });
    }
    if (rfqs.some((rfq) => !rfq.readyToSend)) {
      throw Object.assign(new Error("Les quantites et la date limite de reponse doivent etre validees avant autorisation"), { code: "VALIDATION_ERROR" });
    }
    validations.rfqSending = "authorized";
    finalValidation.rfqSendingAuthorized = true;
  }
  if (decision === "reject") {
    validations.participation = "rejected";
    validations.sending = "blocked";
    pipelineStatus = "lost";
  }
  if (decision === "request-correction") {
    validations.finalDossier = "correction-requested";
    finalValidation.correctionRequest = String(input?.comment || "Correction demandee").trim().slice(0, 1000);
    pipelineStatus = "validation-required";
  }
  if (decision === "validate-prices") {
    const purchaseCost = Number(input?.purchaseCost);
    const proposedSalePrice = Number(input?.proposedSalePrice);
    if (!Number.isFinite(purchaseCost) || purchaseCost <= 0 || !Number.isFinite(proposedSalePrice) || proposedSalePrice <= 0) {
      throw Object.assign(new Error("Renseignez des prix valides avant validation"), { code: "VALIDATION_ERROR" });
    }
    validations.prices = "validated";
    finalValidation.purchaseCost = purchaseCost;
    finalValidation.proposedSalePrice = proposedSalePrice;
    finalValidation.currency = String(input?.currency || finalValidation.currency || "USD").slice(0, 12);
    finalValidation.estimatedMargin = proposedSalePrice - purchaseCost;
  }
  if (decision === "validate-final") {
    if (validations.participation !== "validated" || validations.prices !== "validated") {
      throw Object.assign(new Error("Validez d'abord la participation et les prix"), { code: "VALIDATION_ERROR" });
    }
    validations.finalDossier = "validated";
  }
  if (decision === "authorize-send") {
    if (validations.finalDossier !== "validated") {
      throw Object.assign(new Error("Le dossier final doit etre valide avant toute autorisation"), { code: "VALIDATION_ERROR" });
    }
    validations.sending = "authorized";
    pipelineStatus = "ready-to-send";
    finalValidation.sendEnabled = true;
  }
  if (decision === "validate-eoi") {
    if (!isUnecaEoi24536(dossier) || !finalValidation.uneceEoiPackage) {
      throw Object.assign(new Error("Le dossier EOI UNECA n'est pas prepare"), { code: "VALIDATION_ERROR" });
    }
    validations.eoiSubmission = "validated-for-manual-submission";
    finalValidation.uneceEoiPackage = {
      ...finalValidation.uneceEoiPackage,
      status: "VALIDE PAR LE DG - SOUMISSION MANUELLE NON EFFECTUEE"
    };
    finalValidation.uneceEoiSubmission = {
      ...finalValidation.uneceEoiSubmission,
      validationStatus: "VALIDE PAR LE DG - EXPRESS INTEREST RESTE MANUEL"
    };
  }
  if (decision === "review-eoi-confirmation") {
    if (!isUnecaEoi24536(dossier) || !finalValidation.uneceEoiSubmission) {
      throw Object.assign(new Error("Le dossier EOI UNECA n'est pas prepare"), { code: "VALIDATION_ERROR" });
    }
    const confirmationKey = String(input?.confirmationKey || "");
    const outcome = String(input?.outcome || "");
    if (!EOI_DG_CONFIRMATION_KEYS.includes(confirmationKey) || !["validated", "problem"].includes(outcome)) {
      throw Object.assign(new Error("Confirmation DG UNECA invalide"), { code: "VALIDATION_ERROR" });
    }
    const eoiDgConfirmations = { ...(validations.eoiDgConfirmations || {}) };
    eoiDgConfirmations[confirmationKey] = {
      status: outcome,
      actorEmail,
      updatedAt: new Date().toISOString(),
      comment: String(input?.comment || "").trim().slice(0, 1000)
    };
    validations.eoiDgConfirmations = eoiDgConfirmations;
    const confirmationSummary = eoiDgConfirmationSummary(eoiDgConfirmations);
    pipelineStatus = confirmationSummary.complete ? "ready-for-express-interest" : "validation-required";
    finalValidation.uneceEoiSubmission = {
      ...finalValidation.uneceEoiSubmission,
      dgConfirmationSummary: confirmationSummary,
      validationStatus: confirmationSummary.status
    };
  }

  return store.updateDossier(
    workflow.id,
    { ...dossier, pipelineStatus, validations, finalValidation },
    actorEmail,
    decision,
    DECISIONS[decision],
    {
      decision,
      pipelineStatus,
      confirmationKey: decision === "review-eoi-confirmation" ? String(input?.confirmationKey || "") : undefined,
      outcome: decision === "review-eoi-confirmation" ? String(input?.outcome || "") : undefined,
      comment: String(input?.comment || "").slice(0, 1000)
    }
  );
}

async function recordManualEoiSubmission(id, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  if (workflow.dossier?.eoiLifecycle?.status === "EOI SUBMITTED") return workflow;
  const updatedDossier = markUnecaEoiSubmitted(workflow.dossier || {}, new Date(), actorEmail);
  await businessStore.updateOpportunityStatus(workflow.opportunityId, "monitoring");
  return store.updateDossier(
    workflow.id,
    updatedDossier,
    actorEmail,
    "record-manual-eoi-submission",
    "Expression of Interest UNGM soumise manuellement par le DG",
    {
      reference: "EOIUNECA24536",
      ungmNotice: "306489",
      ungmVendorNumber: "673735",
      organization: "UNECA / Secretariat de l'ONU",
      action: "Expression of Interest submitted manually by DG",
      result: "SUCCESS",
      confirmation: UNECA_EOI_SUBMISSION_CONFIRMATION,
      submittedAt: updatedDossier.eoiLifecycle.submittedAt,
      nextPhase: "EOI SUBMITTED - WAITING FOR ITB / SOLICITATION DOCUMENTS",
      emailSent: false,
      rfqSent: false,
      automaticSubmission: false
    },
    "dashboard-dg"
  );
}

async function refreshVaultControl(id, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const dossier = workflow.dossier || {};
  if (!dossier.tenderResponse) {
    throw Object.assign(new Error("Le contrôle documentaire initial n'existe pas"), { code: "VALIDATION_ERROR" });
  }
  const before = dossier.tenderResponse.compliance || {};
  let vaultDocuments = await documentVaultStore.tenderInventory();
  const requiredDocuments = dossier.tenderResponse.keyInformation?.requiredDocuments
    || dossier.analysis?.requiredDocuments
    || [];
  const ungmCredential = await confirmLilotopUngmRegistration(actorEmail);
  const uneceWorkflow = isUnecaEoi24536(dossier);
  const organizationChartDocument = uneceWorkflow
    ? await ensureOrganizationChartDraft(actorEmail)
    : null;
  if (uneceWorkflow) vaultDocuments = await documentVaultStore.tenderInventory();
  const compliance = isUnecaEoi24536(dossier)
    ? buildUnecaEoiCompliance(ungmCredential)
    : scopeComplianceToRequirements(
      applyOrganizationCredential(
        buildDocumentControl(requiredDocuments, vaultDocuments, []),
        ungmCredential
      ),
      requiredDocuments
    );
  const synchronizedRisks = (dossier.tenderResponse.risks || []).filter((risk) =>
    !/aucun document du coffre|coffre n.?est exploitable|\d+ document\(s\) restent manquants ou non utilisables/i.test(String(risk))
  );
  if (compliance.missingDocuments.length) {
    synchronizedRisks.push(
      `${compliance.missingDocuments.length} document(s) restent manquants ou non utilisables pour cet appel d'offres.`
    );
  }
  const tenderResponse = {
    ...dossier.tenderResponse,
    risks: [...new Set(synchronizedRisks)],
    compliance: {
      ...before,
      availableDocuments: compliance.availableDocuments,
      expiredDocuments: compliance.expiredDocuments,
      missingDocuments: compliance.missingDocuments,
      generableDocuments: compliance.generableDocuments || [],
      compliancePercent: compliance.compliancePercent,
      documentaryReadinessPercent: compliance.documentaryReadinessPercent,
      documentSubmissionRequired: compliance.documentSubmissionRequired,
      realRequirementCount: compliance.realRequirementCount,
      documentControl: compliance.rows
    }
  };
  const comparison = dossier.supplierComparison || supplierComparisonFor(dossier);
  let rebuilt = buildFinalValidation(dossier, tenderResponse, comparison);
  const uneceSubmissionReview = uneceWorkflow
    ? buildUnecaSubmissionReview({ ...dossier, finalValidation: rebuilt }, ungmCredential, organizationChartDocument)
    : null;
  const uneceEoiSubmission = uneceSubmissionReview ? buildUnecaEoiSubmission(uneceSubmissionReview) : null;
  const uneceEoiPackage = uneceEoiSubmission ? await ensureUnecaEoiPackage(workflow, uneceEoiSubmission) : null;
  if (uneceSubmissionReview) rebuilt = { ...rebuilt, uneceSubmissionReview, uneceEoiSubmission, uneceEoiPackage };
  const previousSheet = dossier.finalValidation || {};
  const finalValidation = {
    ...rebuilt,
    purchaseCost: previousSheet.purchaseCost ?? rebuilt.purchaseCost,
    proposedSalePrice: previousSheet.proposedSalePrice ?? rebuilt.proposedSalePrice,
    estimatedMargin: previousSheet.estimatedMargin ?? rebuilt.estimatedMargin,
    currency: previousSheet.currency || rebuilt.currency,
    rfqSendingAuthorized: dossier.validations?.rfqSending === "authorized"
  };
  const updated = await store.updateDossier(
    workflow.id,
    {
      ...dossier,
      vaultDocuments,
      tenderResponse,
      finalValidation,
      uneceSubmissionReview: uneceSubmissionReview || dossier.uneceSubmissionReview,
      uneceEoiSubmission: uneceEoiSubmission || dossier.uneceEoiSubmission,
      uneceEoiPackage: uneceEoiPackage || dossier.uneceEoiPackage
    },
    actorEmail,
    "refresh-document-vault",
    "Contrôle administratif resynchronisé avec le Coffre documentaire",
    {
      beforeAvailable: (before.availableDocuments || []).length,
      afterAvailable: compliance.availableDocuments.length,
      totalRequirements: compliance.rows.length,
      realFilesChecked: vaultDocuments.filter((item) => item.filePresent).length
    },
    "tender-response-ai"
  );
  return {
    workflow: updated,
    comparison: {
      beforeAvailable: (before.availableDocuments || []).length,
      afterAvailable: compliance.availableDocuments.length,
      totalRequirements: compliance.rows.length
    }
  };
}

async function prepareUnopsSupplierCycle(id, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const dossier = workflow.dossier || {};
  const reference = dossier.analysis?.tenderNumber
    || dossier.tenderResponse?.keyInformation?.tenderNumber
    || dossier.opportunity?.reference;
  if (!/ITB\/2026\/62389/i.test(String(reference || ""))) {
    throw Object.assign(new Error("Cette action est reservee au dossier UNOPS ITB/2026/62389"), { code: "VALIDATION_ERROR" });
  }
  const documents = await store.listWorkflowDocuments(workflow.id);
  const schedule = documents.find((item) => /Section-II-Schedule/i.test(item.filename));
  const priceSchedule = documents.find((item) => /Section-III-Price-Schedule/i.test(item.filename));
  if (!schedule?.extractedText) {
    throw Object.assign(new Error("Le Schedule of Requirements officiel est introuvable"), { code: "VALIDATION_ERROR" });
  }
  const scheduleFile = await store.getWorkflowDocument(schedule.id);
  const scheduleText = scheduleFile?.fileData
    ? (await extractTenderTableDocument({
      filename: scheduleFile.filename,
      buffer: scheduleFile.fileData
    })).text
    : schedule.extractedText;
  const supplierCycle = buildSupplierCycle(
    scheduleText,
    dossier.supplierCycle || {},
    new Date(),
    priceSchedule?.extractedText || ""
  );
  if (supplierCycle.lots.some((lot) => !lot.products.length)) {
    throw Object.assign(new Error("Une liste officielle de produits n'a pas pu etre extraite"), { code: "VALIDATION_ERROR" });
  }
  const previousValidation = dossier.finalValidation || {};
  const finalValidation = {
    ...previousValidation,
    supplierCycle,
    supplierRfqs: supplierCycle.rfqs,
    quotationsReceived: supplierCycle.counts.received,
    quotationsMissing: supplierCycle.counts.missing,
    rfqSummary: {
      prepared: supplierCycle.counts.prepared,
      contactsVerified: supplierCycle.rfqs.filter((rfq) => rfq.contact.verified).length,
      sent: supplierCycle.counts.sent,
      readyToSend: 0
    },
    pricingSummary: {
      quotationsReceived: supplierCycle.counts.received,
      landedCost: supplierCycle.pricing.landedCost ?? "EN ATTENTE",
      margin: "EN ATTENTE",
      financialOffer: supplierCycle.pricing.financialOfferStatus
    },
    purchaseCost: null,
    proposedSalePrice: null,
    estimatedMargin: null,
    sendEnabled: false,
    submissionEnabled: false
  };
  return store.updateDossier(
    workflow.id,
    { ...dossier, supplierCycle, finalValidation },
    actorEmail,
    "prepare-unops-supplier-cycle",
    "Lots UNOPS extraits et RFQ fournisseurs preparees",
    {
      reference: supplierCycle.reference,
      lots: supplierCycle.lots.map((lot) => lot.number),
      products: supplierCycle.counts.products,
      rfqsPrepared: supplierCycle.counts.prepared,
      rfqsSent: 0,
      externalAction: false
    },
    "supplier-ai"
  );
}

async function recordUnopsSupplierQuotation(id, input, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const dossier = workflow.dossier || {};
  if (!dossier.supplierCycle) {
    throw Object.assign(new Error("Le cycle fournisseurs UNOPS doit d'abord etre prepare"), { code: "VALIDATION_ERROR" });
  }
  const supplierCycle = recordSupplierQuotation(dossier.supplierCycle, input);
  const previousValidation = dossier.finalValidation || {};
  const finalValidation = {
    ...previousValidation,
    supplierCycle,
    supplierRfqs: supplierCycle.rfqs,
    quotationsReceived: supplierCycle.counts.received,
    quotationsMissing: supplierCycle.counts.missing,
    pricingSummary: {
      quotationsReceived: supplierCycle.counts.received,
      landedCost: supplierCycle.pricing.landedCost ?? "EN ATTENTE",
      margin: "EN ATTENTE",
      financialOffer: supplierCycle.pricing.financialOfferStatus
    },
    purchaseCost: null,
    proposedSalePrice: null,
    estimatedMargin: null,
    sendEnabled: false,
    submissionEnabled: false
  };
  return store.updateDossier(
    workflow.id,
    { ...dossier, supplierCycle, finalValidation },
    actorEmail,
    "record-unops-supplier-quotation",
    "Cotation fournisseur reelle rattachee a la RFQ UNOPS",
    {
      rfqId: input.rfqId,
      evidenceDocumentId: input.evidenceDocumentId || null,
      sourceMessageId: input.sourceMessageId || null,
      externalAction: false
    },
    "supplier-ai"
  );
}

async function authorizeUnopsSupplierRfq(id, rfqId, actorEmail) {
  const workflow = await store.getWorkflow(validation.uuid(id, "id"));
  if (!workflow) throw Object.assign(new Error("Workflow introuvable"), { code: "NOT_FOUND" });
  const dossier = workflow.dossier || {};
  if (!dossier.supplierCycle) {
    throw Object.assign(new Error("Le cycle fournisseurs UNOPS doit d'abord etre prepare"), { code: "VALIDATION_ERROR" });
  }
  const supplierCycle = authorizeSupplierRfq(dossier.supplierCycle, rfqId, actorEmail);
  const finalValidation = {
    ...(dossier.finalValidation || {}),
    supplierCycle,
    supplierRfqs: supplierCycle.rfqs,
    rfqSummary: {
      prepared: supplierCycle.counts.prepared,
      contactsVerified: supplierCycle.rfqs.filter((rfq) => rfq.contact.verified).length,
      sent: 0,
      readyToSend: supplierCycle.rfqs.filter((rfq) => rfq.authorizedAt && !rfq.sentAt).length
    },
    sendEnabled: false,
    submissionEnabled: false
  };
  return store.updateDossier(
    workflow.id,
    { ...dossier, supplierCycle, finalValidation },
    actorEmail,
    "authorize-unops-supplier-rfq",
    "Autorisation DG d'une RFQ UNOPS enregistree sans envoi",
    { rfqId, externalAction: false, emailSent: false },
    "supplier-ai"
  );
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
  DECISIONS,
  EOI_DG_CONFIRMATION_KEYS,
  MAX_SOURCED_PRODUCTS,
  applyOrganizationCredential,
  attachOfficialSources,
  uploadOfficialSource,
  applyDecision,
  markUnecaEoiSubmitted,
  recordManualEoiSubmission,
  buildUnecaEoiSubmission,
  eoiDgConfirmationSummary,
  buildUnecaSubmissionReview,
  buildUnecaEoiCompliance,
  buildFinalValidation,
  commercialAnalysisFor,
  documentsFor,
  documentMatrixFor,
  isUnecaEoi24536,
  ensureOrganizationChartDraft,
  ensureUnecaEoiPackage,
  organizationChartDraft,
  authorizeUnopsSupplierRfq,
  prepareUnopsSupplierCycle,
  recordUnopsSupplierQuotation,
  retrieveTenderSources,
  refreshVaultControl,
  resumeWorkflow,
  scopeComplianceToRequirements,
  supplierComparisonFor,
  tenderDocumentFor
};
