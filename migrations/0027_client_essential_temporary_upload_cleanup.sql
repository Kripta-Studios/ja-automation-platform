-- Client Essential CORE-16 M1: authorize the existing durable temporary-upload
-- cleanup job contract at the SQLite boundary.  This migration is mechanical:
-- it adds exactly one reviewed kind/capability pair and preserves every
-- existing service-actor capability, job-kind pair, row and lifecycle guard.
-- No cleanup rows are backfilled; the application already owns the cleanup
-- handler and its fenced execution proof.

-- Migration-contract metadata is append-only.  Widen the historical CHECK
-- constraint transactionally, preserving every metadata and finance-cutover
-- value before the runner records migration 27.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v26;

CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 27),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup'
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
INSERT INTO migration_contract_metadata(
  migration_version,migration_name,descriptor_version,descriptor_sha256,sql_sha256,
  projection_sha256,vector_sha256,encoder_sha256,runner_sha256,heartbeat_worker_sha256,
  schema_hash_manifest,schema_hash_manifest_sha256,pre_projection_sha256,post_projection_sha256,
  node_version,sqlite_version,applied_at
)
SELECT migration_version,migration_name,descriptor_version,descriptor_sha256,sql_sha256,
  projection_sha256,vector_sha256,encoder_sha256,runner_sha256,heartbeat_worker_sha256,
  schema_hash_manifest,schema_hash_manifest_sha256,pre_projection_sha256,post_projection_sha256,
  node_version,sqlite_version,applied_at
FROM migration_contract_metadata_v26;

DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_v20;
CREATE TABLE finance_v2_cutover(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  migration_version INTEGER NOT NULL CHECK(migration_version=20)
    REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'),
  cutover_at TEXT NOT NULL CHECK(length(cutover_at)>0)
) STRICT;
INSERT INTO finance_v2_cutover(singleton,migration_version,descriptor_sha256,cutover_at)
SELECT singleton,migration_version,descriptor_sha256,cutover_at FROM finance_v2_cutover_v20;
DROP TABLE finance_v2_cutover_v20;
DROP TABLE migration_contract_metadata_v26;

CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

-- CORE-07 links remain subject to the complete 0026 scope guard.  The only
-- additive invariant here is that the actor recorded on the link is the
-- owner of the linked document; service authorization still decides whether
-- that owner may attach the document to the report.
DROP TRIGGER report_document_link_insert_guard;
CREATE TRIGGER report_document_link_insert_guard
BEFORE INSERT ON report_document_link
WHEN
  (NEW.report_type='daily' AND NOT EXISTS(
    SELECT 1 FROM daily_report r
    WHERE r.id=NEW.report_id
      AND r.project_id=NEW.project_id
      AND r.approval_state IN('draft','needs_changes')
  )) OR
  (NEW.report_type='technical' AND NOT EXISTS(
    SELECT 1 FROM technical_report r
    WHERE r.id=NEW.report_id
      AND r.project_id=NEW.project_id
      AND r.approval_state IN('draft','needs_changes')
      AND length(trim(r.system_name))>0
      AND NEW.system_reference_snapshot=r.system_name
  )) OR
  NOT EXISTS(
    SELECT 1 FROM user u
    WHERE u.id=NEW.created_by AND u.status='active'
  ) OR
  NOT EXISTS(
    SELECT 1 FROM document d
    WHERE d.id=NEW.document_id
      AND d.project_id=NEW.project_id
      AND d.owner_id=NEW.created_by
      AND (
        (d.state='temporary' AND d.scan_status='not_scanned') OR
        (d.state='quarantined' AND d.scan_status='pending') OR
        (d.state='committed' AND d.scan_status IN('clean','not_scanned'))
      )
  ) OR
  (EXISTS(
    SELECT 1 FROM document d
    WHERE d.id=NEW.document_id AND d.supersedes_id IS NOT NULL
  ) AND NOT EXISTS(
    SELECT 1
    FROM document current_document
    JOIN document predecessor ON predecessor.id=current_document.supersedes_id
    JOIN report_document_link predecessor_link ON predecessor_link.document_id=predecessor.id
    WHERE current_document.id=NEW.document_id
      AND predecessor.state='committed'
      AND predecessor.project_id=NEW.project_id
      AND predecessor_link.report_type=NEW.report_type
      AND predecessor_link.report_id=NEW.report_id
      AND predecessor_link.project_id=NEW.project_id
      AND predecessor_link.attachment_kind=NEW.attachment_kind
  ))
  OR (
    NEW.attachment_kind IN('plc_backup_before','plc_backup_after') AND
    EXISTS(
      SELECT 1 FROM document current_document
      WHERE current_document.id=NEW.document_id
        AND current_document.supersedes_id IS NULL
    ) AND EXISTS(
      SELECT 1
      FROM report_document_link existing_link
      JOIN document existing_document ON existing_document.id=existing_link.document_id
      WHERE existing_link.report_type=NEW.report_type
        AND existing_link.report_id=NEW.report_id
        AND existing_link.attachment_kind=NEW.attachment_kind
        AND existing_document.supersedes_id IS NULL
    )
  ) OR (
    NEW.attachment_kind IN('plc_backup_before','plc_backup_after') AND
    EXISTS(
      SELECT 1
      FROM document current_document
      JOIN report_document_link existing_link
        ON existing_link.report_type=NEW.report_type
       AND existing_link.report_id=NEW.report_id
       AND existing_link.attachment_kind=NEW.attachment_kind
      JOIN document existing_document ON existing_document.id=existing_link.document_id
      WHERE current_document.id=NEW.document_id
        AND current_document.supersedes_id IS NOT NULL
        AND existing_document.supersedes_id=current_document.supersedes_id
    )
  )
