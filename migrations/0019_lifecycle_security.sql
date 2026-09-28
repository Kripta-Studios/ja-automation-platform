-- B5 lifecycle/security foundation.
--
-- This file is intentionally static SQL.  The reviewed migration runner owns
-- BEGIN/ROLLBACK, the TEMP context tables, migration metadata and the
-- schema_migration row.  Running this file without that context is expected to
-- fail before any tenant-bearing data is copied.

CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 23),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN('lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry','localized_pdf_variants')),
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
CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;

CREATE TABLE deployment_identity(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  anchored_at TEXT NOT NULL CHECK(length(anchored_at)>0),
  UNIQUE(tenant_id,deployment_id)
) STRICT;
INSERT INTO deployment_identity(singleton,tenant_id,deployment_id,anchored_at)
SELECT 1,tenant_id,deployment_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM temp.ja_migration_context WHERE singleton=1;
CREATE TRIGGER deployment_identity_no_insert BEFORE INSERT ON deployment_identity
WHEN EXISTS(SELECT 1 FROM deployment_identity)
BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TRIGGER deployment_identity_no_update BEFORE UPDATE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TRIGGER deployment_identity_no_delete BEFORE DELETE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;

-- Legal entities already existed before the lifecycle/security migration, but
-- the billing repository only treats an entity as usable while it is active.
-- Add the state additively so existing entities are deterministically active;
-- archived entities remain historical and cannot be deleted or reactivated.
ALTER TABLE legal_entity ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK(status IN ('active','archived'));
CREATE TRIGGER legal_entity_archive_guard BEFORE UPDATE ON legal_entity
WHEN OLD.status='archived' OR
  NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR
  NEW.status NOT IN ('active','archived')
BEGIN SELECT RAISE(ABORT,'legal entity lifecycle is immutable'); END;
CREATE TRIGGER legal_entity_no_delete BEFORE DELETE ON legal_entity
BEGIN SELECT RAISE(ABORT,'legal entity history retained'); END;

CREATE TABLE entity_lifecycle_event(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('client','project')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  from_state TEXT NULL CHECK(from_state IS NULL OR from_state IN ('active','closed','archived','draft','planned','paused','closing')),
  to_state TEXT NOT NULL CHECK(to_state IN ('active','closed','archived','draft','planned','paused','closing')),
  actor_user_id TEXT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NULL CHECK(reason IS NULL OR length(reason) BETWEEN 3 AND 2000),
  version_before INTEGER NOT NULL CHECK(version_before>=0),
  version_after INTEGER NOT NULL CHECK(version_after=version_before+1),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at)>0),
  correlation_id TEXT NOT NULL CHECK(length(correlation_id)>0),
  provenance TEXT NOT NULL CHECK(provenance IN ('native','migration_observed')),
  CHECK((provenance='native' AND actor_user_id IS NOT NULL) OR (provenance='migration_observed' AND actor_user_id IS NULL)),
  CHECK((entity_type='client' AND (from_state IS NULL OR from_state IN ('active','closed','archived')) AND to_state IN ('active','closed','archived')) OR
        (entity_type='project' AND (from_state IS NULL OR from_state IN ('draft','planned','active','paused','closing','closed','archived')) AND to_state IN ('draft','planned','active','paused','closing','closed','archived')))
) STRICT;
CREATE UNIQUE INDEX entity_lifecycle_version_uq ON entity_lifecycle_event(tenant_id,entity_type,entity_id,version_after);
CREATE INDEX entity_lifecycle_history_idx ON entity_lifecycle_event(tenant_id,entity_type,entity_id,occurred_at,id);
CREATE TRIGGER entity_lifecycle_no_update BEFORE UPDATE ON entity_lifecycle_event
BEGIN SELECT RAISE(ABORT,'lifecycle immutable'); END;
CREATE TRIGGER entity_lifecycle_no_delete BEFORE DELETE ON entity_lifecycle_event
BEGIN SELECT RAISE(ABORT,'lifecycle immutable'); END;
CREATE TRIGGER entity_lifecycle_subject_guard BEFORE INSERT ON entity_lifecycle_event WHEN
  (NEW.entity_type='client' AND NOT EXISTS(SELECT 1 FROM client WHERE id=NEW.entity_id)) OR
  (NEW.entity_type='project' AND NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.entity_id)) OR
  (NEW.provenance='migration_observed' AND (NEW.from_state IS NOT NULL OR NEW.to_state<>'archived')) OR
  (NEW.provenance='native' AND NOT (
    (NEW.entity_type='client' AND ((NEW.from_state='active' AND NEW.to_state IN ('closed','archived')) OR (NEW.from_state='closed' AND NEW.to_state IN ('active','archived')) OR (NEW.from_state='archived' AND NEW.to_state IN ('active','closed')))) OR
    (NEW.entity_type='project' AND ((NEW.from_state='draft' AND NEW.to_state IN ('planned','active','archived')) OR (NEW.from_state='planned' AND NEW.to_state IN ('active','paused','archived')) OR (NEW.from_state='active' AND NEW.to_state IN ('paused','closing')) OR (NEW.from_state='paused' AND NEW.to_state IN ('active','closing')) OR (NEW.from_state='closing' AND NEW.to_state='closed') OR (NEW.from_state='closed' AND NEW.to_state='archived') OR (NEW.from_state='archived' AND NEW.to_state IN ('draft','planned','closed')))))) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid lifecycle subject'); END;

-- Archived legacy subjects are observations, not invented state transitions.
-- Their prior state remains unknown and the event is anchored to the one
-- deployment identity supplied by the migration runner.
INSERT INTO entity_lifecycle_event(
  id,tenant_id,entity_type,entity_id,from_state,to_state,actor_user_id,reason,
  version_before,version_after,occurred_at,correlation_id,provenance
)
SELECT 'migration-observed:client:' || hex(CAST(c.id AS BLOB)),d.tenant_id,'client',c.id,
  NULL,'archived',NULL,'Archived state observed during lifecycle migration',0,1,
  c.updated_at,'migration-observed:client:' || hex(CAST(c.id AS BLOB)),'migration_observed'
FROM client c CROSS JOIN deployment_identity d
WHERE d.singleton=1 AND c.status='archived';
INSERT INTO entity_lifecycle_event(
  id,tenant_id,entity_type,entity_id,from_state,to_state,actor_user_id,reason,
  version_before,version_after,occurred_at,correlation_id,provenance
)
SELECT 'migration-observed:project:' || hex(CAST(p.id AS BLOB)),d.tenant_id,'project',p.id,
  NULL,'archived',NULL,'Archived state observed during lifecycle migration',0,1,
  p.updated_at,'migration-observed:project:' || hex(CAST(p.id AS BLOB)),'migration_observed'
FROM project p CROSS JOIN deployment_identity d
WHERE d.singleton=1 AND p.status='archived';

