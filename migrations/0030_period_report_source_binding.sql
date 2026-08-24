-- Client Essential signed-source binding and durable report approval timestamp.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v29;

CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 30),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824',
    'period_report_reapproval','period_report_source_binding'
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
INSERT INTO migration_contract_metadata(
  migration_version,migration_name,descriptor_version,descriptor_sha256,sql_sha256,
  projection_sha256,vector_sha256,encoder_sha256,runner_sha256,heartbeat_worker_sha256,
  schema_hash_manifest,schema_hash_manifest_sha256,pre_projection_sha256,post_projection_sha256,
  node_version,sqlite_version,applied_at
)
SELECT migration_version,migration_name,descriptor_version,descriptor_sha256,sql_sha256,
  projection_sha256,vector_sha256,encoder_sha256,runner_sha256,heartbeat_worker_sha256,
  schema_hash_manifest,schema_hash_manifest_sha256,pre_projection_sha256,post_projection_sha256,
  node_version,sqlite_version,applied_at
FROM migration_contract_metadata_v29;

DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_v20;
CREATE TABLE finance_v2_cutover(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  migration_version INTEGER NOT NULL CHECK(migration_version=20)
    REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'),
  cutover_at TEXT NOT NULL CHECK(length(cutover_at)>0)
) STRICT;
INSERT INTO finance_v2_cutover(singleton,migration_version,descriptor_sha256,cutover_at)
SELECT singleton,migration_version,descriptor_sha256,cutover_at FROM finance_v2_cutover_v20;
DROP TABLE finance_v2_cutover_v20;
DROP TABLE migration_contract_metadata_v29;

CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_replace BEFORE INSERT ON migration_contract_metadata
WHEN EXISTS(
  SELECT 1 FROM migration_contract_metadata existing
  WHERE existing.migration_version=NEW.migration_version OR existing.migration_name=NEW.migration_name
)
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_replace BEFORE INSERT ON finance_v2_cutover
WHEN EXISTS(SELECT 1 FROM finance_v2_cutover existing WHERE existing.singleton=NEW.singleton)
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

ALTER TABLE period_report ADD COLUMN approved_at TEXT;

-- A version identifies exact source truth. Same-version snapshot mutation is
-- forbidden even after conformity invalidation. A PDF may be bound once to a
-- new version, but an existing binding cannot be cleared or replaced in place.
CREATE TRIGGER period_report_same_version_source_binding_guard
BEFORE UPDATE OF snapshot_json,snapshot_sha256,pdf_storage_key,pdf_sha256,pdf_byte_length
ON period_report
WHEN NEW.snapshot_version=OLD.snapshot_version AND (
  OLD.snapshot_json IS NOT NEW.snapshot_json OR
  OLD.snapshot_sha256 IS NOT NEW.snapshot_sha256 OR
  (
    (OLD.pdf_storage_key IS NOT NULL OR OLD.pdf_sha256 IS NOT NULL OR OLD.pdf_byte_length IS NOT NULL)
    AND (
      OLD.pdf_storage_key IS NOT NEW.pdf_storage_key OR
      OLD.pdf_sha256 IS NOT NEW.pdf_sha256 OR
      OLD.pdf_byte_length IS NOT NEW.pdf_byte_length
    )
  )
)
BEGIN
  SELECT RAISE(ABORT,'period report source binding is immutable within a snapshot version');
END;

CREATE TRIGGER period_report_pdf_binding_completeness_guard
BEFORE UPDATE OF pdf_storage_key,pdf_sha256,pdf_byte_length ON period_report
WHEN NOT (
  (NEW.pdf_storage_key IS NULL AND NEW.pdf_sha256 IS NULL AND NEW.pdf_byte_length IS NULL) OR
  (NEW.pdf_storage_key IS NOT NULL AND NEW.pdf_sha256 IS NOT NULL AND
   length(NEW.pdf_sha256)=64 AND NEW.pdf_byte_length IS NOT NULL AND NEW.pdf_byte_length>0)
)
BEGIN
  SELECT RAISE(ABORT,'period report PDF binding must be complete');
END;

CREATE TRIGGER period_report_active_conformity_approval_guard
BEFORE UPDATE OF approved_at ON period_report
WHEN OLD.approved_at IS NOT NEW.approved_at AND EXISTS(
  SELECT 1 FROM customer_conformity conformity
  WHERE conformity.period_report_id=OLD.id
    AND NOT EXISTS(
      SELECT 1 FROM customer_conformity_invalidation invalidation
      WHERE invalidation.conformity_id=conformity.id
    )
)
BEGIN
  SELECT RAISE(ABORT,'customer report approval is bound to active conformity');
END;
