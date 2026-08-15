ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS category_code text NOT NULL DEFAULT '07-other';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT '';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT '';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS issuing_authority text NOT NULL DEFAULT '';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS source_label text NOT NULL DEFAULT 'Import DG';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'valid';
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS validated_by text;
ALTER TABLE document_vault_documents
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;

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
  tender_reference text NOT NULL,
  requirement_label text NOT NULL DEFAULT '',
  compliance_status text NOT NULL DEFAULT 'needs_review',
  finalization_status text NOT NULL DEFAULT 'not_finalized',
  justification text NOT NULL DEFAULT '',
  linked_by text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, tender_reference, requirement_label)
);

CREATE TABLE IF NOT EXISTS document_vault_experiences (
  document_id uuid PRIMARY KEY REFERENCES document_vault_documents(id) ON DELETE RESTRICT,
  client_name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  products_services text NOT NULL DEFAULT '',
  contract_number text NOT NULL DEFAULT '',
  contract_date date,
  execution_period text NOT NULL DEFAULT '',
  contract_value text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  execution_status text NOT NULL DEFAULT '',
  client_contact text NOT NULL DEFAULT '',
  delivery_proof_available boolean NOT NULL DEFAULT false,
  performance_certificate_available boolean NOT NULL DEFAULT false,
  dg_validated boolean NOT NULL DEFAULT false,
  validated_by text,
  validated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_vault_tender_links_reference_idx
  ON document_vault_tender_links(tender_reference, compliance_status);

WITH latest AS (
  SELECT DISTINCT ON (v.document_id) v.document_id,
    lower(d.title || ' ' || d.description || ' ' || v.preview_text) AS content
  FROM document_vault_versions v
  JOIN document_vault_documents d ON d.id = v.document_id
  ORDER BY v.document_id, v.created_at DESC, v.id DESC
)
UPDATE document_vault_documents d SET category_code = CASE
  WHEN latest.content ~ '(rccm|id[[:space:]]*nat|identification nationale|nif|statuts?)' THEN '01-legal-identity'
  WHEN latest.content ~ '(organigramme|profil société|company profile|curriculum|délégation|pouvoir du signataire)' THEN '05-lilotop-organization'
  WHEN latest.content ~ '(contrat|purchase order|bon de commande|preuve de livraison|bonne exécution|facture|référence client)' THEN '04-experience-references'
  WHEN latest.content ~ '(arsp|fiscal|cnss|inpp|hse|attestation|licence|agrément)' THEN '02-compliance'
  WHEN latest.content ~ '(banque|bancaire|états financiers|capacité financière|garantie)' THEN '03-bank-finance'
  WHEN latest.content ~ '(oem|fabricant|distributeur|partenariat|catalogue|datasheet|fiche technique)' THEN '06-suppliers-partners'
  ELSE '07-other' END
FROM latest WHERE d.id = latest.document_id AND d.category_code = '07-other';

UPDATE document_vault_documents
SET lifecycle_status='archived', usable_for_tenders=false, updated_at=now()
WHERE title ILIKE 'DOCUMENT TEST COFFRE%';