CREATE TABLE record_correction_link(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  record_type TEXT NOT NULL CHECK(record_type IN ('time_entry','expense','daily_report','technical_report')),
  original_id TEXT NOT NULL CHECK(length(original_id)>0),
  correction_id TEXT NOT NULL CHECK(length(correction_id)>0 AND correction_id<>original_id),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  request_payload_sha256 TEXT NOT NULL CHECK(length(request_payload_sha256)=64),
  actor_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  correlation_id TEXT NOT NULL CHECK(length(correlation_id)>0),
  UNIQUE(tenant_id,record_type,original_id,request_id),
  UNIQUE(tenant_id,record_type,correction_id)
) STRICT;
CREATE TRIGGER correction_link_no_update BEFORE UPDATE ON record_correction_link
BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TRIGGER correction_link_no_delete BEFORE DELETE ON record_correction_link
BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TRIGGER correction_link_subject_guard BEFORE INSERT ON record_correction_link WHEN
  (NEW.record_type='time_entry' AND (NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id))) OR
  (NEW.record_type='expense' AND (NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id))) OR
  (NEW.record_type='daily_report' AND (NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='technical_report' AND (NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='time_entry' AND (
    NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id AND (approval_state IN ('approved','locked') OR billing_status='locked' OR locked_at IS NOT NULL)) OR
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

CREATE TABLE upload_reservation(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NULL CHECK(mutation_id IS NULL OR length(mutation_id)>0),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  request_payload_sha256 TEXT NOT NULL CHECK(length(request_payload_sha256)=64),
  purpose TEXT NOT NULL CHECK(purpose IN ('receipt','private_document')),
  classification TEXT NOT NULL CHECK(classification IN ('standard','receipt','finance','identity','hr','security','confidential')),
  original_filename TEXT NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 200),
  declared_media_type TEXT NOT NULL CHECK(declared_media_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/zip','text/plain')),
  detected_media_type TEXT NULL CHECK(detected_media_type IS NULL OR detected_media_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/zip','text/plain')),
  expected_bytes INTEGER NOT NULL CHECK(expected_bytes BETWEEN 1 AND 50000000),
  observed_bytes INTEGER NULL CHECK(observed_bytes IS NULL OR observed_bytes BETWEEN 1 AND 50000000),
  observed_sha256 TEXT NULL CHECK(observed_sha256 IS NULL OR length(observed_sha256)=64),
  temp_storage_key TEXT NULL CHECK(temp_storage_key IS NULL OR length(temp_storage_key)>0),
  final_storage_key TEXT NULL CHECK(final_storage_key IS NULL OR length(final_storage_key)>0),
  state TEXT NOT NULL CHECK(state IN ('pending','streamed','finalized','released','expired')),
  expires_at TEXT NOT NULL CHECK(length(expires_at)>0),
  document_id TEXT NULL REFERENCES document(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  finalized_at TEXT NULL CHECK(finalized_at IS NULL OR length(finalized_at)>0),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,user_id,request_id),
  UNIQUE(final_storage_key),
  CHECK((state='pending' AND detected_media_type IS NULL AND observed_bytes IS NULL AND observed_sha256 IS NULL AND temp_storage_key IS NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL) OR
        (state='streamed' AND detected_media_type=declared_media_type AND observed_bytes=expected_bytes AND observed_sha256 IS NOT NULL AND temp_storage_key IS NOT NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL) OR
        (state='finalized' AND detected_media_type=declared_media_type AND observed_bytes=expected_bytes AND observed_sha256 IS NOT NULL AND temp_storage_key IS NULL AND final_storage_key IS NOT NULL AND document_id IS NOT NULL AND finalized_at IS NOT NULL) OR
        (state IN ('released','expired') AND temp_storage_key IS NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL))
) STRICT;
CREATE INDEX upload_pending_user_idx ON upload_reservation(tenant_id,deployment_id,user_id,state,expires_at);
CREATE INDEX upload_pending_project_idx ON upload_reservation(tenant_id,deployment_id,project_id,state,expires_at);
CREATE TRIGGER upload_reservation_insert_guard BEFORE INSERT ON upload_reservation WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  (NEW.purpose='receipt' AND NEW.classification<>'receipt') OR
  (NEW.purpose='receipt' AND NEW.declared_media_type IN ('application/zip','text/plain')) OR
  (NEW.purpose='receipt' AND NEW.expected_bytes>10000000)
BEGIN SELECT RAISE(ABORT,'invalid upload reservation'); END;
CREATE TRIGGER upload_reservation_update_guard BEFORE UPDATE ON upload_reservation WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.user_id<>OLD.user_id OR
  NEW.project_id IS NOT OLD.project_id OR NEW.mutation_id IS NOT OLD.mutation_id OR NEW.request_id<>OLD.request_id OR
  NEW.request_payload_sha256<>OLD.request_payload_sha256 OR NEW.purpose<>OLD.purpose OR NEW.classification<>OLD.classification OR
  NEW.original_filename<>OLD.original_filename OR NEW.declared_media_type<>OLD.declared_media_type OR NEW.expected_bytes<>OLD.expected_bytes OR
  NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR length(NEW.updated_at)=0 OR NEW.updated_at=OLD.updated_at OR
  NOT ((OLD.state='pending' AND NEW.state IN ('streamed','released','expired')) OR
       (OLD.state='streamed' AND NEW.state IN ('finalized','released'))) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid upload transition'); END;

CREATE TABLE service_actor(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json) AND json_type(capabilities_json)='array'),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,name)
) STRICT;
CREATE TRIGGER service_actor_capability_insert_guard BEFORE INSERT ON service_actor WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','artifact.localized_pdf.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json))
BEGIN SELECT RAISE(ABORT,'invalid service actor capabilities'); END;
CREATE TRIGGER service_actor_capability_update_guard BEFORE UPDATE ON service_actor WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.name<>OLD.name OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','artifact.localized_pdf.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json)) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid service actor update'); END;

CREATE TABLE deployment_service_actor_binding(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  service_actor_id TEXT NOT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  bound_at TEXT NOT NULL CHECK(length(bound_at)>0),
  bound_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,service_actor_id)
) STRICT;
CREATE TRIGGER deployment_service_actor_binding_insert_guard BEFORE INSERT ON deployment_service_actor_binding WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active')
BEGIN SELECT RAISE(ABORT,'invalid configured service actor'); END;
CREATE TRIGGER deployment_service_actor_binding_update_guard BEFORE UPDATE ON deployment_service_actor_binding WHEN
  NEW.singleton<>OLD.singleton OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.service_actor_id=OLD.service_actor_id OR NEW.bound_at=OLD.bound_at OR NEW.bound_by_user_id=OLD.bound_by_user_id OR NEW.version<>OLD.version+1 OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active')
BEGIN SELECT RAISE(ABORT,'invalid configured service actor replacement'); END;
CREATE TRIGGER deployment_service_actor_binding_no_delete BEFORE DELETE ON deployment_service_actor_binding
BEGIN SELECT RAISE(ABORT,'configured service actor binding retained'); END;

