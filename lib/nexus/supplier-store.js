"use strict";

const { query, transaction } = require("../business-radar/db");

function mapSearch(row) {
  if (!row) return null;
  return {
    id: row.id,
    criteria: row.criteria || {},
    summary: row.summary,
    suppliers: row.suppliers || [],
    model: row.model,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function mapRfq(row) {
  if (!row) return null;
  return {
    id: row.id,
    searchId: row.search_id,
    supplierKey: row.supplier_key,
    supplier: row.supplier || {},
    subject: row.subject,
    description: row.description,
    quantity: row.quantity,
    incoterm: row.incoterm,
    desiredDelivery: row.desired_delivery,
    paymentTerms: row.payment_terms,
    emailBody: row.email_body,
    status: row.status,
    createdBy: row.created_by,
    openedAt: row.opened_at,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function saveSearch(result, createdBy) {
  const saved = await query(`
    INSERT INTO supplier_ai_searches (criteria, summary, suppliers, model, created_by)
    VALUES ($1::jsonb,$2,$3::jsonb,$4,$5)
    RETURNING *
  `, [
    JSON.stringify(result.criteria),
    result.summary,
    JSON.stringify(result.suppliers),
    result.model,
    createdBy
  ]);
  return mapSearch(saved.rows[0]);
}

async function getSearch(id) {
  const result = await query(`
    SELECT * FROM supplier_ai_searches WHERE id = $1 LIMIT 1
  `, [id]);
  return mapSearch(result.rows[0]);
}

async function createRfq(draft, supplier, product, createdBy) {
  const result = await query(`
    INSERT INTO supplier_ai_rfqs (
      search_id, supplier_key, supplier, subject, description, quantity,
      incoterm, desired_delivery, payment_terms, email_body, created_by
    )
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [
    draft.searchId,
    draft.supplierKey,
    JSON.stringify(supplier),
    draft.subject,
    draft.description,
    draft.quantity,
    draft.incoterm,
    draft.desiredDelivery,
    draft.paymentTerms,
    draft.emailBody,
    createdBy
  ]);
  const rfq = mapRfq(result.rows[0]);
  return { ...rfq, product };
}

async function listHistory(limit = 50) {
  const searches = await query(`
    SELECT * FROM supplier_ai_searches ORDER BY created_at DESC LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 50))]);
  const rfqs = await query(`
    SELECT * FROM supplier_ai_rfqs ORDER BY created_at DESC LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 50))]);
  const favorites = await query(`
    SELECT supplier_key FROM supplier_ai_favorites ORDER BY created_at DESC
  `);
  return {
    searches: searches.rows.map(mapSearch),
    rfqs: rfqs.rows.map(mapRfq),
    favoriteKeys: favorites.rows.map((row) => row.supplier_key)
  };
}

async function updateRfqStatus(id, status, createdBy) {
  const timestamps = {
    opened: "opened_at = COALESCE(opened_at, now())",
    sent: "sent_at = COALESCE(sent_at, now())",
    responded: "responded_at = COALESCE(responded_at, now())"
  };
  const allowedCurrentStatuses = {
    opened: ["draft", "opened"],
    sent: ["opened"],
    responded: ["sent"]
  };
  const result = await query(`
    UPDATE supplier_ai_rfqs
    SET status = $2, ${timestamps[status]}, updated_at = now()
    WHERE id = $1 AND created_by = $3 AND status = ANY($4::text[])
    RETURNING *
  `, [id, status, createdBy, allowedCurrentStatuses[status]]);
  return mapRfq(result.rows[0]);
}

async function toggleFavorite(supplier, createdBy) {
  return transaction(async (client) => {
    const existing = await client.query(`
      SELECT id FROM supplier_ai_favorites
      WHERE supplier_key = $1 AND created_by = $2
      LIMIT 1
    `, [supplier.supplierKey, createdBy]);
    if (existing.rows[0]) {
      await client.query("DELETE FROM supplier_ai_favorites WHERE id = $1", [existing.rows[0].id]);
      return { favorite: false, supplierKey: supplier.supplierKey };
    }
    await client.query(`
      INSERT INTO supplier_ai_favorites (supplier_key, supplier, created_by)
      VALUES ($1,$2::jsonb,$3)
    `, [supplier.supplierKey, JSON.stringify(supplier), createdBy]);
    return { favorite: true, supplierKey: supplier.supplierKey };
  });
}

async function dashboardSummary() {
  const result = await query(`
    SELECT
      (SELECT coalesce(sum(jsonb_array_length(suppliers)), 0)::int FROM supplier_ai_searches) AS suppliers_found,
      (SELECT count(*)::int FROM supplier_ai_rfqs) AS rfqs_prepared,
      (SELECT count(*)::int FROM supplier_ai_rfqs WHERE status IN ('sent','responded')) AS rfqs_sent,
      (SELECT count(*)::int FROM supplier_ai_rfqs WHERE status = 'responded') AS responses_received,
      (SELECT count(*)::int FROM supplier_ai_favorites) AS favorites
  `);
  return {
    suppliersFound: result.rows[0]?.suppliers_found || 0,
    rfqsPrepared: result.rows[0]?.rfqs_prepared || 0,
    rfqsSent: result.rows[0]?.rfqs_sent || 0,
    responsesReceived: result.rows[0]?.responses_received || 0,
    favorites: result.rows[0]?.favorites || 0
  };
}

module.exports = {
  createRfq,
  dashboardSummary,
  getSearch,
  listHistory,
  saveSearch,
  toggleFavorite,
  updateRfqStatus
};
