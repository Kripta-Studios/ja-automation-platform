-- B6 accounting-pack snapshot bridge.
--
-- This migration is additive.  It does not rewrite the legacy legal_entity or
-- accounting_pack_run tables and it deliberately does not infer a canonical
-- revision for old rows.  A caller must create an explicit, command/audit
-- anchored bridge before a legacy run can be linked to a canonical snapshot.
-- The migration runner supplies ja_finance_hash_v1 on the same connection.

-- 0019 intentionally freezes the metadata table to the five migrations that
-- existed at that cutover.  Migration 24 is the first owner allowed to widen
-- that contract.  Rebuild both sides of the one historical FK instead of
-- UPDATE/DELETE-ing immutable metadata.  All statements run inside the
-- runner's transaction, so an injected failure restores the original table,
-- rows, triggers and FK byte-for-byte.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v23;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 24),
  migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
    'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
    'localized_pdf_variants','accounting_pack_snapshot_bridge'
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
FROM migration_contract_metadata_v23;

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
DROP TABLE migration_contract_metadata_v23;

CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

-- B6 owns three new native audit identities.  The registry is immutable and
-- rejects runtime self-registration, so the reviewed migration temporarily
-- suspends only its insert manifest guard while adding these literal rows,
-- then reinstates the guard before any tenant write can occur.
DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(
  contract_version,action,entity_type,actor_kind,owner_packet,data_classification
) VALUES
  ('B5-R4','legal_entity_revision_bridge.create','legal_entity_revision_bridge','user','WP-B6','restricted'),
  ('B5-R4','accounting_pack_revision_snapshot.create','accounting_pack_revision_snapshot','user','WP-B6','restricted'),
  ('B5-R4','accounting_pack_legacy_run_bridge.create','accounting_pack_legacy_run_bridge','user','WP-B6','restricted');
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

-- Source-cut evidence is an immutable identity, not a convenience join.  A
-- reviewed evidence row may legitimately support more than one item in the
-- same cut, so this migration deliberately does not add a uniqueness index
-- over (cut_id,evidence_id).  Each item still has to copy the exact reviewed
-- evidence hash and carry a canonical currency.
CREATE TRIGGER finance_source_cut_evidence_guard
BEFORE INSERT ON finance_source_cut
WHEN NEW.currency<>upper(NEW.currency) OR NEW.currency NOT GLOB '[A-Z][A-Z][A-Z]' OR
     NEW.period_start NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
     date(NEW.period_start) IS NOT NEW.period_start OR
     NEW.period_end NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
     date(NEW.period_end) IS NOT NEW.period_end OR
     NOT EXISTS(
  SELECT 1 FROM finance_hash_evidence evidence
  WHERE evidence.evidence_type='source_cut'
    AND evidence.semantic_id=NEW.cut_id
    AND evidence.evidence_hash=NEW.cut_hash
)
BEGIN SELECT RAISE(ABORT,'source cut canonical evidence is missing'); END;

CREATE TRIGGER finance_source_cut_item_evidence_guard
BEFORE INSERT ON finance_source_cut_item
WHEN NEW.currency IS NULL OR
     length(NEW.evidence_hash)<>64 OR NEW.evidence_hash GLOB '*[^0-9a-f]*' OR
     length(NEW.item_hash)<>64 OR NEW.item_hash GLOB '*[^0-9a-f]*' OR
     length(NEW.effective_at)<>24 OR
     strftime('%Y-%m-%dT%H:%M:%fZ',NEW.effective_at) IS NOT NEW.effective_at OR
     NOT EXISTS(
  SELECT 1 FROM finance_hash_evidence evidence
  WHERE evidence.evidence_id=NEW.evidence_id
    AND evidence.evidence_hash=NEW.evidence_hash
    AND evidence.evidence_type=NEW.evidence_type
)
BEGIN SELECT RAISE(ABORT,'source cut item evidence identity mismatch'); END;
CREATE TRIGGER finance_source_cut_item_scope_guard
BEFORE INSERT ON finance_source_cut_item
WHEN NOT EXISTS(
  SELECT 1 FROM finance_source_cut cut
  WHERE cut.cut_id=NEW.cut_id
    AND NEW.currency=cut.currency
    AND NEW.currency=upper(NEW.currency)
    AND NEW.currency GLOB '[A-Z][A-Z][A-Z]'
)
BEGIN SELECT RAISE(ABORT,'source cut item is outside its cut currency scope'); END;

