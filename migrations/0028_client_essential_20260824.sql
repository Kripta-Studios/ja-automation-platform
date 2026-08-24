-- Client Essential 2026-08-24 additive domain contract.
--
-- This migration does not infer or backfill commercial configuration,
-- payment dates, snapshot hashes or customer conformity.  Existing rows keep
-- their prior values; callers must create an explicit policy/snapshot/signoff
-- record when the authoritative value exists.

-- The reviewed B5 metadata registry is append-only.  Widen its historical
-- CHECK contract transactionally, preserving all rows byte-for-byte before
-- the migration runner records migration 28.  The finance cutover remains
-- tied to its original immutable migration-20 row.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v27;

CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 28),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824'
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
FROM migration_contract_metadata_v27;

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
DROP TABLE migration_contract_metadata_v27;

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

-- Extend the reviewed audit vocabulary for the new Essential configuration,
-- planning and conformity operations.  Runtime self-registration remains
-- forbidden after these literal migration-owned rows are installed.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(
  contract_version,action,entity_type,actor_kind,owner_packet,data_classification
) VALUES
  ('B5-R4','canonical_legal_entity.configure','legal_entity_revision','user','WP-03','restricted'),
  ('B5-R4','project_legal_entity.assign','project_legal_entity_assignment','user','WP-03','restricted'),
  ('B5-R4','expense.classify','expense','user','WP-03','restricted'),
  ('B5-R4','project_commercial_policy.create','project_commercial_policy','user','WP-03','restricted'),
  ('B5-R4','invoice.planning_update','invoice','user','WP-03','restricted'),
  ('B5-R4','expense.planning_update','expense','user','WP-03','restricted'),
  ('B5-R4','compensation_settlement.planning_update','compensation_settlement','user','WP-03','restricted'),
  ('B5-R4','customer_conformity.create','customer_conformity','user','WP-04','restricted'),
  ('B5-R4','customer_conformity.invalidate','customer_conformity_invalidation','user','WP-04','restricted');
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
CREATE TRIGGER audit_action_registry_no_replace BEFORE INSERT ON audit_action_registry
WHEN EXISTS(
  SELECT 1 FROM audit_action_registry existing
  WHERE existing.contract_version=NEW.contract_version
    AND existing.action=NEW.action
    AND existing.entity_type=NEW.entity_type
    AND existing.actor_kind=NEW.actor_kind
)
BEGIN SELECT RAISE(ABORT,'audit registry immutable'); END;

-- Optional identifiers and expected dates are intentionally NULL for legacy
-- rows.  No date or commercial meaning is fabricated by this migration.
ALTER TABLE client ADD COLUMN client_code TEXT
  CHECK(client_code IS NULL OR length(trim(client_code))>0);
CREATE UNIQUE INDEX client_client_code_unique
  ON client(trim(client_code)) WHERE client_code IS NOT NULL;

ALTER TABLE project ADD COLUMN cost_center_code TEXT
  CHECK(cost_center_code IS NULL OR length(trim(cost_center_code))>0);

ALTER TABLE invoice ADD COLUMN planned_issue_on TEXT;
ALTER TABLE invoice ADD COLUMN expected_collection_on TEXT;
ALTER TABLE compensation_settlement ADD COLUMN expected_payment_on TEXT;
ALTER TABLE expense ADD COLUMN expected_reimbursement_on TEXT;
ALTER TABLE expense ADD COLUMN expected_recovery_on TEXT;
ALTER TABLE expense ADD COLUMN commercial_classification_state TEXT NOT NULL DEFAULT 'legacy_classified'
  CHECK(commercial_classification_state IN('unclassified','classified','legacy_classified'));

ALTER TABLE period_report ADD COLUMN snapshot_version INTEGER NOT NULL DEFAULT 1
  CHECK(snapshot_version>=1);
