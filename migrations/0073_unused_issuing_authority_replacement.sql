-- Preserve reviewed migration metadata while adding the append-only unused issuing authority correction.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v72;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 73),
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
    'accounting_pack_signed_credit_balances','availability_calendar_edits',
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v72;
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
DROP TABLE migration_contract_metadata_v72;
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


-- An unused setup correction is append-only. All original assignments,
-- commands, evidence and audits remain immutable. The runner owns the transaction.
-- Deliberately conservative: ANY persisted financial use in the same project
-- prevents correction, irrespective of issuer/date. Shared issuers used by other
-- projects do not prevent it. Operational approval alone is not financial use.
CREATE VIEW project_issuing_authority_financial_use AS
SELECT project_id,'expense_classification_revision' source_kind FROM expense_classification_revision
UNION ALL SELECT project_id,'reimbursement_principal_revision' FROM reimbursement_principal_revision
UNION ALL SELECT project_id,'compensation_settlement_revision_v2' FROM compensation_settlement_revision_v2
UNION ALL SELECT project_id,'compensation_settlement' FROM compensation_settlement
UNION ALL SELECT project_id,'invoice' FROM invoice
UNION ALL SELECT project_id,'direct_cost_series' FROM direct_cost_series
UNION ALL SELECT project_id,'direct_cost_event' FROM direct_cost_event
UNION ALL SELECT project_id,'finance_internal_cost_snapshot' FROM finance_internal_cost_snapshot
UNION ALL SELECT project_id,'finance_snapshot' FROM finance_snapshot
UNION ALL SELECT project_id,'client_minimum_policy_revision' FROM client_minimum_policy_revision
UNION ALL SELECT project_id,'expense_financial_state' FROM expense
  WHERE commercial_classification_state IN ('classified','legacy_classified')
     OR reimbursement_state='reimbursed' OR reimbursed_at IS NOT NULL
UNION ALL SELECT source.project_id,'source_cut_time' FROM finance_source_cut_item item
  JOIN time_entry source ON source.id=item.item_id WHERE item.item_kind IN ('time','time_entry')
UNION ALL SELECT source.project_id,'source_cut_expense' FROM finance_source_cut_item item
  JOIN expense source ON source.id=item.item_id WHERE item.item_kind='expense'
-- Source evidence and pack snapshots retain project bindings even when their
-- operational sources have since changed. Do not count configuration/assignment
-- command evidence as financial use.
UNION ALL SELECT CAST(binding.value AS TEXT),'source_cut_project_evidence'
  FROM finance_source_cut_item item
  JOIN finance_hash_evidence evidence ON evidence.evidence_id=item.evidence_id,
  json_tree(CASE WHEN json_valid(CAST(evidence.canonical_blob AS TEXT))
    THEN CAST(evidence.canonical_blob AS TEXT) ELSE '{}' END) binding
  WHERE binding.key IN ('project_id','projectId') AND binding.type='text'
    AND item.item_kind NOT IN ('configuration','configuration_revision','project_legal_entity_assignment','legal_entity_revision')
    AND evidence.evidence_type NOT IN ('configuration_revision','finance_command','finance_request','legal_entity_revision')
UNION ALL SELECT CAST(binding.value AS TEXT),'accounting_pack_snapshot'
  FROM accounting_pack_revision_snapshot snapshot,json_tree(snapshot.snapshot_json) binding
  WHERE binding.key IN ('project_id','projectId') AND binding.type='text'
UNION ALL SELECT CAST(binding.value AS TEXT),'accounting_pack_run'
  FROM accounting_pack_run run,
  json_tree(CASE WHEN json_valid(run.snapshot_json) THEN run.snapshot_json ELSE '{}' END) binding
  WHERE binding.key IN ('project_id','projectId') AND binding.type='text';

