-- I18N-ARCH-13 immutable localized PDF variant registry.
-- The migration runner appends migration 23 metadata/version.

CREATE TABLE localized_pdf_variant(
  variant_id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN('invoice','period_report_revision','accounting_pack_revision','daily_report','technical_report')),
  owner_id TEXT NOT NULL,
  owner_revision_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN('en','es','pt')),
  locale_tag TEXT NOT NULL CHECK((locale='en' AND locale_tag='en-US') OR (locale='es' AND locale_tag='es-ES') OR (locale='pt' AND locale_tag='pt-BR')),
  document_tag TEXT NOT NULL CHECK(document_tag IN('invoice','period_report','accounting_pack','daily_report','technical_report')),
  template_version TEXT NOT NULL CHECK(length(template_version)>0 AND length(template_version)<=120),
  generation_version TEXT NOT NULL CHECK(length(generation_version)>0 AND length(generation_version)<=120),
  snapshot_json TEXT NOT NULL CHECK(length(snapshot_json)>0),
  snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64 AND snapshot_hash NOT GLOB '*[^0-9a-fA-F]*'),
  snapshot_hash_kind TEXT NOT NULL CHECK(snapshot_hash_kind IN('canonical','legacy_verbatim')),
  status TEXT NOT NULL CHECK(status IN('queued','running','ready','failed')),
  current_attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(current_attempt_number>0),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(attempt_number>0),
  semantic_filename TEXT NOT NULL CHECK(length(semantic_filename)>0 AND length(semantic_filename)<=255 AND semantic_filename NOT LIKE '%/%' AND semantic_filename NOT LIKE '%\\%' AND semantic_filename LIKE '%.pdf'),
  media_type TEXT,
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length>0),
  content_sha256 TEXT CHECK(content_sha256 IS NULL OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-fA-F]*')),
  storage_key TEXT NOT NULL CHECK(length(storage_key)>0 AND storage_key NOT LIKE '/%' AND storage_key NOT LIKE '%\\%' AND storage_key NOT LIKE '%..%' AND storage_key NOT LIKE '%://%' AND instr(storage_key,'%')=0),
  renderer_version TEXT,
  ready_at TEXT,
  error_code TEXT,
  retryable INTEGER CHECK(retryable IS NULL OR retryable IN(0,1)),
  integrity_blocked INTEGER NOT NULL DEFAULT 0 CHECK(integrity_blocked IN(0,1)),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 5),
  request_key TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  claimed_job_id TEXT,
  claimed_job_run_id TEXT,
  claimed_lease_fence INTEGER CHECK(claimed_lease_fence IS NULL OR claimed_lease_fence>0),
  updated_at TEXT NOT NULL,
  CHECK(current_attempt_number=attempt_number),
  CHECK((status='ready' AND media_type='application/pdf' AND byte_length>0 AND content_sha256 IS NOT NULL AND storage_key IS NOT NULL AND renderer_version IS NOT NULL AND ready_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NULL AND integrity_blocked=0) OR status<>'ready'),
  CHECK((status='failed' AND error_code IS NOT NULL AND finished_at IS NOT NULL) OR status<>'failed'),
  CHECK((status IN('queued','running') AND media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND storage_key IS NOT NULL AND renderer_version IS NULL AND ready_at IS NULL) OR status IN('ready','failed')),
  CHECK((status='running' AND claimed_job_id IS NOT NULL AND claimed_job_run_id IS NOT NULL AND claimed_lease_fence IS NOT NULL) OR (status<>'running' AND claimed_job_id IS NULL AND claimed_job_run_id IS NULL AND claimed_lease_fence IS NULL)),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE localized_pdf_variant_attempt(
  attempt_id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES localized_pdf_variant(variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
  job_id TEXT,
  job_run_id TEXT,
  lease_fence INTEGER CHECK(lease_fence IS NULL OR lease_fence>0),
  started_at TEXT,
  finished_at TEXT,
  outcome TEXT CHECK(outcome IN('ready','failed')),
  failure_class TEXT,
  retryable INTEGER CHECK(retryable IS NULL OR retryable IN(0,1)),
  created_at TEXT NOT NULL,
  CHECK((outcome IS NULL AND finished_at IS NULL) OR (outcome IS NOT NULL AND finished_at IS NOT NULL)),
  UNIQUE(variant_id,attempt_number)
) STRICT;

CREATE TABLE localized_pdf_retry_decision(
  decision_id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES localized_pdf_variant(variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  prior_attempt_number INTEGER NOT NULL CHECK(prior_attempt_number>0),
  next_attempt_number INTEGER NOT NULL CHECK(next_attempt_number=prior_attempt_number+1),
  failure_code TEXT NOT NULL CHECK(length(failure_code)>0),
  failure_class TEXT NOT NULL CHECK(length(failure_class)>0),
  retryable INTEGER NOT NULL CHECK(retryable=1),
  requested_by TEXT NOT NULL CHECK(length(requested_by)>0),
  requested_at TEXT NOT NULL,
  decision_hash TEXT NOT NULL CHECK(length(decision_hash)=64 AND decision_hash NOT GLOB '*[^0-9a-fA-F]*'),
  UNIQUE(variant_id,next_attempt_number),
  UNIQUE(decision_hash)
) STRICT;

CREATE TABLE localized_pdf_integrity_incident(
  incident_id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES localized_pdf_variant(variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_type TEXT NOT NULL CHECK(owner_type IN('invoice','period_report_revision','accounting_pack_revision','daily_report','technical_report')),
  owner_id TEXT NOT NULL,
  owner_revision_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN('en','es','pt')),
  template_version TEXT NOT NULL,
  generation_version TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
  incident_kind TEXT NOT NULL CHECK(length(incident_kind)>0),
  expected_hash TEXT CHECK(expected_hash IS NULL OR (length(expected_hash)=64 AND expected_hash NOT GLOB '*[^0-9a-fA-F]*')),
  observed_hash TEXT CHECK(observed_hash IS NULL OR (length(observed_hash)=64 AND observed_hash NOT GLOB '*[^0-9a-fA-F]*')),
  expected_length INTEGER CHECK(expected_length IS NULL OR expected_length>0),
  observed_length INTEGER CHECK(observed_length IS NULL OR observed_length>0),
  storage_key TEXT,
  detected_at TEXT NOT NULL,
  detected_by TEXT NOT NULL,
  incident_hash TEXT NOT NULL CHECK(length(incident_hash)=64 AND incident_hash NOT GLOB '*[^0-9a-fA-F]*'),
  UNIQUE(incident_hash)
) STRICT;

CREATE UNIQUE INDEX localized_pdf_variant_active_identity_uq
  ON localized_pdf_variant(tenant_id,deployment_id,owner_type,owner_id,locale,template_version,generation_version,snapshot_hash)
  WHERE status IN('queued','running','ready');
CREATE UNIQUE INDEX localized_pdf_variant_request_key_uq
  ON localized_pdf_variant(tenant_id,deployment_id,request_key)
  WHERE request_key IS NOT NULL;
CREATE INDEX localized_pdf_variant_owner_idx
  ON localized_pdf_variant(tenant_id,deployment_id,owner_type,owner_id,locale,status);
CREATE INDEX localized_pdf_variant_status_idx
  ON localized_pdf_variant(status,updated_at);
CREATE UNIQUE INDEX localized_pdf_variant_attempt_uq
  ON localized_pdf_variant_attempt(variant_id,attempt_number);
CREATE INDEX localized_pdf_integrity_variant_idx
  ON localized_pdf_integrity_incident(variant_id,detected_at);
CREATE INDEX localized_pdf_retry_variant_idx
  ON localized_pdf_retry_decision(variant_id,next_attempt_number);

CREATE TRIGGER localized_pdf_owner_subject_guard
BEFORE INSERT ON localized_pdf_variant
WHEN NOT(
  (NEW.owner_type='invoice' AND EXISTS(
    SELECT 1 FROM invoice i WHERE i.id=NEW.owner_id
      AND COALESCE(i.tenant_id,NEW.tenant_id)=NEW.tenant_id
      AND COALESCE(i.deployment_id,NEW.deployment_id)=NEW.deployment_id
  ) AND NEW.document_tag='invoice') OR
  (NEW.owner_type='period_report_revision' AND EXISTS(
    SELECT 1 FROM period_report_revision r WHERE r.revision_id=NEW.owner_id
      AND r.tenant_id=NEW.tenant_id AND r.deployment_id=NEW.deployment_id
  ) AND NEW.owner_revision_id=NEW.owner_id AND NEW.document_tag='period_report') OR
  (NEW.owner_type='period_report_revision' AND EXISTS(
    SELECT 1 FROM period_report r JOIN deployment_identity d ON d.singleton=1
      WHERE r.id=NEW.owner_id AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id
  ) AND NEW.owner_revision_id=NEW.owner_id||':v1' AND NEW.document_tag='period_report') OR
  (NEW.owner_type='accounting_pack_revision' AND EXISTS(
    SELECT 1 FROM accounting_pack_revision r WHERE r.revision_id=NEW.owner_id
      AND r.tenant_id=NEW.tenant_id AND r.deployment_id=NEW.deployment_id
  ) AND NEW.owner_revision_id=NEW.owner_id AND NEW.document_tag='accounting_pack') OR
  (NEW.owner_type='daily_report' AND EXISTS(
    SELECT 1 FROM daily_report r JOIN project p ON p.id=r.project_id
      JOIN deployment_identity d ON d.singleton=1
      WHERE r.id=NEW.owner_id AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id
  ) AND NEW.document_tag='daily_report') OR
  (NEW.owner_type='technical_report' AND EXISTS(
    SELECT 1 FROM technical_report r JOIN project p ON p.id=r.project_id
      JOIN deployment_identity d ON d.singleton=1
      WHERE r.id=NEW.owner_id AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id
  ) AND NEW.document_tag='technical_report')
)
BEGIN SELECT RAISE(ABORT,'localized PDF owner is not present in the configured deployment'); END;

-- Canonical variants are source snapshots, not caller assertions.  Recompute
-- the exact canonical JSON shape used by the repository from the authoritative
-- owner row, and bind both the source revision identity and its digest.
CREATE TRIGGER localized_pdf_canonical_snapshot_guard
BEFORE INSERT ON localized_pdf_variant
WHEN NEW.snapshot_hash_kind='canonical' AND NOT(
  lower(NEW.snapshot_hash)=lower(ja_finance_hash_v1(NEW.snapshot_json)) AND (
    (NEW.owner_type='invoice' AND EXISTS(
      SELECT 1 FROM invoice i WHERE i.id=NEW.owner_id
        AND NEW.owner_revision_id=i.id||':v'||i.version
        AND NEW.snapshot_json=json_object(
          'billing_rule_id',i.billing_rule_id,'calculation_hash',i.calculation_hash,
          'configuration_revision_id',i.configuration_revision_id,'created_at',i.created_at,
          'currency',i.currency,'deployment_id',i.deployment_id,'due_at',i.due_at,'id',i.id,
          'invoice_number',i.invoice_number,'invoice_subject_hash',i.invoice_subject_hash,
          'issued_at',i.issued_at,'legal_entity_revision_id',i.legal_entity_revision_id,
          'pdf_byte_length',i.pdf_byte_length,'pdf_generated_at',i.pdf_generated_at,
          'pdf_sha256',i.pdf_sha256,'pdf_status',i.pdf_status,'pdf_storage_key',i.pdf_storage_key,
          'period_end',i.period_end,'period_start',i.period_start,
          'predecessor_subject_hash',i.predecessor_subject_hash,'project_id',i.project_id,
          'sent_at',i.sent_at,'snapshot_json',i.snapshot_json,'source_lock_at',i.source_lock_at,
          'state',i.state,'stream_type',i.stream_type,'subtotal_minor',i.subtotal_minor,
          'tax_minor',i.tax_minor,'tenant_id',i.tenant_id,'total_minor',i.total_minor,
          'updated_at',i.updated_at,'version',i.version,'voided_at',i.voided_at)
    )) OR
    (NEW.owner_type='period_report_revision' AND EXISTS(
      SELECT 1 FROM period_report_revision r WHERE r.revision_id=NEW.owner_id
        AND NEW.owner_revision_id=r.revision_id
        AND NEW.snapshot_json=json_object(
          'blocker_count',r.blocker_count,'command_id',r.command_id,'created_at',r.created_at,
          'created_by',r.created_by,'currency',r.currency,'definition_id',r.definition_id,
          'deployment_id',r.deployment_id,'legal_entity_revision_id',r.legal_entity_revision_id,
          'missing_activity_count',r.missing_activity_count,'period_end',r.period_end,
          'period_start',r.period_start,'predecessor_revision_id',r.predecessor_revision_id,
          'revision_hash',r.revision_hash,'revision_id',r.revision_id,
          'revision_number',r.revision_number,'series_id',r.series_id,
          'source_manifest_hash',r.source_manifest_hash,'source_manifest_id',r.source_manifest_id,
          'status',r.status,'template_version_id',r.template_version_id,'tenant_id',r.tenant_id,
          'timezone',r.timezone)
    )) OR
    (NEW.owner_type='period_report_revision' AND EXISTS(
      SELECT 1 FROM period_report r WHERE r.id=NEW.owner_id
        AND NEW.owner_revision_id=r.id||':v1'
        AND NEW.snapshot_json=json_object(
          'audience',r.audience,'created_at',r.created_at,'created_by',r.created_by,'id',r.id,
          'pdf_byte_length',r.pdf_byte_length,'pdf_sha256',r.pdf_sha256,
          'pdf_storage_key',r.pdf_storage_key,'period_end',r.period_end,
          'period_start',r.period_start,'project_id',r.project_id,'report_type',r.report_type,
          'snapshot_json',r.snapshot_json,'state',r.state,'updated_at',r.updated_at)
    )) OR
    (NEW.owner_type='accounting_pack_revision' AND EXISTS(
      SELECT 1 FROM accounting_pack_revision r WHERE r.revision_id=NEW.owner_id
        AND NEW.owner_revision_id=r.revision_id
        AND NEW.snapshot_json=json_object(
          'blocker_count',r.blocker_count,'command_id',r.command_id,'created_at',r.created_at,
          'created_by',r.created_by,'currency',r.currency,'deployment_id',r.deployment_id,
          'legal_entity_revision_id',r.legal_entity_revision_id,'period_end',r.period_end,
          'period_start',r.period_start,'predecessor_revision_id',r.predecessor_revision_id,
          'reconciliation_difference_minor',r.reconciliation_difference_minor,
          'reconciliation_status',r.reconciliation_status,'revision_hash',r.revision_hash,
          'revision_id',r.revision_id,'revision_number',r.revision_number,'series_id',r.series_id,
          'source_cut_hash',r.source_cut_hash,'source_cut_id',r.source_cut_id,'status',r.status,
          'tenant_id',r.tenant_id,'timezone',r.timezone)
    )) OR
    (NEW.owner_type='daily_report' AND EXISTS(
      SELECT 1 FROM daily_report r WHERE r.id=NEW.owner_id
        AND NEW.owner_revision_id=r.id||':v'||r.version
        AND NEW.snapshot_json=json_object(
          'approval_state',r.approval_state,'blockers',r.blockers,
          'client_decisions',r.client_decisions,'corrective_actions',r.corrective_actions,
          'created_at',r.created_at,'customer_contact',r.customer_contact,
          'downtime_minutes',r.downtime_minutes,'id',r.id,'next_day_plan',r.next_day_plan,
          'open_items',r.open_items,'problems_found',r.problems_found,'project_id',r.project_id,
          'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by,'safety_notes',r.safety_notes,
          'safety_related',r.safety_related,'site_shift',r.site_shift,
          'standby_reason',r.standby_reason,'summary',r.summary,
          'tasks_completed',r.tasks_completed,'updated_at',r.updated_at,'version',r.version,
          'work_date',r.work_date,'worker_id',r.worker_id)
    )) OR
    (NEW.owner_type='technical_report' AND EXISTS(
      SELECT 1 FROM technical_report r WHERE r.id=NEW.owner_id
        AND NEW.owner_revision_id=r.id||':v'||r.version
        AND NEW.snapshot_json=json_object(
          'approval_state',r.approval_state,'area_line',r.area_line,'author_id',r.author_id,
          'change_summary',r.change_summary,'controller',r.controller,'created_at',r.created_at,
          'drive_motion',r.drive_motion,'hmi_scada',r.hmi_scada,'id',r.id,
          'network_protocol',r.network_protocol,'open_risk',r.open_risk,
          'plant_site',r.plant_site,'plc_platform',r.plc_platform,
          'production_impact',r.production_impact,'program_reference',r.program_reference,
          'project_id',r.project_id,'report_date',r.report_date,
          'report_date_provenance',r.report_date_provenance,'reviewed_at',r.reviewed_at,
          'reviewed_by',r.reviewed_by,'robot_platform',r.robot_platform,
          'rollback_plan',r.rollback_plan,'safety_related',r.safety_related,
          'software_version',r.software_version,'station_machine',r.station_machine,
          'system_name',r.system_name,'system_type',r.system_type,'updated_at',r.updated_at,
          'validation',r.validation,'validation_result',r.validation_result,'version',r.version)
    ))
  )
)
BEGIN SELECT RAISE(ABORT,'localized PDF snapshot is not the canonical owner snapshot'); END;

CREATE TRIGGER localized_pdf_owner_update_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN OLD.variant_id<>NEW.variant_id OR OLD.owner_type<>NEW.owner_type OR OLD.owner_id<>NEW.owner_id OR OLD.owner_revision_id<>NEW.owner_revision_id OR OLD.tenant_id<>NEW.tenant_id OR OLD.deployment_id<>NEW.deployment_id OR OLD.locale<>NEW.locale OR OLD.locale_tag<>NEW.locale_tag OR OLD.document_tag<>NEW.document_tag OR OLD.template_version<>NEW.template_version OR OLD.generation_version<>NEW.generation_version OR OLD.snapshot_json<>NEW.snapshot_json OR OLD.snapshot_hash<>NEW.snapshot_hash OR OLD.snapshot_hash_kind<>NEW.snapshot_hash_kind OR OLD.semantic_filename<>NEW.semantic_filename OR OLD.storage_key<>NEW.storage_key OR OLD.request_key IS NOT NEW.request_key OR OLD.requested_by<>NEW.requested_by OR OLD.requested_at<>NEW.requested_at OR OLD.max_attempts<>NEW.max_attempts OR (OLD.status='ready' AND NOT(
  NEW.status='failed' AND NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.integrity_blocked=1 AND
  EXISTS(SELECT 1 FROM localized_pdf_variant_attempt a WHERE a.variant_id=OLD.variant_id AND a.attempt_number=OLD.current_attempt_number AND a.outcome='ready' AND a.finished_at IS NOT NULL) AND
  EXISTS(SELECT 1 FROM localized_pdf_integrity_incident i WHERE i.variant_id=OLD.variant_id AND i.attempt_number=OLD.current_attempt_number AND i.incident_kind IN('durable_completion_missing_or_stale','storage_verification_failed','storage_key_or_manifest_mismatch','artifact_tampered','integrity_tamper','tamper'))
)) OR NOT(
  (OLD.status='queued' AND NEW.status='running' AND NEW.current_attempt_number=OLD.current_attempt_number) OR
  (OLD.status='running' AND NEW.status IN('ready','failed') AND NEW.current_attempt_number=OLD.current_attempt_number) OR
  (OLD.status='ready' AND NEW.status='failed' AND NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.integrity_blocked=1
   AND NEW.retryable=1 AND NEW.finished_at IS NOT NULL
   AND NEW.current_attempt_number=OLD.current_attempt_number
   AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL
   AND NEW.media_type IS OLD.media_type AND NEW.byte_length IS OLD.byte_length
   AND NEW.content_sha256 IS OLD.content_sha256 AND NEW.renderer_version IS OLD.renderer_version
   AND NEW.ready_at IS OLD.ready_at
   AND EXISTS(SELECT 1 FROM localized_pdf_variant_attempt a
              WHERE a.variant_id=OLD.variant_id AND a.attempt_number=OLD.current_attempt_number
                AND a.outcome='ready' AND a.finished_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM localized_pdf_integrity_incident i
              WHERE i.variant_id=OLD.variant_id AND i.attempt_number=OLD.current_attempt_number
                AND i.incident_kind IN('durable_completion_missing_or_stale','storage_verification_failed',
                                       'storage_key_or_manifest_mismatch','artifact_tampered',
                                       'integrity_tamper','tamper'))) OR
  (OLD.status='failed' AND NEW.status='queued' AND NEW.current_attempt_number=OLD.current_attempt_number+1 AND EXISTS(
    SELECT 1 FROM localized_pdf_retry_decision d
    WHERE d.variant_id=NEW.variant_id AND d.prior_attempt_number=OLD.current_attempt_number
      AND d.next_attempt_number=NEW.current_attempt_number AND d.retryable=1
  ))
)
BEGIN SELECT RAISE(ABORT,'invalid localized PDF variant transition or immutable identity update'); END;

CREATE TRIGGER localized_pdf_variant_ready_insert_guard
BEFORE INSERT ON localized_pdf_variant
WHEN NEW.status='ready'
BEGIN SELECT RAISE(ABORT,'localized PDF ready variants require a completed attempt'); END;
CREATE TRIGGER localized_pdf_variant_nonqueued_insert_guard
BEFORE INSERT ON localized_pdf_variant
WHEN NEW.status IN('running','ready') OR
  (NEW.status='failed' AND NOT(
    NEW.variant_id LIKE 'legacy-%' AND NEW.snapshot_hash_kind='legacy_verbatim' AND NEW.requested_by='legacy-migration'
  ))
BEGIN SELECT RAISE(ABORT,'localized PDF variants must enter through the queued state'); END;

CREATE TRIGGER localized_pdf_variant_failed_attempt_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN NEW.status='failed' AND NOT EXISTS(
  SELECT 1 FROM localized_pdf_variant_attempt a
  WHERE a.variant_id=NEW.variant_id AND a.attempt_number=NEW.current_attempt_number
    AND a.outcome='failed' AND a.finished_at IS NOT NULL
    OR (
      OLD.status='ready' AND a.variant_id=NEW.variant_id AND a.attempt_number=NEW.current_attempt_number
      AND a.outcome='ready' AND a.finished_at IS NOT NULL
      AND NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.integrity_blocked=1
      AND EXISTS(SELECT 1 FROM localized_pdf_integrity_incident i WHERE i.variant_id=NEW.variant_id AND i.attempt_number=NEW.current_attempt_number AND i.incident_kind IN('durable_completion_missing_or_stale','storage_verification_failed','storage_key_or_manifest_mismatch','artifact_tampered','integrity_tamper','tamper'))
    )
)
BEGIN SELECT RAISE(ABORT,'localized PDF failed variant lacks a completed attempt'); END;

CREATE TRIGGER localized_pdf_variant_attempt_insert_guard
BEFORE INSERT ON localized_pdf_variant_attempt
WHEN NOT EXISTS(
  SELECT 1 FROM localized_pdf_variant v
  WHERE v.variant_id=NEW.variant_id AND v.current_attempt_number=NEW.attempt_number
    AND NEW.outcome IS NOT NULL AND v.status IN('running','failed','ready')
    AND (
      (NEW.variant_id LIKE 'legacy-%' AND v.snapshot_hash_kind='legacy_verbatim' AND v.requested_by='legacy-migration'
       AND NEW.job_id IS NULL AND NEW.job_run_id IS NULL AND NEW.lease_fence IS NULL) OR
      (NEW.job_id IS NOT NULL AND NEW.job_run_id IS NOT NULL AND NEW.lease_fence IS NOT NULL
       AND v.claimed_job_id=NEW.job_id AND v.claimed_job_run_id=NEW.job_run_id
       AND v.claimed_lease_fence=NEW.lease_fence)
    )
)
BEGIN SELECT RAISE(ABORT,'localized PDF attempt is outside the active variant'); END;
CREATE TRIGGER localized_pdf_variant_attempt_no_update
BEFORE UPDATE ON localized_pdf_variant_attempt
BEGIN SELECT RAISE(ABORT,'localized PDF attempts are append-only'); END;
CREATE TRIGGER localized_pdf_variant_attempt_no_delete
BEFORE DELETE ON localized_pdf_variant_attempt
BEGIN SELECT RAISE(ABORT,'localized PDF attempts are append-only'); END;

CREATE TRIGGER localized_pdf_variant_incident_subject_guard
BEFORE INSERT ON localized_pdf_integrity_incident
WHEN NOT EXISTS(
  SELECT 1 FROM localized_pdf_variant v
  WHERE v.variant_id=NEW.variant_id AND v.owner_type=NEW.owner_type AND v.owner_id=NEW.owner_id
    AND v.owner_revision_id=NEW.owner_revision_id
    AND v.locale=NEW.locale AND v.template_version=NEW.template_version
    AND v.generation_version=NEW.generation_version AND v.current_attempt_number=NEW.attempt_number
    AND (NEW.storage_key IS NULL OR NEW.storage_key=v.storage_key)
    AND EXISTS(SELECT 1 FROM localized_pdf_variant_attempt attempt
               WHERE attempt.variant_id=v.variant_id AND attempt.attempt_number=NEW.attempt_number)
)
BEGIN SELECT RAISE(ABORT,'localized PDF integrity incident is outside its variant'); END;
CREATE TRIGGER localized_pdf_integrity_incident_no_update
BEFORE UPDATE ON localized_pdf_integrity_incident
BEGIN SELECT RAISE(ABORT,'localized PDF integrity incidents are append-only'); END;
CREATE TRIGGER localized_pdf_integrity_incident_no_delete
BEFORE DELETE ON localized_pdf_integrity_incident
BEGIN SELECT RAISE(ABORT,'localized PDF integrity incidents are append-only'); END;

CREATE TRIGGER localized_pdf_retry_no_update
BEFORE UPDATE ON localized_pdf_retry_decision
BEGIN SELECT RAISE(ABORT,'localized PDF retry decisions are append-only'); END;
CREATE TRIGGER localized_pdf_retry_no_delete
BEFORE DELETE ON localized_pdf_retry_decision
BEGIN SELECT RAISE(ABORT,'localized PDF retry decisions are append-only'); END;
CREATE TRIGGER localized_pdf_retry_subject_guard
BEFORE INSERT ON localized_pdf_retry_decision
WHEN NOT EXISTS(
  SELECT 1 FROM localized_pdf_variant v
  WHERE v.variant_id=NEW.variant_id AND v.status='failed'
    AND v.current_attempt_number=NEW.prior_attempt_number
    AND v.retryable=1 AND NEW.retryable=1
    AND NEW.next_attempt_number=NEW.prior_attempt_number+1
)
BEGIN SELECT RAISE(ABORT,'localized PDF retry decision is not reserved by a retryable failure'); END;

CREATE TRIGGER localized_pdf_ready_manifest_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN NEW.status='ready' AND NOT EXISTS(
  SELECT 1 FROM localized_pdf_variant_attempt a
  WHERE a.variant_id=NEW.variant_id AND a.attempt_number=NEW.current_attempt_number
    AND a.outcome='ready' AND a.finished_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'localized PDF ready variant lacks a completed attempt'); END;

-- A localized render may only claim a queued variant through the reviewed B5
-- durable execution envelope.  The repository performs the same checks in
-- TypeScript, but these SQL guards close the direct-SQL path as well.
CREATE TRIGGER localized_pdf_b5_claim_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN OLD.status='queued' AND NEW.status='running' AND NOT EXISTS(
  SELECT 1
  FROM job j
  JOIN job_run r ON r.id=NEW.claimed_job_run_id AND r.job_id=j.id
  JOIN service_actor s ON s.id=r.service_actor_id
  JOIN deployment_service_actor_binding b
    ON b.singleton=1 AND b.service_actor_id=s.id
  WHERE j.id=NEW.claimed_job_id
    AND NEW.claimed_job_id IS NOT NULL AND NEW.claimed_job_run_id IS NOT NULL
    AND NEW.claimed_lease_fence IS NOT NULL
    AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'
    AND j.kind='localized_pdf_variant_render' AND r.kind=j.kind
    AND j.required_capability='artifact.localized_pdf.render'
    AND r.required_capability=j.required_capability
    AND j.tenant_id=NEW.tenant_id AND j.deployment_id=NEW.deployment_id
    AND r.tenant_id=NEW.tenant_id AND r.deployment_id=NEW.deployment_id
    AND j.state='claimed' AND r.state='running'
    AND j.active_job_run_id=r.id AND j.fence_version=NEW.claimed_lease_fence
    AND r.fence_version=NEW.claimed_lease_fence
    AND j.payload_sha256 IS NOT NULL AND length(j.payload_sha256)=64
    AND j.payload_sha256 NOT GLOB '*[^0-9a-fA-F]*'
    AND j.payload_sha256=r.payload_sha256
    AND json_valid(j.payload_json)
    AND json_type(j.payload_json,'$.variantId')='text'
    AND json_extract(j.payload_json,'$.variantId')=NEW.variant_id
    AND json_type(j.payload_json,'$.requestedAttempt')='integer'
    AND json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number
    AND j.payload_json='{"requestedAttempt":'||json_extract(j.payload_json,'$.requestedAttempt')||',"variantId":'||json_quote(json_extract(j.payload_json,'$.variantId'))||'}'
    AND lower(ja_finance_hash_v1(j.payload_json))=lower(j.payload_sha256)
    AND r.service_actor_id=s.id AND s.status='active'
    AND r.service_actor_version=s.version
    AND r.service_actor_capabilities_json=s.capabilities_json
    AND r.configured_binding_version=b.version
    AND b.tenant_id=NEW.tenant_id AND b.deployment_id=NEW.deployment_id
    AND b.service_actor_id=r.service_actor_id
    AND s.capabilities_json IS NOT NULL
    AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c
               WHERE c.type='text' AND c.value='artifact.localized_pdf.render')
)
BEGIN SELECT RAISE(ABORT,'localized PDF claim is not bound to a valid B5 execution'); END;

-- Ready publication is checked against the same execution after the runner has
-- durably committed job_run=succeeded and job=succeeded.  OLD carries the
-- claimed job/run/fence because the successful transition clears those fields.
CREATE TRIGGER localized_pdf_b5_ready_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN OLD.status='running' AND NEW.status='ready' AND NOT EXISTS(
  SELECT 1
  FROM job j
  JOIN job_run r ON r.id=OLD.claimed_job_run_id AND r.job_id=j.id
  JOIN service_actor s ON s.id=r.service_actor_id
  JOIN deployment_service_actor_binding b
    ON b.singleton=1 AND b.service_actor_id=s.id
  WHERE j.id=OLD.claimed_job_id
    AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL
    AND NEW.claimed_lease_fence IS NULL
    AND OLD.claimed_job_id IS NOT NULL AND OLD.claimed_job_run_id IS NOT NULL
    AND OLD.claimed_lease_fence IS NOT NULL
    AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'
    AND j.kind='localized_pdf_variant_render' AND r.kind=j.kind
    AND j.required_capability='artifact.localized_pdf.render'
    AND r.required_capability=j.required_capability
    AND j.tenant_id=OLD.tenant_id AND j.deployment_id=OLD.deployment_id
    AND r.tenant_id=OLD.tenant_id AND r.deployment_id=OLD.deployment_id
    AND j.state='succeeded' AND r.state='succeeded' AND r.outcome='succeeded'
    AND r.finished_at IS NOT NULL
    AND j.active_job_run_id=r.id AND j.fence_version=OLD.claimed_lease_fence
    AND r.fence_version=OLD.claimed_lease_fence
    AND j.payload_sha256 IS NOT NULL AND length(j.payload_sha256)=64
    AND j.payload_sha256 NOT GLOB '*[^0-9a-fA-F]*'
    AND j.payload_sha256=r.payload_sha256
    AND json_valid(j.payload_json)
    AND json_type(j.payload_json,'$.variantId')='text'
    AND json_extract(j.payload_json,'$.variantId')=OLD.variant_id
    AND json_type(j.payload_json,'$.requestedAttempt')='integer'
    AND json_extract(j.payload_json,'$.requestedAttempt')=OLD.current_attempt_number
    AND j.payload_json='{"requestedAttempt":'||json_extract(j.payload_json,'$.requestedAttempt')||',"variantId":'||json_quote(json_extract(j.payload_json,'$.variantId'))||'}'
    AND lower(ja_finance_hash_v1(j.payload_json))=lower(j.payload_sha256)
    AND r.service_actor_id=s.id AND s.status='active'
    AND r.service_actor_version=s.version
    AND r.service_actor_capabilities_json=s.capabilities_json
    AND r.configured_binding_version=b.version
    AND b.tenant_id=OLD.tenant_id AND b.deployment_id=OLD.deployment_id
    AND b.service_actor_id=r.service_actor_id
    AND s.capabilities_json IS NOT NULL
    AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c
               WHERE c.type='text' AND c.value='artifact.localized_pdf.render')
)
BEGIN SELECT RAISE(ABORT,'localized PDF ready publication lacks a successful B5 execution'); END;

