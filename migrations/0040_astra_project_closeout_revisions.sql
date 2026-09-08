-- Immutable closeout series. Legacy project_closeout stays untouched as historical
-- evidence; this migration deliberately creates no customer-facing artifact from it.
CREATE TABLE project_closeout_series(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  current_draft_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE project_closeout_revision(
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES project_closeout_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number>0),
  state TEXT NOT NULL CHECK(state IN('draft','final')),
  internal_snapshot_json TEXT NOT NULL,
  client_snapshot_json TEXT NOT NULL,
  client_selection_json TEXT NOT NULL,
  internal_snapshot_sha256 TEXT NOT NULL CHECK(length(internal_snapshot_sha256)=64),
  client_snapshot_sha256 TEXT NOT NULL CHECK(length(client_snapshot_sha256)=64),
  client_confirmation_hash TEXT CHECK(client_confirmation_hash IS NULL OR length(client_confirmation_hash)=64),
  client_confirmed_by TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  client_confirmed_at TEXT,
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_by TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  finalized_at TEXT,
  UNIQUE(series_id,revision_number)
) STRICT;
CREATE TABLE project_closeout_artifact(
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES project_closeout_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  audience TEXT NOT NULL CHECK(audience IN('internal','client')),
  storage_key TEXT NOT NULL UNIQUE,
  semantic_filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type='application/zip'),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0),
  created_at TEXT NOT NULL,
  UNIQUE(revision_id,audience)
) STRICT;
CREATE TABLE project_closeout_reopen_event(
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES project_closeout_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES project_closeout_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reopened_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reopened_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000)
) STRICT;
CREATE INDEX project_closeout_revision_series_idx ON project_closeout_revision(series_id,revision_number DESC);
CREATE INDEX project_closeout_artifact_revision_idx ON project_closeout_artifact(revision_id,audience);

CREATE TRIGGER project_closeout_revision_immutable_final
BEFORE UPDATE ON project_closeout_revision WHEN OLD.state='final'
BEGIN SELECT RAISE(ABORT,'final closeout revision is immutable'); END;
CREATE TRIGGER project_closeout_revision_no_delete BEFORE DELETE ON project_closeout_revision
BEGIN SELECT RAISE(ABORT,'closeout revision history is immutable'); END;
CREATE TRIGGER project_closeout_artifact_no_update BEFORE UPDATE ON project_closeout_artifact
BEGIN SELECT RAISE(ABORT,'closeout artifact is immutable'); END;
CREATE TRIGGER project_closeout_artifact_no_delete BEFORE DELETE ON project_closeout_artifact
BEGIN SELECT RAISE(ABORT,'closeout artifact is immutable'); END;
CREATE TRIGGER project_closeout_reopen_event_no_update BEFORE UPDATE ON project_closeout_reopen_event
BEGIN SELECT RAISE(ABORT,'closeout reopen evidence is immutable'); END;
CREATE TRIGGER project_closeout_reopen_event_no_delete BEFORE DELETE ON project_closeout_reopen_event
BEGIN SELECT RAISE(ABORT,'closeout reopen evidence is immutable'); END;

-- Widen the immutable reviewed-migration ledger before the runner records 0040.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v39;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 40),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement',
    'customer_conformity_evidence_attachment','mfa_optional_policy','astra_project_closeout_revisions'
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
  node_version TEXT NOT NULL CHECK(length(node_version)>0), sqlite_version TEXT NOT NULL CHECK(length(sqlite_version)>0), applied_at TEXT NOT NULL CHECK(length(applied_at)>0)
) STRICT;
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v39;
ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_v20;
CREATE TABLE finance_v2_cutover(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), migration_version INTEGER NOT NULL CHECK(migration_version=20) REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'), cutover_at TEXT NOT NULL CHECK(length(cutover_at)>0)
) STRICT;
INSERT INTO finance_v2_cutover SELECT * FROM finance_v2_cutover_v20;
DROP TABLE finance_v2_cutover_v20; DROP TABLE migration_contract_metadata_v39;
CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_replace BEFORE INSERT ON migration_contract_metadata WHEN EXISTS(SELECT 1 FROM migration_contract_metadata existing WHERE existing.migration_version=NEW.migration_version OR existing.migration_name=NEW.migration_name) BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_replace BEFORE INSERT ON finance_v2_cutover WHEN EXISTS(SELECT 1 FROM finance_v2_cutover existing WHERE existing.singleton=NEW.singleton) BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

-- The closeout lifecycle can only append through reviewed audit identities.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','project_closeout.prepare','project_closeout_revision','user','ASTRA-B4','restricted'),
  ('B5-R4','project_closeout.client_publication_confirm','project_closeout_revision','user','ASTRA-B4','restricted'),
  ('B5-R4','project_closeout.finalize','project_closeout_revision','user','ASTRA-B4','restricted'),
  ('B5-R4','project_closeout.reopen','project_closeout_revision','user','ASTRA-B4','restricted'),
  ('B5-R4','project_closeout.download','project_closeout_artifact','user','ASTRA-B4','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
