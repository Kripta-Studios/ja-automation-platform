-- Extend reviewed migration metadata to version 61.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v60;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 61),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement',
    'customer_conformity_evidence_attachment','mfa_optional_policy','astra_project_closeout_revisions',
    'astra_period_followup','supplier_workforce','supplier_directory_lifecycle','owner_record_management',
    'supplier_contact_directory','worker_compensation_payments','supplier_time_batch_idempotency',
    'accounting_pack_signed_credit_balances','availability_calendar_edits',
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement'
  )),
  descriptor_version TEXT NOT NULL CHECK(descriptor_version='ja-migration-contract-v1'),
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'),
  sql_sha256 TEXT NOT NULL CHECK(length(sql_sha256)=64 AND sql_sha256 NOT GLOB '*[^0-9a-f]*'),
  projection_sha256 TEXT NOT NULL CHECK(length(projection_sha256)=64 AND projection_sha256 NOT GLOB '*[^0-9a-f]*'),
  vector_sha256 TEXT NOT NULL CHECK(length(vector_sha256)=64 AND vector_sha256 NOT GLOB '*[^0-9a-f]*'),
  encoder_sha256 TEXT NOT NULL CHECK(length(encoder_sha256)=64 AND encoder_sha256 NOT GLOB '*[^0-9a-f]*'),
  runner_sha256 TEXT NOT NULL CHECK(length(runner_sha256)=64 AND runner_sha256 NOT GLOB '*[^0-9a-f]*'),
  heartbeat_worker_sha256 TEXT NOT NULL CHECK(length(heartbeat_worker_sha256)=64 AND heartbeat_worker_sha256 NOT GLOB '*[^0-9a-f]*'),
  schema_hash_manifest BLOB NOT NULL CHECK(typeof(schema_hash_manifest)='blob'),
  schema_hash_manifest_sha256 TEXT NOT NULL CHECK(length(schema_hash_manifest_sha256)=64 AND schema_hash_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  pre_projection_sha256 TEXT NOT NULL CHECK(length(pre_projection_sha256)=64 AND pre_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
  post_projection_sha256 TEXT NOT NULL CHECK(length(post_projection_sha256)=64 AND post_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
  node_version TEXT NOT NULL CHECK(length(node_version)>0),
  sqlite_version TEXT NOT NULL CHECK(length(sqlite_version)>0),
  applied_at TEXT NOT NULL CHECK(length(applied_at)>0)
) STRICT;
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v60;
ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_v20;
CREATE TABLE finance_v2_cutover(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  migration_version INTEGER NOT NULL CHECK(migration_version=20)
    REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'),
  cutover_at TEXT NOT NULL CHECK(length(cutover_at)>0)
) STRICT;
INSERT INTO finance_v2_cutover SELECT * FROM finance_v2_cutover_v20;
DROP TABLE finance_v2_cutover_v20;
DROP TABLE migration_contract_metadata_v60;
CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_replace BEFORE INSERT ON migration_contract_metadata
WHEN EXISTS(SELECT 1 FROM migration_contract_metadata existing WHERE existing.migration_version=NEW.migration_version OR existing.migration_name=NEW.migration_name)
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_replace BEFORE INSERT ON finance_v2_cutover
WHEN EXISTS(SELECT 1 FROM finance_v2_cutover existing WHERE existing.singleton=NEW.singleton)
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;


-- Reimbursement is a separate settlement lifecycle. An invoiced expense's
-- operational and commercial source remains immutable, while its worker
-- reimbursement state, date and reference may be recorded later.
DROP TRIGGER IF EXISTS invoiced_expense_no_update;
CREATE TRIGGER invoiced_expense_no_update
BEFORE UPDATE ON expense
WHEN OLD.invoice_id IS NOT NULL AND (
  NEW.id IS NOT OLD.id OR
  NEW.project_id IS NOT OLD.project_id OR
  NEW.worker_id IS NOT OLD.worker_id OR
  NEW.spent_on IS NOT OLD.spent_on OR
  NEW.category IS NOT OLD.category OR
  NEW.currency IS NOT OLD.currency OR
  NEW.amount_minor IS NOT OLD.amount_minor OR
  NEW.client_treatment IS NOT OLD.client_treatment OR
  NEW.approval_state IS NOT OLD.approval_state OR
  NEW.invoice_id IS NOT OLD.invoice_id OR
  NEW.created_at IS NOT OLD.created_at OR
  NEW.vendor IS NOT OLD.vendor OR
  NEW.description IS NOT OLD.description OR
  NEW.who_paid IS NOT OLD.who_paid OR
  NEW.receipt_document_id IS NOT OLD.receipt_document_id OR
  NEW.receipt_required IS NOT OLD.receipt_required OR
  NEW.submitted_at IS NOT OLD.submitted_at OR
  NEW.approved_by IS NOT OLD.approved_by OR
  NEW.approved_at IS NOT OLD.approved_at OR
  NEW.finance_approved_by IS NOT OLD.finance_approved_by OR
  NEW.finance_approved_at IS NOT OLD.finance_approved_at OR
  NEW.tax_amount_minor IS NOT OLD.tax_amount_minor OR
  NEW.payment_method IS NOT OLD.payment_method OR
  NEW.markup_bps IS NOT OLD.markup_bps OR
  NEW.project_currency_amount_minor IS NOT OLD.project_currency_amount_minor OR
  NEW.billing_treatment IS NOT OLD.billing_treatment OR
  NEW.billing_state IS NOT OLD.billing_state OR
  NEW.billing_amount_minor IS NOT OLD.billing_amount_minor OR
  NEW.billing_lock_id IS NOT OLD.billing_lock_id OR
  NEW.fx_rate_bps IS NOT OLD.fx_rate_bps OR
  NEW.expected_reimbursement_on IS NOT OLD.expected_reimbursement_on OR
  NEW.expected_recovery_on IS NOT OLD.expected_recovery_on OR
  NEW.commercial_classification_state IS NOT OLD.commercial_classification_state OR
  NEW.occurred_time_local IS NOT OLD.occurred_time_local OR
  NEW.time_entry_id IS NOT OLD.time_entry_id OR
  NEW.expense_policy_required IS NOT OLD.expense_policy_required OR
  NEW.assignment_expense_policy_id IS NOT OLD.assignment_expense_policy_id OR
  (NEW.reimbursement_amount_minor IS NOT OLD.reimbursement_amount_minor AND
    NOT (OLD.reimbursement_amount_minor IS NULL AND NEW.reimbursement_amount_minor = OLD.amount_minor))
)
BEGIN
  SELECT RAISE(ABORT, 'invoiced expense is immutable; create an adjustment');
END;
