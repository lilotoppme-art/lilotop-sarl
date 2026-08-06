"use strict";

const body = document.body;
const loginScreen = document.getElementById("procurement-login");
const appShell = document.getElementById("procurement-shell");
const loginForm = document.getElementById("procurement-login-form");
const loginStatus = document.getElementById("procurement-login-status");
const globalStatus = document.getElementById("procurement-status");
const searchForm = document.getElementById("supplier-search-form");
const state = {
  history: [],
  selected: null,
  busy: false,
  authenticated: false,
  syncSequence: 0
};
let pollingTimer = null;

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

function sourceName(value, fallback = "Source") {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    const cleanFallback = String(fallback || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .trim();
    return cleanFallback && !cleanFallback.includes("/") ? cleanFallback : hostname;
  } catch {
    return String(fallback || "Source").trim() || "Source";
  }
}

function stripMarkdownLinks(value) {
  return String(value || "").replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1");
}

function renderSafeLinks(target, value) {
  const text = String(value || "");
  const pattern = /\[([^\]\n]{1,200})\]\((https?:\/\/[^)\s]+)\)/g;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    const href = safeUrl(match[2]);
    if (href) {
      const link = document.createElement("a");
      link.className = "source-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = sourceName(href, match[1]);
      fragment.append(link);
    } else {
      fragment.append(document.createTextNode(match[0]));
    }
    cursor = pattern.lastIndex;
  }

  fragment.append(document.createTextNode(text.slice(cursor)));
  target.replaceChildren(fragment);
}

function setAuthenticated(authenticated) {
  state.authenticated = authenticated;
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  appShell.hidden = !authenticated;
  document.title = `${authenticated ? "Achats AI" : "Connexion Achats AI"} | LILOTOP SARL`;
}

function setStatus(message = "", type = "") {
  globalStatus.textContent = message;
  globalStatus.classList.remove("error", "success", "syncing");
  if (type) globalStatus.classList.add(type);
}

function setBusy(busy, message = "") {
  state.busy = busy;
  body.classList.toggle("is-busy", busy);
  setStatus(message, busy ? "syncing" : "");
}

function setError(error) {
  state.busy = false;
  body.classList.remove("is-busy");
  setStatus(error.message || "Une erreur est survenue.", "error");
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

async function api(action, options = {}) {
  const method = options.method || "GET";
  const cacheBuster = method === "GET" ? `&_=${Date.now()}` : "";
  const response = await fetch(`/api/procurement-ai?action=${encodeURIComponent(action)}${options.query || ""}${cacheBuster}`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
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
  const target = document.getElementById(targetId);
  target.replaceChildren();
  const values = items.length ? items : ["Aucun élément identifié."];
  values.forEach((item) => {
    const listItem = document.createElement("li");
    renderSafeLinks(listItem, item);
    target.append(listItem);
  });
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
  renderSafeLinks(document.getElementById("result-summary"), result.summary);
  document.getElementById("rerun-search").disabled = false;

  document.getElementById("supplier-rows").innerHTML = result.suppliers.length
    ? result.suppliers.map((supplier) => {
      const sourceUrl = safeUrl(supplier.sourceUrl || supplier.website);
      return `
        <tr>
          <td>
            <span class="supplier-name">${escapeHtml(supplier.name)}</span>
            <span class="supplier-evidence">${escapeHtml(stripMarkdownLinks(supplier.evidence))}</span>
          </td>
          <td>${escapeHtml(supplier.country || "À confirmer")}</td>
          <td><span class="supplier-type">${supplier.supplierType === "manufacturer" ? "Fabricant" : "Distributeur"}</span></td>
          <td><span class="score-chip">${escapeHtml(supplier.qualityScore)}/100</span></td>
          <td>${escapeHtml(supplier.estimatedLeadTime || "À confirmer")}</td>
          <td>${escapeHtml(supplier.estimatedPrice || "Sur devis")}</td>
          <td>${sourceUrl
            ? `<a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName(sourceUrl, supplier.name))}</a>`
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

async function synchronizeHistory({ selectId = null, silent = false } = {}) {
  const sequence = ++state.syncSequence;
  if (!silent) setStatus("Synchronisation…", "syncing");
  try {
    const history = await api("history");
    if (sequence !== state.syncSequence) return false;
    state.history = history;
    renderHistory();
    const selectedId = selectId || state.selected?.id;
    const selected = state.history.find((item) => item.id === selectedId)
      || (!state.selected ? state.history[0] : null);
    if (selected) renderResult(selected);
    if (!silent) setStatus("Mise à jour réussie.", "success");
    return true;
  } catch (error) {
    if (sequence === state.syncSequence) {
      setStatus(`Erreur de synchronisation : ${error.message || "réessayez avec Actualiser."}`, "error");
    }
    return false;
  }
}

async function loadHistory() {
  setBusy(true, "Synchronisation…");
  const synchronized = await synchronizeHistory({ silent: true });
  state.busy = false;
  body.classList.remove("is-busy");
  setStatus(
    synchronized ? "Mise à jour réussie." : "Erreur de synchronisation : réessayez avec Actualiser.",
    synchronized ? "success" : "error"
  );
}

async function runSearch(criteria) {
  setBusy(true, "Recherche en cours…");
  try {
    const result = await api("search", { method: "POST", body: criteria });
    renderResult(result);
    setStatus("Synchronisation…", "syncing");
    const synchronized = await synchronizeHistory({ selectId: result.id, silent: true });
    state.busy = false;
    body.classList.remove("is-busy");
    setStatus(
      synchronized
        ? "Mise à jour réussie. Recherche fournisseurs enregistrée."
        : "Recherche enregistrée, mais la synchronisation a échoué. Utilisez Actualiser pour réessayer.",
      synchronized ? "success" : "error"
    );
  } catch (error) {
    setError(error);
  }
}

function stopPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = null;
}

function startPolling() {
  stopPolling();
  if (!state.authenticated || document.visibilityState !== "visible") return;
  pollingTimer = setInterval(() => {
    if (!state.busy && document.visibilityState === "visible") {
      synchronizeHistory().catch(() => {});
    }
  }, 30000);
}

function resumeSynchronization() {
  if (!state.authenticated || document.visibilityState !== "visible") return;
  if (!state.busy) synchronizeHistory().catch(() => {});
  startPolling();
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
    startPolling();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(formPayload());
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("refresh-history").addEventListener("click", () => synchronizeHistory());
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
  stopPolling();
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("procurement-email").focus();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopPolling();
  else resumeSynchronization();
});
window.addEventListener("focus", resumeSynchronization);
window.addEventListener("beforeunload", stopPolling);

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) {
  loadHistory().finally(startPolling);
}
