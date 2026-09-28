-- B3 Accounting Pack revision and independent artifact lifecycle.
-- Static SQL only; the migration runner appends migration 21 metadata/version.

CREATE TABLE accounting_pack_series(
  series_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  timezone TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  tail_revision_id TEXT,
  current_authority_event_id TEXT,
  CHECK(period_start<period_end),
  UNIQUE(tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE accounting_pack_revision(
  revision_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES accounting_pack_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number>0),
  predecessor_revision_id TEXT REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  timezone TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_cut_id TEXT NOT NULL REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_cut_hash TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL CHECK(reconciliation_status IN('CLEAN','BLOCKED')),
  reconciliation_difference_minor INTEGER NOT NULL,
  blocker_count INTEGER NOT NULL CHECK(blocker_count>=0),
  status TEXT NOT NULL CHECK(status IN('candidate','failed')),
  revision_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE(series_id,revision_number),
  UNIQUE(series_id,predecessor_revision_id),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX accounting_pack_one_genesis ON accounting_pack_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE accounting_pack_authority_event(
  authority_event_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES accounting_pack_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_authority_event_id TEXT REFERENCES accounting_pack_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN('finalize','supersede')),
  effective_at TEXT NOT NULL,
  reason TEXT,
  principal_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX accounting_pack_authority_genesis ON accounting_pack_authority_event(series_id) WHERE prior_authority_event_id IS NULL;
CREATE TABLE accounting_pack_source_cut_batch(
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  cut_id TEXT NOT NULL REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  change_sequence_high_watermark INTEGER NOT NULL,
  cut_hash TEXT NOT NULL,
  UNIQUE(revision_id,cut_id)
) STRICT;
CREATE TABLE accounting_pack_source_cut_item(
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES accounting_pack_source_cut_batch(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_cut_item_id TEXT NOT NULL REFERENCES finance_source_cut_item(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  evidence_hash TEXT NOT NULL,
  UNIQUE(batch_id,source_cut_item_id)
) STRICT;
CREATE TABLE accounting_pack_reconciliation_line(
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  line_sequence INTEGER NOT NULL CHECK(line_sequence>0),
  category TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  expected_minor INTEGER NOT NULL,
  actual_minor INTEGER NOT NULL,
  difference_minor INTEGER NOT NULL CHECK(difference_minor=actual_minor-expected_minor),
  created_at TEXT NOT NULL,
  UNIQUE(revision_id,line_sequence),
  UNIQUE(revision_id,category,source_kind,source_id)
) STRICT;
CREATE TABLE accounting_pack_artifact(
  artifact_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  format TEXT NOT NULL CHECK(format IN('pdf','xlsx','invoice_csv','expense_csv','json')),
  generation_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('queued','running','ready','failed')),
  current_attempt_number INTEGER NOT NULL CHECK(current_attempt_number>0),
  semantic_filename TEXT NOT NULL,
  media_type TEXT,
  byte_length INTEGER,
  content_sha256 TEXT,
  storage_key TEXT,
  source_hash TEXT NOT NULL,
  renderer_version TEXT,
  ready_at TEXT,
  error_code TEXT,
  retryable INTEGER CHECK(retryable IS NULL OR retryable IN(0,1)),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 5),
  CHECK(source_hash IS NOT NULL AND length(source_hash)=64 AND source_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK(content_sha256 IS NULL OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  CHECK(media_type IS NULL OR
    (format='pdf' AND media_type='application/pdf') OR
    (format='xlsx' AND media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') OR
    (format IN('invoice_csv','expense_csv') AND media_type='text/csv') OR
    (format='json' AND media_type='application/json')),
  CHECK(storage_key IS NULL OR (
    length(storage_key)>0 AND substr(storage_key,1,1)<>'/' AND instr(storage_key,char(92))=0 AND
    instr(storage_key,char(0))=0 AND storage_key NOT GLOB '*[' || char(1) || '-' || char(31) || ']*' AND
    instr(storage_key,':')=0 AND instr(storage_key,'..')=0 AND storage_key NOT LIKE './%' AND
    storage_key NOT LIKE '%/./%' AND storage_key NOT LIKE '%/.' AND
    instr(lower(storage_key),'%2e')=0 AND instr(lower(storage_key),'://')=0
  )),
  CHECK((status='ready' AND media_type IS NOT NULL AND byte_length>0 AND length(content_sha256)=64 AND storage_key IS NOT NULL AND renderer_version IS NOT NULL AND ready_at IS NOT NULL AND error_code IS NULL) OR status<>'ready'),
  UNIQUE(revision_id,format,generation_version)
) STRICT;
CREATE TABLE accounting_pack_retry_decision(
  decision_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  format TEXT NOT NULL,
  generation_version TEXT NOT NULL,
  prior_attempt_number INTEGER NOT NULL,
  next_attempt_number INTEGER NOT NULL,
  decision_kind TEXT NOT NULL CHECK(decision_kind IN('manual','scheduler')),
  failure_class TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK(retryable=1),
  not_before TEXT NOT NULL,
  max_attempts INTEGER NOT NULL CHECK(max_attempts BETWEEN 1 AND 5),
  principal_id TEXT,
  scheduler_id TEXT,
  command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  decision_hash TEXT NOT NULL UNIQUE,
  CHECK((decision_kind='manual' AND principal_id IS NOT NULL AND scheduler_id IS NULL AND command_id IS NOT NULL) OR (decision_kind='scheduler' AND principal_id IS NULL AND scheduler_id IS NOT NULL AND command_id IS NULL)),
  CHECK(next_attempt_number=prior_attempt_number+1),
  UNIQUE(artifact_id,generation_version,next_attempt_number)
) STRICT;
CREATE TABLE accounting_pack_artifact_attempt(
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
  job_id TEXT REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  job_run_id TEXT REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  manual_command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  retry_decision_id TEXT REFERENCES accounting_pack_retry_decision(decision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  lease_fence INTEGER,
  started_at TEXT,
  finished_at TEXT,
  outcome TEXT CHECK(outcome IN('ready','failed')),
  failure_class TEXT,
  retryable INTEGER CHECK(retryable IN(0,1)),
  created_at TEXT NOT NULL,
  CHECK((attempt_number=1 AND job_id IS NOT NULL AND job_run_id IS NOT NULL AND manual_command_id IS NULL AND retry_decision_id IS NULL) OR (attempt_number>1 AND ((manual_command_id IS NULL)!=(retry_decision_id IS NULL)))),
  UNIQUE(artifact_id,attempt_number)
) STRICT;
CREATE TABLE accounting_pack_integrity_incident(
  incident_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  format TEXT NOT NULL,
  generation_version TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  incident_kind TEXT NOT NULL,
  expected_hash TEXT,
  observed_hash TEXT,
  expected_length INTEGER,
  observed_length INTEGER,
  storage_key TEXT,
  detected_at TEXT NOT NULL,
  detected_by TEXT NOT NULL,
  command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  incident_hash TEXT NOT NULL UNIQUE
) STRICT;

CREATE TRIGGER accounting_pack_revision_subject_guard BEFORE INSERT ON accounting_pack_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_revision prior
    WHERE prior.revision_id=NEW.predecessor_revision_id
      AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  )) OR
  NOT EXISTS(
    SELECT 1 FROM accounting_pack_series s
    WHERE s.series_id=NEW.series_id
      AND s.tenant_id=NEW.tenant_id
      AND s.deployment_id=NEW.deployment_id
      AND s.legal_entity_revision_id=NEW.legal_entity_revision_id
      AND s.currency=NEW.currency
      AND s.timezone=NEW.timezone
      AND s.period_start=NEW.period_start
      AND s.period_end=NEW.period_end
  )
BEGIN SELECT RAISE(ABORT,'accounting pack revision is outside its series'); END;
CREATE TRIGGER accounting_pack_authority_subject_guard BEFORE INSERT ON accounting_pack_authority_event WHEN
  NOT EXISTS(
    SELECT 1 FROM accounting_pack_revision r
    WHERE r.revision_id=NEW.revision_id AND r.series_id=NEW.series_id
  ) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_authority_event prior
    WHERE prior.authority_event_id=NEW.prior_authority_event_id AND prior.series_id=NEW.series_id
  ))
BEGIN SELECT RAISE(ABORT,'accounting pack authority is outside its series'); END;

CREATE TRIGGER accounting_pack_artifact_attempt_subject_guard BEFORE INSERT ON accounting_pack_artifact_attempt WHEN
  NOT EXISTS(
    SELECT 1 FROM accounting_pack_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.current_attempt_number=NEW.attempt_number
  ) OR
  NEW.job_id IS NULL OR NEW.job_run_id IS NULL OR NEW.lease_fence IS NULL OR NEW.outcome IS NULL OR NEW.finished_at IS NULL OR
  NOT EXISTS(
    SELECT 1
    FROM accounting_pack_artifact a
    JOIN accounting_pack_revision owner ON owner.revision_id=a.revision_id
    JOIN job j ON j.id=NEW.job_id
    JOIN job_run r ON r.id=NEW.job_run_id AND r.job_id=j.id
    JOIN service_actor s ON s.id=r.service_actor_id
    JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
    WHERE a.artifact_id=NEW.artifact_id
      AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'
      AND j.tenant_id=owner.tenant_id AND j.deployment_id=owner.deployment_id
      AND r.tenant_id=owner.tenant_id AND r.deployment_id=owner.deployment_id
      AND j.kind='accounting_pack_artifact_render' AND r.kind=j.kind
      AND j.required_capability='artifact.accounting_pack.render' AND r.required_capability=j.required_capability
      AND j.fence_version=NEW.lease_fence AND r.fence_version=NEW.lease_fence
      AND j.payload_sha256=r.payload_sha256 AND lower(j.payload_sha256)=lower(ja_finance_hash_v1(j.payload_json))
      AND json_valid(j.payload_json)
      AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id
      AND json_extract(j.payload_json,'$.revisionId')=a.revision_id
      AND json_extract(j.payload_json,'$.format')=a.format
      AND json_extract(j.payload_json,'$.generationVersion')=a.generation_version
      AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.attempt_number
      AND s.status='active' AND s.version=r.service_actor_version
      AND s.capabilities_json=r.service_actor_capabilities_json
      AND b.tenant_id=owner.tenant_id AND b.deployment_id=owner.deployment_id
      AND b.version=r.configured_binding_version
      AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) capability
                 WHERE capability.type='text' AND capability.value=j.required_capability)
      AND ((NEW.outcome='ready' AND j.state='succeeded' AND j.active_job_run_id=r.id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL) OR
           (NEW.outcome='failed' AND r.state IN('failed','lease_expired') AND r.finished_at IS NOT NULL AND
             ((r.outcome='retry_scheduled' AND j.state='queued' AND j.active_job_run_id IS NULL) OR
              (r.outcome='failed_terminal' AND j.state='dead_letter' AND j.active_job_run_id=r.id))))
  ) OR
  (NEW.attempt_number>1 AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_retry_decision d
    JOIN accounting_pack_artifact a ON a.artifact_id=NEW.artifact_id
    WHERE d.decision_id=NEW.retry_decision_id AND d.artifact_id=NEW.artifact_id
      AND d.owner_revision_id=a.revision_id AND d.format=a.format
      AND d.generation_version=a.generation_version
      AND d.prior_attempt_number=NEW.attempt_number-1 AND d.next_attempt_number=NEW.attempt_number
      AND d.retryable=1 AND d.max_attempts=a.max_attempts
  ))
