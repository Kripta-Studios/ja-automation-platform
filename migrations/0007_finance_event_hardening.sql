BEGIN IMMEDIATE;

-- Payment events are part of the invoice audit trail. Rebuild the small event
-- table so the CHECK constraint covers the complete lifecycle without making
-- issued invoice snapshots mutable.
CREATE TABLE invoice_event_v7 (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('sent','payment','void','credit','adjustment')),
  amount_minor INTEGER,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES user(id),
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
) STRICT;

INSERT INTO invoice_event_v7(
  id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key
)
SELECT id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key
FROM invoice_event;

DROP TABLE invoice_event;
ALTER TABLE invoice_event_v7 RENAME TO invoice_event;
CREATE INDEX IF NOT EXISTS invoice_event_invoice_idx ON invoice_event(invoice_id,occurred_at);

DROP TRIGGER IF EXISTS issued_invoice_source_no_update;
CREATE TRIGGER issued_invoice_source_no_update
BEFORE UPDATE ON invoice_source
WHEN EXISTS (
  SELECT 1 FROM invoice
  WHERE invoice.id=OLD.invoice_id
    AND invoice.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
)
 AND (
   NEW.invoice_id IS NOT OLD.invoice_id OR
   NEW.source_type IS NOT OLD.source_type OR
   NEW.source_id IS NOT OLD.source_id OR
   NEW.source_version IS NOT OLD.source_version OR
   (OLD.locked_at IS NOT NULL AND NEW.locked_at IS NOT OLD.locked_at)
 )
BEGIN
  SELECT RAISE(ABORT,'issued invoice sources are immutable');
END;

INSERT OR IGNORE INTO schema_migration VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
