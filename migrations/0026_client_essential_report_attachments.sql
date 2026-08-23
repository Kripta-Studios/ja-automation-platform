-- Client Essential CORE-07: link native daily/technical reports to the
-- private documents that substantiate them (including PLC backup versions).
--
-- This migration is additive.  Existing reports and documents are deliberately
-- left unlinked: there is no historical source of truth from which to infer an
-- attachment relationship.  The polymorphic report_id is guarded below by
-- report_type-specific triggers because SQLite cannot express a foreign key to
-- either daily_report or technical_report in one column.

-- Migration-contract metadata is append-only.  Widen the one historical CHECK
-- constraint transactionally, copying every prior value byte-for-byte before
-- the runner records migration 26.  The finance cutover remains tied to its
-- original immutable migration-20 row.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v25;

CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 26),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments'
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
FROM migration_contract_metadata_v25;

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
DROP TABLE migration_contract_metadata_v25;

CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

-- A document can substantiate one native report attachment relationship.  The
-- report id is intentionally polymorphic; the insert guard below supplies the
-- type-specific parent/project/state checks.
CREATE TABLE report_document_link(
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily','technical')),
  report_id TEXT NOT NULL,
  document_id TEXT NOT NULL UNIQUE
    REFERENCES document(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NOT NULL
    REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  attachment_kind TEXT NOT NULL CHECK(attachment_kind IN(
    'daily_attachment','technical_attachment','plc_backup_before','plc_backup_after'
  )),
  system_reference_snapshot TEXT,
  created_by TEXT NOT NULL
    REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK(
    (report_type='daily' AND attachment_kind='daily_attachment' AND system_reference_snapshot IS NULL) OR
    (report_type='technical' AND attachment_kind IN('technical_attachment','plc_backup_before','plc_backup_after') AND
      system_reference_snapshot IS NOT NULL AND length(trim(system_reference_snapshot))>0)
  )
) STRICT;

CREATE INDEX report_document_link_report_idx
  ON report_document_link(report_type,report_id,attachment_kind);
CREATE INDEX report_document_link_project_idx
  ON report_document_link(project_id,created_at);

-- A link is valid only while its native report is editable, its creator is an
-- active user, its document is present in the authorized project and in an
-- upload/scanned state pair that the document lifecycle actually produces, and
-- any supersession points to a committed predecessor for this exact
-- report/kind.  Technical snapshots are copied from the native report's
-- system_name; callers cannot invent a second system identity at link time.
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
      AND (
        -- Upload reservations are temporary/not_scanned.  A required scanner
        -- changes that pair to quarantined/pending before it can commit;
        -- scanner-disabled finalization is committed/not_scanned.  A clean
        -- scanner result is committed/clean.  The other combinations are
        -- application-impossible and must not become report evidence.
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

-- Link identity is historical evidence.  No field may be rewritten after the
-- relationship is created; a new document/link pair represents a supersession.
CREATE TRIGGER report_document_link_no_update
BEFORE UPDATE ON report_document_link
WHEN OLD.id IS NOT NEW.id OR
     OLD.report_type IS NOT NEW.report_type OR
     OLD.report_id IS NOT NEW.report_id OR
     OLD.document_id IS NOT NEW.document_id OR
     OLD.project_id IS NOT NEW.project_id OR
     OLD.attachment_kind IS NOT NEW.attachment_kind OR
     OLD.system_reference_snapshot IS NOT NEW.system_reference_snapshot OR
     OLD.created_by IS NOT NEW.created_by OR
     OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT,'report attachment link immutable');
END;

-- An upload may be detached while it is still temporary, quarantined or
-- scanner-rejected.  This is deliberately allowed for quarantined/rejected
-- rows because the durable scanner can update the document before the cleanup
-- service gets to remove the report link.  Committed links are retained as
-- evidence and cannot be removed.
CREATE TRIGGER report_document_link_delete_guard
BEFORE DELETE ON report_document_link
WHEN NOT EXISTS(
  SELECT 1 FROM document d
  WHERE d.id=OLD.document_id
    AND d.state IN('temporary','quarantined','rejected')
    AND d.state<>'committed'
)
BEGIN
  SELECT RAISE(ABORT,'committed report attachment link is immutable');
END;

CREATE TRIGGER report_document_link_daily_report_delete_guard
BEFORE DELETE ON daily_report
WHEN EXISTS(
  SELECT 1 FROM report_document_link l
  WHERE l.report_type='daily' AND l.report_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'daily report has report attachments');
END;
CREATE TRIGGER report_document_link_technical_report_delete_guard
BEFORE DELETE ON technical_report
WHEN EXISTS(
  SELECT 1 FROM report_document_link l
  WHERE l.report_type='technical' AND l.report_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'technical report has report attachments');
END;

CREATE TRIGGER report_document_link_daily_report_project_guard
BEFORE UPDATE OF project_id ON daily_report
WHEN NEW.project_id IS NOT OLD.project_id AND EXISTS(
  SELECT 1 FROM report_document_link l
  WHERE l.report_type='daily' AND l.report_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'daily report project is immutable with attachments');
END;
CREATE TRIGGER report_document_link_technical_report_project_guard
BEFORE UPDATE OF project_id ON technical_report
WHEN NEW.project_id IS NOT OLD.project_id AND EXISTS(
  SELECT 1 FROM report_document_link l
  WHERE l.report_type='technical' AND l.report_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'technical report project is immutable with attachments');
END;
CREATE TRIGGER report_document_link_technical_system_guard
BEFORE UPDATE OF system_name ON technical_report
WHEN NEW.system_name IS NOT OLD.system_name AND EXISTS(
  SELECT 1 FROM report_document_link l
  WHERE l.report_type='technical' AND l.report_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'technical report system identity is immutable with attachments');
END;

-- A report may leave its editable draft/needs_changes states only after every
-- linked document is committed and either has a clean scanner result or is a
-- committed/not_scanned result produced by the scanner-disabled finalize path.
-- An empty attachment set remains valid: attachments are optional for the
-- report family.
CREATE TRIGGER report_document_link_daily_report_approval_guard
BEFORE UPDATE OF approval_state ON daily_report
WHEN NEW.approval_state NOT IN('draft','needs_changes') AND EXISTS(
  SELECT 1
  FROM report_document_link l
  JOIN document d ON d.id=l.document_id
  WHERE l.report_type='daily'
    AND l.report_id=OLD.id
    AND NOT(d.state='committed' AND d.scan_status IN('clean','not_scanned'))
  )
BEGIN
  SELECT RAISE(ABORT,'daily report attachments must be committed and scanner-valid before approval');
END;
CREATE TRIGGER report_document_link_technical_report_approval_guard
BEFORE UPDATE OF approval_state ON technical_report
WHEN NEW.approval_state NOT IN('draft','needs_changes') AND EXISTS(
  SELECT 1
  FROM report_document_link l
  JOIN document d ON d.id=l.document_id
  WHERE l.report_type='technical'
    AND l.report_id=OLD.id
    AND NOT(d.state='committed' AND d.scan_status IN('clean','not_scanned'))
  )
BEGIN
  SELECT RAISE(ABORT,'technical report attachments must be committed and scanner-valid before approval');
END;

-- Keep the relation immutable while allowing the scanner's temporary ->
-- quarantined -> committed state transitions.  Once a linked document is
-- committed, it cannot be downgraded or deleted, and its project/supersedes
-- identity cannot be rewritten.  A temporary linked upload is still
-- detachable above; unrelated documents retain their existing application-
-- level lifecycle policy.
CREATE TRIGGER report_document_link_document_project_guard
BEFORE UPDATE OF project_id ON document
WHEN NEW.project_id IS NOT OLD.project_id AND EXISTS(
  SELECT 1 FROM report_document_link l WHERE l.document_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'linked report attachment project is immutable');
END;
CREATE TRIGGER report_document_link_document_supersedes_guard
BEFORE UPDATE OF supersedes_id ON document
WHEN NEW.supersedes_id IS NOT OLD.supersedes_id AND EXISTS(
  SELECT 1 FROM report_document_link l WHERE l.document_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'linked report attachment supersession is immutable');
END;
CREATE TRIGGER report_document_link_committed_state_guard
BEFORE UPDATE OF state ON document
WHEN OLD.state='committed' AND NEW.state<>'committed' AND EXISTS(
  SELECT 1 FROM report_document_link l WHERE l.document_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'committed report attachment cannot be downgraded');
END;
CREATE TRIGGER report_document_link_document_delete_guard
BEFORE DELETE ON document
WHEN EXISTS(
  SELECT 1 FROM report_document_link l WHERE l.document_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'report attachment document is immutable');
END;

-- These reviewed audit identities are installed in the same transaction as
-- the schema and then the registry insert guard is restored before commit.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(
  contract_version,action,entity_type,actor_kind,owner_packet,data_classification
) VALUES
  ('B5-R4','report.attachment_link','document','user','CE-CORE07','confidential'),
  ('B5-R4','report.attachment_supersede','document','user','CE-CORE07','confidential');
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
