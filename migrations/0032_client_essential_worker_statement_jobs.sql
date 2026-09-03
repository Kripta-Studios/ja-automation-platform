-- Client Essential durable Worker statement artifacts, service-actor history and MFA audit registry.
--
-- This migration is additive.  It preserves all pre-existing operational and
-- financial rows and only widens reviewed guards for the new durable job pair.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;

ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v31;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 32),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824',
    'period_report_reapproval','period_report_source_binding','finance_source_manifest',
    'client_essential_worker_statement_jobs'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v31;

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
DROP TABLE migration_contract_metadata_v31;

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

-- The binding history is an immutable event ledger.  Version 1 is backfilled
-- from the existing singleton binding where one exists; later versions are
-- written before the corresponding singleton update and retain the replaced
-- actor rather than mutating the prior event.
CREATE TABLE service_actor_binding_history(
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  binding_version INTEGER NOT NULL CHECK(binding_version>=1),
  service_actor_id TEXT NOT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  bound_at TEXT NOT NULL CHECK(length(bound_at)>0),
  bound_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  previous_service_actor_id TEXT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  replaced_at TEXT NULL CHECK(replaced_at IS NULL OR length(replaced_at)>0),
  PRIMARY KEY(tenant_id,deployment_id,binding_version)
) WITHOUT ROWID, STRICT;
INSERT INTO service_actor_binding_history(
  tenant_id,deployment_id,binding_version,service_actor_id,bound_at,bound_by_user_id,
  previous_service_actor_id,replaced_at
)
SELECT tenant_id,deployment_id,version,service_actor_id,bound_at,bound_by_user_id,NULL,NULL
FROM deployment_service_actor_binding
WHERE singleton=1;
CREATE INDEX service_actor_binding_history_actor_idx
  ON service_actor_binding_history(tenant_id,deployment_id,service_actor_id,binding_version);

CREATE TRIGGER service_actor_binding_history_insert_guard
BEFORE INSERT ON service_actor_binding_history
WHEN
  NOT EXISTS(
    SELECT 1 FROM deployment_identity d
    WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id
  ) OR
  NOT EXISTS(
    SELECT 1 FROM service_actor s
    WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id
  ) OR
  NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.bound_by_user_id) OR
  (NEW.binding_version=1 AND (
    NEW.previous_service_actor_id IS NOT NULL OR NEW.replaced_at IS NOT NULL OR
    NOT EXISTS(
      SELECT 1 FROM deployment_service_actor_binding b
      WHERE b.singleton=1 AND b.tenant_id=NEW.tenant_id AND b.deployment_id=NEW.deployment_id
        AND b.version=1 AND b.service_actor_id=NEW.service_actor_id
        AND b.bound_at=NEW.bound_at AND b.bound_by_user_id=NEW.bound_by_user_id
    )
  )) OR
  (NEW.binding_version>1 AND (
    NEW.previous_service_actor_id IS NULL OR NEW.replaced_at IS NULL OR NEW.replaced_at<>NEW.bound_at OR
    NEW.previous_service_actor_id=NEW.service_actor_id OR
    NOT EXISTS(
      SELECT 1 FROM deployment_service_actor_binding b
      WHERE b.singleton=1 AND b.tenant_id=NEW.tenant_id AND b.deployment_id=NEW.deployment_id
        AND b.version=NEW.binding_version AND b.service_actor_id=NEW.service_actor_id
        AND b.bound_at=NEW.bound_at AND b.bound_by_user_id=NEW.bound_by_user_id
    ) OR
    NOT EXISTS(
      SELECT 1 FROM service_actor_binding_history prior
      WHERE prior.tenant_id=NEW.tenant_id AND prior.deployment_id=NEW.deployment_id
        AND prior.binding_version=NEW.binding_version-1
        AND prior.service_actor_id=NEW.previous_service_actor_id
    )
  ))
BEGIN SELECT RAISE(ABORT,'invalid service actor binding history transition'); END;
CREATE TRIGGER service_actor_binding_history_no_update
BEFORE UPDATE ON service_actor_binding_history
BEGIN SELECT RAISE(ABORT,'service actor binding history immutable'); END;
CREATE TRIGGER service_actor_binding_history_no_delete
BEFORE DELETE ON service_actor_binding_history
BEGIN SELECT RAISE(ABORT,'service actor binding history retained'); END;

-- Existing service-actor and binding guards are recreated here so the new job
-- pair is admitted without weakening any previous capability or tenant fence.
DROP TRIGGER service_actor_capability_insert_guard;
DROP TRIGGER service_actor_capability_update_guard;
CREATE TRIGGER service_actor_capability_insert_guard BEFORE INSERT ON service_actor WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','storage.temporary.cleanup','artifact.localized_pdf.render','artifact.worker_statement.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json))
BEGIN SELECT RAISE(ABORT,'invalid service actor capabilities'); END;
CREATE TRIGGER service_actor_capability_update_guard BEFORE UPDATE ON service_actor WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.name<>OLD.name OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','storage.temporary.cleanup','artifact.localized_pdf.render','artifact.worker_statement.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json)) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid service actor update'); END;

