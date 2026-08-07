"use strict";

const { query, transaction } = require("../business-radar/db");

const ORGANIZATION_TYPES = new Set([
  "client", "prospect", "supplier", "manufacturer", "distributor", "partner",
  "bank", "investor", "administration", "international-organization"
]);
const INTERACTION_TYPES = new Set([
  "email", "call", "whatsapp", "meeting", "tender", "contract", "quote",
  "invoice", "purchase-order", "payment", "document", "note"
]);

function clean(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function cleanList(value, limit = 40) {
  return [...new Set((Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => clean(item, 120)).filter(Boolean))].slice(0, limit);
}

function identityKey(name, country = "") {
  const normalized = `${clean(name, 220)}|${clean(country, 120)}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) throw Object.assign(new Error("Le nom de l'organisation est requis."), { code: "VALIDATION_ERROR" });
  return normalized;
}

function normalizeOrganization(input = {}) {
  const name = clean(input.name || input.organization || input.companyName, 220);
  const country = clean(input.country, 120) || null;
  const organizationType = ORGANIZATION_TYPES.has(input.organizationType || input.type)
    ? input.organizationType || input.type : "prospect";
  return {
    identityKey: identityKey(name, country || ""), name, organizationType, country,
    city: clean(input.city, 120) || null, address: clean(input.address, 500) || null,
    website: clean(input.website, 500) || null, phone: clean(input.phone, 80) || null,
    whatsapp: clean(input.whatsapp, 80) || null, email: clean(input.email, 320).toLowerCase() || null,
    linkedin: clean(input.linkedin, 500) || null, sector: clean(input.sector, 160) || null,
    products: cleanList(input.products), projects: cleanList(input.projects), tags: cleanList(input.tags),
    notes: clean(input.notes, 5000), status: ["active", "inactive", "archived"].includes(input.status) ? input.status : "active",
    sourceModule: clean(input.sourceModule, 80) || "crm", sourceReference: clean(input.sourceReference, 240) || null
  };
}

function mapOrganization(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, organizationType: row.organization_type, country: row.country,
    city: row.city, address: row.address, website: row.website, phone: row.phone,
    whatsapp: row.whatsapp, email: row.email, linkedin: row.linkedin, sector: row.sector,
    products: row.products || [], projects: row.projects || [], tags: row.tags || [], notes: row.notes,
    status: row.status, scores: {
      value: row.value_score, potential: row.potential_score, probability: row.probability_score,
      history: row.history_score, risk: row.risk_score, priority: row.priority_score
    },
    sourceModule: row.source_module, sourceReference: row.source_reference,
    createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapPerson(row) {
  return row ? {
    id: row.id, organizationId: row.organization_id, fullName: row.full_name, jobTitle: row.job_title,
    email: row.email, phone: row.phone, whatsapp: row.whatsapp, linkedin: row.linkedin,
    isDecisionMaker: row.is_decision_maker, influence: row.influence, comments: row.comments,
    createdAt: row.created_at, updatedAt: row.updated_at
  } : null;
}

function mapInteraction(row) {
  return row ? {
    id: row.id, organizationId: row.organization_id, personId: row.person_id,
    interactionType: row.interaction_type, direction: row.direction, subject: row.subject,
    summary: row.summary, occurredAt: row.occurred_at, sourceModule: row.source_module,
    sourceReference: row.source_reference, metadata: row.metadata || {}, createdBy: row.created_by,
    createdAt: row.created_at
  } : null;
}

async function logActivity(eventType, entityType, entityId, actor, sourceModule, details = {}, client = null) {
  const executor = client || { query };
  await executor.query(`INSERT INTO crm_activity_log
    (event_type,entity_type,entity_id,actor_email,source_module,details)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [
    eventType, entityType, entityId || null, actor, sourceModule || "crm", JSON.stringify(details)
  ]);
}

