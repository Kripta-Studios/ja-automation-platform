-- J&A B5 migration 84: billing/finance audit fixes (role audit 2026-11-22, group G3).
--
-- 1. Contract metadata rebuilt only to admit version 84 in its reviewed CHECK lists, like
--    every previous migration. The name list already admits 'returned_record_supersession'
--    (migration 83, reserved by a parallel work packet) so both apply in either merge order.
-- 2. Audit: a payment reversal is recorded as 'payment.reverse' (T17). Until now reversals
--    left no audit_event at all; the reviewed manifest gains exactly this row.
-- 3. Data repair, flag only (T02): pay rules of a supplier's external technicians were
--    created worker_visible=1, so the technician saw direct J&A pay next to the supplier
--    payable. They are paid through their supplier; the rule stays (subcontractor
--    settlement needs it) and only stops being shown to the technician as his own pay.
--    Amounts, dates and settlements are untouched.
-- 4. My Pay statements (T25): the artifact and retry guards admitted only role 'worker', so a
--    project manager's own statement (My Pay is offered to PMs; the repository allows it)
--    failed with a constraint error (500). The guards now admit 'worker' and
--    'project_manager'; every other condition is unchanged.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v8x;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 84),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v8x;
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
DROP TABLE migration_contract_metadata_v8x;
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

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','payment.reverse','payment','user','WP-B5','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;

UPDATE compensation_rule SET worker_visible=0
 WHERE worker_visible=1
   AND worker_id IN (SELECT user_id FROM supplier_user_profile);

DROP TRIGGER worker_statement_artifact_insert_guard;
CREATE TRIGGER worker_statement_artifact_insert_guard
BEFORE INSERT ON worker_statement_artifact
WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.requested_by<>NEW.worker_id OR
  NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.worker_id AND u.role IN ('worker','project_manager') AND u.status='active') OR
  NEW.status<>'queued' OR NEW.current_attempt_number<>1 OR NEW.integrity_blocked<>0 OR
  NEW.media_type IS NOT NULL OR NEW.byte_length IS NOT NULL OR NEW.content_sha256 IS NOT NULL OR NEW.renderer_version IS NOT NULL OR NEW.ready_at IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.retryable IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.finished_at IS NOT NULL OR NEW.claimed_job_id IS NOT NULL OR NEW.claimed_job_run_id IS NOT NULL OR NEW.claimed_lease_fence IS NOT NULL
BEGIN SELECT RAISE(ABORT,'invalid worker statement artifact'); END;

DROP TRIGGER worker_statement_retry_decision_insert_guard;
CREATE TRIGGER worker_statement_retry_decision_insert_guard
BEFORE INSERT ON worker_statement_retry_decision
WHEN NOT EXISTS(
  SELECT 1 FROM worker_statement_artifact a JOIN user u ON u.id=NEW.requested_by
  WHERE a.artifact_id=NEW.artifact_id AND a.status='failed' AND a.current_attempt_number=NEW.prior_attempt_number AND a.retryable=1 AND a.integrity_blocked=0 AND a.worker_id=NEW.requested_by AND a.current_attempt_number<a.max_attempts AND u.status='active' AND u.role IN ('worker','project_manager')
)
BEGIN SELECT RAISE(ABORT,'invalid worker statement retry decision'); END;
