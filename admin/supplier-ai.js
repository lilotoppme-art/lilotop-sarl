"use strict";

const body = document.body;
const loginScreen = document.getElementById("supplier-ai-login");
const shell = document.getElementById("supplier-ai-shell");
const loginForm = document.getElementById("supplier-ai-login-form");
const loginStatus = document.getElementById("supplier-ai-login-status");
const globalStatus = document.getElementById("supplier-ai-status");
const searchForm = document.getElementById("supplier-search-form");
const rfqForm = document.getElementById("rfq-form");
const state = { history: { searches: [], rfqs: [], favoriteKeys: [] }, selectedSearch: null, selectedSupplier: null, selectedRfq: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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

function setAuthenticated(value) {
  body.dataset.authenticated = String(value);
  loginScreen.hidden = value;
  shell.hidden = !value;
  document.title = `${value ? "Fournisseurs AI" : "Connexion Fournisseurs AI"} | LILOTOP SARL`;
}

function setStatus(message = "", error = false) {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("error", error);
  body.classList.toggle("is-busy", Boolean(message) && !error);
}

async function api(action, options = {}) {
  const response = await fetch(`/api/supplier-ai?action=${encodeURIComponent(action)}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  if (response.status === 401) {
    location.reload();
    throw new Error("Session expirée");
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Erreur Fournisseurs AI");
  return payload.data;
}

function searchPayload() {
  const data = new FormData(searchForm);
  return {
    category: data.get("category"),
    product: data.get("product"),
    countries: String(data.get("countries") || "").split(",").map((item) => item.trim()).filter(Boolean),
    requirements: data.get("requirements")
  };
}

function tags(items, fallback) {
  return items?.length
    ? `<div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : `<div class="tag-list"><span>${escapeHtml(fallback)}</span></div>`;
}

function renderSuppliers(search) {
  state.selectedSearch = search;
  document.getElementById("supplier-results-title").textContent = search.criteria.product;
  document.getElementById("supplier-result-summary").textContent = search.summary;
  document.getElementById("rerun-supplier-search").disabled = false;
  const favorites = new Set(state.history.favoriteKeys);
  document.getElementById("supplier-results").innerHTML = search.suppliers.length
    ? search.suppliers.map((supplier) => {
      const website = safeUrl(supplier.website || supplier.sourceUrl);
      const source = safeUrl(supplier.sourceUrl);
      const isFavorite = favorites.has(supplier.supplierKey);
      return `
        <article class="supplier-card">
          <div class="supplier-card-header">
            <div><h3>${escapeHtml(supplier.name)}</h3><span>${escapeHtml(supplier.country || "Pays à confirmer")}</span></div>
            <span class="score">${escapeHtml(supplier.reliabilityScore)}/100</span>
          </div>
          <div class="supplier-details">
            <span><strong>Site web</strong>${website ? `<a class="source-link" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Consulter</a>` : "Non publié"}</span>
            <span><strong>E-mail commercial</strong>${escapeHtml(supplier.commercialEmail || "Non publié")}</span>
            <span><strong>Téléphone</strong>${escapeHtml(supplier.phone || "Non publié")}</span>
            <span><strong>Source</strong>${source ? `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Vérifier</a>` : "Non disponible"}</span>
          </div>
          <strong>Produits</strong>${tags(supplier.products, "À confirmer")}
          <strong>Certifications vérifiées</strong>${tags(supplier.certifications, "Non publiées")}
          <p>${escapeHtml(supplier.evidence)}</p>
          <div class="supplier-actions">
            <button class="button button-primary" type="button" data-prepare-rfq="${escapeHtml(supplier.supplierKey)}">Préparer RFQ</button>
            <button class="button button-secondary" type="button" data-toggle-favorite="${escapeHtml(supplier.supplierKey)}">${isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}</button>
          </div>
        </article>
      `;
    }).join("")
    : '<p class="empty-message">Aucun fournisseur suffisamment documenté.</p>';
}

function statusLabel(status) {
  return ({ draft: "Brouillon", opened: "Ouvert pour envoi", sent: "Envoyé confirmé", responded: "Réponse reçue" })[status] || status;
}

function renderRfq(rfq) {
  state.selectedRfq = rfq;
  document.getElementById("rfq-preview").hidden = false;
  document.getElementById("rfq-preview-subject").textContent = rfq.subject;
  document.getElementById("rfq-preview-body").textContent = rfq.emailBody;
  document.getElementById("rfq-status-badge").textContent = statusLabel(rfq.status);
  document.getElementById("confirm-rfq-sent").hidden = rfq.status !== "opened";
  document.getElementById("mark-rfq-responded").hidden = rfq.status !== "sent";
  document.getElementById("open-rfq-email").disabled = ["sent", "responded"].includes(rfq.status);
  document.getElementById("rfq-preview").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const target = document.getElementById("rfq-history");
  target.innerHTML = state.history.rfqs.length
    ? state.history.rfqs.map((rfq) => `
      <article class="history-entry">
        <div><strong>${escapeHtml(rfq.subject)}</strong><small>${escapeHtml(rfq.supplier.name || "Fournisseur")}</small></div>
        <span>${escapeHtml(rfq.quantity)} · ${escapeHtml(rfq.incoterm)}</span>
        <span class="status-chip">${escapeHtml(statusLabel(rfq.status))}</span>
        <button class="button button-secondary" type="button" data-view-rfq="${escapeHtml(rfq.id)}">Voir</button>
      </article>
    `).join("")
    : '<p class="empty-message">Aucune RFQ préparée.</p>';
}

async function loadHistory() {
  state.history = await api("history");
  renderHistory();
  const dashboard = await api("dashboard");
  document.getElementById("stat-suppliers").textContent = dashboard.suppliersFound;
  document.getElementById("stat-prepared").textContent = dashboard.rfqsPrepared;
  document.getElementById("stat-sent").textContent = dashboard.rfqsSent;
  document.getElementById("stat-responses").textContent = dashboard.responsesReceived;
  document.getElementById("stat-favorites").textContent = dashboard.favorites;
  if (!state.selectedSearch && state.history.searches[0]) renderSuppliers(state.history.searches[0]);
}

async function runSearch(criteria) {
  setStatus("Recherche web et analyse OpenAI en cours…");
  try {
    const result = await api("search", { method: "POST", body: criteria });
    state.history = await api("history");
    renderSuppliers(result);
    renderHistory();
    await loadHistory();
    setStatus("Recherche fournisseurs terminée.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
  }
}

function openRfqForm(supplierKey) {
  const supplier = state.selectedSearch?.suppliers.find((item) => item.supplierKey === supplierKey);
  if (!supplier) return;
  state.selectedSupplier = supplier;
  document.getElementById("rfq-panel").hidden = false;
  document.getElementById("rfq-supplier-name").textContent = `Préparer RFQ · ${supplier.name}`;
  rfqForm.elements.searchId.value = state.selectedSearch.id;
  rfqForm.elements.supplierKey.value = supplier.supplierKey;
  rfqForm.elements.description.value = state.selectedSearch.criteria.product;
  document.getElementById("rfq-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function prepareRfq(event) {
  event.preventDefault();
  const data = new FormData(rfqForm);
  const payload = Object.fromEntries(data.entries());
  setStatus("Préparation du brouillon RFQ…");
  try {
    const rfq = await api("prepare-rfq", { method: "POST", body: payload });
    renderRfq(rfq);
    await loadHistory();
    setStatus("RFQ préparée. Vérifiez-la avant d'ouvrir votre messagerie.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
  }
}

async function toggleFavorite(supplierKey) {
  await api("toggle-favorite", {
    method: "POST",
    body: { searchId: state.selectedSearch.id, supplierKey }
  });
  await loadHistory();
  renderSuppliers(state.selectedSearch);
}

async function openEmail() {
  if (!state.selectedRfq) return;
  const result = await api("open-rfq", { method: "POST", body: { id: state.selectedRfq.id } });
  renderRfq(result);
  await loadHistory();
  location.href = result.mailto;
}

async function updateRfq(action) {
  if (!state.selectedRfq) return;
  const result = await api(action, { method: "POST", body: { id: state.selectedRfq.id } });
  renderRfq(result);
  await loadHistory();
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
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Connexion impossible");
    setAuthenticated(true);
    loginForm.reset();
    loginStatus.textContent = "";
    await loadHistory();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

searchForm.addEventListener("submit", (event) => { event.preventDefault(); runSearch(searchPayload()); });
rfqForm.addEventListener("submit", prepareRfq);
loginForm.addEventListener("submit", authenticate);
document.getElementById("supplier-results").addEventListener("click", (event) => {
  const prepare = event.target.closest("[data-prepare-rfq]");
  const favorite = event.target.closest("[data-toggle-favorite]");
  if (prepare) openRfqForm(prepare.dataset.prepareRfq);
  if (favorite) toggleFavorite(favorite.dataset.toggleFavorite).catch((error) => setStatus(error.message, true));
});
document.getElementById("rfq-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-rfq]");
  if (!button) return;
  const rfq = state.history.rfqs.find((item) => item.id === button.dataset.viewRfq);
  if (rfq) renderRfq(rfq);
});
document.getElementById("rerun-supplier-search").addEventListener("click", () => {
  if (state.selectedSearch) runSearch(state.selectedSearch.criteria);
});
document.getElementById("open-rfq-email").addEventListener("click", () => {
  openEmail().catch((error) => setStatus(error.message, true));
});
document.getElementById("confirm-rfq-sent").addEventListener("click", () => {
  updateRfq("confirm-sent").catch((error) => setStatus(error.message, true));
});
document.getElementById("mark-rfq-responded").addEventListener("click", () => {
  updateRfq("mark-responded").catch((error) => setStatus(error.message, true));
});
document.getElementById("refresh-supplier-history").addEventListener("click", () => {
  loadHistory().catch((error) => setStatus(error.message, true));
});
document.getElementById("supplier-ai-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
});

setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") {
  loadHistory().catch((error) => setStatus(error.message, true));
}
