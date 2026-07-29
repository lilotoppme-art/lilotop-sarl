"use strict";

const { query } = require("../business-radar/db");

function mapAnalysis(row) {
  if (!row) return null;
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunity_title || null,
    organization: row.organization || null,
    score: row.score,
    classification: row.classification,
    executiveSummary: row.executive_summary,
    strengths: row.strengths || [],
    risks: row.risks || [],
    recommendedActions: row.recommended_actions || [],
    model: row.model,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

async function listCandidates(limit = 100) {
  const result = await query(`
    SELECT
      o.id, o.title, o.organization, o.country, o.sector, o.opportunity_type,
      o.deadline_at, o.estimated_value, o.currency, o.status, o.source_url,
      o.created_at, o.is_demo,
      latest.id AS latest_analysis_id,
      latest.score AS commercial_score,
      latest.classification AS commercial_classification,
      latest.created_at AS commercial_analyzed_at
    FROM opportunities o
    LEFT JOIN LATERAL (
      SELECT id, score, classification, created_at
      FROM commercial_ai_analyses
      WHERE opportunity_id = o.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest ON true
    WHERE o.status NOT IN ('lost', 'archived')
    ORDER BY latest.created_at DESC NULLS LAST, o.score DESC, o.created_at DESC
    LIMIT $1
  `, [Math.min(200, Math.max(1, Number(limit) || 100))]);
  return result.rows;
}

async function saveAnalysis(opportunity, analysis, createdBy) {
  const sourceSnapshot = {
    title: opportunity.title,
    organization: opportunity.organization || null,
    country: opportunity.country || null,
    sector: opportunity.sector || null,
    opportunityType: opportunity.opportunity_type || null,
    deadline: opportunity.deadline_at || null,
    sourceUrl: opportunity.source_url || null
  };
  const result = await query(`
    INSERT INTO commercial_ai_analyses (
      opportunity_id, score, classification, executive_summary, strengths,
      risks, recommended_actions, model, source_snapshot, created_by
    )
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10)
    RETURNING *
  `, [
    opportunity.id,
    analysis.score,
    analysis.classification,
    analysis.executiveSummary,
    JSON.stringify(analysis.strengths),
    JSON.stringify(analysis.risks),
    JSON.stringify(analysis.recommendedActions),
    analysis.model,
    JSON.stringify(sourceSnapshot),
    createdBy
  ]);
  return mapAnalysis({
    ...result.rows[0],
    opportunity_title: opportunity.title,
    organization: opportunity.organization
  });
}

async function listHistory(opportunityId, limit = 40) {
  const result = await query(`
    SELECT a.*, o.title AS opportunity_title, o.organization
    FROM commercial_ai_analyses a
    JOIN opportunities o ON o.id = a.opportunity_id
    WHERE a.opportunity_id = $1
    ORDER BY a.created_at DESC
    LIMIT $2
  `, [opportunityId, Math.min(100, Math.max(1, Number(limit) || 40))]);
  return result.rows.map(mapAnalysis);
}

async function dashboardSummary() {
  const [counts, latest] = await Promise.all([
    query(`
      SELECT
        count(*) FILTER (WHERE created_at::date = current_date)::int AS analyzed_today,
        count(*) FILTER (
          WHERE created_at::date = current_date
          AND classification IN ('Très prioritaire', 'Prioritaire')
        )::int AS priority_today
      FROM commercial_ai_analyses
    `),
    query(`
      SELECT a.*, o.title AS opportunity_title, o.organization
      FROM commercial_ai_analyses a
      JOIN opportunities o ON o.id = a.opportunity_id
      ORDER BY a.created_at DESC
      LIMIT 1
    `)
  ]);
  return {
    analyzedToday: counts.rows[0]?.analyzed_today || 0,
    priorityToday: counts.rows[0]?.priority_today || 0,
    latest: mapAnalysis(latest.rows[0])
  };
}

module.exports = {
  dashboardSummary,
  listCandidates,
  listHistory,
  saveAnalysis
};
