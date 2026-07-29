CREATE TABLE IF NOT EXISTS nexus_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
  current_step text NOT NULL DEFAULT 'analyze'
    CHECK (current_step IN ('analyze', 'source-suppliers', 'prepare-rfqs', 'finalize', 'completed')),
  dossier jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_value numeric,
  currency text,
  last_error text,
  created_by text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_workflows_status_idx
  ON nexus_workflows(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS nexus_workflows_opportunity_idx
  ON nexus_workflows(opportunity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_workflow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES nexus_workflows(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  action_key text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  actor_email text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS nexus_workflow_actions_workflow_idx
  ON nexus_workflow_actions(workflow_id, started_at ASC);
CREATE INDEX IF NOT EXISTS nexus_workflow_actions_status_idx
  ON nexus_workflow_actions(status, started_at DESC);
