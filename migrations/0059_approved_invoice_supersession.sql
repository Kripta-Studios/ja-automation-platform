-- Preserve the reviewed migration contract while admitting version 59.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v58;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 59),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v58;
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
DROP TABLE migration_contract_metadata_v58;
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

-- An approved invoice can be recalculated before issue without erasing its
-- reviewed amount, lines or provenance. Only the live source reservation moves
-- to the replacement draft; the exact old source-link rows are retained here.
CREATE TABLE invoice_approved_supersession (
  prior_invoice_id TEXT PRIMARY KEY REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  replacement_invoice_id TEXT NOT NULL UNIQUE REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_approval_version INTEGER NOT NULL CHECK(prior_approval_version>0),
  source_links_json TEXT NOT NULL CHECK(json_valid(source_links_json)),
  source_links_sha256 TEXT NOT NULL CHECK(length(source_links_sha256)=64 AND source_links_sha256 NOT GLOB '*[^0-9a-f]*'),
  prior_snapshot_sha256 TEXT NOT NULL CHECK(length(prior_snapshot_sha256)=64 AND prior_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  prior_lines_sha256 TEXT NOT NULL CHECK(length(prior_lines_sha256)=64 AND prior_lines_sha256 NOT GLOB '*[^0-9a-f]*'),
  reason TEXT NOT NULL CHECK(length(trim(reason))>=3),
  actor_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  superseded_at TEXT NOT NULL,
  CHECK(prior_invoice_id<>replacement_invoice_id)
) STRICT;

CREATE TRIGGER invoice_approved_supersession_no_update
BEFORE UPDATE ON invoice_approved_supersession
BEGIN SELECT RAISE(ABORT,'approved invoice supersession is immutable'); END;
CREATE TRIGGER invoice_approved_supersession_no_delete
BEFORE DELETE ON invoice_approved_supersession
BEGIN SELECT RAISE(ABORT,'approved invoice supersession is immutable'); END;

CREATE TRIGGER superseded_invoice_no_update BEFORE UPDATE ON invoice
WHEN OLD.state='superseded'
BEGIN SELECT RAISE(ABORT,'superseded approved invoice is immutable'); END;
CREATE TRIGGER superseded_invoice_no_delete BEFORE DELETE ON invoice
WHEN OLD.state='superseded'
BEGIN SELECT RAISE(ABORT,'superseded approved invoice is immutable'); END;
CREATE TRIGGER superseded_invoice_line_no_insert BEFORE INSERT ON invoice_line
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice lines are immutable'); END;
CREATE TRIGGER superseded_invoice_line_no_update BEFORE UPDATE ON invoice_line
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice lines are immutable'); END;
CREATE TRIGGER superseded_invoice_line_no_delete BEFORE DELETE ON invoice_line
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice lines are immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_insert BEFORE INSERT ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_update BEFORE UPDATE ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_manifest_no_delete BEFORE DELETE ON invoice_commercial_source_manifest
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice manifest is immutable'); END;
CREATE TRIGGER superseded_invoice_source_no_insert BEFORE INSERT ON invoice_source
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice cannot reserve sources'); END;
CREATE TRIGGER superseded_invoice_source_no_update BEFORE UPDATE ON invoice_source
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='superseded')
  OR EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='superseded')
BEGIN SELECT RAISE(ABORT,'superseded approved invoice cannot change sources'); END;
