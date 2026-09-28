-- B4 report registry, source manifests, immutable revisions and artifacts.
-- Static SQL only; the migration runner appends migration 22 metadata/version.

CREATE TABLE report_definition(
  definition_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  authorization_contract TEXT NOT NULL,
  filter_contract_hash TEXT NOT NULL,
  query_version TEXT NOT NULL,
  column_schema_hash TEXT NOT NULL,
  semantic_filename_token TEXT NOT NULL,
  snapshot_mode TEXT NOT NULL CHECK(snapshot_mode IN('source_cut','query_snapshot')),
  created_at TEXT NOT NULL,
  UNIQUE(family_id,definition_id)
) STRICT;
CREATE TABLE report_template_version(
  template_version_id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number>0),
  renderer_contract_hash TEXT NOT NULL,
  template_hash TEXT NOT NULL,
  required_formats TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(definition_id,version_number)
) STRICT;
CREATE TABLE report_template_authority_event(
  authority_event_id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  template_version_id TEXT NOT NULL REFERENCES report_template_version(template_version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_authority_event_id TEXT REFERENCES report_template_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN('activate','supersede')),
  effective_at TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(definition_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX report_template_authority_genesis ON report_template_authority_event(definition_id) WHERE prior_authority_event_id IS NULL;

CREATE TABLE period_report_series(
  series_id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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
  UNIQUE(definition_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE report_source_manifest(
  manifest_id TEXT PRIMARY KEY,
  report_revision_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  timezone TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  change_sequence_high_watermark INTEGER NOT NULL CHECK(change_sequence_high_watermark>=0),
  manifest_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE report_source_manifest_item(
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL REFERENCES report_source_manifest(manifest_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  section_id TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL CHECK(item_version>0),
  effective_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT CHECK(currency IS NULL OR length(currency)=3),
  item_hash TEXT NOT NULL UNIQUE,
  UNIQUE(manifest_id,section_id,item_kind,item_id,item_version),
  FOREIGN KEY(evidence_id,evidence_hash,evidence_type) REFERENCES finance_hash_evidence(evidence_id,evidence_hash,evidence_type) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE period_report_revision(
  revision_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES period_report_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  template_version_id TEXT NOT NULL REFERENCES report_template_version(template_version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number>0),
  predecessor_revision_id TEXT REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  timezone TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_manifest_id TEXT NOT NULL REFERENCES report_source_manifest(manifest_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('candidate','failed')),
  missing_activity_count INTEGER NOT NULL CHECK(missing_activity_count>=0),
  blocker_count INTEGER NOT NULL CHECK(blocker_count>=0),
  revision_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE(series_id,revision_number),
  UNIQUE(series_id,predecessor_revision_id),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX period_report_one_genesis ON period_report_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE period_report_authority_event(
  authority_event_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES period_report_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_authority_event_id TEXT REFERENCES period_report_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN('finalize','supersede')),
  effective_at TEXT NOT NULL,
  reason TEXT,
  principal_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX period_report_authority_genesis ON period_report_authority_event(series_id) WHERE prior_authority_event_id IS NULL;

CREATE TABLE period_report_artifact(
  artifact_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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
CREATE TABLE period_report_retry_decision(
  decision_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES period_report_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_revision_id TEXT NOT NULL REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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
CREATE TABLE period_report_artifact_attempt(
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES period_report_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
  job_id TEXT REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  job_run_id TEXT REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  manual_command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  retry_decision_id TEXT REFERENCES period_report_retry_decision(decision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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
CREATE TABLE period_report_integrity_incident(
  incident_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES period_report_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_revision_id TEXT NOT NULL REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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

CREATE TRIGGER report_revision_subject_guard BEFORE INSERT ON period_report_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM period_report_revision prior
    WHERE prior.revision_id=NEW.predecessor_revision_id
      AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  )) OR
  NOT EXISTS(
    SELECT 1 FROM period_report_series s
    WHERE s.series_id=NEW.series_id
      AND s.definition_id=NEW.definition_id
      AND s.tenant_id=NEW.tenant_id
      AND s.deployment_id=NEW.deployment_id
      AND s.legal_entity_revision_id=NEW.legal_entity_revision_id
      AND s.currency=NEW.currency
      AND s.timezone=NEW.timezone
      AND s.period_start=NEW.period_start
      AND s.period_end=NEW.period_end
  )
BEGIN SELECT RAISE(ABORT,'report revision is outside its series'); END;
CREATE TRIGGER report_authority_subject_guard BEFORE INSERT ON period_report_authority_event WHEN
  NOT EXISTS(
    SELECT 1 FROM period_report_revision r
    WHERE r.revision_id=NEW.revision_id AND r.series_id=NEW.series_id
  ) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM period_report_authority_event prior
    WHERE prior.authority_event_id=NEW.prior_authority_event_id AND prior.series_id=NEW.series_id
  ))
BEGIN SELECT RAISE(ABORT,'report authority is outside its series'); END;

CREATE TRIGGER report_template_authority_subject_guard BEFORE INSERT ON report_template_authority_event WHEN
  NOT EXISTS(
    SELECT 1 FROM report_template_version v
    WHERE v.template_version_id=NEW.template_version_id AND v.definition_id=NEW.definition_id
  ) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM report_template_authority_event prior
    WHERE prior.authority_event_id=NEW.prior_authority_event_id AND prior.definition_id=NEW.definition_id
  )) OR
  (NEW.prior_authority_event_id IS NULL AND (
    NEW.event_type<>'activate' OR NOT EXISTS(
      SELECT 1 FROM report_template_version v
      WHERE v.template_version_id=NEW.template_version_id AND v.version_number=1
    )
  )) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1
    FROM report_template_authority_event prior
    JOIN report_template_version previous_version ON previous_version.template_version_id=prior.template_version_id
    JOIN report_template_version next_version ON next_version.template_version_id=NEW.template_version_id
    WHERE prior.authority_event_id=NEW.prior_authority_event_id
      AND next_version.definition_id=NEW.definition_id
      AND next_version.version_number=previous_version.version_number+1
  ))
BEGIN SELECT RAISE(ABORT,'report template authority definition/version mismatch'); END;
CREATE TRIGGER report_template_formats_guard BEFORE INSERT ON report_template_version WHEN
  NOT(json_valid(NEW.required_formats) AND json_type(NEW.required_formats)='array') OR
  (SELECT count(*) FROM json_each(NEW.required_formats))=0 OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.required_formats) f
    WHERE f.type<>'text' OR f.value NOT IN('pdf','xlsx','invoice_csv','expense_csv','json')
  ) OR
  (SELECT count(*) FROM json_each(NEW.required_formats))<>
    (SELECT count(DISTINCT f.value) FROM json_each(NEW.required_formats) f)
BEGIN SELECT RAISE(ABORT,'invalid report template formats'); END;
CREATE TRIGGER report_revision_template_guard BEFORE INSERT ON period_report_revision WHEN
  NOT EXISTS(
    SELECT 1 FROM report_template_version v
    WHERE v.template_version_id=NEW.template_version_id AND v.definition_id=NEW.definition_id
  )
BEGIN SELECT RAISE(ABORT,'report revision template is outside its definition'); END;

CREATE TRIGGER report_definition_no_update BEFORE UPDATE ON report_definition
BEGIN SELECT RAISE(ABORT,'report definition immutable'); END;
CREATE TRIGGER report_definition_no_delete BEFORE DELETE ON report_definition
BEGIN SELECT RAISE(ABORT,'report definition immutable'); END;
CREATE TRIGGER report_template_no_update BEFORE UPDATE ON report_template_version
BEGIN SELECT RAISE(ABORT,'report template immutable'); END;
CREATE TRIGGER report_template_no_delete BEFORE DELETE ON report_template_version
BEGIN SELECT RAISE(ABORT,'report template immutable'); END;
CREATE TRIGGER report_template_authority_no_update BEFORE UPDATE ON report_template_authority_event
BEGIN SELECT RAISE(ABORT,'report template authority immutable'); END;
CREATE TRIGGER report_template_authority_no_delete BEFORE DELETE ON report_template_authority_event
BEGIN SELECT RAISE(ABORT,'report template authority immutable'); END;
CREATE TRIGGER report_series_no_delete BEFORE DELETE ON period_report_series
BEGIN SELECT RAISE(ABORT,'report series immutable'); END;
CREATE TRIGGER report_series_update_guard BEFORE UPDATE ON period_report_series WHEN
  NEW.series_id<>OLD.series_id OR NEW.definition_id<>OLD.definition_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.legal_entity_revision_id<>OLD.legal_entity_revision_id OR NEW.currency<>OLD.currency OR NEW.timezone<>OLD.timezone OR
  NEW.period_start<>OLD.period_start OR NEW.period_end<>OLD.period_end OR
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT(NEW.tail_revision_id IS NOT NULL AND (OLD.tail_revision_id IS NULL OR NEW.tail_revision_id<>OLD.tail_revision_id))) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT(NEW.current_authority_event_id IS NOT NULL AND (OLD.current_authority_event_id IS NULL OR NEW.current_authority_event_id<>OLD.current_authority_event_id)))
BEGIN SELECT RAISE(ABORT,'invalid report series update'); END;
CREATE TRIGGER report_revision_no_update BEFORE UPDATE ON period_report_revision
BEGIN SELECT RAISE(ABORT,'report revision immutable'); END;
CREATE TRIGGER report_revision_no_delete BEFORE DELETE ON period_report_revision
BEGIN SELECT RAISE(ABORT,'report revision immutable'); END;
CREATE TRIGGER report_manifest_no_update BEFORE UPDATE ON report_source_manifest
BEGIN SELECT RAISE(ABORT,'report manifest immutable'); END;
CREATE TRIGGER report_manifest_no_delete BEFORE DELETE ON report_source_manifest
BEGIN SELECT RAISE(ABORT,'report manifest immutable'); END;
CREATE TRIGGER report_manifest_item_no_update BEFORE UPDATE ON report_source_manifest_item
BEGIN SELECT RAISE(ABORT,'report manifest item immutable'); END;
CREATE TRIGGER report_manifest_item_no_delete BEFORE DELETE ON report_source_manifest_item
BEGIN SELECT RAISE(ABORT,'report manifest item immutable'); END;
CREATE TRIGGER report_authority_no_update BEFORE UPDATE ON period_report_authority_event
BEGIN SELECT RAISE(ABORT,'report authority immutable'); END;
CREATE TRIGGER report_authority_no_delete BEFORE DELETE ON period_report_authority_event
BEGIN SELECT RAISE(ABORT,'report authority immutable'); END;
CREATE TRIGGER report_retry_no_update BEFORE UPDATE ON period_report_retry_decision
BEGIN SELECT RAISE(ABORT,'report retry immutable'); END;
CREATE TRIGGER report_retry_no_delete BEFORE DELETE ON period_report_retry_decision
BEGIN SELECT RAISE(ABORT,'report retry immutable'); END;
CREATE TRIGGER report_attempt_no_update BEFORE UPDATE ON period_report_artifact_attempt
BEGIN SELECT RAISE(ABORT,'report attempt immutable'); END;
CREATE TRIGGER report_attempt_no_delete BEFORE DELETE ON period_report_artifact_attempt
BEGIN SELECT RAISE(ABORT,'report attempt immutable'); END;
CREATE TRIGGER report_incident_no_update BEFORE UPDATE ON period_report_integrity_incident
BEGIN SELECT RAISE(ABORT,'report incident immutable'); END;
CREATE TRIGGER report_incident_no_delete BEFORE DELETE ON period_report_integrity_incident
BEGIN SELECT RAISE(ABORT,'report incident immutable'); END;

CREATE TRIGGER report_series_insert_guard BEFORE INSERT ON period_report_series WHEN
  (NEW.tail_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM period_report_revision r
    WHERE r.revision_id=NEW.tail_revision_id
      AND r.series_id=NEW.series_id
      AND r.definition_id=NEW.definition_id
      AND r.tenant_id=NEW.tenant_id
      AND r.deployment_id=NEW.deployment_id
      AND r.legal_entity_revision_id=NEW.legal_entity_revision_id
      AND r.currency=NEW.currency
      AND r.timezone=NEW.timezone
      AND r.period_start=NEW.period_start
      AND r.period_end=NEW.period_end
      AND NOT EXISTS(
        SELECT 1 FROM period_report_revision child
        WHERE child.series_id=r.series_id AND child.predecessor_revision_id=r.revision_id
      )
  )) OR
  (NEW.tail_revision_id IS NULL AND NEW.current_authority_event_id IS NOT NULL) OR
  (NEW.current_authority_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1
    FROM period_report_authority_event a
    JOIN period_report_revision r ON r.revision_id=a.revision_id
    JOIN period_report_revision tail ON tail.revision_id=NEW.tail_revision_id
    WHERE a.authority_event_id=NEW.current_authority_event_id
      AND a.series_id=NEW.series_id
      AND r.series_id=NEW.series_id
      AND r.definition_id=NEW.definition_id
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
        SELECT 1 FROM period_report_authority_event child
        WHERE child.series_id=a.series_id AND child.prior_authority_event_id=a.authority_event_id
      )
  ))
