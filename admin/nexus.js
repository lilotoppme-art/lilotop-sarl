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

function setAuthenticated(authenticated) {
  body.dataset.authenticated = String(authenticated);
  loginScreen.hidden = authenticated;
  nexusShell.hidden = !authenticated;
  document.title = `${authenticated ? "NEXUS AI" : "Connexion NEXUS AI"} | LILOTOP SARL`;
}

function renderDashboard() {
  const target = document.getElementById("dashboard-metrics");
  target.innerHTML = bootstrap.dashboard.map((metric) => `
    <article class="metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.note)}</p>
    </article>
  `).join("");
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
    loginForm.reset();
    loginStatus.textContent = "";
    setAuthenticated(true);
    showView("dashboard");
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

loginForm.addEventListener("submit", authenticate);
logoutButton.addEventListener("click", logout);
document.querySelectorAll("button[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});