async function recalculateScores(organizationId, client = null) {
  const executor = client || { query };
  const result = await executor.query(`
    SELECT o.*,
      count(i.id)::int AS interaction_count,
      count(i.id) FILTER (WHERE i.occurred_at >= now() - interval '90 days')::int AS recent_count,
      count(i.id) FILTER (WHERE i.interaction_type IN ('contract','purchase-order','payment'))::int AS value_events,
      max(i.occurred_at) AS last_contact
    FROM crm_organizations o LEFT JOIN crm_interactions i ON i.organization_id=o.id
    WHERE o.id=$1 GROUP BY o.id`, [organizationId]);
  const row = result.rows[0];
  if (!row) return null;
  const typeBase = { client: 80, prospect: 55, supplier: 65, manufacturer: 70, distributor: 60, partner: 65, bank: 70, investor: 65, administration: 55, "international-organization": 65 }[row.organization_type] || 50;
  const history = Math.min(100, row.interaction_count * 8 + row.value_events * 15);
  const potential = Math.min(100, typeBase + (row.tags || []).includes("Prioritaire") * 15 + row.recent_count * 2);
  const probability = Math.min(100, Math.round((potential + history) / 2));
  const risk = row.status === "inactive" ? 65 : row.status === "archived" ? 90 : row.last_contact && new Date(row.last_contact) < new Date(Date.now() - 180 * 86400000) ? 45 : 20;
  const value = Math.min(100, typeBase + row.value_events * 10);
  const priority = Math.max(0, Math.min(100, Math.round(value * .25 + potential * .3 + probability * .25 + history * .2 - risk * .15)));
  const updated = await executor.query(`UPDATE crm_organizations SET
    value_score=$2,potential_score=$3,probability_score=$4,history_score=$5,risk_score=$6,priority_score=$7,updated_at=now()
    WHERE id=$1 RETURNING *`, [organizationId, value, potential, probability, history, risk, priority]);
  return mapOrganization(updated.rows[0]);
}

async function upsertOrganization(input, actor = "system@nexus", client = null) {
  const data = normalizeOrganization(input);
  const executor = client || { query };
  const result = await executor.query(`
    INSERT INTO crm_organizations (
      identity_key,name,organization_type,country,city,address,website,phone,whatsapp,email,linkedin,
      sector,products,projects,tags,notes,status,source_module,source_reference,created_by,updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
    ON CONFLICT (identity_key) DO UPDATE SET
      name=EXCLUDED.name,
      organization_type=CASE WHEN crm_organizations.organization_type='prospect' THEN EXCLUDED.organization_type ELSE crm_organizations.organization_type END,
      country=COALESCE(EXCLUDED.country,crm_organizations.country), city=COALESCE(EXCLUDED.city,crm_organizations.city),
      address=COALESCE(EXCLUDED.address,crm_organizations.address), website=COALESCE(EXCLUDED.website,crm_organizations.website),
      phone=COALESCE(EXCLUDED.phone,crm_organizations.phone), whatsapp=COALESCE(EXCLUDED.whatsapp,crm_organizations.whatsapp),
      email=COALESCE(EXCLUDED.email,crm_organizations.email), linkedin=COALESCE(EXCLUDED.linkedin,crm_organizations.linkedin),
      sector=COALESCE(EXCLUDED.sector,crm_organizations.sector),
      products=ARRAY(SELECT DISTINCT unnest(crm_organizations.products || EXCLUDED.products)),
      projects=ARRAY(SELECT DISTINCT unnest(crm_organizations.projects || EXCLUDED.projects)),
      tags=ARRAY(SELECT DISTINCT unnest(crm_organizations.tags || EXCLUDED.tags)),
      notes=CASE WHEN EXCLUDED.notes='' THEN crm_organizations.notes ELSE EXCLUDED.notes END,
      status=EXCLUDED.status,source_module=EXCLUDED.source_module,
      source_reference=COALESCE(EXCLUDED.source_reference,crm_organizations.source_reference),updated_by=EXCLUDED.updated_by,updated_at=now()
    RETURNING *, (xmax = 0) AS inserted`, [
    data.identityKey, data.name, data.organizationType, data.country, data.city, data.address,
    data.website, data.phone, data.whatsapp, data.email, data.linkedin, data.sector,
    data.products, data.projects, data.tags, data.notes, data.status, data.sourceModule,
    data.sourceReference, actor
  ]);
  const row = result.rows[0];
  await logActivity(row.inserted ? "create" : "sync", "organization", row.id, actor, data.sourceModule, { name: data.name }, client);
  return recalculateScores(row.id, client);
}