DROP TRIGGER deployment_service_actor_binding_insert_guard;
DROP TRIGGER deployment_service_actor_binding_update_guard;
CREATE TRIGGER deployment_service_actor_binding_insert_guard BEFORE INSERT ON deployment_service_actor_binding WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active') OR
  NEW.version<>1
BEGIN SELECT RAISE(ABORT,'invalid configured service actor'); END;
CREATE TRIGGER deployment_service_actor_binding_update_guard BEFORE UPDATE ON deployment_service_actor_binding WHEN
  NEW.singleton<>OLD.singleton OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.service_actor_id=OLD.service_actor_id OR NEW.bound_at=OLD.bound_at OR NEW.bound_by_user_id=OLD.bound_by_user_id OR NEW.version<>OLD.version+1 OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active')
BEGIN SELECT RAISE(ABORT,'invalid configured service actor replacement'); END;
CREATE TRIGGER deployment_service_actor_binding_history_after_insert
AFTER INSERT ON deployment_service_actor_binding
BEGIN
  INSERT INTO service_actor_binding_history(
    tenant_id,deployment_id,binding_version,service_actor_id,bound_at,bound_by_user_id,
    previous_service_actor_id,replaced_at
  ) VALUES(NEW.tenant_id,NEW.deployment_id,NEW.version,NEW.service_actor_id,NEW.bound_at,NEW.bound_by_user_id,NULL,NULL);
END;
CREATE TRIGGER deployment_service_actor_binding_history_after_update
AFTER UPDATE ON deployment_service_actor_binding
BEGIN
  INSERT INTO service_actor_binding_history(
    tenant_id,deployment_id,binding_version,service_actor_id,bound_at,bound_by_user_id,
    previous_service_actor_id,replaced_at
  ) VALUES(NEW.tenant_id,NEW.deployment_id,NEW.version,NEW.service_actor_id,NEW.bound_at,NEW.bound_by_user_id,OLD.service_actor_id,NEW.bound_at);
END;

