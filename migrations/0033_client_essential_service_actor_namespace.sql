-- Client Essential service-actor namespace hardening.
--
-- Service actors are a separate identity namespace.  Existing data is checked
-- before the namespace guards are installed; a collision aborts the complete
-- migration transaction and is never silently renamed.

CREATE TABLE migration_0033_namespace_preflight(
  marker INTEGER PRIMARY KEY
) STRICT;
CREATE TRIGGER migration_0033_namespace_preflight_guard
BEFORE INSERT ON migration_0033_namespace_preflight
WHEN EXISTS(
  SELECT 1
  FROM user u
  JOIN service_actor s ON s.id=u.id
)
BEGIN
  SELECT RAISE(ABORT,'service actor and user id namespace collision');
END;
INSERT INTO migration_0033_namespace_preflight(marker) VALUES(1);
DROP TRIGGER migration_0033_namespace_preflight_guard;
DROP TABLE migration_0033_namespace_preflight;

-- Migration metadata is itself append-only, so widen its reviewed version and
-- name checks while retaining every existing row byte-for-byte.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v32;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 33),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824',
    'period_report_reapproval','period_report_source_binding','finance_source_manifest',
    'client_essential_worker_statement_jobs','client_essential_service_actor_namespace'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v32;
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
DROP TABLE migration_contract_metadata_v32;

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

-- IDs cannot be renamed and neither identity table may acquire an ID from the
-- other namespace.  The guards cover both insert directions and both update
-- directions so this remains true after future schema changes.
CREATE TRIGGER service_actor_namespace_insert_guard
BEFORE INSERT ON service_actor
WHEN EXISTS(SELECT 1 FROM user WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'service actor id collides with user namespace'); END;
CREATE TRIGGER service_actor_namespace_update_guard
BEFORE UPDATE OF id ON service_actor
WHEN NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'service actor id rename is forbidden'); END;
CREATE TRIGGER user_service_actor_namespace_insert_guard
BEFORE INSERT ON user
WHEN EXISTS(SELECT 1 FROM service_actor WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'user id collides with service actor namespace'); END;
CREATE TRIGGER user_service_actor_namespace_update_guard
BEFORE UPDATE OF id ON user
WHEN NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'user id rename is forbidden'); END;
