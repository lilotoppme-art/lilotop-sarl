"use strict";

const { query, transaction } = require("../business-radar/db");

const CATEGORIES = Object.freeze([
  "administrative", "legal", "fiscal", "hse", "technical",
  "financial", "certification", "reference", "other"
]);

function mapRow(row, includeFile = false) {
  if (!row) return null;
  const storedBytes = Number(row.stored_bytes) || 0;
  const fileSize = Number(row.file_size) || 0;
  const filePresent = storedBytes > 0 && storedBytes === fileSize && Boolean(row.file_sha256);
  const status = row.expires_on && new Date(row.expires_on) < new Date(new Date().toISOString().slice(0, 10))
    ? "expired"
    : "valid";
  const organizationName = row.organization_name || "LILOTOP SARL";
  const usableForTenders = row.usable_for_tenders === true;
  const mapped = {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description || "",
    versionId: row.version_id,
    version: row.version_label,
    sourceFilename: row.source_filename,
    extension: row.extension,
    mimeType: row.mime_type,
    fileSize,
    sha256: row.file_sha256,
    previewText: row.preview_text || "",
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    notes: row.notes || "",
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    organizationName,
    storageLocation: row.storage_location || "Neon PostgreSQL / document_vault_versions.file_data",
    filePresent,
    storedBytes,
    usableForTenders,
    usableInTenders: filePresent && usableForTenders && organizationName === "LILOTOP SARL" && status === "valid",
    status
  };
  if (includeFile) mapped.fileData = row.file_data;
  return mapped;
}

function latestDocumentQuery(where = "") {
  return `
    SELECT d.id, d.title, d.category, d.description,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
    FROM document_vault_documents d
    JOIN LATERAL (
      SELECT * FROM document_vault_versions
      WHERE document_id = d.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) v ON true
    ${where}
  `;
}

async function listDocuments({ search = "", category = "", status = "" } = {}) {
  const values = [];
  const filters = [];
  if (search) {
    values.push(`%${String(search).slice(0, 120)}%`);
    filters.push(`(d.title ILIKE $${values.length} OR d.description ILIKE $${values.length} OR v.source_filename ILIKE $${values.length})`);
  }
  if (category && CATEGORIES.includes(category)) {
    values.push(category);
    filters.push(`d.category = $${values.length}`);
  }
  if (status === "expired") filters.push("v.expires_on IS NOT NULL AND v.expires_on < current_date");
  if (status === "valid") filters.push("(v.expires_on IS NULL OR v.expires_on >= current_date)");
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(`${latestDocumentQuery(where)} ORDER BY d.category, d.title`, values);
  return result.rows.map(mapRow);
}

async function listHistory(documentId) {
  const result = await query(`
    SELECT d.id, d.title, d.category, d.description,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
    FROM document_vault_documents d
    JOIN document_vault_versions v ON v.document_id = d.id
    WHERE d.id = $1
    ORDER BY v.created_at DESC, v.id DESC
  `, [documentId]);
  return result.rows.map(mapRow);
}

async function getVersion(versionId, includeFile = false) {
  const result = await query(`
    SELECT d.id, d.title, d.category, d.description,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes,
      ${includeFile ? "v.file_data" : "NULL::bytea AS file_data"}
    FROM document_vault_documents d
    JOIN document_vault_versions v ON v.document_id = d.id
    WHERE v.id = $1
    LIMIT 1
  `, [versionId]);
  return mapRow(result.rows[0], includeFile);
}

async function saveVersion(metadata, file, uploadedBy) {
  return transaction(async (client) => {
    let documentId = metadata.documentId || null;
    if (documentId) {
      const existing = await client.query(
        "SELECT id FROM document_vault_documents WHERE id = $1 FOR UPDATE",
        [documentId]
      );
      if (!existing.rowCount) throw Object.assign(new Error("Document introuvable."), { code: "NOT_FOUND" });
      await client.query(`
        UPDATE document_vault_documents
        SET title = $2, category = $3, description = $4,
          organization_name = $5, usable_for_tenders = $6, updated_at = now()
        WHERE id = $1
      `, [documentId, metadata.title, metadata.category, metadata.description,
        metadata.organizationName, metadata.usableForTenders]);
    } else {
      const created = await client.query(`
        INSERT INTO document_vault_documents (
          title, category, description, organization_name, usable_for_tenders, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [metadata.title, metadata.category, metadata.description,
        metadata.organizationName, metadata.usableForTenders, uploadedBy]);
      documentId = created.rows[0].id;
    }
    const count = await client.query(
      "SELECT count(*)::int AS count FROM document_vault_versions WHERE document_id = $1",
      [documentId]
    );
    const versionLabel = metadata.version || `v${(count.rows[0]?.count || 0) + 1}`;
    const saved = await client.query(`
      INSERT INTO document_vault_versions (
        document_id, version_label, source_filename, extension, mime_type,
        file_size, file_sha256, file_data, preview_text, issued_on,
        expires_on, notes, uploaded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      documentId, versionLabel, file.sourceFilename, file.extension, file.mimeType,
      file.fileSize, file.sha256, file.buffer, file.previewText,
      metadata.issuedOn || null, metadata.expiresOn || null, metadata.notes, uploadedBy
    ]);
    return getVersionWithClient(client, saved.rows[0].id);
  });
}

async function getVersionWithClient(client, versionId) {
  const result = await client.query(`
    SELECT d.id, d.title, d.category, d.description,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
    FROM document_vault_documents d
    JOIN document_vault_versions v ON v.document_id = d.id
    WHERE v.id = $1
  `, [versionId]);
  return mapRow(result.rows[0]);
}

async function tenderInventory() {
  const documents = await listDocuments();
  return documents.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    version: item.version,
    versionId: item.versionId,
    sourceFilename: item.sourceFilename,
    fileSize: item.fileSize,
    sha256: item.sha256,
    issuedOn: item.issuedOn,
    expiresOn: item.expiresOn,
    status: item.status,
    organizationName: item.organizationName,
    storageLocation: item.storageLocation,
    filePresent: item.filePresent,
    usableForTenders: item.usableForTenders,
    usableInTenders: item.usableInTenders
  }));
}

async function dashboardSummary() {
  const result = await query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE expires_on IS NOT NULL AND expires_on < current_date)::int AS expired,
      count(*) FILTER (
        WHERE expires_on >= current_date AND expires_on <= current_date + interval '60 days'
      )::int AS expiring
    FROM (
      SELECT DISTINCT ON (document_id) document_id, expires_on
      FROM document_vault_versions
      ORDER BY document_id, created_at DESC, id DESC
    ) current_versions
  `);
  return {
    total: result.rows[0]?.total || 0,
    expired: result.rows[0]?.expired || 0,
    expiring: result.rows[0]?.expiring || 0
  };
}

module.exports = {
  CATEGORIES,
  dashboardSummary,
  getVersion,
  listDocuments,
  listHistory,
  saveVersion,
  tenderInventory
};
