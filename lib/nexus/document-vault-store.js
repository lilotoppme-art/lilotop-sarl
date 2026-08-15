"use strict";

const { query, transaction } = require("../business-radar/db");

const CATEGORIES = Object.freeze([
  "administrative", "legal", "fiscal", "hse", "technical",
  "financial", "certification", "reference", "other"
]);
const CATEGORY_CODES = Object.freeze([
  "01-legal-identity", "02-compliance", "03-bank-finance",
  "04-experience-references", "05-lilotop-organization",
  "06-suppliers-partners", "07-other"
]);
const LIFECYCLE_STATUSES = Object.freeze([
  "valid", "needs_review", "expiring", "expired", "incomplete", "archived"
]);

let inventorySchemaPromise;

async function ensureInventorySchema() {
  if (!inventorySchemaPromise) {
    inventorySchemaPromise = query(`
      ALTER TABLE document_vault_documents
        ADD COLUMN IF NOT EXISTS organization_name text NOT NULL DEFAULT 'LILOTOP SARL';
      ALTER TABLE document_vault_documents
        ADD COLUMN IF NOT EXISTS usable_for_tenders boolean NOT NULL DEFAULT false;
      ALTER TABLE document_vault_documents
        ADD COLUMN IF NOT EXISTS storage_location text NOT NULL
          DEFAULT 'Neon PostgreSQL / document_vault_versions.file_data';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS category_code text NOT NULL DEFAULT '07-other';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT '';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT '';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS issuing_authority text NOT NULL DEFAULT '';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS source_label text NOT NULL DEFAULT 'Import DG';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'valid';
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS validated_by text;
      ALTER TABLE document_vault_documents ADD COLUMN IF NOT EXISTS validated_at timestamptz;
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'document_vault_versions_extension_check'
            AND pg_get_constraintdef(oid) NOT LIKE '%jpeg%'
        ) THEN
          ALTER TABLE document_vault_versions DROP CONSTRAINT document_vault_versions_extension_check;
          ALTER TABLE document_vault_versions ADD CONSTRAINT document_vault_versions_extension_check
            CHECK (extension IN ('pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'zip'));
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS document_vault_tender_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES document_vault_documents(id) ON DELETE RESTRICT,
        tender_reference text NOT NULL, requirement_label text NOT NULL DEFAULT '',
        compliance_status text NOT NULL DEFAULT 'needs_review',
        finalization_status text NOT NULL DEFAULT 'not_finalized',
        justification text NOT NULL DEFAULT '', linked_by text NOT NULL,
        linked_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_id, tender_reference, requirement_label)
      );
      CREATE TABLE IF NOT EXISTS document_vault_experiences (
        document_id uuid PRIMARY KEY REFERENCES document_vault_documents(id) ON DELETE RESTRICT,
        client_name text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '',
        sector text NOT NULL DEFAULT '', products_services text NOT NULL DEFAULT '',
        contract_number text NOT NULL DEFAULT '', contract_date date,
        execution_period text NOT NULL DEFAULT '', contract_value text NOT NULL DEFAULT '',
        currency text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '',
        execution_status text NOT NULL DEFAULT '', client_contact text NOT NULL DEFAULT '',
        delivery_proof_available boolean NOT NULL DEFAULT false,
        performance_certificate_available boolean NOT NULL DEFAULT false,
        dg_validated boolean NOT NULL DEFAULT false, validated_by text, validated_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      WITH latest AS (
        SELECT DISTINCT ON (v.document_id) v.document_id,
          lower(d.title) AS title_text,
          lower(d.title || ' ' || d.description || ' ' || v.preview_text) AS content
        FROM document_vault_versions v
        JOIN document_vault_documents d ON d.id = v.document_id
        ORDER BY v.document_id, v.created_at DESC, v.id DESC
      )
      UPDATE document_vault_documents d SET category_code = CASE
        WHEN latest.title_text ~ 'document test coffre' THEN '07-other'
        WHEN latest.title_text ~ '(organigramme|profil société|company profile|curriculum|délégation|pouvoir du signataire)' THEN '05-lilotop-organization'
        WHEN latest.title_text ~ '(arsp|fiscal|cnss|inpp|hse|attestation|licence|agrément)' THEN '02-compliance'
        WHEN latest.title_text ~ '(rccm|id[[:space:]]*nat|identification nationale|nif|statuts?)' THEN '01-legal-identity'
        WHEN latest.content ~ '(contrat|purchase order|bon de commande|preuve de livraison|bonne exécution|facture|référence client)' THEN '04-experience-references'
        WHEN latest.content ~ '(arsp|fiscal|cnss|inpp|hse|attestation|licence|agrément)' THEN '02-compliance'
        WHEN latest.content ~ '(banque|bancaire|états financiers|capacité financière|garantie)' THEN '03-bank-finance'
        WHEN latest.content ~ '(oem|fabricant|distributeur|partenariat|catalogue|datasheet|fiche technique)' THEN '06-suppliers-partners'
        ELSE '07-other' END
      FROM latest WHERE d.id = latest.document_id AND d.extracted_metadata = '{}'::jsonb;
      UPDATE document_vault_documents
      SET lifecycle_status='archived', usable_for_tenders=false, updated_at=now()
      WHERE title ILIKE 'DOCUMENT TEST COFFRE%';
    `).catch((error) => {
      inventorySchemaPromise = null;
      throw error;
    });
  }
  return inventorySchemaPromise;
}

