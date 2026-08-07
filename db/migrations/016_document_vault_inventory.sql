ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS organization_name text NOT NULL DEFAULT 'LILOTOP SARL';

ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS usable_for_tenders boolean NOT NULL DEFAULT false;

ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS storage_location text NOT NULL DEFAULT 'Neon PostgreSQL / document_vault_versions.file_data';

COMMENT ON COLUMN document_vault_documents.usable_for_tenders IS
  'Explicit human classification. Runtime inventory still verifies that file bytes are present.';