BEGIN SELECT RAISE(ABORT,'accounting pack artifact attempt is not reserved for its job'); END;
CREATE TRIGGER accounting_pack_retry_subject_guard BEFORE INSERT ON accounting_pack_retry_decision WHEN
  NOT EXISTS(
    SELECT 1 FROM accounting_pack_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.revision_id=NEW.owner_revision_id
      AND a.format=NEW.format AND a.generation_version=NEW.generation_version
      AND a.status='failed' AND a.retryable=1
      AND a.current_attempt_number=NEW.prior_attempt_number
      AND NEW.next_attempt_number=a.current_attempt_number+1
      AND NEW.next_attempt_number<=a.max_attempts AND NEW.max_attempts=a.max_attempts
  )
BEGIN SELECT RAISE(ABORT,'accounting pack retry decision is outside its failed current attempt'); END;

CREATE TRIGGER accounting_pack_integrity_incident_subject_guard BEFORE INSERT ON accounting_pack_integrity_incident WHEN
  NOT EXISTS(
    SELECT 1 FROM accounting_pack_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.revision_id=NEW.owner_revision_id
      AND a.format=NEW.format AND a.generation_version=NEW.generation_version
      AND a.current_attempt_number=NEW.attempt_number
      AND EXISTS(SELECT 1 FROM accounting_pack_artifact_attempt attempt
                 WHERE attempt.artifact_id=a.artifact_id AND attempt.attempt_number=NEW.attempt_number)
  )