function mapRow(row, includeFile = false) {
  if (!row) return null;
  const storedBytes = Number(row.stored_bytes) || 0;
  const fileSize = Number(row.file_size) || 0;
  const filePresent = storedBytes > 0 && storedBytes === fileSize && Boolean(row.file_sha256);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const expires = row.expires_on ? new Date(row.expires_on) : null;
  const computedStatus = expires && expires < today ? "expired"
    : expires && expires.getTime() - today.getTime() <= 60 * 86400000 ? "expiring"
      : row.lifecycle_status || "needs_review";
  const status = LIFECYCLE_STATUSES.includes(computedStatus) ? computedStatus : "needs_review";
  const organizationName = row.organization_name || "LILOTOP SARL";
  const usableForTenders = row.usable_for_tenders === true;
  const mapped = {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description || "",
    categoryCode: row.category_code || "07-other",
    documentType: row.document_type || row.extension?.toUpperCase() || "",
    reference: row.reference_number || "",
    issuingAuthority: row.issuing_authority || "",
    source: row.source_label || "Import DG",
    extractedMetadata: row.extracted_metadata || {},
    validatedBy: row.validated_by || "",
    validatedAt: row.validated_at || null,
    experience: row.experience || null,
    tenderUses: row.tender_uses || [],
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
    SELECT d.id, d.title, d.category, d.description, d.category_code,
      d.document_type, d.reference_number, d.issuing_authority, d.source_label,
      d.lifecycle_status, d.extracted_metadata, d.validated_by, d.validated_at,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
      ,to_jsonb(e.*) - 'document_id' AS experience
      ,COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'reference', l.tender_reference, 'requirement', l.requirement_label,
        'compliance', l.compliance_status, 'finalization', l.finalization_status
      ) ORDER BY l.linked_at DESC) FROM document_vault_tender_links l WHERE l.document_id = d.id), '[]'::jsonb) AS tender_uses
    FROM document_vault_documents d
    LEFT JOIN document_vault_experiences e ON e.document_id = d.id
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
  await ensureInventorySchema();
  const values = [];
  const filters = [];
  if (search) {
    values.push(`%${String(search).slice(0, 120)}%`);
    filters.push(`(d.title ILIKE $${values.length} OR d.description ILIKE $${values.length}
      OR d.reference_number ILIKE $${values.length} OR d.issuing_authority ILIKE $${values.length}
      OR v.source_filename ILIKE $${values.length} OR v.preview_text ILIKE $${values.length})`);
  }
  if (category && CATEGORY_CODES.includes(category)) {
    values.push(category);
    filters.push(`d.category_code = $${values.length}`);
  }
  if (status === "expired") filters.push("v.expires_on IS NOT NULL AND v.expires_on < current_date");
  if (status === "expiring") filters.push("v.expires_on >= current_date AND v.expires_on <= current_date + interval '60 days'");
  if (status === "valid") filters.push("d.lifecycle_status = 'valid' AND (v.expires_on IS NULL OR v.expires_on > current_date + interval '60 days')");
  if (["needs_review", "incomplete", "archived"].includes(status)) {
    values.push(status);
    filters.push(`d.lifecycle_status = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(`${latestDocumentQuery(where)} ORDER BY d.category, d.title`, values);
  return result.rows.map(mapRow);
}

async function listHistory(documentId) {
  await ensureInventorySchema();
  const result = await query(`
    SELECT d.id, d.title, d.category, d.description, d.category_code,
      d.document_type, d.reference_number, d.issuing_authority, d.source_label,
      d.lifecycle_status, d.extracted_metadata, d.validated_by, d.validated_at,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
      ,NULL::jsonb AS experience, '[]'::jsonb AS tender_uses
    FROM document_vault_documents d
    JOIN document_vault_versions v ON v.document_id = d.id
    WHERE d.id = $1
    ORDER BY v.created_at DESC, v.id DESC
  `, [documentId]);
  return result.rows.map(mapRow);
}

async function getVersion(versionId, includeFile = false) {
  await ensureInventorySchema();
  const result = await query(`
    SELECT d.id, d.title, d.category, d.description, d.category_code,
      d.document_type, d.reference_number, d.issuing_authority, d.source_label,
      d.lifecycle_status, d.extracted_metadata, d.validated_by, d.validated_at,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes,
      ${includeFile ? "v.file_data" : "NULL::bytea AS file_data"}
      ,NULL::jsonb AS experience, '[]'::jsonb AS tender_uses
    FROM document_vault_documents d
    JOIN document_vault_versions v ON v.document_id = d.id
    WHERE v.id = $1
    LIMIT 1
  `, [versionId]);
  return mapRow(result.rows[0], includeFile);
}

async function saveVersion(metadata, file, uploadedBy) {
  await ensureInventorySchema();
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
          organization_name = $5, usable_for_tenders = $6, category_code = $7,
          document_type = $8, reference_number = $9, issuing_authority = $10,
          source_label = $11, lifecycle_status = $12, extracted_metadata = $13::jsonb,
          updated_at = now()
        WHERE id = $1
      `, [documentId, metadata.title, metadata.category, metadata.description,
        metadata.organizationName, metadata.usableForTenders, metadata.categoryCode,
        metadata.documentType, metadata.reference, metadata.issuingAuthority,
        metadata.source, metadata.lifecycleStatus, JSON.stringify(metadata.extractedMetadata || {})]);
    } else {
      const created = await client.query(`
        INSERT INTO document_vault_documents (
          title, category, description, organization_name, usable_for_tenders, created_by,
          category_code, document_type, reference_number, issuing_authority,
          source_label, lifecycle_status, extracted_metadata
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
        RETURNING id
      `, [metadata.title, metadata.category, metadata.description,
        metadata.organizationName, metadata.usableForTenders, uploadedBy,
        metadata.categoryCode, metadata.documentType, metadata.reference,
        metadata.issuingAuthority, metadata.source, metadata.lifecycleStatus,
        JSON.stringify(metadata.extractedMetadata || {})]);
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
    if (metadata.experience) {
      const experience = metadata.experience;
      await client.query(`INSERT INTO document_vault_experiences (
        document_id, client_name, subject, sector, products_services, contract_number,
        contract_date, execution_period, contract_value, currency, country,
        execution_status, client_contact, delivery_proof_available,
        performance_certificate_available
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (document_id) DO UPDATE SET
        client_name=EXCLUDED.client_name, subject=EXCLUDED.subject, sector=EXCLUDED.sector,
        products_services=EXCLUDED.products_services, contract_number=EXCLUDED.contract_number,
        contract_date=EXCLUDED.contract_date, execution_period=EXCLUDED.execution_period,
        contract_value=EXCLUDED.contract_value, currency=EXCLUDED.currency,
        country=EXCLUDED.country, execution_status=EXCLUDED.execution_status,
        client_contact=EXCLUDED.client_contact,
        delivery_proof_available=EXCLUDED.delivery_proof_available,
        performance_certificate_available=EXCLUDED.performance_certificate_available,
        dg_validated=false, validated_by=NULL, validated_at=NULL, updated_at=now()`, [
        documentId, experience.client || "", experience.subject || "", experience.sector || "",
        experience.productsServices || "", experience.contractNumber || "",
        experience.date || null, experience.executionPeriod || "", experience.value || "",
        experience.currency || "", experience.country || "", experience.executionStatus || "",
        experience.clientContact || "", Boolean(experience.deliveryProofAvailable),
        Boolean(experience.performanceCertificateAvailable)
      ]);
    }
    return getVersionWithClient(client, saved.rows[0].id);
  });
}

