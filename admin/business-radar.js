(() => {
  const authenticated = document.body.dataset.authenticated === 'true';
  const loginView = document.querySelector('[data-login-view]');
  const appShell = document.querySelector('[data-app-shell]');
  loginView.style.display = authenticated ? 'none' : 'grid';
  appShell.style.display = authenticated ? 'flex' : 'none';
  if (!authenticated) {
    const form = document.querySelector('[data-login-form]');
    const status = document.querySelector('[data-login-status]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); status.textContent = 'Connexion...'; status.className = 'form-status';
      const data = Object.fromEntries(new FormData(form));
      const response = await fetch('/api/business-radar-auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { status.textContent = body.error || 'Connexion impossible'; status.className = 'form-status error'; return; }
      location.reload();
    });
    return;
  }

  const state = { overview: null, opportunities: [], sources: [], registrations: [], analysis: null };
  const statusEl = document.querySelector('[data-global-status]');

  async function api(action, options = {}) {
    const response = await fetch(`/api/business-radar?action=${encodeURIComponent(action)}${options.query || ''}`, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => ({ ok: false, error: 'Invalid server response' }));
    if (response.status === 401) { location.reload(); throw new Error('Session expiree'); }
    if (!response.ok || !body.ok) throw Object.assign(new Error(body.error || 'Erreur Business Radar'), { code: body.code });
    return body.data;
  }

  function setStatus(message = '', error = false) {
    statusEl.textContent = message;
    statusEl.className = `global-status${error ? ' error' : ''}`;
  }

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); }
  function date(value) { return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : 'Non precisee'; }
  function statusOptions(current) { return [['new','Nouveau'],['reviewing','En analyse'],['qualified','Qualifie'],['monitoring','Suivi'],['submitted','Soumis'],['won','Gagne'],['lost','Perdu'],['archived','Archive']].map(([value,label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join(''); }
  function opportunityRow(item) {
    return `<tr><td><strong>${esc(item.title)}${item.is_demo ? '<span class="demo-badge">DEMO</span>' : ''}</strong><span class="muted">${esc(item.opportunity_type || '')}</span></td><td>${esc(item.organization || '-')}</td><td>${esc(item.sector || '-')}</td><td>${date(item.deadline_at)}</td><td><span class="score">${Number(item.score) || 0}</span></td><td><select class="status-select" data-status-id="${esc(item.id)}">${statusOptions(item.status)}</select></td><td>${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener">Ouvrir</a>` : '-'}</td></tr>`;
  }

  function renderOverview() {
    const data = state.overview;
    const counts = data.counts || {};
    document.querySelector('[data-stats]').innerHTML = [
      ['Opportunites', counts.total || 0], ['Nouvelles', counts.new_count || 0], ['Score 70+', counts.high_score || 0], ['Donnees DEMO', counts.demo_count || 0],
    ].map(([label,value]) => `<article class="stat"><strong>${value}</strong><span>${label}</span></article>`).join('');
    document.querySelector('[data-priority-rows]').innerHTML = state.opportunities.slice(0, 6).map((item) => `<tr><td><strong>${esc(item.title)}${item.is_demo ? '<span class="demo-badge">DEMO</span>' : ''}</strong><span class="muted">${esc(item.organization || '')}</span></td><td>${esc(item.country || '-')}</td><td>${date(item.deadline_at)}</td><td><span class="score">${item.score}</span></td><td>${esc(item.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucune opportunite enregistree.</td></tr>';
    renderBars('[data-sectors]', data.sectors || []);
    renderBars('[data-countries]', data.countries || []);
    document.querySelector('[data-deadlines]').innerHTML = (data.deadlines || []).map((item) => `<article class="deadline"><time>${date(item.deadline_at)}</time><div><strong>${esc(item.title)}${item.is_demo ? '<span class="demo-badge">DEMO</span>' : ''}</strong><div class="muted">${esc(item.organization || '')}</div></div><span class="score">${item.score}</span></article>`).join('') || '<p class="empty">Aucune echeance a venir.</p>';
    document.querySelector('[data-run-list]').innerHTML = (data.runs || []).map((run) => `<article class="run"><time>${date(run.started_at)}</time><div><strong>${esc(run.trigger_type)} · ${esc(run.status)}</strong><div class="muted">${run.sources_checked} source(s), ${run.items_created} creation(s), ${run.items_updated} mise(s) a jour</div></div><span>${run.items_found} resultat(s)</span></article>`).join('') || '<p class="empty">Aucune execution.</p>';
  }

  function renderBars(selector, rows) {
    const max = Math.max(1, ...rows.map((row) => Number(row.value)));
    document.querySelector(selector).innerHTML = rows.map((row) => `<div class="bar-row"><span>${esc(row.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(Number(row.value)/max*100)}%"></span></span><strong>${row.value}</strong></div>`).join('') || '<p class="empty">Aucune donnee.</p>';
  }

  function renderOpportunities() {
    document.querySelector('[data-opportunity-rows]').innerHTML = state.opportunities.map(opportunityRow).join('') || '<tr><td colspan="7" class="empty">Aucune opportunite.</td></tr>';
  }
  function renderSources() {
    document.querySelector('[data-source-cards]').innerHTML = state.sources.map((source) => `<article class="source-card"><span class="source-type">${esc(source.type)}${source.type === 'demo' ? ' · DEMO' : ''}</span><h3>${esc(source.name)}</h3><p class="source-meta">${esc(source.country || 'Zone non precisee')}</p><p class="source-meta">${esc(source.url || 'Source sans URL')}</p><p class="source-meta">Derniere verification: ${date(source.lastCheckedAt)}</p></article>`).join('') || '<p class="empty">Aucune source configuree.</p>';
  }
  function renderRegistrations() {
    document.querySelector('[data-registration-rows]').innerHTML = state.registrations.map((item) => `<tr><td><strong>${esc(item.company_name)}</strong></td><td>${esc(item.contact_name || item.email || '-')}</td><td>${esc(item.country || '-')}</td><td>${esc((item.categories || []).join(', ') || '-')}</td><td>${esc(item.status)}</td><td>${date(item.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune inscription fournisseur.</td></tr>';
  }

  async function load() {
    setStatus('Chargement du radar...');
    try {
      const [overview, opportunities, sources, registrations] = await Promise.all([api('overview'), api('opportunities'), api('sources'), api('registrations')]);
      Object.assign(state, { overview, opportunities, sources, registrations });
      renderOverview(); renderOpportunities(); renderSources(); renderRegistrations(); setStatus('');
    } catch (error) {
      setStatus(error.code === 'DATABASE_NOT_CONFIGURED' ? 'La base PostgreSQL doit etre configuree et migree avant utilisation.' : error.message, true);
    }
  }

  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
    document.querySelector('[data-page-title]').textContent = ({ overview:'Vue generale', opportunities:'Opportunites', sources:'Sources', suppliers:'Fournisseurs', history:'Historique' })[name];
  }
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
  document.querySelectorAll('[data-tab-link]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tabLink)));
  document.querySelectorAll('[data-open-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.openDialog).showModal()));
  document.querySelector('[data-logout]').addEventListener('click', async () => { await fetch('/api/business-radar-auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'logout' }) }); location.reload(); });
  document.querySelector('[data-run-radar]').addEventListener('click', async (event) => { event.currentTarget.disabled = true; setStatus('Execution du radar en cours...'); try { await api('run', { method:'POST', body:{} }); await load(); setStatus('Execution terminee.'); } catch (error) { setStatus(error.message, true); } finally { event.currentTarget.disabled = false; } });

  document.querySelector('[data-opportunity-rows]').addEventListener('change', async (event) => { if (!event.target.matches('[data-status-id]')) return; try { await api('status', { method:'POST', body:{ id:event.target.dataset.statusId, status:event.target.value } }); await load(); } catch (error) { setStatus(error.message, true); } });
  document.querySelector('[data-search]').addEventListener('input', debounce(refreshFiltered, 300));
  document.querySelector('[data-status-filter]').addEventListener('change', refreshFiltered);
  async function refreshFiltered() { const search = document.querySelector('[data-search]').value; const status = document.querySelector('[data-status-filter]').value; try { state.opportunities = await api('opportunities', { query:`&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}` }); renderOpportunities(); } catch (error) { setStatus(error.message, true); } }
  function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

  document.querySelector('[data-source-form]').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await api('source', { method:'POST', body }); event.currentTarget.closest('dialog').close(); event.currentTarget.reset(); await load(); } catch (error) { setStatus(error.message, true); } });
  document.querySelector('[data-opportunity-form]').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await api('opportunity', { method:'POST', body }); event.currentTarget.closest('dialog').close(); event.currentTarget.reset(); await load(); } catch (error) { setStatus(error.message, true); } });
  document.querySelector('[data-url-form]').addEventListener('submit', async (event) => { event.preventDefault(); const result = document.querySelector('[data-analysis-result]'); result.textContent = 'Analyse en cours...'; try { state.analysis = await api('analyze-url', { method:'POST', body:{ url:new FormData(event.currentTarget).get('url') } }); result.innerHTML = `<strong>${esc(state.analysis.title)}</strong><p>${esc(state.analysis.aiSummary || '')}</p><p>Score: <strong>${state.analysis.score}/100</strong> · Mode: ${esc(state.analysis.analysisMode)}</p>`; document.querySelector('[data-save-analysis]').hidden = false; } catch (error) { result.textContent = error.message; } });
  document.querySelector('[data-save-analysis]').addEventListener('click', async () => { if (!state.analysis) return; try { await api('opportunity', { method:'POST', body:state.analysis.rawData || state.analysis }); document.getElementById('url-dialog').close(); state.analysis = null; document.querySelector('[data-save-analysis]').hidden = true; await load(); } catch (error) { setStatus(error.message, true); } });
  load();

})();
