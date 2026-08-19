BEGIN IMMEDIATE;

-- Reviewed V3 completion migration. Existing legacy columns remain in place so
-- seeded/demo data keeps its meaning while the new fields add the complete
-- production model.

ALTER TABLE user ADD COLUMN mfa_required INTEGER NOT NULL DEFAULT 0 CHECK(mfa_required IN (0,1));
ALTER TABLE user ADD COLUMN offboarded_at TEXT;
ALTER TABLE user ADD COLUMN last_step_up_at TEXT;

ALTER TABLE client ADD COLUMN notes TEXT;
ALTER TABLE project ADD COLUMN project_alias TEXT;
ALTER TABLE project ADD COLUMN start_date TEXT;
ALTER TABLE project ADD COLUMN planned_end_date TEXT;
ALTER TABLE project ADD COLUMN actual_end_date TEXT;
ALTER TABLE project ADD COLUMN contract_number TEXT;
ALTER TABLE project ADD COLUMN budget_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE project ADD COLUMN other_cost_budget_minor INTEGER CHECK(other_cost_budget_minor IS NULL OR other_cost_budget_minor >= 0);
ALTER TABLE project ADD COLUMN weekly_close_enabled INTEGER NOT NULL DEFAULT 0 CHECK(weekly_close_enabled IN (0,1));
ALTER TABLE project ADD COLUMN notes TEXT;

ALTER TABLE project_member ADD COLUMN role_on_project TEXT;
ALTER TABLE project_member ADD COLUMN expected_minutes_per_day INTEGER CHECK(expected_minutes_per_day IS NULL OR expected_minutes_per_day BETWEEN 0 AND 1440);
ALTER TABLE project_member ADD COLUMN workday_mask TEXT;
ALTER TABLE project_member ADD COLUMN worker_compensation_rule_id TEXT REFERENCES compensation_rule(id);
ALTER TABLE project_member ADD COLUMN internal_cost_rule_id TEXT REFERENCES internal_cost_rule(id);
ALTER TABLE project_member ADD COLUMN client_bill_rule_id TEXT REFERENCES client_labor_rate(id);

ALTER TABLE time_entry ADD COLUMN start_time TEXT;
ALTER TABLE time_entry ADD COLUMN end_time TEXT;
ALTER TABLE time_entry ADD COLUMN activity_code TEXT;
ALTER TABLE time_entry ADD COLUMN break_minutes INTEGER CHECK(break_minutes IS NULL OR break_minutes BETWEEN 0 AND 1440);
ALTER TABLE time_entry ADD COLUMN site TEXT;
ALTER TABLE time_entry ADD COLUMN billable_minutes INTEGER CHECK(billable_minutes IS NULL OR billable_minutes BETWEEN 0 AND 1440);
ALTER TABLE time_entry ADD COLUMN client_rate_minor INTEGER;
ALTER TABLE time_entry ADD COLUMN compensation_amount_minor INTEGER;
ALTER TABLE time_entry ADD COLUMN internal_cost_minor INTEGER;
ALTER TABLE time_entry ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'unlocked';
ALTER TABLE time_entry ADD COLUMN locked_at TEXT;
ALTER TABLE time_entry ADD COLUMN locked_by TEXT REFERENCES user(id);
ALTER TABLE time_entry ADD COLUMN billing_lock_id TEXT REFERENCES billing_lock(id);

ALTER TABLE compensation_rule ADD COLUMN rule_type TEXT NOT NULL DEFAULT 'Hourly';
ALTER TABLE compensation_rule ADD COLUMN percentage_bps INTEGER CHECK(percentage_bps IS NULL OR percentage_bps BETWEEN 0 AND 10000);
ALTER TABLE compensation_rule ADD COLUMN percentage_basis TEXT;
ALTER TABLE compensation_rule ADD COLUMN settlement_trigger TEXT NOT NULL DEFAULT 'ON_APPROVED_BILLABLE_LABOR';
ALTER TABLE compensation_rule ADD COLUMN overtime_method TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE compensation_rule ADD COLUMN overtime_multiplier_bps INTEGER CHECK(overtime_multiplier_bps IS NULL OR overtime_multiplier_bps >= 0);
ALTER TABLE compensation_rule ADD COLUMN overtime_rate_minor INTEGER CHECK(overtime_rate_minor IS NULL OR overtime_rate_minor >= 0);
ALTER TABLE compensation_rule ADD COLUMN weekend_method TEXT NOT NULL DEFAULT 'BASE';
ALTER TABLE compensation_rule ADD COLUMN travel_method TEXT NOT NULL DEFAULT 'BASE';
ALTER TABLE compensation_rule ADD COLUMN standby_method TEXT NOT NULL DEFAULT 'BASE';
ALTER TABLE compensation_rule ADD COLUMN fixed_period_minor INTEGER CHECK(fixed_period_minor IS NULL OR fixed_period_minor >= 0);
ALTER TABLE compensation_rule ADD COLUMN fixed_project_minor INTEGER CHECK(fixed_project_minor IS NULL OR fixed_project_minor >= 0);
ALTER TABLE compensation_rule ADD COLUMN notes TEXT;