async function getVersionWithClient(client, versionId) {
  const result = await client.query(`
    SELECT d.id, d.title, d.category, d.description, d.category_code,
      d.document_type, d.reference_number, d.issuing_authority, d.source_label,
      d.lifecycle_status, d.extracted_metadata, d.validated_by, d.validated_at,
      d.organization_name, d.usable_for_tenders, d.storage_location,
      v.id AS version_id, v.version_label, v.source_filename, v.extension,
      v.mime_type, v.file_size, v.file_sha256, v.preview_text,
      v.issued_on, v.expires_on, v.notes, v.uploaded_by, v.created_at,
      octet_length(v.file_data) AS stored_bytes
      ,NULL::jsonb AS experience, '[]'::jsonb AS tender_uses
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
    description: item.description,
    previewText: item.previewText,
    notes: item.notes,
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
  await ensureInventorySchema();
  const result = await query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE expires_on IS NOT NULL AND expires_on < current_date)::int AS expired,
      count(*) FILTER (
        WHERE expires_on >= current_date AND expires_on <= current_date + interval '60 days'
      )::int AS expiring,
      count(*) FILTER (WHERE lifecycle_status = 'valid' AND (expires_on IS NULL OR expires_on > current_date + interval '60 days'))::int AS valid,
      count(*) FILTER (WHERE lifecycle_status = 'needs_review')::int AS needs_review,
      count(*) FILTER (WHERE category_code = '04-experience-references')::int AS experiences
    FROM (
      SELECT DISTINCT ON (v.document_id) v.document_id, v.expires_on,
        d.lifecycle_status, d.category_code
      FROM document_vault_versions v JOIN document_vault_documents d ON d.id = v.document_id
      ORDER BY v.document_id, v.created_at DESC, v.id DESC
    ) current_versions
  `);
  const links = await query("SELECT count(DISTINCT tender_reference)::int AS count FROM document_vault_tender_links");
  return {
    total: result.rows[0]?.total || 0,
    valid: result.rows[0]?.valid || 0,
    needsReview: result.rows[0]?.needs_review || 0,
    expired: result.rows[0]?.expired || 0,
    expiring: result.rows[0]?.expiring || 0,
    experiences: result.rows[0]?.experiences || 0,
    tendersUsingVault: links.rows[0]?.count || 0
  };
}

