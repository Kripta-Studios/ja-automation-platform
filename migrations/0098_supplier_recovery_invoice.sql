-- J&A B5 migration 98: invoice to the supplier what is still to recover (owner request,
-- 2026-11-26, follows D4).
--
-- 1. Contract metadata rebuilt only to admit version 98 in its reviewed CHECK lists.
-- 2. invoice_commercial_source_manifest rebuilt to admit source_type 'supplier_recharge'
--    (a line of an invoice to a supplier for an expense J&A paid for one of its technicians).
--    Columns, checks, indexes and immutability triggers are otherwise unchanged; all rows
--    are copied as they are.
-- 3. supplier_billing_account: the client record J&A invoices a supplier through (one per
--    supplier, append-only), and supplier_recovery_project: the project that carries those
--    invoices for one source project (same issuing company and currency). Append-only.
-- 4. supplier_expense_recovery: one row per expense put on an invoice to the supplier. An
--    expense is on at most one live invoice (draft, approved or issued) and never on an
--    invoice when it was already deducted from a supplier settlement (and the other way
--    round). A void invoice releases its expenses. Rows go away only with a discarded
--    unissued draft.
-- 5. Reviewed audit actions.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v98;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 98),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes','projects_team_supplier_fixes','issuer_bank_routing_fields','client_project_invoice_numbers','invoice_versions_and_counter','assignment_extras','pay_and_billing_intervals','assignment_extra_effective_dates','expense_invoice_settings','supplier_expense_carrier','supplier_recovery_invoice'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v98;
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
DROP TABLE migration_contract_metadata_v98;
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


ALTER TABLE invoice_commercial_source_manifest RENAME TO invoice_commercial_source_manifest_v97;
DROP TRIGGER client_essential_issued_invoice_commercial_manifest_no_insert;
DROP TRIGGER invoice_commercial_source_manifest_no_delete;
DROP TRIGGER invoice_commercial_source_manifest_no_update;
DROP TRIGGER superseded_invoice_manifest_no_delete;
DROP TRIGGER superseded_invoice_manifest_no_insert;
DROP TRIGGER superseded_invoice_manifest_no_update;
DROP INDEX invoice_commercial_source_manifest_invoice_idx;
CREATE TABLE invoice_commercial_source_manifest(
  manifest_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK(source_type IN(
    'time','expense','milestone','minimum_top_up','fixed_price','adjustment','supplier_recharge'
  )),
  source_id TEXT NOT NULL,
  source_version INTEGER,
  disposition TEXT NOT NULL CHECK(disposition IN(
    'included','partially_included','blocked','excluded','legacy_unknown'
  )),
  original_minor INTEGER,
  allocated_minor INTEGER,
  remaining_minor INTEGER,
  reason_code TEXT NOT NULL,
  source_hash TEXT CHECK(source_hash IS NULL OR (
    length(source_hash)=64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  )),
  created_at TEXT NOT NULL,
  locked_at TEXT,
  CHECK(original_minor IS NULL OR original_minor>=0),
  CHECK(allocated_minor IS NULL OR allocated_minor>=0),
  CHECK(remaining_minor IS NULL OR remaining_minor>=0),
  CHECK(
    original_minor IS NULL OR allocated_minor IS NULL OR remaining_minor IS NULL OR
    original_minor=allocated_minor+remaining_minor
  ),
  UNIQUE(invoice_id,source_type,source_id)
) STRICT;
INSERT INTO invoice_commercial_source_manifest(
  manifest_id,invoice_id,source_type,source_id,source_version,disposition,original_minor,
  allocated_minor,remaining_minor,reason_code,source_hash,created_at,locked_at)
SELECT manifest_id,invoice_id,source_type,source_id,source_version,disposition,original_minor,
  allocated_minor,remaining_minor,reason_code,source_hash,created_at,locked_at
FROM invoice_commercial_source_manifest_v97;
DROP TABLE invoice_commercial_source_manifest_v97;
CREATE INDEX invoice_commercial_source_manifest_invoice_idx
  ON invoice_commercial_source_manifest(invoice_id,disposition,source_type,source_id);
