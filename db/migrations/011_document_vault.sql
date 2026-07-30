CREATE TABLE IF NOT EXISTS document_vault_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'administrative', 'legal', 'fiscal', 'hse', 'technical',
    'financial', 'certification', 'reference', 'other'
  )),
  description text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_vault_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_vault_documents(id) ON DELETE RESTRICT,
  version_label text NOT NULL,
  source_filename text NOT NULL,
  extension text NOT NULL CHECK (extension IN ('pdf', 'docx', 'xlsx', 'zip')),
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  file_sha256 text NOT NULL,
  file_data bytea NOT NULL,
  preview_text text NOT NULL DEFAULT '',
  issued_on date,
  expires_on date,
  notes text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_vault_dates_check
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
  CONSTRAINT document_vault_version_unique
    UNIQUE (document_id, version_label)
);

CREATE INDEX IF NOT EXISTS document_vault_documents_search_idx
  ON document_vault_documents(category, updated_at DESC);

CREATE INDEX IF NOT EXISTS document_vault_versions_document_idx
  ON document_vault_versions(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_vault_versions_expiry_idx
  ON document_vault_versions(expires_on);