async function addPerson(input, actor) {
  const organizationId = clean(input.organizationId, 80);
  const fullName = clean(input.fullName, 220);
  if (!organizationId || !fullName) throw Object.assign(new Error("Organisation et nom du contact requis."), { code: "VALIDATION_ERROR" });
  const email = clean(input.email, 320).toLowerCase() || null;
  const result = await query(`INSERT INTO crm_people
    (organization_id,full_name,job_title,email,phone,whatsapp,linkedin,is_decision_maker,influence,comments,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (organization_id,email) DO UPDATE SET full_name=EXCLUDED.full_name,job_title=EXCLUDED.job_title,
      phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,linkedin=EXCLUDED.linkedin,
      is_decision_maker=EXCLUDED.is_decision_maker,influence=EXCLUDED.influence,comments=EXCLUDED.comments,updated_at=now()
    RETURNING *`, [organizationId, fullName, clean(input.jobTitle, 180) || null, email,
    clean(input.phone, 80) || null, clean(input.whatsapp, 80) || null, clean(input.linkedin, 500) || null,
    input.isDecisionMaker === true, Math.max(0, Math.min(100, Number(input.influence) || 0)), clean(input.comments, 3000), actor]);
  await logActivity("create", "person", result.rows[0].id, actor, "crm", { organizationId });
  return mapPerson(result.rows[0]);
}

async function addInteraction(input, actor, client = null) {
  const executor = client || { query };
  if (!INTERACTION_TYPES.has(input.interactionType)) throw Object.assign(new Error("Type d'interaction invalide."), { code: "VALIDATION_ERROR" });
  const summary = clean(input.summary, 5000);
  if (!input.organizationId || !summary) throw Object.assign(new Error("Organisation et résumé requis."), { code: "VALIDATION_ERROR" });
  const result = await executor.query(`INSERT INTO crm_interactions
    (organization_id,person_id,interaction_type,direction,subject,summary,occurred_at,source_module,source_reference,metadata,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8,$9,$10::jsonb,$11)
    ON CONFLICT (source_module,source_reference,interaction_type) DO UPDATE SET
      subject=EXCLUDED.subject,summary=EXCLUDED.summary,metadata=EXCLUDED.metadata
    RETURNING *`, [input.organizationId, input.personId || null, input.interactionType,
    ["inbound", "outbound", "internal"].includes(input.direction) ? input.direction : "internal",
    clean(input.subject, 500) || null, summary, input.occurredAt || null, clean(input.sourceModule, 80) || "crm",
    clean(input.sourceReference, 240) || null, JSON.stringify(input.metadata || {}), actor]);
  await logActivity("create", "interaction", result.rows[0].id, actor, input.sourceModule || "crm", { type: input.interactionType }, client);
  await recalculateScores(input.organizationId, client);
  return mapInteraction(result.rows[0]);
}

async function addDocumentLink(input, actor) {
  if (!input.organizationId || !clean(input.documentType, 120) || !clean(input.title, 500)) {
    throw Object.assign(new Error("Organisation, type et titre du document requis."), { code: "VALIDATION_ERROR" });
  }
  const result = await query(`INSERT INTO crm_document_links
    (organization_id,vault_document_id,document_type,title,status,expires_on,source_module,source_reference,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (organization_id,document_type,source_reference) DO UPDATE SET
      title=EXCLUDED.title,status=EXCLUDED.status,expires_on=EXCLUDED.expires_on
    RETURNING *`, [input.organizationId, input.vaultDocumentId || null, clean(input.documentType, 120),
    clean(input.title, 500), ["available", "expired", "missing", "archived"].includes(input.status) ? input.status : "available",
    input.expiresOn || null, clean(input.sourceModule, 80) || "crm", clean(input.sourceReference, 240) || null, actor]);
  await logActivity("create", "document", result.rows[0].id, actor, input.sourceModule || "crm", { organizationId: input.organizationId });
  return result.rows[0];
}