CREATE TABLE worker_statement_artifact(
  artifact_id TEXT PRIMARY KEY NOT NULL CHECK(length(artifact_id)>0),
  worker_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  period_start TEXT NOT NULL CHECK(period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_start) IS NOT NULL AND date(period_start)=period_start),
  period_end TEXT NOT NULL CHECK(period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_end) IS NOT NULL AND date(period_end)=period_end),
  format TEXT NOT NULL CHECK(format IN ('pdf','csv')),
  template_version TEXT NOT NULL CHECK(length(template_version) BETWEEN 1 AND 120 AND template_version=trim(template_version) AND instr(template_version,'..')=0 AND instr(template_version,char(92))=0 AND instr(template_version,char(0))=0 AND instr(template_version,char(10))=0 AND instr(template_version,char(13))=0),
  generation_version TEXT NOT NULL CHECK(length(generation_version) BETWEEN 1 AND 120 AND generation_version=trim(generation_version) AND instr(generation_version,'..')=0 AND instr(generation_version,char(92))=0 AND instr(generation_version,char(0))=0 AND instr(generation_version,char(10))=0 AND instr(generation_version,char(13))=0),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object'),
  snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed')),
  current_attempt_number INTEGER NOT NULL CHECK(current_attempt_number>=1),
  semantic_filename TEXT NOT NULL CHECK(length(semantic_filename) BETWEEN 1 AND 240 AND semantic_filename=trim(semantic_filename) AND instr(semantic_filename,'/')=0 AND instr(semantic_filename,char(92))=0 AND instr(semantic_filename,char(0))=0 AND instr(semantic_filename,char(10))=0 AND instr(semantic_filename,char(13))=0 AND ((format='pdf' AND lower(substr(semantic_filename,-4))='.pdf') OR (format='csv' AND lower(substr(semantic_filename,-4))='.csv'))),
  media_type TEXT NULL CHECK(media_type IS NULL OR media_type IN ('application/pdf','text/csv')),
  byte_length INTEGER NULL CHECK(byte_length IS NULL OR byte_length>0),
  content_sha256 TEXT NULL CHECK(content_sha256 IS NULL OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  storage_key TEXT NOT NULL CHECK(length(storage_key) BETWEEN 1 AND 255 AND storage_key=trim(storage_key) AND substr(storage_key,1,1)<>'/' AND instr(storage_key,'//')=0 AND instr(storage_key,'..')=0 AND instr(storage_key,'://')=0 AND instr(storage_key,char(92))=0 AND instr(storage_key,char(0))=0 AND instr(storage_key,char(10))=0 AND instr(storage_key,char(13))=0),
  renderer_version TEXT NULL CHECK(renderer_version IS NULL OR (length(renderer_version) BETWEEN 1 AND 120 AND renderer_version=trim(renderer_version) AND instr(renderer_version,'..')=0 AND instr(renderer_version,char(92))=0 AND instr(renderer_version,char(0))=0 AND instr(renderer_version,char(10))=0 AND instr(renderer_version,char(13))=0)),
  ready_at TEXT NULL CHECK(ready_at IS NULL OR length(ready_at)>0),
  error_code TEXT NULL CHECK(error_code IS NULL OR (length(error_code) BETWEEN 1 AND 200 AND error_code=trim(error_code) AND instr(error_code,char(0))=0 AND instr(error_code,char(10))=0 AND instr(error_code,char(13))=0)),
  retryable INTEGER NULL CHECK(retryable IS NULL OR retryable IN (0,1)),
  integrity_blocked INTEGER NOT NULL DEFAULT 0 CHECK(integrity_blocked IN (0,1)),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 5),
  request_key TEXT NULL CHECK(request_key IS NULL OR (length(request_key) BETWEEN 1 AND 240 AND request_key=trim(request_key) AND instr(request_key,'..')=0 AND instr(request_key,char(92))=0 AND instr(request_key,char(0))=0 AND instr(request_key,char(10))=0 AND instr(request_key,char(13))=0)),
  requested_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  requested_at TEXT NOT NULL CHECK(length(requested_at)>0),
  started_at TEXT NULL CHECK(started_at IS NULL OR length(started_at)>0),
  finished_at TEXT NULL CHECK(finished_at IS NULL OR length(finished_at)>0),
  claimed_job_id TEXT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  claimed_job_run_id TEXT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  claimed_lease_fence INTEGER NULL CHECK(claimed_lease_fence IS NULL OR claimed_lease_fence>=1),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  CHECK(julianday(period_end)>=julianday(period_start)),
  CHECK((status='queued' AND current_attempt_number>=1 AND media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND renderer_version IS NULL AND ready_at IS NULL AND error_code IS NULL AND retryable IS NULL AND integrity_blocked=0 AND started_at IS NULL AND finished_at IS NULL AND claimed_job_id IS NULL AND claimed_job_run_id IS NULL AND claimed_lease_fence IS NULL) OR
    (status='running' AND started_at IS NOT NULL AND finished_at IS NULL AND ready_at IS NULL AND media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND renderer_version IS NULL AND error_code IS NULL AND retryable IS NULL AND integrity_blocked=0 AND claimed_job_id IS NOT NULL AND claimed_job_run_id IS NOT NULL AND claimed_lease_fence IS NOT NULL) OR
    (status='ready' AND media_type IS NOT NULL AND byte_length IS NOT NULL AND content_sha256 IS NOT NULL AND renderer_version IS NOT NULL AND ready_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NULL AND retryable IS NULL AND integrity_blocked=0 AND claimed_job_id IS NULL AND claimed_job_run_id IS NULL AND claimed_lease_fence IS NULL) OR
    (status='failed' AND finished_at IS NOT NULL AND error_code IS NOT NULL AND retryable IS NOT NULL AND claimed_job_id IS NULL AND claimed_job_run_id IS NULL AND claimed_lease_fence IS NULL AND ((integrity_blocked=0 AND media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND renderer_version IS NULL AND ready_at IS NULL) OR (integrity_blocked=1 AND ((media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND renderer_version IS NULL AND ready_at IS NULL) OR (media_type IS NOT NULL AND byte_length IS NOT NULL AND content_sha256 IS NOT NULL AND renderer_version IS NOT NULL AND ready_at IS NOT NULL)))))
  )
) STRICT;
CREATE UNIQUE INDEX worker_statement_artifact_request_key_uq
  ON worker_statement_artifact(tenant_id,deployment_id,request_key)
  WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX worker_statement_artifact_active_identity_uq
  ON worker_statement_artifact(tenant_id,deployment_id,worker_id,period_start,period_end,format,template_version,generation_version,snapshot_hash)
  WHERE status IN ('queued','running','ready');
CREATE INDEX worker_statement_artifact_worker_idx
  ON worker_statement_artifact(tenant_id,deployment_id,worker_id,period_start,period_end,status);
CREATE INDEX worker_statement_artifact_status_idx
  ON worker_statement_artifact(status,updated_at);

