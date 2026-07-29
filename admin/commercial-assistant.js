"use strict";

const assistantState = {
  view: "pipeline",
  items: [],
  selected: null
};

const assistantLabels = {
  email: ["Analyser un e-mail autorisé", "Analyser avec l'IA"],
  tender: ["Analyser un appel d'offres", "Préparer les brouillons"],
  offer: ["Préparer une offre commerciale", "Préparer l'offre"],
  quote: ["Préparer un devis", "Créer le devis brouillon"],
  followup: ["Préparer une relance", "Préparer la relance"]
};

function assistantEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function assistantApi(action, options = {}) {
  const response = await fetch(`/api/commercial-ai?action=${encodeURIComponent(action)}${options.query || ""}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible");
  return payload.data;
}

function assistantStatus(message, error = false) {
  const target = document.getElementById("commercial-status");
  target.textContent = message;
  target.classList.toggle("error", error);
}

function assistantFormatDate(value) {
  if (!value) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function assistantList(targetId, items) {
  const target = document.getElementById(targetId);
  target.innerHTML = (items || []).length
    ? items.map((item) => `<li>${assistantEscape(item)}</li>`).join("")
    : "<li>Aucun élément.</li>";
}

function renderAssistantResult(item) {
  assistantState.selected = item;
  const output = item.outputData || {};
  document.getElementById("assistant-result-empty").hidden = true;
  document.getElementById("assistant-result-content").hidden = false;
  document.getElementById("assistant-result-title").textContent = item.title;
  document.getElementById("assistant-validation-status").textContent =
    item.validationStatus === "approved" ? "Approuvé" :
      item.validationStatus === "rejected" ? "Rejeté" : "Validation requise";
  document.getElementById("assistant-classification").textContent = output.classification || "—";
  document.getElementById("assistant-urgency").textContent = output.urgency || "—";
  document.getElementById("assistant-summary").textContent = output.summary || "—";
  document.getElementById("assistant-subject").textContent = output.suggestedSubject || "—";
  document.getElementById("assistant-draft").textContent = output.draftBody || "—";
  assistantList("assistant-requested-actions", output.requestedActions);
  assistantList("assistant-checklist", [...(output.requirements || []), ...(output.checklist || [])]);
  assistantList("assistant-missing-items", output.missingItems);
  assistantList("assistant-commercial-conditions", output.commercialConditions);
  assistantList("assistant-recommended-actions", output.recommendedActions);
  document.getElementById("assistant-financial-status").textContent = output.financialDraftStatus || "";
  const locked = item.validationStatus !== "pending";
  document.getElementById("approve-assistant-draft").disabled = locked;
  document.getElementById("reject-assistant-draft").disabled = locked;
}

function filteredAssistantItems() {
  if (assistantState.view === "drafts") return assistantState.items;
  if (assistantState.view === "approvals") {
    return assistantState.items.filter((item) => item.validationStatus === "pending");
  }
  return assistantState.items.filter((item) => item.workType === assistantState.view);
}

function renderAssistantItems() {
  const items = filteredAssistantItems();
  const target = document.getElementById("assistant-work-list");
  if (!items.length) {
    target.innerHTML = '<p class="empty-message">Aucun élément enregistré dans cet espace.</p>';
    return;
  }
  target.innerHTML = items.map((item) => `
    <button class="assistant-work-item" type="button" data-assistant-item="${assistantEscape(item.id)}">
      <span><strong>${assistantEscape(item.title)}</strong><small>${assistantEscape(item.workType)} · ${assistantEscape(assistantFormatDate(item.createdAt))}</small></span>
      <span class="validation-chip">${assistantEscape(item.validationStatus)}</span>
    </button>
  `).join("");
}

async function loadAssistantItems() {
  assistantState.items = await assistantApi("work-items", { query: "&limit=200" });
  renderAssistantItems();
}

async function loadAssistantTasks() {
  const tasks = await assistantApi("tasks");
  document.getElementById("assistant-task-list").innerHTML = tasks.length
    ? tasks.map((task) => `
      <article class="assistant-list-entry">
        <strong>${assistantEscape(task.title)}</strong>
        <span>${assistantEscape(task.description || "")}</span>
        <small>${assistantEscape(assistantFormatDate(task.dueAt))} · ${assistantEscape(task.status)}</small>
      </article>
    `).join("")
    : '<p class="empty-message">Aucune tâche commerciale.</p>';
}

async function loadAssistantActivity() {
  const entries = await assistantApi("activity");
  document.getElementById("assistant-activity-list").innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="assistant-list-entry">
        <strong>${assistantEscape(entry.eventType)}</strong>
        <span>${assistantEscape(entry.actor)}</span>
        <small>${assistantEscape(assistantFormatDate(entry.createdAt))}</small>
      </article>
    `).join("")
    : '<p class="empty-message">Le journal est vide.</p>';
}

async function loadGmailConfig() {
  const config = await assistantApi("gmail-config");
  document.getElementById("gmail-oauth-status").textContent = config.configured
    ? "OAuth configuré · consentement requis"
    : "OAuth prêt · variables Vercel requises";
}

