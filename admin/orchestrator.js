"use strict";

const body = document.body;
const loginScreen = document.getElementById("orchestrator-login");
const shell = document.getElementById("orchestrator-shell");
const loginForm = document.getElementById("orchestrator-login-form");
const loginStatus = document.getElementById("orchestrator-login-status");
const statusRegion = document.getElementById("orchestrator-status");
const workflowForm = document.getElementById("workflow-form");
const opportunitySelect = document.getElementById("opportunity-select");
const opportunitySummary = document.getElementById("opportunity-summary");

let state = {
  opportunities: [],
  workflows: [],
  actions: [],
  agents: [],
  dashboard: {}
};
let runningWorkflowId = null;
let pendingRfqAuthorization = null;
let gmailSyncTimer = null;

function reportClientFailure(message) {
  const safeMessage = String(message || "Erreur d'affichage inconnue").slice(0, 500);
  statusRegion.textContent = `L'interface n'a pas pu terminer son chargement : ${safeMessage}`;
  statusRegion.classList.add("has-error");
  if (body.dataset.authenticated === "true") {
    loginScreen.hidden = true;
    shell.hidden = false;
  }
}

window.addEventListener("error", (event) => {
  reportClientFailure(event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  reportClientFailure(event.reason?.message || event.reason);
});

const STEP_LABELS = {
  analyze: "Analyse OpenAI",
  "source-suppliers": "Recherche fournisseurs",
  "prepare-rfqs": "Préparation RFQ",
  finalize: "Constitution du dossier",
  completed: "Terminé"
};

const PIPELINE_LABELS = {
  detected: "Détecté",
  analyzed: "Analysé",
  "suppliers-researched": "Fournisseurs recherchés",
  "rfqs-prepared": "RFQ préparées",
  "rfqs-sent": "RFQ envoyées",
  "offer-prepared": "Offre préparée",
  "validation-required": "Validation requise",
  "ready-for-express-interest": "Pret pour Express Interest",
  "eoi-submitted-waiting-itb": "EOI soumise - En attente ITB",
  "ready-to-send": "Envoi autorisé",
  submitted: "Soumis",
  pending: "En attente",
  won: "Gagné",
  lost: "Perdu",
  "purchase-order-received": "Bon de commande reçu",
  rejected: "Hors cible"
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
  shell.hidden = !authenticated;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Action impossible.");
  }
  return payload.data;
}

async function syncGmailInbound({ silent = false } = {}) {
  if (document.hidden || body.dataset.authenticated !== "true") return null;
  try {
    const result = await api("/api/nexus-gmail?action=sync", { method: "POST" });
    const status = document.getElementById("gmail-response-status");
    const detail = document.getElementById("gmail-response-detail");
    if (status) status.textContent = "GMAIL CONNECTE - SUIVI ACTIF";
    if (detail) detail.textContent = `${result.checked} message(s) controle(s), ${result.matched} reponse(s) rattachee(s). Derniere synchronisation : ${new Date(result.lastSyncAt).toLocaleString("fr-FR")}.`;
    if (!silent) statusRegion.textContent = "Suivi Gmail synchronise. Aucun e-mail envoye.";
    return result;
  } catch (error) {
    const detail = document.getElementById("gmail-response-detail");
    if (detail) detail.textContent = `Synchronisation Gmail indisponible : ${error.message}`;
    if (!silent) statusRegion.textContent = error.message;
    return null;
  }
}

function startGmailPolling() {
  if (gmailSyncTimer) clearInterval(gmailSyncTimer);
  gmailSyncTimer = setInterval(() => syncGmailInbound({ silent: true }), 30000);
}

