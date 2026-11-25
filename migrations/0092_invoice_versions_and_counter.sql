-- J&A B5 migration 92: invoice number counter and issued-invoice versions
-- (owner decisions 2026-11-25).
--
-- 1. Contract metadata rebuilt only to admit version 92 in its reviewed CHECK lists.
-- 2. invoice_revision: a correction of an ISSUED invoice keeps its invoice number and adds a
--    new version (v2, v3, ...). The issued invoice row (version 1) is never changed: its
--    snapshot, hash, PDF, sources and the accounting packs that contain it stay as they were.
--    Each version stores its complete document snapshot, totals and the hash of the version it
--    replaced (hash chain). Rows are append-only. A version may carry a new invoice number;
--    the old number stays in history and can never be used again.
-- 3. invoice_revision_pdf: the PDF rendered for one version (write-once, never replaced).
-- 4. Invoice numbers are unique across issued invoices and every version of every invoice.
-- 5. Reviewed audit actions for the project invoice counter, versions and draft numbers.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v92;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 92),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes','projects_team_supplier_fixes','issuer_bank_routing_fields','client_project_invoice_numbers','invoice_versions_and_counter'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v92;
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
DROP TABLE migration_contract_metadata_v92;
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


CREATE TABLE invoice_revision(
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number>=2),
  invoice_number TEXT NOT NULL CHECK(length(invoice_number) BETWEEN 1 AND 120),
  previous_invoice_number TEXT NOT NULL CHECK(length(previous_invoice_number) BETWEEN 1 AND 120),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  calculation_hash TEXT NOT NULL CHECK(length(calculation_hash)=64 AND calculation_hash NOT GLOB '*[^0-9a-f]*'),
  previous_calculation_hash TEXT NOT NULL CHECK(length(previous_calculation_hash)=64 AND previous_calculation_hash NOT GLOB '*[^0-9a-f]*'),
  currency TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL,
  tax_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  changed_fields_json TEXT NOT NULL CHECK(json_valid(changed_fields_json) AND json_type(changed_fields_json)='array'),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=1000),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(invoice_id,revision_number)
) STRICT;
CREATE INDEX invoice_revision_number_idx ON invoice_revision(invoice_number);
CREATE TRIGGER invoice_revision_no_update BEFORE UPDATE ON invoice_revision
BEGIN SELECT RAISE(ABORT,'invoice version is immutable'); END;
CREATE TRIGGER invoice_revision_no_delete BEFORE DELETE ON invoice_revision
BEGIN SELECT RAISE(ABORT,'invoice version is immutable'); END;
-- Only an issued, still collectible invoice gains versions, strictly one after the other,
-- each chained to the hash of the version it replaces.
CREATE TRIGGER invoice_revision_insert_guard BEFORE INSERT ON invoice_revision
WHEN NOT EXISTS(SELECT 1 FROM invoice i WHERE i.id=NEW.invoice_id
                  AND i.state IN('issued','sent','partially_paid','paid','overdue')
                  AND i.invoice_number IS NOT NULL AND i.calculation_hash IS NOT NULL
                  AND i.currency=NEW.currency)
  OR NEW.revision_number<>COALESCE((SELECT MAX(r.revision_number) FROM invoice_revision r WHERE r.invoice_id=NEW.invoice_id),1)+1
  OR NEW.previous_calculation_hash<>COALESCE(
       (SELECT r.calculation_hash FROM invoice_revision r WHERE r.invoice_id=NEW.invoice_id ORDER BY r.revision_number DESC LIMIT 1),
       (SELECT i.calculation_hash FROM invoice i WHERE i.id=NEW.invoice_id))
  OR NEW.previous_invoice_number<>COALESCE(
       (SELECT r.invoice_number FROM invoice_revision r WHERE r.invoice_id=NEW.invoice_id ORDER BY r.revision_number DESC LIMIT 1),
       (SELECT i.invoice_number FROM invoice i WHERE i.id=NEW.invoice_id))
BEGIN SELECT RAISE(ABORT,'invoice version does not follow the current version'); END;
-- An invoice number belongs to one invoice forever (issued number or any version's number).
CREATE TRIGGER invoice_revision_number_unique BEFORE INSERT ON invoice_revision
WHEN EXISTS(SELECT 1 FROM invoice i WHERE i.invoice_number=NEW.invoice_number AND i.id<>NEW.invoice_id)
  OR EXISTS(SELECT 1 FROM invoice_revision r WHERE r.invoice_number=NEW.invoice_number AND r.invoice_id<>NEW.invoice_id)
BEGIN SELECT RAISE(ABORT,'invoice number is already used'); END;
CREATE TRIGGER invoice_number_not_in_versions BEFORE UPDATE OF invoice_number ON invoice
WHEN NEW.invoice_number IS NOT NULL
  AND EXISTS(SELECT 1 FROM invoice_revision r WHERE r.invoice_number=NEW.invoice_number AND r.invoice_id<>NEW.id)
BEGIN SELECT RAISE(ABORT,'invoice number is already used'); END;

CREATE TABLE invoice_revision_pdf(
  revision_id TEXT PRIMARY KEY REFERENCES invoice_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  storage_key TEXT NOT NULL UNIQUE CHECK(length(trim(storage_key))>0),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  byte_length INTEGER NOT NULL CHECK(byte_length>0),
  generated_at TEXT NOT NULL CHECK(length(generated_at)>0)
) STRICT;
CREATE TRIGGER invoice_revision_pdf_no_update BEFORE UPDATE ON invoice_revision_pdf
BEGIN SELECT RAISE(ABORT,'invoice version PDF is immutable'); END;
CREATE TRIGGER invoice_revision_pdf_no_delete BEFORE DELETE ON invoice_revision_pdf
BEGIN SELECT RAISE(ABORT,'invoice version PDF is immutable'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','invoice.number_counter_set','project','user','WP-INV4','restricted'),
 ('B5-R4','invoice.number_request','invoice','user','WP-INV4','restricted'),
 ('B5-R4','invoice.revision_create','invoice','user','WP-INV4','restricted'),
 ('B5-R4','invoice.revision_pdf_ready','invoice','user','WP-INV4','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
