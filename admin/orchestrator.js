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
  document.getElementById("stat-agents").textContent = dashboard.activeAgents || 5;
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
          <span class="status status-${escapeHtml(workflow.status)}">${escapeHtml(workflow.status)}</span>
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
  document.getElementById("dossier-status").textContent = workflow.status;
  document.getElementById("dossier-content").innerHTML = `
    <article class="dossier-card">
      <h3>Analyse</h3>
      <p>${escapeHtml(analysis.executiveSummary || "Analyse en attente.")}</p>
      <strong>Risques</strong>
      ${listMarkup(analysis.risks, "Aucun risque extrait.")}
    </article>
    <article class="dossier-card">
      <h3>Exigences extraites</h3>
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
      <h3>Documents générés</h3>
      ${listMarkup(dossier.documents, "Documents en attente.")}
    </article>
    <article class="dossier-card">
      <h3>Historique du dossier</h3>
      ${listMarkup(actions.map((action) => `${action.agentKey} — ${action.label}`), "Aucune action enregistrée.")}
    </article>
  `;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
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
