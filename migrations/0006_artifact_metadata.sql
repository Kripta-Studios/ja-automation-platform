BEGIN IMMEDIATE;

ALTER TABLE invoice ADD COLUMN pdf_byte_length INTEGER;

INSERT OR IGNORE INTO schema_migration VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
