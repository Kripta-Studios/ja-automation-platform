BEGIN IMMEDIATE;

ALTER TABLE client ADD COLUMN billing_email TEXT;
ALTER TABLE client ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK(payment_terms_days BETWEEN 0 AND 365);

ALTER TABLE project ADD COLUMN description TEXT;
ALTER TABLE project ADD COLUMN site_name TEXT;
ALTER TABLE project ADD COLUMN country TEXT;
ALTER TABLE project ADD COLUMN project_manager_id TEXT REFERENCES user(id);
ALTER TABLE project ADD COLUMN expected_minutes_per_day INTEGER NOT NULL DEFAULT 600 CHECK(expected_minutes_per_day BETWEEN 0 AND 1440);
ALTER TABLE project ADD COLUMN client_daily_minimum_minutes INTEGER CHECK(client_daily_minimum_minutes BETWEEN 0 AND 1440);
ALTER TABLE project ADD COLUMN revenue_budget_minor INTEGER CHECK(revenue_budget_minor >= 0);
ALTER TABLE project ADD COLUMN po_cap_minor INTEGER CHECK(po_cap_minor >= 0);
ALTER TABLE project ADD COLUMN labor_budget_minutes INTEGER CHECK(labor_budget_minutes >= 0);
ALTER TABLE project ADD COLUMN travel_budget_minor INTEGER CHECK(travel_budget_minor >= 0);
ALTER TABLE project ADD COLUMN po_number TEXT;
ALTER TABLE project ADD COLUMN daily_report_required INTEGER NOT NULL DEFAULT 0 CHECK(daily_report_required IN (0,1));
ALTER TABLE project ADD COLUMN technical_reporting_required INTEGER NOT NULL DEFAULT 0 CHECK(technical_reporting_required IN (0,1));

ALTER TABLE project_member ADD COLUMN planned_minutes INTEGER CHECK(planned_minutes >= 0);
ALTER TABLE project_member ADD COLUMN can_submit_technical_report INTEGER NOT NULL DEFAULT 0 CHECK(can_submit_technical_report IN (0,1));
ALTER TABLE project_member ADD COLUMN can_review INTEGER NOT NULL DEFAULT 0 CHECK(can_review IN (0,1));
ALTER TABLE project_member ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE time_entry ADD COLUMN project_timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE time_entry ADD COLUMN activity_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE time_entry ADD COLUMN submitted_at TEXT;
ALTER TABLE time_entry ADD COLUMN approved_by TEXT REFERENCES user(id);
ALTER TABLE time_entry ADD COLUMN approved_at TEXT;
ALTER TABLE time_entry ADD COLUMN finance_approved_by TEXT REFERENCES user(id);
ALTER TABLE time_entry ADD COLUMN finance_approved_at TEXT;

ALTER TABLE expense ADD COLUMN vendor TEXT NOT NULL DEFAULT '';
ALTER TABLE expense ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE expense ADD COLUMN who_paid TEXT NOT NULL DEFAULT 'worker';
ALTER TABLE expense ADD COLUMN receipt_document_id TEXT REFERENCES document(id);
ALTER TABLE expense ADD COLUMN receipt_required INTEGER NOT NULL DEFAULT 0 CHECK(receipt_required IN (0,1));
ALTER TABLE expense ADD COLUMN reimbursement_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE expense ADD COLUMN submitted_at TEXT;
ALTER TABLE expense ADD COLUMN approved_by TEXT REFERENCES user(id);
ALTER TABLE expense ADD COLUMN approved_at TEXT;
ALTER TABLE expense ADD COLUMN finance_approved_by TEXT REFERENCES user(id);
ALTER TABLE expense ADD COLUMN finance_approved_at TEXT;

ALTER TABLE compensation_rule ADD COLUMN daily_guarantee_minutes INTEGER CHECK(daily_guarantee_minutes BETWEEN 0 AND 1440);
ALTER TABLE compensation_rule ADD COLUMN worker_visible INTEGER NOT NULL DEFAULT 1 CHECK(worker_visible IN (0,1));
ALTER TABLE compensation_rule ADD COLUMN created_at TEXT;
ALTER TABLE compensation_rule ADD COLUMN updated_at TEXT;