CREATE TABLE offline_mutation_scoped(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NOT NULL CHECK(length(mutation_id)>0),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('time_entry','expense','daily_report','technical_report','document')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  base_version INTEGER NOT NULL CHECK(base_version>=0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  attachment_ids_json TEXT NOT NULL CHECK(json_valid(attachment_ids_json) AND json_type(attachment_ids_json)='array'),
  state TEXT NOT NULL CHECK(state IN ('accepted','conflict','rejected')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  processed_at TEXT NOT NULL CHECK(length(processed_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,mutation_id)
) STRICT;
CREATE INDEX offline_scoped_user_idx ON offline_mutation_scoped(tenant_id,deployment_id,user_id,created_at,state);
CREATE TRIGGER offline_scoped_insert_guard BEFORE INSERT ON offline_mutation_scoped WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'offline deployment mismatch'); END;
CREATE TRIGGER offline_scoped_no_update BEFORE UPDATE ON offline_mutation_scoped
BEGIN SELECT RAISE(ABORT,'offline outcome immutable'); END;
CREATE TRIGGER offline_scoped_no_delete BEFORE DELETE ON offline_mutation_scoped
BEGIN SELECT RAISE(ABORT,'offline outcome immutable'); END;

CREATE TABLE mutation_receipt_scoped(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NOT NULL CHECK(length(mutation_id)>0),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('time_entry','expense','daily_report','technical_report','document')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,mutation_id)
) STRICT;
CREATE TRIGGER mutation_receipt_scoped_insert_guard BEFORE INSERT ON mutation_receipt_scoped WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'receipt deployment mismatch'); END;
CREATE TRIGGER mutation_receipt_scoped_no_update BEFORE UPDATE ON mutation_receipt_scoped
BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;
CREATE TRIGGER mutation_receipt_scoped_no_delete BEFORE DELETE ON mutation_receipt_scoped
BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;

INSERT INTO offline_mutation_scoped(
  id,tenant_id,deployment_id,user_id,mutation_id,entity_type,entity_id,base_version,payload_json,
  payload_sha256,attachment_ids_json,state,result_json,result_sha256,created_at,processed_at
)
SELECT o.mutation_id,d.tenant_id,d.deployment_id,o.user_id,o.mutation_id,o.entity_type,o.entity_id,
  o.base_version,o.payload_json,h.payload_sha256,o.attachment_ids_json,o.state,o.result_json,
  h.result_sha256,o.created_at,o.processed_at
FROM offline_mutation o
JOIN temp.legacy_offline_hash_backfill h
  ON h.source_table='offline_mutation' AND h.mutation_id=o.mutation_id
CROSS JOIN deployment_identity d
WHERE d.singleton=1;
INSERT INTO mutation_receipt_scoped(
  id,tenant_id,deployment_id,user_id,mutation_id,entity_type,entity_id,payload_sha256,result_json,
  result_sha256,created_at
)
SELECT r.mutation_id,d.tenant_id,d.deployment_id,r.user_id,r.mutation_id,r.entity_type,r.entity_id,
  h.payload_sha256,r.result_json,h.result_sha256,r.created_at
FROM mutation_receipt r
JOIN temp.legacy_offline_hash_backfill h
  ON h.source_table='mutation_receipt' AND h.mutation_id=r.mutation_id
CROSS JOIN deployment_identity d
WHERE d.singleton=1;
CREATE TEMP TABLE b5_legacy_copy_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO b5_legacy_copy_guard(ok)
SELECT CASE WHEN
  (SELECT count(*) FROM offline_mutation_scoped)=(SELECT count(*) FROM offline_mutation) AND
  (SELECT count(*) FROM mutation_receipt_scoped)=(SELECT count(*) FROM mutation_receipt)
THEN 1 ELSE 0 END;
DROP TABLE b5_legacy_copy_guard;

CREATE TABLE report_autosave_receipt(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily','technical')),
  report_id TEXT NOT NULL CHECK(length(report_id)>0),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  base_version INTEGER NOT NULL CHECK(base_version>=1),
  client_revision INTEGER NOT NULL CHECK(client_revision>=1),
  outcome_json TEXT NOT NULL CHECK(json_valid(outcome_json)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,report_id,request_id)
) STRICT;
CREATE INDEX report_autosave_retention_idx ON report_autosave_receipt(tenant_id,deployment_id,created_at);
CREATE TRIGGER report_autosave_subject_guard BEFORE INSERT ON report_autosave_receipt WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  (NEW.report_type='daily' AND NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.report_id)) OR
  (NEW.report_type='technical' AND NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.report_id))
BEGIN SELECT RAISE(ABORT,'invalid autosave subject'); END;
CREATE TRIGGER report_autosave_no_update BEFORE UPDATE ON report_autosave_receipt
BEGIN SELECT RAISE(ABORT,'autosave receipt immutable'); END;
CREATE TRIGGER report_autosave_retention_delete_guard BEFORE DELETE ON report_autosave_receipt WHEN
  julianday(OLD.created_at)>=julianday('now','-30 days')
BEGIN SELECT RAISE(ABORT,'autosave receipt retention active'); END;
CREATE TRIGGER upload_reservation_no_delete BEFORE DELETE ON upload_reservation
BEGIN SELECT RAISE(ABORT,'upload reservation retained'); END;

