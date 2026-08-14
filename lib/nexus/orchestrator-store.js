"use strict";

const { query, transaction } = require("../business-radar/db");

let documentStorageReady;

async function ensureDocumentStorage() {
  if (!documentStorageReady) {
    documentStorageReady = query(`
      CREATE TABLE IF NOT EXISTS nexus_workflow_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES nexus_workflows(id) ON DELETE CASCADE,
        opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
        source_url text NOT NULL,
        final_url text NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
        sha256 text NOT NULL,
        extracted_text text NOT NULL,
        file_data bytea NOT NULL,
        retrieved_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (workflow_id, sha256)
      );
      CREATE INDEX IF NOT EXISTS nexus_workflow_documents_workflow_idx
        ON nexus_workflow_documents(workflow_id, retrieved_at ASC);
    `).catch((error) => {
      documentStorageReady = null;
      throw error;
    });
  }
  return documentStorageReady;
}

function mapWorkflow(row) {
  if (!row) return null;
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    title: row.title,
    status: row.status,
    currentStep: row.current_step,
    dossier: row.dossier || {},
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    currency: row.currency,
    lastError: row.last_error,
    createdBy: row.created_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    agentKey: row.agent_key,
    actionKey: row.action_key,
    label: row.label,
    status: row.status,
    input: row.input || {},
    output: row.output || {},
    error: row.error,
    actorEmail: row.actor_email,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

async function listOpportunities(limit = 30) {
  const result = await query(`
    SELECT id, title, organization, country, sector, opportunity_type,
      description, source_url, deadline_at, estimated_value, currency,
      score, ai_summary, ai_analysis, analysis_mode, raw_data, created_at
    FROM opportunities
    WHERE (
      (is_demo = false AND status NOT IN ('archived', 'lost'))
      OR source_url = 'https://www.ungm.org/Public/Notice/306489'
      OR (title = 'Procurement of Spare Parts to Reinstate the Electrical Systems of Africa Hall Building - LTA'
        AND organization = 'United Nations Economic Commission for Africa (UNECA)')
    )
    ORDER BY
      CASE WHEN opportunity_type ILIKE '%appel%' THEN 0 ELSE 1 END,
      deadline_at ASC NULLS LAST,
      score DESC,
      created_at DESC
    LIMIT $1
  `, [Math.min(50, Math.max(1, Number(limit) || 30))]);
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    organization: row.organization,
    country: row.country,
    sector: row.sector,
    opportunityType: row.opportunity_type,
    description: row.description,
    sourceUrl: row.source_url,
    deadlineAt: row.deadline_at,
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    currency: row.currency,
    score: row.score,
    aiSummary: row.ai_summary,
    aiAnalysis: row.ai_analysis || {},
    analysisMode: row.analysis_mode,
    rawData: row.raw_data || {},
    createdAt: row.created_at
  }));
}

async function getOpportunity(id) {
  const result = await query(`
    SELECT id, title, organization, country, sector, opportunity_type,
      description, source_url, deadline_at, estimated_value, currency,
      score, ai_summary, ai_analysis, analysis_mode, raw_data, created_at
    FROM opportunities
    WHERE id = $1
      AND (is_demo = false
        OR source_url = 'https://www.ungm.org/Public/Notice/306489'
        OR (title = 'Procurement of Spare Parts to Reinstate the Electrical Systems of Africa Hall Building - LTA'
          AND organization = 'United Nations Economic Commission for Africa (UNECA)'))
    LIMIT 1
  `, [id]);
  return (await listOpportunitiesFromRows(result.rows))[0] || null;
}

async function listOpportunitiesFromRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    organization: row.organization,
    country: row.country,
    sector: row.sector,
    opportunityType: row.opportunity_type,
    description: row.description,
    sourceUrl: row.source_url,
    deadlineAt: row.deadline_at,
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    currency: row.currency,
    score: row.score,
    aiSummary: row.ai_summary,
    aiAnalysis: row.ai_analysis || {},
    analysisMode: row.analysis_mode,
    rawData: row.raw_data || {},
    createdAt: row.created_at
  }));
}