BEGIN SELECT RAISE(ABORT,'report series pointers are not a coherent existing subject'); END;

CREATE TRIGGER report_artifact_update_guard BEFORE UPDATE ON period_report_artifact WHEN
  OLD.status='ready' OR NEW.artifact_id<>OLD.artifact_id OR NEW.revision_id<>OLD.revision_id OR NEW.format<>OLD.format OR NEW.generation_version<>OLD.generation_version OR NEW.source_hash<>OLD.source_hash OR NEW.max_attempts<>OLD.max_attempts OR
  NOT((OLD.status='queued' AND NEW.status='running' AND NEW.current_attempt_number=OLD.current_attempt_number) OR
      (OLD.status='running' AND NEW.status IN('ready','failed') AND NEW.current_attempt_number=OLD.current_attempt_number) OR
      (OLD.status='failed' AND NEW.status='queued' AND NEW.current_attempt_number=OLD.current_attempt_number+1))
BEGIN SELECT RAISE(ABORT,'invalid report artifact transition'); END;
CREATE TRIGGER report_artifact_retry_guard BEFORE UPDATE ON period_report_artifact
WHEN OLD.status='failed' AND NEW.status='queued' AND NOT(
  OLD.retryable=1 AND OLD.current_attempt_number<OLD.max_attempts
  AND NEW.current_attempt_number=OLD.current_attempt_number+1
  AND EXISTS(
    SELECT 1 FROM period_report_retry_decision d
    WHERE d.artifact_id=OLD.artifact_id AND d.owner_revision_id=OLD.revision_id
      AND d.format=OLD.format AND d.generation_version=OLD.generation_version
      AND d.prior_attempt_number=OLD.current_attempt_number
      AND d.next_attempt_number=NEW.current_attempt_number
      AND d.retryable=1 AND d.max_attempts=OLD.max_attempts
  )
)
BEGIN SELECT RAISE(ABORT,'report retry is not the reviewed next attempt'); END;
CREATE TRIGGER report_artifact_running_guard BEFORE UPDATE ON period_report_artifact
WHEN OLD.status='queued' AND NEW.status='running' AND NOT EXISTS(
  SELECT 1 FROM job j
  JOIN job_run r ON r.id=j.active_job_run_id AND r.job_id=j.id
  WHERE j.contract_version='b5-v1' AND r.contract_version='b5-v1'
    AND j.state='claimed' AND r.state='running' AND j.active_job_run_id=r.id
    AND j.fence_version=r.fence_version
    AND j.kind='period_close_report' AND r.kind=j.kind
    AND j.required_capability='artifact.report.render' AND r.required_capability=j.required_capability
    AND json_extract(j.payload_json,'$.artifactId')=OLD.artifact_id
    AND json_extract(j.payload_json,'$.revisionId')=OLD.revision_id
    AND json_extract(j.payload_json,'$.format')=OLD.format
    AND json_extract(j.payload_json,'$.generationVersion')=OLD.generation_version
    AND json_extract(j.payload_json,'$.requestedAttempt')=OLD.current_attempt_number
    AND j.payload_sha256=r.payload_sha256 AND lower(j.payload_sha256)=lower(ja_finance_hash_v1(j.payload_json))
    AND EXISTS(SELECT 1 FROM period_report_revision owner
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
BEGIN SELECT RAISE(ABORT,'report running transition lacks the current fenced attempt'); END;
CREATE TRIGGER report_series_pointer_guard BEFORE UPDATE ON period_report_series WHEN
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT EXISTS(
    SELECT 1 FROM period_report_revision r
    WHERE r.revision_id=NEW.tail_revision_id AND r.series_id=NEW.series_id
      AND ((OLD.tail_revision_id IS NULL AND r.predecessor_revision_id IS NULL AND r.revision_number=1) OR
           (OLD.tail_revision_id IS NOT NULL AND r.predecessor_revision_id=OLD.tail_revision_id))
  )) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT EXISTS(
    SELECT 1 FROM period_report_authority_event a
    WHERE a.authority_event_id=NEW.current_authority_event_id AND a.series_id=NEW.series_id
      AND ((OLD.current_authority_event_id IS NULL AND a.prior_authority_event_id IS NULL) OR
           (OLD.current_authority_event_id IS NOT NULL AND a.prior_authority_event_id=OLD.current_authority_event_id))
  ))
