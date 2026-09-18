-- Widen the immutable reviewed-migration ledger before runner metadata is added.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v47;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 48),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge','client_essential_client_fields',
    'client_essential_report_attachments','client_essential_temporary_upload_cleanup',
    'client_essential_20260824','period_report_reapproval','period_report_source_binding',
    'finance_source_manifest','client_essential_worker_statement_jobs',
    'client_essential_service_actor_namespace','client_essential_invoice_immutability',
    'stalwart_mail_integration','time_returned_correction','production_mfa_enforcement',
    'customer_conformity_evidence_attachment','mfa_optional_policy','astra_project_closeout_revisions',
    'astra_period_followup','supplier_workforce','supplier_directory_lifecycle','owner_record_management',
    'supplier_contact_directory','worker_compensation_payments','supplier_time_batch_idempotency',
    'accounting_pack_signed_credit_balances'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v47;
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
DROP TABLE migration_contract_metadata_v47;
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

-- The v24 snapshot constraints treated every issued invoice total as a debit.
-- Issued credit adjustments are signed financial history, so net, tax, gross
-- and outstanding may cross zero. Keep all other closed-schema, exact-money,
-- cost, count, date, hash, scope and immutability constraints unchanged.
CREATE TABLE accounting_pack_revision_snapshot_v48(
  revision_id TEXT PRIMARY KEY
    REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL
    REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_cut_id TEXT NOT NULL
    REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_cut_hash TEXT NOT NULL
    CHECK(length(source_cut_hash)=64 AND source_cut_hash NOT GLOB '*[^0-9a-f]*'),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  snapshot_sha256 TEXT NOT NULL
    CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  reconciliation_json TEXT NOT NULL CHECK(json_valid(reconciliation_json)),
  reconciliation_sha256 TEXT NOT NULL
    CHECK(length(reconciliation_sha256)=64 AND reconciliation_sha256 NOT GLOB '*[^0-9a-f]*'),
  command_id TEXT NOT NULL
    REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  audit_event_id TEXT NOT NULL
    REFERENCES audit_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(
    length(created_at)=24 AND
    strftime('%Y-%m-%dT%H:%M:%fZ',created_at)=created_at
  ),
  schema_version TEXT NOT NULL DEFAULT 'accounting-pack-snapshot-v1'
    CHECK(schema_version='accounting-pack-snapshot-v1'),
  timezone TEXT NOT NULL CHECK(length(timezone)>0 AND timezone NOT GLOB '*[^A-Za-z0-9_+./:-]*'),
  invoice_count INTEGER NOT NULL CHECK(invoice_count>=0),
  payment_count INTEGER NOT NULL CHECK(payment_count>=0),
  worker_cost_count INTEGER NOT NULL CHECK(worker_cost_count>=0),
  expense_count INTEGER NOT NULL CHECK(expense_count>=0),
  source_item_count INTEGER NOT NULL CHECK(source_item_count>=0),
  invoice_source_count INTEGER NOT NULL CHECK(invoice_source_count>=0),
  source_mismatch_count INTEGER NOT NULL CHECK(source_mismatch_count>=0),
  approved_time_entry_count INTEGER NOT NULL CHECK(approved_time_entry_count>=0),
  approved_expense_count INTEGER NOT NULL CHECK(approved_expense_count>=0),
  net_minor INTEGER NOT NULL,
  tax_minor INTEGER NOT NULL,
  gross_minor INTEGER NOT NULL CHECK(gross_minor=net_minor+tax_minor),
  collected_minor INTEGER NOT NULL CHECK(collected_minor>=0),
  outstanding_minor INTEGER NOT NULL,
  worker_cost_minor INTEGER NOT NULL CHECK(worker_cost_minor>=0),
  expense_cost_minor INTEGER NOT NULL CHECK(expense_cost_minor>=0),
  direct_cost_minor INTEGER NOT NULL CHECK(direct_cost_minor>=0 AND direct_cost_minor=worker_cost_minor+expense_cost_minor),
  contribution_minor INTEGER NOT NULL CHECK(contribution_minor=net_minor-direct_cost_minor),
  CHECK(period_start<period_end),
  CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  CHECK(period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_start)=period_start),
  CHECK(period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_end)=period_end),
  FOREIGN KEY(tenant_id,deployment_id)
    REFERENCES deployment_identity(tenant_id,deployment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

INSERT INTO accounting_pack_revision_snapshot_v48(
  revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
  source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,
  reconciliation_sha256,command_id,audit_event_id,created_at,schema_version,timezone,
  invoice_count,payment_count,worker_cost_count,expense_count,source_item_count,
  invoice_source_count,source_mismatch_count,approved_time_entry_count,approved_expense_count,
  net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,worker_cost_minor,
  expense_cost_minor,direct_cost_minor,contribution_minor
)
SELECT
  revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
  source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,
  reconciliation_sha256,command_id,audit_event_id,created_at,schema_version,timezone,
  invoice_count,payment_count,worker_cost_count,expense_count,source_item_count,
  invoice_source_count,source_mismatch_count,approved_time_entry_count,approved_expense_count,
  net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,worker_cost_minor,
  expense_cost_minor,direct_cost_minor,contribution_minor
FROM accounting_pack_revision_snapshot;
DROP TRIGGER finance_source_cut_item_snapshot_seal_guard;
DROP TRIGGER accounting_pack_source_cut_batch_snapshot_seal_guard;
DROP TRIGGER accounting_pack_source_cut_item_snapshot_seal_guard;
DROP TRIGGER accounting_pack_legacy_run_bridge_subject_guard;
DROP TRIGGER accounting_pack_legacy_run_bridge_hash_guard;
DROP TABLE accounting_pack_revision_snapshot;
ALTER TABLE accounting_pack_revision_snapshot_v48 RENAME TO accounting_pack_revision_snapshot;

CREATE TRIGGER finance_source_cut_item_snapshot_seal_guard
BEFORE INSERT ON finance_source_cut_item
WHEN EXISTS(SELECT 1 FROM accounting_pack_revision_snapshot snapshot
            WHERE snapshot.source_cut_id=NEW.cut_id)
BEGIN SELECT RAISE(ABORT,'source cut is sealed by an accounting pack snapshot'); END;
CREATE TRIGGER accounting_pack_source_cut_batch_snapshot_seal_guard
BEFORE INSERT ON accounting_pack_source_cut_batch
WHEN EXISTS(SELECT 1 FROM accounting_pack_revision_snapshot snapshot
            WHERE snapshot.revision_id=NEW.revision_id OR snapshot.source_cut_id=NEW.cut_id)
BEGIN SELECT RAISE(ABORT,'accounting pack source cut projection is sealed by its snapshot'); END;
CREATE TRIGGER accounting_pack_source_cut_item_snapshot_seal_guard
BEFORE INSERT ON accounting_pack_source_cut_item
WHEN EXISTS(
  SELECT 1 FROM accounting_pack_source_cut_batch batch
  JOIN accounting_pack_revision_snapshot snapshot
    ON snapshot.revision_id=batch.revision_id OR snapshot.source_cut_id=batch.cut_id
  WHERE batch.id=NEW.batch_id
)
BEGIN SELECT RAISE(ABORT,'accounting pack source cut item projection is sealed by its snapshot'); END;

CREATE TRIGGER accounting_pack_legacy_run_bridge_subject_guard
BEFORE INSERT ON accounting_pack_legacy_run_bridge
WHEN NOT EXISTS(
  SELECT 1
  FROM accounting_pack_run legacy_run
  JOIN legal_entity legacy_entity ON legacy_entity.id=legacy_run.legal_entity_id
  JOIN legal_entity_revision_bridge entity_bridge
    ON entity_bridge.legacy_legal_entity_id=legacy_run.legal_entity_id
  JOIN accounting_pack_revision revision ON revision.revision_id=NEW.revision_id
  JOIN accounting_pack_revision_snapshot snapshot ON snapshot.revision_id=revision.revision_id
  JOIN accounting_pack_series series ON series.series_id=revision.series_id
  JOIN legal_entity_revision entity_revision
    ON entity_revision.revision_id=revision.legal_entity_revision_id
  JOIN finance_source_cut cut ON cut.cut_id=revision.source_cut_id
  WHERE legacy_run.id=NEW.legacy_run_id
    AND legacy_run.legal_entity_id IS NOT NULL
    AND legacy_run.state='final'
    AND legacy_run.legal_entity_id=NEW.legacy_legal_entity_id
    AND legacy_run.period_start=NEW.period_start
    AND legacy_run.period_end=NEW.period_end
    AND legacy_entity.currency=NEW.currency
    AND entity_bridge.tenant_id=NEW.tenant_id
    AND entity_bridge.deployment_id=NEW.deployment_id
    AND entity_bridge.canonical_revision_id=NEW.legal_entity_revision_id
    AND revision.tenant_id=NEW.tenant_id
    AND revision.deployment_id=NEW.deployment_id
    AND revision.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND revision.currency=NEW.currency
    AND revision.period_start=NEW.period_start
    AND revision.period_end=NEW.period_end
    AND revision.source_cut_id=NEW.source_cut_id
    AND revision.source_cut_hash=NEW.source_cut_hash
    AND series.tenant_id=NEW.tenant_id
    AND series.deployment_id=NEW.deployment_id
    AND series.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND series.currency=NEW.currency
    AND series.period_start=NEW.period_start
    AND series.period_end=NEW.period_end
    AND series.timezone=NEW.timezone
    AND snapshot.tenant_id=NEW.tenant_id
    AND snapshot.deployment_id=NEW.deployment_id
    AND snapshot.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND snapshot.currency=NEW.currency
    AND snapshot.period_start=NEW.period_start
    AND snapshot.period_end=NEW.period_end
    AND snapshot.source_cut_id=NEW.source_cut_id
    AND snapshot.source_cut_hash=NEW.source_cut_hash
    AND snapshot.timezone=NEW.timezone
    AND snapshot.snapshot_sha256=NEW.snapshot_sha256
    AND snapshot.reconciliation_sha256=NEW.reconciliation_sha256
    AND entity_revision.tenant_id=NEW.tenant_id
    AND entity_revision.deployment_id=NEW.deployment_id
    AND entity_revision.base_currency=NEW.currency
    AND entity_revision.timezone=NEW.timezone
    AND cut.tenant_id=NEW.tenant_id
    AND cut.deployment_id=NEW.deployment_id
    AND cut.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND cut.currency=NEW.currency
    AND cut.period_start=NEW.period_start
    AND cut.period_end=NEW.period_end
    AND cut.cut_hash=NEW.source_cut_hash
) OR NOT EXISTS(
  SELECT 1 FROM finance_command command
  JOIN finance_command_target target ON target.command_id=command.command_id
  WHERE command.command_id=NEW.command_id
    AND command.tenant_id=NEW.tenant_id
    AND command.deployment_id=NEW.deployment_id
    AND command.state='completed'
    AND command.completed_at IS NOT NULL
    AND command.operation='accounting_pack_legacy_run_bridge.create'
    AND command.target_kind='accounting_pack_legacy_run_bridge'
    AND command.target_semantic_id=NEW.bridge_id
    AND target.target_semantic_id=NEW.bridge_id
    AND target.target_kind='accounting_pack_legacy_run_bridge'
    AND target.target_contract_version='accounting-pack-legacy-run-bridge-v1'
) OR NOT EXISTS(
  SELECT 1 FROM audit_event audit
  JOIN finance_command command ON command.command_id=NEW.command_id
  WHERE audit.id=NEW.audit_event_id
    AND audit.tenant_id=NEW.tenant_id
    AND audit.deployment_id=NEW.deployment_id
    AND audit.audit_contract_version='B5-R4'
    AND audit.action='accounting_pack_legacy_run_bridge.create'
    AND audit.entity_type='accounting_pack_legacy_run_bridge'
    AND audit.entity_id=NEW.bridge_id
    AND audit.actor_kind='user'
    AND audit.actor_id=command.principal_id
    AND audit.provenance='native'
    AND audit.correlation_id=command.command_id
    AND json_valid(audit.details_json)
    AND json_type(audit.details_json)='object'
    AND (SELECT count(*) FROM json_each(audit.details_json))=5
    AND (SELECT count(DISTINCT value.key) FROM json_each(audit.details_json) value)=5
    AND NOT EXISTS(
      SELECT 1 FROM json_each(audit.details_json) value
      WHERE value.key NOT IN('command_id','command_hash','target_kind','target_semantic_id','target_contract_version')
    )
    AND json_type(audit.details_json,'$.command_id')='text'
    AND json_type(audit.details_json,'$.command_hash')='text'
    AND json_type(audit.details_json,'$.target_kind')='text'
    AND json_type(audit.details_json,'$.target_semantic_id')='text'
    AND json_type(audit.details_json,'$.target_contract_version')='text'
    AND json_extract(audit.details_json,'$.command_id')=command.command_id
    AND json_extract(audit.details_json,'$.command_hash')=command.command_hash
    AND json_extract(audit.details_json,'$.target_kind')=command.target_kind
    AND json_extract(audit.details_json,'$.target_semantic_id')=command.target_semantic_id
    AND json_extract(audit.details_json,'$.target_contract_version')='accounting-pack-legacy-run-bridge-v1'
)
BEGIN SELECT RAISE(ABORT,'legacy accounting pack bridge is outside its scoped canonical run'); END;

CREATE TRIGGER accounting_pack_legacy_run_bridge_hash_guard
BEFORE INSERT ON accounting_pack_legacy_run_bridge
WHEN NOT EXISTS(
  SELECT 1 FROM accounting_pack_run legacy_run
  WHERE legacy_run.id=NEW.legacy_run_id
    AND lower(ja_finance_hash_v1(legacy_run.snapshot_json))=NEW.legacy_snapshot_sha256
    AND lower(ja_finance_hash_v1(legacy_run.reconciliation_json))=NEW.legacy_reconciliation_sha256
) OR NEW.snapshot_sha256<> (
  SELECT snapshot.snapshot_sha256
  FROM accounting_pack_revision_snapshot snapshot
  WHERE snapshot.revision_id=NEW.revision_id
) OR NEW.reconciliation_sha256<> (
  SELECT snapshot.reconciliation_sha256
  FROM accounting_pack_revision_snapshot snapshot
  WHERE snapshot.revision_id=NEW.revision_id
)
BEGIN SELECT RAISE(ABORT,'legacy accounting pack bridge hash mismatch'); END;

CREATE TRIGGER accounting_pack_revision_snapshot_subject_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN NOT EXISTS(
  SELECT 1
  FROM accounting_pack_revision revision
  JOIN accounting_pack_series series ON series.series_id=revision.series_id
  JOIN legal_entity_revision entity_revision
    ON entity_revision.revision_id=revision.legal_entity_revision_id
  JOIN finance_source_cut cut ON cut.cut_id=revision.source_cut_id
  WHERE revision.revision_id=NEW.revision_id
    AND revision.tenant_id=NEW.tenant_id
    AND revision.deployment_id=NEW.deployment_id
    AND revision.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND revision.currency=NEW.currency
    AND revision.period_start=NEW.period_start
    AND revision.period_end=NEW.period_end
    AND revision.timezone=NEW.timezone
    AND revision.source_cut_id=NEW.source_cut_id
    AND revision.source_cut_hash=NEW.source_cut_hash
    AND series.tenant_id=NEW.tenant_id
    AND series.deployment_id=NEW.deployment_id
    AND series.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND series.currency=NEW.currency
    AND series.period_start=NEW.period_start
    AND series.period_end=NEW.period_end
    AND series.timezone=NEW.timezone
    AND entity_revision.tenant_id=NEW.tenant_id
    AND entity_revision.deployment_id=NEW.deployment_id
    AND entity_revision.base_currency=NEW.currency
    AND entity_revision.timezone=NEW.timezone
    AND cut.tenant_id=NEW.tenant_id
    AND cut.deployment_id=NEW.deployment_id
    AND cut.legal_entity_revision_id=NEW.legal_entity_revision_id
    AND cut.currency=NEW.currency
    AND cut.period_start=NEW.period_start
    AND cut.period_end=NEW.period_end
    AND cut.cut_hash=NEW.source_cut_hash
    AND EXISTS(
      SELECT 1 FROM finance_hash_evidence evidence
      WHERE evidence.evidence_type='source_cut'
        AND evidence.semantic_id=cut.cut_id
        AND evidence.evidence_hash=cut.cut_hash
    )
    AND EXISTS(
      SELECT 1
      FROM accounting_pack_source_cut_batch batch
      WHERE batch.revision_id=revision.revision_id
        AND batch.cut_id=cut.cut_id
        AND batch.cut_hash=cut.cut_hash
        AND batch.change_sequence_high_watermark=cut.change_sequence_high_watermark
    )
    AND NEW.source_item_count=(
      SELECT count(*) FROM finance_source_cut_item item
      WHERE item.cut_id=cut.cut_id
    )
    AND NEW.source_item_count=(
      SELECT count(*)
      FROM accounting_pack_source_cut_batch batch
      JOIN accounting_pack_source_cut_item projected
        ON projected.batch_id=batch.id
      JOIN finance_source_cut_item item
        ON item.id=projected.source_cut_item_id
      WHERE batch.revision_id=revision.revision_id
        AND batch.cut_id=cut.cut_id
        AND item.cut_id=cut.cut_id
    )
    AND NOT EXISTS(
      SELECT 1
      FROM finance_source_cut_item item
      WHERE item.cut_id=cut.cut_id
        AND NOT EXISTS(
          SELECT 1
          FROM accounting_pack_source_cut_batch batch
          JOIN accounting_pack_source_cut_item projected
            ON projected.batch_id=batch.id
          WHERE batch.revision_id=revision.revision_id
            AND batch.cut_id=cut.cut_id
            AND projected.source_cut_item_id=item.id
        )
    )
    AND NOT EXISTS(
      SELECT 1
      FROM accounting_pack_source_cut_batch batch
      JOIN accounting_pack_source_cut_item projected
        ON projected.batch_id=batch.id
      WHERE batch.revision_id=revision.revision_id
        AND batch.cut_id=cut.cut_id
        AND NOT EXISTS(
          SELECT 1
          FROM finance_source_cut_item item
          WHERE item.id=projected.source_cut_item_id
            AND item.cut_id=cut.cut_id
        )
    )
    AND NOT EXISTS(
      SELECT 1
      FROM accounting_pack_source_cut_batch batch
      JOIN accounting_pack_source_cut_item projected
        ON projected.batch_id=batch.id
      JOIN finance_source_cut_item item
        ON item.id=projected.source_cut_item_id
      WHERE batch.revision_id=revision.revision_id
        AND batch.cut_id=cut.cut_id
        AND (projected.evidence_hash<>item.evidence_hash OR
             item.currency IS NULL OR item.currency<>cut.currency)
    )
    AND NOT EXISTS(
      SELECT 1 FROM finance_source_cut_item item
      WHERE item.cut_id=cut.cut_id
        AND NOT EXISTS(
          SELECT 1 FROM finance_hash_evidence evidence
          WHERE evidence.evidence_id=item.evidence_id
            AND evidence.evidence_hash=item.evidence_hash
            AND evidence.evidence_type=item.evidence_type
        )
    )
) OR NOT EXISTS(
  SELECT 1 FROM finance_command command
  JOIN finance_command_target target ON target.command_id=command.command_id
  WHERE command.command_id=NEW.command_id
    AND command.tenant_id=NEW.tenant_id
    AND command.deployment_id=NEW.deployment_id
    AND command.state='completed'
    AND command.completed_at IS NOT NULL
    AND command.operation='accounting_pack_revision_snapshot.create'
    AND command.target_kind='accounting_pack_revision_snapshot'
    AND command.target_semantic_id=NEW.revision_id
    AND target.target_semantic_id=NEW.revision_id
    AND target.target_kind='accounting_pack_revision_snapshot'
    AND target.target_contract_version='accounting-pack-revision-snapshot-v1'
) OR NOT EXISTS(
  SELECT 1 FROM audit_event audit
  JOIN finance_command command ON command.command_id=NEW.command_id
  WHERE audit.id=NEW.audit_event_id
    AND audit.tenant_id=NEW.tenant_id
    AND audit.deployment_id=NEW.deployment_id
    AND audit.audit_contract_version='B5-R4'
    AND audit.action='accounting_pack_revision_snapshot.create'
    AND audit.entity_type='accounting_pack_revision_snapshot'
    AND audit.entity_id=NEW.revision_id
    AND audit.actor_kind='user'
    AND audit.actor_id=command.principal_id
    AND audit.provenance='native'
    AND audit.correlation_id=command.command_id
    AND json_valid(audit.details_json)
    AND json_type(audit.details_json)='object'
    AND (SELECT count(*) FROM json_each(audit.details_json))=5
    AND (SELECT count(DISTINCT value.key) FROM json_each(audit.details_json) value)=5
    AND NOT EXISTS(
      SELECT 1 FROM json_each(audit.details_json) value
      WHERE value.key NOT IN('command_id','command_hash','target_kind','target_semantic_id','target_contract_version')
    )
    AND json_type(audit.details_json,'$.command_id')='text'
    AND json_type(audit.details_json,'$.command_hash')='text'
    AND json_type(audit.details_json,'$.target_kind')='text'
    AND json_type(audit.details_json,'$.target_semantic_id')='text'
    AND json_type(audit.details_json,'$.target_contract_version')='text'
    AND json_extract(audit.details_json,'$.command_id')=command.command_id
    AND json_extract(audit.details_json,'$.command_hash')=command.command_hash
    AND json_extract(audit.details_json,'$.target_kind')=command.target_kind
    AND json_extract(audit.details_json,'$.target_semantic_id')=command.target_semantic_id
    AND json_extract(audit.details_json,'$.target_contract_version')='accounting-pack-revision-snapshot-v1'
)
BEGIN SELECT RAISE(ABORT,'accounting pack snapshot is outside its canonical scope'); END;

CREATE TRIGGER accounting_pack_revision_snapshot_json_shape_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN json_valid(NEW.snapshot_json)=0 OR json_type(NEW.snapshot_json) IS NOT 'object' OR
  (SELECT count(*) FROM json_each(NEW.snapshot_json))<>32 OR
  (SELECT count(DISTINCT value.key) FROM json_each(NEW.snapshot_json) value)<>32 OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.snapshot_json) value
    WHERE value.key NOT IN(
      'schema_version','period_start','period_end','currency','timezone',
      'invoice_count','payment_count','worker_cost_count','expense_count',
      'source_item_count','invoice_source_count','source_mismatch_count',
      'approved_time_entry_count','approved_expense_count','net_minor','tax_minor',
      'gross_minor','collected_minor','outstanding_minor','worker_cost_minor',
      'expense_cost_minor','direct_cost_minor','contribution_minor',
      'invoice_register','collections','worker_costs','expense_register','ledger',
      'totals','totals_by_currency','source_reconciliation','exact_reconciliation'
    )
  ) OR
  json_type(NEW.snapshot_json,'$.schema_version') IS NOT 'text' OR
  json_extract(NEW.snapshot_json,'$.schema_version')<>NEW.schema_version OR
  json_type(NEW.snapshot_json,'$.period_start') IS NOT 'text' OR
  json_type(NEW.snapshot_json,'$.period_end') IS NOT 'text' OR
  json_type(NEW.snapshot_json,'$.currency') IS NOT 'text' OR
  json_type(NEW.snapshot_json,'$.timezone') IS NOT 'text' OR
  json_type(NEW.snapshot_json,'$.invoice_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.payment_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.worker_cost_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.expense_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_item_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.invoice_source_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_mismatch_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.approved_time_entry_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.approved_expense_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.net_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.tax_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.gross_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.collected_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.outstanding_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.worker_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.expense_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.direct_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.contribution_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.invoice_register') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.collections') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.worker_costs') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.expense_register') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.ledger') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.totals') IS NOT 'object' OR
  json_type(NEW.snapshot_json,'$.totals_by_currency') IS NOT 'array' OR
  json_type(NEW.snapshot_json,'$.source_reconciliation') IS NOT 'object' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation') IS NOT 'object' OR
  (SELECT count(*) FROM json_each(NEW.snapshot_json,'$.totals'))<>10 OR
  (SELECT count(DISTINCT value.key) FROM json_each(NEW.snapshot_json,'$.totals') value)<>10 OR
  json_type(NEW.snapshot_json,'$.totals.currency') IS NOT 'text' OR
  json_type(NEW.snapshot_json,'$.totals.net_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.tax_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.gross_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.collected_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.outstanding_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.worker_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.expense_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.direct_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.totals.contribution_minor') IS NOT 'integer' OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.snapshot_json,'$.totals') value
    WHERE value.key NOT IN(
      'currency','net_minor','tax_minor','gross_minor','collected_minor',
      'outstanding_minor','worker_cost_minor','expense_cost_minor',
      'direct_cost_minor','contribution_minor'
    )
  ) OR
  (SELECT count(*) FROM json_each(NEW.snapshot_json,'$.source_reconciliation'))<>5 OR
  (SELECT count(DISTINCT value.key) FROM json_each(NEW.snapshot_json,'$.source_reconciliation') value)<>5 OR
  json_type(NEW.snapshot_json,'$.source_reconciliation.invoice_source_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_reconciliation.source_mismatch_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_reconciliation.approved_time_entry_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_reconciliation.approved_expense_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.source_reconciliation.source_item_count') IS NOT 'integer' OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.snapshot_json,'$.source_reconciliation') value
    WHERE value.key NOT IN(
      'invoice_source_count','source_mismatch_count','approved_time_entry_count',
      'approved_expense_count','source_item_count'
    )
  ) OR
  (SELECT count(*) FROM json_each(NEW.snapshot_json,'$.exact_reconciliation'))<>14 OR
  (SELECT count(DISTINCT value.key) FROM json_each(NEW.snapshot_json,'$.exact_reconciliation') value)<>14 OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.invoice_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.payment_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.worker_cost_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.expense_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.source_item_count') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.net_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.tax_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.gross_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.collected_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.outstanding_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.worker_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.expense_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.direct_cost_minor') IS NOT 'integer' OR
  json_type(NEW.snapshot_json,'$.exact_reconciliation.contribution_minor') IS NOT 'integer' OR
  EXISTS(
    SELECT 1 FROM json_each(NEW.snapshot_json,'$.exact_reconciliation') value
    WHERE value.key NOT IN(
      'invoice_count','payment_count','worker_cost_count','expense_count',
      'source_item_count','net_minor','tax_minor','gross_minor','collected_minor',
      'outstanding_minor','worker_cost_minor','expense_cost_minor',
      'direct_cost_minor','contribution_minor'
    )
  )