ALTER TABLE internal_cost_rule ADD COLUMN overtime_method TEXT NOT NULL DEFAULT 'BASE_RATE_MULTIPLIER';
ALTER TABLE internal_cost_rule ADD COLUMN overtime_multiplier_bps INTEGER NOT NULL DEFAULT 10000 CHECK(overtime_multiplier_bps >= 0);
ALTER TABLE internal_cost_rule ADD COLUMN overtime_rate_minor INTEGER CHECK(overtime_rate_minor IS NULL OR overtime_rate_minor >= 0);
ALTER TABLE internal_cost_rule ADD COLUMN cost_method TEXT NOT NULL DEFAULT 'loaded_hourly';
ALTER TABLE internal_cost_rule ADD COLUMN notes TEXT;

ALTER TABLE client_labor_rate ADD COLUMN rate_basis TEXT NOT NULL DEFAULT 'hourly';
ALTER TABLE client_labor_rate ADD COLUMN overtime_method TEXT NOT NULL DEFAULT 'BASE_RATE_MULTIPLIER';
ALTER TABLE client_labor_rate ADD COLUMN overtime_multiplier_bps INTEGER NOT NULL DEFAULT 10000 CHECK(overtime_multiplier_bps >= 0);
ALTER TABLE client_labor_rate ADD COLUMN overtime_rate_minor INTEGER CHECK(overtime_rate_minor IS NULL OR overtime_rate_minor >= 0);
ALTER TABLE client_labor_rate ADD COLUMN eligible_for_percentage INTEGER NOT NULL DEFAULT 1 CHECK(eligible_for_percentage IN (0,1));
ALTER TABLE client_labor_rate ADD COLUMN notes TEXT;

