"use strict";

const body = document.body;
const loginScreen = document.getElementById("mining-login");
const appShell = document.getElementById("mining-shell");
const loginForm = document.getElementById("mining-login-form");
const loginStatus = document.getElementById("mining-login-status");
const globalStatus = document.getElementById("mining-status");
const searchForm = document.getElementById("mining-search-form");
const state = { sources: [], needs: [], history: [], selected: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  appShell.hidden = !authenticated;
  document.title = `${authenticated ? "Veille Minière AI" : "Connexion Veille Minière AI"} | LILOTOP SARL`;
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

async function api(action, options = {}) {
  const response = await fetch(`/api/mining-watch?action=${encodeURIComponent(action)}${options.query || ""}`, {
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
    throw Object.assign(new Error(payload.error || "Erreur Veille Minière AI"), { code: payload.code });
  }
  return payload.data;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function renderOptions() {
  document.getElementById("mining-source-grid").innerHTML = state.sources.map((source) => `
    <label class="source-option">
      <input name="sources" type="checkbox" value="${escapeHtml(source.id)}" checked>
      <span>${escapeHtml(source.name)}</span>
    </label>
  `).join("");
  document.getElementById("mining-needs-grid").innerHTML = state.needs.map((need) => `
    <label class="source-option">
      <input name="needs" type="checkbox" value="${escapeHtml(need)}" checked>
      <span>${escapeHtml(need)}</span>
    </label>
  `).join("");
}

function formPayload() {
  const data = new FormData(searchForm);
  return {
    countries: splitList(data.get("countries")),
    needs: data.getAll("needs"),
    keywords: data.get("keywords"),
    publishedAfter: data.get("publishedAfter"),
    sources: data.getAll("sources")
  };
}

function populateForm(criteria = {}) {
  searchForm.elements.countries.value = (criteria.countries || []).join(", ");
  searchForm.elements.keywords.value = criteria.keywords || "";
  searchForm.elements.publishedAfter.value = criteria.publishedAfter || "";
  const selectedSources = new Set((criteria.sources || []).map((source) => source.id || source));
  searchForm.querySelectorAll('[name="sources"]').forEach((input) => {
    input.checked = !selectedSources.size || selectedSources.has(input.value);
  });
  const selectedNeeds = new Set(criteria.needs || []);
  searchForm.querySelectorAll('[name="needs"]').forEach((input) => {
    input.checked = !selectedNeeds.size || selectedNeeds.has(input.value);
  });
}

function listItems(targetId, items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  document.getElementById(targetId).innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Aucun élément identifié.</li>`;
  document.getElementById(targetId).dataset.listType = tag;
}

function detailsList(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Aucun élément identifié.</li>"}</${tag}>`;
}

function renderResult(result) {
  state.selected = result;
  document.getElementById("mining-result-empty").hidden = true;
  document.getElementById("mining-result-content").hidden = false;
  document.getElementById("rerun-mining-search").disabled = false;
  document.getElementById("mining-watch-summary").textContent = result.watchSummary;

  document.getElementById("mining-rows").innerHTML = result.signals.length
    ? result.signals.map((signal) => {
      const source = safeUrl(signal.sourceUrl);
      return `
        <tr>
          <td>
            <span class="tender-title">${escapeHtml(signal.title)}</span>
            <span class="mining-signal-type">${escapeHtml(signal.signalType)}</span>
          </td>
          <td>${escapeHtml(signal.company)}<br><small>${escapeHtml(signal.sourceName)}</small></td>
          <td>${escapeHtml(signal.country)}<br><small>${escapeHtml(signal.location)}</small></td>
          <td>${escapeHtml(signal.detectedNeed)}</td>
          <td>${escapeHtml(signal.timing)}</td>
          <td>
            <span class="score-chip">${escapeHtml(signal.opportunityScore)}/100</span>
            <span class="classification">${escapeHtml(signal.classification)}</span>
          </td>
          <td>${source
            ? `<a class="tender-source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Consulter</a>`
            : "Non disponible"}</td>
        </tr>
      `;
    }).join("")
    : '<tr><td colspan="7" class="empty-cell">Aucun signal minier suffisamment documenté.</td></tr>';

  document.getElementById("mining-detail-list").innerHTML = result.signals.map((signal) => `
    <details class="tender-detail">
      <summary>
        <span>${escapeHtml(signal.title)}</span>
        <span class="score-chip">${escapeHtml(signal.opportunityScore)}/100</span>
      </summary>
      <div class="tender-detail-body">
        <section><h4>Résumé</h4><p>${escapeHtml(signal.executiveSummary)}</p></section>
        <section><h4>Opportunité LILOTOP</h4><p class="mining-opportunity">${escapeHtml(signal.opportunity)}</p></section>
        <section><h4>Preuve</h4><p>${escapeHtml(signal.evidence)}</p></section>
        <section><h4>Risques</h4>${detailsList(signal.risks)}</section>
        <section><h4>Actions recommandées</h4>${detailsList(signal.recommendedActions, true)}</section>
      </div>
    </details>
  `).join("");

  listItems("mining-global-risks", result.globalRisks);
  listItems("mining-global-actions", result.globalRecommendations, true);
  populateForm(result.criteria);
}

function renderHistory() {
  const target = document.getElementById("mining-history");
  target.innerHTML = state.history.length
    ? state.history.map((item) => `
      <article class="tender-history-entry">
        <div>
          <strong>${escapeHtml((item.criteria.needs || []).slice(0, 3).join(", ") || "Veille minière")}</strong>
          <small>${escapeHtml((item.criteria.countries || []).join(", ") || "Recherche internationale")}</small>
        </div>
        <span>${escapeHtml(item.signals.length)} signal(s)</span>
        <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt, true))}</time>
        <button class="button button-secondary button-small" type="button" data-view-mining="${escapeHtml(item.id)}">Voir</button>
      </article>
    `).join("")
    : '<p class="empty-message">Aucune veille enregistrée.</p>';

  const signals = state.history.flatMap((item) => item.signals || []);
  const priorities = signals.filter((item) =>
    ["Tres prioritaire", "Prioritaire"].includes(item.classification)
  );
  document.getElementById("mining-search-count").textContent = state.history.length;
  document.getElementById("mining-signal-count").textContent = signals.length;
  document.getElementById("mining-priority-count").textContent = priorities.length;
  document.getElementById("mining-last-date").textContent = formatDate(state.history[0]?.createdAt, true);
}

async function loadInitialData() {
  setBusy(true, "Chargement de la veille…");
  try {
    const [options, history] = await Promise.all([api("sources"), api("history")]);
    state.sources = options.sources;
    state.needs = options.needs;
    state.history = history;
    renderOptions();
    renderHistory();
    if (state.history[0]) renderResult(state.history[0]);
    setBusy(false, "");
  } catch (error) {
    setError(error);
  }
}

async function loadHistory() {
  setBusy(true, "Actualisation de l'historique…");
  try {
    state.history = await api("history");
    renderHistory();
    setBusy(false, "");
  } catch (error) {
    setError(error);
  }
}

async function runSearch(criteria) {
  setBusy(true, "Surveillance web et analyse OpenAI en cours…");
  try {
    const result = await api("search", { method: "POST", body: criteria });
    renderResult(result);
    state.history = await api("history");
    renderHistory();
    setBusy(false, "Veille minière terminée et enregistrée.");
  } catch (error) {
    setError(error);
  }
}

async function authenticate(event) {
  event.preventDefault();
  loginStatus.textContent = "Connexion en cours…";
  const data = new FormData(loginForm);
  try {
    const response = await fetch("/api/business-radar-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Connexion impossible.");
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    await loadInitialData();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(formPayload());
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("refresh-mining-history").addEventListener("click", loadHistory);
document.getElementById("rerun-mining-search").addEventListener("click", () => {
  if (state.selected) runSearch(state.selected.criteria);
});
document.getElementById("mining-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-mining]");
  if (!button) return;
  const selected = state.history.find((item) => item.id === button.dataset.viewMining);
  if (selected) renderResult(selected);
});
document.getElementById("mining-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("mining-email").focus();
});

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadInitialData();
