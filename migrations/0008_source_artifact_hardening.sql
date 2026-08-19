BEGIN IMMEDIATE;

ALTER TABLE period_report ADD COLUMN pdf_byte_length INTEGER;

CREATE TRIGGER IF NOT EXISTS invoiced_milestone_no_update
BEFORE UPDATE ON project_milestone
WHEN OLD.invoice_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'invoiced milestone is immutable; create an adjustment');
END;

CREATE TRIGGER IF NOT EXISTS invoiced_milestone_no_delete
BEFORE DELETE ON project_milestone
WHEN OLD.invoice_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'invoiced milestone is immutable; create an adjustment');
END;

INSERT OR IGNORE INTO schema_migration VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
