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
      <h3>Dashboard DG - situation UNECA</h3>
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
        <div class="section-heading-inline"><div><p class="section-kicker">Fiche DG simplifiee</p><h4>UNECA EOIUNECA24536</h4></div><span class="status status-paused">NON SOUMIS</span></div>
        <div class="eoi-dg-grid">
          <div><span>Echeance</span><strong>${escapeHtml(eoi.deadline)}</strong></div>
          <div><span>UNGM</span><strong>673735</strong></div>
          <div><span>Eligibilite</span><strong>${escapeHtml(eoi.eligibilityPercent)}%</strong></div>
          <div><span>Dossier EOI</span><strong>${escapeHtml(eoi.dossierPercent)}%</strong></div>
          <div><span>Documents a fournir</span><strong>0</strong></div>
          <div><span>Risque de rejet</span><strong>${escapeHtml(eoi.rejectionRisk)}</strong></div>
        </div>
        <p><strong>Recommandation :</strong> ${escapeHtml(eoi.recommendation)}</p>
        <p><strong>Canal officiel :</strong> ${escapeHtml(eoi.channel)}</p>
        <div class="decision-actions eoi-package-actions">
          ${eoiPackage?.pdf?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&disposition=inline&id=${encodeURIComponent(eoiPackage.pdf.id)}" target="_blank" rel="noopener">PREVISUALISER LE DOSSIER</a>` : ""}
          ${eoiPackage?.pdf?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&id=${encodeURIComponent(eoiPackage.pdf.id)}" download>TELECHARGER PDF</a>` : ""}
          ${eoiPackage?.zip?.id ? `<a class="button button-secondary" href="/api/nexus-orchestrator?action=document&id=${encodeURIComponent(eoiPackage.zip.id)}" download>TELECHARGER ZIP</a>` : ""}
        </div>
        <p><small>La validation DG enregistre une decision interne. Elle ne clique pas sur Express interest et n'envoie aucun e-mail.</small></p>
      </section>
      <section><h4>Champs restant a completer par le DG</h4>${listMarkup(eoi.dgFields, "Aucun champ restant.")}</section>
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
        <p><strong>Adresses LILOTOP connues a departager par le DG :</strong> ${escapeHtml(unece.vendorResponseForm.knownAddresses.join(" | "))}</p>
      </section>
      <section><h4>Conditions d'eligibilite A-F</h4><div class="responsive-table"><table>
        <thead><tr><th>Condition</th><th>Exigence</th><th>Reponse LILOTOP</th><th>Preuve / controle</th><th>Statut</th><th>Declaration brouillon</th></tr></thead>
        <tbody>${unece.eligibility.map((item) => `<tr><td><strong>${escapeHtml(item.key)}</strong></td><td>${escapeHtml(item.requirement)}</td><td>${escapeHtml(item.response)}</td><td>${escapeHtml(item.proof)}</td><td><span class="status status-paused">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.declarationDraft)}</td></tr>`).join("")}</tbody>
      </table></div></section>
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
    <article class="validation-documents"><h3>${escapeHtml(sheet.documentSummary?.total || 0)} exigences réelles UNECA</h3>
      <div class="responsive-table"><table>
        <thead><tr><th>N°</th><th>Document / exigence UNECA</th><th>Statut LILOTOP</th><th>Fichier trouvé dans le Coffre</th><th>Justification DAO</th><th>Action nécessaire</th></tr></thead>
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
    <article><h3>Lignes en attente de cotation</h3>${listMarkup(
      (sheet.quotationLines || []).map((item) => `${item.product} · ${item.supplier} · ${item.priceStatus}`),
      "Aucune ligne de cotation."
    )}</article>
    <article class="validation-rfqs"><h3>Cotations fournisseurs à autoriser</h3>
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
    </article>
  `;
  document.getElementById("purchase-cost").value = sheet.purchaseCost ?? "";
  document.getElementById("sale-price").value = sheet.proposedSalePrice ?? "";
  document.getElementById("price-currency").value = sheet.currency || "USD";
  document.querySelector(".price-validation").hidden = Boolean(eoi);
  const validations = dossier.validations || {};
  const rfqAuthorizationBlocked = !(sheet.supplierRfqs || []).length
    || (sheet.supplierRfqs || []).some((rfq) => !rfq.coordinatesVerified || !rfq.readyToSend);
  document.querySelectorAll("[data-decision]").forEach((button) => {
    const key = button.dataset.decision;
    button.hidden = eoi
      ? ["validate-participation", "validate-prices", "authorize-rfqs", "validate-final", "authorize-send"].includes(key)
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

async function authenticate(event) {
  event.preventDefault();
  loginStatus.textContent = "Connexion en cours…";
  const formData = new FormData(loginForm);
  try {
    await api("/api/business-radar-auth", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    setAuthenticated(true);
    loginStatus.textContent = "";
    await refresh();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

async function logout() {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
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
document.getElementById("refresh-vault-control").addEventListener("click", refreshVaultControl);
document.getElementById("workflow-list").addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-workflow]");
  const resume = event.target.closest("[data-resume-workflow]");
  if (view) viewWorkflow(view.dataset.viewWorkflow).catch((error) => { statusRegion.textContent = error.message; });
  if (resume) runUntilComplete(resume.dataset.resumeWorkflow);
});
loginForm.addEventListener("submit", authenticate);
document.getElementById("orchestrator-logout").addEventListener("click", logout);

setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") {
  refresh().then(() => {
    const workflowId = new URLSearchParams(window.location.search).get("workflow");
    return workflowId ? viewWorkflow(workflowId) : null;
  }).catch((error) => { reportClientFailure(error.message); });
}
