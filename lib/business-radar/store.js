const { query } = require("./db");

function mapSource(row) {
  return { id: row.id, name: row.name, type: row.type, url: row.url, country: row.country, active: row.active, config: row.config || {}, lastCheckedAt: row.last_checked_at, createdAt: row.created_at };
}

async function listSources(activeOnly = false) {
  const result = await query(`SELECT * FROM sources ${activeOnly ? "WHERE active = true" : ""} ORDER BY name`);
  return result.rows.map(mapSource);
}

async function createSource(data) {
  const result = await query(`INSERT INTO sources (name,type,url,country,active,config) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`, [data.name, data.type, data.url || null, data.country || null, data.active, JSON.stringify(data.config || {})]);
  return mapSource(result.rows[0]);
}

async function touchSource(id) {
  await query(`UPDATE sources SET last_checked_at=now(), updated_at=now() WHERE id=$1`, [id]);
}

async function listOpportunities(filters = {}) {
  const values = [];
  const where = [];
  if (filters.status) { values.push(filters.status); where.push(`status=$${values.length}`); }
  if (filters.country) { values.push(`%${filters.country}%`); where.push(`country ILIKE $${values.length}`); }
  if (filters.sector) { values.push(`%${filters.sector}%`); where.push(`sector ILIKE $${values.length}`); }
  if (filters.search) { values.push(`%${filters.search}%`); where.push(`(title ILIKE $${values.length} OR organization ILIKE $${values.length} OR description ILIKE $${values.length})`); }
  if (filters.minScore) { values.push(Number(filters.minScore)); where.push(`score >= $${values.length}`); }
  values.push(Math.min(200, Math.max(1, Number(filters.limit) || 50)));
  const result = await query(`SELECT * FROM opportunities ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY score DESC, deadline_at ASC NULLS LAST, created_at DESC LIMIT $${values.length}`, values);
  return result.rows;
}

async function getOpportunity(id) {
  const result = await query(`SELECT * FROM opportunities WHERE id=$1`, [id]);
  return result.rows[0] || null;
}

async function upsertOpportunity(item) {
  const result = await query(`
    INSERT INTO opportunities (source_id,external_id,source_type,is_demo,title,organization,country,sector,opportunity_type,description,source_url,published_at,deadline_at,estimated_value,currency,score,score_details,ai_summary,ai_analysis,analysis_mode,fingerprint,tags,raw_data)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20,$21,$22,$23::jsonb)
    ON CONFLICT (fingerprint) DO UPDATE SET source_id=COALESCE(EXCLUDED.source_id,opportunities.source_id), title=EXCLUDED.title, organization=EXCLUDED.organization, country=EXCLUDED.country, sector=EXCLUDED.sector, opportunity_type=EXCLUDED.opportunity_type, description=EXCLUDED.description, source_url=EXCLUDED.source_url, deadline_at=EXCLUDED.deadline_at, score=EXCLUDED.score, score_details=EXCLUDED.score_details, ai_summary=EXCLUDED.ai_summary, ai_analysis=EXCLUDED.ai_analysis, analysis_mode=EXCLUDED.analysis_mode, tags=EXCLUDED.tags, raw_data=EXCLUDED.raw_data, updated_at=now()
    RETURNING *, (xmax = 0) AS inserted`,
    [item.sourceId || null, item.externalId || null, item.sourceType, item.isDemo, item.title, item.organization || null, item.country || null, item.sector || null, item.opportunityType || null, item.description || null, item.sourceUrl || null, item.publishedAt, item.deadlineAt, item.estimatedValue, item.currency || null, item.score, JSON.stringify(item.scoreDetails), item.aiSummary || null, JSON.stringify(item.aiAnalysis || {}), item.analysisMode, item.fingerprint, item.tags || [], JSON.stringify(item.rawData || {})]
  );
  return result.rows[0];
}

async function updateOpportunityStatus(id, status) {
  const result = await query(`UPDATE opportunities SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`, [id, status]);
  return result.rows[0] || null;
}

async function createRun(triggerType, metadata = {}) {
  const result = await query(`INSERT INTO radar_runs (trigger_type,metadata) VALUES ($1,$2::jsonb) RETURNING *`, [triggerType, JSON.stringify(metadata)]);
  return result.rows[0];
}

async function finishRun(id, values) {
  const result = await query(`UPDATE radar_runs SET status=$2,completed_at=now(),sources_checked=$3,items_found=$4,items_created=$5,items_updated=$6,errors=$7::jsonb WHERE id=$1 RETURNING *`, [id, values.status, values.sourcesChecked, values.itemsFound, values.itemsCreated, values.itemsUpdated, JSON.stringify(values.errors || [])]);
  return result.rows[0];
}

async function createNotification(data) {
  const result = await query(`INSERT INTO notifications (opportunity_id,recipient,subject,status,provider_id,error,sent_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $4='sent' THEN now() ELSE NULL END) RETURNING *`, [data.opportunityId || null, data.recipient, data.subject || null, data.status, data.providerId || null, data.error || null]);
  return result.rows[0];
}

async function listRegistrations() {
  const result = await query(`SELECT * FROM supplier_registrations ORDER BY created_at DESC LIMIT 100`);
  return result.rows;
}

async function createRegistration(data) {
  const result = await query(`INSERT INTO supplier_registrations (company_name,contact_name,email,phone,country,categories,notes,source_reference,raw_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`, [data.companyName, data.contactName || null, data.email || null, data.phone || null, data.country || null, data.categories || [], data.notes || null, data.sourceReference || null, JSON.stringify(data.rawData || {})]);
  return result.rows[0];
}

async function overview() {
  const [counts, sectors, countries, deadlines, runs] = await Promise.all([
    query(`SELECT count(*)::int total,count(*) FILTER (WHERE status='new')::int new_count,count(*) FILTER (WHERE score>=70)::int high_score,count(*) FILTER (WHERE is_demo)::int demo_count FROM opportunities`),
    query(`SELECT COALESCE(sector,'Non classe') label,count(*)::int value FROM opportunities GROUP BY sector ORDER BY value DESC LIMIT 8`),
    query(`SELECT COALESCE(country,'Non renseigne') label,count(*)::int value FROM opportunities GROUP BY country ORDER BY value DESC LIMIT 8`),
    query(`SELECT id,title,organization,deadline_at,score,status,is_demo FROM opportunities WHERE deadline_at >= now() ORDER BY deadline_at ASC LIMIT 8`),
    query(`SELECT * FROM radar_runs ORDER BY started_at DESC LIMIT 8`),
  ]);
  return { counts: counts.rows[0], sectors: sectors.rows, countries: countries.rows, deadlines: deadlines.rows, runs: runs.rows };
}

module.exports = { listSources, createSource, touchSource, listOpportunities, getOpportunity, upsertOpportunity, updateOpportunityStatus, createRun, finishRun, createNotification, listRegistrations, createRegistration, overview };