async function createWorkflow(opportunity, actorEmail) {
  return transaction(async (client) => {
    const dossier = {
      opportunity,
      pipelineStatus: "detected",
      analysis: null,
      tenderSource: {
        sourceUrl: opportunity.sourceUrl || null,
        retrievalStatus: opportunity.sourceUrl ? "referenced" : "missing"
      },
      sourcing: [],
      rfqs: [],
      supplierComparison: [],
      tenderResponse: null,
      finalValidation: null,
      validations: {
        participation: "pending",
        prices: "pending",
        rfqSending: "pending",
        finalDossier: "pending",
        sending: "blocked"
      },
      documents: [],
      sourceIndex: 0
    };
    const saved = await client.query(`
      INSERT INTO nexus_workflows (
        opportunity_id, title, dossier, estimated_value, currency, created_by
      )
      VALUES ($1,$2,$3::jsonb,$4,$5,$6)
      RETURNING *
    `, [
      opportunity.id,
      opportunity.title,
      JSON.stringify(dossier),
      opportunity.estimatedValue,
      opportunity.currency,
      actorEmail
    ]);
    const workflow = mapWorkflow(saved.rows[0]);
    const intakeActions = [
      ["mining-watch-ai", "detect-opportunity", "Opportunite detectee et transmise"],
      ["tender-ai", "qualify-tender", "Appel d'offres qualifie pour orchestration"]
    ];
    for (const [agentKey, actionKey, label] of intakeActions) {
      await client.query(`
        INSERT INTO nexus_workflow_actions (
          workflow_id, agent_key, action_key, label, status,
          input, output, actor_email, completed_at
        )
        VALUES ($1,$2,$3,$4,'completed',$5::jsonb,$6::jsonb,$7,now())
      `, [
        workflow.id,
        agentKey,
        actionKey,
        label,
        JSON.stringify({ opportunityId: opportunity.id }),
        JSON.stringify({ accepted: true }),
        actorEmail
      ]);
    }
    return workflow;
  });
}

async function getWorkflow(id) {
  const result = await query("SELECT * FROM nexus_workflows WHERE id = $1 LIMIT 1", [id]);
  return mapWorkflow(result.rows[0]);
}

async function listWorkflows(limit = 30) {
  const result = await query(`
    SELECT * FROM nexus_workflows
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 30))]);
  return result.rows.map(mapWorkflow);
}

async function listActions(workflowId, limit = 200) {
  const values = [];
  const clauses = [];
  if (workflowId) {
    values.push(workflowId);
    clauses.push(`workflow_id = $${values.length}`);
  }
  values.push(Math.min(500, Math.max(1, Number(limit) || 200)));
  const result = await query(`
    SELECT * FROM nexus_workflow_actions
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY started_at DESC
    LIMIT $${values.length}
  `, values);
  return result.rows.map(mapAction);
}

async function listActiveItbMonitors() {
  const result = await query(`
    SELECT * FROM nexus_workflows
    WHERE COALESCE((dossier->'itbMonitoring'->>'active')::boolean, false) = true
      AND dossier->'eoiLifecycle'->>'status' = 'EOI SUBMITTED'
    ORDER BY updated_at DESC
  `);
  return result.rows.map(mapWorkflow);
}

async function recordItbCandidate(id, notice, actorEmail) {
  return transaction(async (client) => {
    const current = await client.query("SELECT * FROM nexus_workflows WHERE id = $1 FOR UPDATE", [id]);
    if (!current.rowCount) return null;
    const workflow = mapWorkflow(current.rows[0]);
    const dossier = workflow.dossier || {};
    const existing = dossier.relatedSolicitations || [];
    if (existing.some((item) => String(item.noticeId) === String(notice.noticeId))) return null;
    const detectedAt = new Date().toISOString();
    const candidate = { ...notice, detectedAt, status: "ITB DETECTED - ANALYSIS QUEUED" };
    const nextDossier = {
      ...dossier,
      pipelineStatus: "itb-detected",
      relatedSolicitations: [...existing, candidate],
      itbMonitoring: {
        ...(dossier.itbMonitoring || {}),
        active: true,
        status: "ITB DETECTED - ANALYSIS QUEUED",
        lastCheckedAt: detectedAt,
        detectedNotice: candidate
      }
    };
    const updated = await client.query(`
      UPDATE nexus_workflows
      SET dossier = $2::jsonb, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify(nextDossier)]);
    await client.query(`
      INSERT INTO nexus_workflow_actions (
        workflow_id, agent_key, action_key, label, status,
        input, output, actor_email, completed_at
      ) VALUES ($1,'business-radar','detect-related-itb',$2,'completed',$3::jsonb,$4::jsonb,$5,now())
    `, [id, `ITB UNGM ${notice.noticeId} rattachee au dossier EOI existant`, JSON.stringify({ source: "UNGM Public Notice" }), JSON.stringify({ notice, externalAction: false }), actorEmail]);
    return mapWorkflow(updated.rows[0]);
  });
}

