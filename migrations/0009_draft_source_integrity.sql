BEGIN IMMEDIATE;

-- A draft or approved invoice reserves its source rows.  Period close is
-- allowed to add billing-lock metadata, but a user must not change the
-- business values after the invoice line snapshot was calculated.
CREATE TRIGGER IF NOT EXISTS draft_invoice_time_source_no_update
BEFORE UPDATE ON time_entry
WHEN EXISTS (
  SELECT 1
  FROM invoice_source s
  JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='time'
    AND s.source_id=OLD.id
    AND i.state IN ('draft','approved')
)
AND (
  NEW.project_id IS NOT OLD.project_id OR
  NEW.worker_id IS NOT OLD.worker_id OR
  NEW.work_date IS NOT OLD.work_date OR
  NEW.category IS NOT OLD.category OR
  NEW.activity_summary IS NOT OLD.activity_summary OR
  NEW.activity_code IS NOT OLD.activity_code OR
  NEW.minutes IS NOT OLD.minutes OR
  NEW.site IS NOT OLD.site OR
  NEW.start_time IS NOT OLD.start_time OR
  NEW.end_time IS NOT OLD.end_time OR
  NEW.break_minutes IS NOT OLD.break_minutes
)
BEGIN
  SELECT RAISE(ABORT,'draft invoice time source is immutable');
END;

CREATE TRIGGER IF NOT EXISTS draft_invoice_time_source_no_delete
BEFORE DELETE ON time_entry
WHEN EXISTS (
  SELECT 1
  FROM invoice_source s
  JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='time'
    AND s.source_id=OLD.id
    AND i.state IN ('draft','approved')
)
BEGIN
  SELECT RAISE(ABORT,'draft invoice time source is immutable');
END;

CREATE TRIGGER IF NOT EXISTS draft_invoice_expense_source_no_update
BEFORE UPDATE ON expense
WHEN EXISTS (
  SELECT 1
  FROM invoice_source s
  JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='expense'
    AND s.source_id=OLD.id
    AND i.state IN ('draft','approved')
)
AND (
  NEW.project_id IS NOT OLD.project_id OR
  NEW.worker_id IS NOT OLD.worker_id OR
  NEW.spent_on IS NOT OLD.spent_on OR
  NEW.category IS NOT OLD.category OR
  NEW.vendor IS NOT OLD.vendor OR
  NEW.description IS NOT OLD.description OR
  NEW.currency IS NOT OLD.currency OR
  NEW.amount_minor IS NOT OLD.amount_minor OR
  NEW.client_treatment IS NOT OLD.client_treatment OR
  NEW.who_paid IS NOT OLD.who_paid OR
  NEW.payment_method IS NOT OLD.payment_method OR
  NEW.receipt_required IS NOT OLD.receipt_required OR
  NEW.receipt_document_id IS NOT OLD.receipt_document_id OR
  NEW.tax_amount_minor IS NOT OLD.tax_amount_minor OR
  NEW.markup_bps IS NOT OLD.markup_bps OR
  NEW.project_currency_amount_minor IS NOT OLD.project_currency_amount_minor OR
  NEW.billing_treatment IS NOT OLD.billing_treatment OR
  NEW.billing_amount_minor IS NOT OLD.billing_amount_minor OR
  NEW.fx_rate_bps IS NOT OLD.fx_rate_bps
)
BEGIN
  SELECT RAISE(ABORT,'draft invoice expense source is immutable');
END;

CREATE TRIGGER IF NOT EXISTS draft_invoice_expense_source_no_delete
BEFORE DELETE ON expense
WHEN EXISTS (
  SELECT 1
  FROM invoice_source s
  JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='expense'
    AND s.source_id=OLD.id
    AND i.state IN ('draft','approved')
)
BEGIN
  SELECT RAISE(ABORT,'draft invoice expense source is immutable');
END;

INSERT OR IGNORE INTO schema_migration VALUES (9, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