async function updateExperience(documentId, input, actorEmail) {
  await ensureInventorySchema();
  return transaction(async (client) => {
    const result = await client.query(`UPDATE document_vault_experiences SET
      client_name=$2, subject=$3, sector=$4, products_services=$5,
      contract_number=$6, contract_date=$7, execution_period=$8,
      contract_value=$9, currency=$10, country=$11, execution_status=$12,
      client_contact=$13, delivery_proof_available=$14,
      performance_certificate_available=$15, dg_validated=$16,
      validated_by=CASE WHEN $16 THEN $17 ELSE NULL END,
      validated_at=CASE WHEN $16 THEN now() ELSE NULL END, updated_at=now()
      WHERE document_id=$1 RETURNING document_id`, [
      documentId, input.clientName, input.subject, input.sector, input.productsServices,
      input.contractNumber, input.contractDate || null, input.executionPeriod,
      input.contractValue, input.currency, input.country, input.executionStatus,
      input.clientContact, input.deliveryProofAvailable, input.performanceCertificateAvailable,
      input.dgValidated, actorEmail
    ]);
    if (!result.rowCount) throw Object.assign(new Error("Expérience introuvable."), { code: "NOT_FOUND" });
    await client.query(`UPDATE document_vault_documents SET
      lifecycle_status=CASE WHEN $2 THEN 'valid' ELSE 'needs_review' END,
      validated_by=CASE WHEN $2 THEN $3 ELSE NULL END,
      validated_at=CASE WHEN $2 THEN now() ELSE NULL END, updated_at=now()
      WHERE id=$1`, [documentId, input.dgValidated, actorEmail]);
    return { documentId, validated: input.dgValidated };
  });
}

module.exports = {
  CATEGORIES,
  CATEGORY_CODES,
  LIFECYCLE_STATUSES,
  dashboardSummary,
  getVersion,
  listDocuments,
  listHistory,
  saveVersion,
  updateExperience,
  tenderInventory
};
