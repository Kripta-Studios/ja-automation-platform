BEGIN IMMEDIATE;

-- V3 hardening: one source record can belong to one invoice draft or issued
-- invoice at a time. Corrections use adjustment documents instead of a second
-- invoice pointing at the same operational source.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_source_authoritative_unique
  ON invoice_source(source_type, source_id);

DROP TRIGGER IF EXISTS issued_invoice_snapshot_no_update;
CREATE TRIGGER IF NOT EXISTS issued_invoice_snapshot_no_update
BEFORE UPDATE ON invoice
WHEN OLD.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
 AND (
   NEW.project_id IS NOT OLD.project_id OR
   NEW.billing_rule_id IS NOT OLD.billing_rule_id OR
   NEW.invoice_number IS NOT OLD.invoice_number OR
   NEW.stream_type IS NOT OLD.stream_type OR
   NEW.currency IS NOT OLD.currency OR
   NEW.subtotal_minor IS NOT OLD.subtotal_minor OR
   NEW.tax_minor IS NOT OLD.tax_minor OR
   NEW.total_minor IS NOT OLD.total_minor OR
   NEW.issued_at IS NOT OLD.issued_at OR
   NEW.due_at IS NOT OLD.due_at OR
   NEW.period_start IS NOT OLD.period_start OR
   NEW.period_end IS NOT OLD.period_end OR
   NEW.snapshot_json IS NOT OLD.snapshot_json OR
   NEW.calculation_hash IS NOT OLD.calculation_hash
 )
BEGIN
  SELECT RAISE(ABORT,'issued invoice snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS issued_invoice_source_no_update
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

CREATE TRIGGER IF NOT EXISTS issued_invoice_source_no_delete
BEFORE DELETE ON invoice_source
WHEN EXISTS (
  SELECT 1 FROM invoice
  WHERE invoice.id=OLD.invoice_id
    AND invoice.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN
  SELECT RAISE(ABORT,'issued invoice sources are immutable');
END;

CREATE TABLE IF NOT EXISTS invoice_adjustment (
  id TEXT PRIMARY KEY,
  original_invoice_id TEXT NOT NULL REFERENCES invoice(id),
  adjustment_invoice_id TEXT NOT NULL UNIQUE REFERENCES invoice(id),
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('credit','debit','correction')),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS project_closeout (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES project(id),
  state TEXT NOT NULL CHECK(state IN ('draft','review','final','reopened')),
  snapshot_json TEXT NOT NULL,
  document_manifest_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reopened_by TEXT REFERENCES user(id),
  reopened_at TEXT,
  reopen_reason TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS audit_entity_time_idx
  ON audit_event(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS time_billing_lookup_idx
  ON time_entry(project_id, work_date, approval_state, billability_state, billing_status);
CREATE INDEX IF NOT EXISTS expense_billing_lookup_idx
  ON expense(project_id, spent_on, approval_state, billing_treatment, billing_state);

INSERT OR IGNORE INTO schema_migration VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
