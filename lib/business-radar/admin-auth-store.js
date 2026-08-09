"use strict";

const { query, transaction } = require("./db");

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS nexus_admin_accounts (
      email text PRIMARY KEY,
      password_hash text NOT NULL,
      must_change_password boolean NOT NULL DEFAULT false,
      temporary_password_set_at timestamptz,
      password_changed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS nexus_admin_password_resets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL REFERENCES nexus_admin_accounts(email) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      invalidated_at timestamptz,
      requested_ip_hash text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS nexus_admin_password_resets_lookup_idx
      ON nexus_admin_password_resets(token_hash, expires_at)
      WHERE used_at IS NULL AND invalidated_at IS NULL;
    CREATE TABLE IF NOT EXISTS nexus_admin_security_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL CHECK (event_type IN (
        'password_reset_requested','password_reset_email_sent',
        'password_reset_email_failed','password_reset_rejected',
        'password_reset_completed'
      )),
      admin_email text,
      actor_ip_hash text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS nexus_admin_security_log_created_idx
      ON nexus_admin_security_log(created_at DESC);
    ALTER TABLE nexus_admin_accounts
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    ALTER TABLE nexus_admin_accounts
      ADD COLUMN IF NOT EXISTS temporary_password_set_at timestamptz;
  `);
  schemaReady = true;
}

async function ensureAccount(email, initialPasswordHash) {
  await ensureSchema();
  await query(`
    INSERT INTO nexus_admin_accounts (email, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (email) DO NOTHING
  `, [email, initialPasswordHash]);
}

async function activePasswordHash(email, initialPasswordHash) {
  const credentials = await activeCredentials(email, initialPasswordHash);
  return credentials.passwordHash;
}

async function activeCredentials(email, initialPasswordHash) {
  await ensureAccount(email, initialPasswordHash);
  const result = await query(`
    SELECT password_hash, must_change_password
    FROM nexus_admin_accounts
    WHERE email = $1
  `, [email]);
  return {
    passwordHash: result.rows[0]?.password_hash || initialPasswordHash,
    mustChangePassword: Boolean(result.rows[0]?.must_change_password)
  };
}

async function setTemporaryPassword({ email, initialPasswordHash, temporaryPasswordHash }) {
  await ensureAccount(email, initialPasswordHash);
  return transaction(async (client) => {
    await client.query(`
      UPDATE nexus_admin_accounts
      SET password_hash = $2,
          must_change_password = true,
          temporary_password_set_at = now(),
          password_changed_at = now(),
          updated_at = now()
      WHERE email = $1
    `, [email, temporaryPasswordHash]);
    await client.query(`
      UPDATE nexus_admin_password_resets
      SET invalidated_at = now()
      WHERE email = $1 AND used_at IS NULL AND invalidated_at IS NULL
    `, [email]);
    await client.query(`
      INSERT INTO nexus_admin_security_log (event_type, admin_email, metadata)
      VALUES ('password_reset_completed', $1, '{"mode":"temporary_password_rotation"}'::jsonb)
    `, [email]);
    return { email, mustChangePassword: true };
  });
}

async function createReset({ email, initialPasswordHash, tokenHash, expiresAt, ipHash }) {
  await ensureAccount(email, initialPasswordHash);
  return transaction(async (client) => {
    await client.query(`
      UPDATE nexus_admin_password_resets
      SET invalidated_at = now()
      WHERE email = $1 AND used_at IS NULL AND invalidated_at IS NULL
    `, [email]);
    const result = await client.query(`
      INSERT INTO nexus_admin_password_resets (email, token_hash, expires_at, requested_ip_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, expires_at
    `, [email, tokenHash, expiresAt, ipHash || null]);
    await client.query(`
      INSERT INTO nexus_admin_security_log (event_type, admin_email, actor_ip_hash)
      VALUES ('password_reset_requested', $1, $2)
    `, [email, ipHash || null]);
    return result.rows[0];
  });
}

async function recordEvent(eventType, email, ipHash, metadata = {}) {
  await ensureSchema();
  await query(`
    INSERT INTO nexus_admin_security_log (event_type, admin_email, actor_ip_hash, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
  `, [eventType, email || null, ipHash || null, JSON.stringify(metadata)]);
}

async function consumeReset({ tokenHash, newPasswordHash, ipHash }) {
  await ensureSchema();
  return transaction(async (client) => {
    const tokenResult = await client.query(`
      SELECT id, email
      FROM nexus_admin_password_resets
      WHERE token_hash = $1
        AND used_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > now()
      FOR UPDATE
    `, [tokenHash]);
    const token = tokenResult.rows[0];
    if (!token) return null;

    await client.query(`
      UPDATE nexus_admin_accounts
      SET password_hash = $2,
          must_change_password = false,
          temporary_password_set_at = NULL,
          password_changed_at = now(),
          updated_at = now()
      WHERE email = $1
    `, [token.email, newPasswordHash]);
    await client.query(`
      UPDATE nexus_admin_password_resets
      SET used_at = CASE WHEN id = $2 THEN now() ELSE used_at END,
          invalidated_at = CASE WHEN id <> $2 AND used_at IS NULL THEN now() ELSE invalidated_at END
      WHERE email = $1 AND (id = $2 OR (used_at IS NULL AND invalidated_at IS NULL))
    `, [token.email, token.id]);
    await client.query(`
      INSERT INTO nexus_admin_security_log (event_type, admin_email, actor_ip_hash)
      VALUES ('password_reset_completed', $1, $2)
    `, [token.email, ipHash || null]);
    return { email: token.email };
  });
}

module.exports = {
  activeCredentials,
  activePasswordHash,
  consumeReset,
  createReset,
  ensureAccount,
  ensureSchema,
  recordEvent,
  setTemporaryPassword
};