BEGIN
  SELECT RAISE(ABORT,'report attachment link is outside its native report/document scope');
END;

-- These are the only existing allowlist guards widened by this migration.
-- Every non-capability predicate remains the reviewed B5 predicate from 0019.
DROP TRIGGER service_actor_capability_insert_guard;
DROP TRIGGER service_actor_capability_update_guard;
DROP TRIGGER job_b5_insert_guard;

CREATE TRIGGER service_actor_capability_insert_guard BEFORE INSERT ON service_actor WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','storage.temporary.cleanup','artifact.localized_pdf.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json))
BEGIN SELECT RAISE(ABORT,'invalid service actor capabilities'); END;
CREATE TRIGGER service_actor_capability_update_guard BEFORE UPDATE ON service_actor WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.name<>OLD.name OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','storage.temporary.cleanup','artifact.localized_pdf.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json)) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid service actor update'); END;

CREATE TRIGGER job_b5_insert_guard BEFORE INSERT ON job WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.kind NOT IN ('invoice_pdf','period_close_report','auto_draft','accounting_pack_artifact_render','temporary_upload_cleanup','localized_pdf_variant_render','document_scan','outbox_deliver','alert_dispatch','email_send','backup_verify') OR
  NEW.state<>'queued' OR NEW.lease_until IS NOT NULL OR NEW.payload_sha256 IS NULL OR NEW.correlation_id IS NULL OR NEW.required_capability IS NULL OR
  NEW.attempts<>0 OR NEW.fence_version<>0 OR NEW.active_job_run_id IS NOT NULL OR NEW.last_error_code IS NOT NULL OR
  NOT ((NEW.kind='invoice_pdf' AND NEW.required_capability='artifact.invoice.render') OR
       (NEW.kind='period_close_report' AND NEW.required_capability='artifact.report.render') OR
       (NEW.kind='auto_draft' AND NEW.required_capability='billing.draft.generate') OR
       (NEW.kind='accounting_pack_artifact_render' AND NEW.required_capability='artifact.accounting_pack.render') OR
       (NEW.kind='temporary_upload_cleanup' AND NEW.required_capability='storage.temporary.cleanup') OR
       (NEW.kind='localized_pdf_variant_render' AND NEW.required_capability='artifact.localized_pdf.render') OR
       (NEW.kind='document_scan' AND NEW.required_capability='document.scan') OR
       (NEW.kind='outbox_deliver' AND NEW.required_capability='outbox.deliver') OR
       (NEW.kind='alert_dispatch' AND NEW.required_capability='alert.dispatch') OR
       (NEW.kind='email_send' AND NEW.required_capability='email.send') OR
       (NEW.kind='backup_verify' AND NEW.required_capability='backup.verify'))
BEGIN SELECT RAISE(ABORT,'invalid b5 job'); END;

-- This is the one reviewed user provenance identity needed by the existing
-- accounting-pack retry writer.  Keep the registry manifest guard disabled
-- only for this literal insert, then restore it before the migration commits.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(
  contract_version,action,entity_type,actor_kind,owner_packet,data_classification
) VALUES ('B5-R4','accounting_pack.export_retry','accounting_pack_run','user','CE-CORE13/16','restricted');
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
