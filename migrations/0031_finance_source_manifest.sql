-- Client Essential source allocation truth and idempotent invoice corrections.
-- Existing issued invoices intentionally remain without manifest rows: absence
-- means legacy/unknown, never fabricated inclusion truth.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;

ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v30;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 31),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge',
    'client_essential_client_fields','client_essential_report_attachments',
    'client_essential_temporary_upload_cleanup','client_essential_20260824',
    'period_report_reapproval','period_report_source_binding','finance_source_manifest'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v30;

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
DROP TABLE migration_contract_metadata_v30;

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

CREATE TABLE invoice_commercial_source_manifest(
  manifest_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK(source_type IN(
    'time','expense','milestone','minimum_top_up','fixed_price','adjustment'
  )),
  source_id TEXT NOT NULL,
  source_version INTEGER,
  disposition TEXT NOT NULL CHECK(disposition IN(
    'included','partially_included','blocked','excluded','legacy_unknown'
  )),
  original_minor INTEGER,
  allocated_minor INTEGER,
  remaining_minor INTEGER,
  reason_code TEXT NOT NULL,
  source_hash TEXT CHECK(source_hash IS NULL OR (
    length(source_hash)=64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  )),
  created_at TEXT NOT NULL,
  locked_at TEXT,
  CHECK(original_minor IS NULL OR original_minor>=0),
  CHECK(allocated_minor IS NULL OR allocated_minor>=0),
  CHECK(remaining_minor IS NULL OR remaining_minor>=0),
  CHECK(
    original_minor IS NULL OR allocated_minor IS NULL OR remaining_minor IS NULL OR
    original_minor=allocated_minor+remaining_minor
  ),
  UNIQUE(invoice_id,source_type,source_id)
) STRICT;
CREATE INDEX invoice_commercial_source_manifest_invoice_idx
  ON invoice_commercial_source_manifest(invoice_id,disposition,source_type,source_id);

CREATE TRIGGER invoice_commercial_source_manifest_no_update
BEFORE UPDATE ON invoice_commercial_source_manifest
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id
    AND i.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice commercial source manifest is immutable'); END;
CREATE TRIGGER invoice_commercial_source_manifest_no_delete
BEFORE DELETE ON invoice_commercial_source_manifest
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice i WHERE i.id=OLD.invoice_id
    AND i.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice commercial source manifest is immutable'); END;

ALTER TABLE invoice_adjustment ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX invoice_adjustment_idempotency_unique
  ON invoice_adjustment(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Migration 0024 only admitted successful reconciliation snapshots. Client
-- Essential also requires an immutable, inspectable blocked snapshot when an
-- authoritative source cut is incomplete. Keep the closed 25-field shape but
-- admit both JSON boolean values; the application derives the value and the
-- revision row records CLEAN/BLOCKED independently of caller input.
DROP TRIGGER accounting_pack_revision_snapshot_reconciliation_shape_guard;
CREATE TRIGGER accounting_pack_revision_snapshot_reconciliation_shape_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN json_valid(NEW.reconciliation_json)=0 OR json_type(NEW.reconciliation_json) IS NOT 'object' OR
  (SELECT count(*) FROM json_each(NEW.reconciliation_json))<>25 OR
  (SELECT count(DISTINCT value.key) FROM json_each(NEW.reconciliation_json) value)<>25 OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.reconciliation_json) value
    WHERE value.key NOT IN(
      'schema_version','period_start','period_end','currency','timezone',
      'invoice_count','payment_count','worker_cost_count','expense_count',
      'source_item_count','invoice_source_count','source_mismatch_count',
      'approved_time_entry_count','approved_expense_count','net_minor','tax_minor',
      'gross_minor','collected_minor','outstanding_minor','worker_cost_minor',
      'expense_cost_minor','direct_cost_minor','contribution_minor','checks','reconciles'
    )
  ) OR
  json_type(NEW.reconciliation_json,'$.schema_version') IS NOT 'text' OR
  json_extract(NEW.reconciliation_json,'$.schema_version')<>'accounting-pack-reconciliation-v1' OR
  json_type(NEW.reconciliation_json,'$.period_start') IS NOT 'text' OR
  json_type(NEW.reconciliation_json,'$.period_end') IS NOT 'text' OR
  json_type(NEW.reconciliation_json,'$.currency') IS NOT 'text' OR
  json_type(NEW.reconciliation_json,'$.timezone') IS NOT 'text' OR
  json_type(NEW.reconciliation_json,'$.invoice_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.payment_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.worker_cost_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.expense_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.source_item_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.invoice_source_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.source_mismatch_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.approved_time_entry_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.approved_expense_count') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.net_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.tax_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.gross_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.collected_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.outstanding_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.worker_cost_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.expense_cost_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.direct_cost_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.contribution_minor') IS NOT 'integer' OR
  json_type(NEW.reconciliation_json,'$.checks') IS NOT 'object' OR
  json_type(NEW.reconciliation_json,'$.reconciles') NOT IN ('true','false')
BEGIN SELECT RAISE(ABORT,'accounting pack reconciliation JSON shape is not reviewed'); END;
