"use strict";

const { query } = require("../business-radar/db");

function mapSearch(row) {
  if (!row) return null;
  return {
    id: row.id,
    criteria: row.criteria || {},
    summary: row.summary,
    advantages: row.advantages || [],
    risks: row.risks || [],
    recommendations: row.recommendations || [],
    suppliers: row.suppliers || [],
    model: row.model,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

async function saveSearch(result, createdBy) {
  const saved = await query(`
    INSERT INTO procurement_ai_searches (
      criteria, summary, advantages, risks, recommendations, suppliers, model, created_by
    )
    VALUES ($1::jsonb,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)
    RETURNING *
  `, [
    JSON.stringify(result.criteria),
    result.summary,
    JSON.stringify(result.advantages),
    JSON.stringify(result.risks),
    JSON.stringify(result.recommendations),
    JSON.stringify(result.suppliers),
    result.model,
    createdBy
  ]);
  return mapSearch(saved.rows[0]);
}

async function listHistory(limit = 30) {
  const result = await query(`
    SELECT *
    FROM procurement_ai_searches
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 30))]);
  return result.rows.map(mapSearch);
}

async function getSearch(id) {
  const result = await query(`
    SELECT *
    FROM procurement_ai_searches
    WHERE id = $1
    LIMIT 1
  `, [id]);
  return mapSearch(result.rows[0]);
}

async function dashboardSummary() {
  const result = await query(`
    SELECT
      count(*) FILTER (WHERE created_at::date = current_date)::int AS searches_today,
      coalesce(sum(jsonb_array_length(suppliers))
        FILTER (WHERE created_at::date = current_date), 0)::int AS suppliers_today
    FROM procurement_ai_searches
  `);
  const latest = await query(`
    SELECT *
    FROM procurement_ai_searches
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return {
    searchesToday: result.rows[0]?.searches_today || 0,
    suppliersToday: result.rows[0]?.suppliers_today || 0,
    latest: mapSearch(latest.rows[0])
  };
}

module.exports = {
  dashboardSummary,
  getSearch,
  listHistory,
  saveSearch
};
