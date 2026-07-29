"use strict";

const { query } = require("../business-radar/db");

function mapSearch(row) {
  if (!row) return null;
  return {
    id: row.id,
    criteria: row.criteria || {},
    watchSummary: row.watch_summary,
    globalRisks: row.global_risks || [],
    globalRecommendations: row.global_recommendations || [],
    signals: row.signals || [],
    model: row.model,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

async function saveSearch(result, createdBy) {
  const saved = await query(`
    INSERT INTO mining_ai_searches (
      criteria, watch_summary, global_risks, global_recommendations,
      signals, model, created_by
    )
    VALUES ($1::jsonb,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7)
    RETURNING *
  `, [
    JSON.stringify(result.criteria),
    result.watchSummary,
    JSON.stringify(result.globalRisks),
    JSON.stringify(result.globalRecommendations),
    JSON.stringify(result.signals),
    result.model,
    createdBy
  ]);
  return mapSearch(saved.rows[0]);
}

async function listHistory(limit = 30) {
  const result = await query(`
    SELECT *
    FROM mining_ai_searches
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 30))]);
  return result.rows.map(mapSearch);
}

async function getSearch(id) {
  const result = await query(`
    SELECT *
    FROM mining_ai_searches
    WHERE id = $1
    LIMIT 1
  `, [id]);
  return mapSearch(result.rows[0]);
}

async function dashboardSummary() {
  const counts = await query(`
    SELECT
      count(*) FILTER (WHERE created_at::date = current_date)::int AS searches_today,
      coalesce(sum(jsonb_array_length(signals))
        FILTER (WHERE created_at::date = current_date), 0)::int AS signals_today
    FROM mining_ai_searches
  `);
  const latest = await query(`
    SELECT *
    FROM mining_ai_searches
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return {
    searchesToday: counts.rows[0]?.searches_today || 0,
    signalsToday: counts.rows[0]?.signals_today || 0,
    latest: mapSearch(latest.rows[0])
  };
}

module.exports = {
  dashboardSummary,
  getSearch,
  listHistory,
  saveSearch
};
