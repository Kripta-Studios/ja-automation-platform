-- Preserve reviewed migration metadata while adding the effective dated reimbursement preferences without rewriting invoice history.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v71;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 72),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v71;
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
DROP TABLE migration_contract_metadata_v71;
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


-- Append-only date-effective preferences. Null means inherit the next layer.
-- Baselines retain scalar legacy meaning at every historic operational date.
CREATE TABLE reimbursement_preference_revision (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  project_member_id TEXT REFERENCES project_member(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  mode TEXT CHECK(mode IN ('at_cost','none')),
  effective_from TEXT NOT NULL CHECK(length(effective_from)=10),
  version INTEGER NOT NULL CHECK(version>0),
  reason TEXT NOT NULL,
  created_by TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX reimbursement_project_date_uq ON reimbursement_preference_revision(project_id,effective_from) WHERE project_member_id IS NULL;
CREATE UNIQUE INDEX reimbursement_assignment_date_uq ON reimbursement_preference_revision(project_member_id,effective_from) WHERE project_member_id IS NOT NULL;
CREATE INDEX reimbursement_project_lookup_idx ON reimbursement_preference_revision(project_id,project_member_id,effective_from);
INSERT INTO reimbursement_preference_revision(id,project_id,project_member_id,mode,effective_from,version,reason,created_by,created_at)
SELECT 'reimbursement-project-baseline:'||id,id,NULL,worker_expense_reimbursement_default,'0001-01-01',1,'Preserved legacy project reimbursement preference',NULL,COALESCE(updated_at,created_at) FROM project;
INSERT INTO reimbursement_preference_revision(id,project_id,project_member_id,mode,effective_from,version,reason,created_by,created_at)
SELECT 'reimbursement-assignment-baseline:'||id,project_id,id,worker_expense_reimbursement_override,'0001-01-01',1,'Preserved legacy assignment reimbursement preference',NULL,COALESCE(updated_at,created_at) FROM project_member;
CREATE TRIGGER reimbursement_preference_no_update BEFORE UPDATE ON reimbursement_preference_revision
BEGIN SELECT RAISE(ABORT,'reimbursement preference immutable'); END;
CREATE TRIGGER reimbursement_preference_no_delete BEFORE DELETE ON reimbursement_preference_revision
-- Only migration-created baselines on genuinely empty projects may leave with a
-- deleted parent. Direct baseline deletion and all authored revisions are denied.
WHEN NOT (
  OLD.effective_from='0001-01-01' AND OLD.version=1 AND OLD.created_by IS NULL
  AND (
    (OLD.project_member_id IS NULL
     AND OLD.id='reimbursement-project-baseline:'||OLD.project_id
     AND OLD.reason='Preserved legacy project reimbursement preference'
     AND NOT EXISTS(SELECT 1 FROM project WHERE id=OLD.project_id))
    OR
    (OLD.project_member_id IS NOT NULL
     AND OLD.id='reimbursement-assignment-baseline:'||OLD.project_member_id
     AND OLD.reason='Preserved legacy assignment reimbursement preference'
     AND NOT EXISTS(SELECT 1 FROM project_member WHERE id=OLD.project_member_id))
  )
  AND NOT EXISTS(SELECT 1 FROM time_entry WHERE project_id=OLD.project_id)
  AND NOT EXISTS(SELECT 1 FROM expense WHERE project_id=OLD.project_id)
  AND NOT EXISTS(SELECT 1 FROM invoice WHERE project_id=OLD.project_id)
  AND NOT EXISTS(SELECT 1 FROM compensation_settlement WHERE project_id=OLD.project_id)
  AND NOT EXISTS(SELECT 1 FROM daily_report WHERE project_id=OLD.project_id)
  AND NOT EXISTS(SELECT 1 FROM technical_report WHERE project_id=OLD.project_id)
)
BEGIN SELECT RAISE(ABORT,'reimbursement preference immutable'); END;
CREATE TRIGGER reimbursement_preference_no_replace BEFORE INSERT ON reimbursement_preference_revision
WHEN EXISTS(SELECT 1 FROM reimbursement_preference_revision existing WHERE existing.id=NEW.id OR (existing.project_id=NEW.project_id AND existing.project_member_id IS NEW.project_member_id AND existing.effective_from=NEW.effective_from))
BEGIN SELECT RAISE(ABORT,'reimbursement preference immutable'); END;
