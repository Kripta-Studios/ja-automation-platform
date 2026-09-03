-- Stalwart mailbox identities and the single canonical portal owner.
-- Passwords and Stalwart credential hashes are deliberately not persisted here.

CREATE TABLE mail_identity(
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  stalwart_account_id TEXT NOT NULL UNIQUE CHECK(length(trim(stalwart_account_id))>0),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(
    email=lower(email) AND email LIKE '%@j-aautomation.com' AND length(email)<=254
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
CREATE INDEX mail_identity_status_idx ON mail_identity(status,email);

CREATE TABLE mailbox_external_command(
  idempotency_key TEXT PRIMARY KEY CHECK(length(idempotency_key) BETWEEN 16 AND 200),
  actor_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK(operation IN('create','password_update','destroy')),
  target_key TEXT NOT NULL CHECK(length(trim(target_key))>0 AND length(target_key)<=254),
  status TEXT NOT NULL CHECK(status IN('pending','external_done','complete')),
  result_json TEXT NULL CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT NULL,
  CHECK((status='complete' AND completed_at IS NOT NULL) OR (status<>'complete' AND completed_at IS NULL))
) STRICT;
CREATE INDEX mailbox_external_command_status_idx ON mailbox_external_command(status,updated_at);
CREATE UNIQUE INDEX mailbox_external_command_inflight_unique
ON mailbox_external_command(actor_id,operation,target_key) WHERE status<>'complete';

-- The mail integration has one release authority: Antonny. Enforce this at
-- the database boundary too, so legacy repository paths cannot create a
-- second Owner or demote/rename/offboard the canonical Owner.
CREATE TRIGGER user_canonical_owner_insert_guard BEFORE INSERT ON user
WHEN NEW.role='owner_admin' AND lower(NEW.email)<>'antonny.luty@j-aautomation.com'
BEGIN SELECT RAISE(ABORT,'only canonical Antonny may be owner_admin'); END;
CREATE TRIGGER user_canonical_owner_update_guard BEFORE UPDATE OF email,role,status ON user
WHEN
  (NEW.role='owner_admin' AND lower(NEW.email)<>'antonny.luty@j-aautomation.com' AND
   NOT (OLD.role='owner_admin' AND lower(OLD.email)=lower(NEW.email))) OR
  (lower(OLD.email)='antonny.luty@j-aautomation.com' AND
   (lower(NEW.email)<>'antonny.luty@j-aautomation.com' OR NEW.role<>'owner_admin' OR NEW.status<>'active'))
BEGIN SELECT RAISE(ABORT,'canonical Owner is immutable'); END;

-- Extend the immutable reviewed audit-action manifest for this packet.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','user.bootstrap','user','system','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.provision','mail_identity','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.bootstrap','mail_identity','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.role_change','mail_identity','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.portal_offboard','mail_identity','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.create','mailbox','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.password_update','mailbox','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.destroy','mailbox','user','WP-MAIL-BE','restricted'),
 ('B5-R4','mailbox.sessions_revoke','user','user','WP-MAIL-BE','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version
    AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type
    AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet
    AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;

-- Widen append-only migration metadata while retaining all previous evidence.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v34;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 35),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v34;
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
DROP TABLE migration_contract_metadata_v34;
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
