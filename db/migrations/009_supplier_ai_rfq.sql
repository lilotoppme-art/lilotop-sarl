CREATE TABLE IF NOT EXISTS supplier_ai_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  suppliers jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_ai_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES supplier_ai_searches(id) ON DELETE RESTRICT,
  supplier_key text NOT NULL,
  supplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject text NOT NULL,
  description text NOT NULL,
  quantity text NOT NULL,
  incoterm text NOT NULL,
  desired_delivery text NOT NULL,
  payment_terms text NOT NULL,
  email_body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'opened', 'sent', 'responded')),
  created_by text NOT NULL,
  opened_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_ai_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  supplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_key, created_by)
);

CREATE INDEX IF NOT EXISTS supplier_ai_searches_created_idx
  ON supplier_ai_searches(created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_ai_rfqs_created_idx
  ON supplier_ai_rfqs(created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_ai_rfqs_status_idx
  ON supplier_ai_rfqs(status);
