-- Preserve the closed migration ledger while allowing the next reviewed version.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v55;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 56),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v55;
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
DROP TABLE migration_contract_metadata_v55;
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

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','expense.allocate_shared_receipt','crew_shared_expense_allocation_group','user','CREW-SHARED-EXPENSE','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
  SELECT 1 FROM audit_action_registry reviewed
  WHERE reviewed.contract_version=NEW.contract_version AND reviewed.action=NEW.action
    AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
    AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;

-- One already-created receipt expense remains the only financial source. Crew
-- allocations are operational attribution and never invoice/reimburse sources.
CREATE TABLE crew_shared_expense_allocation_group(
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL UNIQUE REFERENCES expense(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  request_id TEXT NOT NULL CHECK(length(trim(request_id)) BETWEEN 16 AND 200),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  total_minor INTEGER NOT NULL CHECK(total_minor>0),
  allocation_count INTEGER NOT NULL CHECK(allocation_count BETWEEN 2 AND 100),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(actor_user_id,request_id)
) STRICT;
CREATE TABLE crew_shared_expense_allocation(
  group_id TEXT NOT NULL REFERENCES crew_shared_expense_allocation_group(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  time_entry_id TEXT NOT NULL REFERENCES time_entry(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  worker_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES crew_leader_grant(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(group_id,time_entry_id)
) STRICT;
CREATE INDEX crew_shared_expense_allocation_worker_idx ON crew_shared_expense_allocation(worker_id,time_entry_id);
CREATE TRIGGER crew_shared_expense_group_source BEFORE INSERT ON crew_shared_expense_allocation_group
WHEN NOT EXISTS(
  SELECT 1 FROM expense e JOIN crew_expense_recorder rec ON rec.expense_id=e.id
  JOIN document d ON d.id=e.receipt_document_id
  WHERE e.id=NEW.expense_id AND e.project_id=NEW.project_id
    AND e.amount_minor=NEW.total_minor AND e.approval_state='draft'
    AND e.invoice_id IS NULL AND e.billing_lock_id IS NULL
    AND d.state='committed' AND d.owner_id=NEW.actor_user_id
    AND rec.recorded_by_user_id=NEW.actor_user_id
)
BEGIN SELECT RAISE(ABORT,'shared receipt source invalid'); END;
CREATE TRIGGER crew_shared_expense_allocation_bind BEFORE INSERT ON crew_shared_expense_allocation
WHEN NOT EXISTS(
  SELECT 1 FROM crew_shared_expense_allocation_group g
  JOIN expense e ON e.id=g.expense_id
  JOIN time_entry t ON t.id=NEW.time_entry_id
  JOIN crew_time_entry_recorder tr ON tr.time_entry_id=t.id
  JOIN crew_leader_grant cg ON cg.id=NEW.grant_id
  WHERE g.id=NEW.group_id AND g.completed=0 AND t.project_id=g.project_id
    AND t.work_date=e.spent_on AND t.worker_id=NEW.worker_id
    AND tr.recorded_by_user_id=g.actor_user_id AND tr.grant_id=cg.id
    AND cg.chief_user_id=g.actor_user_id AND cg.worker_user_id=NEW.worker_id
    AND cg.project_id=g.project_id AND cg.status='active'
    AND cg.starts_on<=e.spent_on AND (cg.ends_on IS NULL OR cg.ends_on>=e.spent_on)
)
BEGIN SELECT RAISE(ABORT,'shared receipt allocation scope mismatch'); END;
CREATE TRIGGER crew_shared_expense_group_finalize BEFORE UPDATE OF completed ON crew_shared_expense_allocation_group
WHEN NOT (
  OLD.completed=0 AND NEW.completed=1
  AND NEW.id IS OLD.id AND NEW.expense_id IS OLD.expense_id
  AND NEW.project_id IS OLD.project_id AND NEW.actor_user_id IS OLD.actor_user_id
  AND NEW.request_id IS OLD.request_id AND NEW.payload_sha256 IS OLD.payload_sha256
  AND NEW.total_minor IS OLD.total_minor AND NEW.allocation_count IS OLD.allocation_count
  AND NEW.created_at IS OLD.created_at
  AND (SELECT COUNT(*) FROM crew_shared_expense_allocation a WHERE a.group_id=OLD.id)=OLD.allocation_count
  AND (SELECT COUNT(DISTINCT a.worker_id) FROM crew_shared_expense_allocation a WHERE a.group_id=OLD.id)>=2
  AND (SELECT SUM(a.amount_minor) FROM crew_shared_expense_allocation a WHERE a.group_id=OLD.id)=OLD.total_minor
  AND EXISTS(SELECT 1 FROM crew_shared_expense_allocation a JOIN expense e ON e.id=OLD.expense_id WHERE a.group_id=OLD.id AND a.worker_id=e.worker_id)
  AND NOT EXISTS(SELECT 1 FROM expense e WHERE e.id=OLD.expense_id AND e.time_entry_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crew_shared_expense_allocation a WHERE a.group_id=OLD.id AND a.time_entry_id=e.time_entry_id))
)
BEGIN SELECT RAISE(ABORT,'shared receipt allocations do not reconcile'); END;
CREATE TRIGGER crew_shared_expense_group_no_other_update BEFORE UPDATE ON crew_shared_expense_allocation_group
WHEN NEW.completed IS OLD.completed
BEGIN SELECT RAISE(ABORT,'shared receipt allocation immutable'); END;
CREATE TRIGGER crew_shared_expense_group_no_delete BEFORE DELETE ON crew_shared_expense_allocation_group
BEGIN SELECT RAISE(ABORT,'shared receipt allocation immutable'); END;
CREATE TRIGGER crew_shared_expense_allocation_no_update BEFORE UPDATE ON crew_shared_expense_allocation
BEGIN SELECT RAISE(ABORT,'shared receipt allocation immutable'); END;
CREATE TRIGGER crew_shared_expense_allocation_no_delete BEFORE DELETE ON crew_shared_expense_allocation
BEGIN SELECT RAISE(ABORT,'shared receipt allocation immutable'); END;
CREATE TRIGGER crew_shared_expense_source_identity_guard
BEFORE UPDATE OF amount_minor,worker_id,project_id,spent_on,time_entry_id,receipt_document_id ON expense
WHEN EXISTS(SELECT 1 FROM crew_shared_expense_allocation_group g WHERE g.expense_id=OLD.id AND g.completed=1)
 AND (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.worker_id IS NOT OLD.worker_id
   OR NEW.project_id IS NOT OLD.project_id OR NEW.spent_on IS NOT OLD.spent_on
   OR NEW.time_entry_id IS NOT OLD.time_entry_id
   OR NEW.receipt_document_id IS NOT OLD.receipt_document_id)
BEGIN SELECT RAISE(ABORT,'allocated receipt source immutable'); END;
CREATE TRIGGER crew_shared_expense_time_identity_guard
BEFORE UPDATE OF worker_id,project_id,work_date ON time_entry
WHEN EXISTS(SELECT 1 FROM crew_shared_expense_allocation a WHERE a.time_entry_id=OLD.id)
 AND (NEW.worker_id IS NOT OLD.worker_id OR NEW.project_id IS NOT OLD.project_id
   OR NEW.work_date IS NOT OLD.work_date)
BEGIN SELECT RAISE(ABORT,'allocated crew time identity immutable'); END;