ALTER TABLE period_report ADD COLUMN snapshot_sha256 TEXT
  CHECK(snapshot_sha256 IS NULL OR
    (length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'));

-- Finance/Admin-owned effective-dated commercial interpretation.  A worker
-- time or expense row never carries these decisions.  Policy rows are
-- append-only; an amended policy is a successor with a new effective range.
CREATE TABLE project_commercial_policy(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL
    REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  supersedes_policy_id TEXT UNIQUE
    REFERENCES project_commercial_policy(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  effective_from TEXT NOT NULL
    CHECK(length(trim(effective_from))=10 AND date(effective_from)=effective_from),
  effective_to TEXT
    CHECK(effective_to IS NULL OR
      (length(trim(effective_to))=10 AND date(effective_to)=effective_to)),
  overtime_enabled INTEGER NOT NULL CHECK(overtime_enabled IN(0,1)),
  overtime_threshold_minutes INTEGER
    CHECK((overtime_enabled=1 AND overtime_threshold_minutes IS NOT NULL AND overtime_threshold_minutes BETWEEN 1 AND 1440) OR
      (overtime_enabled=0 AND overtime_threshold_minutes IS NULL)),
  travel_client_billable INTEGER NOT NULL CHECK(travel_client_billable IN(0,1)),
  customer_signoff_required INTEGER NOT NULL CHECK(customer_signoff_required IN(0,1)),
  created_by TEXT NOT NULL
    REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at))>0),
  version INTEGER NOT NULL CHECK(version>0),
  CHECK(effective_to IS NULL OR effective_to>effective_from)
) STRICT;
CREATE INDEX project_commercial_policy_lookup_idx
  ON project_commercial_policy(project_id,effective_from,effective_to);

CREATE TRIGGER project_commercial_policy_no_replace
BEFORE INSERT ON project_commercial_policy
WHEN EXISTS(SELECT 1 FROM project_commercial_policy existing WHERE existing.id=NEW.id)
BEGIN SELECT RAISE(ABORT,'commercial policy is immutable; create a successor'); END;

-- A policy is a linear append-only chain.  The first row is the sole genesis;
-- every later row must point at the current tail of the same project and use
-- the next version.  An open-ended predecessor is implicitly closed by the
-- successor's effective_from; an explicitly closed predecessor must end
-- before that date.
CREATE TRIGGER project_commercial_policy_chain_guard
BEFORE INSERT ON project_commercial_policy
WHEN
  (NEW.supersedes_policy_id IS NULL AND (
    NEW.version<>1 OR EXISTS(
      SELECT 1 FROM project_commercial_policy existing
      WHERE existing.project_id=NEW.project_id
    )
  )) OR
  (NEW.supersedes_policy_id IS NOT NULL AND (
    NOT EXISTS(
      SELECT 1 FROM project_commercial_policy predecessor
      WHERE predecessor.id=NEW.supersedes_policy_id
        AND predecessor.project_id=NEW.project_id
        AND predecessor.version+1=NEW.version
        AND predecessor.effective_from<NEW.effective_from
        AND (predecessor.effective_to IS NULL OR predecessor.effective_to<NEW.effective_from)
        AND NOT EXISTS(
          SELECT 1 FROM project_commercial_policy branch
          WHERE branch.supersedes_policy_id=predecessor.id
        )
    )
  ))
BEGIN
  SELECT RAISE(ABORT,'commercial policy must extend the current project policy chain');
END;

CREATE TRIGGER project_commercial_policy_no_update
BEFORE UPDATE ON project_commercial_policy
BEGIN SELECT RAISE(ABORT,'commercial policy is immutable; create a successor'); END;
CREATE TRIGGER project_commercial_policy_no_delete
BEFORE DELETE ON project_commercial_policy
BEGIN SELECT RAISE(ABORT,'commercial policy is immutable'); END;

-- Canonical commercial authority must be explicit and effective-dated.  The
-- legacy v2 table did not protect project identity, deployment scope or
-- overlapping assignments, so add database-boundary guards without guessing
-- assignments for historical projects.
CREATE TRIGGER project_legal_entity_assignment_insert_guard
BEFORE INSERT ON project_legal_entity_assignment
WHEN NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.project_id)
  OR NOT EXISTS(
    SELECT 1 FROM legal_entity_revision revision
    WHERE revision.revision_id=NEW.legal_entity_revision_id
      AND revision.tenant_id=NEW.tenant_id
      AND revision.deployment_id=NEW.deployment_id
      AND revision.effective_from<=NEW.effective_from
      AND (revision.effective_to IS NULL OR
           (NEW.effective_to IS NOT NULL AND NEW.effective_to<=revision.effective_to))
  )
  OR EXISTS(
    SELECT 1 FROM project_legal_entity_assignment existing
    WHERE existing.project_id=NEW.project_id
      AND existing.effective_from<=COALESCE(NEW.effective_to,'9999-12-31T23:59:59.999Z')
      AND NEW.effective_from<=COALESCE(existing.effective_to,'9999-12-31T23:59:59.999Z')
  )