BEGIN SELECT RAISE(ABORT,'report series pointer is not a compare-and-set append'); END;
CREATE TRIGGER report_artifact_attempt_subject_guard BEFORE INSERT ON period_report_artifact_attempt WHEN
  NOT EXISTS(
    SELECT 1 FROM period_report_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.current_attempt_number=NEW.attempt_number
  ) OR
  NEW.job_id IS NULL OR NEW.job_run_id IS NULL OR NEW.lease_fence IS NULL OR NEW.outcome IS NULL OR NEW.finished_at IS NULL OR
  NOT EXISTS(
    SELECT 1
    FROM period_report_artifact a
    JOIN period_report_revision owner ON owner.revision_id=a.revision_id
    JOIN job j ON j.id=NEW.job_id
    JOIN job_run r ON r.id=NEW.job_run_id AND r.job_id=j.id
    JOIN service_actor s ON s.id=r.service_actor_id
    JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
    WHERE a.artifact_id=NEW.artifact_id
      AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'
      AND j.tenant_id=owner.tenant_id AND j.deployment_id=owner.deployment_id
      AND r.tenant_id=owner.tenant_id AND r.deployment_id=owner.deployment_id
      AND j.kind='period_close_report' AND r.kind=j.kind
      AND j.required_capability='artifact.report.render' AND r.required_capability=j.required_capability
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
    SELECT 1 FROM period_report_retry_decision d
    JOIN period_report_artifact a ON a.artifact_id=NEW.artifact_id
    WHERE d.decision_id=NEW.retry_decision_id AND d.artifact_id=NEW.artifact_id
      AND d.owner_revision_id=a.revision_id AND d.format=a.format
      AND d.generation_version=a.generation_version
      AND d.prior_attempt_number=NEW.attempt_number-1 AND d.next_attempt_number=NEW.attempt_number
      AND d.retryable=1 AND d.max_attempts=a.max_attempts
  ))
