"use strict";

const body = document.body;
const loginScreen = document.getElementById("procurement-login");
const appShell = document.getElementById("procurement-shell");
const loginForm = document.getElementById("procurement-login-form");
const loginStatus = document.getElementById("procurement-login-status");
const globalStatus = document.getElementById("procurement-status");
const searchForm = document.getElementById("supplier-search-form");
const state = { history: [], selected: null };

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
  document.title = `${authenticated ? "Achats AI" : "Connexion Achats AI"} | LILOTOP SARL`;
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
  const response = await fetch(`/api/procurement-ai?action=${encodeURIComponent(action)}${options.query || ""}`, {
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
    throw Object.assign(new Error(payload.error || "Erreur Achats AI"), { code: payload.code });
  }
  return payload.data;
}

function listItems(targetId, items) {
  document.getElementById(targetId).innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Aucun élément identifié.</li>";
}

function populateForm(criteria = {}) {
  searchForm.elements.product.value = criteria.product || "";
  searchForm.elements.countries.value = (criteria.countries || []).join(", ");
  searchForm.elements.quantity.value = criteria.quantity || "";
  searchForm.elements.requirements.value = criteria.requirements || "";
  const types = criteria.supplierTypes || ["manufacturer", "distributor"];
  searchForm.querySelectorAll('[name="supplierTypes"]').forEach((input) => {
    input.checked = types.includes(input.value);
  });
}

function formPayload() {
  const data = new FormData(searchForm);
  return {
    product: data.get("product"),
    countries: String(data.get("countries") || "").split(",").map((item) => item.trim()).filter(Boolean),
    supplierTypes: data.getAll("supplierTypes"),
    quantity: data.get("quantity"),
    requirements: data.get("requirements")
  };
}

function renderResult(result) {
  state.selected = result;
  document.getElementById("result-empty").hidden = true;
  document.getElementById("result-content").hidden = false;
  document.getElementById("result-title").textContent = result.criteria.product;
  document.getElementById("result-summary").textContent = result.summary;
  document.getElementById("rerun-search").disabled = false;

  document.getElementById("supplier-rows").innerHTML = result.suppliers.length
    ? result.suppliers.map((supplier) => {
      const sourceUrl = safeUrl(supplier.sourceUrl || supplier.website);
      return `
        <tr>
          <td>
            <span class="supplier-name">${escapeHtml(supplier.name)}</span>
            <span class="supplier-evidence">${escapeHtml(supplier.evidence)}</span>
          </td>
          <td>${escapeHtml(supplier.country || "À confirmer")}</td>
          <td><span class="supplier-type">${supplier.supplierType === "manufacturer" ? "Fabricant" : "Distributeur"}</span></td>
          <td><span class="score-chip">${escapeHtml(supplier.qualityScore)}/100</span></td>
          <td>${escapeHtml(supplier.estimatedLeadTime || "À confirmer")}</td>
          <td>${escapeHtml(supplier.estimatedPrice || "Sur devis")}</td>
          <td>${sourceUrl
            ? `<a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Consulter</a>`
            : "Non disponible"}</td>
        </tr>
      `;
    }).join("")
    : '<tr><td colspan="7" class="empty-cell">Aucun fournisseur suffisamment documenté.</td></tr>';

  listItems("result-advantages", result.advantages);
  listItems("result-risks", result.risks);
  listItems("result-recommendations", result.recommendations);
  populateForm(result.criteria);
}

function renderHistory() {
  const target = document.getElementById("search-history");
  if (!state.history.length) {
    target.innerHTML = '<p class="empty-message">Aucune recherche enregistrée.</p>';
  } else {
    target.innerHTML = state.history.map((item) => `
      <article class="procurement-history-entry">
        <div>
          <strong>${escapeHtml(item.criteria.product)}</strong>
          <small>${escapeHtml((item.criteria.countries || []).join(", ") || "Recherche internationale")}</small>
        </div>
        <span>${escapeHtml(item.suppliers.length)} fournisseur(s)</span>
        <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt, true))}</time>
        <button class="button button-secondary button-small" type="button" data-view-search="${escapeHtml(item.id)}">Voir</button>
      </article>
    `).join("");
  }

  const allSuppliers = state.history.flatMap((item) => item.suppliers || []);
  const countries = new Set(allSuppliers.map((item) => item.country).filter(Boolean));
  document.getElementById("search-count").textContent = state.history.length;
  document.getElementById("supplier-count").textContent = allSuppliers.length;
  document.getElementById("country-count").textContent = countries.size;
  document.getElementById("last-search-date").textContent = formatDate(state.history[0]?.createdAt, true);
}

async function loadHistory() {
  setBusy(true, "Chargement de l'historique…");
  try {
    state.history = await api("history");
    renderHistory();
    if (!state.selected && state.history[0]) renderResult(state.history[0]);
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
    setBusy(false, "Recherche fournisseurs terminée et enregistrée.");
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
    await loadHistory();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(formPayload());
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("refresh-history").addEventListener("click", loadHistory);
document.getElementById("rerun-search").addEventListener("click", () => {
  if (state.selected) runSearch(state.selected.criteria);
});
document.getElementById("search-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-search]");
  if (!button) return;
  const selected = state.history.find((item) => item.id === button.dataset.viewSearch);
  if (selected) renderResult(selected);
});
document.getElementById("procurement-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("procurement-email").focus();
});

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadHistory();
