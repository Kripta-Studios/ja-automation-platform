BEGIN IMMEDIATE;

CREATE TRIGGER IF NOT EXISTS audit_event_no_update
BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT,'audit events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_event_no_delete
BEFORE DELETE ON audit_event
BEGIN
  SELECT RAISE(ABORT,'audit events are immutable');
END;

INSERT OR IGNORE INTO schema_migration VALUES (20, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
