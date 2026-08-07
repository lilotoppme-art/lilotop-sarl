"use strict";

const body = document.body;
const loginScreen = document.getElementById("crm-login");
const shell = document.getElementById("crm-shell");
const loginForm = document.getElementById("crm-login-form");
const loginStatus = document.getElementById("crm-login-status");
const globalStatus = document.getElementById("crm-status");
const drawer = document.getElementById("organization-drawer");
const organizationForm = document.getElementById("organization-form");
const state = { organizations: [], selected: null, detailTab: "timeline", dashboard: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeUrl(value) {
  try { const url = new URL(String(value || "")); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function typeLabel(value) {
  return ({ client: "Client", prospect: "Prospect", supplier: "Fournisseur", manufacturer: "Fabricant",
    distributor: "Distributeur", partner: "Partenaire", bank: "Banque", investor: "Investisseur",
    administration: "Administration", "international-organization": "Organisation internationale" })[value] || value;
}

function interactionLabel(value) {
  return ({ email: "E-mail", call: "Appel", whatsapp: "WhatsApp", meeting: "Réunion", tender: "Appel d'offres",
    contract: "Contrat", quote: "Devis", invoice: "Facture", "purchase-order": "Bon de commande",
    payment: "Paiement", document: "Document", note: "Note" })[value] || value;
}

async function crmApi(action, options = {}) {
  const params = new URLSearchParams({ action, ...(options.params || {}) });
  params.set("_", Date.now());
  const response = await fetch(`/api/crm?${params}`, {
    method: options.method || "GET", credentials: "same-origin", cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "CRM indisponible.");
  return payload.data;
}

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  shell.hidden = !authenticated;
}

function setStatus(message, error = false) {
  globalStatus.textContent = message;
  globalStatus.style.color = error ? "#a63d40" : "#5d6b78";
}

function rankMarkup(items, scoreKey = "priority") {
  return items?.length ? items.map((item) => `<article class="rank-item" data-open-organization="${escapeHtml(item.id)}">
    <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(typeLabel(item.organizationType))} · ${escapeHtml(item.country || "Pays à confirmer")}</small></div>
    <span class="score-chip">${escapeHtml(item.scores?.[scoreKey] || 0)}</span></article>`).join("")
    : '<div class="empty-state"><p>Aucune donnée synchronisée.</p></div>';
}

function renderDashboard(summary) {
  state.dashboard = summary;
  ["clients", "prospects", "suppliers", "partners", "tenders", "contracts", "followups", "meetings"].forEach((key) => {
    const target = document.querySelector(`[data-metric="${key}"]`);
    if (target) target.textContent = summary[key] || 0;
  });
  document.getElementById("pipeline-value").textContent = summary.pipeline_value || 0;
  document.getElementById("inactive-clients").textContent = summary.inactive_clients || 0;
  document.getElementById("expiring-contracts").textContent = summary.expiringContracts || 0;
  document.getElementById("hot-prospects").innerHTML = rankMarkup(summary.hotProspects);
  document.getElementById("top-clients").innerHTML = rankMarkup(summary.topClients, "value");
  document.getElementById("top-suppliers").innerHTML = rankMarkup(summary.topSuppliers);
}

function renderOrganizations() {
  document.getElementById("organization-count").textContent = `${state.organizations.length} fiche(s)`;
  document.getElementById("organization-list").innerHTML = state.organizations.length ? state.organizations.map((item) => `
    <article class="organization-card ${state.selected?.organization?.id === item.id ? "is-active" : ""}" data-open-organization="${escapeHtml(item.id)}">
      <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.country || "Pays à confirmer")} · ${escapeHtml(item.sector || "Secteur à qualifier")}</p></div>
      <div><span class="type-badge">${escapeHtml(typeLabel(item.organizationType))}</span><span class="score-chip">${escapeHtml(item.scores.priority)}</span></div>
    </article>`).join("") : '<div class="empty-state"><strong>Aucune organisation</strong><p>Créez une fiche ou lancez une synchronisation depuis un agent.</p></div>';
}

function contactMarkup(person) {
  return `<article class="contact-card"><strong>${escapeHtml(person.fullName)}</strong>${person.isDecisionMaker ? ' <span class="tag">Décideur</span>' : ""}
    <p>${escapeHtml(person.jobTitle || "Fonction à préciser")} · Influence ${escapeHtml(person.influence)}/100</p>
    <small>${escapeHtml(person.email || person.phone || "Coordonnées à compléter")}</small></article>`;
}

function timelineMarkup(item) {
  return `<article class="timeline-item"><time>${escapeHtml(formatDate(item.occurredAt))}</time><div><strong>${escapeHtml(interactionLabel(item.interactionType))}${item.subject ? ` · ${escapeHtml(item.subject)}` : ""}</strong><p>${escapeHtml(item.summary)}</p><small>${escapeHtml(item.sourceModule)}</small></div></article>`;
}

function detailContent(detail) {
  const item = detail.organization;
  const website = safeUrl(item.website);
  const tabs = ["timeline", "contacts", "documents", "scores", "merge"];
  let content = "";
  if (state.detailTab === "contacts") content = `${detail.people.length ? detail.people.map(contactMarkup).join("") : '<p>Aucun contact enregistré.</p>'}
    <form class="inline-form" id="person-form"><input type="hidden" name="organizationId" value="${escapeHtml(item.id)}"><label>Nom<input name="fullName" required></label><label>Fonction<input name="jobTitle"></label><label>E-mail<input name="email" type="email"></label><label>Téléphone<input name="phone"></label><label>WhatsApp<input name="whatsapp"></label><label>LinkedIn<input name="linkedin" type="url"></label><label>Influence<input name="influence" type="number" min="0" max="100" value="50"></label><label><span>Décideur</span><input name="isDecisionMaker" type="checkbox"></label><label class="span-2">Commentaires<textarea name="comments" rows="2"></textarea></label><button class="button button-primary span-2" type="submit">Ajouter le contact</button></form>`;
  else if (state.detailTab === "documents") content = detail.documents.length ? detail.documents.map((doc) => `<article class="contact-card"><strong>${escapeHtml(doc.title)}</strong><p>${escapeHtml(doc.document_type)} · ${escapeHtml(doc.status)}</p><small>Expiration: ${escapeHtml(doc.expires_on || "sans échéance")}</small></article>`).join("") : '<p>Aucun document associé. Les documents du Coffre seront liés par les agents.</p>';
  else if (state.detailTab === "scores") content = `<div class="score-grid">${Object.entries(item.scores).map(([key, value]) => `<article><span>${escapeHtml(({value:"Valeur",potential:"Potentiel",probability:"Probabilité",history:"Historique",risk:"Risque",priority:"Priorité"})[key])}</span><strong>${escapeHtml(value)}/100</strong></article>`).join("")}</div><p>Les scores sont recalculés après chaque interaction synchronisée. Le risque augmente avec l’inactivité; aucun montant commercial n’est inventé.</p>`;
  else if (state.detailTab === "merge") content = `<form class="inline-form" id="merge-form"><input type="hidden" name="targetId" value="${escapeHtml(item.id)}"><label class="span-2">Doublon à fusionner<select name="sourceId" required><option value="">Sélectionner</option>${state.organizations.filter((candidate) => candidate.id !== item.id).map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.name)}</option>`).join("")}</select></label><p class="span-2">Les contacts, interactions et documents seront transférés. La fiche source sera archivée et la fusion journalisée.</p><button class="button button-primary span-2" type="submit">Fusionner les fiches</button></form>`;
  else content = `${detail.interactions.length ? detail.interactions.map(timelineMarkup).join("") : '<p>Aucune interaction enregistrée.</p>'}
    <form class="inline-form" id="interaction-form"><input type="hidden" name="organizationId" value="${escapeHtml(item.id)}"><label>Type<select name="interactionType"><option value="email">E-mail</option><option value="call">Appel</option><option value="whatsapp">WhatsApp</option><option value="meeting">Réunion</option><option value="tender">Appel d'offres</option><option value="contract">Contrat</option><option value="quote">Devis</option><option value="invoice">Facture</option><option value="purchase-order">Bon de commande</option><option value="payment">Paiement</option><option value="document">Document</option><option value="note">Note</option></select></label><label>Direction<select name="direction"><option value="internal">Interne</option><option value="inbound">Reçu</option><option value="outbound">Envoyé</option></select></label><label class="span-2">Objet<input name="subject"></label><label class="span-2">Résumé<textarea name="summary" required rows="3"></textarea></label><button class="button button-primary span-2" type="submit">Ajouter à la timeline</button></form>`;
  return `<div class="detail-header"><div><p class="eyebrow">${escapeHtml(typeLabel(item.organizationType))}</p><h2>${escapeHtml(item.name)}</h2><div class="detail-meta"><span>${escapeHtml(item.country || "Pays à confirmer")}</span><span>${escapeHtml(item.city || "")}</span>${item.email ? `<a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a>` : ""}${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">Site web</a>` : ""}</div></div><button class="button button-secondary" type="button" data-edit-organization="${escapeHtml(item.id)}">Modifier</button></div>
    <div class="tag-row">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="score-grid">${Object.entries(item.scores).map(([key, value]) => `<article><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}</div>
    <nav class="detail-tabs" aria-label="Fiche CRM">${tabs.map((tab) => `<button class="${state.detailTab === tab ? "is-active" : ""}" data-detail-tab="${tab}" type="button">${escapeHtml(({timeline:"Timeline",contacts:"Contacts",documents:"Documents",scores:"Scores",merge:"Fusion"})[tab])}</button>`).join("")}</nav>
    <div id="detail-tab-content">${content}</div>`;
}

function renderDetail() {
  document.getElementById("organization-detail").innerHTML = state.selected ? detailContent(state.selected) : '<div class="empty-state"><strong>Sélectionnez une organisation</strong><p>La fiche, les contacts, les scores et la timeline apparaîtront ici.</p></div>';
}

function renderActivity(items) {
  document.getElementById("crm-activity").innerHTML = items.length ? items.map((item) => `<article class="activity-entry"><strong>${escapeHtml(item.event_type)} · ${escapeHtml(item.entity_type)}</strong><p>${escapeHtml(item.organization_name || item.entity_id || "Système")}</p><small>${escapeHtml(item.actor_email)} · ${escapeHtml(formatDate(item.created_at))} · ${escapeHtml(item.source_module)}</small></article>`).join("") : '<div class="empty-state"><p>Le journal est vide.</p></div>';
}

async function loadDashboard() { renderDashboard(await crmApi("dashboard")); }
async function loadOrganizations(filters = {}) {
  state.organizations = await crmApi("organizations", { params: { limit: 40, ...filters } });
  renderOrganizations();
}
async function loadActivity() { renderActivity(await crmApi("activity")); }

async function openOrganization(id) {
  setStatus("Chargement de la fiche…"); state.selected = await crmApi("organization", { params: { id } }); renderOrganizations(); renderDetail(); setStatus("Fiche synchronisée.");
}

function openDrawer(item = null) {
  organizationForm.reset();
  document.getElementById("organization-form-title").textContent = item ? "Modifier l'organisation" : "Nouvelle organisation";
  if (item) Object.entries(item).forEach(([key, value]) => {
    const input = organizationForm.elements[key]; if (!input) return;
    input.value = Array.isArray(value) ? value.join(", ") : value ?? "";
  });
  drawer.hidden = false;
  organizationForm.elements.name.focus();
}

function closeDrawer() { drawer.hidden = true; }

function showView(name) {
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name));
  if (name === "organizations") loadOrganizations();
  if (name === "activity") loadActivity();
}