function formatDuration(seconds) {
  if (!seconds) return "0 min";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

function formatValue(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function renderDashboard() {
  const dashboard = state.dashboard || {};
  document.getElementById("stat-active").textContent = dashboard.activeWorkflows || 0;
  document.getElementById("stat-opportunities").textContent = dashboard.opportunitiesInProgress || 0;
  document.getElementById("stat-agents").textContent = dashboard.activeAgents || 7;
  document.getElementById("stat-average").textContent = formatDuration(dashboard.averageSeconds);
  document.getElementById("stat-value").textContent = formatValue(dashboard.potentialValue);
  document.getElementById("stat-alerts").textContent = dashboard.criticalAlerts || 0;
  document.getElementById("stat-supplier-replies").textContent = dashboard.emailTracking?.matched || 0;
}

function renderOpportunities() {
  opportunitySelect.innerHTML = `
    <option value="">Sélectionner une opportunité</option>
    ${state.opportunities.map((item) => `
      <option value="${escapeHtml(item.id)}">
        ${escapeHtml(item.title)} · ${escapeHtml(item.organization || "Organisation non renseignée")}
      </option>
    `).join("")}
  `;
}

function renderAgents() {
  document.getElementById("agent-grid").innerHTML = state.agents.map((agent) => `
    <article class="agent-card">
      <span class="status-dot">● SUPERVISÉ</span>
      <h3>${escapeHtml(agent.name)}</h3>
      <p>${escapeHtml(agent.role)}</p>
    </article>
  `).join("");
}

function renderWorkflows() {
  const target = document.getElementById("workflow-list");
  if (!state.workflows.length) {
    target.innerHTML = '<p class="empty-message">Aucun workflow enregistré.</p>';
    return;
  }
  target.innerHTML = state.workflows.map((workflow) => {
    const resumable = workflow.status !== "completed";
    const busy = runningWorkflowId === workflow.id;
    return `
      <article class="workflow-item">
        <div>
          <span class="status status-${escapeHtml(workflow.status)}">${escapeHtml(PIPELINE_LABELS[workflow.dossier?.pipelineStatus] || workflow.status)}</span>
          <h3>${escapeHtml(workflow.title)}</h3>
          <p>${escapeHtml(STEP_LABELS[workflow.currentStep] || workflow.currentStep)} · ${escapeHtml(workflow.createdBy)}</p>
          ${workflow.lastError ? `<p class="form-status">${escapeHtml(workflow.lastError)}</p>` : ""}
        </div>
        <div class="workflow-actions">
          <button class="button button-secondary" type="button" data-view-workflow="${escapeHtml(workflow.id)}">Voir dossier</button>
          ${resumable ? `<button class="button button-primary" type="button" data-resume-workflow="${escapeHtml(workflow.id)}" ${busy ? "disabled" : ""}>Reprendre Workflow</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderActions(actions = state.actions) {
  const target = document.getElementById("activity-log");
  if (!actions.length) {
    target.innerHTML = '<p class="empty-message">Aucune action enregistrée.</p>';
    return;
  }
  target.innerHTML = actions.map((action) => `
    <article class="activity-item">
      <strong>${escapeHtml(action.agentKey)}</strong>
      <div>
        <span class="status status-${escapeHtml(action.status)}">${escapeHtml(action.status)}</span>
        <p>${escapeHtml(action.label)} · ${escapeHtml(action.actorEmail)}</p>
      </div>
      <time class="activity-time">${escapeHtml(new Date(action.startedAt).toLocaleString("fr-FR"))}</time>
    </article>
  `).join("");
}

function listMarkup(items, emptyText) {
  if (!items?.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(
    typeof item === "string" ? item : item.name || item.title || item.label || ""
  )}</li>`).join("")}</ul>`;
}

function hiltiPilotMarkup(pilot) {
  if (!pilot) return "";
  return `<section id="hilti-pilot-rfq" class="hilti-pilot-card">
    <div class="section-heading-inline"><div><p class="section-kicker">Premier envoi reel - controle prealable</p><h3>RFQ PILOTE : HILTI</h3></div><span class="status status-paused">AUCUN ENVOI EFFECTUE</span></div>
    <div class="rfq-meta-grid">
      <p><span>Lignes</span><strong>${escapeHtml(pilot.lineCount)}</strong></p>
      <p><span>E-mail verifie</span><strong>${pilot.contact?.verified ? "OUI" : "NON"}</strong></p>
      <p><span>Canal</span><strong>${escapeHtml(pilot.contact?.channel)}</strong></p>
      <p><span>Date verification</span><strong>${escapeHtml(new Date(pilot.contact?.verifiedAt).toLocaleDateString("fr-FR"))}</strong></p>
      <p><span>Date fournisseur</span><strong>${escapeHtml(pilot.supplierDeadlineLabel)}</strong></p>
      <p><span>Date UNOPS enregistree</span><strong>${escapeHtml(pilot.officialBidDeadlineLabel)}</strong></p>
      <p><span>Envoi technique</span><strong>${pilot.dryRun?.senderConfigured ? "CONFIGURE" : "A CONFIGURER"}</strong></p>
      <p><span>Suivi automatique reponses</span><strong>${pilot.responseTracking?.operational ? "OPERATIONNEL" : "NON OPERATIONNEL"}</strong></p>
    </div>
    <p><strong>E-mail :</strong> ${escapeHtml(pilot.contact?.email)}</p>
    <p><a href="${escapeHtml(pilot.contact?.source)}" target="_blank" rel="noopener noreferrer">Source officielle Hilti utilisee pour la verification</a></p>
    <p class="supplier-warning"><strong>Controle de date :</strong> ${escapeHtml(pilot.deadlineAssessment)}</p>
    <div class="responsive-table"><table class="hilti-audit-table"><thead><tr><th>Ligne</th><th>Produit</th><th>Quantite</th><th>Unite</th><th>Conformite extraction DAO</th><th>Couverture Hilti</th><th>Statut</th></tr></thead><tbody>
      ${(pilot.lines || []).map((item) => `<tr><td>${escapeHtml(item.itemNumber)}</td><td>${escapeHtml(item.product)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(item.extractionCompliance)}</td><td>${escapeHtml(item.coverage)}</td><td>${escapeHtml(item.status)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="pilot-control-grid">
      <article><h4>Piece jointe limitee aux 6 lignes</h4>${(pilot.attachments || []).map((item) => `<p><a class="button button-secondary button-inline" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">OUVRIR ${escapeHtml(item.name)}</a></p>`).join("")}</article>
      <article><h4>Test technique sans envoi</h4><p>Expediteur : ${escapeHtml(pilot.dryRun?.sender)}</p><p>Journalisation : ${pilot.dryRun?.deliveryLoggingReady ? "OK" : "NON"}</p><p>Message-ID : ${pilot.dryRun?.messageIdCaptureReady ? "CAPTURE PREVUE" : "NON"}</p><p>Erreurs API : ${pilot.dryRun?.apiErrorHandlingReady ? "GEREES" : "NON"}</p></article>
      <article><h4>Reponses fournisseurs</h4><p><strong id="gmail-response-status">${escapeHtml(pilot.responseTracking?.authorizationStatus || "NON CONFIGURE")}</strong></p><p id="gmail-response-detail">${pilot.responseTracking?.operational ? "Detection automatique configuree." : escapeHtml(pilot.responseTracking?.blocker)}</p>${pilot.responseTracking?.oauthConfigured ? '<p><a class="button button-secondary button-inline" href="/api/nexus-gmail?action=authorize">AUTORISER GMAIL (DG)</a></p>' : ""}<p>Saisie avec message/document source : ${pilot.responseTracking?.manualEvidenceIntakeReady ? "DISPONIBLE" : "NON"}</p></article>
    </div>
    <h4>Objet</h4><p>${escapeHtml(pilot.subject)}</p>
    <h4>Corps exact prepare</h4><pre class="rfq-email-preview">${escapeHtml(pilot.emailBody)}</pre>
  </section>`;
}

function supplierCycleMarkup(cycle, workflow) {
  const reference = workflow.dossier?.analysis?.tenderNumber
    || workflow.dossier?.tenderResponse?.keyInformation?.tenderNumber
    || workflow.dossier?.opportunity?.reference
    || "";
  if (!cycle) {
    return /ITB\/2026\/62389/i.test(String(reference)) ? `<article id="supplier-rfq-cycle" class="validation-rfqs supplier-cycle">
      <div class="section-heading-inline"><div><p class="section-kicker">Cycle fournisseurs</p><h3>RFQ FOURNISSEURS</h3></div><span class="status status-paused">A PREPARER</span></div>
      <p>La preparation reste interne et ne declenche aucun envoi.</p>
      <button class="button button-primary" type="button" data-prepare-unops-cycle>PREPARER LES RFQ PAR LOT</button>
    </article>` : "";
  }
  const money = (value, currency) => value === null || value === undefined
    ? "EN ATTENTE"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${currency || ""}`.trim();
  return `<article id="supplier-rfq-cycle" class="validation-rfqs supplier-cycle">
    <div class="section-heading-inline"><div><p class="section-kicker">Cycle fournisseurs UNOPS</p><h3>RFQ FOURNISSEURS</h3></div><div class="rfq-card-actions"><button class="button button-secondary" type="button" data-prepare-unops-cycle>REVALIDER LES RFQ</button><span class="status status-paused">${escapeHtml(cycle.status)}</span></div></div>
    <div class="supplier-cycle-stats">
      <div><span>Lots retenus</span><strong>${escapeHtml(cycle.counts.lots)}</strong></div>
      <div><span>Lignes DAO</span><strong>${escapeHtml(cycle.counts.products)}</strong></div>
      <div><span>RFQ preparees</span><strong>${escapeHtml(cycle.counts.prepared)}</strong></div>
      <div><span>Pretes pour controle DG</span><strong>${escapeHtml(cycle.counts.readyForDgReview || 0)}</strong></div>
      <div><span>Priorite A</span><strong>${escapeHtml(cycle.counts.priorityA || 0)}</strong></div>
      <div><span>Priorite B</span><strong>${escapeHtml(cycle.counts.priorityB || 0)}</strong></div>
      <div><span>Priorite C</span><strong>${escapeHtml(cycle.counts.priorityC || 0)}</strong></div>
      <div><span>Envoi recommande</span><strong>${escapeHtml(cycle.counts.recommended || 0)}</strong></div>
      <div><span>RFQ envoyees</span><strong>${escapeHtml(cycle.counts.sent)}</strong></div>
      <div><span>Reponses recues</span><strong>${escapeHtml(cycle.counts.received)}</strong></div>
      <div><span>Cotations manquantes</span><strong>${escapeHtml(cycle.counts.missing)}</strong></div>
    </div>
    ${hiltiPilotMarkup(cycle.pilot)}
    ${(cycle.supplierCorrections || []).map((item) => `<p class="supplier-warning"><strong>${escapeHtml(item.supplier)} : ${escapeHtml(item.status)}</strong> - ${escapeHtml(item.reason)}</p>`).join("")}
    <div class="responsive-table"><table class="rfq-review-table"><thead><tr><th>Fournisseur</th><th>Lot</th><th>Lignes</th><th>Confirmee</th><th>Probable</th><th>Rejetee</th><th>Contact direct</th><th>RFQ PDF</th><th>Priorite</th><th>Recommandation</th><th>Date reponse</th><th>Statut envoi</th><th>Action</th></tr></thead><tbody>
      ${(cycle.rfqs || []).map((rfq) => `<tr><td>${escapeHtml(rfq.supplier)}</td><td>${escapeHtml(rfq.lotNumber)}</td><td>${escapeHtml((rfq.products || []).length)}</td><td>${escapeHtml(rfq.coverageCounts?.confirmed || 0)}</td><td>${escapeHtml(rfq.coverageCounts?.probable || 0)}</td><td>${escapeHtml(rfq.coverageCounts?.rejected || 0)}</td><td>${rfq.directEmailVerified ? "OUI" : "NON"}</td><td>${rfq.rfqPdfReady ? "OUI" : "NON"}</td><td>${escapeHtml(rfq.priority || "C")}</td><td>${escapeHtml(rfq.sendRecommendation || "NON")}</td><td>${escapeHtml(rfq.responseDeadlineLabel || rfq.responseDeadline || "A FIXER")}</td><td>${escapeHtml(rfq.sentAt ? "ENVOYEE - SUIVI ACTIF" : "NON AUTORISE")}</td><td><div class="rfq-card-actions"><button class="button button-secondary" type="button" data-toggle-rfq="${escapeHtml(rfq.id)}">VOIR RFQ</button><button class="button button-secondary" type="button" data-edit-rfq="${escapeHtml(rfq.id)}">MODIFIER</button>${rfq.readyForDgReview && !rfq.sentAt ? `<button class="button button-primary" type="button" data-request-rfq-authorization="${escapeHtml(rfq.id)}" data-rfq-pilot="${rfq.id === "UNOPS-62389-L1-HILTI" ? "true" : "false"}" data-rfq-supplier="${escapeHtml(rfq.supplier)}" data-rfq-recipient="${escapeHtml(rfq.contact.email || rfq.contact.contactForm)}" data-rfq-lot="${escapeHtml(rfq.lotNumber)}" data-rfq-lines="${escapeHtml((rfq.products || []).length)}" data-rfq-attachments="${escapeHtml((rfq.attachments || []).join(", "))}" data-rfq-deadline="${escapeHtml(rfq.responseDeadlineLabel || rfq.responseDeadline)}">AUTORISER</button>` : rfq.sentAt ? "SUIVI UNIQUEMENT" : ""}</div></td></tr>`).join("")}
    </tbody></table></div>
    ${(cycle.rfqs || []).map((rfq) => `<section class="supplier-rfq-card" data-rfq-card="${escapeHtml(rfq.id)}">
      <div class="section-heading-inline"><div><h4>${escapeHtml(rfq.supplier)} - Lot ${escapeHtml(rfq.lotNumber)}</h4><p>${escapeHtml(rfq.lotTitle)}</p></div><span class="status status-paused">${escapeHtml(rfq.status)}</span></div>
      <div class="rfq-meta-grid">
        <p><span>Destinataire</span><strong>${escapeHtml(rfq.contact.recipient)}</strong></p>
        <p><span>Coordonnees verifiees</span><strong>${escapeHtml(rfq.contact.email || rfq.contact.contactForm || "A VERIFIER")}</strong></p>
        <p><span>Telephone</span><strong>${escapeHtml(rfq.contact.phone || "Non publie")}</strong></p>
        <p><span>Nombre de lignes</span><strong>${escapeHtml((rfq.products || []).length)}</strong></p>
        <p><span>Couverture</span><strong>${escapeHtml(rfq.coverageStatus)}</strong></p>
        <p><span>Priorite</span><strong>${escapeHtml(rfq.priority || "C")}</strong></p>
        <p><span>Recommandation d'envoi</span><strong>${escapeHtml(rfq.sendRecommendation || "NON")}</strong></p>
        <p><span>Motif</span><strong>${escapeHtml(rfq.prioritizationReason || "Controle DG requis")}</strong></p>
        <p><span>Date de preparation</span><strong>${escapeHtml(new Date(rfq.preparedAt).toLocaleString("fr-FR"))}</strong></p>
        <p><span>Date limite de reponse</span><strong>${escapeHtml(rfq.responseDeadlineLabel || rfq.responseDeadline || "A FIXER PAR LE DG")}</strong></p>
        ${rfq.sentAt ? `<p><span>Date d'envoi</span><strong>${escapeHtml(new Date(rfq.sentAt).toLocaleString("fr-FR"))}</strong></p>` : ""}
        ${rfq.gmailMessageId ? `<p><span>Gmail ID</span><strong>${escapeHtml(rfq.gmailMessageId)}</strong></p>` : ""}
        ${rfq.messageIdHeader ? `<p><span>Gmail Message-ID</span><strong>${escapeHtml(rfq.messageIdHeader)}</strong></p>` : ""}
      </div>
      <p><a href="${escapeHtml(rfq.contact.source)}" target="_blank" rel="noopener noreferrer">Source officielle des coordonnees</a></p>
      <p><a href="${escapeHtml(rfq.contact.catalogSource || rfq.contact.website)}" target="_blank" rel="noopener noreferrer">Source officielle de couverture produit</a></p>
      <div class="rfq-card-actions">
        <button class="button button-secondary" type="button" data-toggle-rfq="${escapeHtml(rfq.id)}">VOIR RFQ</button>
        ${rfq.authorizedAt && !rfq.sentAt ? `<button class="button button-primary" type="button" data-send-authorized-rfq="${escapeHtml(rfq.id)}">ENVOYER LA RFQ AUTORISEE</button>` : rfq.sentAt ? "" : `<button class="button button-primary" type="button"
          data-request-rfq-authorization="${escapeHtml(rfq.id)}"
          data-rfq-supplier="${escapeHtml(rfq.supplier)}"
          data-rfq-recipient="${escapeHtml(rfq.contact.email || rfq.contact.contactForm)}"
          data-rfq-lot="${escapeHtml(rfq.lotNumber)}"
          data-rfq-lines="${escapeHtml((rfq.products || []).length)}"
          data-rfq-attachments="${escapeHtml((rfq.attachments || []).join(", "))}"
          data-rfq-deadline="${escapeHtml(rfq.responseDeadline)}"
          data-rfq-pilot="${rfq.id === "UNOPS-62389-L1-HILTI" ? "true" : "false"}"
          ${rfq.readyForDgReview ? "" : "disabled"}>${rfq.id === "UNOPS-62389-L1-HILTI" ? "AUTORISER L'ENVOI PILOTE" : "AUTORISER L'ENVOI"}</button>`}
      </div>
      <div id="${escapeHtml(rfq.id)}" class="rfq-detail" hidden>
        <p><strong>Objet :</strong> ${escapeHtml(rfq.subject)}</p>
        <p><strong>Livraison :</strong> ${escapeHtml(rfq.delivery)} - ${escapeHtml(rfq.incoterm)}</p>
        <p><strong>Destination :</strong> ${escapeHtml(rfq.destination)}</p>
        <p><strong>Pieces jointes prevues :</strong> ${escapeHtml((rfq.attachments || []).join(", "))}</p>
        <div class="responsive-table"><table><thead><tr><th>Lot / ligne</th><th>Designation exacte</th><th>Specification</th><th>Quantite</th><th>Unite</th><th>Fournisseur propose</th><th>Justification</th><th>Statut de verification</th><th>COMPLY: YES / NO / ALTERNATIVE</th><th>MANUFACTURER / MODEL / PART NUMBER</th></tr></thead><tbody>
          ${(rfq.products || []).map((item) => `<tr><td>${escapeHtml(item.reference)}</td><td>${escapeHtml(item.product)}</td><td><pre>${escapeHtml(item.specifications)}</pre></td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(item.proposedSupplier)}</td><td>${escapeHtml(item.supplierJustification)}</td><td><strong>${escapeHtml(item.verificationStatus)}</strong></td><td>A COMPLETER PAR LE FOURNISSEUR</td><td>A COMPLETER PAR LE FOURNISSEUR</td></tr>`).join("")}
        </tbody></table></div>
        <h5>Texte exact de l'e-mail RFQ</h5>
        <pre class="rfq-email-preview">${escapeHtml(rfq.emailBody)}</pre>
      </div>
    </section>`).join("")}
  </article>
  <article class="validation-rfqs supplier-cycle"><h3>REPONSES FOURNISSEURS / COTATIONS RECUES</h3>
    ${(cycle.responses || []).length ? `<div class="responsive-table"><table><thead><tr><th>Fournisseur</th><th>RFQ</th><th>Lot</th><th>Date d'envoi</th><th>Date de reponse</th><th>Statut</th><th>Pieces jointes</th><th>Prix extraits</th><th>Conformite</th><th>Action DG</th></tr></thead><tbody>${cycle.responses.map((quote) => `<tr><td>${escapeHtml(quote.supplier)}</td><td>${escapeHtml(quote.rfqId)}</td><td>${escapeHtml(quote.lotNumber)}</td><td>${escapeHtml(quote.sentAt || "NON ENVOYEE")}</td><td>${escapeHtml(quote.receivedAt)}</td><td>${escapeHtml(quote.status || "COTATION EXTRAITE")}</td><td>${escapeHtml(quote.attachmentCount || 0)}</td><td>${escapeHtml(money(quote.totalPrice, quote.currency))}</td><td>${escapeHtml(quote.technicalCompliance || "A verifier")}</td><td>VALIDATION REQUISE</td></tr>`).join("")}</tbody></table></div>` : "<p>Aucune cotation reelle recue. Toutes les RFQ restent en attente d'autorisation DG.</p>"}
  </article>
  <article class="validation-rfqs supplier-cycle"><h3>COMPARAISON FOURNISSEURS</h3>
    ${(cycle.comparison || []).length ? `<div class="responsive-table"><table><thead><tr><th>Fournisseur</th><th>Prix</th><th>Devise</th><th>Incoterm</th><th>Transport</th><th>Delai</th><th>Garantie</th><th>Paiement</th><th>Conformite</th><th>Cout rendu</th></tr></thead><tbody>${cycle.comparison.map((item) => `<tr><td>${escapeHtml(item.supplier)}</td><td>${escapeHtml(item.totalPrice)}</td><td>${escapeHtml(item.currency)}</td><td>${escapeHtml(item.incoterm || "A verifier")}</td><td>${escapeHtml(item.transport ?? "A documenter")}</td><td>${escapeHtml(item.deliveryLeadTime || "A verifier")}</td><td>${escapeHtml(item.warranty || "A verifier")}</td><td>${escapeHtml(item.paymentTerms || "A verifier")}</td><td>${escapeHtml(item.technicalCompliance)}</td><td>${escapeHtml(money(item.landedCost, item.currency))}</td></tr>`).join("")}</tbody></table></div>` : "<p>Comparaison indisponible tant qu'aucune cotation documentee n'est recue.</p>"}
    <div class="supplier-pricing-state"><p><span>Cout d'achat</span><strong>${escapeHtml(money(cycle.pricing.purchaseCost))}</strong></p><p><span>Cout rendu LILOTOP</span><strong>${escapeHtml(money(cycle.pricing.landedCost))}</strong></p><p><span>Scenarios de marge</span><strong>${cycle.pricing.marginScenarios.length ? escapeHtml(cycle.pricing.marginScenarios.length) : "EN ATTENTE"}</strong></p><p><span>Offre financiere</span><strong>${escapeHtml(cycle.pricing.financialOfferStatus)}</strong></p></div>
    <p><strong>Offre technique :</strong> ${escapeHtml(cycle.technicalOfferStatus)}</p>
    <p><strong>Regle :</strong> aucun prix, cout rendu ou scenario de marge n'est produit sans cotation et couts documentes.</p>
    <ol class="supplier-lifecycle">${(cycle.supplierResponseLifecycle || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
  </article>`;
}

function renderDossier(workflow, actions, sourceDocuments = []) {
  const panel = document.getElementById("dossier-panel");
  const dossier = workflow.dossier || {};
  const analysis = dossier.analysis || {};
  const officialSourceDocuments = sourceDocuments.filter((document) => !String(document.finalUrl || "").startsWith("nexus://"));
  panel.hidden = false;
  document.getElementById("dossier-title").textContent = workflow.title;
  document.getElementById("dossier-status").textContent = PIPELINE_LABELS[dossier.pipelineStatus] || workflow.status;
  document.getElementById("dossier-content").innerHTML = `
    <article class="dossier-card dossier-card-wide">
      <h3>DAO et source officielle</h3>
      <p><strong>Référence :</strong> ${escapeHtml(dossier.tenderSource?.reference || "À confirmer")}</p>
      <p><strong>URL source :</strong> ${dossier.opportunity?.sourceUrl ? `<a href="${escapeHtml(dossier.opportunity.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir l'avis officiel</a>` : "Non renseignée"}</p>
      <p><strong>Récupération :</strong> ${escapeHtml(dossier.tenderSource?.retrievalStatus || "En attente")}</p>
      ${officialSourceDocuments.length ? officialSourceDocuments.map((document) => `
        <p><a class="button button-secondary button-inline" href="/api/nexus-orchestrator?action=document&id=${escapeHtml(document.id)}" download>
          Télécharger ${escapeHtml(document.filename)} (${escapeHtml(Math.round(document.sizeBytes / 1024))} Ko)
        </a></p>
      `).join("") : "<p>Aucun document téléchargé.</p>"}
      ${workflow.status !== "completed" ? `
        <form data-official-sources-form data-workflow-id="${escapeHtml(workflow.id)}" class="source-attachment-form">
          <label>Référence officielle<input name="reference" value="${escapeHtml(dossier.tenderSource?.reference || "")}" required></label>
          <label>Date de publication<input name="publicationDate" type="date" value="${escapeHtml(dossier.tenderSource?.publicationDate || "")}"></label>
          <label>Documents officiels (une URL par ligne)<textarea name="documentUrls" rows="5" required>${escapeHtml((dossier.opportunity?.rawData?.documentUrls || []).join("\n"))}</textarea></label>
          <button class="button button-secondary" type="submit">Rattacher les documents et relancer l'analyse</button>
        </form>
        <form data-official-upload-form data-workflow-id="${escapeHtml(workflow.id)}" class="source-attachment-form">
          <label>URL officielle du fichier<input name="sourceUrl" type="url" required></label>
          <label>Copie officielle<input name="document" type="file" accept=".pdf,.docx,.xlsx,.zip" required></label>
          <button class="button button-secondary" type="submit">Ajouter cette copie officielle</button>
        </form>
      ` : ""}
    </article>
    <article class="dossier-card">
      <h3>Analyse</h3>
      <p>${escapeHtml(analysis.executiveSummary || "Analyse en attente.")}</p>
      <strong>Risques</strong>
      ${listMarkup(analysis.risks, "Aucun risque extrait.")}
    </article>
    <article class="dossier-card">
      <h3>Exigences extraites</h3>
      <p><strong>Adéquation LILOTOP :</strong> ${analysis.lilotopFit === false ? "Non" : analysis.lilotopFit === true ? "Oui" : "En attente"}</p>
      <p><strong>Score :</strong> ${escapeHtml(analysis.opportunityScore ?? "—")}/100 · ${escapeHtml(analysis.priority || "Non classé")}</p>
      <p><strong>Pays :</strong> ${escapeHtml(analysis.country || "Non renseigné")}</p>
      <p><strong>Date limite :</strong> ${escapeHtml(analysis.deadline || "Non renseignée")}</p>
      ${listMarkup((analysis.products || []).map((item) => `${item.name}: ${item.quantity || "À confirmer"}`), "Aucun produit extrait.")}
    </article>
    <article class="dossier-card">
      <h3>Fournisseurs</h3>
      <p>${escapeHtml((dossier.sourcing || []).length)} recherche(s) documentée(s).</p>
      ${(dossier.sourcing || []).map((entry) => `
        <strong>${escapeHtml(entry.product.name)}</strong>
        ${listMarkup(entry.suppliers?.slice(0, 5), "Aucun fournisseur trouvé.")}
      `).join("")}
    </article>
    <article class="dossier-card">
      <h3>RFQ préparées</h3>
      ${listMarkup((dossier.rfqs || []).map((rfq) => rfq.subject), "Aucune RFQ préparée.")}
      <p>Aucun envoi automatique n'est autorisé.</p>
    </article>
    <article class="dossier-card">
      <h3>Conformité documentaire</h3>
      <p><strong>Niveau :</strong> ${escapeHtml(dossier.tenderResponse?.compliance?.compliancePercent ?? 0)}%</p>
      <strong>Documents manquants</strong>
      ${listMarkup(dossier.tenderResponse?.compliance?.missingDocuments, "Aucun document manquant identifié.")}
      <strong>Documents expirés</strong>
      ${listMarkup(dossier.tenderResponse?.compliance?.expiredDocuments, "Aucun document expiré identifié.")}
      <div class="document-control-table">
        ${(dossier.tenderResponse?.compliance?.documentControl || []).map((item) => `
          <p><strong>${escapeHtml(item.document)}</strong><br>
          ${escapeHtml(item.status)} · ${escapeHtml(item.expiration || "Sans date")}<br>
          ${escapeHtml(item.source)} · ${escapeHtml(item.actionRequired || "À confirmer")}</p>
        `).join("")}
      </div>
    </article>
    <article class="dossier-card">
      <h3>Comparaison fournisseurs</h3>
      ${(dossier.supplierComparison || []).slice(0, 8).map((item) => `
        <p><strong>${escapeHtml(item.supplier)}</strong> · ${escapeHtml(item.product)} · ${escapeHtml(item.reliabilityScore)}/100<br>
        ${escapeHtml(item.priceStatus || "EN ATTENTE DE COTATION FOURNISSEUR")}<br>
        Prix, délai et Incoterm : à confirmer par cotation validée.</p>
      `).join("") || "<p>Aucune comparaison disponible.</p>"}
    </article>
    <article class="dossier-card">
      <h3>Documents générés</h3>
      ${listMarkup(dossier.documents, "Documents en attente.")}
    </article>
    <article class="dossier-card">
      <h3>Historique du dossier</h3>
      ${listMarkup(actions.map((action) => `${action.agentKey} — ${action.label}`), "Aucune action enregistrée.")}
    </article>
  `;
  renderValidationSheet(workflow);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function displayMoney(value, currency) {
  if (value === null || value === undefined) return "À valider";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value))} ${currency || ""}`.trim();
}

function renderValidationSheet(workflow) {
  const section = document.getElementById("validation-sheet");
  const dossier = workflow.dossier || {};
  const sheet = dossier.finalValidation;
  const unece = sheet?.uneceSubmissionReview;
  const eoi = sheet?.uneceEoiSubmission;
  const eoiPackage = sheet?.uneceEoiPackage;
  const eoiLifecycle = dossier.eoiLifecycle || {};
  const itbMonitoring = dossier.itbMonitoring || {};
  const eoiSubmitted = eoiLifecycle.status === "EOI SUBMITTED";
  const validations = dossier.validations || {};
  const dgConfirmations = validations.eoiDgConfirmations || {};
  const confirmationKeys = [
    "ungm-vendor-number", "ungm-basic", "ungm-profile",
    "eligibility-a", "eligibility-b", "eligibility-c",
    "eligibility-d", "eligibility-e", "eligibility-f", "eligibility-g"
  ];
  const allDgConfirmed = confirmationKeys.every((key) => dgConfirmations[key]?.status === "validated");
  const confirmationControl = (key) => {
    const status = dgConfirmations[key]?.status || "pending";
    return `<div class="eoi-confirmation-actions" data-confirmation-state="${escapeHtml(status)}">
      <button class="button button-primary" type="button" data-eoi-confirmation="${escapeHtml(key)}" data-outcome="validated" ${eoiSubmitted || status === "validated" ? "disabled" : ""}>VALIDER OUI</button>
      <button class="button button-secondary" type="button" data-eoi-confirmation="${escapeHtml(key)}" data-outcome="problem" ${eoiSubmitted || status === "problem" ? "disabled" : ""}>SIGNALER UN PROBLEME</button>
      <span class="status ${status === "validated" ? "status-completed" : status === "problem" ? "status-failed" : "status-paused"}">${status === "validated" ? "VALIDE OUI" : status === "problem" ? "PROBLEME SIGNALE" : "A CONFIRMER"}</span>
    </div>`;
  };
  section.hidden = !sheet;
  section.dataset.workflowId = workflow.id;
  if (!sheet) return;
  const fields = [
    ["Client", sheet.client], ["Objet du marché", sheet.marketObject], ["Date limite", sheet.deadline || "À confirmer"],
    ["Score d'opportunité", `${sheet.opportunityScore}/100`], ["Niveau de conformité", `${sheet.compliancePercent}%`],
    ["Fournisseur recommandé", sheet.recommendedSupplier || "À valider"],
    ["Coût d'achat", displayMoney(sheet.purchaseCost, sheet.currency)],
    ["Prix de vente proposé", displayMoney(sheet.proposedSalePrice, sheet.currency)],
    ["Marge estimée", displayMoney(sheet.estimatedMargin, sheet.currency)],
    ["Cotations reçues", sheet.quotationsReceived ?? 0],
    ["Cotations manquantes", sheet.quotationsMissing ?? 0],
    ["Statut final", sheet.finalStatus || "CORRECTION REQUISE"]
  ];
  document.getElementById("validation-content").innerHTML = `
    <div class="validation-facts">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
    <article class="validation-summary validation-summary-wide">
      <h3>Dashboard DG - ${unece ? "situation UNECA" : "situation du marche"}</h3>
      <div class="validation-summary-grid">
        <div><span>DOCUMENTS</span><strong>${sheet.documentSubmissionRequired === false ? "Aucun document à joindre à cette EOI" : `${escapeHtml(sheet.documentSummary?.available || 0)}/${escapeHtml(sheet.documentSummary?.total || 0)} exigences satisfaites`}</strong><small>${escapeHtml(sheet.documentSummary?.available || 0)}/${escapeHtml(sheet.documentSummary?.total || 0)} condition(s) confirmée(s) · Préparation documentaire ${escapeHtml(sheet.documentaryReadinessPercent || 0)}%</small></div>
        <div><span>RFQ</span><strong>${escapeHtml(sheet.rfqSummary?.prepared || 0)} preparees</strong><small>${escapeHtml(sheet.rfqSummary?.contactsVerified || 0)} coordonnee(s) verifiee(s) · ${escapeHtml(sheet.rfqSummary?.sent || 0)} envoyee</small></div>
        <div><span>PRIX</span><strong>${escapeHtml(sheet.pricingSummary?.quotationsReceived || 0)} cotation recue</strong><small>Cout rendu : ${escapeHtml(sheet.pricingSummary?.landedCost || "EN ATTENTE")} · Marge : ${escapeHtml(sheet.pricingSummary?.margin || "EN ATTENTE")} · Offre financiere : ${escapeHtml(sheet.pricingSummary?.financialOffer || "INCOMPLETE")}</small></div>
      </div>
    </article>
    ${unece ? `<article id="unece-submission-readiness" class="unece-readiness">
      <div class="unece-readiness-heading">
        <div><p class="section-kicker">EOIUNECA24536</p><h3>UNECA - CONDITIONS AVANT SOUMISSION</h3></div>
        <div class="unece-progress" aria-label="Avancement operationnel ${escapeHtml(unece.progressPercent)} pour cent"><strong>${escapeHtml(unece.progressPercent)}%</strong><span>Avancement operationnel</span></div>
      </div>
      ${eoi ? `<section class="eoi-dg-card">
        <div class="section-heading-inline"><div><p class="section-kicker">Fiche de suivi DG</p><h4>UNECA EOIUNECA24536</h4></div><span class="status ${eoiSubmitted || allDgConfirmed ? "status-completed" : "status-paused"}">${eoiSubmitted ? "EXPRESSION D'INTERET SOUMISE / EOI SUBMITTED" : allDgConfirmed ? "PRET POUR VALIDATION FINALE DG / EXPRESS INTEREST" : "VALIDATION DG REQUISE"}</span></div>
        <div class="eoi-dg-grid">
          <div><span>Echeance</span><strong>${escapeHtml(eoi.deadline)}</strong></div>
          <div><span>UNGM</span><strong>673735</strong></div>
          <div><span>Confirmations</span><strong>${confirmationKeys.filter((key) => dgConfirmations[key]?.status === "validated").length}/${confirmationKeys.length} validees</strong></div>
        </div>
        <section class="eoi-ungm-confirmations" aria-label="Confirmations UNGM">
          <article><h5>UNGM Vendor Number</h5><p><strong>673735</strong></p>${confirmationControl("ungm-vendor-number")}</article>
          <article><h5>Statut UNGM Basic</h5><p><strong>ENREGISTRE / CONFIRME</strong></p>${confirmationControl("ungm-basic")}</article>
          <article><h5>Profil UNGM a jour</h5><p><strong>VERIFIE ET MIS A JOUR PAR LE DG</strong></p>${confirmationControl("ungm-profile")}</article>
        </section>
        <div class="unece-review-columns">
          <section><h4>PRET</h4>${listMarkup(eoi.readyItems, "Aucun element pret.")}</section>
          <section><h4>A VALIDER PAR MOI</h4><ol>${eoi.dgValidationItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section>
        </div>
        <p><strong>PHASE :</strong> ${escapeHtml(eoiSubmitted ? eoiLifecycle.phase : eoi.blockingItem)}</p>
        <p><strong>RECOMMANDATION :</strong> ${escapeHtml(eoiSubmitted ? "Attendre et surveiller la publication de l'ITB / des documents de sollicitation." : eoi.recommendation)}</p>
        <p><strong>Canal officiel :</strong> ${escapeHtml(eoi.channel)}</p>
        ${eoiSubmitted ? `<div class="eoi-express-interest-ready"><strong>EOI UNGM : SOUMISE</strong><p>${escapeHtml(eoiLifecycle.confirmation)}</p><small>Soumise manuellement par le DG le ${escapeHtml(new Date(eoiLifecycle.submittedAt).toLocaleString("fr-FR"))}. Aucun e-mail et aucune RFQ n'ont ete envoyes.</small></div><div class="validation-summary validation-summary-wide"><h4>Surveillance ITB</h4><p><strong>${itbMonitoring.active ? "ACTIVE" : "INACTIVE"}</strong> · ${escapeHtml(itbMonitoring.status || "WAITING FOR ITB")}</p><p>Le futur avis sera rattache au dossier existant via les references EOIUNECA24536 et UNGM 306489. Toute transmission externe restera soumise a validation humaine.</p></div>` : allDgConfirmed ? `<div class="eoi-express-interest-ready"><strong>Confirmation de l'action manuelle</strong><button class="button button-primary" type="button" data-record-eoi-submission>ENREGISTRER L'EOI SOUMISE SUR UNGM</button><small>Ce bouton enregistre uniquement dans NEXUS la confirmation deja fournie par le DG. Il ne contacte pas UNGM.</small></div>` : ""}
        <div class="decision-actions eoi-package-actions">
          ${eoiPackage?.pdf?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&disposition=inline&id=${encodeURIComponent(eoiPackage.pdf.id)}" target="_blank" rel="noopener">PREVISUALISER LE DOSSIER</a>` : ""}
          ${eoiPackage?.pdf?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&id=${encodeURIComponent(eoiPackage.pdf.id)}" download>TELECHARGER PDF</a>` : ""}
          ${eoiPackage?.zip?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&id=${encodeURIComponent(eoiPackage.zip.id)}" download>TELECHARGER ZIP</a>` : ""}
        </div>
        <p><small>La validation DG enregistre une decision interne. Elle ne clique pas sur Express interest et n'envoie aucun e-mail.</small></p>
      </section>
      <section><h4>Informations preparees pour Express interest</h4>${listMarkup(eoi.expressInterestPayload, "Aucune information preparee.")}</section>
      <section><h4>Controle final ligne par ligne</h4><div class="responsive-table"><table class="compact-table">
        <thead><tr><th>Controle</th><th>Statut</th><th>Action</th></tr></thead>
        <tbody>${eoi.control.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td><span class="status ${item.status === "CONFORME" ? "status-completed" : item.status === "BLOQUANT" ? "status-failed" : "status-paused"}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.action)}</td></tr>`).join("")}</tbody>
      </table></div></section>` : ""}
      <div class="responsive-table"><table>
        <thead><tr><th>Condition</th><th>Texte du DAO</th><th>Page</th><th>Statut LILOTOP</th><th>Preuve disponible</th><th>Action restante</th></tr></thead>
        <tbody>${unece.conditions.map((condition, index) => `<tr>
          <td><strong>Condition ${escapeHtml(index + 1)}</strong><br>${escapeHtml(condition.title)}</td>
          <td>${escapeHtml(condition.daoText)}</td><td>${escapeHtml(condition.page)}</td>
          <td><span class="status ${condition.completed ? "status-completed" : "status-paused"}">${escapeHtml(condition.status)}</span></td>
          <td>${escapeHtml(condition.proof)}</td><td>${escapeHtml(condition.action)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <div class="unece-review-columns">
        <section><h4>Actions requises de la Direction Generale</h4>${listMarkup(unece.dgActions, "Aucune action manuelle restante.")}</section>
        <section><h4>Organigramme conserve dans le Coffre</h4><p>${escapeHtml(unece.organizationChart?.status || "Brouillon en cours de creation")}</p>
          ${unece.organizationChart?.versionId ? `<a class="text-link" href="/api/document-vault?action=file&version=${encodeURIComponent(unece.organizationChart.versionId)}">Telecharger le brouillon DOCX</a>` : ""}
          <p><small>Ce document n'est pas joint a UNECA, car il n'est pas exige a cette etape.</small></p>
        </section>
      </div>
      <section class="unece-form-preview">
        <div class="section-heading-inline"><h4>Vendor Response Form - Preview pre-remplie</h4><span class="status status-paused">${escapeHtml(unece.vendorResponseForm.status)}</span></div>
        <p>${escapeHtml(unece.vendorResponseForm.submissionMode)}</p>
        <div class="responsive-table"><table class="compact-table"><thead><tr><th>Champ</th><th>Valeur preparee</th></tr></thead>
          <tbody>${unece.vendorResponseForm.fields.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
        </table></div>
        <p><strong>Adresses internes recuperees :</strong> ${escapeHtml(unece.vendorResponseForm.knownAddresses.join(" | "))}</p>
        <p><strong>Comparaison UNGM :</strong> ${escapeHtml(unece.ungmComparison.note)}</p>
      </section>
      <section class="eoi-eligibility-review"><h4>Sept declarations officielles UNGM A-G</h4>
        ${unece.eligibility.map((item) => `<article class="eoi-declaration-card">
          <div class="section-heading-inline"><h5>Declaration ${escapeHtml(item.key)}</h5><span class="control-badge">Page 4 du DAO</span></div>
          <p><strong>Texte exact :</strong> ${escapeHtml(item.requirement)}</p>
          <p><strong>Reponse proposee :</strong> OUI</p>
          <p><strong>Justification :</strong> ${escapeHtml(item.proof)}</p>
          ${confirmationControl(`eligibility-${String(item.key).toLowerCase()}`)}
        </article>`).join("")}
      </section>
      ${eoi ? `<section><h4>Expression of Interest - brouillon professionnel</h4><pre>${escapeHtml(eoi.letter)}</pre></section>
      <section><h4>Documents reellement requis</h4><p><strong>Aucun document a joindre a cette etape.</strong> Le PDF et le ZIP sont des dossiers internes de validation DG, pas des pieces exigees par UNECA.</p></section>
      <section><h4>E-mail de secours pret</h4><pre>${escapeHtml(eoi.emailDraft)}</pre><p><small>A utiliser uniquement si la reponse electronique UNGM est techniquement impossible.</small></p></section>` : ""}
      <section><h4>Perimetre commercial confirme par l'avis public</h4>
        <div class="commercial-family-grid">${unece.commercialScope.families.map((family) => `<div><strong>${escapeHtml(family.code)}</strong><span>${escapeHtml(family.label)}</span></div>`).join("")}</div>
        <p><strong>Specifications :</strong> ${escapeHtml(unece.commercialScope.specifications)}</p>
        <p><strong>Quantites :</strong> ${escapeHtml(unece.commercialScope.quantities)}</p>
        <div class="responsive-table"><table class="compact-table"><thead><tr><th>Fournisseur</th><th>Famille / produit</th><th>Statut RFQ</th></tr></thead>
          <tbody>${unece.commercialScope.rfqs.map((rfq) => `<tr><td>${escapeHtml(rfq.supplier)}</td><td>${escapeHtml(rfq.product)}</td><td>${escapeHtml(rfq.status)}</td></tr>`).join("") || `<tr><td colspan="3">Aucune RFQ preparee.</td></tr>`}</tbody>
        </table></div>
      </section>
    </article>` : ""}
    <article class="validation-documents"><h3>${escapeHtml(sheet.documentSummary?.total || 0)} exigences réelles ${unece ? "UNECA" : "du marché"}</h3>
      <div class="responsive-table"><table>
        <thead><tr><th>N°</th><th>Document / exigence ${unece ? "UNECA" : "du marché"}</th><th>Statut LILOTOP</th><th>Fichier trouvé dans le Coffre</th><th>Justification DAO</th><th>Action nécessaire</th></tr></thead>
        <tbody>${(sheet.documentMatrix || []).map((item, index) => `<tr>
          <td>${escapeHtml(index + 1)}</td>
          <td>${escapeHtml(item.requirement)}</td>
          <td><span class="status ${["DISPONIBLE ET VALIDE", "INFORMATION CONFIRMÉE – PREUVE À AJOUTER"].includes(item.statusLabel) ? "status-completed" : "status-paused"}">${escapeHtml(item.statusLabel)}</span></td>
          <td>${escapeHtml(item.filename || "Aucun fichier dans le Coffre")}</td>
          <td>${escapeHtml(item.sourcePage || "Non précisé")}</td>
          <td>${escapeHtml(item.actionRequired)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </article>
    <article id="organization-chart-preview" class="organization-chart-preview">
      <h3>${escapeHtml(sheet.organizationChartDraft?.title || "Organigramme LILOTOP SARL")}</h3>
      <p><strong>${escapeHtml(sheet.organizationChartDraft?.status || "À VALIDER")}</strong></p>
      <div class="organization-chart">
        ${(sheet.organizationChartDraft?.nodes || []).map((node) => `<div class="organization-node organization-level-${escapeHtml(node.level)}">
          <strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(node.role)}</span>
        </div>`).join("")}
      </div>
      <p class="organization-note">${escapeHtml(sheet.organizationChartDraft?.note || "")}</p>
    </article>
    <article><h3>Risques</h3>${listMarkup(sheet.risks, "Aucun risque identifié.")}</article>
    <article><h3>Documents manquants</h3>${listMarkup(sheet.missingDocuments, "Aucun document manquant identifié.")}</article>
    <article><h3>Offre technique</h3><pre>${escapeHtml(sheet.technicalOffer)}</pre></article>
    <article><h3>Offre financière</h3><pre>${escapeHtml(sheet.financialOffer)}</pre></article>
    <article><h3>Lettre de soumission</h3><pre>${escapeHtml(sheet.submissionLetter)}</pre></article>
    <article><h3>E-mail prêt à envoyer</h3><pre>${escapeHtml(sheet.emailDraft)}</pre></article>
    <article><h3>Actions restant à valider</h3>${listMarkup(sheet.remainingActions, "Aucune action restante.")}</article>
    ${supplierCycleMarkup(sheet.supplierCycle || dossier.supplierCycle, workflow)}
    <article><h3>Lignes en attente de cotation</h3>${listMarkup(
      (sheet.quotationLines || []).map((item) => `${item.product} · ${item.supplier} · ${item.priceStatus}`),
      "Aucune ligne de cotation."
    )}</article>
    ${sheet.supplierCycle || dossier.supplierCycle ? "" : `<article class="validation-rfqs"><h3>Cotations fournisseurs à autoriser</h3>
      ${(sheet.supplierRfqs || []).map((rfq) => `
        <div class="rfq-authorization-row">
          <p><strong>${escapeHtml(rfq.manufacturer || rfq.supplier)}</strong> · ${escapeHtml(rfq.product)}</p>
          <p><span>Pays :</span> ${escapeHtml(rfq.country)} · <span>Statut :</span> ${rfq.coordinatesVerified ? "COORDONNEES VERIFIEES" : "A VERIFIER"}</p>
          <p><span>Destinataire / service :</span> ${escapeHtml(rfq.recipientService || "Non disponible")}</p>
          <p><span>E-mail :</span> ${escapeHtml(rfq.commercialEmail || "Non disponible")} · <span>Telephone :</span> ${escapeHtml(rfq.phone || "Non disponible")}</p>
          <p><span>Objet :</span> ${escapeHtml(rfq.subject)}</p>
          <p><span>Spécifications :</span> ${escapeHtml(rfq.specifications)}</p>
          <p><span>Quantite :</span> ${escapeHtml(rfq.quantity)} · <span>Incoterm :</span> ${escapeHtml(rfq.incoterm)} · <span>Destination :</span> ${escapeHtml(rfq.destination)}</p>
          <p><span>Delai souhaite :</span> ${escapeHtml(rfq.desiredDelivery)}</p>
          <p><span>Date limite de réponse :</span> ${escapeHtml(rfq.responseDeadline)}</p>
          <p><span>Pieces jointes prevues :</span> ${escapeHtml((rfq.plannedAttachments || []).join(", ") || "Aucune")}</p>
          <p><span>RFQ prete :</span> ${rfq.readyToSend ? "Oui" : "Non - quantite/date de reponse a valider"}</p>
          ${rfq.officialSite ? `<p><a href="${escapeHtml(rfq.officialSite)}" target="_blank" rel="noopener noreferrer">Site officiel</a></p>` : ""}
          ${rfq.contactForm ? `<p><a href="${escapeHtml(rfq.contactForm)}" target="_blank" rel="noopener noreferrer">Formulaire officiel</a></p>` : ""}
          ${rfq.verificationSource ? `<p><a href="${escapeHtml(rfq.verificationSource)}" target="_blank" rel="noopener noreferrer">Source de verification</a></p>` : ""}
        </div>
      `).join("") || "<p>Aucune RFQ préparée.</p>"}
      <p><strong>Statut :</strong> ${sheet.rfqSendingAuthorized ? "Autorisation DG enregistrée - aucun envoi déclenché" : "En attente d'autorisation DG"}</p>
    </article>`}
  `;
  document.getElementById("purchase-cost").value = sheet.purchaseCost ?? "";
  document.getElementById("sale-price").value = sheet.proposedSalePrice ?? "";
  document.getElementById("price-currency").value = sheet.currency || "USD";
  document.querySelector(".price-validation").hidden = Boolean(eoi);
  const rfqAuthorizationBlocked = !(sheet.supplierRfqs || []).length
    || (sheet.supplierRfqs || []).some((rfq) => !rfq.coordinatesVerified || !rfq.readyToSend);
  document.querySelectorAll("[data-decision]").forEach((button) => {
    const key = button.dataset.decision;
    button.hidden = eoi
      ? ["validate-participation", "validate-prices", "authorize-rfqs", "validate-eoi", "validate-final", "authorize-send"].includes(key)
      : key === "validate-eoi";
    if (key === "reject") button.textContent = eoi ? "REFUSER" : "Rejeter";
    button.disabled = (key === "validate-participation" && validations.participation === "validated")
      || (key === "validate-prices" && validations.prices === "validated")
      || (key === "authorize-rfqs" && validations.rfqSending === "authorized")
      || (key === "authorize-rfqs" && rfqAuthorizationBlocked)
      || (key === "validate-final" && validations.finalDossier === "validated")
      || (key === "validate-eoi" && validations.eoiSubmission === "validated-for-manual-submission")
      || (key === "authorize-send" && validations.sending === "authorized")
      || validations.participation === "rejected";
  });
}

async function refreshVaultControl() {
  const section = document.getElementById("validation-sheet");
  const id = section.dataset.workflowId;
  if (!id) return;
  const button = document.getElementById("refresh-vault-control");
  button.disabled = true;
  statusRegion.textContent = "Synchronisation avec les fichiers réels du Coffre…";
  try {
    const result = await api("/api/nexus-orchestrator?action=refresh-vault", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = `Contrôle mis à jour : ${result.comparison.afterAvailable}/${result.comparison.totalRequirements} document(s) disponible(s), contre ${result.comparison.beforeAvailable}/${result.comparison.totalRequirements} avant synchronisation.`;
  } catch (error) {
    statusRegion.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function prepareUnopsSupplierCycle(button) {
  const id = document.getElementById("validation-sheet").dataset.workflowId;
  if (!id) return;
  button.disabled = true;
  statusRegion.textContent = "Extraction des lots officiels et preparation des RFQ...";
  try {
    await api("/api/nexus-orchestrator?action=prepare-unops-supplier-cycle", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    await refresh();
    await viewWorkflow(id);
    window.location.hash = "supplier-rfq-cycle";
    statusRegion.textContent = "RFQ specialisees preparees pour controle DG. Aucun envoi effectue.";
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
  }
}

function openRfqAuthorization(button) {
  const dialog = document.getElementById("rfq-authorization-dialog");
  const summary = document.getElementById("rfq-authorization-summary");
  pendingRfqAuthorization = {
    rfqId: button.dataset.requestRfqAuthorization,
    pilot: button.dataset.rfqPilot === "true",
    supplier: button.dataset.rfqSupplier,
    recipient: button.dataset.rfqRecipient,
    lot: button.dataset.rfqLot,
    lines: button.dataset.rfqLines,
    attachments: button.dataset.rfqAttachments,
    deadline: button.dataset.rfqDeadline
  };
  summary.innerHTML = [
    ["Destinataire", pendingRfqAuthorization.recipient],
    ["Fournisseur", pendingRfqAuthorization.supplier],
    ["Lot", pendingRfqAuthorization.lot],
    ["Nombre de lignes", pendingRfqAuthorization.lines],
    ["Pieces jointes", pendingRfqAuthorization.attachments],
    ["Date limite demandee", pendingRfqAuthorization.deadline]
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const warning = document.getElementById("rfq-authorization-warning");
  warning.textContent = pendingRfqAuthorization.pilot
    ? "Vous etes sur le point d'autoriser l'envoi reel d'une RFQ a Hilti pour 6 lignes du Lot 1 de ITB/2026/62389."
    : "Cette confirmation enregistre l'autorisation DG pour cette RFQ uniquement.";
  dialog.showModal();
}

async function confirmRfqAuthorization() {
  const id = document.getElementById("validation-sheet").dataset.workflowId;
  if (!id || !pendingRfqAuthorization) return;
  statusRegion.textContent = "Enregistrement de l'autorisation DG, sans envoi...";
  await api("/api/nexus-orchestrator?action=authorize-unops-supplier-rfq", {
    method: "POST",
    body: JSON.stringify({ id, rfqId: pendingRfqAuthorization.rfqId })
  });
  pendingRfqAuthorization = null;
  await refresh();
  await viewWorkflow(id);
  statusRegion.textContent = "Autorisation DG enregistree. Aucun e-mail n'a ete envoye.";
}

async function sendAuthorizedRfq(button) {
  const id = document.getElementById("validation-sheet").dataset.workflowId;
  const rfqId = button.dataset.sendAuthorizedRfq;
  if (!id || !rfqId) return;
  const confirmed = window.confirm("Confirmation finale : envoyer uniquement la RFQ Hilti Lot 1 autorisee a Customercare.za@hilti.com ?");
  if (!confirmed) return;
  button.disabled = true;
  statusRegion.textContent = "Envoi de l'unique RFQ autorisee via Gmail API...";
  try {
    const result = await api("/api/nexus-gmail?action=send-authorized-rfq", {
      method: "POST",
      body: JSON.stringify({ workflowId: id, rfqId })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = `RFQ Hilti envoyee et journalisee. Gmail ID : ${result.gmailMessageId || result.provider_message_id || "obtenu"}.`;
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
  }
}

async function submitEoiConfirmation(button) {
  const section = document.getElementById("validation-sheet");
  const id = section.dataset.workflowId;
  if (!id) return;
  button.disabled = true;
  statusRegion.textContent = "Enregistrement de la confirmation DG...";
  try {
    await api("/api/nexus-orchestrator?action=decision", {
      method: "POST",
      body: JSON.stringify({
        id,
        decision: "review-eoi-confirmation",
        confirmationKey: button.dataset.eoiConfirmation,
        outcome: button.dataset.outcome,
        comment: document.getElementById("decision-comment").value
      })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = "Confirmation DG enregistree et journalisee.";
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
  }
}

async function refresh() {
  state = await api("/api/nexus-orchestrator?action=bootstrap");
  renderDashboard();
  renderOpportunities();
  renderAgents();
  renderWorkflows();
  renderActions();
  statusRegion.classList.remove("has-error");
}

async function viewWorkflow(id) {
  const data = await api(`/api/nexus-orchestrator?action=workflow&id=${encodeURIComponent(id)}`);
  renderDossier(data.workflow, [...data.actions].reverse(), data.sourceDocuments || []);
  renderActions(data.actions);
}

async function attachOfficialSourcesFromForm(event) {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  statusRegion.textContent = "Rattachement et contrôle des documents officiels…";
  const workflow = await api("/api/nexus-orchestrator?action=attach-official-sources", {
    method: "POST",
    body: JSON.stringify({ ...values, id: form.dataset.workflowId })
  });
  await refresh();
  await runUntilComplete(workflow.id);
}

async function uploadOfficialSourceFromForm(event) {
  event.preventDefault();
  const form = event.target;
  const body = new FormData(form);
  body.set("id", form.dataset.workflowId);
  statusRegion.textContent = "Import de la copie officielle…";
  const response = await fetch("/api/nexus-orchestrator?action=upload-official-source", { method: "POST", body });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Import impossible.");
  form.reset();
  await viewWorkflow(form.dataset.workflowId);
  statusRegion.textContent = `${payload.data.filename} rattaché au dossier.`;
}

async function runUntilComplete(id) {
  runningWorkflowId = id;
  renderWorkflows();
  statusRegion.textContent = "Workflow multi-agents en cours…";
  try {
    let workflow;
    for (let index = 0; index < 12; index += 1) {
      workflow = await api("/api/nexus-orchestrator?action=resume", {
        method: "POST",
        body: JSON.stringify({ id })
      });
      statusRegion.textContent = `${STEP_LABELS[workflow.currentStep] || workflow.currentStep}…`;
      if (workflow.status === "completed") break;
    }
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = workflow?.dossier?.pipelineStatus === "rejected"
      ? "Workflow arrêté : l'opportunité a été classée hors cible LILOTOP."
      : workflow?.status === "completed"
      ? "Workflow complet terminé. Dossier commercial prêt pour validation."
      : "Workflow interrompu avant sa finalisation. Utilisez Reprendre Workflow.";
  } catch (error) {
    statusRegion.textContent = error.message;
    await refresh();
  } finally {
    runningWorkflowId = null;
    renderWorkflows();
  }
}

async function startWorkflow(event) {
  event.preventDefault();
  const opportunityId = new FormData(workflowForm).get("opportunityId");
  statusRegion.textContent = "Création du dossier commercial…";
  const workflow = await api("/api/nexus-orchestrator?action=start", {
    method: "POST",
    body: JSON.stringify({ opportunityId })
  });
  await refresh();
  await runUntilComplete(workflow.id);
}

async function detectOpportunity() {
  statusRegion.textContent = "Détection de la prochaine opportunité qualifiée…";
  const workflow = await api("/api/nexus-orchestrator?action=detect", {
    method: "POST",
    body: JSON.stringify({})
  });
  await refresh();
  await runUntilComplete(workflow.id);
}

async function submitDecision(button) {
  const section = document.getElementById("validation-sheet");
  const id = section.dataset.workflowId;
  if (!id) return;
  button.disabled = true;
  statusRegion.textContent = "Enregistrement de la décision…";
  try {
    await api("/api/nexus-orchestrator?action=decision", {
      method: "POST",
      body: JSON.stringify({
        id,
        decision: button.dataset.decision,
        purchaseCost: document.getElementById("purchase-cost").value,
        proposedSalePrice: document.getElementById("sale-price").value,
        currency: document.getElementById("price-currency").value,
        comment: document.getElementById("decision-comment").value
      })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = "Décision enregistrée et journalisée.";
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
  }
}

async function recordEoiSubmission(button) {
  const id = document.getElementById("validation-sheet").dataset.workflowId;
  if (!id) return;
  button.disabled = true;
  statusRegion.textContent = "Enregistrement de la confirmation UNGM dans NEXUS...";
  try {
    await api("/api/nexus-orchestrator?action=record-eoi-submission", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    await refresh();
    await viewWorkflow(id);
    statusRegion.textContent = "EOI soumise enregistree. Surveillance ITB active.";
  } catch (error) {
    statusRegion.textContent = error.message;
    button.disabled = false;
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
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible.");
    if (payload.passwordChangeRequired && payload.resetToken) {
      window.location.assign(`/admin/nexus/reset-password?token=${encodeURIComponent(payload.resetToken)}&returnTo=%2Fadmin%2Fnexus%2Forchestrator`);
      return;
    }
    setAuthenticated(true);
    loginStatus.textContent = "";
    await refresh();
    startGmailPolling();
    await syncGmailInbound({ silent: true });
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

async function logout() {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  if (gmailSyncTimer) clearInterval(gmailSyncTimer);
  gmailSyncTimer = null;
  setAuthenticated(false);
}

opportunitySelect.addEventListener("change", () => {
  const selected = state.opportunities.find((item) => item.id === opportunitySelect.value);
  opportunitySummary.textContent = selected
    ? `${selected.organization || "Organisation non renseignée"} · ${selected.country || "Pays non renseigné"} · Score ${selected.score}/100`
    : "Sélectionnez une opportunité pour afficher son contexte.";
});
workflowForm.addEventListener("submit", (event) => {
  startWorkflow(event).catch((error) => {
    statusRegion.textContent = error.message;
  });
});
document.getElementById("refresh-orchestrator").addEventListener("click", () => {
  refresh().catch((error) => { statusRegion.textContent = error.message; });
});
document.getElementById("detect-opportunity").addEventListener("click", () => {
  detectOpportunity().catch((error) => { statusRegion.textContent = error.message; });
});
document.getElementById("decision-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision]");
  if (button) submitDecision(button);
});
document.getElementById("validation-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-eoi-confirmation]");
  if (button) submitEoiConfirmation(button);
  const submissionButton = event.target.closest("[data-record-eoi-submission]");
  if (submissionButton) recordEoiSubmission(submissionButton);
  const prepareButton = event.target.closest("[data-prepare-unops-cycle]");
  if (prepareButton) prepareUnopsSupplierCycle(prepareButton);
  const toggleButton = event.target.closest("[data-toggle-rfq]");
  if (toggleButton) {
    const detail = document.getElementById(toggleButton.dataset.toggleRfq);
    if (detail) {
      detail.hidden = !detail.hidden;
      toggleButton.textContent = detail.hidden ? "VOIR RFQ" : "MASQUER RFQ";
    }
  }
  const authorizeButton = event.target.closest("[data-request-rfq-authorization]");
  if (authorizeButton) openRfqAuthorization(authorizeButton);
  const sendButton = event.target.closest("[data-send-authorized-rfq]");
  if (sendButton) sendAuthorizedRfq(sendButton);
  const editButton = event.target.closest("[data-edit-rfq]");
  if (editButton) {
    const detail = document.getElementById(editButton.dataset.editRfq);
    if (detail) {
      detail.hidden = false;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
      statusRegion.textContent = "RFQ ouverte en mode controle. Aucune modification ni aucun envoi n'a ete effectue.";
    }
  }
});
document.getElementById("rfq-authorization-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue === "confirm") {
    if (pendingRfqAuthorization?.pilot) {
      document.getElementById("rfq-pilot-final-confirmation-dialog").showModal();
    } else {
      confirmRfqAuthorization().catch((error) => { statusRegion.textContent = error.message; });
    }
  } else {
    pendingRfqAuthorization = null;
  }
});
document.getElementById("rfq-pilot-final-confirmation-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue === "confirm") {
    confirmRfqAuthorization().catch((error) => { statusRegion.textContent = error.message; });
  } else {
    pendingRfqAuthorization = null;
  }
});
document.getElementById("refresh-vault-control").addEventListener("click", refreshVaultControl);
document.getElementById("workflow-list").addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-workflow]");
  const resume = event.target.closest("[data-resume-workflow]");
  if (view) viewWorkflow(view.dataset.viewWorkflow).catch((error) => { statusRegion.textContent = error.message; });
  if (resume) runUntilComplete(resume.dataset.resumeWorkflow);
});
document.getElementById("dossier-content").addEventListener("submit", (event) => {
  if (event.target.matches("[data-official-sources-form]")) {
    attachOfficialSourcesFromForm(event).catch((error) => { statusRegion.textContent = error.message; });
  }
  if (event.target.matches("[data-official-upload-form]")) {
    uploadOfficialSourceFromForm(event).catch((error) => { statusRegion.textContent = error.message; });
  }
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("orchestrator-logout").addEventListener("click", logout);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncGmailInbound({ silent: true });
});

setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") {
  refresh().then(() => {
    const workflowId = new URLSearchParams(window.location.search).get("workflow");
    return workflowId ? viewWorkflow(workflowId) : null;
  }).then(() => {
    startGmailPolling();
    return syncGmailInbound({ silent: true });
  }).catch((error) => { reportClientFailure(error.message); });
}