BEGIN SELECT RAISE(ABORT,'report artifact attempt is not reserved for its job'); END;
CREATE TRIGGER report_retry_subject_guard BEFORE INSERT ON period_report_retry_decision WHEN
  NOT EXISTS(
    SELECT 1 FROM period_report_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.revision_id=NEW.owner_revision_id
      AND a.format=NEW.format AND a.generation_version=NEW.generation_version
      AND a.status='failed' AND a.retryable=1
      AND a.current_attempt_number=NEW.prior_attempt_number
      AND NEW.next_attempt_number=a.current_attempt_number+1
      AND NEW.next_attempt_number<=a.max_attempts AND NEW.max_attempts=a.max_attempts
  )
BEGIN SELECT RAISE(ABORT,'report retry decision is outside its failed current attempt'); END;
CREATE TRIGGER report_integrity_incident_subject_guard BEFORE INSERT ON period_report_integrity_incident WHEN
  NOT EXISTS(
    SELECT 1 FROM period_report_artifact a
    WHERE a.artifact_id=NEW.artifact_id AND a.revision_id=NEW.owner_revision_id
      AND a.format=NEW.format AND a.generation_version=NEW.generation_version
      AND a.current_attempt_number=NEW.attempt_number
      AND EXISTS(SELECT 1 FROM period_report_artifact_attempt attempt
                 WHERE attempt.artifact_id=a.artifact_id AND attempt.attempt_number=NEW.attempt_number)
  )