CREATE TABLE project_legal_entity_assignment_replacement(
  replacement_id TEXT PRIMARY KEY,
  original_assignment_id TEXT NOT NULL UNIQUE REFERENCES project_legal_entity_assignment(assignment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  replacement_assignment_id TEXT NOT NULL UNIQUE REFERENCES project_legal_entity_assignment(assignment_id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  replacement_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 2000),
  principal_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  evidence_id TEXT NOT NULL UNIQUE,
  evidence_hash TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'configuration_revision' CHECK(evidence_type='configuration_revision'),
  created_at TEXT NOT NULL,
  CHECK(original_assignment_id<>replacement_assignment_id),
  FOREIGN KEY(evidence_id,evidence_hash,evidence_type) REFERENCES finance_hash_evidence(evidence_id,evidence_hash,evidence_type) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER project_legal_entity_replacement_no_update BEFORE UPDATE ON project_legal_entity_assignment_replacement
BEGIN SELECT RAISE(ABORT,'project issuing authority replacement immutable'); END;
CREATE TRIGGER project_legal_entity_replacement_no_delete BEFORE DELETE ON project_legal_entity_assignment_replacement
BEGIN SELECT RAISE(ABORT,'project issuing authority replacement immutable'); END;
CREATE TRIGGER project_legal_entity_replacement_no_replace BEFORE INSERT ON project_legal_entity_assignment_replacement
WHEN EXISTS(SELECT 1 FROM project_legal_entity_assignment_replacement existing
  WHERE existing.replacement_id=NEW.replacement_id OR existing.original_assignment_id=NEW.original_assignment_id
     OR existing.replacement_assignment_id=NEW.replacement_assignment_id OR existing.command_id=NEW.command_id)
BEGIN SELECT RAISE(ABORT,'project issuing authority replacement immutable'); END;

CREATE TRIGGER project_legal_entity_replacement_insert_guard BEFORE INSERT ON project_legal_entity_assignment_replacement
WHEN NOT EXISTS(
  SELECT 1 FROM project_legal_entity_assignment original
  JOIN legal_entity_revision revision ON revision.revision_id=NEW.replacement_revision_id
  JOIN project ON project.id=original.project_id
  JOIN user principal ON principal.id=NEW.principal_id AND principal.status='active'
    AND principal.role IN ('owner_admin','finance_admin')
  JOIN finance_command command ON command.command_id=NEW.command_id
    AND command.operation='project_legal_entity_assignment.replace_unused'
    AND command.target_kind='project_legal_entity_assignment_replacement'
    AND command.target_semantic_id=NEW.replacement_id
    AND command.payload_hash=NEW.evidence_hash AND command.state='completed'
    AND command.principal_id=NEW.principal_id
    AND command.tenant_id=original.tenant_id AND command.deployment_id=original.deployment_id
  JOIN finance_hash_evidence evidence ON evidence.evidence_id=NEW.evidence_id
    AND evidence.evidence_hash=NEW.evidence_hash AND evidence.evidence_type='configuration_revision'
    AND evidence.contract_version='client-essential-unused-issuing-authority-replacement-v1'
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.replacement_id')=NEW.replacement_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.replacement_assignment_id')=NEW.replacement_assignment_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.replacement_revision_id')=NEW.replacement_revision_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.reason')=NEW.reason
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.assignment_id')=original.assignment_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.project_id')=original.project_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.legal_entity_revision_id')=original.legal_entity_revision_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.tenant_id')=original.tenant_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.deployment_id')=original.deployment_id
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.effective_from')=original.effective_from
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.effective_to') IS original.effective_to
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.created_at')=original.created_at
    AND json_extract(CAST(evidence.canonical_blob AS TEXT),'$.original_assignment.command_id')=original.command_id
  WHERE original.assignment_id=NEW.original_assignment_id
    AND original.legal_entity_revision_id<>NEW.replacement_revision_id
    AND revision.tenant_id=original.tenant_id AND revision.deployment_id=original.deployment_id
    AND upper(revision.base_currency)=upper(project.currency)
    AND revision.effective_from<=original.effective_from
    AND (revision.effective_to IS NULL OR (original.effective_to IS NOT NULL AND original.effective_to<=revision.effective_to))
    AND EXISTS(SELECT 1 FROM finance_hash_evidence reviewed
      WHERE reviewed.evidence_type='legal_entity_revision'
        AND reviewed.contract_version='client-essential-legal-entity-revision-v1'
        AND reviewed.evidence_hash=revision.revision_hash)
)
OR EXISTS(SELECT 1 FROM project_legal_entity_assignment WHERE assignment_id=NEW.replacement_assignment_id)
OR EXISTS(SELECT 1 FROM project_issuing_authority_financial_use usage
  JOIN project_legal_entity_assignment original ON original.project_id=usage.project_id
  WHERE original.assignment_id=NEW.original_assignment_id)
BEGIN SELECT RAISE(ABORT,'project issuing authority replacement unavailable or financially used'); END;

CREATE VIEW effective_project_legal_entity_assignment AS
SELECT assignment.* FROM project_legal_entity_assignment assignment
WHERE NOT EXISTS(SELECT 1 FROM project_legal_entity_assignment_replacement replacement
  WHERE replacement.original_assignment_id=assignment.assignment_id);

DROP TRIGGER project_legal_entity_assignment_insert_guard;
CREATE TRIGGER project_legal_entity_assignment_insert_guard BEFORE INSERT ON project_legal_entity_assignment
WHEN NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.project_id)
  OR NOT EXISTS(
    SELECT 1 FROM legal_entity_revision revision JOIN project ON project.id=NEW.project_id
    WHERE revision.revision_id=NEW.legal_entity_revision_id
      AND revision.tenant_id=NEW.tenant_id AND revision.deployment_id=NEW.deployment_id
      AND upper(revision.base_currency)=upper(project.currency)
      AND revision.effective_from<=NEW.effective_from
      AND (revision.effective_to IS NULL OR (NEW.effective_to IS NOT NULL AND NEW.effective_to<=revision.effective_to))
  )
  OR EXISTS(
    SELECT 1 FROM effective_project_legal_entity_assignment existing
    WHERE existing.project_id=NEW.project_id
      AND existing.effective_from<=COALESCE(NEW.effective_to,'9999-12-31T23:59:59.999Z')
      AND NEW.effective_from<=COALESCE(existing.effective_to,'9999-12-31T23:59:59.999Z')
  )
  OR EXISTS(
    SELECT 1 FROM project_legal_entity_assignment_replacement replacement
    JOIN project_legal_entity_assignment original ON original.assignment_id=replacement.original_assignment_id
    WHERE replacement.replacement_assignment_id=NEW.assignment_id
      AND (NEW.project_id<>original.project_id OR NEW.tenant_id<>original.tenant_id
        OR NEW.deployment_id<>original.deployment_id OR NEW.effective_from<>original.effective_from
        OR NEW.effective_to IS NOT original.effective_to
        OR NEW.legal_entity_revision_id<>replacement.replacement_revision_id)
  )
BEGIN SELECT RAISE(ABORT,'invalid currency, interval or overlapping project legal entity assignment'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification)
VALUES('B5-R4','project_legal_entity.replace_unused','project_legal_entity_assignment_replacement','user','WP-03','restricted');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
) BEGIN SELECT RAISE(ABORT,'audit action registry is migration-owned'); END;
