"use strict";

const body = document.body;
const loginScreen = document.getElementById("login-screen");
const nexusShell = document.getElementById("nexus-shell");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const logoutButton = document.getElementById("logout-button");
const viewTitle = document.getElementById("view-title");
const bootstrap = JSON.parse(document.getElementById("nexus-bootstrap").textContent);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDateTime(value) {
  if (!value) return "Date non disponible";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function pipelineRows(items, emptyText) {
  if (!items?.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<div class="pipeline-list">${items.map((item, index) => `
    <div class="pipeline-row">
      <strong>${index + 1}. ${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.reference || "Sans référence")} · ${escapeHtml(item.country || "Pays à confirmer")}</span>
      <span>${escapeHtml(item.decision)} · ${escapeHtml(item.priorityScore)}/100 · progression ${escapeHtml(item.progress)}%</span>
      <span>${item.deadline.remainingHours === null ? "Échéance à confirmer" : `${escapeHtml(item.deadline.remainingHours)} h restantes`}</span>
      <span>${escapeHtml(item.actionDg)}</span>
    </div>`).join("")}</div>`;
}

function renderPipelineBoard(pipeline) {
  const target = document.getElementById("pipeline-board");
  const health = document.getElementById("pipeline-health");
  if (!target || !health || !pipeline) return;
  health.textContent = pipeline.urgent72h?.length ? `${pipeline.urgent72h.length} urgence(s) <72h` : "Sous contrôle";
  health.className = `status ${pipeline.urgent72h?.length ? "status-coming" : "status-active"}`;
  target.innerHTML = `
    <div class="pipeline-summary">
      <strong>Nouveaux AO RDC : ${escapeHtml(pipeline.newRdc?.length || 0)}</strong>
      <strong>En attente priorisée : ${escapeHtml(pipeline.waitingPrioritized?.length || 0)}</strong>
      <strong>Ready to submit : ${escapeHtml(pipeline.readyToSubmit?.length || 0)}</strong>
      <strong>No-Go : ${escapeHtml(pipeline.noGo?.length || 0)}</strong>
    </div>
    <h3>TOP 3 actifs</h3>
    ${pipelineRows(pipeline.top3, "Aucun dossier éligible au traitement intensif.")}
    <h3>Action DG aujourd'hui</h3>
    ${pipelineRows(pipeline.actionToday, "Aucune action DG urgente.")}
  `;
}

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  nexusShell.hidden = !authenticated;
  document.title = `${authenticated ? "NEXUS AI" : "Connexion NEXUS AI"} | LILOTOP SARL`;
}

function renderDashboard() {
  const target = document.getElementById("dashboard-metrics");
  target.innerHTML = bootstrap.dashboard.map((metric) => `
    <article class="metric-card" data-metric-key="${escapeHtml(metric.key)}">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.note)}</p>
    </article>
  `).join("");
}

async function loadCommercialDashboard() {
  try {
    const response = await fetch("/api/commercial-ai?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const alertCard = document.querySelector('[data-metric-key="ai-alerts"]');
    if (alertCard) {
      alertCard.querySelector("strong").textContent = summary.priorityToday;
      alertCard.querySelector("p").textContent = `${summary.analyzedToday} analyse(s) commerciale(s) aujourd'hui`;
    }
    if (!summary.latest) return;

    const actionsPanel = document.getElementById("panel-ai-actions");
    actionsPanel.innerHTML = `
      <div class="surface-header">
        <div>
          <p class="eyebrow">Commercial AI</p>
          <h2>Actions recommandées par l'IA</h2>
        </div>
        <span class="status status-active">${escapeHtml(summary.latest.classification)}</span>
      </div>
      <div class="commercial-dashboard-result">
        <strong>${escapeHtml(summary.latest.opportunityTitle)}</strong>
        <ol>
          ${summary.latest.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
        </ol>
        <a class="button button-primary button-inline" href="/admin/nexus/commercial-ai">Ouvrir Commercial AI</a>
      </div>
    `;

    const dailyPanel = document.getElementById("panel-daily-summary");
    const latestDate = formatDateTime(summary.latest.createdAt);
    dailyPanel.innerHTML = `
      <div class="surface-header">
        <div>
          <p class="eyebrow">Dernière analyse</p>
          <h2>Résumé du jour</h2>
        </div>
        <span class="status status-neutral">${escapeHtml(summary.latest.score)}/100</span>
      </div>
      <div class="commercial-dashboard-result">
        <strong>${escapeHtml(summary.latest.opportunityTitle)}</strong>
        <p>${escapeHtml(summary.latest.executiveSummary)}</p>
        <time datetime="${escapeHtml(summary.latest.createdAt || "")}">Dernière analyse : ${escapeHtml(latestDate)}</time>
      </div>
    `;
  } catch {
    // Les placeholders restent visibles si Commercial AI n'est pas disponible.
  }
}

