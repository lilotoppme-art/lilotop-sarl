CREATE TABLE IF NOT EXISTS tender_response_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'docx', 'zip')),
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_documents_declared jsonb NOT NULL DEFAULT '[]'::jsonb,
  executive_summary text NOT NULL,
  key_information jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance jsonb NOT NULL DEFAULT '{}'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'archived')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tender_response_created_idx
  ON tender_response_analyses(created_at DESC);