CREATE TABLE worker_statement_artifact_attempt(
  attempt_id TEXT PRIMARY KEY NOT NULL CHECK(length(attempt_id)>0),
  artifact_id TEXT NOT NULL REFERENCES worker_statement_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>=1),
  job_id TEXT NOT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  job_run_id TEXT NOT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  lease_fence INTEGER NOT NULL CHECK(lease_fence>=1),
  started_at TEXT NOT NULL CHECK(length(started_at)>0),
  finished_at TEXT NOT NULL CHECK(length(finished_at)>0),
  outcome TEXT NOT NULL CHECK(outcome IN ('ready','failed')),
  failure_class TEXT NULL CHECK(failure_class IS NULL OR (length(failure_class) BETWEEN 1 AND 200 AND failure_class=trim(failure_class) AND instr(failure_class,char(0))=0 AND instr(failure_class,char(10))=0 AND instr(failure_class,char(13))=0)),
  retryable INTEGER NULL CHECK(retryable IS NULL OR retryable IN (0,1)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(artifact_id,attempt_number),
  CHECK((outcome='ready' AND failure_class IS NULL AND retryable IS NULL) OR (outcome='failed' AND failure_class IS NOT NULL AND retryable IS NOT NULL))
) STRICT;
CREATE INDEX worker_statement_artifact_attempt_job_idx
  ON worker_statement_artifact_attempt(job_id,job_run_id);

CREATE TABLE worker_statement_retry_decision(
  decision_id TEXT PRIMARY KEY NOT NULL CHECK(length(decision_id)>0),
  artifact_id TEXT NOT NULL REFERENCES worker_statement_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_attempt_number INTEGER NOT NULL CHECK(prior_attempt_number>=1),
  next_attempt_number INTEGER NOT NULL CHECK(next_attempt_number=prior_attempt_number+1),
  failure_code TEXT NOT NULL CHECK(length(failure_code) BETWEEN 1 AND 200 AND failure_code=trim(failure_code) AND instr(failure_code,char(0))=0 AND instr(failure_code,char(10))=0 AND instr(failure_code,char(13))=0),
  failure_class TEXT NOT NULL CHECK(length(failure_class) BETWEEN 1 AND 200 AND failure_class=trim(failure_class) AND instr(failure_class,char(0))=0 AND instr(failure_class,char(10))=0 AND instr(failure_class,char(13))=0),
  retryable INTEGER NOT NULL CHECK(retryable=1),
  requested_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  requested_at TEXT NOT NULL CHECK(length(requested_at)>0),
  decision_hash TEXT NOT NULL CHECK(length(decision_hash)=64 AND decision_hash NOT GLOB '*[^0-9a-f]*'),
  UNIQUE(artifact_id,next_attempt_number),
  UNIQUE(decision_hash)
) STRICT;

CREATE TABLE worker_statement_integrity_incident(
  incident_id TEXT PRIMARY KEY NOT NULL CHECK(length(incident_id)>0),
  artifact_id TEXT NOT NULL REFERENCES worker_statement_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>=1),
  incident_kind TEXT NOT NULL CHECK(incident_kind IN ('durable_completion_missing_or_stale','storage_verification_failed','metadata_invalid')),
  expected_hash TEXT NULL CHECK(expected_hash IS NULL OR (length(expected_hash)=64 AND expected_hash NOT GLOB '*[^0-9a-f]*')),
  observed_hash TEXT NULL CHECK(observed_hash IS NULL OR (length(observed_hash)=64 AND observed_hash NOT GLOB '*[^0-9a-f]*')),
  expected_length INTEGER NULL CHECK(expected_length IS NULL OR expected_length>0),
  observed_length INTEGER NULL CHECK(observed_length IS NULL OR observed_length>0),
  storage_key TEXT NULL CHECK(storage_key IS NULL OR (length(storage_key) BETWEEN 1 AND 255 AND storage_key=trim(storage_key) AND substr(storage_key,1,1)<>'/' AND instr(storage_key,'//')=0 AND instr(storage_key,'..')=0 AND instr(storage_key,'://')=0 AND instr(storage_key,char(92))=0 AND instr(storage_key,char(0))=0 AND instr(storage_key,char(10))=0 AND instr(storage_key,char(13))=0)),
  detected_at TEXT NOT NULL CHECK(length(detected_at)>0),
  detected_by TEXT NOT NULL CHECK(length(detected_by) BETWEEN 1 AND 200 AND detected_by=trim(detected_by) AND instr(detected_by,char(0))=0 AND instr(detected_by,char(10))=0 AND instr(detected_by,char(13))=0),
  incident_hash TEXT NOT NULL CHECK(length(incident_hash)=64 AND incident_hash NOT GLOB '*[^0-9a-f]*'),
  UNIQUE(incident_hash)
) STRICT;
CREATE INDEX worker_statement_integrity_incident_artifact_idx
  ON worker_statement_integrity_incident(artifact_id,detected_at);

CREATE TRIGGER worker_statement_artifact_insert_guard
BEFORE INSERT ON worker_statement_artifact
WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.requested_by<>NEW.worker_id OR
  NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.worker_id AND u.role='worker' AND u.status='active') OR
  NEW.status<>'queued' OR NEW.current_attempt_number<>1 OR NEW.integrity_blocked<>0 OR
  NEW.media_type IS NOT NULL OR NEW.byte_length IS NOT NULL OR NEW.content_sha256 IS NOT NULL OR NEW.renderer_version IS NOT NULL OR NEW.ready_at IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.retryable IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.finished_at IS NOT NULL OR NEW.claimed_job_id IS NOT NULL OR NEW.claimed_job_run_id IS NOT NULL OR NEW.claimed_lease_fence IS NOT NULL