BEGIN
  SELECT RAISE(ABORT,'invalid or overlapping project legal entity assignment');
END;
CREATE TRIGGER project_legal_entity_assignment_no_replace
BEFORE INSERT ON project_legal_entity_assignment
WHEN EXISTS(SELECT 1 FROM project_legal_entity_assignment existing WHERE existing.assignment_id=NEW.assignment_id)
BEGIN SELECT RAISE(ABORT,'project legal entity assignment is immutable'); END;

-- Customer conformity binds to the exact current approved/final customer
-- period-report snapshot.  It contains only signoff identity/evidence; the
-- report snapshot remains the canonical operational source.
CREATE TABLE customer_conformity(
  id TEXT PRIMARY KEY,
  period_report_id TEXT NOT NULL
    REFERENCES period_report(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  snapshot_version INTEGER NOT NULL CHECK(snapshot_version>=1),
  snapshot_sha256 TEXT NOT NULL
    CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  snapshot_json TEXT NOT NULL CHECK(length(trim(snapshot_json))>0),
  report_pdf_storage_key TEXT NOT NULL CHECK(
    length(report_pdf_storage_key)>0 AND substr(report_pdf_storage_key,1,1)<>'/' AND
    instr(report_pdf_storage_key,char(92))=0 AND instr(report_pdf_storage_key,char(0))=0 AND
    report_pdf_storage_key NOT GLOB '*[' || char(1) || '-' || char(31) || ']*' AND
    instr(report_pdf_storage_key,':')=0 AND instr(report_pdf_storage_key,'..')=0 AND
    report_pdf_storage_key NOT LIKE './%' AND report_pdf_storage_key NOT LIKE '%/./%' AND
    report_pdf_storage_key NOT LIKE '%/.' AND instr(lower(report_pdf_storage_key),'%2e')=0 AND
    instr(lower(report_pdf_storage_key),'://')=0
  ),
  report_pdf_sha256 TEXT NOT NULL
    CHECK(length(report_pdf_sha256)=64 AND report_pdf_sha256 NOT GLOB '*[^0-9a-f]*'),
  report_pdf_byte_length INTEGER NOT NULL CHECK(report_pdf_byte_length>0),
  signer_name TEXT NOT NULL CHECK(length(trim(signer_name))>0),
  signer_identity TEXT,
  signed_at TEXT NOT NULL CHECK(length(trim(signed_at))>0),
  signature_document_id TEXT
    REFERENCES document(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_by TEXT NOT NULL
    REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at))>0),
  UNIQUE(period_report_id,snapshot_version,snapshot_sha256)
) STRICT;

CREATE INDEX customer_conformity_report_idx
  ON customer_conformity(period_report_id,snapshot_version,snapshot_sha256);

-- SQLite REPLACE deletes conflicting rows before inserting when recursive
-- triggers are disabled.  Reject all identity/snapshot conflicts up front so
-- append-only history cannot be replaced through that statement form.
CREATE TRIGGER customer_conformity_no_replace
BEFORE INSERT ON customer_conformity
WHEN EXISTS(
  SELECT 1 FROM customer_conformity existing
  WHERE existing.id=NEW.id OR (
    existing.period_report_id=NEW.period_report_id AND
    existing.snapshot_version=NEW.snapshot_version AND
    existing.snapshot_sha256=NEW.snapshot_sha256
  )
)
BEGIN SELECT RAISE(ABORT,'customer conformity is immutable'); END;

CREATE TRIGGER customer_conformity_snapshot_guard
BEFORE INSERT ON customer_conformity
WHEN NOT EXISTS(
  SELECT 1 FROM period_report report
  WHERE report.id=NEW.period_report_id
    AND report.audience='customer'
    AND report.state IN('approved','final')
    AND report.snapshot_version=NEW.snapshot_version
    AND report.snapshot_sha256=NEW.snapshot_sha256
    AND report.snapshot_json=NEW.snapshot_json
    AND NEW.snapshot_sha256=ja_finance_hash_v1(NEW.snapshot_json)
    AND report.pdf_storage_key=NEW.report_pdf_storage_key
    AND report.pdf_sha256=NEW.report_pdf_sha256
    AND report.pdf_byte_length=NEW.report_pdf_byte_length
    AND length(trim(report.pdf_storage_key))>0
    AND report.pdf_sha256 NOT GLOB '*[^0-9a-f]*'
    AND report.pdf_byte_length>0
)
BEGIN
  SELECT RAISE(ABORT,'customer conformity must bind the current approved customer snapshot');
