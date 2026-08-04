CREATE TABLE IF NOT EXISTS email_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  sender text NOT NULL,
  reply_to text,
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN (
    'accepted', 'sent', 'delivered', 'deferred', 'bounced',
    'complained', 'suppressed', 'blocked', 'failed'
  )),
  provider_message_id text UNIQUE,
  provider_event_id text,
  error_code text,
  error_message text,
  bounce_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_delivery_log_created_idx
  ON email_delivery_log(created_at DESC);

CREATE INDEX IF NOT EXISTS email_delivery_log_status_idx
  ON email_delivery_log(status, created_at DESC);

CREATE TABLE IF NOT EXISTS email_delivery_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  provider_message_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);
