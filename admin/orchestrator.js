"use strict";

const body = document.body;
const loginScreen = document.getElementById("orchestrator-login");
const shell = document.getElementById("orchestrator-shell");
const loginForm = document.getElementById("orchestrator-login-form");
const loginStatus = document.getElementById("orchestrator-login-status");
const statusRegion = document.getElementById("orchestrator-status");
const workflowForm = document.getElementById("workflow-form");
const opportunitySelect = document.getElementById("opportunity-select");
const opportunitySummary = document.getElementById("opportunity-summary");

let state = {
  opportunities: [],
  workflows: [],
  actions: [],
  agents: [],
  dashboard: {}
};
let runningWorkflowId = null;

const STEP_LABELS = {
  analyze: "Analyse OpenAI",
  "source-suppliers": "Recherche fournisseurs",
  "prepare-rfqs": "Préparation RFQ",
  finalize: "Constitution du dossier",
  completed: "Terminé"
};

const PIPELINE_LABELS = {
  detected: "Détecté",
  analyzed: "Analysé",
  "suppliers-researched": "Fournisseurs recherchés",
  "rfqs-prepared": "RFQ préparées",
  "rfqs-sent": "RFQ envoyées",
  "offer-prepared": "Offre préparée",
  "validation-required": "Validation requise",
  "ready-to-send": "Envoi autorisé",
  submitted: "Soumis",
  pending: "En attente",
  won: "Gagné",
  lost: "Perdu",
  "purchase-order-received": "Bon de commande reçu",
  rejected: "Hors cible"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  shell.hidden = !authenticated;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Action impossible.");
  }
  return payload.data;
}

