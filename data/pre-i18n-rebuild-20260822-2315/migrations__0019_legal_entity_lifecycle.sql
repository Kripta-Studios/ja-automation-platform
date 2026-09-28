BEGIN IMMEDIATE;

-- Legal entities are referenced by billing rules and tax profiles. Keep their
-- history and make deactivation explicit instead of allowing hard deletion.
ALTER TABLE legal_entity ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK(status IN ('active','archived'));

CREATE INDEX IF NOT EXISTS legal_entity_status_idx ON legal_entity(status,code);

INSERT OR IGNORE INTO schema_migration VALUES (19, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
