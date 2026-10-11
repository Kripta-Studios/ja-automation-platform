-- Preserve reviewed migration metadata while adding explicit invoice selections.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v76;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 77),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v76;
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
DROP TABLE migration_contract_metadata_v76;
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

CREATE TABLE digital_work_case (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  billing_rule_id TEXT NOT NULL REFERENCES billing_rule(id) ON DELETE RESTRICT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('whole_period','selected_sources')),
  selected_sources_json TEXT NOT NULL CHECK(json_valid(selected_sources_json)),
  version INTEGER NOT NULL CHECK(version>=1),
  current_revision_id TEXT NOT NULL,
  review_revision_id TEXT,
  draft_invoice_id TEXT REFERENCES invoice(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(period_start<=period_end)
) STRICT;
CREATE INDEX digital_work_case_project_period ON digital_work_case(project_id,period_start,period_end);
CREATE TABLE digital_work_case_revision (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES digital_work_case(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>=1),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  UNIQUE(case_id,version)
) STRICT;
CREATE TABLE digital_work_case_review (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES digital_work_case(id) ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES digital_work_case_revision(id) ON DELETE RESTRICT,
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  actor_id TEXT NOT NULL REFERENCES user(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE digital_work_case_event (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES digital_work_case(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('opened','reconciled','reviewed','draft_prepared')),
  revision_id TEXT NOT NULL REFERENCES digital_work_case_revision(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES user(id),
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE digital_work_request (
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  action TEXT NOT NULL,
  request_key TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_user_id,action,request_key)
) STRICT;
CREATE TABLE digital_work_item (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  case_id TEXT REFERENCES digital_work_case(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('scope_change','handover','evidence','policy_review')),
  title TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL REFERENCES user(id),
  due_on TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','in_progress','ready_for_review','accepted','waived','cancelled')),
  evidence_refs_json TEXT NOT NULL CHECK(json_valid(evidence_refs_json)),
  scope_classification TEXT CHECK(scope_classification IN ('existing_scope','rework','goodwill','needs_clarification','potential_change')),
  policy_reference TEXT,
  proposed_settings_json TEXT CHECK(proposed_settings_json IS NULL OR json_valid(proposed_settings_json)),
  version INTEGER NOT NULL CHECK(version>=1),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX digital_work_item_project_status ON digital_work_item(project_id,status,due_on);
CREATE INDEX digital_work_item_owner_status ON digital_work_item(owner_id,status,due_on);
CREATE TABLE digital_work_item_event (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES digital_work_item(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated')),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  UNIQUE(work_item_id,version)
) STRICT;
CREATE TABLE capture_request (
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  request_key TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_user_id,request_key)
) STRICT;
CREATE TRIGGER digital_work_case_revision_no_update BEFORE UPDATE ON digital_work_case_revision BEGIN SELECT RAISE(ABORT,'case revision immutable'); END;
CREATE TRIGGER digital_work_case_revision_no_delete BEFORE DELETE ON digital_work_case_revision BEGIN SELECT RAISE(ABORT,'case revision immutable'); END;
CREATE TRIGGER digital_work_case_review_no_update BEFORE UPDATE ON digital_work_case_review BEGIN SELECT RAISE(ABORT,'case review immutable'); END;
CREATE TRIGGER digital_work_case_review_no_delete BEFORE DELETE ON digital_work_case_review BEGIN SELECT RAISE(ABORT,'case review immutable'); END;
CREATE TRIGGER digital_work_case_event_no_update BEFORE UPDATE ON digital_work_case_event BEGIN SELECT RAISE(ABORT,'case event immutable'); END;
CREATE TRIGGER digital_work_case_event_no_delete BEFORE DELETE ON digital_work_case_event BEGIN SELECT RAISE(ABORT,'case event immutable'); END;
CREATE TRIGGER digital_work_item_event_no_update BEFORE UPDATE ON digital_work_item_event BEGIN SELECT RAISE(ABORT,'work item event immutable'); END;
CREATE TRIGGER digital_work_item_event_no_delete BEFORE DELETE ON digital_work_item_event BEGIN SELECT RAISE(ABORT,'work item event immutable'); END;
CREATE TRIGGER digital_work_request_no_update BEFORE UPDATE ON digital_work_request BEGIN SELECT RAISE(ABORT,'request receipt immutable'); END;
CREATE TRIGGER digital_work_request_no_delete BEFORE DELETE ON digital_work_request BEGIN SELECT RAISE(ABORT,'request receipt immutable'); END;
CREATE TRIGGER capture_request_no_update BEFORE UPDATE ON capture_request BEGIN SELECT RAISE(ABORT,'capture receipt immutable'); END;
CREATE TRIGGER capture_request_no_delete BEFORE DELETE ON capture_request BEGIN SELECT RAISE(ABORT,'capture receipt immutable'); END;
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','digital_work.case_open','digital_work_case','user','DW-CORE','restricted'),
 ('B5-R4','digital_work.case_reconcile','digital_work_case_revision','user','DW-CORE','restricted'),
 ('B5-R4','digital_work.case_review','digital_work_case_review','user','DW-CORE','restricted'),
 ('B5-R4','digital_work.draft_prepare','digital_work_case','user','DW-CORE','restricted'),
 ('B5-R4','digital_work.item_save','digital_work_item','user','DW-CORE','confidential'),
 ('B5-R4','digital_work.item_update','digital_work_item','user','DW-CORE','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