-- A ready manifest can only be downgraded by the integrity quarantine path.
-- Its successful attempt remains immutable evidence; a fresh append-only
-- incident is required in the same transaction as the downgrade.
CREATE TRIGGER localized_pdf_ready_integrity_downgrade_guard
BEFORE UPDATE ON localized_pdf_variant
WHEN OLD.status='ready' AND NEW.status='failed' AND NOT(
  NEW.error_code='ARTIFACT_INTEGRITY_FAILED' AND NEW.integrity_blocked=1
  AND NEW.retryable=1 AND NEW.finished_at IS NOT NULL
  AND NEW.current_attempt_number=OLD.current_attempt_number
  AND NEW.claimed_job_id IS NULL AND NEW.claimed_job_run_id IS NULL AND NEW.claimed_lease_fence IS NULL
  AND NEW.media_type IS OLD.media_type AND NEW.byte_length IS OLD.byte_length
  AND NEW.content_sha256 IS OLD.content_sha256 AND NEW.renderer_version IS OLD.renderer_version
  AND NEW.ready_at IS OLD.ready_at
  AND EXISTS(SELECT 1 FROM localized_pdf_variant_attempt a
             WHERE a.variant_id=OLD.variant_id AND a.attempt_number=OLD.current_attempt_number
               AND a.outcome='ready' AND a.finished_at IS NOT NULL)
  AND EXISTS(SELECT 1 FROM localized_pdf_integrity_incident i
             WHERE i.variant_id=OLD.variant_id AND i.attempt_number=OLD.current_attempt_number
               AND i.incident_kind IN('durable_completion_missing_or_stale','storage_verification_failed',
                                      'storage_key_or_manifest_mismatch','artifact_tampered',
                                      'integrity_tamper','tamper'))
)
BEGIN SELECT RAISE(ABORT,'ready localized PDF requires atomic integrity evidence'); END;