CREATE TRIGGER client_essential_issued_invoice_commercial_manifest_no_insert
BEFORE INSERT ON invoice_commercial_source_manifest
WHEN EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=NEW.invoice_id
    AND invoice.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN
  SELECT RAISE(ABORT,'issued invoice commercial source manifest is immutable');
END;
CREATE TRIGGER invoice_commercial_source_manifest_no_delete
BEFORE DELETE ON invoice_commercial_source_manifest
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id
    AND i.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice commercial source manifest is immutable'); END;
CREATE TRIGGER invoice_commercial_source_manifest_no_update
BEFORE UPDATE ON invoice_commercial_source_manifest
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id
    AND i.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice commercial source manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_delete BEFORE DELETE ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_insert BEFORE INSERT ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_update BEFORE UPDATE ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;

CREATE TABLE supplier_billing_account(
  supplier_id TEXT PRIMARY KEY REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  client_id TEXT NOT NULL UNIQUE REFERENCES client(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0)
) STRICT;
CREATE TRIGGER supplier_billing_account_no_update BEFORE UPDATE ON supplier_billing_account
BEGIN SELECT RAISE(ABORT,'supplier billing accounts are append-only'); END;
CREATE TRIGGER supplier_billing_account_no_delete BEFORE DELETE ON supplier_billing_account
BEGIN SELECT RAISE(ABORT,'supplier billing accounts are append-only'); END;

CREATE TABLE supplier_recovery_project(
  supplier_id TEXT NOT NULL REFERENCES supplier_billing_account(supplier_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NOT NULL UNIQUE REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  billing_rule_id TEXT NOT NULL REFERENCES billing_rule(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  PRIMARY KEY(supplier_id,source_project_id)
) STRICT;
CREATE TRIGGER supplier_recovery_project_no_update BEFORE UPDATE ON supplier_recovery_project
BEGIN SELECT RAISE(ABORT,'supplier recovery projects are append-only'); END;
CREATE TRIGGER supplier_recovery_project_no_delete BEFORE DELETE ON supplier_recovery_project
BEGIN SELECT RAISE(ABORT,'supplier recovery projects are append-only'); END;

CREATE TABLE supplier_expense_recovery(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  expense_id TEXT NOT NULL REFERENCES expense(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(invoice_id,expense_id)
) STRICT;
CREATE INDEX supplier_expense_recovery_expense_idx ON supplier_expense_recovery(expense_id);
CREATE INDEX supplier_expense_recovery_supplier_idx ON supplier_expense_recovery(supplier_id);
CREATE TRIGGER supplier_expense_recovery_once BEFORE INSERT ON supplier_expense_recovery
WHEN EXISTS(SELECT 1 FROM supplier_expense_recovery r JOIN invoice i ON i.id=r.invoice_id
            WHERE r.expense_id=NEW.expense_id AND i.state NOT IN ('void','cancelled','superseded'))
  OR EXISTS(SELECT 1 FROM supplier_expense_recharge d WHERE d.expense_id=NEW.expense_id)
BEGIN SELECT RAISE(ABORT,'expense is already recovered from the supplier'); END;
CREATE TRIGGER supplier_expense_recovery_no_update BEFORE UPDATE ON supplier_expense_recovery
BEGIN SELECT RAISE(ABORT,'supplier expense recoveries are append-only'); END;
CREATE TRIGGER supplier_expense_recovery_no_delete BEFORE DELETE ON supplier_expense_recovery
WHEN EXISTS(SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id AND i.state NOT IN ('draft','approved'))
  OR EXISTS(SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id
            AND (i.invoice_number IS NOT NULL OR i.issued_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'supplier expense recoveries of issued invoices are immutable'); END;
CREATE TRIGGER supplier_expense_recharge_not_invoiced BEFORE INSERT ON supplier_expense_recharge
WHEN EXISTS(SELECT 1 FROM supplier_expense_recovery r JOIN invoice i ON i.id=r.invoice_id
            WHERE r.expense_id=NEW.expense_id AND i.state NOT IN ('void','cancelled','superseded'))
BEGIN SELECT RAISE(ABORT,'expense is already invoiced to the supplier'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','supplier.billing_account_create','supplier','user','WP-SUPEXP','restricted'),
 ('B5-R4','supplier.recovery_invoice_create','invoice','user','WP-SUPEXP','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
