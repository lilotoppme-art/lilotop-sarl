ALTER TABLE nexus_admin_accounts
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE nexus_admin_accounts
  ADD COLUMN IF NOT EXISTS temporary_password_set_at timestamptz;
