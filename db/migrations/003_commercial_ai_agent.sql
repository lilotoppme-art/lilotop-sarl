CREATE TABLE IF NOT EXISTS commercial_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  classification text NOT NULL CHECK (
    classification IN ('Très prioritaire', 'Prioritaire', 'Moyen', 'Faible')
  ),
  executive_summary text NOT NULL,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_ai_analyses_opportunity_idx
  ON commercial_ai_analyses(opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_ai_analyses_priority_idx
  ON commercial_ai_analyses(classification, created_at DESC);