BEGIN SELECT RAISE(ABORT,'accounting pack incident is outside its artifact identity'); END;

CREATE TRIGGER accounting_pack_series_insert_guard BEFORE INSERT ON accounting_pack_series WHEN
  (NEW.tail_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_revision r
    WHERE r.revision_id=NEW.tail_revision_id
      AND r.series_id=NEW.series_id
      AND r.tenant_id=NEW.tenant_id
      AND r.deployment_id=NEW.deployment_id
      AND r.legal_entity_revision_id=NEW.legal_entity_revision_id
      AND r.currency=NEW.currency
      AND r.timezone=NEW.timezone
      AND r.period_start=NEW.period_start
      AND r.period_end=NEW.period_end
      AND NOT EXISTS(
        SELECT 1 FROM accounting_pack_revision child
        WHERE child.series_id=r.series_id AND child.predecessor_revision_id=r.revision_id
      )
  )) OR
  (NEW.tail_revision_id IS NULL AND NEW.current_authority_event_id IS NOT NULL) OR
  (NEW.current_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1
    FROM accounting_pack_authority_event a
    JOIN accounting_pack_revision r ON r.revision_id=a.revision_id
    JOIN accounting_pack_revision tail ON tail.revision_id=NEW.tail_revision_id
    WHERE a.authority_event_id=NEW.current_authority_event_id
      AND a.series_id=NEW.series_id
      AND r.series_id=NEW.series_id
      AND r.tenant_id=NEW.tenant_id
      AND r.deployment_id=NEW.deployment_id
      AND r.legal_entity_revision_id=NEW.legal_entity_revision_id
      AND r.currency=NEW.currency
      AND r.timezone=NEW.timezone
      AND r.period_start=NEW.period_start
      AND r.period_end=NEW.period_end
      AND tail.series_id=NEW.series_id
      AND tail.revision_number>=r.revision_number
      AND NOT EXISTS(
        SELECT 1 FROM accounting_pack_authority_event child
        WHERE child.series_id=a.series_id AND child.prior_authority_event_id=a.authority_event_id
      )
  ))