ALTER TABLE job RENAME TO job_legacy_b5;
ALTER TABLE job_run RENAME TO job_run_legacy_b5;
CREATE TABLE job(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  kind TEXT NOT NULL CHECK(length(kind)>0),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key)>0),
  state TEXT NOT NULL CHECK(length(state)>0),
  run_after TEXT NOT NULL CHECK(length(run_after)>0),
  lease_until TEXT NULL CHECK(lease_until IS NULL OR length(lease_until)>0),
  attempts INTEGER NOT NULL CHECK(attempts>=0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  tenant_id TEXT NULL CHECK(tenant_id IS NULL OR length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NULL CHECK(deployment_id IS NULL OR length(deployment_id) BETWEEN 3 AND 64),
  contract_version TEXT NOT NULL CHECK(contract_version IN ('legacy','b5-v1')),
  payload_sha256 TEXT NULL CHECK(payload_sha256 IS NULL OR length(payload_sha256)=64),
  correlation_id TEXT NULL CHECK(correlation_id IS NULL OR length(correlation_id)>0),
  required_capability TEXT NULL,
  active_job_run_id TEXT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  fence_version INTEGER NOT NULL CHECK(fence_version>=0),
  max_attempts INTEGER NOT NULL CHECK(max_attempts>=1),
  last_error_code TEXT NULL,
  CHECK((contract_version='legacy' AND tenant_id IS NULL AND deployment_id IS NULL AND payload_sha256 IS NULL AND correlation_id IS NULL AND required_capability IS NULL AND active_job_run_id IS NULL AND fence_version=0) OR contract_version='b5-v1')
) STRICT;
CREATE TABLE job_run(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  job_id TEXT NOT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  started_at TEXT NOT NULL CHECK(length(started_at)>0),
  finished_at TEXT NULL CHECK(finished_at IS NULL OR length(finished_at)>0),
  outcome TEXT NULL,
  error_code TEXT NULL,
  tenant_id TEXT NULL CHECK(tenant_id IS NULL OR length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NULL CHECK(deployment_id IS NULL OR length(deployment_id) BETWEEN 3 AND 64),
  contract_version TEXT NOT NULL CHECK(contract_version IN ('legacy','b5-v1')),
  kind TEXT NULL,
  required_capability TEXT NULL,
  service_actor_id TEXT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  service_actor_version INTEGER NULL CHECK(service_actor_version IS NULL OR service_actor_version>=1),
  service_actor_capabilities_json TEXT NULL CHECK(service_actor_capabilities_json IS NULL OR (json_valid(service_actor_capabilities_json) AND json_type(service_actor_capabilities_json)='array')),
  configured_binding_version INTEGER NULL CHECK(configured_binding_version IS NULL OR configured_binding_version>=1),
  correlation_id TEXT NULL CHECK(correlation_id IS NULL OR length(correlation_id)>0),
  payload_sha256 TEXT NULL CHECK(payload_sha256 IS NULL OR length(payload_sha256)=64),
  state TEXT NULL CHECK(state IS NULL OR state IN ('claimed','running','succeeded','failed','lease_expired')),
  fence_version INTEGER NULL CHECK(fence_version IS NULL OR fence_version>=1),
  fencing_token TEXT NULL CHECK(fencing_token IS NULL OR length(fencing_token)>0),
  lease_until TEXT NULL CHECK(lease_until IS NULL OR length(lease_until)>0),
  retry_run_after TEXT NULL CHECK(retry_run_after IS NULL OR length(retry_run_after)>0),
  CHECK(contract_version='legacy' OR (
    (outcome IS NULL OR outcome IN ('succeeded','retry_scheduled','failed_terminal')) AND
    (error_code IS NULL OR error_code IN ('HANDLER_UNAVAILABLE','DEPENDENCY_UNAVAILABLE','LEASE_LOST','PAYLOAD_INVALID','HANDLER_FAILED'))
  )),
  CHECK((contract_version='legacy' AND tenant_id IS NULL AND deployment_id IS NULL AND kind IS NULL AND required_capability IS NULL AND service_actor_id IS NULL AND service_actor_version IS NULL AND service_actor_capabilities_json IS NULL AND configured_binding_version IS NULL AND correlation_id IS NULL AND payload_sha256 IS NULL AND state IS NULL AND fence_version IS NULL AND fencing_token IS NULL AND lease_until IS NULL AND retry_run_after IS NULL) OR contract_version='b5-v1')
) STRICT;
INSERT INTO job(id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,required_capability,active_job_run_id,fence_version,max_attempts,last_error_code)
SELECT id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version,NULL,NULL,'legacy',NULL,NULL,NULL,NULL,0,5,NULL FROM job_legacy_b5;
INSERT INTO job_run(id,job_id,started_at,finished_at,outcome,error_code,tenant_id,deployment_id,contract_version,kind,required_capability,service_actor_id,service_actor_version,service_actor_capabilities_json,configured_binding_version,correlation_id,payload_sha256,state,fence_version,fencing_token,lease_until,retry_run_after)
SELECT id,job_id,started_at,finished_at,outcome,error_code,NULL,NULL,'legacy',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM job_run_legacy_b5;
DROP TABLE job_run_legacy_b5;
DROP TABLE job_legacy_b5;
CREATE UNIQUE INDEX job_scoped_idempotency_uq ON job(tenant_id,deployment_id,idempotency_key) WHERE contract_version='b5-v1';
CREATE UNIQUE INDEX job_run_fencing_uq ON job_run(fencing_token) WHERE contract_version='b5-v1';
CREATE UNIQUE INDEX job_run_job_fence_uq ON job_run(job_id,fence_version) WHERE contract_version='b5-v1';
CREATE TRIGGER job_b5_insert_guard BEFORE INSERT ON job WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.kind NOT IN ('invoice_pdf','period_close_report','auto_draft','accounting_pack_artifact_render','localized_pdf_variant_render','document_scan','outbox_deliver','alert_dispatch','email_send','backup_verify') OR
  NEW.state<>'queued' OR NEW.lease_until IS NOT NULL OR NEW.payload_sha256 IS NULL OR NEW.correlation_id IS NULL OR NEW.required_capability IS NULL OR
  NEW.attempts<>0 OR NEW.fence_version<>0 OR NEW.active_job_run_id IS NOT NULL OR NEW.last_error_code IS NOT NULL OR
  NOT ((NEW.kind='invoice_pdf' AND NEW.required_capability='artifact.invoice.render') OR
       (NEW.kind='period_close_report' AND NEW.required_capability='artifact.report.render') OR
       (NEW.kind='auto_draft' AND NEW.required_capability='billing.draft.generate') OR
       (NEW.kind='accounting_pack_artifact_render' AND NEW.required_capability='artifact.accounting_pack.render') OR
       (NEW.kind='localized_pdf_variant_render' AND NEW.required_capability='artifact.localized_pdf.render') OR
       (NEW.kind='document_scan' AND NEW.required_capability='document.scan') OR
       (NEW.kind='outbox_deliver' AND NEW.required_capability='outbox.deliver') OR
       (NEW.kind='alert_dispatch' AND NEW.required_capability='alert.dispatch') OR
       (NEW.kind='email_send' AND NEW.required_capability='email.send') OR
       (NEW.kind='backup_verify' AND NEW.required_capability='backup.verify'))
BEGIN SELECT RAISE(ABORT,'invalid b5 job'); END;
CREATE TRIGGER job_b5_update_guard BEFORE UPDATE ON job WHEN OLD.contract_version='b5-v1' AND (
  NEW.id<>OLD.id OR NEW.contract_version<>OLD.contract_version OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.kind<>OLD.kind OR
  NEW.idempotency_key<>OLD.idempotency_key OR NEW.payload_json<>OLD.payload_json OR NEW.payload_sha256<>OLD.payload_sha256 OR NEW.correlation_id<>OLD.correlation_id OR
  NEW.required_capability<>OLD.required_capability OR NEW.max_attempts<>OLD.max_attempts OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR
  NOT ((OLD.state='queued' AND NEW.state='claimed' AND NEW.active_job_run_id IS NOT NULL AND NEW.lease_until IS NOT NULL AND NEW.attempts=OLD.attempts+1 AND NEW.fence_version=OLD.fence_version+1) OR
       (OLD.state='claimed' AND NEW.state='claimed' AND NEW.active_job_run_id<>OLD.active_job_run_id AND NEW.lease_until IS NOT NULL AND NEW.attempts=OLD.attempts+1 AND NEW.fence_version=OLD.fence_version+1 AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='lease_expired' AND r.fence_version=OLD.fence_version)) OR
       (OLD.state='claimed' AND NEW.state='queued' AND NEW.active_job_run_id IS NULL AND NEW.lease_until IS NULL AND NEW.attempts=OLD.attempts AND NEW.fence_version=OLD.fence_version AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state IN ('failed','lease_expired') AND r.outcome='retry_scheduled')) OR
       (OLD.state='claimed' AND NEW.state='succeeded' AND NEW.active_job_run_id=OLD.active_job_run_id AND NEW.lease_until IS NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='succeeded' AND r.outcome='succeeded')) OR
       (OLD.state='claimed' AND NEW.state='dead_letter' AND NEW.active_job_run_id=OLD.active_job_run_id AND NEW.lease_until IS NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='failed' AND r.outcome='failed_terminal'))) OR
  (NEW.active_job_run_id IS NOT NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=NEW.active_job_run_id AND (r.job_id<>NEW.id OR r.tenant_id<>NEW.tenant_id OR r.deployment_id<>NEW.deployment_id OR r.fence_version<>NEW.fence_version OR r.kind<>NEW.kind OR r.required_capability<>NEW.required_capability OR r.payload_sha256<>NEW.payload_sha256 OR r.correlation_id<>NEW.correlation_id OR (NEW.state='claimed' AND r.lease_until IS NOT NEW.lease_until))))
)
BEGIN SELECT RAISE(ABORT,'invalid b5 job update'); END;
CREATE TRIGGER job_legacy_immutable BEFORE UPDATE ON job WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job quarantined'); END;
CREATE TRIGGER job_legacy_no_delete BEFORE DELETE ON job WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job retained'); END;
CREATE TRIGGER job_run_b5_insert_guard BEFORE INSERT ON job_run WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR NEW.kind IS NULL OR NEW.required_capability IS NULL OR
  NEW.service_actor_id IS NULL OR NEW.service_actor_version IS NULL OR NEW.service_actor_capabilities_json IS NULL OR NEW.configured_binding_version IS NULL OR
  NEW.correlation_id IS NULL OR NEW.payload_sha256 IS NULL OR NEW.state<>'claimed' OR NEW.finished_at IS NOT NULL OR NEW.outcome IS NOT NULL OR NEW.error_code IS NOT NULL OR
  NEW.fence_version IS NULL OR NEW.fencing_token IS NULL OR NEW.lease_until IS NULL OR NEW.retry_run_after IS NOT NULL OR julianday(NEW.lease_until)<=julianday(NEW.started_at) OR
  NOT EXISTS(SELECT 1 FROM job j WHERE j.id=NEW.job_id AND j.contract_version='b5-v1' AND j.state='claimed' AND j.active_job_run_id=NEW.id AND j.tenant_id=NEW.tenant_id AND j.deployment_id=NEW.deployment_id AND j.kind=NEW.kind AND j.required_capability=NEW.required_capability AND j.payload_sha256=NEW.payload_sha256 AND j.correlation_id=NEW.correlation_id AND j.fence_version=NEW.fence_version AND j.lease_until=NEW.lease_until) OR
  NOT EXISTS(SELECT 1 FROM deployment_service_actor_binding b JOIN service_actor s ON s.id=b.service_actor_id WHERE b.singleton=1 AND b.tenant_id=NEW.tenant_id AND b.deployment_id=NEW.deployment_id AND b.service_actor_id=NEW.service_actor_id AND b.version=NEW.configured_binding_version AND s.status='active' AND s.version=NEW.service_actor_version AND s.capabilities_json=NEW.service_actor_capabilities_json AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=NEW.required_capability))
