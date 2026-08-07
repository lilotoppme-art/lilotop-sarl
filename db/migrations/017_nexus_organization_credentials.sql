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
);