CREATE TRIGGER localized_pdf_variant_no_delete
BEFORE DELETE ON localized_pdf_variant
BEGIN SELECT RAISE(ABORT,'localized PDF variants are immutable records'); END;

-- A variant is a point-in-time rendering of a source record.  Retaining the
-- source row is required for authorization and provenance even when a source
-- is otherwise a draft, so source deletion is blocked while a variant exists.
CREATE TRIGGER IF NOT EXISTS localized_pdf_invoice_source_no_delete
BEFORE DELETE ON invoice
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='invoice' AND v.owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'invoice is referenced by a localized PDF variant'); END;
CREATE TRIGGER IF NOT EXISTS localized_pdf_period_report_source_no_delete
BEFORE DELETE ON period_report
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='period_report_revision' AND v.owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'period report is referenced by a localized PDF variant'); END;
CREATE TRIGGER IF NOT EXISTS localized_pdf_period_report_revision_source_no_delete
BEFORE DELETE ON period_report_revision
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='period_report_revision' AND v.owner_id=OLD.revision_id)
BEGIN SELECT RAISE(ABORT,'period report revision is referenced by a localized PDF variant'); END;
CREATE TRIGGER IF NOT EXISTS localized_pdf_accounting_pack_revision_source_no_delete
BEFORE DELETE ON accounting_pack_revision
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='accounting_pack_revision' AND v.owner_id=OLD.revision_id)
BEGIN SELECT RAISE(ABORT,'accounting pack revision is referenced by a localized PDF variant'); END;
CREATE TRIGGER IF NOT EXISTS localized_pdf_daily_report_source_no_delete
BEFORE DELETE ON daily_report
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='daily_report' AND v.owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'daily report is referenced by a localized PDF variant'); END;
CREATE TRIGGER IF NOT EXISTS localized_pdf_technical_report_source_no_delete
BEFORE DELETE ON technical_report
WHEN EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='technical_report' AND v.owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'technical report is referenced by a localized PDF variant'); END;