BEGIN SELECT RAISE(ABORT,'invalid b5 job run'); END;
-- SQLite CHECK/WHEN expressions are three-valued.  The explicit NULL guard is
-- therefore required in addition to the closed CHECKs above; otherwise a
-- B5 row with a NULL state/outcome can make every comparison UNKNOWN and pass.
CREATE TRIGGER job_run_b5_required_insert_guard BEFORE INSERT ON job_run WHEN
  NEW.contract_version='b5-v1' AND (
    NEW.job_id IS NULL OR NEW.started_at IS NULL OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
    NEW.kind IS NULL OR NEW.required_capability IS NULL OR NEW.service_actor_id IS NULL OR
    NEW.service_actor_version IS NULL OR NEW.service_actor_capabilities_json IS NULL OR
    NEW.configured_binding_version IS NULL OR NEW.correlation_id IS NULL OR NEW.payload_sha256 IS NULL OR
    NEW.state IS NULL OR NEW.fence_version IS NULL OR NEW.fencing_token IS NULL OR NEW.lease_until IS NULL
  )
BEGIN SELECT RAISE(ABORT,'b5 job run fields are required'); END;
CREATE TRIGGER job_run_b5_update_guard BEFORE UPDATE ON job_run WHEN OLD.contract_version='b5-v1' AND (
  NEW.id<>OLD.id OR NEW.contract_version<>OLD.contract_version OR NEW.job_id<>OLD.job_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.kind<>OLD.kind OR NEW.required_capability<>OLD.required_capability OR NEW.service_actor_id<>OLD.service_actor_id OR NEW.service_actor_version<>OLD.service_actor_version OR
  NEW.service_actor_capabilities_json<>OLD.service_actor_capabilities_json OR NEW.configured_binding_version<>OLD.configured_binding_version OR NEW.correlation_id<>OLD.correlation_id OR
  NEW.payload_sha256<>OLD.payload_sha256 OR NEW.fence_version<>OLD.fence_version OR NEW.fencing_token<>OLD.fencing_token OR NEW.started_at<>OLD.started_at OR NEW.lease_until<>OLD.lease_until OR
  NOT EXISTS(SELECT 1 FROM job j WHERE j.id=OLD.job_id AND j.contract_version='b5-v1' AND j.state='claimed' AND j.active_job_run_id=OLD.id AND j.fence_version=OLD.fence_version AND j.tenant_id=OLD.tenant_id AND j.deployment_id=OLD.deployment_id) OR
  NOT ((OLD.state='claimed' AND NEW.state='running' AND NEW.finished_at IS NULL AND NEW.outcome IS NULL AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
       (OLD.state IN ('claimed','running') AND NEW.state='lease_expired' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code='LEASE_LOST' AND NEW.retry_run_after IS NOT NULL) OR
       (OLD.state='running' AND NEW.state='succeeded' AND NEW.finished_at IS NOT NULL AND NEW.outcome='succeeded' AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
       (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NOT NULL) OR
       (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='failed_terminal' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NULL)))
BEGIN SELECT RAISE(ABORT,'invalid b5 job run update'); END;
CREATE TRIGGER job_run_b5_required_update_guard BEFORE UPDATE ON job_run WHEN OLD.contract_version='b5-v1' AND (
  NEW.contract_version IS NULL OR NEW.job_id IS NULL OR NEW.started_at IS NULL OR NEW.tenant_id IS NULL OR
  NEW.deployment_id IS NULL OR NEW.kind IS NULL OR NEW.required_capability IS NULL OR NEW.service_actor_id IS NULL OR
  NEW.service_actor_version IS NULL OR NEW.service_actor_capabilities_json IS NULL OR NEW.configured_binding_version IS NULL OR
  NEW.correlation_id IS NULL OR NEW.payload_sha256 IS NULL OR NEW.state IS NULL OR NEW.fence_version IS NULL OR
  NEW.fencing_token IS NULL OR (NEW.state='claimed' AND NEW.outcome IS NOT NULL) OR
  (NEW.state='running' AND NEW.outcome IS NOT NULL) OR
  (NEW.state IN ('succeeded','failed','lease_expired') AND NEW.outcome IS NULL)
)
BEGIN SELECT RAISE(ABORT,'b5 job run fields are required'); END;
CREATE TRIGGER job_run_b5_transition_guard BEFORE UPDATE ON job_run WHEN OLD.contract_version='b5-v1' AND NOT (
  (OLD.state='claimed' AND NEW.state='running' AND NEW.finished_at IS NULL AND NEW.outcome IS NULL AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
  (OLD.state IN ('claimed','running') AND NEW.state='lease_expired' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code='LEASE_LOST' AND NEW.retry_run_after IS NOT NULL) OR
  (OLD.state='running' AND NEW.state='succeeded' AND NEW.finished_at IS NOT NULL AND NEW.outcome='succeeded' AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
  (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NOT NULL) OR
  (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='failed_terminal' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NULL)
)
BEGIN SELECT RAISE(ABORT,'invalid b5 job run transition'); END;
CREATE TRIGGER job_run_project_terminal AFTER UPDATE OF state ON job_run WHEN OLD.contract_version='b5-v1' AND NEW.state IN ('succeeded','failed','lease_expired')
BEGIN
  UPDATE job SET
    state=CASE WHEN NEW.outcome='succeeded' THEN 'succeeded' WHEN NEW.outcome='retry_scheduled' THEN 'queued' ELSE 'dead_letter' END,
    run_after=CASE WHEN NEW.outcome='retry_scheduled' THEN NEW.retry_run_after ELSE run_after END,
    lease_until=NULL,
    active_job_run_id=CASE WHEN NEW.outcome='retry_scheduled' THEN NULL ELSE active_job_run_id END,
    last_error_code=NEW.error_code,
    updated_at=NEW.finished_at,
    version=version+1
  WHERE id=NEW.job_id AND contract_version='b5-v1' AND state='claimed' AND active_job_run_id=NEW.id AND fence_version=NEW.fence_version;
  SELECT CASE WHEN changes()=1 THEN 1 ELSE RAISE(ABORT,'job/run reciprocal terminal projection failed') END;
END;
CREATE TRIGGER job_run_legacy_immutable BEFORE UPDATE ON job_run WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job run quarantined'); END;
CREATE TRIGGER job_run_legacy_no_delete BEFORE DELETE ON job_run WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job run retained'); END;

CREATE TABLE audit_action_registry(
  contract_version TEXT NOT NULL CHECK(length(contract_version)>0),
  action TEXT NOT NULL CHECK(length(action)>0),
  entity_type TEXT NOT NULL CHECK(length(entity_type)>0),
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','service','system')),
  owner_packet TEXT NOT NULL CHECK(length(owner_packet)>0),
  data_classification TEXT NOT NULL CHECK(data_classification IN ('internal','confidential','restricted')),
  source_location_sha256 TEXT NULL CHECK(source_location_sha256 IS NULL OR length(source_location_sha256)=64),
  PRIMARY KEY(contract_version,action,entity_type,actor_kind)
) WITHOUT ROWID, STRICT;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification)
SELECT 'legacy-v1',action,entity_type,actor_kind,'legacy-inventory','internal'
FROM temp.legacy_audit_registry_backfill;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','lifecycle.transition','client','user','WP-B5','confidential'),
  ('B5-R4','lifecycle.transition','project','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','time_entry','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','expense','user','WP-B5','restricted'),
  ('B5-R4','record.delete_draft','daily_report','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','technical_report','user','WP-B5','confidential'),
  ('B5-R4','correction.create','time_entry','user','WP-B5','confidential'),
  ('B5-R4','correction.create','expense','user','WP-B5','restricted'),
  ('B5-R4','correction.create','daily_report','user','WP-B5','confidential'),
  ('B5-R4','correction.create','technical_report','user','WP-B5','confidential'),
  ('B5-R4','upload.reserve','upload_reservation','user','WP-B5','restricted'),
  ('B5-R4','upload.finalize','upload_reservation','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','document','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','invoice','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','period_report','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','accounting_pack','user','WP-B5','restricted'),
  ('B5-R4','service_job.claim','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.start','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.succeed','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.fail','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.expire','job_run','service','WP-B5','restricted'),
  -- Existing repository append sites are also reviewed B5-R4 inputs.  They
  -- are literal rows here so the central writer can resolve them without a
  -- caller-controlled registration side effect.  Domain owners may replace
  -- these rows with their own versioned contract as those migrations land.
  ('B5-R4','client.create','client','user','WP-B5','confidential'),
  ('B5-R4','client.update','client','user','WP-B5','confidential'),
  ('B5-R4','client.archive','client','user','WP-B5','confidential'),
  ('B5-R4','client_contact.create','client_contact','user','WP-B5','confidential'),
  ('B5-R4','client_contact.update','client_contact','user','WP-B5','confidential'),
  ('B5-R4','client_contact.delete','client_contact','user','WP-B5','confidential'),
  ('B5-R4','project.create','project','user','WP-B5','confidential'),
  ('B5-R4','project.update','project','user','WP-B5','confidential'),
  ('B5-R4','milestone.create','project_milestone','user','WP-B5','confidential'),
  ('B5-R4','milestone.approved','project_milestone','user','WP-B5','confidential'),
  ('B5-R4','milestone.rejected','project_milestone','user','WP-B5','confidential'),
  ('B5-R4','assignment.create','project_member','user','WP-B5','confidential'),
  ('B5-R4','assignment.update','project_member','user','WP-B5','confidential'),
  ('B5-R4','assignment.delete','project_member','user','WP-B5','confidential'),
  ('B5-R4','skill.create','skill','user','WP-B5','confidential'),
  ('B5-R4','skill.update','skill','user','WP-B5','confidential'),
  ('B5-R4','skill.delete','skill','user','WP-B5','confidential'),
  ('B5-R4','worker_skill.set','user','user','WP-B5','confidential'),
  ('B5-R4','worker_skill.delete','user','user','WP-B5','confidential'),
  ('B5-R4','worker_availability.create','worker_availability','user','WP-B5','confidential'),
  ('B5-R4','worker.update','user','user','WP-B5','confidential'),
  ('B5-R4','schedule.create','schedule','user','WP-B5','confidential'),
  ('B5-R4','planning.create','planning_assignment','user','WP-B5','confidential'),
  ('B5-R4','time.create','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.submit','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.update','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.delete','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.void','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.approved','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.needs_changes','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.rejected','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.finance_review','time_entry','user','WP-B5','confidential'),
  ('B5-R4','time.copy_layout','time_entry','user','WP-B5','confidential'),
  ('B5-R4','daily_report.create','daily_report','user','WP-B5','confidential'),
  ('B5-R4','technical_report.create','technical_report','user','WP-B5','confidential'),
  ('B5-R4','daily_report.create_offline','daily_report','user','WP-B5','confidential'),
  ('B5-R4','technical_report.create_offline','technical_report','user','WP-B5','confidential'),
  ('B5-R4','daily_report.submit','daily_report','user','WP-B5','confidential'),
  ('B5-R4','technical_report.submit','technical_report','user','WP-B5','confidential'),
  ('B5-R4','daily_report.approved','daily_report','user','WP-B5','confidential'),
  ('B5-R4','daily_report.needs_changes','daily_report','user','WP-B5','confidential'),
  ('B5-R4','technical_report.approved','technical_report','user','WP-B5','confidential'),
  ('B5-R4','technical_report.needs_changes','technical_report','user','WP-B5','confidential'),
  ('B5-R4','report.report_modified','daily_report','user','WP-B5','confidential'),
  ('B5-R4','report.report_modified','technical_report','user','WP-B5','confidential'),
  ('B5-R4','report.report_deleted','daily_report','user','WP-B5','confidential'),
  ('B5-R4','report.report_deleted','technical_report','user','WP-B5','confidential'),
  ('B5-R4','report.daily.update','daily_report','user','WP-B5','confidential'),
  ('B5-R4','report.technical.update','technical_report','user','WP-B5','confidential'),
  ('B5-R4','report.daily.delete','daily_report','user','WP-B5','confidential'),
  ('B5-R4','report.technical.delete','technical_report','user','WP-B5','confidential'),
  ('B5-R4','expense.create','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.create_offline','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.submit','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.update','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.approved','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.needs_changes','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.rejected','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.finance_approve','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.reimburse','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.delete_draft','expense','user','WP-B5','restricted'),
  ('B5-R4','expense.void','expense','user','WP-B5','restricted'),
  ('B5-R4','compensation_rule.create','compensation_rule','user','WP-B5','restricted'),
  ('B5-R4','compensation_rule.supersede','compensation_rule','user','WP-B5','restricted'),
  ('B5-R4','compensation_rule.deactivate','compensation_rule','user','WP-B5','restricted'),
  ('B5-R4','client_rate.create','client_labor_rate','user','WP-B5','restricted'),
  ('B5-R4','client_rate.supersede','client_labor_rate','user','WP-B5','restricted'),
  ('B5-R4','client_rate.deactivate','client_labor_rate','user','WP-B5','restricted'),
  ('B5-R4','internal_cost.create','internal_cost_rule','user','WP-B5','restricted'),
  ('B5-R4','internal_cost.supersede','internal_cost_rule','user','WP-B5','restricted'),
  ('B5-R4','internal_cost.deactivate','internal_cost_rule','user','WP-B5','restricted'),
  ('B5-R4','invitation.create','invitation','user','WP-B5','confidential'),
  ('B5-R4','assignment_rate_override.create','assignment_rate_override','user','WP-B5','restricted'),
  ('B5-R4','compensation.settle','project','user','WP-B5','restricted'),
  ('B5-R4','payment.record','payment','user','WP-B5','restricted'),
  ('B5-R4','invoice.void','invoice','user','WP-B5','restricted'),
  ('B5-R4','billing_period.close','billing_period','user','WP-B5','restricted'),
  ('B5-R4','period_report.refresh','project','user','WP-B5','restricted'),
  ('B5-R4','period_report.pdf_ready','period_report','user','WP-B5','restricted'),
  ('B5-R4','invoice.pdf_ready','invoice','user','WP-B5','restricted'),
  ('B5-R4','accounting_pack.create','accounting_pack_run','user','WP-B5','restricted'),
  ('B5-R4','accounting_pack.finalize','accounting_pack_run','user','WP-B5','restricted'),
  ('B5-R4','accounting_pack.export','accounting_pack_run','user','WP-B5','restricted'),
  ('B5-R4','accounting_pack.export_failed','accounting_pack_run','user','WP-B5','restricted'),
  ('B5-R4','legal_entity.create','legal_entity','user','WP-B5','restricted'),
  ('B5-R4','legal_entity.update','legal_entity','user','WP-B5','restricted'),
  ('B5-R4','legal_entity.archive','legal_entity','user','WP-B5','restricted'),
  ('B5-R4','invoice_policy.create','invoice_number_policy','user','WP-B5','restricted'),
  ('B5-R4','tax_profile.create','tax_profile','user','WP-B5','restricted'),
  ('B5-R4','tax_profile.update','tax_profile','user','WP-B5','restricted'),
  ('B5-R4','tax_profile.archive','tax_profile','user','WP-B5','restricted'),
  ('B5-R4','billing_rule.create','billing_rule','user','WP-B5','restricted'),
  ('B5-R4','billing_rule.update','billing_rule','user','WP-B5','restricted'),
  ('B5-R4','billing_rule.archive','billing_rule','user','WP-B5','restricted'),
  ('B5-R4','invoice.draft_create','invoice','user','WP-B5','restricted'),
  ('B5-R4','invoice.adjustment.create','invoice','user','WP-B5','restricted'),
  ('B5-R4','invoice.approve','invoice','user','WP-B5','restricted'),
  ('B5-R4','invoice.issue','invoice','user','WP-B5','restricted'),
  ('B5-R4','invoice.send','invoice','user','WP-B5','restricted'),
  ('B5-R4','invoice.delete_draft','invoice','user','WP-B5','restricted'),
  ('B5-R4','project_closeout.create','project_closeout','user','WP-B5','restricted'),
  ('B5-R4','project_closeout.finalize','project_closeout','user','WP-B5','restricted'),
  ('B5-R4','project_closeout.reopen','project_closeout','user','WP-B5','restricted'),
  ('B5-R4','user.status.update','user','user','WP-B5','restricted'),
  ('B5-R4','document.delete','document','user','WP-B5','restricted'),
  ('B5-R4','document.download','document','user','WP-B5','restricted'),
  ('B5-R4','document.scan','document','user','WP-B5','restricted'),
  ('B5-R4','document.commit','document','user','WP-B5','restricted'),
  ('B5-R4','document.upload_cancelled','document','user','WP-B5','restricted'),
  ('B5-R4','document.upload_cleanup','document','user','WP-B5','restricted'),
  ('B5-R4','document.upload_finalized','document','user','WP-B5','restricted'),
  ('B5-R4','receipt.commit','document','user','WP-B5','restricted'),
  ('B5-R4','receipt.cleanup','document','user','WP-B5','restricted'),
  ('B5-R4','offline.sync','time','user','WP-B5','confidential'),
  ('B5-R4','offline.sync','daily_report','user','WP-B5','confidential'),
  ('B5-R4','offline.sync','technical_report','user','WP-B5','confidential'),
  ('B5-R4','offline.sync','expense','user','WP-B5','restricted'),
  ('B5-R4','time.create_offline','time_entry','user','WP-B5','confidential'),
  ('B5-R4','technical_change.create','technical_change','user','WP-B5','confidential'),
  ('B5-R4','technical_change.submit','technical_change','user','WP-B5','confidential'),
  ('B5-R4','technical_change.approved','technical_change','user','WP-B5','confidential'),
  ('B5-R4','technical_change.needs_changes','technical_change','user','WP-B5','confidential'),
  ('B5-R4','technical_change.rejected','technical_change','user','WP-B5','confidential');
CREATE TRIGGER audit_action_registry_no_update BEFORE UPDATE ON audit_action_registry
BEGIN SELECT RAISE(ABORT,'audit registry immutable'); END;
CREATE TRIGGER audit_action_registry_no_delete BEFORE DELETE ON audit_action_registry
BEGIN SELECT RAISE(ABORT,'audit registry immutable'); END;
-- Registry rows are a reviewed manifest, not a runtime self-registration API.
-- New owner packets add their literal rows in their reviewed migration/lease;
-- arbitrary action/entity pairs must never become trusted provenance.
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

ALTER TABLE audit_event ADD COLUMN audit_contract_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE audit_event ADD COLUMN actor_kind TEXT NULL;
ALTER TABLE audit_event ADD COLUMN service_actor_id TEXT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN service_capability TEXT NULL;
ALTER TABLE audit_event ADD COLUMN job_id TEXT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN job_run_id TEXT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN tenant_id TEXT NULL;
ALTER TABLE audit_event ADD COLUMN deployment_id TEXT NULL;
ALTER TABLE audit_event ADD COLUMN provenance TEXT NULL;
UPDATE audit_event SET actor_kind=CASE WHEN actor_id IS NULL THEN 'system' ELSE 'user' END, provenance='legacy_observed' WHERE audit_contract_version='legacy-v1';
CREATE TRIGGER audit_registered_insert_guard BEFORE INSERT ON audit_event WHEN
  NEW.audit_contract_version='legacy-v1' OR NEW.actor_kind IS NULL OR NEW.actor_kind NOT IN ('user','service','system') OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.correlation_id IS NULL OR NEW.provenance IS NULL OR NEW.provenance<>'native' OR
  NOT EXISTS(SELECT 1 FROM audit_action_registry r WHERE r.contract_version=NEW.audit_contract_version AND r.action=NEW.action AND r.entity_type=NEW.entity_type AND r.actor_kind=NEW.actor_kind) OR
  (NEW.actor_kind='user' AND (NEW.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.actor_id AND u.status='active') OR NEW.service_actor_id IS NOT NULL OR NEW.job_id IS NOT NULL OR NEW.job_run_id IS NOT NULL OR NEW.service_capability IS NOT NULL)) OR
  (NEW.actor_kind='system' AND (NEW.actor_id IS NOT NULL OR NEW.service_actor_id IS NOT NULL OR NEW.job_id IS NOT NULL OR NEW.job_run_id IS NOT NULL OR NEW.service_capability IS NOT NULL)) OR
  (NEW.actor_kind='service' AND (NEW.actor_id IS NOT NULL OR NEW.service_actor_id IS NULL OR NEW.job_id IS NULL OR NEW.job_run_id IS NULL OR NEW.service_capability IS NULL OR
    NEW.entity_type<>'job_run' OR NEW.entity_id<>NEW.job_run_id OR
    NOT EXISTS(SELECT 1 FROM job_run r JOIN job j ON j.id=r.job_id JOIN service_actor s ON s.id=r.service_actor_id JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id WHERE r.id=NEW.job_run_id AND r.job_id=NEW.job_id AND r.service_actor_id=NEW.service_actor_id AND r.required_capability=NEW.service_capability AND r.tenant_id=NEW.tenant_id AND r.deployment_id=NEW.deployment_id AND r.correlation_id=NEW.correlation_id AND r.contract_version='b5-v1' AND j.contract_version='b5-v1' AND b.tenant_id=r.tenant_id AND b.deployment_id=r.deployment_id AND b.version=r.configured_binding_version AND s.status='active' AND s.version=r.service_actor_version AND s.capabilities_json=r.service_actor_capabilities_json AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=r.required_capability) AND ((NEW.action='service_job.claim' AND r.state='claimed') OR (NEW.action IN ('service_job.start','service_job.succeed','service_job.fail') AND r.state='running') OR (NEW.action='service_job.expire' AND r.state IN ('claimed','running'))) AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version)))
BEGIN SELECT RAISE(ABORT,'invalid registered audit actor'); END;
CREATE UNIQUE INDEX audit_service_terminal_uq ON audit_event(job_run_id,action) WHERE actor_kind='service';
CREATE TRIGGER audit_service_terminal_guard BEFORE INSERT ON audit_event WHEN NEW.actor_kind='service' AND NEW.action IN ('service_job.succeed','service_job.fail') AND EXISTS(SELECT 1 FROM audit_event e WHERE e.job_run_id=NEW.job_run_id AND e.action IN ('service_job.succeed','service_job.fail'))
BEGIN SELECT RAISE(ABORT,'service job terminal audit already exists'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_event
BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_event
BEGIN SELECT RAISE(ABORT,'audit immutable'); END;

ALTER TABLE document ADD COLUMN artifact_classification TEXT NULL;
ALTER TABLE document ADD COLUMN classification_provenance TEXT NULL;
UPDATE document SET artifact_classification=CASE
    WHEN lower(COALESCE(artifact_type,'')) LIKE '%receipt%' THEN 'receipt'
    WHEN sensitive=1 OR sensitivity IN ('sensitive','customer_private') THEN 'confidential'
    ELSE 'standard' END,
  classification_provenance='migration_derived'
WHERE artifact_classification IS NULL;
CREATE TRIGGER document_classification_insert_guard BEFORE INSERT ON document WHEN
  NEW.artifact_classification IS NULL OR NEW.classification_provenance IS NULL OR
  NEW.artifact_classification NOT IN ('standard','receipt','finance','identity','hr','security','confidential') OR NEW.classification_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'document classification required'); END;
CREATE TRIGGER document_classification_update_guard BEFORE UPDATE OF artifact_classification,classification_provenance ON document WHEN
  OLD.state<>'temporary' OR NEW.version<>OLD.version+1 OR
  NEW.artifact_classification IS NULL OR NEW.classification_provenance IS NULL OR
  NEW.artifact_classification NOT IN ('standard','receipt','finance','identity','hr','security','confidential') OR NEW.classification_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'document classification immutable'); END;

