-- Client Essential CORE-11: issued invoice and invoice-PDF lifecycle guards.
--
-- The invoice table already contains the required identity/snapshot columns in
-- the shipped schema.  This migration adds database-boundary guards only; it
-- does not backfill or reinterpret historical invoice values.  Existing rows
-- that cannot satisfy the new PDF lifecycle contract abort the migration so a
-- deployment can remediate them explicitly without silently changing history.

-- Fail closed before replacing any existing trigger or metadata table when a
-- legacy row uses an unsupported PDF state or has a ready PDF without a full
-- durable metadata tuple.
CREATE TABLE migration_0034_invoice_immutability_preflight(
  marker INTEGER PRIMARY KEY
) STRICT;
CREATE TRIGGER migration_0034_invoice_immutability_preflight_guard
BEFORE INSERT ON migration_0034_invoice_immutability_preflight
WHEN EXISTS(
  SELECT 1
  FROM invoice
  WHERE pdf_status IS NULL
     OR pdf_status NOT IN ('pending','running','failed','ready')
     OR (
       pdf_status='ready' AND NOT(
         pdf_storage_key IS NOT NULL AND length(trim(pdf_storage_key))>0 AND
         pdf_sha256 IS NOT NULL AND length(pdf_sha256)=64 AND
         pdf_sha256 NOT GLOB '*[^0-9a-f]*' AND
         pdf_byte_length IS NOT NULL AND pdf_byte_length>0 AND
         pdf_generated_at IS NOT NULL AND length(trim(pdf_generated_at))>0
       )
     )
)
BEGIN
  SELECT RAISE(ABORT,'invoice PDF lifecycle preflight failed');
END;
INSERT INTO migration_0034_invoice_immutability_preflight(marker) VALUES(1);
DROP TRIGGER migration_0034_invoice_immutability_preflight_guard;
DROP TABLE migration_0034_invoice_immutability_preflight;

-- Migration metadata is append-only.  Widen its reviewed version/name
-- contract transactionally while retaining every previous row exactly.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;

ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v33;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 34),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824',
    'period_report_reapproval','period_report_source_binding','finance_source_manifest',
    'client_essential_worker_statement_jobs','client_essential_service_actor_namespace',
    'client_essential_invoice_immutability'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v33;

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
DROP TABLE migration_contract_metadata_v33;

CREATE TRIGGER migration_contract_metadata_no_update
BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete
BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_replace
BEFORE INSERT ON migration_contract_metadata
WHEN EXISTS(
  SELECT 1 FROM migration_contract_metadata existing
  WHERE existing.migration_version=NEW.migration_version OR existing.migration_name=NEW.migration_name
)
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update
BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete
BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_replace
BEFORE INSERT ON finance_v2_cutover
WHEN EXISTS(SELECT 1 FROM finance_v2_cutover existing WHERE existing.singleton=NEW.singleton)
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

-- Finalized invoices are immutable snapshots, including their child source
-- projections.  Existing UPDATE/DELETE guards protect rows that were already
-- present when the invoice was issued, but an INSERT guard is also required:
-- without it a caller could append a new line/source/manifest row after issue
-- while leaving the parent invoice snapshot untouched.  Use the same complete
-- historical state set as the existing child UPDATE/DELETE guards.  Draft and
-- approved invoices remain writable so creation, refresh and correction
-- lifecycles can materialize their child projections transactionally before
-- the approved -> issued transition.
CREATE TRIGGER client_essential_issued_invoice_line_no_insert
BEFORE INSERT ON invoice_line
WHEN EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=NEW.invoice_id
    AND invoice.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN
  SELECT RAISE(ABORT,'issued invoice lines are immutable');
END;

CREATE TRIGGER client_essential_issued_invoice_source_no_insert
BEFORE INSERT ON invoice_source
WHEN EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=NEW.invoice_id
    AND invoice.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN
  SELECT RAISE(ABORT,'issued invoice sources are immutable');
END;

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

-- Keep the historical trigger name used by existing callers, but extend its
-- comparison to every identity/snapshot column present in the shipped invoice
-- schema.  Lifecycle state, updated_at and version remain transition metadata.
DROP TRIGGER issued_invoice_snapshot_no_update;
CREATE TRIGGER issued_invoice_snapshot_no_update
BEFORE UPDATE ON invoice
WHEN OLD.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
 AND (
   NEW.id IS NOT OLD.id OR
   NEW.created_at IS NOT OLD.created_at OR
   NEW.tenant_id IS NOT OLD.tenant_id OR
   NEW.deployment_id IS NOT OLD.deployment_id OR
   NEW.project_id IS NOT OLD.project_id OR
   NEW.billing_rule_id IS NOT OLD.billing_rule_id OR
   NEW.invoice_number IS NOT OLD.invoice_number OR
   NEW.stream_type IS NOT OLD.stream_type OR
   NEW.currency IS NOT OLD.currency OR
   NEW.subtotal_minor IS NOT OLD.subtotal_minor OR
   NEW.tax_minor IS NOT OLD.tax_minor OR
   NEW.total_minor IS NOT OLD.total_minor OR
   NEW.period_start IS NOT OLD.period_start OR
   NEW.period_end IS NOT OLD.period_end OR
   NEW.due_at IS NOT OLD.due_at OR
   NEW.issued_at IS NOT OLD.issued_at OR
   NEW.snapshot_json IS NOT OLD.snapshot_json OR
   NEW.calculation_hash IS NOT OLD.calculation_hash OR
   NEW.legal_entity_revision_id IS NOT OLD.legal_entity_revision_id OR
   NEW.configuration_revision_id IS NOT OLD.configuration_revision_id OR
   NEW.predecessor_subject_hash IS NOT OLD.predecessor_subject_hash OR
   NEW.invoice_subject_hash IS NOT OLD.invoice_subject_hash OR
   NEW.source_lock_at IS NOT OLD.source_lock_at OR
   NEW.planned_issue_on IS NOT OLD.planned_issue_on
 )
