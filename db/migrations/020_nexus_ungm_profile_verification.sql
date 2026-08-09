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
  ON nexus_organization_credential_history(organization_name, platform, changed_at DESC);