async function loadProcurementDashboard() {
  try {
    const response = await fetch("/api/procurement-ai?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const supplierCard = document.querySelector('[data-metric-key="suppliers"]');
    if (!supplierCard) return;
    supplierCard.querySelector("strong").textContent = summary.suppliersToday;
    supplierCard.querySelector("p").textContent = summary.latest
      ? `Dernier sourcing : ${summary.latest.criteria.product}`
      : `${summary.searchesToday} recherche(s) Achats AI aujourd'hui`;
  } catch {
    // Le placeholder reste visible si Achats AI n'est pas disponible.
  }
}

async function loadTenderDashboard() {
  try {
    const response = await fetch("/api/tender-ai?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const tenderCard = document.querySelector('[data-metric-key="tenders"]');
    if (!tenderCard) return;
    tenderCard.querySelector("strong").textContent = summary.tendersToday;
    tenderCard.querySelector("p").textContent = summary.latest
      ? `${summary.latest.tenders.length} résultat(s) dans la dernière veille`
      : `${summary.searchesToday} veille(s) aujourd'hui`;
  } catch {
    // Le placeholder reste visible si Appels d'Offres AI n'est pas disponible.
  }
}

async function loadTenderResponseDashboard() {
  try {
    const response = await fetch(`/api/tender-response-ai?action=dashboard&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const responseCard = document.querySelector('[data-metric-key="tender-responses"]');
    if (!responseCard) return;
    responseCard.querySelector("strong").textContent = summary.preparedToday;
    responseCard.querySelector("p").textContent = summary.latest
      ? `${summary.latest.compliance.compliancePercent}% de conformité · ${summary.latest.keyInformation.client}`
      : `${summary.total} dossier(s) préparé(s)`;
    const evaluation = summary.latest?.keyInformation?.evaluation;
    if (!evaluation) return;
    const symbols = { respond: "✓", reserve: "⚠", decline: "✕" };
    document.getElementById("dashboard-tender-score").textContent = `${evaluation.globalScore}/100 · ${evaluation.probability}%`;
    document.getElementById("dashboard-tender-score").className = `status ${evaluation.color === "green" ? "status-active" : evaluation.color === "orange" ? "status-coming" : "status-neutral"}`;
    document.getElementById("dashboard-tender-decision").textContent = `${symbols[evaluation.decision.code] || "⚠"} ${evaluation.decision.label}`;
    document.getElementById("dashboard-tender-justification").textContent = evaluation.decision.justification;
  } catch {
    // Le placeholder reste visible si Réponse Appels d'Offres AI n'est pas disponible.
  }
}

async function loadSupplierAiDashboard() {
  try {
    const response = await fetch("/api/supplier-ai?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const values = {
      "supplier-ai-found": [summary.suppliersFound, "Fournisseurs documentés par Supplier AI"],
      "supplier-ai-rfq-prepared": [summary.rfqsPrepared, "Brouillons RFQ enregistrés"],
      "supplier-ai-rfq-sent": [summary.rfqsSent, "Envois confirmés par un utilisateur"],
      "supplier-ai-responses": [summary.responsesReceived, "Réponses fournisseurs enregistrées"],
      "supplier-ai-favorites": [summary.favorites, "Fournisseurs suivis"]
    };
    Object.entries(values).forEach(([key, value]) => {
      const card = document.querySelector(`[data-metric-key="${key}"]`);
      if (!card) return;
      card.querySelector("strong").textContent = value[0];
      card.querySelector("p").textContent = value[1];
    });
  } catch {
    // Les placeholders restent visibles si Fournisseurs AI n'est pas disponible.
  }
}

async function loadMiningDashboard() {
  try {
    const response = await fetch("/api/mining-watch?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const opportunityCard = document.querySelector('[data-metric-key="opportunities"]');
    if (!opportunityCard) return;
    opportunityCard.querySelector("strong").textContent = summary.signalsToday;
    opportunityCard.querySelector("p").textContent = summary.latest
      ? `${summary.latest.signals.length} signal(s) dans la derniere veille miniere`
      : `${summary.searchesToday} veille(s) miniere(s) aujourd'hui`;
  } catch {
    // Le placeholder reste visible si Veille Miniere AI n'est pas disponible.
  }
}

async function loadOrchestratorDashboard() {
  try {
    const response = await fetch("/api/nexus-orchestrator?action=dashboard");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    renderPipelineBoard(summary.pipeline);
    const values = {
      "orchestrator-active": [summary.activeWorkflows, "Workflows en cours ou à reprendre"],
      "orchestrator-opportunities": [summary.opportunitiesInProgress, "Opportunités prises en charge"],
      "orchestrator-agents": [summary.activeAgents, "Agents coordonnés par NEXUS"],
      "orchestrator-average": [
        summary.averageSeconds < 60 ? `${summary.averageSeconds} s` : `${Math.round(summary.averageSeconds / 60)} min`,
        "Temps moyen des workflows terminés"
      ],
      "orchestrator-value": [
        new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(summary.potentialValue || 0),
        "Valeur cumulée des dossiers"
      ],
      "orchestrator-alerts": [summary.criticalAlerts, "Workflows en pause ou en échec"]
    };
    Object.entries(values).forEach(([key, value]) => {
      const card = document.querySelector(`[data-metric-key="${key}"]`);
      if (!card) return;
      card.querySelector("strong").textContent = value[0];
      card.querySelector("p").textContent = value[1];
    });
    const workflowPanel = document.getElementById("panel-deadlines");
    if (workflowPanel && summary.recentWorkflows?.length) {
      const labels = {
        detected: "Détecté", analyzed: "Analysé", "suppliers-researched": "Fournisseurs recherchés",
        "rfqs-prepared": "RFQ préparées", "rfqs-sent": "RFQ envoyées",
        "offer-prepared": "Offre préparée", "validation-required": "Validation requise",
        "ready-to-send": "Envoi autorisé", submitted: "Soumis", pending: "En attente",
        won: "Gagné", lost: "Perdu", "purchase-order-received": "Bon de commande reçu",
        rejected: "Hors cible"
      };
      workflowPanel.innerHTML = `
        <div class="surface-header">
          <div><p class="eyebrow">Orchestrateur</p><h2>État des dossiers</h2></div>
          <span class="status status-active">Temps réel</span>
        </div>
        <div class="commercial-dashboard-result">
          <ol>${summary.recentWorkflows.map((workflow) => `<li><strong>${escapeHtml(workflow.title)}</strong> · ${escapeHtml(labels[workflow.pipelineStatus] || workflow.pipelineStatus)}</li>`).join("")}</ol>
          ${summary.latestValidation ? `<p><strong>Documents :</strong> ${escapeHtml(summary.latestValidation.documentSummary?.available || 0)}/${escapeHtml(summary.latestValidation.documentSummary?.total || 0)} disponibles · ${escapeHtml(summary.latestValidation.documentSummary?.toProcess || 0)} a traiter</p>
          <p><strong>RFQ :</strong> ${escapeHtml(summary.latestValidation.rfqSummary?.prepared || 0)} preparees · ${escapeHtml(summary.latestValidation.rfqSummary?.contactsVerified || 0)} coordonnee(s) verifiee(s) · ${escapeHtml(summary.latestValidation.rfqSummary?.sent || 0)} envoyee</p>
          <p><strong>Prix :</strong> ${escapeHtml(summary.latestValidation.pricingSummary?.quotationsReceived || 0)} cotation recue · Cout rendu ${escapeHtml(summary.latestValidation.pricingSummary?.landedCost || "EN ATTENTE")} · Marge ${escapeHtml(summary.latestValidation.pricingSummary?.margin || "EN ATTENTE")}</p>
          ${summary.latestValidation.uneceSubmissionReview ? `<div class="dashboard-unece-readiness">
            <p><strong>UNECA — CONDITIONS AVANT SOUMISSION</strong> · Avancement ${escapeHtml(summary.latestValidation.uneceSubmissionReview.progressPercent)}%</p>
            <ol>${summary.latestValidation.uneceSubmissionReview.conditions.map((condition, index) => `<li><strong>Condition ${escapeHtml(index + 1)} :</strong> ${escapeHtml(condition.title)} · ${escapeHtml(condition.status)}</li>`).join("")}</ol>
            <p><strong>Actions DG :</strong> ${escapeHtml(summary.latestValidation.uneceSubmissionReview.dgActions.join(" · "))}</p>
            ${summary.latestValidation.uneceEoiSubmission ? `<p><strong>Échéance :</strong> ${escapeHtml(summary.latestValidation.uneceEoiSubmission.deadline)} · <strong>UNGM :</strong> 673735</p>
            <p><strong>PRÊT :</strong> ${escapeHtml(summary.latestValidation.uneceEoiSubmission.readyItems.join(" · "))}</p>
            <p><strong>À VALIDER PAR MOI :</strong> ${escapeHtml(summary.latestValidation.uneceEoiSubmission.dgValidationItems.join(" · "))}</p>
            <p><strong>BLOCAGE :</strong> ${escapeHtml(summary.latestValidation.uneceEoiSubmission.blockingItem)}</p>
            <p><strong>RECOMMANDATION :</strong> ${escapeHtml(summary.latestValidation.uneceEoiSubmission.recommendation)}</p>` : ""}
          </div>` : ""}` : ""}
          <a class="button button-primary button-inline" href="/admin/nexus/orchestrator">Ouvrir l'orchestrateur</a>
        </div>
      `;
    }
  } catch {
    // Les placeholders restent visibles si l'orchestrateur n'est pas disponible.
  }
}

async function loadDocumentVaultDashboard() {
  const target = document.getElementById("vault-dashboard-content");
  const status = document.getElementById("vault-dashboard-status");
  try {
    const response = await fetch(`/api/document-vault?action=dashboard&_=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Coffre indisponible");
    const summary = payload.data;
    status.textContent = "Opérationnel";
    status.className = "status status-active";
    target.innerHTML = `
      <div class="commercial-dashboard-stats">
        <div><span>Documents totaux</span><strong>${escapeHtml(summary.total)}</strong></div>
        <div><span>Valides</span><strong>${escapeHtml(summary.valid)}</strong></div>
        <div><span>À vérifier</span><strong>${escapeHtml(summary.needsReview)}</strong></div>
        <div><span>Expirant bientôt</span><strong>${escapeHtml(summary.expiring)}</strong></div>
        <div><span>Expirés</span><strong>${escapeHtml(summary.expired)}</strong></div>
        <div><span>Expériences</span><strong>${escapeHtml(summary.experiences)}</strong></div>
        <div><span>AO utilisant le coffre</span><strong>${escapeHtml(summary.tendersUsingVault)}</strong></div>
      </div>
      <div class="vault-dashboard-actions">
        <a class="button button-primary button-inline" href="/admin/nexus/document-vault#vault-upload-form">+ AJOUTER UN DOCUMENT</a>
        <a class="button button-secondary button-inline" href="/admin/nexus/document-vault">VOIR LE COFFRE</a>
        <a class="button button-secondary button-inline" href="/admin/nexus/document-vault?category=04-experience-references">EXPÉRIENCES</a>
        <a class="button button-secondary button-inline" href="/admin/nexus/document-vault?status=expiring">DOCUMENTS EXPIRANTS</a>
      </div>`;
  } catch (error) {
    status.textContent = "Indisponible";
    status.className = "status status-coming";
    target.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function loadCrmDashboard() {
  try {
    const response = await fetch(`/api/crm?action=dashboard&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.ok) return;
    const summary = payload.data;
    const metrics = {
      clients: [summary.clients, "Clients actifs dans le CRM central"],
      suppliers: [summary.suppliers, "Fournisseurs et fabricants centralisés"]
    };
    Object.entries(metrics).forEach(([key, value]) => {
      const card = document.querySelector(`[data-metric-key="${key}"]`);
      if (!card) return;
      card.querySelector("strong").textContent = value[0];
      card.querySelector("p").textContent = value[1];
    });
    const panel = document.getElementById("panel-crm-summary");
    panel.innerHTML = `
      <div class="surface-header">
        <div><p class="eyebrow">CRM IA central</p><h2>Portefeuille relationnel</h2></div>
        <span class="status status-active">Synchronisé</span>
      </div>
      <div class="commercial-dashboard-result">
        <p><strong>${escapeHtml(summary.clients)}</strong> client(s) · <strong>${escapeHtml(summary.prospects)}</strong> prospect(s) · <strong>${escapeHtml(summary.suppliers)}</strong> fournisseur(s)</p>
        <p>Prospects chauds : ${escapeHtml(summary.hotProspects?.length || 0)} · Clients à réactiver : ${escapeHtml(summary.inactive_clients || 0)} · AO en cours : ${escapeHtml(summary.tenders || 0)}</p>
        <a class="button button-primary button-inline" href="/admin/nexus/crm">Ouvrir le CRM</a>
      </div>`;
  } catch {
    // Le panneau reste en attente si la migration CRM n'est pas disponible.
  }
}

function renderExecutivePanels() {
  bootstrap.executivePanels.forEach((panel) => {
    const target = document.getElementById(`panel-${panel.key}`);
    if (!target) return;
    target.innerHTML = `
      <div class="surface-header">
        <div>
          <p class="eyebrow">${escapeHtml(panel.eyebrow)}</p>
          <h2>${escapeHtml(panel.title)}</h2>
        </div>
        <span class="status status-neutral">${escapeHtml(panel.statusLabel)}</span>
      </div>
      <div class="executive-empty">
        <strong>${escapeHtml(panel.emptyTitle)}</strong>
        <p>${escapeHtml(panel.emptyText)}</p>
      </div>
    `;
  });
}

function renderModules() {
  const target = document.getElementById("module-grid");
  target.innerHTML = bootstrap.modules.map((module) => {
    const statusClass = module.status === "active" ? "status-active" : "status-coming";
    const action = module.route
      ? `<a class="button button-primary" href="${escapeHtml(module.route)}">Ouvrir le module</a>`
      : "";
    return `
      <article class="module-card">
        <span class="status ${statusClass}">${escapeHtml(module.statusLabel)}</span>
        <h3>${escapeHtml(module.name)}</h3>
        <p>${escapeHtml(module.description || "Module prévu dans une phase ultérieure.")}</p>
        ${action}
      </article>
    `;
  }).join("");
}

function renderRoles() {
  const target = document.getElementById("role-grid");
  target.innerHTML = bootstrap.roles.map((role) => `
    <article class="role-card">
      <span class="status status-neutral">Rôle prévu</span>
      <h3>${escapeHtml(role.name)}</h3>
      <p>${escapeHtml(role.scope)}</p>
      <ul>
        ${role.permissions.map((permission) => `<li>${escapeHtml(permission)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

function renderSettings() {
  const target = document.getElementById("settings-list");
  target.innerHTML = bootstrap.settings.map((setting) => `
    <article class="setting-item">
      <div>
        <h3>${escapeHtml(setting.name)}</h3>
        <p>${escapeHtml(setting.description)}</p>
      </div>
      <span class="status status-neutral">${escapeHtml(setting.statusLabel)}</span>
    </article>
  `).join("");
}

function deliveryStatusLabel(status) {
  return ({
    accepted: "Accepté", sent: "Envoyé", delivered: "Livré", deferred: "En attente",
    bounced: "Bounce", complained: "Plainte", suppressed: "Supprimé", blocked: "Bloqué", failed: "Échec"
  })[status] || status;
}

async function loadEmailDeliveryJournal() {
  const target = document.getElementById("activity-journal");
  const summaryTarget = document.getElementById("email-delivery-summary");
  const statusTarget = document.getElementById("email-delivery-status");
  try {
    const response = await fetch("/api/email-delivery");
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Journal indisponible");
    const { events, totals } = payload.data;
    statusTarget.textContent = totals.alerts ? `${totals.alerts} alerte(s)` : "Opérationnel";
    statusTarget.className = `status ${totals.alerts ? "status-coming" : "status-active"}`;
    summaryTarget.innerHTML = [
      ["30 jours", totals.total], ["Livrés", totals.delivered], ["En cours", totals.pending],
      ["Différés", totals.deferred], ["Alertes", totals.alerts]
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    if (!events.length) return;
    target.className = "delivery-journal";
    target.innerHTML = events.map((event) => `
      <article class="delivery-entry ${["bounced", "complained", "suppressed", "blocked", "failed", "deferred"].includes(event.status) ? "has-alert" : ""}">
        <div>
          <strong>${escapeHtml(event.subject || "Sans objet")}</strong>
          <p>${escapeHtml(event.recipient)} · ${escapeHtml(event.provider)}</p>
        </div>
        <div class="delivery-entry-meta">
          <span class="status ${event.status === "delivered" ? "status-active" : "status-neutral"}">${escapeHtml(deliveryStatusLabel(event.status))}</span>
          <time>${escapeHtml(new Date(event.event_at || event.created_at).toLocaleString("fr-FR"))}</time>
        </div>
        ${event.error_message ? `<p class="delivery-error">${escapeHtml(event.error_code || "Erreur")}: ${escapeHtml(event.error_message)}</p>` : ""}
      </article>
    `).join("");
  } catch (error) {
    statusTarget.textContent = "Indisponible";
    statusTarget.className = "status status-coming";
    target.innerHTML = `<strong>Journal indisponible</strong><p>${escapeHtml(error.message)}</p>`;
  }
}

function showView(viewName) {
  const titles = {
    dashboard: "Tableau de bord",
    modules: "Modules",
    administration: "Administration",
    settings: "Paramètres"
  };

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const visible = panel.dataset.viewPanel === viewName;
    panel.hidden = !visible;
    panel.classList.toggle("is-visible", visible);
  });

  document.querySelectorAll("button[data-view]").forEach((item) => {
    const active = item.dataset.view === viewName;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  viewTitle.textContent = titles[viewName] || titles.dashboard;
  document.getElementById("nexus-main").focus({ preventScroll: true });
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
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Connexion impossible.");
    if (result.passwordChangeRequired && result.resetToken) {
      window.location.assign(`/admin/nexus/reset-password?token=${encodeURIComponent(result.resetToken)}&returnTo=%2Fadmin%2Fnexus`);
      return;
    }
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    showView("dashboard");
    loadCommercialDashboard();
    loadProcurementDashboard();
    loadTenderDashboard();
    loadTenderResponseDashboard();
    loadSupplierAiDashboard();
    loadMiningDashboard();
    loadOrchestratorDashboard();
    loadCrmDashboard();
    loadEmailDeliveryJournal();
    loadDocumentVaultDashboard();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

async function logout() {
  await fetch("/api/business-radar-auth", { method: "DELETE" });
  setAuthenticated(false);
  document.getElementById("email").focus();
}

renderDashboard();
renderExecutivePanels();
renderModules();
renderRoles();
renderSettings();
setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") {
  loadCommercialDashboard();
  loadProcurementDashboard();
  loadTenderDashboard();
  loadTenderResponseDashboard();
  loadSupplierAiDashboard();
  loadMiningDashboard();
  loadOrchestratorDashboard();
  loadCrmDashboard();
  loadEmailDeliveryJournal();
  loadDocumentVaultDashboard();
}

loginForm.addEventListener("submit", authenticate);
logoutButton.addEventListener("click", logout);
document.querySelectorAll("button[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});