-- The variant stores a source ownership snapshot.  Draft narrative fields may
-- continue to evolve, but changing the authorization subject or business date
-- would make the stored artifact point at a different source record.
CREATE TRIGGER IF NOT EXISTS localized_pdf_daily_report_subject_update_guard
BEFORE UPDATE ON daily_report
WHEN EXISTS(
  SELECT 1 FROM localized_pdf_variant v
  WHERE v.owner_type='daily_report' AND v.owner_id=OLD.id
) AND (
  OLD.id IS NOT NEW.id OR
  OLD.project_id IS NOT NEW.project_id OR
  OLD.worker_id IS NOT NEW.worker_id OR
  OLD.work_date IS NOT NEW.work_date
)
BEGIN SELECT RAISE(ABORT,'daily report ownership subject is referenced by a localized PDF variant'); END;

CREATE TRIGGER IF NOT EXISTS localized_pdf_technical_report_subject_update_guard
BEFORE UPDATE ON technical_report
WHEN EXISTS(
  SELECT 1 FROM localized_pdf_variant v
  WHERE v.owner_type='technical_report' AND v.owner_id=OLD.id
) AND (
  OLD.id IS NOT NEW.id OR
  OLD.project_id IS NOT NEW.project_id OR
  OLD.author_id IS NOT NEW.author_id OR
  OLD.report_date IS NOT NEW.report_date
)
BEGIN SELECT RAISE(ABORT,'technical report ownership subject is referenced by a localized PDF variant'); END;