-- The pre-existing accounting-pack source-cut projection is also immutable,
-- but before this bridge it did not verify that its copied cut/item hashes
-- were the reviewed source identities.  Validate new rows without adding a
-- uniqueness constraint that could reject historical duplicate references.
CREATE TRIGGER accounting_pack_source_cut_batch_identity_guard
BEFORE INSERT ON accounting_pack_source_cut_batch
WHEN NOT EXISTS(
  SELECT 1
  FROM accounting_pack_revision revision
  JOIN finance_source_cut cut ON cut.cut_id=NEW.cut_id
  WHERE revision.revision_id=NEW.revision_id
    AND revision.source_cut_id=NEW.cut_id
    AND revision.source_cut_hash=NEW.cut_hash
    AND revision.tenant_id=cut.tenant_id
    AND revision.deployment_id=cut.deployment_id
    AND revision.legal_entity_revision_id=cut.legal_entity_revision_id
    AND revision.currency=cut.currency
    AND revision.period_start=cut.period_start
    AND revision.period_end=cut.period_end
    AND cut.cut_hash=NEW.cut_hash
    AND cut.change_sequence_high_watermark=NEW.change_sequence_high_watermark
    AND EXISTS(
      SELECT 1 FROM finance_hash_evidence evidence
      WHERE evidence.evidence_type='source_cut'
        AND evidence.semantic_id=cut.cut_id
        AND evidence.evidence_hash=cut.cut_hash
    )
)
BEGIN SELECT RAISE(ABORT,'accounting pack source cut identity mismatch'); END;

CREATE TRIGGER accounting_pack_source_cut_item_identity_guard
BEFORE INSERT ON accounting_pack_source_cut_item
WHEN NOT EXISTS(
  SELECT 1
  FROM accounting_pack_source_cut_batch batch
  JOIN finance_source_cut cut ON cut.cut_id=batch.cut_id
  JOIN finance_source_cut_item item ON item.id=NEW.source_cut_item_id
  JOIN finance_hash_evidence evidence
    ON evidence.evidence_id=item.evidence_id
   AND evidence.evidence_hash=item.evidence_hash
  WHERE batch.id=NEW.batch_id
    AND item.cut_id=batch.cut_id
    AND item.currency IS NOT NULL
    AND item.currency=cut.currency
    AND NEW.evidence_hash=item.evidence_hash
    AND evidence.evidence_type=item.evidence_type
)
BEGIN SELECT RAISE(ABORT,'accounting pack source cut item identity mismatch'); END;

