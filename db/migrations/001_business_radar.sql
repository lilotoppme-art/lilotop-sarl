CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('demo', 'rss', 'html', 'manual')),
  url text,
  country text,
  active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  external_id text,
  source_type text NOT NULL DEFAULT 'manual',
  is_demo boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  organization text,
  country text,
  sector text,
  opportunity_type text,
  description text,
  source_url text,
  published_at timestamptz,
  deadline_at timestamptz,
  estimated_value numeric,
  currency text,
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  ai_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_mode text NOT NULL DEFAULT 'no_ai',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'qualified', 'monitoring', 'submitted', 'won', 'lost', 'archived')),
  fingerprint text NOT NULL UNIQUE,
  tags text[] NOT NULL DEFAULT '{}',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunities_deadline_idx ON opportunities(deadline_at);
CREATE INDEX IF NOT EXISTS opportunities_score_idx ON opportunities(score DESC);
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities(status);

CREATE TABLE IF NOT EXISTS supplier_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  country text,
  categories text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'approved', 'rejected', 'archived')),
  notes text,
  source_reference text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radar_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'test')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  sources_checked integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
