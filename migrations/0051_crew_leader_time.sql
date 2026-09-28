-- Expand the reviewed migration ledger without changing prior evidence.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v50;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 51),
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
    'expense_occurrence_time_shift_link','crew_leader_time'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v50;
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
DROP TABLE migration_contract_metadata_v50;
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

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','crew.grant','crew_leader_grant','user','CREW-LEADER-TIME','confidential'),
  ('B5-R4','crew.revoke','crew_leader_grant','user','CREW-LEADER-TIME','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;

-- A project chief can enter time only for named workers and bounded dates.
-- Revocation is a state change so historical recorder provenance remains intact.
CREATE TABLE crew_leader_grant(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  chief_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  worker_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  starts_on TEXT NOT NULL CHECK(starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on TEXT CHECK(ends_on IS NULL OR ends_on >= starts_on),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  revoked_by_user_id TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revoked_at TEXT,
  CHECK(chief_user_id <> worker_user_id),
  CHECK((status='active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL))
) STRICT;
CREATE INDEX crew_leader_grant_scope_idx
  ON crew_leader_grant(chief_user_id,project_id,worker_user_id,status,starts_on,ends_on);
CREATE UNIQUE INDEX crew_leader_grant_active_unique
  ON crew_leader_grant(project_id,chief_user_id,worker_user_id)
  WHERE status='active';
-- A recorder references this grant as historical authority. Only one-way
-- revocation may change it; the scope and creation evidence cannot be edited.
CREATE TRIGGER crew_leader_grant_revocation_only BEFORE UPDATE ON crew_leader_grant
WHEN NOT (
  OLD.status='active' AND NEW.status='revoked'
  AND NEW.id IS OLD.id
  AND NEW.project_id IS OLD.project_id
  AND NEW.chief_user_id IS OLD.chief_user_id
  AND NEW.worker_user_id IS OLD.worker_user_id
  AND NEW.starts_on IS OLD.starts_on
  AND NEW.ends_on IS OLD.ends_on
  AND NEW.created_by_user_id IS OLD.created_by_user_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.revoked_by_user_id IS NOT NULL
  AND NEW.revoked_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'crew leader grant provenance immutable'); END;
CREATE TRIGGER crew_leader_grant_no_delete BEFORE DELETE ON crew_leader_grant
BEGIN SELECT RAISE(ABORT,'crew leader grant history immutable'); END;

CREATE TABLE crew_time_entry_recorder(
  time_entry_id TEXT PRIMARY KEY REFERENCES time_entry(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES crew_leader_grant(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER crew_time_entry_recorder_scope_insert BEFORE INSERT ON crew_time_entry_recorder
WHEN NOT EXISTS(
  SELECT 1 FROM crew_leader_grant g JOIN time_entry t ON t.id=NEW.time_entry_id
  WHERE g.id=NEW.grant_id AND g.status='active'
    AND g.chief_user_id=NEW.recorded_by_user_id
    AND g.project_id=t.project_id AND g.worker_user_id=t.worker_id
    AND g.starts_on<=t.work_date AND (g.ends_on IS NULL OR g.ends_on>=t.work_date)
)
BEGIN SELECT RAISE(ABORT,'crew time recorder scope mismatch'); END;
CREATE TRIGGER crew_time_entry_recorder_no_update BEFORE UPDATE ON crew_time_entry_recorder
BEGIN SELECT RAISE(ABORT,'crew time recorder immutable'); END;
CREATE TRIGGER crew_time_entry_recorder_no_delete BEFORE DELETE ON crew_time_entry_recorder
BEGIN SELECT RAISE(ABORT,'crew time recorder immutable'); END;

CREATE TABLE crew_time_batch_request(
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  request_id TEXT NOT NULL CHECK(length(trim(request_id)) BETWEEN 16 AND 200),
  request_payload_sha256 TEXT NOT NULL CHECK(length(request_payload_sha256)=64 AND request_payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  result_json TEXT NOT NULL CHECK(json_valid(result_json) AND json_type(result_json)='array'),
  created_at TEXT NOT NULL,
  UNIQUE(actor_user_id,request_id)
) STRICT;
CREATE TRIGGER crew_time_batch_request_no_update BEFORE UPDATE ON crew_time_batch_request
BEGIN SELECT RAISE(ABORT,'crew time batch request immutable'); END;
CREATE TRIGGER crew_time_batch_request_no_delete BEFORE DELETE ON crew_time_batch_request
BEGIN SELECT RAISE(ABORT,'crew time batch request immutable'); END;