BEGIN SELECT RAISE(ABORT,'accounting pack series pointers are not a coherent existing subject'); END;

CREATE TRIGGER accounting_pack_series_no_delete BEFORE DELETE ON accounting_pack_series
BEGIN SELECT RAISE(ABORT,'accounting pack series immutable'); END;
CREATE TRIGGER accounting_pack_series_update_guard BEFORE UPDATE ON accounting_pack_series WHEN
  NEW.series_id<>OLD.series_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.legal_entity_revision_id<>OLD.legal_entity_revision_id OR NEW.currency<>OLD.currency OR NEW.timezone<>OLD.timezone OR NEW.period_start<>OLD.period_start OR NEW.period_end<>OLD.period_end OR
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT(NEW.tail_revision_id IS NOT NULL AND (OLD.tail_revision_id IS NULL OR NEW.tail_revision_id<>OLD.tail_revision_id))) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT(NEW.current_authority_event_id IS NOT NULL AND (OLD.current_authority_event_id IS NULL OR NEW.current_authority_event_id<>OLD.current_authority_event_id)))
BEGIN SELECT RAISE(ABORT,'invalid accounting pack series update'); END;
CREATE TRIGGER accounting_pack_series_pointer_guard BEFORE UPDATE ON accounting_pack_series WHEN
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_revision r
    WHERE r.revision_id=NEW.tail_revision_id AND r.series_id=NEW.series_id
      AND ((OLD.tail_revision_id IS NULL AND r.predecessor_revision_id IS NULL AND r.revision_number=1) OR
           (OLD.tail_revision_id IS NOT NULL AND r.predecessor_revision_id=OLD.tail_revision_id))
  )) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT EXISTS(
    SELECT 1 FROM accounting_pack_authority_event a
    WHERE a.authority_event_id=NEW.current_authority_event_id AND a.series_id=NEW.series_id
      AND ((OLD.current_authority_event_id IS NULL AND a.prior_authority_event_id IS NULL) OR
           (OLD.current_authority_event_id IS NOT NULL AND a.prior_authority_event_id=OLD.current_authority_event_id))
  ))
