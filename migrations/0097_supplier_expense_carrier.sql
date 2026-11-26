-- J&A B5 migration 97: who carries an external technician's expenses (owner decision D4,
-- 2026-11-26).
--
-- 1. Contract metadata rebuilt only to admit version 97 in its reviewed CHECK lists.
-- 2. supplier_expense_rule: for the technicians of a supplier (supplier_user_profile), who
--    carries the expenses they log on a project: 'ja' (J&A reimburses the technician, as
--    before) or 'supplier' (recharged to the supplier: J&A owes the technician nothing and
--    what J&A paid for him is deducted from the supplier's settlement). A row without
--    project_member_id is the project default; a row with it is the person's override.
--    carrier NULL means "not set" (a person follows the project; a project keeps the
--    behaviour before this migration). Rows are append-only dated versions: for an expense
--    day D the row in force is the latest effective_from <= D (then the highest version).
--    No row = nothing changes. Client billing stays independent.
-- 3. supplier_expense_recharge: an expense deducted from one supplier settlement, linked to
--    the offset payment event recorded on that settlement. One row per expense (UNIQUE), so
--    an expense is never deducted twice. Append-only.
-- 4. Reviewed audit actions for the project default and the person override.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v97;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 97),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes','projects_team_supplier_fixes','issuer_bank_routing_fields','client_project_invoice_numbers','invoice_versions_and_counter','assignment_extras','pay_and_billing_intervals','assignment_extra_effective_dates','expense_invoice_settings','supplier_expense_carrier'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v97;
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
DROP TABLE migration_contract_metadata_v97;
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

CREATE TABLE supplier_expense_rule(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_member_id TEXT REFERENCES project_member(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  carrier TEXT CHECK(carrier IS NULL OR carrier IN('ja','supplier')),
  effective_from TEXT NOT NULL CHECK(length(effective_from)=10
    AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    AND date(effective_from) IS NOT NULL AND date(effective_from)=effective_from),
  version INTEGER NOT NULL CHECK(version>=1),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2000),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0)
) STRICT;
CREATE UNIQUE INDEX supplier_expense_rule_project_version_uq ON supplier_expense_rule(project_id,version) WHERE project_member_id IS NULL;
CREATE UNIQUE INDEX supplier_expense_rule_member_version_uq ON supplier_expense_rule(project_member_id,version) WHERE project_member_id IS NOT NULL;
CREATE INDEX supplier_expense_rule_lookup_idx ON supplier_expense_rule(project_id,project_member_id,effective_from,version);
CREATE TRIGGER supplier_expense_rule_no_update BEFORE UPDATE ON supplier_expense_rule
BEGIN SELECT RAISE(ABORT,'supplier expense rules are append-only'); END;
CREATE TRIGGER supplier_expense_rule_no_delete BEFORE DELETE ON supplier_expense_rule
BEGIN SELECT RAISE(ABORT,'supplier expense rules are append-only'); END;
CREATE TRIGGER supplier_expense_rule_version_guard BEFORE INSERT ON supplier_expense_rule
WHEN NEW.version<>COALESCE((SELECT MAX(r.version) FROM supplier_expense_rule r
  WHERE r.project_id=NEW.project_id AND r.project_member_id IS NEW.project_member_id),0)+1
  OR (NEW.project_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_member pm
  WHERE pm.id=NEW.project_member_id AND pm.project_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'supplier expense rule version or assignment is invalid'); END;

CREATE TABLE supplier_expense_recharge(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  expense_id TEXT NOT NULL UNIQUE REFERENCES expense(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  settlement_id TEXT NOT NULL REFERENCES compensation_settlement(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  payment_event_id TEXT NOT NULL REFERENCES worker_compensation_payment_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0)
) STRICT;
CREATE INDEX supplier_expense_recharge_settlement_idx ON supplier_expense_recharge(settlement_id);
CREATE TRIGGER supplier_expense_recharge_no_update BEFORE UPDATE ON supplier_expense_recharge
BEGIN SELECT RAISE(ABORT,'supplier expense recharges are append-only'); END;
CREATE TRIGGER supplier_expense_recharge_no_delete BEFORE DELETE ON supplier_expense_recharge
BEGIN SELECT RAISE(ABORT,'supplier expense recharges are append-only'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','project.supplier_expense_rule_set','project','user','WP-SUPEXP','restricted'),
 ('B5-R4','assignment.supplier_expense_rule_set','project_member','user','WP-SUPEXP','restricted'),
 ('B5-R4','supplier.expense_recharge','compensation_settlement','user','WP-SUPEXP','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
