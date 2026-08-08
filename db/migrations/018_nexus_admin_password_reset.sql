CREATE TABLE IF NOT EXISTS nexus_admin_accounts (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
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
    'password_reset_requested',
    'password_reset_email_sent',
    'password_reset_email_failed',
    'password_reset_rejected',
    'password_reset_completed'
  )),
  admin_email text,
  actor_ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_admin_security_log_created_idx
  ON nexus_admin_security_log(created_at DESC);