END;

CREATE TRIGGER customer_conformity_no_update
BEFORE UPDATE ON customer_conformity
BEGIN SELECT RAISE(ABORT,'customer conformity is immutable'); END;
CREATE TRIGGER customer_conformity_no_delete
BEFORE DELETE ON customer_conformity
BEGIN SELECT RAISE(ABORT,'customer conformity is immutable'); END;

-- Invalidation is an append-only one-to-one event.  A replacement conformity
-- is a new row bound to a new/current snapshot, never an edit of history.
CREATE TABLE customer_conformity_invalidation(
  id TEXT PRIMARY KEY,
  conformity_id TEXT NOT NULL UNIQUE
    REFERENCES customer_conformity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  actor_id TEXT NOT NULL
    REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL CHECK(length(trim(occurred_at))>0)
) STRICT;

CREATE INDEX customer_conformity_invalidation_conformity_idx
  ON customer_conformity_invalidation(conformity_id,occurred_at);

CREATE TRIGGER customer_conformity_invalidation_no_replace
BEFORE INSERT ON customer_conformity_invalidation
WHEN EXISTS(
  SELECT 1 FROM customer_conformity_invalidation existing
  WHERE existing.id=NEW.id OR existing.conformity_id=NEW.conformity_id
)
BEGIN SELECT RAISE(ABORT,'customer conformity invalidation is immutable'); END;

CREATE TRIGGER customer_conformity_invalidation_no_update
BEFORE UPDATE ON customer_conformity_invalidation
BEGIN SELECT RAISE(ABORT,'customer conformity invalidation is immutable'); END;
CREATE TRIGGER customer_conformity_invalidation_no_delete
BEFORE DELETE ON customer_conformity_invalidation
BEGIN SELECT RAISE(ABORT,'customer conformity invalidation is immutable'); END;

-- Once a conformity exists, the report's signed snapshot/PDF binding cannot
-- move until that conformity is explicitly invalidated.  After invalidation,
-- the report may be refreshed and a new immutable conformity may bind it.
CREATE TRIGGER period_report_customer_conformity_refresh_guard
BEFORE UPDATE OF snapshot_version,snapshot_sha256,snapshot_json,
  pdf_storage_key,pdf_sha256,pdf_byte_length ON period_report
WHEN EXISTS(
  SELECT 1 FROM customer_conformity conformity
  WHERE conformity.period_report_id=OLD.id
    AND NOT EXISTS(
      SELECT 1 FROM customer_conformity_invalidation invalidation
      WHERE invalidation.conformity_id=conformity.id
    )
) AND (
  OLD.snapshot_version IS NOT NEW.snapshot_version OR
  OLD.snapshot_sha256 IS NOT NEW.snapshot_sha256 OR
  OLD.snapshot_json IS NOT NEW.snapshot_json OR
  OLD.pdf_storage_key IS NOT NEW.pdf_storage_key OR
  OLD.pdf_sha256 IS NOT NEW.pdf_sha256 OR
  OLD.pdf_byte_length IS NOT NEW.pdf_byte_length
)
BEGIN
  SELECT RAISE(ABORT,'customer report snapshot is bound to active conformity');
END;

CREATE TRIGGER period_report_customer_conformity_identity_guard
BEFORE UPDATE OF id,project_id,period_start,period_end,audience,report_type,state,created_by,created_at
ON period_report
WHEN EXISTS(
  SELECT 1 FROM customer_conformity conformity
  WHERE conformity.period_report_id=OLD.id
) AND (
  OLD.id IS NOT NEW.id OR OLD.project_id IS NOT NEW.project_id OR
  OLD.period_start IS NOT NEW.period_start OR OLD.period_end IS NOT NEW.period_end OR
  OLD.audience IS NOT NEW.audience OR OLD.report_type IS NOT NEW.report_type OR
  OLD.state IS NOT NEW.state OR OLD.created_by IS NOT NEW.created_by OR
  OLD.created_at IS NOT NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT,'customer report identity is bound to active conformity');
END;

CREATE TRIGGER period_report_snapshot_version_monotonic
BEFORE UPDATE OF snapshot_version ON period_report
WHEN NEW.snapshot_version<>OLD.snapshot_version AND NEW.snapshot_version<=OLD.snapshot_version
BEGIN
  SELECT RAISE(ABORT,'period report snapshot version must increase');
END;
