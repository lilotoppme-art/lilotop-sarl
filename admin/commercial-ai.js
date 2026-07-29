"use strict";

const body = document.body;
const loginScreen = document.getElementById("commercial-login");
const appShell = document.getElementById("commercial-shell");
const loginForm = document.getElementById("commercial-login-form");
const loginStatus = document.getElementById("commercial-login-status");
const globalStatus = document.getElementById("commercial-status");
const state = {
  candidates: [],
  selectedOpportunityId: null,
  selectedAnalysis: null,
  history: []
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
  appShell.hidden = !authenticated;
  document.title = `${authenticated ? "Commercial AI" : "Connexion Commercial AI"} | LILOTOP SARL`;
}

function setBusy(busy, message = "") {
  body.classList.toggle("is-busy", busy);
  globalStatus.textContent = message;
  globalStatus.classList.remove("error");
}

function setError(error) {
  body.classList.remove("is-busy");
  globalStatus.textContent = error.message || "Une erreur est survenue.";
  globalStatus.classList.add("error");
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

function classificationClass(value) {
  if (value === "Très prioritaire") return "classification-very-high";
  if (value === "Prioritaire") return "classification-high";
  if (value === "Moyen") return "classification-medium";
  if (value === "Faible") return "classification-low";
  return "classification-neutral";
}

async function api(action, options = {}) {
  const response = await fetch(`/api/commercial-ai?action=${encodeURIComponent(action)}${options.query || ""}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  if (response.status === 401) {
    location.reload();
    throw new Error("Session expirée");
  }
  if (!response.ok || !payload.ok) {
    throw Object.assign(new Error(payload.error || "Erreur Commercial AI"), { code: payload.code });
  }
  return payload.data;
}

function renderSummary() {
  const analyzed = state.candidates.filter((item) => item.latest_analysis_id);
  const urgent = analyzed.filter((item) => item.commercial_classification === "Très prioritaire");
  const latest = analyzed
    .map((item) => item.commercial_analyzed_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  document.getElementById("candidate-count").textContent = state.candidates.length;
  document.getElementById("analyzed-count").textContent = analyzed.length;
  document.getElementById("urgent-count").textContent = urgent.length;
  document.getElementById("last-analysis-date").textContent = formatDate(latest, true);
}

function renderCandidates() {
  const target = document.getElementById("candidate-rows");
  if (!state.candidates.length) {
    target.innerHTML = '<tr><td colspan="6" class="empty-cell">Aucune opportunité disponible.</td></tr>';
    renderSummary();
    return;
  }
  target.innerHTML = state.candidates.map((item) => {
    const analyzed = Boolean(item.latest_analysis_id);
    const classification = item.commercial_classification || "Non analysée";
    return `
      <tr>
        <td>
          <span class="opportunity-title">${escapeHtml(item.title)}</span>
          <span class="opportunity-meta">${escapeHtml(item.country || "Pays non précisé")} · ${escapeHtml(item.sector || "Secteur non classé")}</span>
        </td>
        <td>${escapeHtml(item.organization || "Non précisée")}</td>
        <td>${escapeHtml(formatDate(item.deadline_at))}</td>
        <td>${analyzed ? `<span class="score-chip">${escapeHtml(item.commercial_score)}/100</span>` : "—"}</td>
        <td><span class="classification ${classificationClass(classification)}">${escapeHtml(classification)}</span></td>
        <td>
          <div class="row-actions">
            <button class="button button-primary button-small" type="button" data-analyze="${escapeHtml(item.id)}">
              ${analyzed ? "Relancer l'analyse" : "Analyser avec l'IA"}
            </button>
            <button class="button button-secondary button-small" type="button" data-history="${escapeHtml(item.id)}">
              Historique
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  renderSummary();
}

function listItems(targetId, items, ordered = false) {
  const target = document.getElementById(targetId);
  target.innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Aucun élément identifié.</li>`;
  if (ordered) target.setAttribute("aria-label", "Actions recommandées");
}

function showAnalysis(analysis) {
  state.selectedAnalysis = analysis;
  state.selectedOpportunityId = analysis.opportunityId;
  document.getElementById("analysis-empty").hidden = true;
  document.getElementById("analysis-result").hidden = false;
  document.getElementById("analysis-score").textContent = `${analysis.score}/100`;
  document.getElementById("analysis-summary").textContent = analysis.executiveSummary;
  listItems("analysis-strengths", analysis.strengths);
  listItems("analysis-risks", analysis.risks);
  listItems("analysis-actions", analysis.recommendedActions, true);
  const classification = document.getElementById("analysis-classification");
  classification.textContent = analysis.classification;
  classification.className = `classification ${classificationClass(analysis.classification)}`;
  document.getElementById("analysis-title").textContent = analysis.opportunityTitle || "Analyse commerciale";
  document.getElementById("rerun-analysis").disabled = false;
}

function renderHistory(opportunityId) {
  const candidate = state.candidates.find((item) => item.id === opportunityId);
  document.getElementById("history-context").textContent = candidate?.title || "Opportunité sélectionnée";
  const target = document.getElementById("analysis-history");
  if (!state.history.length) {
    target.innerHTML = '<p class="empty-message">Aucune analyse enregistrée pour cette opportunité.</p>';
    return;
  }
  target.innerHTML = state.history.map((analysis) => `
    <article class="history-entry">
      <time datetime="${escapeHtml(analysis.createdAt)}">${escapeHtml(formatDate(analysis.createdAt, true))}</time>
      <span class="score-chip">${escapeHtml(analysis.score)}/100</span>
      <span class="classification ${classificationClass(analysis.classification)}">${escapeHtml(analysis.classification)}</span>
      <div>
        <p>${escapeHtml(analysis.executiveSummary)}</p>
        <small>${escapeHtml(analysis.model)}</small>
      </div>
    </article>
  `).join("");
}

async function loadCandidates() {
  setBusy(true, "Chargement des opportunités commerciales…");
  try {
    state.candidates = await api("candidates");
    renderCandidates();
    setBusy(false, "");
  } catch (error) {
    setError(error);
  }
}

async function loadHistory(opportunityId) {
  setBusy(true, "Chargement de l'historique…");
  try {
    state.selectedOpportunityId = opportunityId;
    state.history = await api("history", { query: `&id=${encodeURIComponent(opportunityId)}` });
    renderHistory(opportunityId);
    if (state.history[0]) showAnalysis(state.history[0]);
    setBusy(false, "");
  } catch (error) {
    setError(error);
  }
}

async function analyze(opportunityId) {
  setBusy(true, "Analyse OpenAI en cours…");
  try {
    const analysis = await api("analyze", {
      method: "POST",
      body: { opportunityId }
    });
    showAnalysis(analysis);
    state.history = await api("history", { query: `&id=${encodeURIComponent(opportunityId)}` });
    renderHistory(opportunityId);
    state.candidates = await api("candidates");
    renderCandidates();
    setBusy(false, "Analyse commerciale terminée.");
  } catch (error) {
    setError(error);
  }
}

async function searchOpportunities() {
  setBusy(true, "Recherche automatique des opportunités en cours…");
  try {
    const result = await api("search", { method: "POST", body: {} });
    state.candidates = result.candidates || [];
    renderCandidates();
    setBusy(false, "Recherche terminée. Les opportunités ont été actualisées.");
  } catch (error) {
    setError(error);
  }
}

async function authenticate(event) {
  event.preventDefault();
  loginStatus.textContent = "Connexion en cours…";
  const formData = new FormData(loginForm);
  try {
    const response = await fetch("/api/business-radar-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Connexion impossible.");
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    await loadCandidates();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

document.addEventListener("click", (event) => {
  const analyzeButton = event.target.closest("[data-analyze]");
  if (analyzeButton) {
    analyze(analyzeButton.dataset.analyze);
    return;
  }
  const historyButton = event.target.closest("[data-history]");
  if (historyButton) loadHistory(historyButton.dataset.history);
});

loginForm.addEventListener("submit", authenticate);
document.getElementById("refresh-candidates").addEventListener("click", loadCandidates);
document.getElementById("search-opportunities").addEventListener("click", searchOpportunities);
document.getElementById("rerun-analysis").addEventListener("click", () => {
  if (state.selectedOpportunityId) analyze(state.selectedOpportunityId);
});
document.getElementById("commercial-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("commercial-email").focus();
});

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadCandidates();