function setAssistantView(view) {
  assistantState.view = view;
  const pipeline = view === "pipeline";
  document.getElementById("commercial-pipeline-view").hidden = !pipeline;
  document.getElementById("commercial-assistant-view").hidden = pipeline;
  document.querySelectorAll("[data-commercial-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.commercialView === view);
  });
  if (pipeline) return;

  const workType = assistantLabels[view] ? view : "email";
  document.getElementById("assistant-work-type").value = workType;
  document.getElementById("assistant-form-title").textContent =
    assistantLabels[workType]?.[0] || "Assistant commercial";
  document.getElementById("assistant-submit").textContent =
    assistantLabels[workType]?.[1] || "Préparer le brouillon";
  document.getElementById("assistant-consent-row").hidden = workType !== "email";
  document.getElementById("assistant-sender-field").hidden = workType !== "email";
  document.getElementById("assistant-compose-panel").hidden =
    ["tasks", "history", "approvals", "drafts"].includes(view);
  document.getElementById("assistant-task-panel").hidden = view !== "tasks";
  document.getElementById("assistant-activity-panel").hidden = view !== "history";
  document.getElementById("assistant-work-list-panel").hidden = ["tasks", "history"].includes(view);
  document.getElementById("assistant-list-title").textContent =
    view === "approvals" ? "Validations en attente" :
      view === "drafts" ? "Tous les brouillons" : "Éléments récents";
  renderAssistantItems();
  if (view === "tasks") loadAssistantTasks().catch((error) => assistantStatus(error.message, true));
  if (view === "history") loadAssistantActivity().catch((error) => assistantStatus(error.message, true));
}

async function prepareAssistantWork(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const type = data.get("type");
  if (type === "email" && !document.getElementById("assistant-content-authorized").checked) {
    assistantStatus("Confirmez l'autorisation explicite avant d'analyser cet e-mail.", true);
    return;
  }
  assistantStatus("Préparation OpenAI en cours…");
  try {
    const item = await assistantApi("prepare", {
      method: "POST",
      body: {
        type,
        title: data.get("title"),
        language: data.get("language"),
        sender: data.get("sender"),
        content: data.get("content"),
        attachments: String(data.get("attachments") || "").split(",").map((value) => value.trim()).filter(Boolean),
        dueDate: data.get("dueDate"),
        authorizedContent: type === "email"
          ? document.getElementById("assistant-content-authorized").checked
          : false,
        validatedCommercialData: data.get("validatedCommercialData") === "on"
      }
    });
    await loadAssistantItems();
    renderAssistantResult(item);
    assistantStatus("Brouillon créé. Validation humaine obligatoire avant toute action.");
  } catch (error) {
    assistantStatus(error.message, true);
  }
}

async function validateAssistantWork(decision) {
  if (!assistantState.selected) return;
  try {
    const item = await assistantApi("validate", {
      method: "POST",
      body: { id: assistantState.selected.id, decision }
    });
    await loadAssistantItems();
    renderAssistantResult(item);
    assistantStatus(decision === "approved" ? "Brouillon approuvé et journalisé." : "Brouillon rejeté et journalisé.");
  } catch (error) {
    assistantStatus(error.message, true);
  }
}

function downloadAssistantDraft() {
  if (!assistantState.selected) return;
  const output = assistantState.selected.outputData || {};
  const content = [
    assistantState.selected.title,
    output.suggestedSubject ? `Objet: ${output.suggestedSubject}` : "",
    "",
    output.draftBody || ""
  ].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  link.download = `brouillon-${assistantState.selected.id}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function createAssistantTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await assistantApi("task", {
      method: "POST",
      body: {
        title: data.get("title"),
        description: data.get("description"),
        dueAt: data.get("dueAt") || null
      }
    });
    form.reset();
    await loadAssistantTasks();
    assistantStatus("Tâche créée et journalisée.");
  } catch (error) {
    assistantStatus(error.message, true);
  }
}

document.querySelector(".commercial-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-commercial-view]");
  if (button) setAssistantView(button.dataset.commercialView);
});
document.getElementById("assistant-work-form").addEventListener("submit", prepareAssistantWork);
document.getElementById("assistant-task-form").addEventListener("submit", createAssistantTask);
document.getElementById("refresh-assistant-list").addEventListener("click", () => {
  loadAssistantItems().catch((error) => assistantStatus(error.message, true));
});
document.getElementById("assistant-work-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-assistant-item]");
  if (!button) return;
  const item = assistantState.items.find((entry) => entry.id === button.dataset.assistantItem);
  if (item) renderAssistantResult(item);
});
document.getElementById("approve-assistant-draft").addEventListener("click", () => validateAssistantWork("approved"));
document.getElementById("reject-assistant-draft").addEventListener("click", () => validateAssistantWork("rejected"));
document.getElementById("download-assistant-draft").addEventListener("click", downloadAssistantDraft);

async function initializeAssistant() {
  if (document.body.dataset.authenticated !== "true") return;
  try {
    await Promise.all([loadAssistantItems(), loadGmailConfig()]);
  } catch (error) {
    assistantStatus(error.message, true);
  }
}

document.addEventListener("commercial-auth-changed", (event) => {
  if (event.detail.authenticated) initializeAssistant();
});
initializeAssistant();
