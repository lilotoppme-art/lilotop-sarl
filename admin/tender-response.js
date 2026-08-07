"use strict";

const body = document.body;
const loginScreen = document.getElementById("tender-response-login");
const appShell = document.getElementById("tender-response-shell");
const loginForm = document.getElementById("tender-response-login-form");
const loginStatus = document.getElementById("tender-response-login-status");
const globalStatus = document.getElementById("tender-response-status");
const uploadForm = document.getElementById("tender-response-form");
const state = {
  history: [], selected: null, activeDocument: "submission",
  authenticated: false, busy: false, syncSequence: 0, editing: false
};
let pollingTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function clamp(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function scoreColor(score) {
  return score > 85 ? "green" : score >= 70 ? "orange" : "red";
}

function decisionFor(score) {
  if (score > 85) return "✓ Repondre";
  if (score >= 70) return "⚠ Repondre avec reserves";
  return "✕ Ne pas repondre";
}

function calculateGlobal(criteria) {
  return clamp((criteria || []).reduce((sum, item) => sum + item.score * item.weight / 100, 0));
}

function simulatedEvaluation(evaluation, scenario) {
  const criteria = (evaluation.criteria || []).map((item) => ({ ...item }));
  const byKey = Object.fromEntries(criteria.map((item) => [item.key, item]));
  const price = Math.max(-30, Math.min(30, Number(scenario.priceAdjustment) || 0));
  const supplier = clamp(scenario.supplierReliability);
  const delivery = Math.max(-60, Math.min(60, Number(scenario.deliveryAdjustmentDays) || 0));
  if (byKey.financial) byKey.financial.score = clamp(byKey.financial.score - price * 0.7);
  if (byKey.suppliers) byKey.suppliers.score = supplier;
  if (byKey.logistics) byKey.logistics.score = clamp(byKey.logistics.score - delivery * 0.45);
  if (byKey.competitiveness) {
    byKey.competitiveness.score = clamp(
      byKey.competitiveness.score - price * 0.4
      + (supplier - (evaluation.simulationDefaults?.supplierReliability || 0)) * 0.2
      - delivery * 0.15
    );
  }
  const globalScore = calculateGlobal(criteria);
  const probability = clamp(globalScore * 0.9 - (evaluation.alerts?.length || 0));
  const weakest = [...criteria].sort((left, right) => left.score - right.score).slice(0, 3);
  return {
    criteria,
    globalScore,
    probability,
    color: scoreColor(globalScore),
    decision: {
      label: decisionFor(globalScore),
      justification: `Scenario calcule a ${globalScore}/100. Points a renforcer: ${weakest.map((item) => `${item.label} ${item.score}/100`).join(", ")}.`
    }
  };
}

function drawRadar(criteria) {
  const canvas = document.getElementById("tender-score-radar");
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2 + 4;
  const radius = Math.min(width, height) * 0.35;
  const points = criteria.length;
  context.clearRect(0, 0, width, height);
  if (points < 3) return;

  context.font = "12px Segoe UI, Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let level = 1; level <= 5; level += 1) {
    context.beginPath();
    criteria.forEach((_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / points;
      const distance = radius * level / 5;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.strokeStyle = "#d7dde3";
    context.stroke();
  }
  criteria.forEach((item, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / points;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    context.strokeStyle = "#e1e5e9";
    context.stroke();
    const labelRadius = radius + 37;
    const label = item.label.length > 18 ? `${item.label.slice(0, 17)}…` : item.label;
    context.fillStyle = "#26384b";
    context.fillText(label, centerX + Math.cos(angle) * labelRadius, centerY + Math.sin(angle) * labelRadius);
  });
  context.beginPath();
  criteria.forEach((item, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / points;
    const distance = radius * clamp(item.score) / 100;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = "rgba(184, 145, 55, 0.22)";
  context.strokeStyle = "#8d6b1f";
  context.lineWidth = 2;
  context.fill();
  context.stroke();
}

function renderEvaluation(evaluation) {
  const section = document.getElementById("tender-evaluation");
  if (!evaluation?.criteria?.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const color = evaluation.color || scoreColor(evaluation.globalScore);
  const orb = document.getElementById("global-score-orb");
  orb.classList.remove("green", "orange", "red");
  orb.classList.add(color);
  document.getElementById("global-score").textContent = evaluation.globalScore;
  document.getElementById("win-probability").textContent = `${evaluation.probability}%`;
  document.getElementById("tender-decision").textContent = `${evaluation.decision?.symbol === "check" ? "✓" : evaluation.decision?.symbol === "warning" ? "⚠" : "✕"} ${evaluation.decision?.label || decisionFor(evaluation.globalScore)}`;
  document.getElementById("tender-decision-justification").textContent = evaluation.decision?.justification || "";
  document.getElementById("score-table-rows").innerHTML = evaluation.criteria.map((item) => `
    <tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.weight)}%</td>
    <td><span class="score-value ${scoreColor(item.score)}">${escapeHtml(item.score)}/100</span></td>
    <td>${escapeHtml(item.observation)}</td></tr>
  `).join("");
  renderList("evaluation-alert-list", evaluation.alerts);
  renderList("evaluation-recommendation-list", evaluation.recommendations);
  document.getElementById("simulation-supplier").value = evaluation.simulationDefaults?.supplierReliability ?? 50;
  drawRadar(evaluation.criteria);
  updateSimulation();
}

function updateSimulation() {
  const evaluation = state.selected?.keyInformation?.evaluation;
  if (!evaluation?.criteria?.length) return;
  const simulated = simulatedEvaluation(evaluation, {
    priceAdjustment: document.getElementById("simulation-price").value,
    supplierReliability: document.getElementById("simulation-supplier").value,
    deliveryAdjustmentDays: document.getElementById("simulation-delivery").value
  });
  document.getElementById("simulation-global-score").textContent = `${simulated.globalScore}/100`;
  document.getElementById("simulation-probability").textContent = `${simulated.probability}%`;
  document.getElementById("simulation-decision").textContent = simulated.decision.label;
  document.getElementById("simulation-justification").textContent = simulated.decision.justification;
  if (!document.getElementById("tender-simulation").hidden) drawRadar(simulated.criteria);
}

function setAuthenticated(authenticated) {
  state.authenticated = authenticated;
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  appShell.hidden = !authenticated;
  document.title = `${authenticated ? "Reponse Appels d'Offres AI" : "Connexion"} | LILOTOP SARL`;
}

function setStatus(message = "", type = "") {
  state.busy = type === "syncing";
  globalStatus.textContent = message;
  globalStatus.classList.remove("error", "success", "syncing");
  if (type) globalStatus.classList.add(type);
  body.classList.toggle("is-busy", state.busy);
}

function formatDate(value) {
  if (!value) return "A confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function api(action, options = {}) {
  const method = options.method || "GET";
  const cacheBuster = method === "GET" ? `&_=${Date.now()}` : "";
  const headers = { Accept: "application/json" };
  let bodyContent = options.body;
  if (options.json) {
    headers["Content-Type"] = "application/json";
    bodyContent = JSON.stringify(options.json);
  }
  const response = await fetch(`/api/tender-response-ai?action=${encodeURIComponent(action)}${options.query || ""}${cacheBuster}`, {
    method, cache: "no-store", credentials: "same-origin", headers, body: bodyContent
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Reponse serveur invalide" }));
  if (response.status === 401) {
    location.reload();
    throw new Error("Session expiree");
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible");
  return payload.data;
}

function renderList(id, values, ordered = false) {
  const target = document.getElementById(id);
  target.innerHTML = (values || []).length
    ? values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")
    : "<li>Aucun element identifie.</li>";
  if (ordered) target.setAttribute("aria-label", "Actions recommandees");
}

function documentContent(analysis, key) {
  const documents = analysis.generatedDocuments || {};
  const mapping = {
    submission: ["Lettre de soumission", "submissionLetter", documents.submissionLetter || ""],
    technical: ["Offre technique", "technicalOffer", documents.technicalOffer || ""],
    financial: ["Offre financiere - modele", "financialOfferTemplate", documents.financialOfferTemplate || ""],
    checklist: ["Check-list de conformite", "complianceChecklist", (documents.complianceChecklist || []).map((item) => `- ${item}`).join("\n")],
    conformity: ["Tableau de conformite", "conformityTable", (documents.conformityTable || []).map((item) => `- ${item}`).join("\n")],
    planning: ["Planning d'execution", "executionPlan", (documents.executionPlan || []).map((item) => `- ${item}`).join("\n")],
    attachments: ["Liste des pieces jointes", "attachmentsList", (documents.attachmentsList || []).map((item) => `- ${item}`).join("\n")]
  };
  return mapping[key] || mapping.submission;
}

function setEditing(editing) {
  state.editing = editing;
  const content = document.getElementById("generated-document-content");
  content.contentEditable = String(editing);
  document.getElementById("edit-generated-document").hidden = editing;
  document.getElementById("save-generated-document").hidden = !editing;
  document.getElementById("cancel-generated-document").hidden = !editing;
  if (editing) content.focus();
}

function showGeneratedDocument(key) {
  state.activeDocument = key;
  setEditing(false);
  document.querySelectorAll("[data-document]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.document === key);
  });
  if (!state.selected) return;
  const [title, , content] = documentContent(state.selected, key);
  document.getElementById("generated-document-title").textContent = title;
  document.getElementById("generated-document-content").textContent = content;
}

function progressValues(analysis) {
  const documents = analysis.generatedDocuments || {};
  const validated = analysis.status === "validated";
  return [
    ["Import", 100], ["Analyse", analysis.executiveSummary ? 100 : 0],
    ["Documents", analysis.compliance?.compliancePercent || 0],
    ["Offre technique", documents.technicalOffer ? 100 : 0],
    ["Offre financiere", documents.financialOfferTemplate ? 100 : 0],
    ["Validation DG", validated ? 100 : 60]
  ];
}

function renderProgress(analysis) {
  const values = progressValues(analysis);
  const total = Math.round(values.reduce((sum, [, value]) => sum + value, 0) / values.length);
  document.getElementById("tender-progress-panel").hidden = false;
  document.getElementById("overall-progress").textContent = `${total}%`;
  document.getElementById("tender-progress-list").innerHTML = values.map(([label, value]) => `
    <div class="progress-item">
      <span>${escapeHtml(label)}</span>
      <div class="progress-track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div>
      <strong>${value}%</strong>
    </div>
  `).join("");
}

function renderDocumentControl(rows = []) {
  const labels = { available: "Disponible", expired: "Expire", missing: "Manquant" };
  document.getElementById("document-control-rows").innerHTML = rows.length ? rows.map((row) => {
    const download = row.versionId
      ? `<a href="/api/document-vault?action=file&version=${encodeURIComponent(row.versionId)}">Telecharger</a>`
      : "-";
    const replace = row.documentId
      ? `<a href="/admin/nexus/document-vault?replace=${encodeURIComponent(row.documentId)}">Remplacer</a>`
      : '<a href="/admin/nexus/document-vault">Ajouter</a>';
    return `<tr>
      <td>${escapeHtml(row.document)}</td>
      <td><span class="document-status ${escapeHtml(row.status)}">${escapeHtml(labels[row.status] || row.status)}</span></td>
      <td>${escapeHtml(row.expiration || "Sans echeance")}</td>
      <td>${escapeHtml(row.source || "Non trouve")}</td><td>${download}</td><td>${replace}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="6">Aucun document controle.</td></tr>';
}

function renderHandoffs(handoffs = {}) {
  const labels = { commercial: "Commercial AI", procurement: "Achats AI", businessRadar: "Business Radar", dashboard: "Dashboard DG" };
  document.getElementById("agent-handoff-grid").innerHTML = Object.entries(labels).map(([key, label]) => {
    const handoff = handoffs[key] || { status: "waiting", summary: "En attente" };
    return `<article class="handoff-card"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(handoff.status)}</span><span>${escapeHtml(handoff.summary)}</span></article>`;
  }).join("");
}

function renderAnalysis(analysis, scroll = false) {
  state.selected = analysis;
  const info = analysis.keyInformation || {};
  const compliance = analysis.compliance || {};
  document.getElementById("tender-response-summary").hidden = false;
  document.getElementById("tender-response-result-panel").hidden = false;
  document.getElementById("compliance-score").textContent = `${compliance.compliancePercent || 0}%`;
  document.getElementById("summary-client").textContent = info.client || "A confirmer";
  document.getElementById("summary-deadline").textContent = info.deadline || "A confirmer";
  document.getElementById("summary-status").textContent = info.workflow?.sendAuthorized
    ? "Envoi autorise" : analysis.status === "validated" ? "Valide" : "Brouillon";
  document.getElementById("response-subject").textContent = info.subject || "Dossier prepare";
  document.getElementById("response-executive-summary").textContent = analysis.executiveSummary || "";
  const fields = [
    ["Client", info.client], ["Organisme", info.organization], ["Pays", info.country],
    ["Projet", info.project], ["Numero DAO", info.tenderNumber], ["Publication", info.publicationDate],
    ["Date limite", info.deadline], ["Devise", info.currency], ["Type de marche", info.contractType],
    ["Budget", info.budget]
  ];
  document.getElementById("key-information").innerHTML = fields.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "A confirmer")}</dd></div>`
  ).join("");
  renderList("qualification-criteria", info.qualificationCriteria);
  renderList("requested-products", info.requestedProducts);
  renderList("delivery-conditions", info.deliveryConditions);
  renderList("evaluation-criteria", info.evaluationCriteria);
  renderList("requested-guarantees", info.guarantees);
  renderList("requested-services", info.requestedServices);
  renderList("requested-quantities", info.quantities);
  renderList("technical-standards", info.technicalStandards);
  renderList("requested-incoterms", info.incoterms);
  renderList("payment-terms", info.paymentTerms);
  renderList("available-documents-result", compliance.availableDocuments);
  renderList("missing-documents-result", compliance.missingDocuments);
  renderList("expired-documents-result", compliance.expiredDocuments);
  renderList("response-risks", analysis.risks);
  renderList("response-actions", analysis.recommendedActions, true);
  renderDocumentControl(compliance.documentControl || []);
  renderHandoffs(info.agentHandoffs);
  renderProgress(analysis);
  renderEvaluation(info.evaluation);
  document.getElementById("export-tender-response").href = `/api/tender-response-ai?action=export&id=${encodeURIComponent(analysis.id)}`;
  document.getElementById("export-tender-pdf").href = `/api/tender-response-ai?action=export-pdf&id=${encodeURIComponent(analysis.id)}`;
  showGeneratedDocument(state.activeDocument);
  if (scroll) document.getElementById("tender-response-result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const target = document.getElementById("tender-response-history");
  target.innerHTML = state.history.length ? state.history.map((analysis) => {
    const workflow = analysis.keyInformation?.workflow || {};
    return `<button class="history-entry-button" type="button" data-analysis-id="${escapeHtml(analysis.id)}">
      <span><strong>${escapeHtml(analysis.keyInformation?.subject || analysis.sourceFilename)}</strong>
      <small>${escapeHtml(formatDate(analysis.createdAt))} · ${escapeHtml(analysis.createdBy)} · Version ${escapeHtml(workflow.version || 1)}</small>
      <small>${escapeHtml(workflow.comment || "Analyse enregistree")}</small></span>
      <span class="compliance-chip">${escapeHtml(analysis.compliance?.compliancePercent || 0)}%</span>
    </button>`;
  }).join("") : '<p class="empty-message">Aucun dossier prepare.</p>';
}

async function synchronizeHistory({ selectId = null, silent = false } = {}) {
  const sequence = ++state.syncSequence;
  if (!silent) setStatus("Synchronisation en cours...", "syncing");
  try {
    const history = await api("history");
    if (sequence !== state.syncSequence) return false;
    state.history = history;
    renderHistory();
    const selectedId = selectId || state.selected?.id;
    const selected = history.find((item) => item.id === selectedId) || (!state.selected ? history[0] : null);
    if (selected) renderAnalysis(selected);
    if (!silent) setStatus("Mise a jour reussie.", "success");
    return true;
  } catch (error) {
    if (sequence === state.syncSequence) setStatus(`Erreur de synchronisation : ${error.message}`, "error");
    return false;
  }
}

async function prepareDossier(event) {
  event.preventDefault();
  const file = document.getElementById("tender-response-file").files[0];
  if (!file) return setStatus("Selectionnez un fichier PDF, DOCX ou ZIP.", "error");
  if (file.size > 4 * 1024 * 1024) return setStatus("Le fichier depasse la limite de 4 Mo.", "error");
  setStatus("Import et extraction du DAO en cours...", "syncing");
  try {
    const analysis = await api("prepare", { method: "POST", body: new FormData(uploadForm) });
    renderAnalysis(analysis, true);
    setStatus("Synchronisation du resume, des documents et de l'historique...", "syncing");
    const synchronized = await synchronizeHistory({ selectId: analysis.id, silent: true });
    setStatus(
      synchronized ? "Dossier prepare et synchronise. Validation humaine obligatoire." : "Dossier prepare; la synchronisation peut etre relancee.",
      synchronized ? "success" : "error"
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function saveRevision() {
  if (!state.selected) return;
  const [, documentKey] = documentContent(state.selected, state.activeDocument);
  const content = document.getElementById("generated-document-content").textContent;
  setStatus("Enregistrement de la nouvelle version...", "syncing");
  try {
    const saved = await api("revise", {
      method: "POST",
      json: { id: state.selected.id, documentKey, content, comment: document.getElementById("validation-comment").value }
    });
    renderAnalysis(saved);
    await synchronizeHistory({ selectId: saved.id, silent: true });
    setStatus("Nouvelle version enregistree et historique synchronise.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function applyDecision(decision) {
  if (!state.selected) return;
  setStatus("Enregistrement de la decision...", "syncing");
  try {
    const saved = await api("decision", {
      method: "POST",
      json: { id: state.selected.id, decision, comment: document.getElementById("validation-comment").value }
    });
    renderAnalysis(saved);
    await synchronizeHistory({ selectId: saved.id, silent: true });
    setStatus(decision === "authorize"
      ? "Autorisation journalisee. Aucun e-mail n'a ete envoye."
      : "Decision enregistree et historique synchronise.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function startPolling() {
  clearInterval(pollingTimer);
  pollingTimer = null;
  if (!state.authenticated || document.visibilityState !== "visible") return;
  pollingTimer = setInterval(() => {
    if (!state.busy && document.visibilityState === "visible") synchronizeHistory({ silent: true });
  }, 30000);
}

async function authenticate(event) {
  event.preventDefault();
  loginStatus.textContent = "Connexion en cours...";
  const data = new FormData(loginForm);
  try {
    const response = await fetch("/api/business-radar-auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Connexion impossible");
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    await synchronizeHistory();
    startPolling();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

document.getElementById("tender-response-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  document.getElementById("selected-tender-file").textContent = file
    ? `${file.name} · ${(file.size / 1024).toFixed(0)} Ko` : "Aucun fichier selectionne";
});
document.querySelector(".document-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-document]");
  if (button) showGeneratedDocument(button.dataset.document);
});
document.getElementById("tender-response-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-analysis-id]");
  const analysis = state.history.find((item) => item.id === button?.dataset.analysisId);
  if (analysis) renderAnalysis(analysis, true);
});
document.getElementById("refresh-tender-response-history").addEventListener("click", () => synchronizeHistory());
document.getElementById("preview-tender-response").addEventListener("click", () => {
  showGeneratedDocument(state.activeDocument);
  document.querySelector(".generated-document").scrollIntoView({ behavior: "smooth", block: "center" });
});
document.getElementById("edit-generated-document").addEventListener("click", () => setEditing(true));
document.getElementById("cancel-generated-document").addEventListener("click", () => showGeneratedDocument(state.activeDocument));
document.getElementById("save-generated-document").addEventListener("click", saveRevision);
document.getElementById("validate-tender-response").addEventListener("click", () => applyDecision("validate"));
document.getElementById("return-tender-response").addEventListener("click", () => applyDecision("return"));
document.getElementById("authorize-tender-send").addEventListener("click", () => applyDecision("authorize"));
document.getElementById("open-tender-simulation").addEventListener("click", () => {
  const panel = document.getElementById("tender-simulation");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) updateSimulation();
  else drawRadar(state.selected?.keyInformation?.evaluation?.criteria || []);
});
["simulation-price", "simulation-supplier", "simulation-delivery"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateSimulation);
});
document.getElementById("tender-response-logout").addEventListener("click", async () => {
  clearInterval(pollingTimer);
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    clearInterval(pollingTimer);
    pollingTimer = null;
  } else {
    synchronizeHistory({ silent: true });
    startPolling();
  }
});
loginForm.addEventListener("submit", authenticate);
uploadForm.addEventListener("submit", prepareDossier);

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) synchronizeHistory().finally(startPolling);
