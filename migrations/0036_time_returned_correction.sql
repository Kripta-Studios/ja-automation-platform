-- Returned time is immutable review history.  A worker may only make a new
-- draft correction from a reviewer-returned (needs_changes) time entry; the
-- original row and its review reason remain intact.

DROP TRIGGER correction_link_subject_guard;
CREATE TRIGGER correction_link_subject_guard BEFORE INSERT ON record_correction_link WHEN
  (NEW.record_type='time_entry' AND (NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id))) OR
  (NEW.record_type='expense' AND (NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id))) OR
  (NEW.record_type='daily_report' AND (NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='technical_report' AND (NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='time_entry' AND (
    NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id AND (approval_state IN ('approved','locked','needs_changes') OR billing_status='locked' OR locked_at IS NOT NULL)) OR
    NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id AND approval_state='draft' AND invoice_id IS NULL AND COALESCE(billing_status,'unlocked')='unlocked' AND locked_at IS NULL) OR
    NOT EXISTS(
      SELECT 1 FROM time_entry original
      JOIN time_entry correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='expense' AND (
    NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id AND (approval_state IN ('approved','locked') OR billing_state='locked' OR billing_lock_id IS NOT NULL)) OR
    NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id AND approval_state='draft' AND invoice_id IS NULL AND COALESCE(billing_state,'unlocked')='unlocked' AND billing_lock_id IS NULL) OR
    NOT EXISTS(
      SELECT 1 FROM expense original
      JOIN expense correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='daily_report' AND (
    NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id AND approval_state IN ('approved','locked')) OR
    NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id AND approval_state='draft') OR
    NOT EXISTS(
      SELECT 1 FROM daily_report original
      JOIN daily_report correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='technical_report' AND (
    NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id AND approval_state IN ('approved','locked')) OR
    NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id AND approval_state='draft') OR
    NOT EXISTS(
      SELECT 1 FROM technical_report original
      JOIN technical_report correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.author_id=correction.author_id
    )
  )) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid correction subject'); END;

-- Widen append-only migration metadata without changing its prior evidence.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v35;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 36),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v35;
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
DROP TABLE migration_contract_metadata_v35;
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