async function saveWorkflowDocument(workflow, document) {
  await ensureDocumentStorage();
  const result = await query(`
    INSERT INTO nexus_workflow_documents (
      workflow_id, opportunity_id, source_url, final_url, filename, mime_type,
      size_bytes, sha256, extracted_text, file_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (workflow_id, sha256) DO UPDATE SET
      final_url = EXCLUDED.final_url,
      retrieved_at = now()
    RETURNING id, workflow_id, source_url, final_url, filename, mime_type,
      size_bytes, sha256, extracted_text, retrieved_at
  `, [
    workflow.id, workflow.opportunityId, document.sourceUrl, document.finalUrl,
    document.filename, document.mimeType, document.sizeBytes, document.sha256,
    document.extractedText, document.buffer
  ]);
  return mapWorkflowDocument(result.rows[0]);
}

function mapWorkflowDocument(row, includeData = false) {
  if (!row) return null;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    sourceUrl: row.source_url,
    finalUrl: row.final_url,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    extractedText: row.extracted_text,
    retrievedAt: row.retrieved_at,
    ...(includeData ? { fileData: row.file_data } : {})
  };
}

async function listWorkflowDocuments(workflowId) {
  await ensureDocumentStorage();
  const result = await query(`
    SELECT id, workflow_id, source_url, final_url, filename, mime_type,
      size_bytes, sha256, extracted_text, retrieved_at
    FROM nexus_workflow_documents
    WHERE workflow_id = $1
    ORDER BY retrieved_at ASC
  `, [workflowId]);
  return result.rows.map(mapWorkflowDocument);
}

async function getWorkflowDocument(id) {
  await ensureDocumentStorage();
  const result = await query("SELECT * FROM nexus_workflow_documents WHERE id = $1 LIMIT 1", [id]);
  return mapWorkflowDocument(result.rows[0], true);
}

async function startAction(workflowId, agentKey, actionKey, label, input, actorEmail) {
  const result = await query(`
    INSERT INTO nexus_workflow_actions (
      workflow_id, agent_key, action_key, label, input, actor_email
    )
    VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    RETURNING *
  `, [workflowId, agentKey, actionKey, label, JSON.stringify(input || {}), actorEmail]);
  return mapAction(result.rows[0]);
}

async function completeAction(id, output) {
  const result = await query(`
    UPDATE nexus_workflow_actions
    SET status = 'completed', output = $2::jsonb, completed_at = now()
    WHERE id = $1
    RETURNING *
  `, [id, JSON.stringify(output || {})]);
  return mapAction(result.rows[0]);
}

async function failAction(id, error) {
  const result = await query(`
    UPDATE nexus_workflow_actions
    SET status = 'failed', error = $2, completed_at = now()
    WHERE id = $1
    RETURNING *
  `, [id, String(error || "Workflow action failed").slice(0, 1000)]);
  return mapAction(result.rows[0]);
}

