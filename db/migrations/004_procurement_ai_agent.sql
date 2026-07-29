CREATE TABLE IF NOT EXISTS procurement_ai_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  advantages jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  suppliers jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procurement_ai_searches_created_idx
  ON procurement_ai_searches(created_at DESC);