BEGIN SELECT RAISE(ABORT,'accounting pack series pointer is not a compare-and-set append'); END;

CREATE TRIGGER accounting_pack_revision_no_update BEFORE UPDATE ON accounting_pack_revision
BEGIN SELECT RAISE(ABORT,'accounting pack revision immutable'); END;
CREATE TRIGGER accounting_pack_revision_no_delete BEFORE DELETE ON accounting_pack_revision
BEGIN SELECT RAISE(ABORT,'accounting pack revision immutable'); END;
CREATE TRIGGER accounting_pack_authority_no_update BEFORE UPDATE ON accounting_pack_authority_event
BEGIN SELECT RAISE(ABORT,'accounting pack authority immutable'); END;
CREATE TRIGGER accounting_pack_authority_no_delete BEFORE DELETE ON accounting_pack_authority_event
BEGIN SELECT RAISE(ABORT,'accounting pack authority immutable'); END;
CREATE TRIGGER accounting_pack_cut_batch_no_update BEFORE UPDATE ON accounting_pack_source_cut_batch
BEGIN SELECT RAISE(ABORT,'accounting pack cut immutable'); END;
CREATE TRIGGER accounting_pack_cut_batch_no_delete BEFORE DELETE ON accounting_pack_source_cut_batch
BEGIN SELECT RAISE(ABORT,'accounting pack cut immutable'); END;
CREATE TRIGGER accounting_pack_cut_item_no_update BEFORE UPDATE ON accounting_pack_source_cut_item
BEGIN SELECT RAISE(ABORT,'accounting pack cut item immutable'); END;
CREATE TRIGGER accounting_pack_cut_item_no_delete BEFORE DELETE ON accounting_pack_source_cut_item
BEGIN SELECT RAISE(ABORT,'accounting pack cut item immutable'); END;
CREATE TRIGGER accounting_pack_line_no_update BEFORE UPDATE ON accounting_pack_reconciliation_line
BEGIN SELECT RAISE(ABORT,'accounting pack reconciliation immutable'); END;
CREATE TRIGGER accounting_pack_line_no_delete BEFORE DELETE ON accounting_pack_reconciliation_line
BEGIN SELECT RAISE(ABORT,'accounting pack reconciliation immutable'); END;
CREATE TRIGGER accounting_pack_retry_no_update BEFORE UPDATE ON accounting_pack_retry_decision
BEGIN SELECT RAISE(ABORT,'accounting pack retry immutable'); END;
CREATE TRIGGER accounting_pack_retry_no_delete BEFORE DELETE ON accounting_pack_retry_decision
BEGIN SELECT RAISE(ABORT,'accounting pack retry immutable'); END;
CREATE TRIGGER accounting_pack_attempt_no_update BEFORE UPDATE ON accounting_pack_artifact_attempt
BEGIN SELECT RAISE(ABORT,'accounting pack attempt immutable'); END;
CREATE TRIGGER accounting_pack_attempt_no_delete BEFORE DELETE ON accounting_pack_artifact_attempt
BEGIN SELECT RAISE(ABORT,'accounting pack attempt immutable'); END;
CREATE TRIGGER accounting_pack_incident_no_update BEFORE UPDATE ON accounting_pack_integrity_incident
BEGIN SELECT RAISE(ABORT,'accounting pack incident immutable'); END;
CREATE TRIGGER accounting_pack_incident_no_delete BEFORE DELETE ON accounting_pack_integrity_incident
BEGIN SELECT RAISE(ABORT,'accounting pack incident immutable'); END;
CREATE TRIGGER accounting_pack_artifact_update_guard BEFORE UPDATE ON accounting_pack_artifact WHEN
  OLD.status='ready' OR NEW.artifact_id<>OLD.artifact_id OR NEW.revision_id<>OLD.revision_id OR NEW.format<>OLD.format OR NEW.generation_version<>OLD.generation_version OR NEW.source_hash<>OLD.source_hash OR NEW.max_attempts<>OLD.max_attempts OR
  NOT((OLD.status='queued' AND NEW.status='running' AND NEW.current_attempt_number=OLD.current_attempt_number) OR
      (OLD.status='running' AND NEW.status IN('ready','failed') AND NEW.current_attempt_number=OLD.current_attempt_number) OR
      (OLD.status='failed' AND NEW.status='queued' AND NEW.current_attempt_number=OLD.current_attempt_number+1))