-- Preserve already-published legacy PDFs without pretending their byte-level
-- snapshot encoding was canonical. They are immutable legacy-verbatim rows;
-- new requests always use canonical snapshots through the repository.
INSERT INTO localized_pdf_variant(
  variant_id,owner_type,owner_id,owner_revision_id,tenant_id,deployment_id,
  locale,locale_tag,document_tag,template_version,generation_version,
  snapshot_json,snapshot_hash,snapshot_hash_kind,status,current_attempt_number,attempt_number,
  semantic_filename,storage_key,error_code,retryable,integrity_blocked,
  requested_by,requested_at,finished_at,updated_at
)
SELECT
  'legacy-invoice:'||i.id,'invoice',i.id,i.id||':v'||i.version,
  COALESCE(i.tenant_id,d.tenant_id),COALESCE(i.deployment_id,d.deployment_id),
  CASE lower(CASE WHEN json_valid(COALESCE(i.snapshot_json,'{}')) THEN COALESCE(json_extract(i.snapshot_json,'$.locale'),'') ELSE '' END)
    WHEN 'es' THEN 'es' WHEN 'es-es' THEN 'es' WHEN 'es_es' THEN 'es'
    WHEN 'pt' THEN 'pt' WHEN 'pt-br' THEN 'pt' WHEN 'pt_br' THEN 'pt'
    ELSE 'en' END,
  CASE lower(CASE WHEN json_valid(COALESCE(i.snapshot_json,'{}')) THEN COALESCE(json_extract(i.snapshot_json,'$.locale'),'') ELSE '' END)
    WHEN 'es' THEN 'es-ES' WHEN 'es-es' THEN 'es-ES' WHEN 'es_es' THEN 'es-ES'
    WHEN 'pt' THEN 'pt-BR' WHEN 'pt-br' THEN 'pt-BR' WHEN 'pt_br' THEN 'pt-BR'
    ELSE 'en-US' END,
  'invoice','legacy','legacy',COALESCE(i.snapshot_json,'{}'),
  lower(ja_finance_hash_v1(COALESCE(i.snapshot_json,i.id))), 'legacy_verbatim','failed',1,1,
  'invoice-'||hex(CAST(i.id AS BLOB))||'-'||
    CASE lower(CASE WHEN json_valid(COALESCE(i.snapshot_json,'{}')) THEN COALESCE(json_extract(i.snapshot_json,'$.locale'),'') ELSE '' END)
      WHEN 'es' THEN 'es-ES' WHEN 'es-es' THEN 'es-ES' WHEN 'es_es' THEN 'es-ES'
      WHEN 'pt' THEN 'pt-BR' WHEN 'pt-br' THEN 'pt-BR' WHEN 'pt_br' THEN 'pt-BR'
      ELSE 'en-US' END||'-template-legacy-generation-legacy.pdf',
  CASE WHEN length(i.pdf_storage_key)>0
         AND substr(i.pdf_storage_key,1,1)<>'/'
         AND instr(i.pdf_storage_key,char(92))=0
         AND instr(i.pdf_storage_key,'..')=0
         AND instr(i.pdf_storage_key,'://')=0
         AND instr(i.pdf_storage_key,':')=0
         AND instr(i.pdf_storage_key,'%')=0
         AND instr(i.pdf_storage_key,char(0))=0
       THEN i.pdf_storage_key
       ELSE 'localized-pdf/quarantine/legacy/invoice/'||hex(CAST(i.id AS BLOB))||'.pdf' END,
  'LEGACY_ARTIFACT_UNVERIFIABLE',1,1,'legacy-migration',i.created_at,
  COALESCE(i.pdf_generated_at,i.updated_at),i.updated_at
