"use strict";

const body = document.body;
const loginScreen = document.getElementById("vault-login");
const shell = document.getElementById("vault-shell");
const loginForm = document.getElementById("vault-login-form");
const loginStatus = document.getElementById("vault-login-status");
const statusBox = document.getElementById("vault-status");
const uploadForm = document.getElementById("vault-upload-form");
const state = { documents: [], selected: null, analysisReady: false, correction: null };

const categoryLabels = {
  "01-legal-identity": "01 — Identité légale",
  "02-compliance": "02 — Conformité",
  "03-bank-finance": "03 — Banque & finance",
  "04-experience-references": "04 — Expériences & références",
  "05-lilotop-organization": "05 — Organisation LILOTOP",
  "06-suppliers-partners": "06 — Fournisseurs / OEM / partenaires",
  "07-other": "07 — Autres documents"
};

const statusLabels = {
  valid: "Valide", needs_review: "À vérifier", expiring: "Expire bientôt",
  expired: "Expiré", incomplete: "Incomplet", archived: "Archivé"
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
    body: options.body,
    headers: options.headers
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

function updateSummary(summary) {
  document.getElementById("vault-total").textContent = summary.total;
  document.getElementById("vault-valid").textContent = summary.valid;
  document.getElementById("vault-review").textContent = summary.needsReview;
  document.getElementById("vault-expiring").textContent = summary.expiring;
  document.getElementById("vault-expired").textContent = summary.expired;
  document.getElementById("vault-experiences").textContent = summary.experiences;
  document.getElementById("vault-tenders").textContent = summary.tendersUsingVault;
}

function confirmation(value) {
  return value ? escapeHtml(value) : "À CONFIRMER";
}

function experienceDetails(item) {
  if (!item.experience) return "";
  const experience = item.experience;
  return `<div class="vault-experience">
    <strong>Expérience extraite — validation DG requise</strong>
    <span>Client : ${confirmation(experience.client_name)}</span>
    <span>Objet : ${confirmation(experience.subject)}</span>
    <span>Contrat / PO : ${confirmation(experience.contract_number)}</span>
    <span>Valeur : ${confirmation(experience.contract_value)} ${confirmation(experience.currency)}</span>
    <span>Statut : ${experience.dg_validated ? "Validée par le DG" : "À confirmer par le DG"}</span>
  </div>`;
}

function renderDocuments() {
  const target = document.getElementById("vault-list");
  target.innerHTML = state.documents.length ? state.documents.map((item) => `
    <article class="vault-document ${item.status === "expired" ? "is-expired" : ""} ${item.usableInTenders ? "is-usable" : "is-unusable"}">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(categoryLabels[item.categoryCode] || item.categoryCode)} · ${escapeHtml(item.sourceFilename)}</p>
        <small>${escapeHtml(item.description || "Aucune description")}</small>
        <div class="vault-proof">
          <span>Disponible : <strong>${item.filePresent ? "OUI" : "NON"}</strong></span>
          <span>Conforme au DAO : <strong>${item.tenderUses?.some((use) => use.compliance === "compliant") ? "OUI" : "À VÉRIFIER"}</strong></span>
          <span>Finalisé pour soumission : <strong>${item.tenderUses?.some((use) => use.finalization === "finalized") ? "OUI" : "NON"}</strong></span>
          <span>Organisation : <strong>${escapeHtml(item.organizationName || "Non associée")}</strong></span>
          <span>Référence : <strong>${confirmation(item.reference)}</strong></span>
          <span>Autorité / client : <strong>${confirmation(item.issuingAuthority)}</strong></span>
          <span>Source : <strong>${confirmation(item.source)}</strong></span>
          <span>Utilisable AO : <strong>${item.usableInTenders ? "Oui" : "Non"}</strong></span>
        </div>
        ${experienceDetails(item)}
      </div>
      <div class="vault-meta"><span>Version</span><strong>${escapeHtml(item.version)}</strong></div>
      <div class="vault-meta"><span>Délivré</span><strong>${escapeHtml(item.issuedOn ? formatDate(item.issuedOn) : "Non renseigné")}</strong></div>
      <div class="vault-meta">
        <span>Statut / expiration</span>
        <strong class="vault-status ${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</strong>
        <small>${escapeHtml(item.expiresOn ? formatDate(item.expiresOn) : "Sans expiration")}</small>
      </div>
      <div class="vault-actions">
        <button type="button" data-preview="${escapeHtml(item.versionId)}">Aperçu</button>
        <button type="button" data-history="${escapeHtml(item.id)}">Historique</button>
        <button type="button" data-correct="${escapeHtml(item.versionId)}">Corriger les métadonnées</button>
        <button type="button" data-replace="${escapeHtml(item.id)}">Remplacer</button>
        ${item.experience ? `<button type="button" data-experience="${escapeHtml(item.id)}">Corriger / valider l'expérience</button>` : ""}
      </div>
    </article>
  `).join("") : '<p class="empty-message">Aucun document enregistré.</p>';
}

async function loadDocuments() {
  const params = new URLSearchParams({
    search: document.getElementById("vault-search").value,
    category: document.getElementById("vault-category-filter").value,
    status: document.getElementById("vault-status-filter").value
  });
  const [documents, summary, unopsAudit] = await Promise.all([
    api("list", { query: `&${params}` }),
    api("dashboard"),
    api("unops-experience-audit")
  ]);
  state.documents = documents;
  renderDocuments();
  updateSummary(summary);
  renderUnopsAudit(unopsAudit);
}

function renderUnopsAudit(audit) {
  const target = document.getElementById("vault-unops-audit");
  const lotSummary = audit.lots.map((lot) => `
    <article><span>Lot ${escapeHtml(lot.lot)} · ${escapeHtml(lot.label)}</span>
      <strong>${escapeHtml(lot.confirmed)}/${escapeHtml(lot.required)}</strong>
      <small>${lot.compliant ? "CONFORME" : "PREUVES MANQUANTES"}</small></article>`).join("");
  const rows = audit.rows.length ? `<div class="vault-audit-table"><table>
    <thead><tr><th>Expérience réelle</th><th>Lot 1</th><th>Lot 2</th><th>Lot 10</th><th>Justification</th></tr></thead>
    <tbody>${audit.rows.map((row) => `<tr><td>${escapeHtml(row.experience)}<small>${escapeHtml(row.sourceFilename)}</small></td>
      <td>${escapeHtml(row.lots[1].status)}</td><td>${escapeHtml(row.lots[2].status)}</td><td>${escapeHtml(row.lots[10].status)}</td>
      <td>${escapeHtml([row.lots[1], row.lots[2], row.lots[10]].map((item) => item.justification).filter((value, index, values) => values.indexOf(value) === index).join(" | "))}</td></tr>`).join("")}</tbody>
  </table></div>` : '<p class="empty-message">Aucun contrat ou PO réel n’est actuellement enregistré dans le Coffre.</p>';
  target.innerHTML = `<div class="vault-audit-lots">${lotSummary}</div>${rows}`;
}

function resetReplacement() {
  uploadForm.reset();
  document.getElementById("vault-document-id").value = "";
  document.getElementById("vault-form-title").textContent = "Ajouter un document";
  document.getElementById("vault-cancel-replacement").hidden = true;
  document.getElementById("vault-selected-file").textContent = "Aucun fichier sélectionné";
  document.getElementById("vault-analysis-notice").hidden = true;
  document.getElementById("vault-experience-import").hidden = true;
  document.getElementById("vault-experience-association").hidden = true;
  document.getElementById("vault-save").disabled = false;
  state.selected = null;
  state.analysisReady = false;
}

function startReplacement(documentId) {
  const item = state.documents.find((document) => document.id === documentId);
  if (!item) return;
  state.selected = item;
  document.getElementById("vault-document-id").value = item.id;
  document.getElementById("vault-title").value = item.title;
  document.getElementById("vault-category").value = item.categoryCode;
  document.getElementById("vault-document-type").value = item.documentType || "";
  document.getElementById("vault-reference").value = item.reference || "";
  document.getElementById("vault-authority").value = item.issuingAuthority || "";
  document.getElementById("vault-source").value = item.source || "Import DG";
  document.getElementById("vault-lifecycle").value = ["expiring", "expired"].includes(item.status)
    ? "needs_review" : item.status;
  document.getElementById("vault-description").value = item.description || "";
  document.getElementById("vault-version").value = "";
  document.getElementById("vault-issued-on").value = item.issuedOn ? String(item.issuedOn).slice(0, 10) : "";
  document.getElementById("vault-expires-on").value = item.expiresOn ? String(item.expiresOn).slice(0, 10) : "";
  document.getElementById("vault-notes").value = "";
  document.getElementById("vault-usable").checked = Boolean(item.usableForTenders);
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
    : ["jpg", "jpeg", "png"].includes(item.extension)
      ? `<img class="vault-image-preview" alt="Aperçu de ${escapeHtml(item.title)}" src="/api/document-vault?action=file&disposition=inline&version=${encodeURIComponent(versionId)}">`
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

function editExperience(documentId) {
  const item = state.documents.find((document) => document.id === documentId);
  if (!item?.experience) return;
  const value = item.experience;
  document.getElementById("vault-experience-title").textContent = `Expérience · ${item.title}`;
  document.getElementById("experience-document-id").value = item.id;
  document.getElementById("experience-client").value = value.client_name || "";
  document.getElementById("experience-subject").value = value.subject || "";
  document.getElementById("experience-sector").value = value.sector || "";
  document.getElementById("experience-products").value = value.products_services || "";
  document.getElementById("experience-contract-number").value = value.contract_number || "";
  document.getElementById("experience-date").value = value.contract_date ? String(value.contract_date).slice(0, 10) : "";
  document.getElementById("experience-period").value = value.execution_period || "";
  document.getElementById("experience-value").value = value.contract_value || "";
  document.getElementById("experience-currency").value = value.currency || "";
  document.getElementById("experience-country").value = value.country || "";
  document.getElementById("experience-status").value = value.execution_status || "";
  document.getElementById("experience-contact").value = value.client_contact || "";
  document.getElementById("experience-delivery-proof").checked = Boolean(value.delivery_proof_available);
  document.getElementById("experience-performance-proof").checked = Boolean(value.performance_certificate_available);
  document.getElementById("experience-dg-validated").checked = Boolean(value.dg_validated);
  document.getElementById("vault-experience-dialog").showModal();
}

function comparisonValue(value) {
  return value ? String(value) : "À confirmer";
}

function renderCorrectionComparison(current, proposed) {
  const currentExperience = current.experience || {};
  const proposedExperience = proposed.experience || {};
  const rows = [
    ["Catégorie", categoryLabels[current.categoryCode] || current.categoryCode, categoryLabels[proposed.categoryCode] || proposed.categoryCode],
    ["Type documentaire", current.documentType, proposed.documentType],
    ["Client / autorité", current.issuingAuthority, proposed.issuingAuthority],
    ["Référence PO / contrat", current.reference, proposed.reference],
    ["Date de livraison", current.issuedOn ? String(current.issuedOn).slice(0, 10) : "", proposed.issuedOn],
    ["Produits livrés", currentExperience.products_services, proposedExperience.productsServices],
    ["Quantités livrées", current.extractedMetadata?.experience?.quantities, proposedExperience.quantities],
    ["Expérience associée proposée", "Aucune association validée", proposed.experienceAssociation?.reference || "Aucune"]
  ];
  document.getElementById("vault-correction-comparison").innerHTML = `<table>
    <thead><tr><th>Métadonnée</th><th>Ancienne valeur</th><th>Nouvelle valeur proposée</th></tr></thead>
    <tbody>${rows.map(([label, oldValue, newValue]) => `<tr>
      <th>${escapeHtml(label)}</th><td>${escapeHtml(comparisonValue(oldValue))}</td>
      <td>${escapeHtml(comparisonValue(newValue))}</td></tr>`).join("")}</tbody></table>`;
}

async function showMetadataCorrection(versionId) {
  setStatus("Nouvelle analyse du document original en cours…");
  try {
    const result = await api("reanalyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId })
    });
    state.correction = { versionId, ...result };
    renderCorrectionComparison(result.current, result.proposed);
    const associationRow = document.getElementById("vault-association-confirm-row");
    associationRow.hidden = !result.proposed.experienceAssociation;
    document.getElementById("vault-association-confirm").checked = false;
    document.getElementById("vault-correction-confirm").checked = false;
    document.getElementById("vault-correction-dialog").showModal();
    setStatus("Correction proposée — validation DG requise avant toute modification.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
  }
}

async function applyMetadataCorrection(event) {
  event.preventDefault();
  if (!state.correction || !document.getElementById("vault-correction-confirm").checked) return;
  const { current, proposed, versionId } = state.correction;
  const experience = proposed.experience || {};
  setStatus("Application de la correction validée par le DG…");
  try {
    await api("correct-metadata", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: current.id, versionId,
        proposed: {
          categoryCode: proposed.categoryCode, documentType: proposed.documentType,
          reference: proposed.reference, issuingAuthority: proposed.issuingAuthority,
          issuedOn: proposed.issuedOn, description: proposed.description,
          extractedMetadata: proposed,
          experience: {
            clientName: experience.client, subject: experience.subject,
            sector: experience.sector, productsServices: experience.productsServices,
            contractNumber: experience.contractNumber, contractDate: experience.date,
            executionPeriod: experience.executionPeriod, contractValue: experience.value,
            currency: experience.currency, country: experience.country,
            executionStatus: experience.executionStatus, clientContact: experience.clientContact,
            deliveryProofAvailable: experience.deliveryProofAvailable,
            performanceCertificateAvailable: Boolean(current.experience?.performance_certificate_available)
          },
          confirmAssociation: document.getElementById("vault-association-confirm").checked,
          associationDocumentId: proposed.experienceAssociation?.documentId || ""
        }
      })
    });
    document.getElementById("vault-correction-dialog").close();
    state.correction = null;
    await loadDocuments();
    setStatus("Métadonnées corrigées. Le fichier original et son historique sont conservés.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
  }
}

async function saveExperience(event) {
  event.preventDefault();
  const field = (id) => document.getElementById(id).value;
  setStatus("Enregistrement de la validation de l'expérience…");
  try {
    await api("validate-experience", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: field("experience-document-id"), clientName: field("experience-client"),
        subject: field("experience-subject"), sector: field("experience-sector"),
        productsServices: field("experience-products"), contractNumber: field("experience-contract-number"),
        contractDate: field("experience-date"), executionPeriod: field("experience-period"),
        contractValue: field("experience-value"), currency: field("experience-currency"),
        country: field("experience-country"), executionStatus: field("experience-status"),
        clientContact: field("experience-contact"),
        deliveryProofAvailable: document.getElementById("experience-delivery-proof").checked,
        performanceCertificateAvailable: document.getElementById("experience-performance-proof").checked,
        dgValidated: document.getElementById("experience-dg-validated").checked
      })
    });
    document.getElementById("vault-experience-dialog").close();
    await loadDocuments();
    setStatus("Expérience mise à jour. Le fichier original n'a pas été modifié.");
    body.classList.remove("is-busy");
  } catch (error) {
    body.classList.remove("is-busy");
    setStatus(error.message, true);
  }
}

async function uploadDocument(event) {
  event.preventDefault();
  const file = document.getElementById("vault-file").files[0];
  if (!file) return setStatus("Sélectionnez un fichier.", true);
  if (file.size > 3 * 1024 * 1024) return setStatus("Le fichier dépasse la limite de 3 Mo.", true);
  if (!state.analysisReady) return setStatus("L'analyse préalable du document doit réussir avant l'enregistrement.", true);
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

function fillDetected(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.value = value;
}

function applyImportAnalysis(analysis) {
  fillDetected("vault-title", analysis.title);
  fillDetected("vault-category", analysis.categoryCode);
  fillDetected("vault-document-type", analysis.documentType);
  fillDetected("vault-reference", analysis.reference);
  fillDetected("vault-authority", analysis.issuingAuthority);
  fillDetected("vault-version", analysis.version);
  fillDetected("vault-issued-on", analysis.issuedOn);
  fillDetected("vault-expires-on", analysis.expiresOn);
  fillDetected("vault-description", analysis.description);
  fillDetected("vault-notes", analysis.notes);
  const experience = analysis.experience;
  document.getElementById("vault-experience-import").hidden = !experience;
  const association = analysis.experienceAssociation;
  const associationNotice = document.getElementById("vault-experience-association");
  associationNotice.hidden = !association;
  associationNotice.textContent = association
    ? `Expérience associée proposée : ${association.reference} · Confiance : ${association.confidence} · Validation DG obligatoire`
    : "";
  if (experience) {
    fillDetected("vault-experience-client", experience.client);
    fillDetected("vault-experience-subject", experience.subject);
    fillDetected("vault-experience-products", experience.productsServices);
    fillDetected("vault-experience-quantities", experience.quantities);
    fillDetected("vault-experience-value", experience.value);
    fillDetected("vault-experience-currency", experience.currency);
    fillDetected("vault-experience-country", experience.country);
    fillDetected("vault-experience-delivery-place", experience.deliveryPlace);
    fillDetected("vault-experience-incoterm", experience.incoterm);
    fillDetected("vault-experience-lead-time", experience.leadTime);
    fillDetected("vault-experience-client-reference", experience.clientReference);
    fillDetected("vault-experience-group-reference", experience.groupReference);
  }
  document.getElementById("vault-analysis-notice").hidden = false;
}

async function analyzeSelectedFile(file) {
  state.analysisReady = false;
  document.getElementById("vault-save").disabled = true;
  document.getElementById("vault-analysis-notice").hidden = true;
  setStatus("Analyse automatique du document en cours…");
  const data = new FormData();
  data.append("vaultFile", file);
  try {
    const analysis = await api("analyze", { method: "POST", body: data });
    applyImportAnalysis(analysis);
    state.analysisReady = true;
    setStatus("Informations détectées automatiquement — veuillez vérifier avant enregistrement.");
    body.classList.remove("is-busy");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    document.getElementById("vault-save").disabled = !state.analysisReady;
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
  if (file) analyzeSelectedFile(file);
  else state.analysisReady = false;
});
document.getElementById("vault-list").addEventListener("click", (event) => {
  const preview = event.target.closest("[data-preview]");
  const history = event.target.closest("[data-history]");
  const replace = event.target.closest("[data-replace]");
  const correct = event.target.closest("[data-correct]");
  const experience = event.target.closest("[data-experience]");
  if (preview) showPreview(preview.dataset.preview).catch((error) => setStatus(error.message, true));
  if (history) showHistory(history.dataset.history).catch((error) => setStatus(error.message, true));
  if (replace) startReplacement(replace.dataset.replace);
  if (correct) showMetadataCorrection(correct.dataset.correct).catch((error) => setStatus(error.message, true));
  if (experience) editExperience(experience.dataset.experience);
});
document.getElementById("vault-cancel-replacement").addEventListener("click", resetReplacement);
document.getElementById("vault-preview-close").addEventListener("click", () => document.getElementById("vault-preview-dialog").close());
document.getElementById("vault-history-close").addEventListener("click", () => document.getElementById("vault-history-dialog").close());
document.getElementById("vault-correction-close").addEventListener("click", () => document.getElementById("vault-correction-dialog").close());
document.getElementById("vault-correction-form").addEventListener("submit", applyMetadataCorrection);
document.getElementById("vault-experience-close").addEventListener("click", () => document.getElementById("vault-experience-dialog").close());
document.getElementById("vault-experience-form").addEventListener("submit", saveExperience);
document.getElementById("vault-logout").addEventListener("click", async () => {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
});
loginForm.addEventListener("submit", authenticate);
uploadForm.addEventListener("submit", uploadDocument);

const initiallyAuthenticated = body.dataset.authenticated === "true";
setAuthenticated(initiallyAuthenticated);
if (initiallyAuthenticated) {
  const params = new URLSearchParams(location.search);
  if (params.get("category")) document.getElementById("vault-category-filter").value = params.get("category");
  if (params.get("status")) document.getElementById("vault-status-filter").value = params.get("status");
  loadDocuments().catch((error) => setStatus(error.message, true));
}
