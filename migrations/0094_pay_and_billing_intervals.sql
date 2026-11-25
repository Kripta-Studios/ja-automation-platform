-- J&A B5 migration 94: pay and billing intervals (owner request 2026-11-25).
--
-- 1. Contract metadata rebuilt only to admit version 94 in its reviewed CHECK lists.
-- 2. pay_interval_setting: how often a person is paid (weekly, every 2 weeks, twice a month,
--    monthly). A person default (project_member_id NULL) and an optional override per
--    assignment (project member). interval NULL means "not set" (person) or "same as the
--    person" (assignment). Every 2 weeks may carry the first day of a two-week block.
-- 3. client_billing_interval: how often a client is invoiced by default (weekly, every 2 weeks,
--    twice a month, monthly with an optional cutoff day, per milestone, manual). Projects and
--    billing streams keep their own interval (billing_rule.cadence_type, anchor_date,
--    monthly_cutoff_day); the client value is the default for a new project billing setup.
--    Both tables are append-only versions: the highest version is in force, earlier versions
--    stay as history. No row = nothing changes.
-- 4. Reviewed audit actions for saving these settings.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v94;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 94),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes','projects_team_supplier_fixes','issuer_bank_routing_fields','client_project_invoice_numbers','invoice_versions_and_counter','assignment_extras','pay_and_billing_intervals'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v94;
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
DROP TABLE migration_contract_metadata_v94;
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

CREATE TABLE pay_interval_setting(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_member_id TEXT REFERENCES project_member(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  scope_key TEXT NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 220),
  version INTEGER NOT NULL CHECK(version>=1),
  pay_interval TEXT CHECK(pay_interval IS NULL OR pay_interval IN('weekly','every_14_days','semi_monthly','monthly')),
  anchor_date TEXT CHECK(anchor_date IS NULL OR (length(anchor_date)=10 AND anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2000),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(scope_key,version),
  CHECK(scope_key = CASE WHEN project_member_id IS NULL THEN 'person:'||user_id ELSE 'assignment:'||project_member_id END),
  CHECK(anchor_date IS NULL OR pay_interval='every_14_days')
) STRICT;
CREATE INDEX pay_interval_setting_user_idx ON pay_interval_setting(user_id,scope_key,version);
CREATE INDEX pay_interval_setting_member_idx ON pay_interval_setting(project_member_id,version);
CREATE TRIGGER pay_interval_setting_no_update BEFORE UPDATE ON pay_interval_setting
BEGIN SELECT RAISE(ABORT,'pay interval settings are append-only'); END;
CREATE TRIGGER pay_interval_setting_no_delete BEFORE DELETE ON pay_interval_setting
BEGIN SELECT RAISE(ABORT,'pay interval settings are append-only'); END;
CREATE TRIGGER pay_interval_setting_version_guard BEFORE INSERT ON pay_interval_setting
WHEN NEW.version<>COALESCE((SELECT MAX(s.version) FROM pay_interval_setting s WHERE s.scope_key=NEW.scope_key),0)+1
BEGIN SELECT RAISE(ABORT,'pay interval version does not follow the current version'); END;
CREATE TRIGGER pay_interval_setting_member_guard BEFORE INSERT ON pay_interval_setting
WHEN NEW.project_member_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM project_member pm WHERE pm.id=NEW.project_member_id AND pm.user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'pay interval assignment belongs to another person'); END;

CREATE TABLE client_billing_interval(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  client_id TEXT NOT NULL REFERENCES client(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>=1),
  cadence_type TEXT CHECK(cadence_type IS NULL OR cadence_type IN('weekly','every_14_days','semi_monthly','monthly','milestone','manual')),
  anchor_date TEXT CHECK(anchor_date IS NULL OR (length(anchor_date)=10 AND anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  monthly_cutoff_day INTEGER CHECK(monthly_cutoff_day IS NULL OR monthly_cutoff_day BETWEEN 1 AND 28),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2000),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(client_id,version),
  CHECK(anchor_date IS NULL OR cadence_type='every_14_days'),
  CHECK(monthly_cutoff_day IS NULL OR cadence_type='monthly')
) STRICT;
CREATE INDEX client_billing_interval_client_idx ON client_billing_interval(client_id,version);
CREATE TRIGGER client_billing_interval_no_update BEFORE UPDATE ON client_billing_interval
BEGIN SELECT RAISE(ABORT,'client billing intervals are append-only'); END;
CREATE TRIGGER client_billing_interval_no_delete BEFORE DELETE ON client_billing_interval
BEGIN SELECT RAISE(ABORT,'client billing intervals are append-only'); END;
CREATE TRIGGER client_billing_interval_version_guard BEFORE INSERT ON client_billing_interval
WHEN NEW.version<>COALESCE((SELECT MAX(c.version) FROM client_billing_interval c WHERE c.client_id=NEW.client_id),0)+1
BEGIN SELECT RAISE(ABORT,'client billing interval version does not follow the current version'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','worker.pay_interval_set','user','user','WP-INTERVALS','restricted'),
 ('B5-R4','assignment.pay_interval_set','project_member','user','WP-INTERVALS','restricted'),
 ('B5-R4','client.billing_interval_set','client','user','WP-INTERVALS','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