BEGIN SELECT RAISE(ABORT,'invalid worker statement artifact'); END;

-- Durable job/run binding predicates are repeated in the artifact transition
-- guards so direct SQL callers cannot forge a claim or completion even when
-- they bypass the typed repository.
CREATE TRIGGER worker_statement_artifact_update_guard
BEFORE UPDATE ON worker_statement_artifact
WHEN
  NEW.artifact_id IS NOT OLD.artifact_id OR NEW.worker_id IS NOT OLD.worker_id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.deployment_id IS NOT OLD.deployment_id OR
  NEW.period_start IS NOT OLD.period_start OR NEW.period_end IS NOT OLD.period_end OR NEW.format IS NOT OLD.format OR NEW.template_version IS NOT OLD.template_version OR NEW.generation_version IS NOT OLD.generation_version OR NEW.snapshot_json IS NOT OLD.snapshot_json OR NEW.snapshot_hash IS NOT OLD.snapshot_hash OR NEW.semantic_filename IS NOT OLD.semantic_filename OR NEW.storage_key IS NOT OLD.storage_key OR NEW.max_attempts IS NOT OLD.max_attempts OR NEW.request_key IS NOT OLD.request_key OR NEW.requested_by IS NOT OLD.requested_by OR NEW.requested_at IS NOT OLD.requested_at OR NEW.updated_at IS OLD.updated_at OR
  NOT (
    (
      OLD.status='queued' AND NEW.status='running' AND NEW.current_attempt_number=OLD.current_attempt_number AND NEW.started_at IS NOT NULL AND NEW.finished_at IS NULL AND NEW.media_type IS NULL AND NEW.byte_length IS NULL AND NEW.content_sha256 IS NULL AND NEW.renderer_version IS NULL AND NEW.ready_at IS NULL AND NEW.error_code IS NULL AND NEW.retryable IS NULL AND NEW.integrity_blocked=0 AND NEW.claimed_job_id IS NOT NULL AND NEW.claimed_job_run_id IS NOT NULL AND NEW.claimed_lease_fence IS NOT NULL AND
      EXISTS(
        SELECT 1
        FROM job j JOIN job_run r ON r.id=NEW.claimed_job_run_id AND r.job_id=j.id
        JOIN service_actor s ON s.id=r.service_actor_id
        JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
        WHERE j.id=NEW.claimed_job_id AND j.contract_version='b5-v1' AND j.kind='worker_statement_artifact_render' AND j.required_capability='artifact.worker_statement.render' AND j.state='claimed' AND j.active_job_run_id=r.id AND j.tenant_id=NEW.tenant_id AND j.deployment_id=NEW.deployment_id AND j.fence_version=NEW.claimed_lease_fence AND j.payload_sha256 IS NOT NULL AND json_valid(j.payload_json) AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number AND j.payload_sha256=ja_finance_hash_v1(j.payload_json) AND r.contract_version='b5-v1' AND r.kind=j.kind AND r.required_capability=j.required_capability AND r.tenant_id=j.tenant_id AND r.deployment_id=j.deployment_id AND r.state='running' AND r.fence_version=j.fence_version AND r.fencing_token IS NOT NULL AND r.lease_until=j.lease_until AND julianday(r.lease_until)>julianday(r.started_at) AND r.service_actor_version=s.version AND r.service_actor_capabilities_json=s.capabilities_json AND s.status='active' AND b.tenant_id=j.tenant_id AND b.deployment_id=j.deployment_id AND b.version=r.configured_binding_version AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=j.required_capability)
      )
    ) OR
    (
      OLD.status='running' AND NEW.status='ready' AND NEW.current_attempt_number=OLD.current_attempt_number AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS NOT NULL AND NEW.ready_at IS NOT NULL AND NEW.media_type=(CASE WHEN NEW.format='pdf' THEN 'application/pdf' ELSE 'text/csv' END) AND NEW.byte_length IS NOT NULL AND NEW.byte_length>0 AND NEW.content_sha256 IS NOT NULL AND NEW.renderer_version IS NOT NULL AND NEW.error_code IS NULL AND NEW.retryable IS NULL AND NEW.integrity_blocked=0 AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL AND
      EXISTS(SELECT 1 FROM worker_statement_artifact_attempt a WHERE a.artifact_id=OLD.artifact_id AND a.attempt_number=OLD.current_attempt_number AND a.outcome='ready') AND
      EXISTS(
        SELECT 1
        FROM job j JOIN job_run r ON r.id=OLD.claimed_job_run_id AND r.job_id=j.id
        JOIN service_actor s ON s.id=r.service_actor_id
        JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
        WHERE j.id=OLD.claimed_job_id AND j.contract_version='b5-v1' AND j.kind='worker_statement_artifact_render' AND j.required_capability='artifact.worker_statement.render' AND j.state='succeeded' AND j.active_job_run_id=r.id AND j.tenant_id=OLD.tenant_id AND j.deployment_id=OLD.deployment_id AND j.fence_version=OLD.claimed_lease_fence AND j.payload_sha256 IS NOT NULL AND json_valid(j.payload_json) AND json_extract(j.payload_json,'$.artifactId')=OLD.artifact_id AND json_extract(j.payload_json,'$.requestedAttempt')=OLD.current_attempt_number AND j.payload_sha256=ja_finance_hash_v1(j.payload_json) AND r.contract_version='b5-v1' AND r.kind=j.kind AND r.required_capability=j.required_capability AND r.tenant_id=j.tenant_id AND r.deployment_id=j.deployment_id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL AND r.fence_version=j.fence_version AND r.service_actor_version=s.version AND r.service_actor_capabilities_json=s.capabilities_json AND s.status='active' AND b.tenant_id=j.tenant_id AND b.deployment_id=j.deployment_id AND b.version=r.configured_binding_version AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=j.required_capability)
      )
    ) OR
    (
      OLD.status='running' AND NEW.status='failed' AND NEW.current_attempt_number=OLD.current_attempt_number AND NEW.finished_at IS NOT NULL AND NEW.error_code IS NOT NULL AND NEW.retryable IS NOT NULL AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL AND EXISTS(SELECT 1 FROM worker_statement_artifact_attempt a WHERE a.artifact_id=OLD.artifact_id AND a.attempt_number=OLD.current_attempt_number AND a.outcome='failed') AND ((NEW.integrity_blocked=0 AND NEW.media_type IS NULL AND NEW.byte_length IS NULL AND NEW.content_sha256 IS NULL AND NEW.renderer_version IS NULL AND NEW.ready_at IS NULL) OR (NEW.integrity_blocked=1 AND NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.media_type IS NULL AND NEW.byte_length IS NULL AND NEW.content_sha256 IS NULL AND NEW.renderer_version IS NULL AND NEW.ready_at IS NULL)) AND
      EXISTS(
        SELECT 1 FROM job j JOIN job_run r ON r.id=OLD.claimed_job_run_id AND r.job_id=j.id
        JOIN service_actor s ON s.id=r.service_actor_id JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
        WHERE j.id=OLD.claimed_job_id AND j.contract_version='b5-v1' AND j.kind='worker_statement_artifact_render' AND j.required_capability='artifact.worker_statement.render' AND j.tenant_id=OLD.tenant_id AND j.deployment_id=OLD.deployment_id AND j.fence_version=OLD.claimed_lease_fence AND json_valid(j.payload_json) AND json_extract(j.payload_json,'$.artifactId')=OLD.artifact_id AND json_extract(j.payload_json,'$.requestedAttempt')=OLD.current_attempt_number AND j.payload_sha256=ja_finance_hash_v1(j.payload_json) AND r.contract_version='b5-v1' AND r.kind=j.kind AND r.required_capability=j.required_capability AND r.tenant_id=j.tenant_id AND r.deployment_id=j.deployment_id AND r.fence_version=j.fence_version AND r.service_actor_version=s.version AND r.service_actor_capabilities_json=s.capabilities_json AND s.status='active' AND b.tenant_id=j.tenant_id AND b.deployment_id=j.deployment_id AND b.version=r.configured_binding_version AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=j.required_capability) AND ((j.active_job_run_id=r.id AND ((j.state='claimed' AND r.state='running' AND r.lease_until=j.lease_until AND j.lease_until IS NOT NULL AND julianday(j.lease_until)>julianday(r.started_at)) OR (j.state='succeeded' AND r.state='succeeded' AND r.outcome='succeeded'))) OR (j.state='queued' AND j.active_job_run_id IS NULL AND r.state='lease_expired' AND r.outcome='retry_scheduled' AND r.error_code='LEASE_LOST' AND r.finished_at IS NOT NULL))
      )
    ) OR
    (
      OLD.status='ready' AND NEW.status='failed' AND NEW.current_attempt_number=OLD.current_attempt_number AND NEW.integrity_blocked=1 AND NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.retryable=1 AND NEW.media_type IS OLD.media_type AND NEW.byte_length IS OLD.byte_length AND NEW.content_sha256 IS OLD.content_sha256 AND NEW.renderer_version IS OLD.renderer_version AND NEW.ready_at IS OLD.ready_at AND NEW.finished_at IS NOT OLD.finished_at AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL AND EXISTS(SELECT 1 FROM worker_statement_integrity_incident i WHERE i.artifact_id=OLD.artifact_id AND i.attempt_number=OLD.current_attempt_number)
    ) OR
    (
      OLD.status='failed' AND NEW.status='queued' AND NEW.current_attempt_number=OLD.current_attempt_number+1 AND NEW.media_type IS NULL AND NEW.byte_length IS NULL AND NEW.content_sha256 IS NULL AND NEW.renderer_version IS NULL AND NEW.ready_at IS NULL AND NEW.error_code IS NULL AND NEW.retryable IS NULL AND NEW.integrity_blocked=0 AND NEW.started_at IS NULL AND NEW.finished_at IS NULL AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL AND EXISTS(SELECT 1 FROM worker_statement_retry_decision d WHERE d.artifact_id=OLD.artifact_id AND d.prior_attempt_number=OLD.current_attempt_number AND d.next_attempt_number=NEW.current_attempt_number AND d.retryable=1)
    )
  )
