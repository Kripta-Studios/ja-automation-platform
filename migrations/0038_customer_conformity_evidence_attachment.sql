-- A legacy conformity may predate genuine signed-copy evidence. Preserve that
-- immutable acceptance and attach one independently verified private document
-- instead of changing its signature_document_id in place.
CREATE TABLE customer_conformity_evidence_attachment(
  id TEXT PRIMARY KEY,
  conformity_id TEXT NOT NULL UNIQUE
    REFERENCES customer_conformity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  signature_document_id TEXT NOT NULL UNIQUE
    REFERENCES document(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attached_by TEXT NOT NULL
    REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attached_at TEXT NOT NULL CHECK(length(trim(attached_at))>0),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000)
) STRICT;
CREATE INDEX customer_conformity_evidence_attachment_document_idx
  ON customer_conformity_evidence_attachment(signature_document_id);

-- Metadata checks are duplicated at the database boundary. The repository
-- additionally proves the actual private PDF bytes, hash and EOF marker.
CREATE TRIGGER customer_conformity_evidence_attachment_guard
BEFORE INSERT ON customer_conformity_evidence_attachment
WHEN NOT EXISTS(
  SELECT 1
    FROM customer_conformity conformity
    JOIN period_report report ON report.id=conformity.period_report_id
    JOIN document evidence ON evidence.id=NEW.signature_document_id
   WHERE conformity.id=NEW.conformity_id
     AND conformity.signature_document_id IS NULL
     AND report.audience='customer'
     AND report.state IN('approved','final')
     AND report.snapshot_version=conformity.snapshot_version
     AND report.snapshot_sha256=conformity.snapshot_sha256
     AND report.snapshot_json=conformity.snapshot_json
     AND report.pdf_storage_key=conformity.report_pdf_storage_key
     AND report.pdf_sha256=conformity.report_pdf_sha256
     AND report.pdf_byte_length=conformity.report_pdf_byte_length
     AND NOT EXISTS(
       SELECT 1 FROM customer_conformity_invalidation invalidation
        WHERE invalidation.conformity_id=conformity.id
     )
     AND evidence.project_id=report.project_id
     AND evidence.state='committed'
     AND evidence.scan_status IN('clean','not_scanned')
     AND evidence.artifact_type='customer_signoff_evidence'
     AND evidence.sensitivity IN('customer_private','sensitive')
     AND evidence.media_type='application/pdf'
     AND length(evidence.sha256)=64
     AND evidence.byte_length>0
)
BEGIN SELECT RAISE(ABORT,'customer conformity evidence attachment must bind active legacy conformity to verified project evidence'); END;
CREATE TRIGGER customer_conformity_evidence_attachment_no_replace
BEFORE INSERT ON customer_conformity_evidence_attachment
WHEN EXISTS(
  SELECT 1 FROM customer_conformity_evidence_attachment existing
   WHERE existing.id=NEW.id OR existing.conformity_id=NEW.conformity_id
      OR existing.signature_document_id=NEW.signature_document_id
)
BEGIN SELECT RAISE(ABORT,'customer conformity evidence attachment is immutable'); END;
CREATE TRIGGER customer_conformity_evidence_attachment_no_update
BEFORE UPDATE ON customer_conformity_evidence_attachment
BEGIN SELECT RAISE(ABORT,'customer conformity evidence attachment is immutable'); END;
CREATE TRIGGER customer_conformity_evidence_attachment_no_delete
BEFORE DELETE ON customer_conformity_evidence_attachment
BEGIN SELECT RAISE(ABORT,'customer conformity evidence attachment is immutable'); END;

-- Migration metadata itself is append-only and needs to recognize version 38.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v37;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 38),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement',
    'customer_conformity_evidence_attachment'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v37;
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
DROP TABLE migration_contract_metadata_v37;
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

-- Registry rows are reviewed migration evidence; temporarily open only its
-- self-reference guard while adding this literal action, then restore it.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(
  contract_version,action,entity_type,actor_kind,owner_packet,data_classification
) VALUES(
  'B5-R4','customer_conformity.evidence_attach','customer_conformity_evidence_attachment',
  'user','JA-02','restricted'
);
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
