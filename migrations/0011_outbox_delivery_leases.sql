BEGIN IMMEDIATE;

ALTER TABLE outbox_event ADD COLUMN lease_until TEXT;
ALTER TABLE outbox_event ADD COLUMN last_error TEXT;
ALTER TABLE outbox_event ADD COLUMN failed_at TEXT;

CREATE INDEX IF NOT EXISTS outbox_due_idx
  ON outbox_event(delivered_at,failed_at,available_at,lease_until,attempts);

INSERT OR IGNORE INTO schema_migration VALUES (11, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
