CREATE TABLE IF NOT EXISTS commercial_ai_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type text NOT NULL CHECK (work_type IN ('email', 'tender', 'offer', 'quote', 'followup')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'archived')),
  input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'approved', 'rejected')),
  created_by text NOT NULL,
  validated_by text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  related_work_id uuid REFERENCES commercial_ai_work_items(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  completed_by text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_ai_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_ai_work_items_created_idx
  ON commercial_ai_work_items(created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_ai_tasks_due_idx
  ON commercial_ai_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS commercial_ai_activity_created_idx
  ON commercial_ai_activity(created_at DESC);
