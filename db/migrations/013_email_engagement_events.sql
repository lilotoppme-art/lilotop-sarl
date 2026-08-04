ALTER TABLE email_delivery_log
  DROP CONSTRAINT IF EXISTS email_delivery_log_status_check;

ALTER TABLE email_delivery_log
  ADD CONSTRAINT email_delivery_log_status_check CHECK (status IN (
    'accepted', 'sent', 'delivered', 'opened', 'clicked', 'deferred',
    'bounced', 'complained', 'suppressed', 'blocked', 'failed'
  ));
