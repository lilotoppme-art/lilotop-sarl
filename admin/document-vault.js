"use strict";

const body = document.body;
const loginScreen = document.getElementById("vault-login");
const shell = document.getElementById("vault-shell");
const loginForm = document.getElementById("vault-login-form");
const loginStatus = document.getElementById("vault-login-status");
const statusBox = document.getElementById("vault-status");
const uploadForm = document.getElementById("vault-upload-form");
const state = { documents: [], selected: null };

const categoryLabels = {
  administrative: "Administratif",
  legal: "Juridique",
  fiscal: "Fiscal",
  hse: "HSE",
  technical: "Technique",
  financial: "Financier",
  certification: "Certification",
  reference: "Référence",
  other: "Autre"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setAuthenticated(value) {
  body.dataset.authenticated = String(value);
  loginScreen.hidden = value;
  shell.hidden = !value;
}

function setStatus(message, error = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", error);
  body.classList.toggle("is-busy", Boolean(message) && !error);
}

function formatDate(value, withTime = false) {
  if (!value) return "Sans échéance";
  const options = withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(value));
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

async function api(action, options = {}) {
  const response = await fetch(`/api/document-vault?action=${encodeURIComponent(action)}${options.query || ""}`, {
    method: options.method || "GET",
    body: options.body
  });
  if (options.raw) {
    if (!response.ok) throw new Error("Téléchargement impossible");
    return response;
  }
  const payload = await response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  if (response.status === 401) {
    location.reload();
    throw new Error("Session expirée");
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible");
  return payload.data;
}

function updateSummary() {
  const valid = state.documents.filter((item) => item.status === "valid").length;
  const today = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;
  const expiring = state.documents.filter((item) => {
    const expires = item.expiresOn ? new Date(item.expiresOn).getTime() : 0;
    return expires >= today && expires - today <= sixtyDays;
  }).length;
  document.getElementById("vault-total").textContent = state.documents.length;
  document.getElementById("vault-valid").textContent = valid;
  document.getElementById("vault-expiring").textContent = expiring;
  document.getElementById("vault-expired").textContent =
    state.documents.filter((item) => item.status === "expired").length;
}

function renderDocuments() {
  const target = document.getElementById("vault-list");
  target.innerHTML = state.documents.length ? state.documents.map((item) => `
    <article class="vault-document ${item.status === "expired" ? "is-expired" : ""}">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(categoryLabels[item.category] || item.category)} · ${escapeHtml(item.sourceFilename)}</p>
        <small>${escapeHtml(item.description || "Aucune description")}</small>
      </div>
      <div class="vault-meta"><span>Version</span><strong>${escapeHtml(item.version)}</strong></div>
      <div class="vault-meta"><span>Délivré</span><strong>${escapeHtml(item.issuedOn ? formatDate(item.issuedOn) : "Non renseigné")}</strong></div>
      <div class="vault-meta">
        <span>Expiration</span>
        <strong class="vault-status ${escapeHtml(item.status)}">${escapeHtml(item.expiresOn ? formatDate(item.expiresOn) : "Sans expiration")}</strong>
      </div>
      <div class="vault-actions">
        <button type="button" data-preview="${escapeHtml(item.versionId)}">Aperçu</button>
        <button type="button" data-history="${escapeHtml(item.id)}">Historique</button>
        <button type="button" data-replace="${escapeHtml(item.id)}">Remplacer</button>
      </div>
    </article>
  `).join("") : '<p class="empty-message">Aucun document enregistré.</p>';
  updateSummary();
}

async function loadDocuments() {
  const params = new URLSearchParams({
    search: document.getElementById("vault-search").value,
    category: document.getElementById("vault-category-filter").value,
    status: document.getElementById("vault-status-filter").value
  });
  state.documents = await api("list", { query: `&${params}` });
  renderDocuments();
}

function resetReplacement() {
  uploadForm.reset();
  document.getElementById("vault-document-id").value = "";
  document.getElementById("vault-form-title").textContent = "Ajouter un document";
  document.getElementById("vault-cancel-replacement").hidden = true;
  document.getElementById("vault-selected-file").textContent = "Aucun fichier sélectionné";
  state.selected = null;
}

function startReplacement(documentId) {
  const item = state.documents.find((document) => document.id === documentId);
  if (!item) return;
  state.selected = item;
  document.getElementById("vault-document-id").value = item.id;
  document.getElementById("vault-title").value = item.title;
  document.getElementById("vault-category").value = item.category;
  document.getElementById("vault-description").value = item.description || "";
  document.getElementById("vault-version").value = "";
  document.getElementById("vault-issued-on").value = item.issuedOn ? String(item.issuedOn).slice(0, 10) : "";
  document.getElementById("vault-expires-on").value = item.expiresOn ? String(item.expiresOn).slice(0, 10) : "";
  document.getElementById("vault-notes").value = "";
  document.getElementById("vault-form-title").textContent = `Nouvelle version · ${item.title}`;
  document.getElementById("vault-cancel-replacement").hidden = false;
  uploadForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function showPreview(versionId) {
  const item = await api("preview", { query: `&version=${encodeURIComponent(versionId)}` });
  const dialog = document.getElementById("vault-preview-dialog");
  document.getElementById("vault-preview-title").textContent = `${item.title} · ${item.version}`;
  const download = document.getElementById("vault-download");
  download.href = `/api/document-vault?action=file&version=${encodeURIComponent(versionId)}`;
  const content = document.getElementById("vault-preview-content");
  content.innerHTML = item.extension === "pdf"
    ? `<iframe title="Aperçu PDF de ${escapeHtml(item.title)}" src="/api/document-vault?action=file&disposition=inline&version=${encodeURIComponent(versionId)}"></iframe>`
    : `<pre>${escapeHtml(item.previewText || "Aucun aperçu textuel disponible. Téléchargez le fichier pour le consulter.")}</pre>`;
  dialog.showModal();
}

async function showHistory(documentId) {
  const history = await api("history", { query: `&id=${encodeURIComponent(documentId)}` });
  const dialog = document.getElementById("vault-history-dialog");
  document.getElementById("vault-history-title").textContent =
    history.length ? `Historique · ${history[0].title}` : "Historique des versions";
  document.getElementById("vault-history").innerHTML = history.map((item) => `
    <article class="vault-history-entry">
      <strong>${escapeHtml(item.version)} · ${escapeHtml(item.sourceFilename)}</strong>
      <span>${escapeHtml(formatBytes(item.fileSize))} · Importé le ${escapeHtml(formatDate(item.createdAt, true))}</span>
      <span>Délivré : ${escapeHtml(item.issuedOn ? formatDate(item.issuedOn) : "Non renseigné")} · Expiration : ${escapeHtml(item.expiresOn ? formatDate(item.expiresOn) : "Sans expiration")}</span>
      <span>Empreinte : ${escapeHtml(item.sha256.slice(0, 12))}… · ${escapeHtml(item.uploadedBy)}</span>
    </article>
  `).join("");
  dialog.showModal();
}

async function uploadDocument(event) {
  event.preventDefault();
  const file = document.getElementById("vault-file").files[0];
  if (!file) return setStatus("Sélectionnez un fichier.", true);
  if (file.size > 3 * 1024 * 1024) return setStatus("Le fichier dépasse la limite de 3 Mo.", true);
  setStatus("Enregistrement et indexation du document…");
  try {
    await api("upload", { method: "POST", body: new FormData(uploadForm) });
    resetReplacement();
    await loadDocuments();
    setStatus("Document enregistré. L'historique des versions est conservé.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
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
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Connexion impossible");
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    await loadDocuments();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

let searchTimer;
document.getElementById("vault-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadDocuments().catch((error) => setStatus(error.message, true)), 250);
});
document.getElementById("vault-category-filter").addEventListener("change", () => loadDocuments().catch((error) => setStatus(error.message, true)));
document.getElementById("vault-status-filter").addEventListener("change", () => loadDocuments().catch((error) => setStatus(error.message, true)));
document.getElementById("vault-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  document.getElementById("vault-selected-file").textContent =
    file ? `${file.name} · ${formatBytes(file.size)}` : "Aucun fichier sélectionné";
});
document.getElementById("vault-list").addEventListener("click", (event) => {
  const preview = event.target.closest("[data-preview]");
  const history = event.target.closest("[data-history]");
  const replace = event.target.closest("[data-replace]");
  if (preview) showPreview(preview.dataset.preview).catch((error) => setStatus(error.message, true));
  if (history) showHistory(history.dataset.history).catch((error) => setStatus(error.message, true));
  if (replace) startReplacement(replace.dataset.replace);
});
document.getElementById("vault-cancel-replacement").addEventListener("click", resetReplacement);
document.getElementById("vault-preview-close").addEventListener("click", () => document.getElementById("vault-preview-dialog").close());
document.getElementById("vault-history-close").addEventListener("click", () => document.getElementById("vault-history-dialog").close());
document.getElementById("vault-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
});
loginForm.addEventListener("submit", authenticate);
uploadForm.addEventListener("submit", uploadDocument);

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadDocuments().catch((error) => setStatus(error.message, true));
