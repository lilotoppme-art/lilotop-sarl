CREATE TABLE IF NOT EXISTS nexus_workflow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES nexus_workflows(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  final_url text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
  sha256 text NOT NULL,
  extracted_text text NOT NULL,
  file_data bytea NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, sha256)
);

CREATE INDEX IF NOT EXISTS nexus_workflow_documents_workflow_idx
  ON nexus_workflow_documents(workflow_id, retrieved_at ASC);

