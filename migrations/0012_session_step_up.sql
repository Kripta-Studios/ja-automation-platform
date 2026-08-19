BEGIN IMMEDIATE;

-- Step-up authentication belongs to one authenticated session.  The legacy
-- user-level timestamp remains for historical compatibility but is no longer
-- consulted by protected operations.
ALTER TABLE session ADD COLUMN step_up_at TEXT;

INSERT OR IGNORE INTO schema_migration VALUES (12, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
