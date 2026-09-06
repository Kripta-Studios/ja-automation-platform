-- Production human portal accounts must enroll a second factor. Service
-- actors have a separate table/namespace and are intentionally untouched.
UPDATE user
SET mfa_required=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),version=version+1
WHERE status IN ('active','invited')
  AND role IN ('owner_admin','finance_admin','project_manager','worker','auditor_read_only')
  AND mfa_required=0;

-- Preserve every linked identity while reserving one synthetic mailbox for
-- the fixed disposable E2E deployment. A trigger below makes this exception
-- unavailable in production and every other deployment.
DROP INDEX mail_identity_status_idx;
ALTER TABLE mail_identity RENAME TO mail_identity_v35;
CREATE TABLE mail_identity(
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  stalwart_account_id TEXT NOT NULL UNIQUE CHECK(length(trim(stalwart_account_id))>0),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(
    email=lower(email) AND
    (email LIKE '%@j-aautomation.com' OR email='owner@demo.jaautomation.test') AND
    length(email)<=254
  ),
  auth_mode TEXT NOT NULL CHECK(auth_mode IN('webmail','hybrid')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
  linked_by TEXT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  linked_at TEXT NOT NULL CHECK(length(linked_at)>0),
  archived_at TEXT NULL,
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK((status='active' AND archived_at IS NULL) OR (status='archived' AND archived_at IS NOT NULL))
) STRICT;
INSERT INTO mail_identity SELECT * FROM mail_identity_v35;
DROP TABLE mail_identity_v35;
CREATE INDEX mail_identity_status_idx ON mail_identity(status,email);
CREATE TRIGGER mail_identity_synthetic_owner_insert_guard BEFORE INSERT ON mail_identity
WHEN lower(NEW.email)='owner@demo.jaautomation.test' AND NOT EXISTS(
  SELECT 1 FROM deployment_identity d
  WHERE d.singleton=1
    AND d.tenant_id='e2e-client-essential-tenant'
    AND d.deployment_id='e2e-client-essential-deployment'
)
BEGIN SELECT RAISE(ABORT,'synthetic Owner mailbox requires the E2E deployment identity'); END;
CREATE TRIGGER mail_identity_synthetic_owner_update_guard BEFORE UPDATE OF email ON mail_identity
WHEN lower(NEW.email)='owner@demo.jaautomation.test' AND NOT EXISTS(
  SELECT 1 FROM deployment_identity d
  WHERE d.singleton=1
    AND d.tenant_id='e2e-client-essential-tenant'
    AND d.deployment_id='e2e-client-essential-deployment'
)
BEGIN SELECT RAISE(ABORT,'synthetic Owner mailbox requires the E2E deployment identity'); END;

-- The disposable E2E fixture has one separately reserved Owner identity.
-- This is gated by the immutable persisted deployment identity, never by a
-- process flag or NODE_ENV. Every other deployment remains Antonny-only.
DROP TRIGGER user_canonical_owner_insert_guard;
DROP TRIGGER user_canonical_owner_update_guard;
CREATE TRIGGER user_canonical_owner_insert_guard BEFORE INSERT ON user
WHEN NEW.role='owner_admin' AND NOT (
  (
    lower(NEW.email)='owner@demo.jaautomation.test' AND
    EXISTS(
      SELECT 1 FROM deployment_identity d
      WHERE d.singleton=1
        AND d.tenant_id='e2e-client-essential-tenant'
        AND d.deployment_id='e2e-client-essential-deployment'
    )
  ) OR (
    lower(NEW.email)='antonny.luty@j-aautomation.com' AND NOT EXISTS(
      SELECT 1 FROM deployment_identity d
      WHERE d.singleton=1
        AND d.tenant_id='e2e-client-essential-tenant'
        AND d.deployment_id='e2e-client-essential-deployment'
    )
  )
)
BEGIN SELECT RAISE(ABORT,'only the designated deployment Owner may be owner_admin'); END;
CREATE TRIGGER user_canonical_owner_update_guard BEFORE UPDATE OF email,role,status ON user
WHEN
  (NEW.role='owner_admin' AND NOT (
    (
      lower(NEW.email)='owner@demo.jaautomation.test' AND
      EXISTS(
        SELECT 1 FROM deployment_identity d
        WHERE d.singleton=1
          AND d.tenant_id='e2e-client-essential-tenant'
          AND d.deployment_id='e2e-client-essential-deployment'
      )
    ) OR (
      lower(NEW.email)='antonny.luty@j-aautomation.com' AND NOT EXISTS(
        SELECT 1 FROM deployment_identity d
        WHERE d.singleton=1
          AND d.tenant_id='e2e-client-essential-tenant'
          AND d.deployment_id='e2e-client-essential-deployment'
      )
    )
  )) OR
  (OLD.role='owner_admin' AND (
    lower(NEW.email)<>lower(OLD.email) OR NEW.role<>'owner_admin' OR NEW.status<>'active'
  ))
BEGIN SELECT RAISE(ABORT,'designated Owner is immutable'); END;

-- Widen append-only migration metadata without changing prior evidence.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v36;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 37),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v36;
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
DROP TABLE migration_contract_metadata_v36;
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