ALTER TABLE technical_report ADD COLUMN report_date TEXT NULL;
ALTER TABLE technical_report ADD COLUMN report_date_provenance TEXT NULL;
UPDATE technical_report SET report_date=(SELECT b.report_date FROM temp.technical_report_date_backfill b WHERE b.report_id=technical_report.id), report_date_provenance='migration_derived'
WHERE report_date IS NULL;
CREATE TRIGGER technical_report_date_insert_guard BEFORE INSERT ON technical_report WHEN
  NEW.report_date IS NULL OR NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR NEW.report_date_provenance IS NULL OR NEW.report_date_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'technical report date required'); END;
CREATE TRIGGER technical_report_date_update_guard BEFORE UPDATE OF report_date,report_date_provenance ON technical_report WHEN
  OLD.approval_state NOT IN ('draft','needs_changes') OR NEW.version<>OLD.version+1 OR NEW.report_date IS NULL OR
  NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR NEW.report_date_provenance IS NULL OR
  NOT ((NEW.report_date=OLD.report_date AND NEW.report_date_provenance=OLD.report_date_provenance) OR NEW.report_date_provenance='native')
BEGIN SELECT RAISE(ABORT,'technical report date immutable'); END;
CREATE TRIGGER technical_report_date_submit_guard BEFORE UPDATE OF approval_state ON technical_report WHEN
  NEW.approval_state NOT IN ('draft','needs_changes') AND
  (NEW.report_date IS NULL OR NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR NEW.report_date_provenance IS NULL OR NEW.report_date_provenance<>'native' OR NEW.report_date<>OLD.report_date)
BEGIN SELECT RAISE(ABORT,'technical report date invalid at submit'); END;

CREATE TRIGGER offline_mutation_legacy_no_insert BEFORE INSERT ON offline_mutation
BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER offline_mutation_legacy_no_update BEFORE UPDATE ON offline_mutation
BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER offline_mutation_legacy_no_delete BEFORE DELETE ON offline_mutation
BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_insert BEFORE INSERT ON mutation_receipt
BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_update BEFORE UPDATE ON mutation_receipt
BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_delete BEFORE DELETE ON mutation_receipt
BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;