async function advanceWorkflow(id, update) {
  const result = await query(`
    UPDATE nexus_workflows
    SET status = $2,
      current_step = $3,
      dossier = $4::jsonb,
      estimated_value = $5,
      currency = $6,
      last_error = $7,
      started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
      completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
      updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    update.status,
    update.currentStep,
    JSON.stringify(update.dossier || {}),
    update.estimatedValue ?? null,
    update.currency || null,
    update.lastError || null
  ]);
  return mapWorkflow(result.rows[0]);
}

async function updateDossier(id, dossier, actorEmail, actionKey, label, output = {}, agentKey = "human-validation") {
  return transaction(async (client) => {
    const updated = await client.query(`
      UPDATE nexus_workflows
      SET dossier = $2::jsonb, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify(dossier || {})]);
    if (!updated.rowCount) return null;
    await client.query(`
      INSERT INTO nexus_workflow_actions (
        workflow_id, agent_key, action_key, label, status,
        input, output, actor_email, completed_at
      ) VALUES ($1,$2,$3,$4,'completed','{}'::jsonb,$5::jsonb,$6,now())
    `, [id, agentKey, actionKey, label, JSON.stringify(output || {}), actorEmail]);
    return mapWorkflow(updated.rows[0]);
  });
}

async function emailTrackingSummary() {
  try {
    const result = await query(`SELECT
      count(*)::int AS archived,
      count(*) FILTER (WHERE rfq_id IS NOT NULL)::int AS matched,
      count(*) FILTER (WHERE rfq_id = 'NEXUS-INTERNAL-EMAIL-ROUTING-TEST')::int AS routing_tests,
      coalesce(sum(jsonb_array_length(attachments)),0)::int AS attachments
    FROM nexus_supplier_inbound_messages`);
    const row = result.rows[0] || {};
    return {
      archived: row.archived || 0,
      matched: row.matched || 0,
      routingTests: row.routing_tests || 0,
      attachments: row.attachments || 0
    };
  } catch (error) {
    if (error.code === "42P01") return { archived: 0, matched: 0, routingTests: 0, attachments: 0 };
    throw error;
  }
}

async function dashboardSummary() {
  const [result, recent, emailTracking] = await Promise.all([query(`
    SELECT
      count(*) FILTER (WHERE status IN ('queued','running','paused'))::int AS active_workflows,
      count(DISTINCT opportunity_id)
        FILTER (WHERE status IN ('queued','running','paused'))::int AS opportunities_in_progress,
      coalesce(avg(extract(epoch FROM (completed_at - started_at)))
        FILTER (WHERE status = 'completed'), 0)::int AS average_seconds,
      coalesce(sum(estimated_value)
        FILTER (WHERE status IN ('queued','running','paused','completed')), 0) AS potential_value,
      count(*) FILTER (WHERE status IN ('paused','failed'))::int AS critical_alerts
    FROM nexus_workflows
  `), query(`
    SELECT id, title, dossier->>'pipelineStatus' AS pipeline_status,
      dossier->'finalValidation' AS final_validation, updated_at, last_error
    FROM nexus_workflows
    ORDER BY updated_at DESC
    LIMIT 8
  `), emailTrackingSummary()]);
  const row = result.rows[0] || {};
  return {
    activeWorkflows: row.active_workflows || 0,
    opportunitiesInProgress: row.opportunities_in_progress || 0,
    activeAgents: 7,
    averageSeconds: row.average_seconds || 0,
    potentialValue: Number(row.potential_value || 0),
    criticalAlerts: row.critical_alerts || 0,
    emailTracking,
    latestValidation: recent.rows[0]?.final_validation || null,
    recentWorkflows: recent.rows.map((item) => ({
      id: item.id,
      title: item.title,
      pipelineStatus: item.pipeline_status || "detected",
      updatedAt: item.updated_at,
      lastError: item.last_error
    }))
  };
}

module.exports = {
  advanceWorkflow,
  completeAction,
  createWorkflow,
  dashboardSummary,
  emailTrackingSummary,
  ensureDocumentStorage,
  failAction,
  getOpportunity,
  getWorkflowDocument,
  getWorkflow,
  listActions,
  listActiveItbMonitors,
  listWorkflowDocuments,
  listOpportunities,
  listWorkflows,
  recordItbCandidate,
  saveWorkflowDocument,
  startAction,
  updateDossier
};
