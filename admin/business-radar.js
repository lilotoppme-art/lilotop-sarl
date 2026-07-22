(() => {
  const authenticated = document.body.dataset.authenticated === "true";
  const loginView = document.querySelector("[data-login-view]");
  const appShell = document.querySelector("[data-app-shell]");
  loginView.style.display = authenticated ? "none" : "grid";
  appShell.style.display = authenticated ? "flex" : "none";

  if (!authenticated) {
    const form = document.querySelector("[data-login-form]");
    const status = document.querySelector("[data-login-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Connexion...";
      status.className = "form-status";
      const response = await fetch("/api/business-radar-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { status.textContent = body.error || "Connexion impossible"; status.className = "form-status error"; return; }
      location.reload();
    });
    return;
  }

  const state = { overview: null, opportunities: [], sources: [], registrations: [], analysis: null, detail: null };
  const statusEl = document.querySelector("[data-global-status]");
  const savedFilters = JSON.parse(sessionStorage.getItem("businessRadarFilters") || "{}");
  const filters = { search: savedFilters.search || "", status: savedFilters.status || "", sort: savedFilters.sort || "score", favorite: Boolean(savedFilters.favorite) };

  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function date(value, withTime = false) { return value ? new Intl.DateTimeFormat("fr-FR", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value)) : "Non precisee"; }
  function number(value) { return new Intl.NumberFormat("fr-FR").format(Number(value) || 0); }
  function remaining(value) {
    if (!value) return { label: "Sans echeance", level: "none" };
    const hours = (new Date(value).getTime() - Date.now()) / 3600000;
    if (hours < 0) return { label: "Echue", level: "critical" };
    if (hours <= 72) return { label: `${Math.ceil(hours)} h`, level: "critical" };
    if (hours <= 168) return { label: `${Math.ceil(hours / 24)} j`, level: "warning" };
    return { label: date(value), level: "normal" };
  }
  function empty(columns, message) { return `<tr><td colspan="${columns}" class="empty">${esc(message)}</td></tr>`; }
  function setStatus(message = "", error = false) { statusEl.textContent = message; statusEl.className = `global-status${error ? " error" : ""}`; }
  function setLoading(loading) { document.body.classList.toggle("is-loading", loading); document.querySelectorAll("button").forEach((button) => { if (button.dataset.runRadar) button.disabled = loading; }); }

  async function api(action, options = {}) {
    const response = await fetch(`/api/business-radar?action=${encodeURIComponent(action)}${options.query || ""}`, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => ({ ok: false, error: "Reponse serveur invalide" }));
    if (response.status === 401) { location.reload(); throw new Error("Session expiree"); }
    if (!response.ok || !body.ok) throw Object.assign(new Error(body.error || "Erreur Business Radar"), { code: body.code });
    return body.data;
  }

  function filterQuery() {
    const params = new URLSearchParams({ search: filters.search, status: filters.status, sort: filters.sort });
    if (filters.favorite) params.set("favorite", "true");
    return `&${params}`;
  }

  function saveFilters() {
    sessionStorage.setItem("businessRadarFilters", JSON.stringify(filters));
    document.querySelectorAll('a[href*="action=export"]').forEach((link) => { const action = link.href.includes("export-xlsx") ? "export-xlsx" : "export"; link.href = `/api/business-radar?action=${action}${filterQuery()}`; });
  }

  function renderStats() {
    const counts = state.overview.counts || {};
    const stats = [
      ["Nouvelles aujourd'hui", counts.new_today], ["Prioritaires", counts.high_score], ["Echeances 7 jours", counts.due_7d], ["Echeances 72 h", counts.due_72h],
      ["Inscriptions requises", counts.supplier_registration_count], ["Opportunites retenues", counts.qualified_count], ["Favoris", counts.favorite_count], ["Valeur potentielle", counts.potential_value ? number(counts.potential_value) : "Non disponible"],
    ];
    document.querySelector("[data-stats]").innerHTML = stats.map(([label, value]) => `<article class="stat"><strong>${esc(value ?? 0)}</strong><span>${esc(label)}</span></article>`).join("");
  }

  function renderBars(selector, rows) {
    const max = Math.max(1, ...rows.map((row) => row.value));
    document.querySelector(selector).innerHTML = rows.length ? rows.map((row) => `<div class="bar-row"><span>${esc(row.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round((row.value / max) * 100)}%"></span></span><strong>${row.value}</strong></div>`).join("") : '<p class="empty">Aucune donnee disponible.</p>';
  }

  function renderOverview() {
    renderStats();
    const priority = state.opportunities.filter((item) => item.score >= 70).slice(0, 6);
    document.querySelector("[data-priority-rows]").innerHTML = priority.length ? priority.map((item) => `<tr><td><button class="row-link" data-open-detail="${item.id}">${esc(item.title)}</button>${item.is_demo ? '<span class="demo-badge">DEMO</span>' : ""}</td><td>${esc(item.country || "-")}</td><td>${esc(date(item.deadline_at))}</td><td><span class="score">${item.score}</span></td><td>${esc(item.status)}</td></tr>`).join("") : empty(5, "Aucune opportunite prioritaire pour le moment.");
    document.querySelector("[data-action-list]").innerHTML = state.overview.actions?.length ? state.overview.actions.map((item, index) => { const due = remaining(item.deadline_at); return `<button class="action-item" data-open-detail="${item.id}"><span class="action-rank">${index + 1}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.organization || "Acheteur non precise")} · ${esc(item.country || "Pays non precise")}</small></span><span class="urgency ${due.level}">${esc(due.label)}</span><span class="score">${item.score}</span></button>`; }).join("") : '<p class="empty">Aucune action recommandee. Ajoutez ou collectez des opportunites.</p>';
    renderBars("[data-sectors]", state.overview.sectors || []);
    renderBars("[data-countries]", state.overview.countries || []);
    document.querySelector("[data-deadlines]").innerHTML = state.overview.deadlines?.length ? state.overview.deadlines.map((item) => { const due = remaining(item.deadline_at); return `<button class="deadline" data-open-detail="${item.id}"><time>${esc(date(item.deadline_at))}</time><span><strong>${esc(item.title)}</strong><small>${esc(item.organization || "")}</small></span><span class="urgency ${due.level}">${esc(due.label)}</span></button>`; }).join("") : '<p class="empty">Aucune echeance renseignee.</p>';
    document.querySelector("[data-run-list]").innerHTML = state.overview.runs?.length ? state.overview.runs.map((run) => `<div class="run"><time>${esc(date(run.started_at, true))}</time><span><strong>${esc(run.status)}</strong><small>${run.sources_checked} sources · ${run.items_created} nouvelles · ${run.items_updated} mises a jour</small></span><span>${run.errors?.length || 0} erreur(s)</span></div>`).join("") : '<p class="empty">Aucune execution enregistree.</p>';
  }

  function renderOpportunities() {
    document.querySelector("[data-opportunity-rows]").innerHTML = state.opportunities.length ? state.opportunities.map((item) => { const due = remaining(item.deadline_at); return `<tr class="${due.level === "critical" ? "due-critical" : ""}"><td><button class="favorite-button ${item.is_favorite ? "active" : ""}" data-favorite-id="${item.id}" data-favorite-value="${!item.is_favorite}" aria-label="${item.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}" aria-pressed="${Boolean(item.is_favorite)}">★</button></td><td data-label="Opportunite"><strong>${esc(item.title)}</strong>${item.is_demo ? '<span class="demo-badge">DEMO</span>' : ""}<span class="muted">${esc(item.country || "Pays non precise")}</span></td><td data-label="Organisation">${esc(item.organization || "Non precisee")}</td><td data-label="Secteur">${esc(item.sector || "Non classe")}</td><td data-label="Echeance"><span class="urgency ${due.level}">${esc(due.label)}</span></td><td data-label="Score"><span class="score">${item.score}</span></td><td data-label="Statut"><select class="status-select" data-status-id="${item.id}">${["new","reviewing","qualified","monitoring","submitted","won","lost","archived"].map((status) => `<option value="${status}"${item.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></td><td><button class="text-button" data-open-detail="${item.id}">Ouvrir</button></td></tr>`; }).join("") : empty(8, "Aucune opportunite ne correspond aux filtres.");
  }

  function renderSources() {
    document.querySelector("[data-source-cards]").innerHTML = state.sources.length ? state.sources.map((source) => `<article class="source-card"><span class="source-type">${esc(source.type)}${source.type === "demo" ? " · DEMO" : ""}</span><h3>${esc(source.name)}</h3><p class="source-meta">${esc(source.url || "Source sans URL")}</p><p class="source-meta">${source.active ? "Active" : "Inactive"} · Dernier controle: ${esc(date(source.lastCheckedAt))}</p></article>`).join("") : '<p class="empty">Aucune source configuree.</p>';
    document.querySelector("[data-registration-rows]").innerHTML = state.registrations.length ? state.registrations.map((item) => `<tr><td>${esc(item.company_name)}</td><td>${esc(item.contact_name || item.email || "-")}</td><td>${esc(item.country || "-")}</td><td>${esc((item.categories || []).join(", "))}</td><td>${esc(item.status)}</td><td>${esc(date(item.created_at))}</td></tr>`).join("") : empty(6, "Aucune inscription fournisseur.");
  }

  async function load() {
    setLoading(true); setStatus("Chargement du centre de commande...");
    try {
      [state.overview, state.opportunities, state.sources, state.registrations] = await Promise.all([api("overview"), api("opportunities", { query: filterQuery() }), api("sources"), api("registrations")]);
      renderOverview(); renderOpportunities(); renderSources(); setStatus("");
    } catch (error) { setStatus(error.message, true); }
    finally { setLoading(false); }
  }

  async function openDetail(id) {
    setStatus("Ouverture de la fiche...");
    try {
      state.detail = await api("opportunity-detail", { query: `&id=${encodeURIComponent(id)}` });
      const item = state.detail.opportunity;
      document.querySelector("[data-detail-title]").textContent = item.title;
      document.querySelector("[data-detail-content]").innerHTML = `<div class="detail-grid"><div><span>Organisation</span><strong>${esc(item.organization || "Non precisee")}</strong></div><div><span>Pays</span><strong>${esc(item.country || "Non precise")}</strong></div><div><span>Score</span><strong>${item.score}/100</strong></div><div><span>Echeance</span><strong>${esc(date(item.deadline_at))}</strong></div></div><p>${esc(item.ai_summary || item.description || "Aucun resume disponible.")}</p>${item.source_url ? `<a class="button ghost" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Ouvrir la source</a>` : ""}`;
      renderNotes(); const dialog = document.getElementById("detail-dialog"); if (!dialog.open) dialog.showModal(); setStatus("");
    } catch (error) { setStatus(error.message, true); }
  }

  function renderNotes() {
    document.querySelector("[data-note-list]").innerHTML = state.detail.notes.length ? state.detail.notes.map((note) => `<article class="note"><p>${esc(note.content)}</p><footer><span>${esc(note.author_email)} · ${esc(date(note.created_at, true))}</span><span><button class="text-button" data-edit-note="${note.id}">Modifier</button><button class="text-button danger-text" data-delete-note="${note.id}">Supprimer</button></span></footer></article>`).join("") : '<p class="empty">Aucune note interne.</p>';
  }

  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
    document.querySelector("[data-page-title]").textContent = ({ overview: "Vue generale", opportunities: "Opportunites", sources: "Sources", suppliers: "Fournisseurs", history: "Historique" })[name];
  }

  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab)));
  document.querySelectorAll("[data-tab-link]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tabLink)));
  document.querySelectorAll("[data-open-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.openDialog).showModal()));
  document.addEventListener("click", async (event) => {
    const detailButton = event.target.closest("[data-open-detail]");
    if (detailButton) return openDetail(detailButton.dataset.openDetail);
    const favorite = event.target.closest("[data-favorite-id]");
    if (favorite) { try { await api("favorite", { method: "POST", body: { id: favorite.dataset.favoriteId, isFavorite: favorite.dataset.favoriteValue === "true" } }); await load(); } catch (error) { setStatus(error.message, true); } return; }
    const deleteNote = event.target.closest("[data-delete-note]");
    if (deleteNote && confirm("Supprimer cette note interne ?")) { try { await api("note", { method: "DELETE", query: `&id=${encodeURIComponent(deleteNote.dataset.deleteNote)}` }); await openDetail(state.detail.opportunity.id); } catch (error) { setStatus(error.message, true); } }
    const editNote = event.target.closest("[data-edit-note]");
    if (editNote) { const note = state.detail.notes.find((item) => item.id === editNote.dataset.editNote); const content = prompt("Modifier la note interne", note?.content || ""); if (content && content !== note.content) { try { await api("note-update", { method: "POST", body: { id: note.id, content } }); await openDetail(state.detail.opportunity.id); } catch (error) { setStatus(error.message, true); } } }
  });
  document.querySelector("[data-close-detail]").addEventListener("click", () => document.getElementById("detail-dialog").close());
  document.querySelector("[data-logout]").addEventListener("click", async () => { await fetch("/api/business-radar-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); location.reload(); });
  document.querySelector("[data-run-radar]").addEventListener("click", async () => { setLoading(true); setStatus("Execution du radar en cours..."); try { await api("run", { method: "POST", body: {} }); await load(); setStatus("Execution terminee."); } catch (error) { setStatus(error.message, true); } finally { setLoading(false); } });
  document.querySelector("[data-opportunity-rows]").addEventListener("change", async (event) => { if (!event.target.matches("[data-status-id]")) return; try { await api("status", { method: "POST", body: { id: event.target.dataset.statusId, status: event.target.value } }); await load(); } catch (error) { setStatus(error.message, true); } });

  const search = document.querySelector("[data-search]"); const statusFilter = document.querySelector("[data-status-filter]"); const sort = document.querySelector("[data-sort]"); const favoriteFilter = document.querySelector("[data-favorite-filter]");
  search.value = filters.search; statusFilter.value = filters.status; sort.value = filters.sort; favoriteFilter.checked = filters.favorite; saveFilters();
  let filterTimer;
  async function refreshFiltered() { clearTimeout(filterTimer); filterTimer = setTimeout(async () => { filters.search = search.value; filters.status = statusFilter.value; filters.sort = sort.value; filters.favorite = favoriteFilter.checked; saveFilters(); try { state.opportunities = await api("opportunities", { query: filterQuery() }); renderOpportunities(); } catch (error) { setStatus(error.message, true); } }, 180); }
  search.addEventListener("input", refreshFiltered); statusFilter.addEventListener("change", refreshFiltered); sort.addEventListener("change", refreshFiltered); favoriteFilter.addEventListener("change", refreshFiltered);
  document.querySelector("[data-delete-demo]").addEventListener("click", async () => { if (!confirm("Supprimer toutes les sources et opportunites DEMO ? Cette action est definitive.")) return; try { const result = await api("delete-demo", { method: "POST", body: {} }); await load(); setStatus(`${result.deletedOpportunities} opportunite(s) DEMO supprimee(s).`); } catch (error) { setStatus(error.message, true); } });
  document.querySelector("[data-note-form]").addEventListener("submit", async (event) => { event.preventDefault(); if (!state.detail) return; const content = new FormData(event.currentTarget).get("content"); try { await api("note", { method: "POST", body: { opportunityId: state.detail.opportunity.id, content } }); event.currentTarget.reset(); await openDetail(state.detail.opportunity.id); } catch (error) { setStatus(error.message, true); } });
  document.querySelector("[data-source-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; try { await api("source", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.closest("dialog").close(); form.reset(); await load(); } catch (error) { setStatus(error.message, true); } });
  document.querySelector("[data-opportunity-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; try { await api("opportunity", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.closest("dialog").close(); form.reset(); await load(); } catch (error) { setStatus(error.message, true); } });
  document.querySelector("[data-url-form]").addEventListener("submit", async (event) => { event.preventDefault(); const result = document.querySelector("[data-analysis-result]"); result.textContent = "Analyse en cours..."; try { state.analysis = await api("analyze-url", { method: "POST", body: { url: new FormData(event.currentTarget).get("url") } }); result.innerHTML = `<strong>${esc(state.analysis.title)}</strong><p>${esc(state.analysis.aiSummary || "")}</p><p>Score: <strong>${state.analysis.score}/100</strong> · Mode: ${esc(state.analysis.analysisMode)}</p>`; document.querySelector("[data-save-analysis]").hidden = false; } catch (error) { result.textContent = error.message; } });
  document.querySelector("[data-save-analysis]").addEventListener("click", async () => { if (!state.analysis) return; try { await api("opportunity", { method: "POST", body: state.analysis.rawData || state.analysis }); document.getElementById("url-dialog").close(); state.analysis = null; document.querySelector("[data-save-analysis]").hidden = true; await load(); } catch (error) { setStatus(error.message, true); } });
  load();
})();
