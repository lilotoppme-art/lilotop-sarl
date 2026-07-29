"use strict";

const body = document.body;
const loginScreen = document.getElementById("tender-login");
const appShell = document.getElementById("tender-shell");
const loginForm = document.getElementById("tender-login-form");
const loginStatus = document.getElementById("tender-login-status");
const globalStatus = document.getElementById("tender-status");
const searchForm = document.getElementById("tender-search-form");
const state = { sources: [], history: [], selected: null };

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
  document.title = `${authenticated ? "Appels d'Offres AI" : "Connexion Appels d'Offres AI"} | LILOTOP SARL`;
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
  const response = await fetch(`/api/tender-ai?action=${encodeURIComponent(action)}${options.query || ""}`, {
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
    throw Object.assign(new Error(payload.error || "Erreur Appels d'Offres AI"), { code: payload.code });
  }
  return payload.data;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function renderSources() {
  document.getElementById("tender-source-grid").innerHTML = state.sources.map((source) => `
    <label class="source-option">
      <input name="sources" type="checkbox" value="${escapeHtml(source.id)}" checked>
      <span>${escapeHtml(source.name)}</span>
    </label>
  `).join("");
}

function formPayload() {
  const data = new FormData(searchForm);
  return {
    countries: splitList(data.get("countries")),
    sectors: splitList(data.get("sectors")),
    minimumAmount: data.get("minimumAmount"),
    deadlineBefore: data.get("deadlineBefore"),
    organizations: splitList(data.get("organizations")),
    keywords: data.get("keywords"),
    sources: data.getAll("sources")
  };
}

function populateForm(criteria = {}) {
  searchForm.elements.countries.value = (criteria.countries || []).join(", ");
  searchForm.elements.sectors.value = (criteria.sectors || []).join(", ");
  searchForm.elements.minimumAmount.value = criteria.minimumAmount || "";
  searchForm.elements.deadlineBefore.value = criteria.deadlineBefore || "";
  searchForm.elements.organizations.value = (criteria.organizations || []).join(", ");
  searchForm.elements.keywords.value = criteria.keywords || "";
  const selected = new Set((criteria.sources || []).map((source) => source.id || source));
  searchForm.querySelectorAll('[name="sources"]').forEach((input) => {
    input.checked = !selected.size || selected.has(input.value);
  });
}

function listItems(targetId, items) {
  document.getElementById(targetId).innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Aucun élément identifié.</li>";
}

function detailItems(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Aucun élément identifié.</li>"}</${tag}>`;
}

function renderResult(result) {
  state.selected = result;
  document.getElementById("tender-result-empty").hidden = true;
  document.getElementById("tender-result-content").hidden = false;
  document.getElementById("rerun-tender-search").disabled = false;
  document.getElementById("tender-executive-summary").textContent = result.executiveSummary;

  document.getElementById("tender-rows").innerHTML = result.tenders.length
    ? result.tenders.map((tender) => {
      const source = safeUrl(tender.sourceUrl);
      return `
        <tr>
          <td>
            <span class="tender-title">${escapeHtml(tender.title)}</span>
            <span class="tender-evidence">${escapeHtml(tender.evidence)}</span>
          </td>
          <td>${escapeHtml(tender.organization)}<br><small>${escapeHtml(tender.sourceName)}</small></td>
          <td>${escapeHtml(tender.country)}<br><small>${escapeHtml(tender.sector)}</small></td>
          <td>${escapeHtml(tender.estimatedAmount)} ${escapeHtml(tender.currency)}</td>
          <td>${escapeHtml(tender.deadline)}</td>
          <td>
            <span class="score-chip">${escapeHtml(tender.interestScore)}/100</span>
            <span class="classification ${classificationClass(tender.classification)}">${escapeHtml(tender.classification)}</span>
          </td>
          <td><span class="chance-chip">${escapeHtml(tender.winChanceScore)}%</span></td>
          <td>${source
            ? `<a class="tender-source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Consulter</a>`
            : "Non disponible"}</td>
        </tr>
      `;
    }).join("")
    : '<tr><td colspan="8" class="empty-cell">Aucun appel d\'offres actuel suffisamment documenté.</td></tr>';

  document.getElementById("tender-detail-list").innerHTML = result.tenders.map((tender) => `
    <details class="tender-detail">
      <summary>
        <span>${escapeHtml(tender.title)}</span>
        <span class="score-chip">${escapeHtml(tender.interestScore)}/100</span>
      </summary>
      <div class="tender-detail-body">
        <section><h4>Résumé</h4><p>${escapeHtml(tender.summary)}</p></section>
        <section><h4>Risques</h4>${detailItems(tender.risks)}</section>
        <section><h4>Actions recommandées</h4>${detailItems(tender.recommendedActions, true)}</section>
      </div>
    </details>
  `).join("");

  listItems("tender-global-risks", result.globalRisks);
  listItems("tender-global-actions", result.globalRecommendations);
  populateForm(result.criteria);
}

function renderHistory() {
  const target = document.getElementById("tender-history");
  if (!state.history.length) {
    target.innerHTML = '<p class="empty-message">Aucune recherche enregistrée.</p>';
  } else {
    target.innerHTML = state.history.map((item) => `
      <article class="tender-history-entry">
        <div>
          <strong>${escapeHtml((item.criteria.sectors || []).join(", ") || "Veille multisectorielle")}</strong>
          <small>${escapeHtml((item.criteria.countries || []).join(", ") || "Recherche internationale")}</small>
        </div>
        <span>${escapeHtml(item.tenders.length)} appel(s) d'offres</span>
        <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt, true))}</time>
        <button class="button button-secondary button-small" type="button" data-view-tender="${escapeHtml(item.id)}">Voir</button>
      </article>
    `).join("");
  }

  const allTenders = state.history.flatMap((item) => item.tenders || []);
  const priorities = allTenders.filter((item) =>
    ["Très prioritaire", "Prioritaire"].includes(item.classification)
  );
  document.getElementById("tender-search-count").textContent = state.history.length;
  document.getElementById("tender-result-count").textContent = allTenders.length;
  document.getElementById("tender-priority-count").textContent = priorities.length;
  document.getElementById("tender-last-date").textContent = formatDate(state.history[0]?.createdAt, true);
}

async function loadInitialData() {
  setBusy(true, "Chargement de la veille…");
  try {
    [state.sources, state.history] = await Promise.all([api("sources"), api("history")]);
    renderSources();
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
  setBusy(true, "Recherche et analyse OpenAI en cours…");
  try {
    const result = await api("search", { method: "POST", body: criteria });
    renderResult(result);
    state.history = await api("history");
    renderHistory();
    setBusy(false, "Veille terminée et résultats enregistrés.");
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
document.getElementById("refresh-tender-history").addEventListener("click", loadHistory);
document.getElementById("rerun-tender-search").addEventListener("click", () => {
  if (state.selected) runSearch(state.selected.criteria);
});
document.getElementById("tender-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-tender]");
  if (!button) return;
  const selected = state.history.find((item) => item.id === button.dataset.viewTender);
  if (selected) renderResult(selected);
});
document.getElementById("tender-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("tender-email").focus();
});

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadInitialData();