BEGIN SELECT RAISE(ABORT,'invalid accounting pack artifact transition'); END;
CREATE TRIGGER accounting_pack_artifact_retry_guard BEFORE UPDATE ON accounting_pack_artifact
WHEN OLD.status='failed' AND NEW.status='queued' AND NOT(
  OLD.retryable=1 AND OLD.current_attempt_number<OLD.max_attempts
  AND NEW.current_attempt_number=OLD.current_attempt_number+1
  AND EXISTS(
    SELECT 1 FROM accounting_pack_retry_decision d
    WHERE d.artifact_id=OLD.artifact_id AND d.owner_revision_id=OLD.revision_id
      AND d.format=OLD.format AND d.generation_version=OLD.generation_version
      AND d.prior_attempt_number=OLD.current_attempt_number
      AND d.next_attempt_number=NEW.current_attempt_number
      AND d.retryable=1 AND d.max_attempts=OLD.max_attempts
  )
)
BEGIN SELECT RAISE(ABORT,'accounting pack retry is not the reviewed next attempt'); END;
CREATE TRIGGER accounting_pack_artifact_running_guard BEFORE UPDATE ON accounting_pack_artifact
WHEN OLD.status='queued' AND NEW.status='running' AND NOT EXISTS(
  SELECT 1 FROM job j
  JOIN job_run r ON r.id=j.active_job_run_id AND r.job_id=j.id
  WHERE j.contract_version='b5-v1' AND r.contract_version='b5-v1'
    AND j.state='claimed' AND r.state='running' AND j.active_job_run_id=r.id
    AND j.fence_version=r.fence_version
    AND j.kind='accounting_pack_artifact_render' AND r.kind=j.kind
    AND j.required_capability='artifact.accounting_pack.render' AND r.required_capability=j.required_capability
    AND json_extract(j.payload_json,'$.artifactId')=OLD.artifact_id
    AND json_extract(j.payload_json,'$.revisionId')=OLD.revision_id
    AND json_extract(j.payload_json,'$.format')=OLD.format
    AND json_extract(j.payload_json,'$.generationVersion')=OLD.generation_version
    AND json_extract(j.payload_json,'$.requestedAttempt')=OLD.current_attempt_number
    AND j.payload_sha256=r.payload_sha256 AND lower(j.payload_sha256)=lower(ja_finance_hash_v1(j.payload_json))
    AND EXISTS(SELECT 1 FROM accounting_pack_revision owner
               WHERE owner.revision_id=OLD.revision_id
                 AND owner.tenant_id=j.tenant_id AND owner.deployment_id=j.deployment_id
                 AND owner.tenant_id=r.tenant_id AND owner.deployment_id=r.deployment_id)
    AND EXISTS(SELECT 1 FROM service_actor s
               JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
               WHERE s.id=r.service_actor_id AND s.status='active'
                 AND s.version=r.service_actor_version AND s.capabilities_json=r.service_actor_capabilities_json
                 AND b.tenant_id=j.tenant_id AND b.deployment_id=j.deployment_id
                 AND b.version=r.configured_binding_version
                 AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c
                            WHERE c.type='text' AND c.value=j.required_capability))
)
BEGIN SELECT RAISE(ABORT,'accounting pack running transition lacks the current fenced attempt'); END;
CREATE TRIGGER accounting_pack_artifact_ready_insert_guard BEFORE INSERT ON accounting_pack_artifact WHEN NEW.status='ready' AND NOT (
  NEW.source_hash IS NOT NULL AND length(NEW.source_hash)=64 AND NEW.source_hash NOT GLOB '*[^0-9a-f]*' AND NEW.content_sha256 IS NOT NULL AND length(NEW.content_sha256)=64 AND NEW.content_sha256 NOT GLOB '*[^0-9a-f]*' AND NEW.storage_key IS NOT NULL AND length(NEW.storage_key)>0 AND
  NEW.media_type IS NOT NULL AND length(NEW.media_type)>0 AND NEW.byte_length IS NOT NULL AND NEW.byte_length>0 AND NEW.renderer_version IS NOT NULL AND
  length(NEW.renderer_version)>0 AND NEW.ready_at IS NOT NULL AND NEW.error_code IS NULL AND EXISTS(
    SELECT 1 FROM accounting_pack_artifact_attempt a
    JOIN job_run r ON r.id=a.job_run_id
    JOIN job j ON j.id=a.job_id
    WHERE a.artifact_id=NEW.artifact_id AND a.attempt_number=NEW.current_attempt_number AND a.outcome='ready' AND a.finished_at IS NOT NULL
      AND a.job_id IS NOT NULL AND a.job_run_id IS NOT NULL AND a.lease_fence IS NOT NULL
      AND r.contract_version='b5-v1' AND r.job_id=a.job_id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL
      AND r.fence_version=a.lease_fence AND j.contract_version='b5-v1' AND j.state='succeeded'
      AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version AND j.lease_until IS NULL
      AND j.kind='accounting_pack_artifact_render' AND j.required_capability='artifact.accounting_pack.render'
      AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id
      AND json_extract(j.payload_json,'$.revisionId')=NEW.revision_id
      AND json_extract(j.payload_json,'$.format')=NEW.format
      AND json_extract(j.payload_json,'$.generationVersion')=NEW.generation_version
      AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number
  )
)
BEGIN SELECT RAISE(ABORT,'ready accounting artifact lacks a valid fenced attempt'); END;
CREATE TRIGGER accounting_pack_artifact_ready_update_guard BEFORE UPDATE ON accounting_pack_artifact WHEN NEW.status='ready' AND NOT (
  NEW.source_hash IS NOT NULL AND length(NEW.source_hash)=64 AND NEW.source_hash NOT GLOB '*[^0-9a-f]*' AND NEW.content_sha256 IS NOT NULL AND length(NEW.content_sha256)=64 AND NEW.content_sha256 NOT GLOB '*[^0-9a-f]*' AND NEW.storage_key IS NOT NULL AND length(NEW.storage_key)>0 AND
  NEW.media_type IS NOT NULL AND length(NEW.media_type)>0 AND NEW.byte_length IS NOT NULL AND NEW.byte_length>0 AND NEW.renderer_version IS NOT NULL AND
  length(NEW.renderer_version)>0 AND NEW.ready_at IS NOT NULL AND NEW.error_code IS NULL AND EXISTS(
    SELECT 1 FROM accounting_pack_artifact_attempt a
    JOIN job_run r ON r.id=a.job_run_id
    JOIN job j ON j.id=a.job_id
    WHERE a.artifact_id=NEW.artifact_id AND a.attempt_number=NEW.current_attempt_number AND a.outcome='ready' AND a.finished_at IS NOT NULL
      AND a.job_id IS NOT NULL AND a.job_run_id IS NOT NULL AND a.lease_fence IS NOT NULL
      AND r.contract_version='b5-v1' AND r.job_id=a.job_id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL
      AND r.fence_version=a.lease_fence AND j.contract_version='b5-v1' AND j.state='succeeded'
      AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version AND j.lease_until IS NULL
      AND j.kind='accounting_pack_artifact_render' AND j.required_capability='artifact.accounting_pack.render'
      AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id
      AND json_extract(j.payload_json,'$.revisionId')=NEW.revision_id
      AND json_extract(j.payload_json,'$.format')=NEW.format
      AND json_extract(j.payload_json,'$.generationVersion')=NEW.generation_version
      AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number
  )
)
BEGIN SELECT RAISE(ABORT,'ready accounting artifact lacks a valid fenced attempt'); END;
CREATE TRIGGER accounting_pack_artifact_no_delete BEFORE DELETE ON accounting_pack_artifact
BEGIN SELECT RAISE(ABORT,'accounting pack artifact immutable'); END;

CREATE INDEX accounting_pack_revision_series_idx ON accounting_pack_revision(series_id,revision_number);
CREATE INDEX accounting_pack_artifact_status_idx ON accounting_pack_artifact(revision_id,status,format);