BEGIN SELECT RAISE(ABORT,'accounting pack snapshot JSON shape is not reviewed'); END;

CREATE TRIGGER accounting_pack_revision_snapshot_scalar_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN json_extract(NEW.snapshot_json,'$.period_start')<>NEW.period_start OR
     json_extract(NEW.snapshot_json,'$.period_end')<>NEW.period_end OR
     json_extract(NEW.snapshot_json,'$.currency')<>NEW.currency OR
     json_extract(NEW.snapshot_json,'$.timezone')<>NEW.timezone OR
     json_extract(NEW.snapshot_json,'$.invoice_count')<>NEW.invoice_count OR
     json_extract(NEW.snapshot_json,'$.payment_count')<>NEW.payment_count OR
     json_extract(NEW.snapshot_json,'$.worker_cost_count')<>NEW.worker_cost_count OR
     json_extract(NEW.snapshot_json,'$.expense_count')<>NEW.expense_count OR
     json_extract(NEW.snapshot_json,'$.source_item_count')<>NEW.source_item_count OR
     json_extract(NEW.snapshot_json,'$.invoice_source_count')<>NEW.invoice_source_count OR
     json_extract(NEW.snapshot_json,'$.source_mismatch_count')<>NEW.source_mismatch_count OR
     json_extract(NEW.snapshot_json,'$.approved_time_entry_count')<>NEW.approved_time_entry_count OR
     json_extract(NEW.snapshot_json,'$.approved_expense_count')<>NEW.approved_expense_count OR
     json_extract(NEW.snapshot_json,'$.net_minor')<>NEW.net_minor OR
     json_extract(NEW.snapshot_json,'$.tax_minor')<>NEW.tax_minor OR
     json_extract(NEW.snapshot_json,'$.gross_minor')<>NEW.gross_minor OR
     json_extract(NEW.snapshot_json,'$.collected_minor')<>NEW.collected_minor OR
     json_extract(NEW.snapshot_json,'$.outstanding_minor')<>NEW.outstanding_minor OR
     json_extract(NEW.snapshot_json,'$.worker_cost_minor')<>NEW.worker_cost_minor OR
     json_extract(NEW.snapshot_json,'$.expense_cost_minor')<>NEW.expense_cost_minor OR
     json_extract(NEW.snapshot_json,'$.direct_cost_minor')<>NEW.direct_cost_minor OR
     json_extract(NEW.snapshot_json,'$.contribution_minor')<>NEW.contribution_minor OR
     json_extract(NEW.snapshot_json,'$.totals.currency')<>NEW.currency OR
     json_extract(NEW.snapshot_json,'$.totals.net_minor')<>NEW.net_minor OR
     json_extract(NEW.snapshot_json,'$.totals.tax_minor')<>NEW.tax_minor OR
     json_extract(NEW.snapshot_json,'$.totals.gross_minor')<>NEW.gross_minor OR
     json_extract(NEW.snapshot_json,'$.totals.collected_minor')<>NEW.collected_minor OR
     json_extract(NEW.snapshot_json,'$.totals.outstanding_minor')<>NEW.outstanding_minor OR
     json_extract(NEW.snapshot_json,'$.totals.worker_cost_minor')<>NEW.worker_cost_minor OR
     json_extract(NEW.snapshot_json,'$.totals.expense_cost_minor')<>NEW.expense_cost_minor OR
     json_extract(NEW.snapshot_json,'$.totals.direct_cost_minor')<>NEW.direct_cost_minor OR
     json_extract(NEW.snapshot_json,'$.totals.contribution_minor')<>NEW.contribution_minor OR
     json_extract(NEW.snapshot_json,'$.source_reconciliation.invoice_source_count')<>NEW.invoice_source_count OR
     json_extract(NEW.snapshot_json,'$.source_reconciliation.source_mismatch_count')<>NEW.source_mismatch_count OR
     json_extract(NEW.snapshot_json,'$.source_reconciliation.approved_time_entry_count')<>NEW.approved_time_entry_count OR
     json_extract(NEW.snapshot_json,'$.source_reconciliation.approved_expense_count')<>NEW.approved_expense_count OR
     json_extract(NEW.snapshot_json,'$.source_reconciliation.source_item_count')<>NEW.source_item_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.invoice_count')<>NEW.invoice_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.payment_count')<>NEW.payment_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.worker_cost_count')<>NEW.worker_cost_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.expense_count')<>NEW.expense_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.source_item_count')<>NEW.source_item_count OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.net_minor')<>NEW.net_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.tax_minor')<>NEW.tax_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.gross_minor')<>NEW.gross_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.collected_minor')<>NEW.collected_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.outstanding_minor')<>NEW.outstanding_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.worker_cost_minor')<>NEW.worker_cost_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.expense_cost_minor')<>NEW.expense_cost_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.direct_cost_minor')<>NEW.direct_cost_minor OR
     json_extract(NEW.snapshot_json,'$.exact_reconciliation.contribution_minor')<>NEW.contribution_minor