BEGIN SELECT RAISE(ABORT,'report incident is outside its artifact identity'); END;
CREATE TRIGGER report_artifact_ready_insert_guard BEFORE INSERT ON period_report_artifact WHEN NEW.status='ready' AND NOT (
  NEW.source_hash IS NOT NULL AND length(NEW.source_hash)=64 AND NEW.source_hash NOT GLOB '*[^0-9a-f]*' AND NEW.content_sha256 IS NOT NULL AND length(NEW.content_sha256)=64 AND NEW.content_sha256 NOT GLOB '*[^0-9a-f]*' AND NEW.storage_key IS NOT NULL AND length(NEW.storage_key)>0 AND
  NEW.media_type IS NOT NULL AND length(NEW.media_type)>0 AND NEW.byte_length IS NOT NULL AND NEW.byte_length>0 AND NEW.renderer_version IS NOT NULL AND
  length(NEW.renderer_version)>0 AND NEW.ready_at IS NOT NULL AND NEW.error_code IS NULL AND EXISTS(
    SELECT 1 FROM period_report_revision rr
    JOIN report_template_version tv ON tv.template_version_id=rr.template_version_id AND tv.definition_id=rr.definition_id
    JOIN json_each(tv.required_formats) required_format ON required_format.value=NEW.format
    WHERE rr.revision_id=NEW.revision_id
  ) AND EXISTS(
    SELECT 1 FROM period_report_artifact_attempt a
    JOIN job_run r ON r.id=a.job_run_id
    JOIN job j ON j.id=a.job_id
    WHERE a.artifact_id=NEW.artifact_id AND a.attempt_number=NEW.current_attempt_number AND a.outcome='ready' AND a.finished_at IS NOT NULL
      AND a.job_id IS NOT NULL AND a.job_run_id IS NOT NULL AND a.lease_fence IS NOT NULL
      AND r.contract_version='b5-v1' AND r.job_id=a.job_id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL
      AND r.fence_version=a.lease_fence AND j.contract_version='b5-v1' AND j.state='succeeded'
      AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version AND j.lease_until IS NULL
      AND j.kind='period_close_report' AND j.required_capability='artifact.report.render'
      AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id
      AND json_extract(j.payload_json,'$.revisionId')=NEW.revision_id
      AND json_extract(j.payload_json,'$.format')=NEW.format
      AND json_extract(j.payload_json,'$.generationVersion')=NEW.generation_version
      AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number
  )
)
BEGIN SELECT RAISE(ABORT,'ready report artifact lacks a valid fenced attempt'); END;
CREATE TRIGGER report_artifact_ready_update_guard BEFORE UPDATE ON period_report_artifact WHEN NEW.status='ready' AND NOT (
  NEW.source_hash IS NOT NULL AND length(NEW.source_hash)=64 AND NEW.source_hash NOT GLOB '*[^0-9a-f]*' AND NEW.content_sha256 IS NOT NULL AND length(NEW.content_sha256)=64 AND NEW.content_sha256 NOT GLOB '*[^0-9a-f]*' AND NEW.storage_key IS NOT NULL AND length(NEW.storage_key)>0 AND
  NEW.media_type IS NOT NULL AND length(NEW.media_type)>0 AND NEW.byte_length IS NOT NULL AND NEW.byte_length>0 AND NEW.renderer_version IS NOT NULL AND
  length(NEW.renderer_version)>0 AND NEW.ready_at IS NOT NULL AND NEW.error_code IS NULL AND EXISTS(
    SELECT 1 FROM period_report_revision rr
    JOIN report_template_version tv ON tv.template_version_id=rr.template_version_id AND tv.definition_id=rr.definition_id
    JOIN json_each(tv.required_formats) required_format ON required_format.value=NEW.format
    WHERE rr.revision_id=NEW.revision_id
  ) AND EXISTS(
    SELECT 1 FROM period_report_artifact_attempt a
    JOIN job_run r ON r.id=a.job_run_id
    JOIN job j ON j.id=a.job_id
    WHERE a.artifact_id=NEW.artifact_id AND a.attempt_number=NEW.current_attempt_number AND a.outcome='ready' AND a.finished_at IS NOT NULL
      AND a.job_id IS NOT NULL AND a.job_run_id IS NOT NULL AND a.lease_fence IS NOT NULL
      AND r.contract_version='b5-v1' AND r.job_id=a.job_id AND r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL
      AND r.fence_version=a.lease_fence AND j.contract_version='b5-v1' AND j.state='succeeded'
      AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version AND j.lease_until IS NULL
      AND j.kind='period_close_report' AND j.required_capability='artifact.report.render'
      AND json_extract(j.payload_json,'$.artifactId')=NEW.artifact_id
      AND json_extract(j.payload_json,'$.revisionId')=NEW.revision_id
      AND json_extract(j.payload_json,'$.format')=NEW.format
      AND json_extract(j.payload_json,'$.generationVersion')=NEW.generation_version
      AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number
  )
)
BEGIN SELECT RAISE(ABORT,'ready report artifact lacks a valid fenced attempt'); END;
CREATE TRIGGER report_artifact_no_delete BEFORE DELETE ON period_report_artifact
BEGIN SELECT RAISE(ABORT,'report artifact immutable'); END;

CREATE INDEX report_registry_family_idx ON report_definition(family_id,definition_id);
CREATE INDEX report_series_period_idx ON period_report_series(period_start,period_end,definition_id);
CREATE INDEX report_revision_series_idx ON period_report_revision(series_id,revision_number);
CREATE INDEX report_artifact_status_idx ON period_report_artifact(revision_id,status,format);

-- Legacy finalized period reports remain historical evidence.  New report
-- revisions live in the registry above; this guard prevents accidental edits
-- while allowing legacy drafts to continue through the compatibility facade.
CREATE TRIGGER legacy_period_report_no_update BEFORE UPDATE ON period_report WHEN OLD.state='final'
BEGIN SELECT RAISE(ABORT,'final period report is immutable'); END;
CREATE TRIGGER legacy_period_report_no_delete BEFORE DELETE ON period_report WHEN OLD.state='final'
BEGIN SELECT RAISE(ABORT,'final period report is immutable'); END;