function formatDuration(seconds) {
  if (!seconds) return "0 min";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

function formatValue(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function renderDashboard() {
  const dashboard = state.dashboard || {};
  document.getElementById("stat-active").textContent = dashboard.activeWorkflows || 0;
  document.getElementById("stat-opportunities").textContent = dashboard.opportunitiesInProgress || 0;
  document.getElementById("stat-agents").textContent = dashboard.activeAgents || 7;
  document.getElementById("stat-average").textContent = formatDuration(dashboard.averageSeconds);
  document.getElementById("stat-value").textContent = formatValue(dashboard.potentialValue);
  document.getElementById("stat-alerts").textContent = dashboard.criticalAlerts || 0;
}

function renderOpportunities() {
  opportunitySelect.innerHTML = `
    <option value="">Sélectionner une opportunité</option>
    ${state.opportunities.map((item) => `
      <option value="${escapeHtml(item.id)}">
        ${escapeHtml(item.title)} · ${escapeHtml(item.organization || "Organisation non renseignée")}
      </option>
    `).join("")}
  `;
}

function renderAgents() {
  document.getElementById("agent-grid").innerHTML = state.agents.map((agent) => `
    <article class="agent-card">
      <span class="status-dot">● SUPERVISÉ</span>
      <h3>${escapeHtml(agent.name)}</h3>
      <p>${escapeHtml(agent.role)}</p>
    </article>
  `).join("");
}

function renderWorkflows() {
  const target = document.getElementById("workflow-list");
  if (!state.workflows.length) {
    target.innerHTML = '<p class="empty-message">Aucun workflow enregistré.</p>';
    return;
  }
  target.innerHTML = state.workflows.map((workflow) => {
    const resumable = workflow.status !== "completed";
    const busy = runningWorkflowId === workflow.id;
    return `
      <article class="workflow-item">
        <div>
          <span class="status status-${escapeHtml(workflow.status)}">${escapeHtml(PIPELINE_LABELS[workflow.dossier?.pipelineStatus] || workflow.status)}</span>
          <h3>${escapeHtml(workflow.title)}</h3>
          <p>${escapeHtml(STEP_LABELS[workflow.currentStep] || workflow.currentStep)} · ${escapeHtml(workflow.createdBy)}</p>
          ${workflow.lastError ? `<p class="form-status">${escapeHtml(workflow.lastError)}</p>` : ""}
        </div>
        <div class="workflow-actions">
          <button class="button button-secondary" type="button" data-view-workflow="${escapeHtml(workflow.id)}">Voir dossier</button>
          ${resumable ? `<button class="button button-primary" type="button" data-resume-workflow="${escapeHtml(workflow.id)}" ${busy ? "disabled" : ""}>Reprendre Workflow</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderActions(actions = state.actions) {
  const target = document.getElementById("activity-log");
  if (!actions.length) {
    target.innerHTML = '<p class="empty-message">Aucune action enregistrée.</p>';
    return;
  }
  target.innerHTML = actions.map((action) => `
    <article class="activity-item">
      <strong>${escapeHtml(action.agentKey)}</strong>
      <div>
        <span class="status status-${escapeHtml(action.status)}">${escapeHtml(action.status)}</span>
        <p>${escapeHtml(action.label)} · ${escapeHtml(action.actorEmail)}</p>
      </div>
      <time class="activity-time">${escapeHtml(new Date(action.startedAt).toLocaleString("fr-FR"))}</time>
    </article>
  `).join("");
}

function listMarkup(items, emptyText) {
  if (!items?.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(
    typeof item === "string" ? item : item.name || item.title || item.label || ""
  )}</li>`).join("")}</ul>`;
}

function renderDossier(workflow, actions) {
  const panel = document.getElementById("dossier-panel");
  const dossier = workflow.dossier || {};
  const analysis = dossier.analysis || {};
  panel.hidden = false;
  document.getElementById("dossier-title").textContent = workflow.title;
  document.getElementById("dossier-status").textContent = PIPELINE_LABELS[dossier.pipelineStatus] || workflow.status;
  document.getElementById("dossier-content").innerHTML = `
    <article class="dossier-card">
      <h3>Analyse</h3>
      <p>${escapeHtml(analysis.executiveSummary || "Analyse en attente.")}</p>
      <strong>Risques</strong>
      ${listMarkup(analysis.risks, "Aucun risque extrait.")}
    </article>
    <article class="dossier-card">
      <h3>Exigences extraites</h3>
      <p><strong>Adéquation LILOTOP :</strong> ${analysis.lilotopFit === false ? "Non" : analysis.lilotopFit === true ? "Oui" : "En attente"}</p>
      <p><strong>Score :</strong> ${escapeHtml(analysis.opportunityScore ?? "—")}/100 · ${escapeHtml(analysis.priority || "Non classé")}</p>
      <p><strong>Pays :</strong> ${escapeHtml(analysis.country || "Non renseigné")}</p>
      <p><strong>Date limite :</strong> ${escapeHtml(analysis.deadline || "Non renseignée")}</p>
      ${listMarkup(analysis.products, "Aucun produit extrait.")}
    </article>
    <article class="dossier-card">
      <h3>Fournisseurs</h3>
      <p>${escapeHtml((dossier.sourcing || []).length)} recherche(s) documentée(s).</p>
      ${(dossier.sourcing || []).map((entry) => `
        <strong>${escapeHtml(entry.product.name)}</strong>
        ${listMarkup(entry.suppliers?.slice(0, 5), "Aucun fournisseur trouvé.")}
      `).join("")}
    </article>
    <article class="dossier-card">
      <h3>RFQ préparées</h3>
      ${listMarkup((dossier.rfqs || []).map((rfq) => rfq.subject), "Aucune RFQ préparée.")}
      <p>Aucun envoi automatique n'est autorisé.</p>
    </article>
    <article class="dossier-card">
      <h3>Conformité documentaire</h3>
      <p><strong>Niveau :</strong> ${escapeHtml(dossier.tenderResponse?.compliance?.compliancePercent ?? 0)}%</p>
      <strong>Documents manquants</strong>
      ${listMarkup(dossier.tenderResponse?.compliance?.missingDocuments, "Aucun document manquant identifié.")}
      <strong>Documents expirés</strong>
      ${listMarkup(dossier.tenderResponse?.compliance?.expiredDocuments, "Aucun document expiré identifié.")}
    </article>
    <article class="dossier-card">
      <h3>Comparaison fournisseurs</h3>
      ${(dossier.supplierComparison || []).slice(0, 8).map((item) => `
        <p><strong>${escapeHtml(item.supplier)}</strong> · ${escapeHtml(item.product)} · ${escapeHtml(item.reliabilityScore)}/100<br>
        Prix, délai et Incoterm : à confirmer par cotation validée.</p>
      `).join("") || "<p>Aucune comparaison disponible.</p>"}
    </article>
    <article class="dossier-card">
      <h3>Documents générés</h3>
      ${listMarkup(dossier.documents, "Documents en attente.")}
    </article>
    <article class="dossier-card">
      <h3>Historique du dossier</h3>
      ${listMarkup(actions.map((action) => `${action.agentKey} — ${action.label}`), "Aucune action enregistrée.")}
    </article>
  `;
  renderValidationSheet(workflow);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function displayMoney(value, currency) {
  if (value === null || value === undefined) return "À valider";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value))} ${currency || ""}`.trim();
}

function renderValidationSheet(workflow) {
  const section = document.getElementById("validation-sheet");
  const dossier = workflow.dossier || {};
  const sheet = dossier.finalValidation;
  section.hidden = !sheet;
  section.dataset.workflowId = workflow.id;
  if (!sheet) return;
  const fields = [
    ["Client", sheet.client], ["Objet du marché", sheet.marketObject], ["Date limite", sheet.deadline || "À confirmer"],
    ["Score d'opportunité", `${sheet.opportunityScore}/100`], ["Niveau de conformité", `${sheet.compliancePercent}%`],
    ["Fournisseur recommandé", sheet.recommendedSupplier || "À valider"],
    ["Coût d'achat", displayMoney(sheet.purchaseCost, sheet.currency)],
    ["Prix de vente proposé", displayMoney(sheet.proposedSalePrice, sheet.currency)],
    ["Marge estimée", displayMoney(sheet.estimatedMargin, sheet.currency)]
  ];
  document.getElementById("validation-content").innerHTML = `
    <div class="validation-facts">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
    <article><h3>Risques</h3>${listMarkup(sheet.risks, "Aucun risque identifié.")}</article>
    <article><h3>Documents manquants</h3>${listMarkup(sheet.missingDocuments, "Aucun document manquant identifié.")}</article>
    <article><h3>Offre technique</h3><pre>${escapeHtml(sheet.technicalOffer)}</pre></article>
    <article><h3>Offre financière</h3><pre>${escapeHtml(sheet.financialOffer)}</pre></article>
    <article><h3>Lettre de soumission</h3><pre>${escapeHtml(sheet.submissionLetter)}</pre></article>
    <article><h3>E-mail prêt à envoyer</h3><pre>${escapeHtml(sheet.emailDraft)}</pre></article>
    <article><h3>Actions restant à valider</h3>${listMarkup(sheet.remainingActions, "Aucune action restante.")}</article>
  `;
  document.getElementById("purchase-cost").value = sheet.purchaseCost ?? "";
  document.getElementById("sale-price").value = sheet.proposedSalePrice ?? "";
  document.getElementById("price-currency").value = sheet.currency || "USD";
  const validations = dossier.validations || {};
  document.querySelectorAll("[data-decision]").forEach((button) => {
    const key = button.dataset.decision;
    button.disabled = (key === "validate-participation" && validations.participation === "validated")
      || (key === "validate-prices" && validations.prices === "validated")
      || (key === "validate-final" && validations.finalDossier === "validated")
      || (key === "authorize-send" && validations.sending === "authorized")
      || validations.participation === "rejected";
  });
}

async function refresh() {
  state = await api("/api/nexus-orchestrator?action=bootstrap");
  renderDashboard();
  renderOpportunities();
  renderAgents();
  renderWorkflows();
  renderActions();
}

async function viewWorkflow(id) {
  const data = await api(`/api/nexus-orchestrator?action=workflow&id=${encodeURIComponent(id)}`);
  renderDossier(data.workflow, [...data.actions].reverse());
  renderActions(data.actions);
}

async function runUntilComplete(id) {
  runningWorkflowId = id;
  renderWorkflows();
  statusRegion.textContent = "Workflow multi-agents en cours…";
  try {
    let workflow;
    for (let index = 0; index < 12; index += 1) {
      workflow = await api("/api/nexus-orchestrator?action=resume", {
        method: "POST",
        body: JSON.stringify({ id })
      });
      statusRegion.textContent = `${STEP_LABELS[workflow.currentStep] || workflow.currentStep}…`;
      if (workflow.status === "completed") break;
    }
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = workflow?.status === "completed"
      ? "Workflow complet terminé. Dossier commercial prêt pour validation."
      : "Workflow interrompu avant sa finalisation. Utilisez Reprendre Workflow.";
  } catch (error) {
    statusRegion.textContent = error.message;
    await refresh();
  } finally {
    runningWorkflowId = null;
    renderWorkflows();
  }
}

async function startWorkflow(event) {
  event.preventDefault();
  const opportunityId = new FormData(workflowForm).get("opportunityId");
  statusRegion.textContent = "Création du dossier commercial…";
  const workflow = await api("/api/nexus-orchestrator?action=start", {
    method: "POST",
    body: JSON.stringify({ opportunityId })
  });
  await refresh();
  await runUntilComplete(workflow.id);
}

async function detectOpportunity() {
  statusRegion.textContent = "Détection de la prochaine opportunité qualifiée…";
  const workflow = await api("/api/nexus-orchestrator?action=detect", {
    method: "POST",
    body: JSON.stringify({})
  });
  await refresh();
  await runUntilComplete(workflow.id);
}

async function submitDecision(button) {
  const section = document.getElementById("validation-sheet");
  const id = section.dataset.workflowId;
  if (!id) return;
  button.disabled = true;
  statusRegion.textContent = "Enregistrement de la décision…";
  try {
    await api("/api/nexus-orchestrator?action=decision", {
      method: "POST",
      body: JSON.stringify({
        id,
        decision: button.dataset.decision,
        purchaseCost: document.getElementById("purchase-cost").value,
        proposedSalePrice: document.getElementById("sale-price").value,
        currency: document.getElementById("price-currency").value,
        comment: document.getElementById("decision-comment").value
      })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = "Décision enregistrée et journalisée.";
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
  }
}

async function authenticate(event) {
  event.preventDefault();
  loginStatus.textContent = "Connexion en cours…";
  const formData = new FormData(loginForm);
  try {
    await api("/api/business-radar-auth", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    setAuthenticated(true);
    loginStatus.textContent = "";
    await refresh();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

async function logout() {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
}

opportunitySelect.addEventListener("change", () => {
  const selected = state.opportunities.find((item) => item.id === opportunitySelect.value);
  opportunitySummary.textContent = selected
    ? `${selected.organization || "Organisation non renseignée"} · ${selected.country || "Pays non renseigné"} · Score ${selected.score}/100`
    : "Sélectionnez une opportunité pour afficher son contexte.";
});
workflowForm.addEventListener("submit", (event) => {
  startWorkflow(event).catch((error) => {
    statusRegion.textContent = error.message;
  });
});
document.getElementById("refresh-orchestrator").addEventListener("click", () => {
  refresh().catch((error) => { statusRegion.textContent = error.message; });
});
document.getElementById("detect-opportunity").addEventListener("click", () => {
  detectOpportunity().catch((error) => { statusRegion.textContent = error.message; });
});
document.getElementById("decision-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision]");
  if (button) submitDecision(button);
});
document.getElementById("workflow-list").addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-workflow]");
  const resume = event.target.closest("[data-resume-workflow]");
  if (view) viewWorkflow(view.dataset.viewWorkflow).catch((error) => { statusRegion.textContent = error.message; });
  if (resume) runUntilComplete(resume.dataset.resumeWorkflow);
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("orchestrator-logout").addEventListener("click", logout);

setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") {
  refresh().catch((error) => { statusRegion.textContent = error.message; });
}