BEGIN SELECT RAISE(ABORT,'invalid worker statement artifact transition'); END;

CREATE TRIGGER worker_statement_artifact_no_delete
BEFORE DELETE ON worker_statement_artifact
BEGIN SELECT RAISE(ABORT,'worker statement artifact retained'); END;

CREATE TRIGGER worker_statement_artifact_attempt_insert_guard
BEFORE INSERT ON worker_statement_artifact_attempt
WHEN NOT EXISTS(
  SELECT 1
  FROM worker_statement_artifact a
  JOIN job j ON j.id=NEW.job_id
  JOIN job_run r ON r.id=NEW.job_run_id AND r.job_id=j.id
  JOIN service_actor s ON s.id=r.service_actor_id
  JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
  WHERE a.artifact_id=NEW.artifact_id AND a.status='running' AND a.current_attempt_number=NEW.attempt_number
    AND a.claimed_job_id=NEW.job_id AND a.claimed_job_run_id=NEW.job_run_id AND a.claimed_lease_fence=NEW.lease_fence
    AND j.contract_version='b5-v1' AND j.kind='worker_statement_artifact_render' AND j.required_capability='artifact.worker_statement.render' AND j.tenant_id=a.tenant_id AND j.deployment_id=a.deployment_id AND j.fence_version=NEW.lease_fence AND j.payload_sha256 IS NOT NULL AND json_valid(j.payload_json) AND json_extract(j.payload_json,'$.artifactId')=a.artifact_id AND json_extract(j.payload_json,'$.requestedAttempt')=a.current_attempt_number AND j.payload_sha256=ja_finance_hash_v1(j.payload_json) AND r.contract_version='b5-v1' AND r.kind=j.kind AND r.required_capability=j.required_capability AND r.tenant_id=j.tenant_id AND r.deployment_id=j.deployment_id AND r.fence_version=j.fence_version AND r.service_actor_version=s.version AND r.service_actor_capabilities_json=s.capabilities_json AND s.status='active' AND b.tenant_id=j.tenant_id AND b.deployment_id=j.deployment_id AND b.version=r.configured_binding_version AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=j.required_capability) AND ((NEW.outcome='failed' AND ((j.active_job_run_id=r.id AND ((j.state='claimed' AND r.state='running' AND j.lease_until IS NOT NULL AND r.lease_until=j.lease_until) OR (j.state='succeeded' AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL))) OR (j.state='queued' AND j.active_job_run_id IS NULL AND r.state='lease_expired' AND r.outcome='retry_scheduled' AND r.error_code='LEASE_LOST' AND r.finished_at IS NOT NULL))) OR (NEW.outcome='ready' AND j.active_job_run_id=r.id AND j.state='succeeded' AND r.state='succeeded' AND r.outcome='succeeded'))
)
BEGIN SELECT RAISE(ABORT,'invalid worker statement artifact attempt'); END;
CREATE TRIGGER worker_statement_artifact_attempt_no_update
BEFORE UPDATE ON worker_statement_artifact_attempt
BEGIN SELECT RAISE(ABORT,'worker statement artifact attempt immutable'); END;
CREATE TRIGGER worker_statement_artifact_attempt_no_delete
BEFORE DELETE ON worker_statement_artifact_attempt
BEGIN SELECT RAISE(ABORT,'worker statement artifact attempt retained'); END;