FROM invoice i CROSS JOIN deployment_identity d
WHERE d.singleton=1 AND i.pdf_storage_key IS NOT NULL AND i.pdf_sha256 IS NOT NULL AND i.pdf_byte_length>0
  AND NOT EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.variant_id='legacy-invoice:'||i.id);
INSERT INTO localized_pdf_variant_attempt(
  attempt_id,variant_id,attempt_number,job_id,job_run_id,lease_fence,started_at,finished_at,
  outcome,failure_class,retryable,created_at
)
SELECT 'legacy-invoice-attempt:'||i.id,'legacy-invoice:'||i.id,1,NULL,NULL,NULL,NULL,
       COALESCE(i.pdf_generated_at,i.updated_at),'failed','legacy_artifact_unverifiable',1,
       COALESCE(i.pdf_generated_at,i.updated_at)
FROM invoice i WHERE EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.variant_id='legacy-invoice:'||i.id);

INSERT INTO localized_pdf_variant(
  variant_id,owner_type,owner_id,owner_revision_id,tenant_id,deployment_id,
  locale,locale_tag,document_tag,template_version,generation_version,
  snapshot_json,snapshot_hash,snapshot_hash_kind,status,current_attempt_number,attempt_number,
  semantic_filename,storage_key,error_code,retryable,integrity_blocked,
  requested_by,requested_at,finished_at,updated_at
)
SELECT
  'legacy-period-report:'||r.id,'period_report_revision',r.id,r.id||':v1',d.tenant_id,d.deployment_id,
  CASE lower(CASE WHEN json_valid(COALESCE(r.snapshot_json,'{}')) THEN COALESCE(json_extract(r.snapshot_json,'$.locale'),'') ELSE '' END)
    WHEN 'es' THEN 'es' WHEN 'es-es' THEN 'es' WHEN 'es_es' THEN 'es'
    WHEN 'pt' THEN 'pt' WHEN 'pt-br' THEN 'pt' WHEN 'pt_br' THEN 'pt'
    ELSE 'en' END,
  CASE lower(CASE WHEN json_valid(COALESCE(r.snapshot_json,'{}')) THEN COALESCE(json_extract(r.snapshot_json,'$.locale'),'') ELSE '' END)
    WHEN 'es' THEN 'es-ES' WHEN 'es-es' THEN 'es-ES' WHEN 'es_es' THEN 'es-ES'
    WHEN 'pt' THEN 'pt-BR' WHEN 'pt-br' THEN 'pt-BR' WHEN 'pt_br' THEN 'pt-BR'
    ELSE 'en-US' END,
  'period_report','legacy','legacy',COALESCE(r.snapshot_json,'{}'),
  lower(ja_finance_hash_v1(COALESCE(r.snapshot_json,r.id))), 'legacy_verbatim','failed',1,1,
  'period-report-'||hex(CAST(r.id AS BLOB))||'-'||
    CASE lower(CASE WHEN json_valid(COALESCE(r.snapshot_json,'{}')) THEN COALESCE(json_extract(r.snapshot_json,'$.locale'),'') ELSE '' END)
      WHEN 'es' THEN 'es-ES' WHEN 'es-es' THEN 'es-ES' WHEN 'es_es' THEN 'es-ES'
      WHEN 'pt' THEN 'pt-BR' WHEN 'pt-br' THEN 'pt-BR' WHEN 'pt_br' THEN 'pt-BR'
      ELSE 'en-US' END||'-template-legacy-generation-legacy.pdf',
  CASE WHEN length(r.pdf_storage_key)>0
         AND substr(r.pdf_storage_key,1,1)<>'/'
         AND instr(r.pdf_storage_key,char(92))=0
         AND instr(r.pdf_storage_key,'..')=0
         AND instr(r.pdf_storage_key,'://')=0
         AND instr(r.pdf_storage_key,':')=0
         AND instr(r.pdf_storage_key,'%')=0
         AND instr(r.pdf_storage_key,char(0))=0
       THEN r.pdf_storage_key
       ELSE 'localized-pdf/quarantine/legacy/period-report/'||hex(CAST(r.id AS BLOB))||'.pdf' END,
  'LEGACY_ARTIFACT_UNVERIFIABLE',1,1,'legacy-migration',r.created_at,
  COALESCE(r.updated_at,r.created_at),r.updated_at
FROM period_report r CROSS JOIN deployment_identity d
WHERE d.singleton=1 AND r.pdf_storage_key IS NOT NULL AND r.pdf_sha256 IS NOT NULL AND r.pdf_byte_length>0
  AND NOT EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.variant_id='legacy-period-report:'||r.id);
INSERT INTO localized_pdf_variant_attempt(
  attempt_id,variant_id,attempt_number,job_id,job_run_id,lease_fence,started_at,finished_at,
  outcome,failure_class,retryable,created_at
)
SELECT 'legacy-period-report-attempt:'||r.id,'legacy-period-report:'||r.id,1,NULL,NULL,NULL,NULL,
       COALESCE(r.updated_at,r.created_at),'failed','legacy_artifact_unverifiable',1,
       COALESCE(r.updated_at,r.created_at)
FROM period_report r WHERE EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.variant_id='legacy-period-report:'||r.id);