ALTER TABLE billing_rule ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));
ALTER TABLE billing_rule ADD COLUMN grouping_mode TEXT NOT NULL DEFAULT 'summary';
ALTER TABLE billing_rule ADD COLUMN created_at TEXT;
ALTER TABLE billing_rule ADD COLUMN updated_at TEXT;

ALTER TABLE invoice ADD COLUMN billing_rule_id TEXT REFERENCES billing_rule(id);
ALTER TABLE invoice ADD COLUMN period_start TEXT;
ALTER TABLE invoice ADD COLUMN period_end TEXT;
ALTER TABLE invoice ADD COLUMN due_at TEXT;
ALTER TABLE invoice ADD COLUMN calculation_hash TEXT;

CREATE TABLE IF NOT EXISTS client_labor_rate (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  worker_id TEXT REFERENCES user(id),
  category TEXT,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  hourly_rate_minor INTEGER NOT NULL CHECK(hourly_rate_minor >= 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX IF NOT EXISTS client_labor_rate_lookup_idx ON client_labor_rate(project_id,worker_id,effective_from,effective_to);

CREATE TABLE IF NOT EXISTS internal_cost_rule (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES user(id),
  project_id TEXT REFERENCES project(id),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  hourly_rate_minor INTEGER NOT NULL CHECK(hourly_rate_minor >= 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE IF NOT EXISTS legal_entity (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  billing_address TEXT NOT NULL,
  company_identifiers TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE IF NOT EXISTS invoice_number_policy (
  id TEXT PRIMARY KEY,
  legal_entity_id TEXT NOT NULL REFERENCES legal_entity(id),
  prefix TEXT NOT NULL,
  digits INTEGER NOT NULL DEFAULT 6 CHECK(digits BETWEEN 4 AND 10),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  accountant_approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX IF NOT EXISTS invoice_number_policy_lookup_idx ON invoice_number_policy(legal_entity_id,effective_from,effective_to);

ALTER TABLE billing_rule ADD COLUMN legal_entity_id TEXT REFERENCES legal_entity(id);
ALTER TABLE payment ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_idempotency_unique ON payment(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_source (
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK(source_type IN ('time','expense','milestone','adjustment')),
  source_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  locked_at TEXT,
  PRIMARY KEY(invoice_id,source_type,source_id)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS locked_invoice_source_unique ON invoice_source(source_type,source_id) WHERE locked_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_event (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('sent','void','credit','adjustment')),
  amount_minor INTEGER,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES user(id),
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE IF NOT EXISTS billing_period (
  id TEXT PRIMARY KEY,
  billing_rule_id TEXT NOT NULL REFERENCES billing_rule(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ready','incomplete','blocked','closed')),
  reasons_json TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(billing_rule_id,period_start,period_end)
) STRICT;

CREATE TABLE IF NOT EXISTS mutation_receipt (
  mutation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS document_access_event (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS approval_event_entity_idx ON approval_event(entity_type,entity_id,occurred_at);
CREATE INDEX IF NOT EXISTS invoice_source_invoice_idx ON invoice_source(invoice_id);
CREATE INDEX IF NOT EXISTS payment_invoice_idx ON payment(invoice_id,received_at);
CREATE INDEX IF NOT EXISTS invoice_event_invoice_idx ON invoice_event(invoice_id,occurred_at);

CREATE TRIGGER IF NOT EXISTS invoiced_time_no_update BEFORE UPDATE ON time_entry WHEN OLD.invoice_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoiced time is immutable; create an adjustment'); END;
CREATE TRIGGER IF NOT EXISTS invoiced_time_no_delete BEFORE DELETE ON time_entry WHEN OLD.invoice_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoiced time is immutable; create an adjustment'); END;
CREATE TRIGGER IF NOT EXISTS invoiced_expense_no_update BEFORE UPDATE ON expense WHEN OLD.invoice_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoiced expense is immutable; create an adjustment'); END;
CREATE TRIGGER IF NOT EXISTS invoiced_expense_no_delete BEFORE DELETE ON expense WHEN OLD.invoice_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoiced expense is immutable; create an adjustment'); END;

INSERT OR IGNORE INTO schema_migration VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