CREATE TRIGGER worker_statement_retry_decision_insert_guard
BEFORE INSERT ON worker_statement_retry_decision
WHEN NOT EXISTS(
  SELECT 1 FROM worker_statement_artifact a JOIN user u ON u.id=NEW.requested_by
  WHERE a.artifact_id=NEW.artifact_id AND a.status='failed' AND a.current_attempt_number=NEW.prior_attempt_number AND a.retryable=1 AND a.integrity_blocked=0 AND a.worker_id=NEW.requested_by AND a.current_attempt_number<a.max_attempts AND u.status='active' AND u.role='worker'
)
BEGIN SELECT RAISE(ABORT,'invalid worker statement retry decision'); END;
CREATE TRIGGER worker_statement_retry_decision_no_update
BEFORE UPDATE ON worker_statement_retry_decision
BEGIN SELECT RAISE(ABORT,'worker statement retry decision immutable'); END;
CREATE TRIGGER worker_statement_retry_decision_no_delete
BEFORE DELETE ON worker_statement_retry_decision
BEGIN SELECT RAISE(ABORT,'worker statement retry decision retained'); END;

CREATE TRIGGER worker_statement_integrity_incident_insert_guard
BEFORE INSERT ON worker_statement_integrity_incident
WHEN NOT EXISTS(
  SELECT 1 FROM worker_statement_artifact a
  WHERE a.artifact_id=NEW.artifact_id AND a.current_attempt_number=NEW.attempt_number AND a.status IN ('running','ready') AND
    ((a.status='running' AND EXISTS(SELECT 1 FROM worker_statement_artifact_attempt x WHERE x.artifact_id=a.artifact_id AND x.attempt_number=a.current_attempt_number AND x.outcome='failed')) OR
     (a.status='ready' AND EXISTS(SELECT 1 FROM worker_statement_artifact_attempt x WHERE x.artifact_id=a.artifact_id AND x.attempt_number=a.current_attempt_number AND x.outcome='ready')))
)
BEGIN SELECT RAISE(ABORT,'invalid worker statement integrity incident'); END;
CREATE TRIGGER worker_statement_integrity_incident_no_update
BEFORE UPDATE ON worker_statement_integrity_incident
BEGIN SELECT RAISE(ABORT,'worker statement integrity incident immutable'); END;
CREATE TRIGGER worker_statement_integrity_incident_no_delete
BEFORE DELETE ON worker_statement_integrity_incident
BEGIN SELECT RAISE(ABORT,'worker statement integrity incident retained'); END;