BEGIN
  SELECT RAISE(ABORT,'issued invoice snapshot is immutable');
END;

-- A sent timestamp is a write-once fact.  A void timestamp follows the same
-- rule; setting it is still allowed as part of the explicit void transition.
CREATE TRIGGER client_essential_invoice_sent_at_guard
BEFORE UPDATE OF sent_at ON invoice
WHEN OLD.sent_at IS NOT NULL AND NEW.sent_at IS NOT OLD.sent_at
BEGIN
  SELECT RAISE(ABORT,'invoice sent_at is write-once');
END;
CREATE TRIGGER client_essential_invoice_voided_at_guard
BEFORE UPDATE OF voided_at ON invoice
WHEN OLD.voided_at IS NOT NULL AND NEW.voided_at IS NOT OLD.voided_at
BEGIN
  SELECT RAISE(ABORT,'invoice voided_at is write-once');
END;

-- PDF status is a truthful progress/retry state.  The database accepts the
-- progress states and one-way publication to ready; callers own the job
-- fencing that decides when a progress transition is legitimate.
CREATE TRIGGER client_essential_invoice_pdf_status_insert_guard
BEFORE INSERT ON invoice
WHEN NEW.pdf_status IS NULL OR NEW.pdf_status NOT IN ('pending','running','failed','ready')
BEGIN
  SELECT RAISE(ABORT,'invalid invoice PDF status');
END;
CREATE TRIGGER client_essential_invoice_pdf_status_update_guard
BEFORE UPDATE OF pdf_status ON invoice
WHEN NEW.pdf_status IS NULL OR NEW.pdf_status NOT IN ('pending','running','failed','ready')
BEGIN
  SELECT RAISE(ABORT,'invalid invoice PDF status transition');
END;

CREATE TRIGGER client_essential_invoice_pdf_ready_insert_guard
BEFORE INSERT ON invoice
WHEN NEW.pdf_status='ready' AND NOT(
  NEW.pdf_storage_key IS NOT NULL AND length(trim(NEW.pdf_storage_key))>0 AND
  NEW.pdf_sha256 IS NOT NULL AND length(NEW.pdf_sha256)=64 AND
  NEW.pdf_sha256 NOT GLOB '*[^0-9a-f]*' AND
  NEW.pdf_byte_length IS NOT NULL AND NEW.pdf_byte_length>0 AND
  NEW.pdf_generated_at IS NOT NULL AND length(trim(NEW.pdf_generated_at))>0
)
BEGIN
  SELECT RAISE(ABORT,'ready invoice PDF metadata is incomplete');
END;
CREATE TRIGGER client_essential_invoice_pdf_ready_update_guard
BEFORE UPDATE ON invoice
WHEN NEW.pdf_status='ready' AND NOT(
  NEW.pdf_storage_key IS NOT NULL AND length(trim(NEW.pdf_storage_key))>0 AND
  NEW.pdf_sha256 IS NOT NULL AND length(NEW.pdf_sha256)=64 AND
  NEW.pdf_sha256 NOT GLOB '*[^0-9a-f]*' AND
  NEW.pdf_byte_length IS NOT NULL AND NEW.pdf_byte_length>0 AND
  NEW.pdf_generated_at IS NOT NULL AND length(trim(NEW.pdf_generated_at))>0
)
BEGIN
  SELECT RAISE(ABORT,'ready invoice PDF metadata is incomplete');
END;

-- A ready artifact is terminal and its durable identity tuple is immutable.
-- updated_at/version and invoice lifecycle fields remain independently mutable.
CREATE TRIGGER client_essential_invoice_pdf_ready_terminal_guard
BEFORE UPDATE ON invoice
WHEN OLD.pdf_status='ready' AND (
  NEW.pdf_status IS NOT OLD.pdf_status OR
  NEW.pdf_storage_key IS NOT OLD.pdf_storage_key OR
  NEW.pdf_sha256 IS NOT OLD.pdf_sha256 OR
  NEW.pdf_byte_length IS NOT OLD.pdf_byte_length OR
  NEW.pdf_generated_at IS NOT OLD.pdf_generated_at
)
BEGIN
  SELECT RAISE(ABORT,'ready invoice PDF is terminal and immutable');
END;
