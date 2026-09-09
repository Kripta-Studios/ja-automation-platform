-- Supplier workforce is an additive operational profile over the existing
-- worker role.  It never creates a supplier role or a finance entitlement.
CREATE TABLE supplier(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE supplier_user_profile(
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  profile TEXT NOT NULL CHECK(profile IN ('external_technician','supplier_coordinator')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX supplier_user_profile_supplier_idx ON supplier_user_profile(supplier_id,profile);

-- Access periods bind supplier-visible personnel time to the exact interval in
-- which the worker had an external-technician profile.  This prevents older
-- internal time, and time entered while a profile was cleared, from becoming
-- supplier-visible after a later profile change.
CREATE TABLE supplier_user_profile_period(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  profile TEXT NOT NULL CHECK(profile IN ('external_technician','supplier_coordinator')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR ends_at>=starts_at)
) STRICT;
CREATE UNIQUE INDEX supplier_user_profile_period_open_user_idx
  ON supplier_user_profile_period(user_id) WHERE ends_at IS NULL;
CREATE INDEX supplier_user_profile_period_visibility_idx
  ON supplier_user_profile_period(user_id,supplier_id,profile,starts_at,ends_at);
CREATE TRIGGER supplier_user_profile_period_update_guard BEFORE UPDATE ON supplier_user_profile_period
WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.supplier_id<>OLD.supplier_id
  OR NEW.profile<>OLD.profile OR NEW.starts_at<>OLD.starts_at OR NEW.created_at<>OLD.created_at
  OR OLD.ends_at IS NOT NULL OR NEW.ends_at IS NULL
BEGIN SELECT RAISE(ABORT,'supplier profile period is append-only'); END;
CREATE TRIGGER supplier_user_profile_period_no_delete BEFORE DELETE ON supplier_user_profile_period
BEGIN SELECT RAISE(ABORT,'supplier profile period is retained'); END;

CREATE TABLE supplier_project_grant(
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  coordinator_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  revoked_at TEXT,
  revoked_by TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_on IS NULL OR ends_on>=starts_on),
  CHECK((status='active' AND revoked_at IS NULL AND revoked_by IS NULL) OR
        (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
) STRICT;
CREATE INDEX supplier_project_grant_scope_idx
  ON supplier_project_grant(supplier_id,coordinator_id,project_id,status,starts_on,ends_on);

-- This metadata is intentionally append-only.  The canonical time row remains
-- the source of approval, payroll, and reporting; this only records its actor.
CREATE TABLE supplier_time_entry_recorder(
  time_entry_id TEXT PRIMARY KEY REFERENCES time_entry(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER supplier_time_entry_recorder_no_update BEFORE UPDATE ON supplier_time_entry_recorder
BEGIN SELECT RAISE(ABORT,'supplier time recorder is append-only'); END;
CREATE TRIGGER supplier_time_entry_recorder_no_delete BEFORE DELETE ON supplier_time_entry_recorder
BEGIN SELECT RAISE(ABORT,'supplier time recorder is retained'); END;

-- Widen the immutable reviewed-migration ledger before runner metadata is added.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v41;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 42),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement',
    'customer_conformity_evidence_attachment','mfa_optional_policy','astra_project_closeout_revisions',
    'astra_period_followup','supplier_workforce'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v41;
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
DROP TABLE migration_contract_metadata_v41;
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

-- Register every new append action before restoring the closed registry guard.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','supplier.create','supplier','user','SUPPLIER-WORKFORCE','confidential'),
  ('B5-R4','supplier.profile.set','supplier_user_profile','user','SUPPLIER-WORKFORCE','confidential'),
  ('B5-R4','supplier.grant','supplier_project_grant','user','SUPPLIER-WORKFORCE','confidential'),
  ('B5-R4','supplier.revoke','supplier_project_grant','user','SUPPLIER-WORKFORCE','confidential'),
  ('B5-R4','supplier.technician.add','user','user','SUPPLIER-WORKFORCE','confidential'),
  ('B5-R4','supplier.assignment.create','project_member','user','SUPPLIER-WORKFORCE','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