-- MFA and passkey events are literal reviewed B5-R4 registry entries.  The
-- manifest guard is temporarily suspended only while inserting this migration's
-- own rows, then restored before the transaction commits.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','security.mfa.setup_started','user','user','WP-MFA','restricted'),
  ('B5-R4','security.mfa.enable','user','user','WP-MFA','restricted'),
  ('B5-R4','security.mfa.disable','user','user','WP-MFA','restricted'),
  ('B5-R4','security.mfa.recovery_login','user','user','WP-MFA','restricted'),
  ('B5-R4','security.passkey.register','passkey','user','WP-MFA','restricted'),
  ('B5-R4','security.passkey.revoke','passkey','user','WP-MFA','restricted'),
  ('B5-R4','security.passkey.login','user','user','WP-MFA','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;

-- Add the new Worker statement pair while retaining every previously reviewed
-- kind/capability pair in the B5 guard.
DROP TRIGGER job_b5_insert_guard;
CREATE TRIGGER job_b5_insert_guard BEFORE INSERT ON job WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.kind NOT IN ('invoice_pdf','period_close_report','auto_draft','accounting_pack_artifact_render','temporary_upload_cleanup','localized_pdf_variant_render','worker_statement_artifact_render','document_scan','outbox_deliver','alert_dispatch','email_send','backup_verify') OR
  NEW.state<>'queued' OR NEW.lease_until IS NOT NULL OR NEW.payload_sha256 IS NULL OR NEW.correlation_id IS NULL OR NEW.required_capability IS NULL OR
  NEW.attempts<>0 OR NEW.fence_version<>0 OR NEW.active_job_run_id IS NOT NULL OR NEW.last_error_code IS NOT NULL OR
  NOT ((NEW.kind='invoice_pdf' AND NEW.required_capability='artifact.invoice.render') OR
       (NEW.kind='period_close_report' AND NEW.required_capability='artifact.report.render') OR
       (NEW.kind='auto_draft' AND NEW.required_capability='billing.draft.generate') OR
       (NEW.kind='accounting_pack_artifact_render' AND NEW.required_capability='artifact.accounting_pack.render') OR
       (NEW.kind='temporary_upload_cleanup' AND NEW.required_capability='storage.temporary.cleanup') OR
       (NEW.kind='localized_pdf_variant_render' AND NEW.required_capability='artifact.localized_pdf.render') OR
       (NEW.kind='worker_statement_artifact_render' AND NEW.required_capability='artifact.worker_statement.render') OR
       (NEW.kind='document_scan' AND NEW.required_capability='document.scan') OR
       (NEW.kind='outbox_deliver' AND NEW.required_capability='outbox.deliver') OR
       (NEW.kind='alert_dispatch' AND NEW.required_capability='alert.dispatch') OR
       (NEW.kind='email_send' AND NEW.required_capability='email.send') OR
       (NEW.kind='backup_verify' AND NEW.required_capability='backup.verify'))
BEGIN SELECT RAISE(ABORT,'invalid b5 job'); END;