CREATE TABLE legal_entity_revision_bridge(
  bridge_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legacy_legal_entity_id TEXT NOT NULL
    REFERENCES legal_entity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  canonical_revision_id TEXT NOT NULL
    REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  legacy_legal_entity_code TEXT NOT NULL,
  legacy_legal_entity_name TEXT NOT NULL,
  legacy_legal_entity_version INTEGER NOT NULL CHECK(legacy_legal_entity_version>0),
  legacy_currency TEXT NOT NULL CHECK(legacy_currency=upper(legacy_currency) AND legacy_currency GLOB '[A-Z][A-Z][A-Z]'),
  canonical_revision_hash TEXT NOT NULL
    CHECK(length(canonical_revision_hash)=64 AND canonical_revision_hash NOT GLOB '*[^0-9a-f]*'),
  canonical_currency TEXT NOT NULL CHECK(canonical_currency=upper(canonical_currency) AND canonical_currency GLOB '[A-Z][A-Z][A-Z]'),
  canonical_timezone TEXT NOT NULL CHECK(length(canonical_timezone)>0 AND canonical_timezone NOT GLOB '*[^A-Za-z0-9_+./:-]*'),
  identity_manifest_version TEXT NOT NULL DEFAULT 'legal-entity-identity-manifest-v1'
    CHECK(identity_manifest_version='legal-entity-identity-manifest-v1'),
  identity_manifest_json TEXT NOT NULL CHECK(json_valid(identity_manifest_json)),
  identity_manifest_sha256 TEXT NOT NULL
    CHECK(length(identity_manifest_sha256)=64 AND identity_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  command_id TEXT NOT NULL
    REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  audit_event_id TEXT NOT NULL
    REFERENCES audit_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(
    length(created_at)=24 AND
    strftime('%Y-%m-%dT%H:%M:%fZ',created_at)=created_at
  ),
  UNIQUE(tenant_id,deployment_id,legacy_legal_entity_id),
  UNIQUE(tenant_id,deployment_id,canonical_revision_id),
  CHECK(legacy_currency=canonical_currency),
  FOREIGN KEY(tenant_id,deployment_id)
    REFERENCES deployment_identity(tenant_id,deployment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE accounting_pack_revision_snapshot(
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
  net_minor INTEGER NOT NULL CHECK(net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(tax_minor>=0),
  gross_minor INTEGER NOT NULL CHECK(gross_minor>=0 AND gross_minor=net_minor+tax_minor),
  collected_minor INTEGER NOT NULL CHECK(collected_minor>=0),
  outstanding_minor INTEGER NOT NULL CHECK(outstanding_minor>=0),
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

-- A canonical snapshot seals the complete source set.  Append-only source and
-- projection rows remain available before the snapshot, but can never be
-- appended afterwards to make the persisted counts/hashes stale.
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

CREATE TABLE accounting_pack_legacy_run_bridge(
  bridge_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legacy_run_id TEXT NOT NULL
    REFERENCES accounting_pack_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  legacy_legal_entity_id TEXT NOT NULL
    REFERENCES legal_entity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_id TEXT NOT NULL
    REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  legal_entity_revision_id TEXT NOT NULL
    REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_cut_id TEXT NOT NULL
    REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_cut_hash TEXT NOT NULL
    CHECK(length(source_cut_hash)=64 AND source_cut_hash NOT GLOB '*[^0-9a-f]*'),
  timezone TEXT NOT NULL CHECK(length(timezone)>0 AND timezone NOT GLOB '*[^A-Za-z0-9_+./:-]*'),
  legacy_snapshot_sha256 TEXT NOT NULL
    CHECK(length(legacy_snapshot_sha256)=64 AND legacy_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  legacy_reconciliation_sha256 TEXT NOT NULL
    CHECK(length(legacy_reconciliation_sha256)=64 AND legacy_reconciliation_sha256 NOT GLOB '*[^0-9a-f]*'),
  snapshot_sha256 TEXT NOT NULL
    CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
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
  CHECK(timezone NOT GLOB '*[^A-Za-z0-9_+./:-]*'),
  CHECK(period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_start)=period_start),
  CHECK(period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(period_end)=period_end),
  CHECK(period_start<period_end),
  UNIQUE(tenant_id,deployment_id,legacy_run_id),
  UNIQUE(tenant_id,deployment_id,revision_id),
  FOREIGN KEY(tenant_id,deployment_id)
    REFERENCES deployment_identity(tenant_id,deployment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER legal_entity_revision_bridge_identity_manifest_guard
BEFORE INSERT ON legal_entity_revision_bridge
WHEN json_valid(NEW.identity_manifest_json)=0 OR
     json_type(NEW.identity_manifest_json) IS NOT 'object' OR
     (SELECT count(*) FROM json_each(NEW.identity_manifest_json))<>12 OR
     (SELECT count(DISTINCT value.key) FROM json_each(NEW.identity_manifest_json) value)<>12 OR
     EXISTS(
       SELECT 1 FROM json_each(NEW.identity_manifest_json) value
       WHERE value.key NOT IN(
         'schema_version','tenant_id','deployment_id','legacy_legal_entity_id',
         'legacy_legal_entity_code','legacy_legal_entity_name','legacy_legal_entity_version',
         'legacy_currency','canonical_revision_id','canonical_revision_hash',
         'canonical_currency','canonical_timezone'
       )
     ) OR
     json_type(NEW.identity_manifest_json,'$.schema_version') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.schema_version')<>NEW.identity_manifest_version OR
     json_type(NEW.identity_manifest_json,'$.tenant_id') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.tenant_id')<>NEW.tenant_id OR
     json_type(NEW.identity_manifest_json,'$.deployment_id') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.deployment_id')<>NEW.deployment_id OR
     json_type(NEW.identity_manifest_json,'$.legacy_legal_entity_id') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.legacy_legal_entity_id')<>NEW.legacy_legal_entity_id OR
     json_type(NEW.identity_manifest_json,'$.legacy_legal_entity_code') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.legacy_legal_entity_code')<>NEW.legacy_legal_entity_code OR
     json_type(NEW.identity_manifest_json,'$.legacy_legal_entity_name') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.legacy_legal_entity_name')<>NEW.legacy_legal_entity_name OR
     json_type(NEW.identity_manifest_json,'$.legacy_legal_entity_version') IS NOT 'integer' OR
     json_extract(NEW.identity_manifest_json,'$.legacy_legal_entity_version')<>NEW.legacy_legal_entity_version OR
     json_type(NEW.identity_manifest_json,'$.legacy_currency') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.legacy_currency')<>NEW.legacy_currency OR
     json_type(NEW.identity_manifest_json,'$.canonical_revision_id') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.canonical_revision_id')<>NEW.canonical_revision_id OR
     json_type(NEW.identity_manifest_json,'$.canonical_revision_hash') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.canonical_revision_hash')<>NEW.canonical_revision_hash OR
     json_type(NEW.identity_manifest_json,'$.canonical_currency') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.canonical_currency')<>NEW.canonical_currency OR
     json_type(NEW.identity_manifest_json,'$.canonical_timezone') IS NOT 'text' OR
     json_extract(NEW.identity_manifest_json,'$.canonical_timezone')<>NEW.canonical_timezone
BEGIN SELECT RAISE(ABORT,'legal entity revision bridge identity manifest is not exact'); END;

CREATE TRIGGER legal_entity_revision_bridge_identity_manifest_hash_guard
BEFORE INSERT ON legal_entity_revision_bridge
WHEN NEW.identity_manifest_sha256<>lower(ja_finance_hash_v1(NEW.identity_manifest_json))
BEGIN SELECT RAISE(ABORT,'legal entity revision bridge identity manifest hash mismatch'); END;

-- A legal entity revision bridge must preserve the old entity's currency and
-- remain inside the configured deployment.  The command and audit records are
-- separate immutable records; their deployment scope is checked here rather
-- than trusted from the caller's payload.
CREATE TRIGGER legal_entity_revision_bridge_subject_guard
BEFORE INSERT ON legal_entity_revision_bridge
WHEN NOT EXISTS(
  SELECT 1
  FROM legal_entity legacy
  JOIN legal_entity_revision revision
    ON revision.revision_id=NEW.canonical_revision_id
  WHERE legacy.id=NEW.legacy_legal_entity_id
    AND legacy.code=NEW.legacy_legal_entity_code
    AND legacy.legal_name=NEW.legacy_legal_entity_name
    AND legacy.version=NEW.legacy_legal_entity_version
    AND legacy.currency=NEW.legacy_currency
    AND revision.tenant_id=NEW.tenant_id
    AND revision.deployment_id=NEW.deployment_id
    AND revision.revision_hash=NEW.canonical_revision_hash
    AND revision.base_currency=NEW.canonical_currency
    AND revision.timezone=NEW.canonical_timezone
) OR NOT EXISTS(
  SELECT 1 FROM finance_command command
  JOIN finance_command_target target ON target.command_id=command.command_id
  WHERE command.command_id=NEW.command_id
    AND command.tenant_id=NEW.tenant_id
    AND command.deployment_id=NEW.deployment_id
    AND command.state='completed'
    AND command.completed_at IS NOT NULL
    AND command.operation='legal_entity_revision_bridge.create'
    AND command.target_kind='legal_entity_revision_bridge'
    AND command.target_semantic_id=NEW.bridge_id
    AND target.target_semantic_id=NEW.bridge_id
    AND target.target_kind='legal_entity_revision_bridge'
    AND target.target_contract_version='legal-entity-revision-bridge-v1'
) OR NOT EXISTS(
  SELECT 1 FROM audit_event audit
  JOIN finance_command command ON command.command_id=NEW.command_id
  WHERE audit.id=NEW.audit_event_id
    AND audit.tenant_id=NEW.tenant_id
    AND audit.deployment_id=NEW.deployment_id
    AND audit.audit_contract_version='B5-R4'
    AND audit.action='legal_entity_revision_bridge.create'
    AND audit.entity_type='legal_entity_revision_bridge'
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
    AND json_extract(audit.details_json,'$.target_contract_version')='legal-entity-revision-bridge-v1'
)
BEGIN SELECT RAISE(ABORT,'legal entity revision bridge is outside its scoped command or audit'); END;

CREATE TRIGGER legal_entity_revision_bridge_no_update
BEFORE UPDATE ON legal_entity_revision_bridge
BEGIN SELECT RAISE(ABORT,'legal entity revision bridge immutable'); END;
CREATE TRIGGER legal_entity_revision_bridge_no_delete
BEFORE DELETE ON legal_entity_revision_bridge
BEGIN SELECT RAISE(ABORT,'legal entity revision bridge immutable'); END;

-- The canonical revision, its source cut and its legal-entity revision must
-- all describe exactly the same tenant/deployment/currency/period.  Hashes are
-- calculated over the stored JSON bytes through the reviewed finance UDF; the
-- lowercase checks prevent alternate spellings of the same digest.
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

-- Canonical pack JSON has a reviewed, closed top-level vocabulary.  The
-- individual register rows intentionally remain extensible records because
-- their fields are rendered by the reporting contract, but a caller may not
-- smuggle an unreviewed top-level section into a financial snapshot.  The
-- normalized scalar values below are repeated in the JSON only as a
-- verifiable projection; the scalar guard below requires byte-level values to
-- agree with the relational columns.
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
  json_type(NEW.reconciliation_json,'$.reconciles') IS NOT 'true'
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

-- Legacy runs are linkable only when the old row has an explicit legal entity.
-- A NULL legal_entity_id represents a historical global/multi-entity run and
-- remains in accounting_pack_run without an invented mapping.  Currency is
-- obtained from that entity and cannot be supplied independently by a caller.
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

CREATE TRIGGER accounting_pack_legacy_run_bridge_no_update
BEFORE UPDATE ON accounting_pack_legacy_run_bridge
BEGIN SELECT RAISE(ABORT,'legacy accounting pack bridge immutable'); END;
CREATE TRIGGER accounting_pack_legacy_run_bridge_no_delete
BEFORE DELETE ON accounting_pack_legacy_run_bridge
BEGIN SELECT RAISE(ABORT,'legacy accounting pack bridge immutable'); END;

-- A compatibility bridge is only legal for a finalized legacy source.  Once
-- linked, the legacy row becomes historical evidence as well; later edits to
-- its JSON, period, entity or state would invalidate the copied hashes and
-- therefore fail closed instead of silently changing the canonical source.
CREATE TRIGGER accounting_pack_legacy_run_bridge_legacy_run_no_update
BEFORE UPDATE ON accounting_pack_run
WHEN EXISTS(
  SELECT 1 FROM accounting_pack_legacy_run_bridge bridge
  WHERE bridge.legacy_run_id=OLD.id
)
BEGIN SELECT RAISE(ABORT,'bridged legacy accounting pack run immutable'); END;
CREATE TRIGGER accounting_pack_legacy_run_bridge_legacy_run_no_delete
BEFORE DELETE ON accounting_pack_run
WHEN EXISTS(
  SELECT 1 FROM accounting_pack_legacy_run_bridge bridge
  WHERE bridge.legacy_run_id=OLD.id
)
BEGIN SELECT RAISE(ABORT,'bridged legacy accounting pack run immutable'); END;

CREATE INDEX legal_entity_revision_bridge_legacy_idx
  ON legal_entity_revision_bridge(tenant_id,deployment_id,legacy_legal_entity_id);
CREATE INDEX accounting_pack_revision_snapshot_scope_idx
  ON accounting_pack_revision_snapshot(tenant_id,deployment_id,period_start,period_end,currency);
CREATE INDEX accounting_pack_legacy_run_bridge_scope_idx
  ON accounting_pack_legacy_run_bridge(tenant_id,deployment_id,period_start,period_end,currency);