CREATE TABLE IF NOT EXISTS assignment_rate_override (
  id TEXT PRIMARY KEY,
  project_member_id TEXT NOT NULL REFERENCES project_member(id),
  time_category TEXT,
  activity_code TEXT,
  compensation_rule_id TEXT REFERENCES compensation_rule(id),
  internal_cost_rule_id TEXT REFERENCES internal_cost_rule(id),
  client_labor_rate_id TEXT REFERENCES client_labor_rate(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(effective_to IS NULL OR effective_to >= effective_from)
) STRICT;
CREATE INDEX IF NOT EXISTS assignment_rate_override_lookup_idx ON assignment_rate_override(project_member_id,time_category,activity_code,effective_from,effective_to,priority);

CREATE TABLE IF NOT EXISTS compensation_settlement (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES user(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  compensation_rule_id TEXT NOT NULL REFERENCES compensation_rule(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_basis TEXT NOT NULL,
  source_amount_minor INTEGER NOT NULL CHECK(source_amount_minor >= 0),
  percentage_bps INTEGER,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  state TEXT NOT NULL CHECK(state IN ('estimated','approved','settled','cancelled')),
  settled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(worker_id,project_id,compensation_rule_id,period_start,period_end)
) STRICT;
CREATE INDEX IF NOT EXISTS compensation_settlement_worker_period_idx ON compensation_settlement(worker_id,period_start,period_end,state);

ALTER TABLE expense ADD COLUMN tax_amount_minor INTEGER CHECK(tax_amount_minor IS NULL OR tax_amount_minor >= 0);
ALTER TABLE expense ADD COLUMN payment_method TEXT;
ALTER TABLE expense ADD COLUMN markup_bps INTEGER CHECK(markup_bps IS NULL OR markup_bps BETWEEN 0 AND 100000);
ALTER TABLE expense ADD COLUMN project_currency_amount_minor INTEGER CHECK(project_currency_amount_minor IS NULL OR project_currency_amount_minor >= 0);
ALTER TABLE expense ADD COLUMN billing_treatment TEXT NOT NULL DEFAULT 'internal_non_billable';
ALTER TABLE expense ADD COLUMN billing_state TEXT NOT NULL DEFAULT 'unlocked';
ALTER TABLE expense ADD COLUMN billing_amount_minor INTEGER CHECK(billing_amount_minor IS NULL OR billing_amount_minor >= 0);
ALTER TABLE expense ADD COLUMN billing_lock_id TEXT REFERENCES billing_lock(id);
ALTER TABLE expense ADD COLUMN reimbursement_amount_minor INTEGER CHECK(reimbursement_amount_minor IS NULL OR reimbursement_amount_minor >= 0);
ALTER TABLE expense ADD COLUMN reimbursed_at TEXT;
ALTER TABLE expense ADD COLUMN reimbursement_reference TEXT;
ALTER TABLE expense ADD COLUMN fx_rate_bps INTEGER CHECK(fx_rate_bps IS NULL OR fx_rate_bps > 0);
UPDATE expense SET billing_treatment = CASE client_treatment WHEN 'reimbursable' THEN 'reimbursable_at_cost' WHEN 'all_in' THEN 'all_in' ELSE 'internal_non_billable' END WHERE billing_treatment='internal_non_billable';
CREATE INDEX IF NOT EXISTS expense_billing_period_idx ON expense(project_id,spent_on,approval_state,billing_treatment,billing_state);

ALTER TABLE billing_rule ADD COLUMN template_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE billing_rule ADD COLUMN recipient_email TEXT;
ALTER TABLE billing_rule ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK(payment_terms_days BETWEEN 0 AND 365);
ALTER TABLE billing_rule ADD COLUMN po_number_override TEXT;
ALTER TABLE billing_rule ADD COLUMN semi_monthly_rule TEXT NOT NULL DEFAULT '1_15_16_end';
ALTER TABLE billing_rule ADD COLUMN policy_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tax_profile ADD COLUMN legal_entity_id TEXT REFERENCES legal_entity(id);
ALTER TABLE tax_profile ADD COLUMN jurisdiction_label TEXT;
ALTER TABLE tax_profile ADD COLUMN description TEXT;
ALTER TABLE tax_profile ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tax_component ADD COLUMN calculation_type TEXT NOT NULL DEFAULT 'additive';
ALTER TABLE tax_component ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'line';
ALTER TABLE tax_component ADD COLUMN basis TEXT NOT NULL DEFAULT 'subtotal';

ALTER TABLE invoice ADD COLUMN sent_at TEXT;
ALTER TABLE invoice ADD COLUMN pdf_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE invoice ADD COLUMN pdf_storage_key TEXT;
ALTER TABLE invoice ADD COLUMN pdf_sha256 TEXT;
ALTER TABLE invoice ADD COLUMN pdf_generated_at TEXT;
ALTER TABLE invoice ADD COLUMN source_lock_at TEXT;
ALTER TABLE invoice ADD COLUMN voided_at TEXT;
ALTER TABLE invoice_line ADD COLUMN tax_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_line ADD COLUMN grouping_key TEXT;

ALTER TABLE document ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE document ADD COLUMN safe_filename TEXT;
ALTER TABLE document ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'not_scanned';
ALTER TABLE document ADD COLUMN scanned_at TEXT;
ALTER TABLE document ADD COLUMN scan_provider TEXT;
ALTER TABLE document ADD COLUMN artifact_metadata_json TEXT;

CREATE TABLE IF NOT EXISTS technical_change (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  technical_report_id TEXT REFERENCES technical_report(id),
  author_id TEXT NOT NULL REFERENCES user(id),
  component TEXT NOT NULL,
  original_behavior TEXT,
  root_cause TEXT,
  change_made TEXT NOT NULL,
  reason TEXT,
  safety_impact INTEGER NOT NULL DEFAULT 0 CHECK(safety_impact IN (0,1)),
  production_impact TEXT,
  validation TEXT,
  validation_result TEXT,
  open_risk TEXT,
  rollback_information TEXT,
  approval_state TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX IF NOT EXISTS technical_change_project_idx ON technical_change(project_id,created_at,approval_state);

CREATE TABLE IF NOT EXISTS period_report (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('customer','internal')),
  report_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','final')),
  snapshot_json TEXT NOT NULL,
  pdf_storage_key TEXT,
  pdf_sha256 TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id,period_start,period_end,audience,report_type)
) STRICT;
CREATE INDEX IF NOT EXISTS period_report_project_period_idx ON period_report(project_id,period_start,period_end,audience);

CREATE TABLE IF NOT EXISTS report_source (
  report_id TEXT NOT NULL REFERENCES period_report(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY(report_id,source_type,source_id)
) STRICT;

CREATE TABLE IF NOT EXISTS client_contact (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_billing_contact INTEGER NOT NULL DEFAULT 0 CHECK(is_billing_contact IN (0,1)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE IF NOT EXISTS project_milestone (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL,
  description TEXT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  due_on TEXT,
  approval_state TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT REFERENCES user(id),
  approved_at TEXT,
  invoice_id TEXT REFERENCES invoice(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX IF NOT EXISTS milestone_project_idx ON project_milestone(project_id,approval_state,due_on);

CREATE TABLE IF NOT EXISTS accounting_period (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  legal_entity_id TEXT REFERENCES legal_entity(id),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),
  closed_at TEXT,
  closed_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(period_start,period_end,legal_entity_id)
) STRICT;

CREATE TABLE IF NOT EXISTS accounting_pack_run (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  legal_entity_id TEXT REFERENCES legal_entity(id),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','final','failed')),
  snapshot_json TEXT NOT NULL,
  reconciliation_json TEXT NOT NULL,
  generated_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(period_start,period_end,legal_entity_id)
) STRICT;

CREATE TABLE IF NOT EXISTS accounting_pack_export (
  id TEXT PRIMARY KEY,
  pack_run_id TEXT NOT NULL REFERENCES accounting_pack_run(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK(export_type IN ('pdf','xlsx','invoice_csv','expense_csv','json')),
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(pack_run_id,export_type)
) STRICT;

CREATE TABLE IF NOT EXISTS offline_mutation (
  mutation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  attachment_ids_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('accepted','conflict','rejected')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS offline_mutation_user_idx ON offline_mutation(user_id,created_at,state);

CREATE TABLE IF NOT EXISTS scheduled_job (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK(request_count >= 0)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_pdf_hash_unique ON invoice(pdf_sha256) WHERE pdf_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_due_state_idx ON invoice(state,due_at);
CREATE INDEX IF NOT EXISTS document_sensitivity_idx ON document(project_id,sensitivity,state);
CREATE INDEX IF NOT EXISTS job_due_idx ON job(state,run_after,lease_until);

DROP TRIGGER IF EXISTS all_in_expense_invoice_guard;
CREATE TRIGGER IF NOT EXISTS all_in_expense_invoice_guard
BEFORE UPDATE OF invoice_id ON expense
WHEN (OLD.client_treatment='all_in' OR OLD.billing_treatment='all_in') AND NEW.invoice_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'all-in expense cannot enter customer invoice'); END;

-- Issued snapshots stay immutable, while the lifecycle may move through sent,
-- partial, paid, overdue or void. The legacy trigger blocked those legitimate
-- state/payment transitions.
DROP TRIGGER IF EXISTS issued_invoice_no_update;
CREATE TRIGGER IF NOT EXISTS issued_invoice_snapshot_no_update
BEFORE UPDATE ON invoice
WHEN OLD.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
 AND (
   NEW.invoice_number IS NOT OLD.invoice_number OR
   NEW.stream_type IS NOT OLD.stream_type OR
   NEW.currency IS NOT OLD.currency OR
   NEW.subtotal_minor IS NOT OLD.subtotal_minor OR
   NEW.tax_minor IS NOT OLD.tax_minor OR
   NEW.total_minor IS NOT OLD.total_minor OR
   NEW.issued_at IS NOT OLD.issued_at OR
   NEW.snapshot_json IS NOT OLD.snapshot_json OR
   NEW.calculation_hash IS NOT OLD.calculation_hash OR
   NEW.period_start IS NOT OLD.period_start OR
   NEW.period_end IS NOT OLD.period_end
 )
BEGIN SELECT RAISE(ABORT,'issued invoice snapshot is immutable'); END;

INSERT OR IGNORE INTO schema_migration VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