BEGIN SELECT RAISE(ABORT,'accounting pack snapshot scalar projection mismatch'); END;

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

CREATE TRIGGER accounting_pack_revision_snapshot_reconciliation_scalar_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN json_extract(NEW.reconciliation_json,'$.period_start')<>NEW.period_start OR
     json_extract(NEW.reconciliation_json,'$.period_end')<>NEW.period_end OR
     json_extract(NEW.reconciliation_json,'$.currency')<>NEW.currency OR
     json_extract(NEW.reconciliation_json,'$.timezone')<>NEW.timezone OR
     json_extract(NEW.reconciliation_json,'$.invoice_count')<>NEW.invoice_count OR
     json_extract(NEW.reconciliation_json,'$.payment_count')<>NEW.payment_count OR
     json_extract(NEW.reconciliation_json,'$.worker_cost_count')<>NEW.worker_cost_count OR
     json_extract(NEW.reconciliation_json,'$.expense_count')<>NEW.expense_count OR
     json_extract(NEW.reconciliation_json,'$.source_item_count')<>NEW.source_item_count OR
     json_extract(NEW.reconciliation_json,'$.invoice_source_count')<>NEW.invoice_source_count OR
     json_extract(NEW.reconciliation_json,'$.source_mismatch_count')<>NEW.source_mismatch_count OR
     json_extract(NEW.reconciliation_json,'$.approved_time_entry_count')<>NEW.approved_time_entry_count OR
     json_extract(NEW.reconciliation_json,'$.approved_expense_count')<>NEW.approved_expense_count OR
     json_extract(NEW.reconciliation_json,'$.net_minor')<>NEW.net_minor OR
     json_extract(NEW.reconciliation_json,'$.tax_minor')<>NEW.tax_minor OR
     json_extract(NEW.reconciliation_json,'$.gross_minor')<>NEW.gross_minor OR
     json_extract(NEW.reconciliation_json,'$.collected_minor')<>NEW.collected_minor OR
     json_extract(NEW.reconciliation_json,'$.outstanding_minor')<>NEW.outstanding_minor OR
     json_extract(NEW.reconciliation_json,'$.worker_cost_minor')<>NEW.worker_cost_minor OR
     json_extract(NEW.reconciliation_json,'$.expense_cost_minor')<>NEW.expense_cost_minor OR
     json_extract(NEW.reconciliation_json,'$.direct_cost_minor')<>NEW.direct_cost_minor OR
     json_extract(NEW.reconciliation_json,'$.contribution_minor')<>NEW.contribution_minor
BEGIN SELECT RAISE(ABORT,'accounting pack reconciliation scalar projection mismatch'); END;

CREATE TRIGGER accounting_pack_revision_snapshot_hash_guard
BEFORE INSERT ON accounting_pack_revision_snapshot
WHEN NEW.snapshot_sha256<>lower(ja_finance_hash_v1(NEW.snapshot_json)) OR
     NEW.reconciliation_sha256<>lower(ja_finance_hash_v1(NEW.reconciliation_json))
BEGIN SELECT RAISE(ABORT,'accounting pack snapshot hash mismatch'); END;

CREATE TRIGGER accounting_pack_revision_snapshot_no_update
BEFORE UPDATE ON accounting_pack_revision_snapshot
BEGIN SELECT RAISE(ABORT,'accounting pack revision snapshot immutable'); END;
CREATE TRIGGER accounting_pack_revision_snapshot_no_delete
BEFORE DELETE ON accounting_pack_revision_snapshot
BEGIN SELECT RAISE(ABORT,'accounting pack revision snapshot immutable'); END;

CREATE INDEX accounting_pack_revision_snapshot_scope_idx
  ON accounting_pack_revision_snapshot(tenant_id,deployment_id,period_start,period_end,currency);