async function listOrganizations(filters = {}) {
  const values = [], where = ["status <> 'archived'"];
  if (filters.type) { values.push(filters.type); where.push(`organization_type=$${values.length}`); }
  if (filters.country) { values.push(`%${clean(filters.country, 120)}%`); where.push(`country ILIKE $${values.length}`); }
  if (filters.tag) { values.push(clean(filters.tag, 120)); where.push(`$${values.length}=ANY(tags)`); }
  if (filters.search) {
    values.push(`%${clean(filters.search, 220)}%`);
    where.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length} OR phone ILIKE $${values.length}
      OR country ILIKE $${values.length} OR sector ILIKE $${values.length}
      OR array_to_string(products,' ') ILIKE $${values.length} OR array_to_string(projects,' ') ILIKE $${values.length}
      OR array_to_string(tags,' ') ILIKE $${values.length}
      OR EXISTS (SELECT 1 FROM crm_people p WHERE p.organization_id=crm_organizations.id AND
        (p.full_name ILIKE $${values.length} OR p.email ILIKE $${values.length})))`);
  }
  values.push(Math.min(200, Math.max(1, Number(filters.limit) || 100)));
  const result = await query(`SELECT * FROM crm_organizations WHERE ${where.join(" AND ")}
    ORDER BY priority_score DESC,updated_at DESC LIMIT $${values.length}`, values);
  return result.rows.map(mapOrganization);
}

async function getOrganization(id, actor) {
  const [organization, people, interactions, documents] = await Promise.all([
    query("SELECT * FROM crm_organizations WHERE id=$1", [id]),
    query("SELECT * FROM crm_people WHERE organization_id=$1 ORDER BY is_decision_maker DESC,influence DESC", [id]),
    query("SELECT * FROM crm_interactions WHERE organization_id=$1 ORDER BY occurred_at DESC LIMIT 200", [id]),
    query("SELECT * FROM crm_document_links WHERE organization_id=$1 ORDER BY created_at DESC", [id])
  ]);
  if (!organization.rows[0]) return null;
  await logActivity("view", "organization", id, actor, "crm");
  return { organization: mapOrganization(organization.rows[0]), people: people.rows.map(mapPerson), interactions: interactions.rows.map(mapInteraction), documents: documents.rows };
}

async function mergeOrganizations(targetId, sourceId, actor) {
  if (!targetId || !sourceId || targetId === sourceId) throw Object.assign(new Error("Fusion invalide."), { code: "VALIDATION_ERROR" });
  return transaction(async (client) => {
    const locked = await client.query("SELECT * FROM crm_organizations WHERE id=ANY($1::uuid[]) FOR UPDATE", [[targetId, sourceId]]);
    if (locked.rowCount !== 2) throw Object.assign(new Error("Organisation introuvable."), { code: "NOT_FOUND" });
    await client.query(`INSERT INTO crm_people (organization_id,full_name,job_title,email,phone,whatsapp,linkedin,is_decision_maker,influence,comments,created_by)
      SELECT $1,full_name,job_title,email,phone,whatsapp,linkedin,is_decision_maker,influence,comments,created_by FROM crm_people WHERE organization_id=$2
      ON CONFLICT (organization_id,email) DO UPDATE SET influence=GREATEST(crm_people.influence,EXCLUDED.influence),is_decision_maker=crm_people.is_decision_maker OR EXCLUDED.is_decision_maker`, [targetId, sourceId]);
    await client.query("DELETE FROM crm_people WHERE organization_id=$1", [sourceId]);
    await client.query(`UPDATE crm_interactions i SET organization_id=$1 WHERE organization_id=$2 AND NOT EXISTS (
      SELECT 1 FROM crm_interactions t WHERE t.organization_id=$1 AND t.source_module=i.source_module
      AND t.source_reference=i.source_reference AND t.interaction_type=i.interaction_type)`, [targetId, sourceId]);
    await client.query("DELETE FROM crm_interactions WHERE organization_id=$1", [sourceId]);
    await client.query(`UPDATE crm_document_links d SET organization_id=$1 WHERE organization_id=$2 AND NOT EXISTS (
      SELECT 1 FROM crm_document_links t WHERE t.organization_id=$1 AND t.document_type=d.document_type
      AND t.source_reference IS NOT DISTINCT FROM d.source_reference)`, [targetId, sourceId]);
    await client.query("DELETE FROM crm_document_links WHERE organization_id=$1", [sourceId]);
    await client.query("UPDATE crm_organizations SET status='archived',updated_by=$2,updated_at=now() WHERE id=$1", [sourceId, actor]);
    await logActivity("merge", "organization", targetId, actor, "crm", { sourceId }, client);
    return recalculateScores(targetId, client);
  });
}

async function dashboardSummary() {
  const counts = await query(`SELECT
    count(*) FILTER (WHERE organization_type='client' AND status='active')::int clients,
    count(*) FILTER (WHERE organization_type='prospect' AND status='active')::int prospects,
    count(*) FILTER (WHERE organization_type IN ('supplier','manufacturer','distributor') AND status='active')::int suppliers,
    count(*) FILTER (WHERE organization_type='partner' AND status='active')::int partners,
    count(*) FILTER (WHERE risk_score>=45 AND status='active')::int inactive_clients,
    coalesce(sum(priority_score) FILTER (WHERE organization_type IN ('client','prospect') AND status='active'),0)::int pipeline_value
    FROM crm_organizations`);
  const [topClients, topSuppliers, hotProspects, recent, tenderCount, contractCount, meetingCount, followups, expiring] = await Promise.all([
    query("SELECT * FROM crm_organizations WHERE organization_type='client' AND status='active' ORDER BY value_score DESC LIMIT 5"),
    query("SELECT * FROM crm_organizations WHERE organization_type IN ('supplier','manufacturer','distributor') AND status='active' ORDER BY priority_score DESC LIMIT 5"),
    query("SELECT * FROM crm_organizations WHERE organization_type='prospect' AND status='active' ORDER BY priority_score DESC LIMIT 5"),
    query("SELECT a.*,o.name organization_name FROM crm_activity_log a LEFT JOIN crm_organizations o ON o.id=a.entity_id ORDER BY a.created_at DESC LIMIT 12"),
    query("SELECT count(*)::int count FROM crm_interactions WHERE interaction_type='tender' AND occurred_at>=now()-interval '180 days'"),
    query("SELECT count(*)::int count FROM crm_interactions WHERE interaction_type='contract'"),
    query("SELECT count(*)::int count FROM crm_interactions WHERE interaction_type='meeting' AND occurred_at>=now()-interval '30 days'"),
    query("SELECT count(*)::int count FROM crm_organizations WHERE status='active' AND updated_at<now()-interval '30 days'"),
    query("SELECT count(*)::int count FROM crm_document_links WHERE expires_on BETWEEN current_date AND current_date+90")
  ]);
  return {
    ...counts.rows[0], tenders: tenderCount.rows[0].count, contracts: contractCount.rows[0].count,
    meetings: meetingCount.rows[0].count, followups: followups.rows[0].count, expiringContracts: expiring.rows[0].count,
    topClients: topClients.rows.map(mapOrganization), topSuppliers: topSuppliers.rows.map(mapOrganization),
    hotProspects: hotProspects.rows.map(mapOrganization), recentActivity: recent.rows
  };
}

async function listActivity(limit = 100) {
  const result = await query(`SELECT a.*,o.name organization_name FROM crm_activity_log a
    LEFT JOIN crm_organizations o ON o.id=a.entity_id ORDER BY a.created_at DESC LIMIT $1`, [Math.min(200, Math.max(1, Number(limit) || 100))]);
  return result.rows;
}

async function archiveOrganization(id, actor) {
  const result = await query("UPDATE crm_organizations SET status='archived',updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *", [id, actor]);
  if (result.rows[0]) await logActivity("archive", "organization", id, actor, "crm");
  return mapOrganization(result.rows[0]);
}

async function getRole(email) {
  await query(`INSERT INTO crm_role_assignments (email,role,created_by)
    VALUES ($1,'administrator',$1) ON CONFLICT (email) DO NOTHING`, [email]);
  const result = await query("SELECT role FROM crm_role_assignments WHERE email=$1", [email]);
  return result.rows[0]?.role || "read-only";
}

async function safeSync(callback) {
  try { return await callback(); } catch (error) {
    if (["42P01", "DATABASE_NOT_CONFIGURED"].includes(error.code)) return null;
    throw error;
  }
}

async function syncOpportunity(opportunity, actor = "business-radar@nexus") {
  if (!opportunity?.organization) return null;
  return safeSync(async () => {
    const organization = await upsertOrganization({
      name: opportunity.organization, organizationType: "prospect", country: opportunity.country,
      sector: opportunity.sector, projects: [opportunity.title], tags: ["Prospect", opportunity.score >= 70 ? "Prioritaire" : "Actif"],
      website: opportunity.source_url, sourceModule: "business-radar", sourceReference: opportunity.id
    }, actor);
    await addInteraction({ organizationId: organization.id, interactionType: "tender", summary: opportunity.title,
      subject: opportunity.title, occurredAt: opportunity.created_at, sourceModule: "business-radar", sourceReference: opportunity.id,
      metadata: { opportunityId: opportunity.id, score: opportunity.score, status: opportunity.status } }, actor);
    return organization;
  });
}

async function syncSupplierSearch(search, actor = "purchasing@nexus") {
  return safeSync(async () => Promise.all((search?.suppliers || []).map(async (supplier) => {
    if (!supplier.name) return null;
    const organization = await upsertOrganization({ name: supplier.name, organizationType: supplier.supplierType === "manufacturer" ? "manufacturer" : "supplier",
      country: supplier.country, website: supplier.website || supplier.sourceUrl, email: supplier.commercialEmail,
      phone: supplier.phone, products: supplier.products, tags: ["Fournisseur", "Actif"],
      sourceModule: "purchasing-ai", sourceReference: supplier.supplierKey || search.id }, actor);
    await addInteraction({ organizationId: organization.id, interactionType: "note", summary: search.summary || "Recherche fournisseurs",
      sourceModule: "purchasing-ai", sourceReference: `${search.id || "search"}:${supplier.supplierKey || organization.id}`,
      metadata: { reliabilityScore: supplier.reliabilityScore } }, actor);
    return organization;
  })));
}

async function syncTenderResponse(analysis, actor = "tender-response@nexus") {
  const info = analysis?.keyInformation || {};
  const name = info.client || info.organization;
  if (!name || /confirmer|non publ/i.test(name)) return null;
  return safeSync(async () => {
    const organization = await upsertOrganization({ name, organizationType: "prospect", country: info.country,
      projects: [info.project || analysis.sourceFilename], tags: ["Prospect", "Appel d'offres"],
      sourceModule: "tender-response-ai", sourceReference: analysis.id }, actor);
    await addInteraction({ organizationId: organization.id, interactionType: "tender", summary: analysis.executiveSummary,
      subject: info.subject || info.project || analysis.sourceFilename, sourceModule: "tender-response-ai", sourceReference: analysis.id,
      metadata: { compliance: analysis.compliance?.compliancePercent, deadline: info.deadline } }, actor);
    await addDocumentLink({ organizationId: organization.id, documentType: "DAO", title: analysis.sourceFilename,
      status: "available", sourceModule: "tender-response-ai", sourceReference: analysis.id }, actor);
    return organization;
  });
}

async function syncCommercialAnalysis(opportunity, analysis, actor = "commercial-ai@nexus") {
  if (!opportunity?.organization) return null;
  return safeSync(async () => {
    const organization = await upsertOrganization({ name: opportunity.organization, organizationType: "prospect",
      country: opportunity.country, sector: opportunity.sector, projects: [opportunity.title],
      tags: ["Prospect", analysis.score >= 70 ? "Prioritaire" : "Actif"], sourceModule: "commercial-ai", sourceReference: analysis.id }, actor);
    await addInteraction({ organizationId: organization.id, interactionType: "note", summary: analysis.executiveSummary,
      subject: `Analyse commerciale: ${opportunity.title}`, sourceModule: "commercial-ai", sourceReference: analysis.id,
      metadata: { score: analysis.score, classification: analysis.classification } }, actor);
    return organization;
  });
}

async function syncEmailDelivery(email, actor = "email@nexus") {
  const recipient = clean(email.recipient, 320).toLowerCase();
  if (!recipient) return null;
  return safeSync(async () => {
    const found = await query(`SELECT DISTINCT o.id FROM crm_organizations o LEFT JOIN crm_people p ON p.organization_id=o.id
      WHERE lower(o.email)=$1 OR lower(p.email)=$1 LIMIT 1`, [recipient]);
    if (!found.rows[0]) return null;
    return addInteraction({ organizationId: found.rows[0].id, interactionType: "email", direction: "outbound",
      subject: email.subject, summary: email.subject || "E-mail envoyé", sourceModule: "email-delivery",
      sourceReference: email.providerMessageId, metadata: { status: email.status || "accepted", recipient } }, actor);
  });
}

async function syncExisting(actor = "system@nexus") {
  const counts = { opportunities: 0, commercialAnalyses: 0, supplierSearches: 0, tenderResponses: 0 };
  const opportunities = await query(`SELECT * FROM opportunities
    WHERE organization IS NOT NULL AND trim(organization) <> ''
    ORDER BY updated_at DESC LIMIT 500`);
  for (const opportunity of opportunities.rows) {
    if (await syncOpportunity(opportunity, actor)) counts.opportunities += 1;
  }

  const commercial = await query(`SELECT a.*,o.title,o.organization,o.country,o.sector,o.source_url,o.status,o.created_at AS opportunity_created_at
    FROM commercial_ai_analyses a JOIN opportunities o ON o.id=a.opportunity_id
    WHERE o.organization IS NOT NULL AND trim(o.organization) <> ''
    ORDER BY a.created_at DESC LIMIT 300`);
  for (const row of commercial.rows) {
    const opportunity = {
      id: row.opportunity_id, title: row.title, organization: row.organization, country: row.country,
      sector: row.sector, source_url: row.source_url, status: row.status, created_at: row.opportunity_created_at
    };
    const analysis = {
      id: row.id, score: row.score, classification: row.classification,
      executiveSummary: row.executive_summary
    };
    if (await syncCommercialAnalysis(opportunity, analysis, actor)) counts.commercialAnalyses += 1;
  }

  const [procurement, supplier] = await Promise.all([
    query("SELECT * FROM procurement_ai_searches ORDER BY created_at DESC LIMIT 200"),
    query("SELECT * FROM supplier_ai_searches ORDER BY created_at DESC LIMIT 200")
  ]);
  for (const row of [...procurement.rows, ...supplier.rows]) {
    const result = await syncSupplierSearch({ id: row.id, summary: row.summary, suppliers: row.suppliers || [] }, actor);
    counts.supplierSearches += (result || []).filter(Boolean).length;
  }

  const tenders = await query("SELECT * FROM tender_response_analyses WHERE status <> 'archived' ORDER BY updated_at DESC LIMIT 200");
  for (const row of tenders.rows) {
    const analysis = {
      id: row.id, sourceFilename: row.source_filename, executiveSummary: row.executive_summary,
      keyInformation: row.key_information || {}, compliance: row.compliance || {}
    };
    if (await syncTenderResponse(analysis, actor)) counts.tenderResponses += 1;
  }

  await logActivity("import", "system", null, actor, "crm", counts);
  return counts;
}

module.exports = {
  ORGANIZATION_TYPES, addDocumentLink, addInteraction, addPerson, archiveOrganization, dashboardSummary,
  getOrganization, getRole, identityKey, listActivity, listOrganizations, mergeOrganizations,
  normalizeOrganization, recalculateScores, safeSync, syncCommercialAnalysis, syncEmailDelivery,
  syncExisting, syncOpportunity, syncSupplierSearch, syncTenderResponse, upsertOrganization
};
