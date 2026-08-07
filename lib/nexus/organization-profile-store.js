"use strict";

const { query } = require("../business-radar/db");

let schemaPromise;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = query(`
      CREATE TABLE IF NOT EXISTS nexus_organization_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_name text NOT NULL,
        platform text NOT NULL,
        registration_status text NOT NULL,
        registration_number text NOT NULL,
        evidence_document_id uuid REFERENCES document_vault_documents(id) ON DELETE SET NULL,
        confirmation_source text NOT NULL DEFAULT 'user-confirmed',
        confirmed_by text NOT NULL,
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_name, platform)
      )
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function mapCredential(row) {
  return row ? {
    id: row.id,
    organizationName: row.organization_name,
    platform: row.platform,
    status: row.registration_status,
    registrationNumber: row.registration_number,
    evidenceDocumentId: row.evidence_document_id,
    evidencePresent: Boolean(row.evidence_document_id),
    confirmationSource: row.confirmation_source,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at
  } : null;
}

async function confirmCredential(input, actorEmail) {
  await ensureSchema();
  const result = await query(`
    INSERT INTO nexus_organization_credentials (
      organization_name, platform, registration_status, registration_number,
      confirmation_source, confirmed_by
    ) VALUES ($1,$2,$3,$4,'user-confirmed',$5)
    ON CONFLICT (organization_name, platform) DO UPDATE SET
      registration_status=EXCLUDED.registration_status,
      registration_number=EXCLUDED.registration_number,
      confirmation_source=EXCLUDED.confirmation_source,
      confirmed_by=EXCLUDED.confirmed_by,
      updated_at=now()
    RETURNING *
  `, [input.organizationName, input.platform, input.status, input.registrationNumber, actorEmail]);
  return mapCredential(result.rows[0]);
}

async function getCredential(organizationName, platform) {
  await ensureSchema();
  const result = await query(`
    SELECT * FROM nexus_organization_credentials
    WHERE organization_name=$1 AND platform=$2
    LIMIT 1
  `, [organizationName, platform]);
  return mapCredential(result.rows[0]);
}

module.exports = { confirmCredential, getCredential };