async function authenticate(event) {
  event.preventDefault(); loginStatus.textContent = "Connexion en cours…";
  const data = new FormData(loginForm);
  try {
    const response = await fetch("/api/business-radar-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Connexion impossible.");
    loginForm.reset(); loginStatus.textContent = ""; setAuthenticated(true); await loadDashboard();
  } catch (error) { loginStatus.textContent = error.message; }
}

loginForm.addEventListener("submit", authenticate);
document.getElementById("crm-logout").addEventListener("click", async () => { await fetch("/api/business-radar-auth", { method: "DELETE" }); setAuthenticated(false); });
document.getElementById("new-organization").addEventListener("click", () => openDrawer());
document.getElementById("sync-agents").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setStatus("Synchronisation des agents en cours...");
  try {
    const result = await crmApi("sync-existing", { method: "POST", body: {} });
    await Promise.all([loadDashboard(), loadOrganizations()]);
    setStatus(`Synchronisation termin\u00e9e: ${result.opportunities} opportunit\u00e9(s), ${result.supplierSearches} fournisseur(s).`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", closeDrawer));
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.getElementById("refresh-activity").addEventListener("click", loadActivity);
document.getElementById("crm-search-form").addEventListener("submit", async (event) => { event.preventDefault(); await loadOrganizations(Object.fromEntries(new FormData(event.currentTarget))); });
organizationForm.addEventListener("submit", async (event) => {
  event.preventDefault(); setStatus("Enregistrement…");
  try { const saved = await crmApi("organization", { method: "POST", body: Object.fromEntries(new FormData(organizationForm)) }); closeDrawer(); await Promise.all([loadDashboard(), loadOrganizations()]); await openOrganization(saved.id); setStatus("Fiche enregistrée."); }
  catch (error) { setStatus(error.message, true); }
});

document.addEventListener("click", async (event) => {
  const openTarget = event.target.closest("[data-open-organization]");
  if (openTarget) { showView("organizations"); await openOrganization(openTarget.dataset.openOrganization); return; }
  const editTarget = event.target.closest("[data-edit-organization]");
  if (editTarget && state.selected) { openDrawer(state.selected.organization); return; }
  const tabTarget = event.target.closest("[data-detail-tab]");
  if (tabTarget) { state.detailTab = tabTarget.dataset.detailTab; renderDetail(); }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "person-form") {
    event.preventDefault(); try { const data = Object.fromEntries(new FormData(event.target)); data.isDecisionMaker = event.target.elements.isDecisionMaker.checked; await crmApi("person", { method: "POST", body: data }); await openOrganization(data.organizationId); setStatus("Contact ajouté."); } catch (error) { setStatus(error.message, true); }
  }
  if (event.target.id === "interaction-form") {
    event.preventDefault(); try { const data = Object.fromEntries(new FormData(event.target)); await crmApi("interaction", { method: "POST", body: data }); await Promise.all([openOrganization(data.organizationId), loadDashboard()]); setStatus("Timeline mise à jour."); } catch (error) { setStatus(error.message, true); }
  }
  if (event.target.id === "merge-form") {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
    try { const merged = await crmApi("merge", { method: "POST", body: data }); await loadOrganizations(); await openOrganization(merged.id); setStatus("Doublons fusionnés et journalisés."); } catch (error) { setStatus(error.message, true); }
  }
});

setAuthenticated(body.dataset.authenticated === "true");
if (body.dataset.authenticated === "true") loadDashboard().catch((error) => setStatus(error.message, true));
