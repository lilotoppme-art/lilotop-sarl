ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS opportunities_favorite_idx
  ON opportunities(is_favorite, score DESC)
  WHERE is_favorite = true;

CREATE TABLE IF NOT EXISTS opportunity_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  author_email text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_notes_opportunity_idx
  ON opportunity_notes(opportunity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_attachments_opportunity_idx
  ON opportunity_attachments(opportunity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_idx
  ON notifications(opportunity_id, subject)
  WHERE status IN ('pending', 'sent');
