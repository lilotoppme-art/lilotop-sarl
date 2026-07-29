"use strict";

const body = document.body;
const loginScreen = document.getElementById("tender-response-login");
const appShell = document.getElementById("tender-response-shell");
const loginForm = document.getElementById("tender-response-login-form");
const loginStatus = document.getElementById("tender-response-login-status");
const globalStatus = document.getElementById("tender-response-status");
const uploadForm = document.getElementById("tender-response-form");
const state = { history: [], selected: null, activeDocument: "submission" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  appShell.hidden = !authenticated;
  document.title = `${authenticated ? "Réponse Appels d'Offres AI" : "Connexion"} | LILOTOP SARL`;
}

function setStatus(message, isError = false) {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("error", isError);
  body.classList.toggle("is-busy", Boolean(message) && !isError);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function api(action, options = {}) {
  const response = await fetch(`/api/tender-response-ai?action=${encodeURIComponent(action)}${options.query || ""}`, {
    method: options.method || "GET",
    body: options.body
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  if (response.status === 401) {
    location.reload();
    throw new Error("Session expirée");
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible");
  return payload.data;
}

function renderList(id, values, ordered = false) {
  const target = document.getElementById(id);
  target.innerHTML = (values || []).length
    ? values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")
    : "<li>Aucun élément identifié.</li>";
  if (ordered) target.setAttribute("aria-label", "Actions recommandées");
}

function documentContent(analysis, key) {
  const documents = analysis.generatedDocuments || {};
  const mapping = {
    submission: ["Lettre de soumission", documents.submissionLetter || ""],
    technical: ["Offre technique", documents.technicalOffer || ""],
    financial: ["Offre financière · modèle", documents.financialOfferTemplate || ""],
    checklist: ["Check-list de conformité", (documents.complianceChecklist || []).map((item) => `- ${item}`).join("\n")],
    planning: ["Planning d'exécution", (documents.executionPlan || []).map((item) => `- ${item}`).join("\n")],
    attachments: ["Liste des pièces jointes", (documents.attachmentsList || []).map((item) => `- ${item}`).join("\n")]
  };
  return mapping[key] || mapping.submission;
}

function showGeneratedDocument(key) {
  state.activeDocument = key;
  document.querySelectorAll("[data-document]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.document === key);
  });
  if (!state.selected) return;
  const [title, content] = documentContent(state.selected, key);
  document.getElementById("generated-document-title").textContent = title;
  document.getElementById("generated-document-content").textContent = content;
}

function renderAnalysis(analysis) {
  state.selected = analysis;
  const info = analysis.keyInformation || {};
  const compliance = analysis.compliance || {};
  document.getElementById("tender-response-summary").hidden = false;
  document.getElementById("tender-response-result-panel").hidden = false;
  document.getElementById("compliance-score").textContent = `${compliance.compliancePercent || 0}%`;
  document.getElementById("summary-client").textContent = info.client || "À confirmer";
  document.getElementById("summary-deadline").textContent = info.deadline || "À confirmer";
  document.getElementById("response-subject").textContent = info.subject || "Dossier préparé";
  document.getElementById("response-executive-summary").textContent = analysis.executiveSummary || "";
  document.getElementById("key-information").innerHTML = [
    ["Client", info.client],
    ["Pays", info.country],
    ["Date limite", info.deadline],
    ["Budget", info.budget]
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "À confirmer")}</dd></div>`).join("");
  renderList("qualification-criteria", info.qualificationCriteria);
  renderList("requested-products", info.requestedProducts);
  renderList("delivery-conditions", info.deliveryConditions);
  renderList("evaluation-criteria", info.evaluationCriteria);
  renderList("available-documents-result", compliance.availableDocuments);
  renderList("missing-documents-result", compliance.missingDocuments);
  renderList("response-risks", analysis.risks);
  renderList("response-actions", analysis.recommendedActions, true);
  document.getElementById("export-tender-response").href =
    `/api/tender-response-ai?action=export&id=${encodeURIComponent(analysis.id)}`;
  showGeneratedDocument("submission");
  document.getElementById("tender-response-result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const target = document.getElementById("tender-response-history");
  target.innerHTML = state.history.length
    ? state.history.map((analysis) => `
      <button class="history-entry-button" type="button" data-analysis-id="${escapeHtml(analysis.id)}">
        <span>
          <strong>${escapeHtml(analysis.keyInformation?.subject || analysis.sourceFilename)}</strong>
          <small>${escapeHtml(analysis.keyInformation?.client || "Client à confirmer")} · ${escapeHtml(formatDate(analysis.createdAt))}</small>
        </span>
        <span class="compliance-chip">${escapeHtml(analysis.compliance?.compliancePercent || 0)}%</span>
      </button>
    `).join("")
    : '<p class="empty-message">Aucun dossier préparé.</p>';
}

async function loadHistory() {
  state.history = await api("history");
  renderHistory();
}

async function prepareDossier(event) {
  event.preventDefault();
  const file = document.getElementById("tender-response-file").files[0];
  if (!file) return setStatus("Sélectionnez un fichier PDF, DOCX ou ZIP.", true);
  if (file.size > 3 * 1024 * 1024) return setStatus("Le fichier dépasse la limite de 3 Mo.", true);
  setStatus("Extraction du document et préparation OpenAI en cours…");
  try {
    const data = new FormData(uploadForm);
    const analysis = await api("prepare", { method: "POST", body: data });
    await loadHistory();
    renderAnalysis(analysis);
    setStatus("Dossier préparé. Validation humaine obligatoire avant toute soumission.");
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
    await loadHistory();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

document.getElementById("tender-response-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  document.getElementById("selected-tender-file").textContent = file
    ? `${file.name} · ${(file.size / 1024).toFixed(0)} Ko`
    : "Aucun fichier sélectionné";
});
document.querySelector(".document-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-document]");
  if (button) showGeneratedDocument(button.dataset.document);
});
document.getElementById("tender-response-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-analysis-id]");
  if (!button) return;
  const analysis = state.history.find((item) => item.id === button.dataset.analysisId);
  if (analysis) renderAnalysis(analysis);
});
document.getElementById("refresh-tender-response-history").addEventListener("click", () => {
  loadHistory().catch((error) => setStatus(error.message, true));
});
document.getElementById("tender-response-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
});
loginForm.addEventListener("submit", authenticate);
uploadForm.addEventListener("submit", prepareDossier);

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) loadHistory().catch((error) => setStatus(error.message, true));
