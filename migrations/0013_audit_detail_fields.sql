BEGIN IMMEDIATE;

ALTER TABLE audit_event ADD COLUMN project_id TEXT REFERENCES project(id);
ALTER TABLE audit_event ADD COLUMN before_json TEXT;
ALTER TABLE audit_event ADD COLUMN after_json TEXT;
ALTER TABLE audit_event ADD COLUMN reason TEXT;
ALTER TABLE audit_event ADD COLUMN correlation_id TEXT;
ALTER TABLE audit_event ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS audit_project_time_idx ON audit_event(project_id,occurred_at);
CREATE INDEX IF NOT EXISTS audit_correlation_idx ON audit_event(correlation_id,occurred_at);

INSERT OR IGNORE INTO schema_migration VALUES (13, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
