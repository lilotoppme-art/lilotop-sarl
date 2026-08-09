"use strict";

const { query, transaction } = require("../business-radar/db");

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
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_name, platform)
      );
      ALTER TABLE nexus_organization_credentials
        ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
      CREATE TABLE IF NOT EXISTS nexus_organization_credential_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_id uuid REFERENCES nexus_organization_credentials(id) ON DELETE SET NULL,
        organization_name text NOT NULL,
        platform text NOT NULL,
        changed_by text NOT NULL,
        old_value jsonb,
        new_value jsonb NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS nexus_organization_credential_history_lookup_idx
        ON nexus_organization_credential_history(organization_name, platform, changed_at DESC)
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
    details: row.details || {},
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at
  } : null;
}

async function confirmCredential(input, actorEmail) {
  await ensureSchema();
  const details = input.details || {};
  return transaction(async (client) => {
    const previous = await client.query(`
      SELECT * FROM nexus_organization_credentials
      WHERE organization_name=$1 AND platform=$2
      FOR UPDATE
    `, [input.organizationName, input.platform]);
    const result = await client.query(`
      INSERT INTO nexus_organization_credentials (
        organization_name, platform, registration_status, registration_number,
        confirmation_source, confirmed_by, details
      ) VALUES ($1,$2,$3,$4,'user-confirmed',$5,$6::jsonb)
      ON CONFLICT (organization_name, platform) DO UPDATE SET
        registration_status=EXCLUDED.registration_status,
        registration_number=EXCLUDED.registration_number,
        confirmation_source=EXCLUDED.confirmation_source,
        confirmed_by=EXCLUDED.confirmed_by,
        details=EXCLUDED.details,
        confirmed_at=now(),
        updated_at=now()
      RETURNING *
    `, [input.organizationName, input.platform, input.status, input.registrationNumber, actorEmail, JSON.stringify(details)]);
    const oldValue = previous.rows[0] ? {
      status: previous.rows[0].registration_status,
      registrationNumber: previous.rows[0].registration_number,
      details: previous.rows[0].details || {}
    } : null;
    const newValue = {
      status: input.status,
      registrationNumber: input.registrationNumber,
      details
    };
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      await client.query(`
        INSERT INTO nexus_organization_credential_history (
          credential_id, organization_name, platform, changed_by, old_value, new_value
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
      `, [result.rows[0].id, input.organizationName, input.platform, actorEmail,
        oldValue ? JSON.stringify(oldValue) : null, JSON.stringify(newValue)]);
    }
    return mapCredential(result.rows[0]);
  });
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
