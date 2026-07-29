"use strict";

const { query, transaction } = require("../business-radar/db");

function mapAnalysis(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceFilename: row.source_filename,
    sourceType: row.source_type,
    sourceFiles: row.source_files || [],
    availableDocumentsDeclared: row.available_documents_declared || [],
    executiveSummary: row.executive_summary,
    keyInformation: row.key_information || {},
    compliance: row.compliance || {},
    risks: row.risks || [],
    recommendedActions: row.recommended_actions || [],
    generatedDocuments: row.generated_documents || {},
    model: row.model,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function saveAnalysis(result, createdBy) {
  return transaction(async (client) => {
    const saved = await client.query(`
      INSERT INTO tender_response_analyses (
        source_filename, source_type, source_files, available_documents_declared,
        executive_summary, key_information, compliance, risks,
        recommended_actions, generated_documents, model, status, created_by
      )
      VALUES (
        $1,$2,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,
        $9::jsonb,$10::jsonb,$11,'draft',$12
      )
      RETURNING *
    `, [
      result.sourceFilename,
      result.sourceType,
      JSON.stringify(result.sourceFiles),
      JSON.stringify(result.availableDocumentsDeclared),
      result.executiveSummary,
      JSON.stringify(result.keyInformation),
      JSON.stringify(result.compliance),
      JSON.stringify(result.risks),
      JSON.stringify(result.recommendedActions),
      JSON.stringify(result.generatedDocuments),
      result.model,
      createdBy
    ]);
    const analysis = mapAnalysis(saved.rows[0]);
    await client.query(`
      INSERT INTO radar_runs (
        trigger_type, status, completed_at, sources_checked,
        items_found, items_created, items_updated, metadata
      )
      VALUES ('manual','completed',now(),1,1,1,0,$1::jsonb)
    `, [JSON.stringify({
      module: "tender-response-ai",
      analysisId: analysis.id,
      sourceFilename: analysis.sourceFilename,
      client: analysis.keyInformation.client,
      deadline: analysis.keyInformation.deadline,
      compliancePercent: analysis.compliance.compliancePercent,
      createdBy
    })]);
    return analysis;
  });
}

async function listHistory(limit = 30) {
  const result = await query(`
    SELECT *
    FROM tender_response_analyses
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 30))]);
  return result.rows.map(mapAnalysis);
}

async function getAnalysis(id) {
  const result = await query(`
    SELECT *
    FROM tender_response_analyses
    WHERE id = $1
    LIMIT 1
  `, [id]);
  return mapAnalysis(result.rows[0]);
}

async function dashboardSummary() {
  const counts = await query(`
    SELECT
      count(*) FILTER (WHERE created_at::date = current_date)::int AS prepared_today,
      count(*)::int AS total,
      coalesce(avg((compliance->>'compliancePercent')::numeric), 0)::int AS average_compliance
    FROM tender_response_analyses
  `);
  const latest = await query(`
    SELECT *
    FROM tender_response_analyses
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return {
    preparedToday: counts.rows[0]?.prepared_today || 0,
    total: counts.rows[0]?.total || 0,
    averageCompliance: counts.rows[0]?.average_compliance || 0,
    latest: mapAnalysis(latest.rows[0])
  };
}

module.exports = {
  dashboardSummary,
  getAnalysis,
  listHistory,
  saveAnalysis
};
