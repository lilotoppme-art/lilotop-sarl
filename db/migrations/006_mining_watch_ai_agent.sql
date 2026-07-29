CREATE TABLE IF NOT EXISTS mining_ai_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  watch_summary text NOT NULL,
  global_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  global_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mining_ai_searches_created_at_idx
  ON mining_ai_searches (created_at DESC);
