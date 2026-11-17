-- Void releases an issued invoice's time/expense/milestone sources for re-invoicing.
-- The void invoice keeps its snapshot, lines and manifest; its released source links are
-- archived append-only so a source is reserved by at most one live invoice.
DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v77;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 78),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v77;
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
DROP TABLE migration_contract_metadata_v77;
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


CREATE TABLE invoice_void_source_release(
  source_link_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  invoice_line_id TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN('time','expense','milestone')),
  source_id TEXT NOT NULL,
  source_version INTEGER,
  locked_at TEXT,
  source_hash TEXT,
  allocated_net_minor INTEGER,
  allocated_tax_minor INTEGER,
  allocated_gross_minor INTEGER,
  created_at TEXT,
  legacy_pointer INTEGER NOT NULL DEFAULT 0 CHECK(legacy_pointer IN(0,1)),
  void_event_id TEXT NOT NULL REFERENCES invoice_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_id TEXT NOT NULL CHECK(length(actor_id)>0),
  released_at TEXT NOT NULL CHECK(length(released_at)>0),
  UNIQUE(invoice_id,source_type,source_id)
) STRICT;
CREATE INDEX invoice_void_source_release_source_idx ON invoice_void_source_release(source_type,source_id);
CREATE TRIGGER invoice_void_source_release_void_only BEFORE INSERT ON invoice_void_source_release
WHEN NOT EXISTS(SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='void' AND voided_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM invoice_event WHERE id=NEW.void_event_id AND invoice_id=NEW.invoice_id AND event_type='void')
  OR (NEW.legacy_pointer=0 AND NOT EXISTS(
    SELECT 1 FROM invoice_source s WHERE s.source_link_id=NEW.source_link_id AND s.invoice_id=NEW.invoice_id
      AND s.source_type=NEW.source_type AND s.source_id=NEW.source_id))
BEGIN SELECT RAISE(ABORT,'only a void invoice can release its sources'); END;
CREATE TRIGGER invoice_void_source_release_no_update BEFORE UPDATE ON invoice_void_source_release
BEGIN SELECT RAISE(ABORT,'void source release history is immutable'); END;
CREATE TRIGGER invoice_void_source_release_no_delete BEFORE DELETE ON invoice_void_source_release
BEGIN SELECT RAISE(ABORT,'void source release history is immutable'); END;

DROP TRIGGER issued_invoice_source_no_delete_v2;
CREATE TRIGGER issued_invoice_source_no_delete_v2
BEFORE DELETE ON invoice_source
WHEN (OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=OLD.invoice_id
    AND invoice.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
)) AND NOT EXISTS(
  SELECT 1 FROM invoice_void_source_release r JOIN invoice i ON i.id=r.invoice_id
  WHERE r.source_link_id=OLD.source_link_id AND r.invoice_id=OLD.invoice_id AND i.state='void'
)
BEGIN SELECT RAISE(ABORT,'issued invoice sources are immutable'); END;

DROP TRIGGER invoiced_time_no_update;
CREATE TRIGGER invoiced_time_no_update BEFORE UPDATE ON time_entry
WHEN OLD.invoice_id IS NOT NULL AND NOT (
  NEW.invoice_id IS NULL AND NEW.billing_status='unlocked' AND
  EXISTS(SELECT 1 FROM invoice_void_source_release r
    WHERE r.invoice_id=OLD.invoice_id AND r.source_type='time' AND r.source_id=OLD.id) AND
    NEW.id IS OLD.id AND
    NEW.project_id IS OLD.project_id AND
    NEW.worker_id IS OLD.worker_id AND
    NEW.work_date IS OLD.work_date AND
    NEW.category IS OLD.category AND
    NEW.minutes IS OLD.minutes AND
    NEW.approval_state IS OLD.approval_state AND
    NEW.billability_state IS OLD.billability_state AND
    NEW.created_at IS OLD.created_at AND
    NEW.project_timezone IS OLD.project_timezone AND
    NEW.activity_summary IS OLD.activity_summary AND
    NEW.submitted_at IS OLD.submitted_at AND
    NEW.approved_by IS OLD.approved_by AND
    NEW.approved_at IS OLD.approved_at AND
    NEW.finance_approved_by IS OLD.finance_approved_by AND
    NEW.finance_approved_at IS OLD.finance_approved_at AND
    NEW.start_time IS OLD.start_time AND
    NEW.end_time IS OLD.end_time AND
    NEW.activity_code IS OLD.activity_code AND
    NEW.break_minutes IS OLD.break_minutes AND
    NEW.site IS OLD.site AND
    NEW.billable_minutes IS OLD.billable_minutes AND
    NEW.client_rate_minor IS OLD.client_rate_minor AND
    NEW.compensation_amount_minor IS OLD.compensation_amount_minor AND
    NEW.internal_cost_minor IS OLD.internal_cost_minor
)
BEGIN SELECT RAISE(ABORT,'invoiced time is immutable; create an adjustment'); END;

DROP TRIGGER invoiced_milestone_no_update;
CREATE TRIGGER invoiced_milestone_no_update
BEFORE UPDATE ON project_milestone
WHEN OLD.invoice_id IS NOT NULL AND NOT (
  NEW.invoice_id IS NULL AND
  EXISTS(SELECT 1 FROM invoice_void_source_release r
    WHERE r.invoice_id=OLD.invoice_id AND r.source_type='milestone' AND r.source_id=OLD.id) AND
    NEW.id IS OLD.id AND
    NEW.project_id IS OLD.project_id AND
    NEW.name IS OLD.name AND
    NEW.description IS OLD.description AND
    NEW.amount_minor IS OLD.amount_minor AND
    NEW.currency IS OLD.currency AND
    NEW.due_on IS OLD.due_on AND
    NEW.approval_state IS OLD.approval_state AND
    NEW.approved_by IS OLD.approved_by AND
    NEW.approved_at IS OLD.approved_at AND
    NEW.created_at IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT,'invoiced milestone is immutable; create an adjustment');
END;

DROP TRIGGER invoiced_expense_no_update;
CREATE TRIGGER invoiced_expense_no_update
BEFORE UPDATE ON expense
WHEN OLD.invoice_id IS NOT NULL AND (
  NEW.id IS NOT OLD.id OR
  NEW.project_id IS NOT OLD.project_id OR
  NEW.worker_id IS NOT OLD.worker_id OR
  NEW.spent_on IS NOT OLD.spent_on OR
  NEW.category IS NOT OLD.category OR
  NEW.currency IS NOT OLD.currency OR
  NEW.amount_minor IS NOT OLD.amount_minor OR
  NEW.client_treatment IS NOT OLD.client_treatment OR
  NEW.approval_state IS NOT OLD.approval_state OR
  (NEW.invoice_id IS NOT OLD.invoice_id AND NOT (NEW.invoice_id IS NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r WHERE r.invoice_id=OLD.invoice_id AND r.source_type='expense' AND r.source_id=OLD.id))) OR
  NEW.created_at IS NOT OLD.created_at OR
  NEW.vendor IS NOT OLD.vendor OR
  NEW.description IS NOT OLD.description OR
  NEW.who_paid IS NOT OLD.who_paid OR
  NEW.receipt_document_id IS NOT OLD.receipt_document_id OR
  NEW.receipt_required IS NOT OLD.receipt_required OR
  NEW.submitted_at IS NOT OLD.submitted_at OR
  NEW.approved_by IS NOT OLD.approved_by OR
  NEW.approved_at IS NOT OLD.approved_at OR
  NEW.finance_approved_by IS NOT OLD.finance_approved_by OR
  NEW.finance_approved_at IS NOT OLD.finance_approved_at OR
  NEW.tax_amount_minor IS NOT OLD.tax_amount_minor OR
  NEW.payment_method IS NOT OLD.payment_method OR
  NEW.markup_bps IS NOT OLD.markup_bps OR
  NEW.project_currency_amount_minor IS NOT OLD.project_currency_amount_minor OR
  NEW.billing_treatment IS NOT OLD.billing_treatment OR
  (NEW.billing_state IS NOT OLD.billing_state AND NOT (NEW.invoice_id IS NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r WHERE r.invoice_id=OLD.invoice_id AND r.source_type='expense' AND r.source_id=OLD.id))) OR
  NEW.billing_amount_minor IS NOT OLD.billing_amount_minor OR
  (NEW.billing_lock_id IS NOT OLD.billing_lock_id AND NOT (NEW.invoice_id IS NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r WHERE r.invoice_id=OLD.invoice_id AND r.source_type='expense' AND r.source_id=OLD.id))) OR
  NEW.fx_rate_bps IS NOT OLD.fx_rate_bps OR
  NEW.expected_reimbursement_on IS NOT OLD.expected_reimbursement_on OR
  NEW.expected_recovery_on IS NOT OLD.expected_recovery_on OR
  NEW.commercial_classification_state IS NOT OLD.commercial_classification_state OR
  NEW.occurred_time_local IS NOT OLD.occurred_time_local OR
  NEW.time_entry_id IS NOT OLD.time_entry_id OR
  NEW.expense_policy_required IS NOT OLD.expense_policy_required OR
  NEW.assignment_expense_policy_id IS NOT OLD.assignment_expense_policy_id OR
  (NEW.reimbursement_amount_minor IS NOT OLD.reimbursement_amount_minor AND
    NOT ((OLD.reimbursement_amount_minor IS NULL AND NEW.reimbursement_amount_minor = OLD.amount_minor) OR
      (OLD.expense_policy_required=0 AND OLD.reimbursement_state<>'reimbursed' AND
       NEW.reimbursement_state='reimbursed' AND NEW.reimbursement_amount_minor=OLD.amount_minor)))
)
BEGIN
  SELECT RAISE(ABORT, 'invoiced expense is immutable; create an adjustment');
END;

-- Backfill: invoices voided before this migration release their sources the same way.
-- Released rows are archived first, so the void invoice keeps its full source history.
INSERT INTO invoice_void_source_release(
  source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,locked_at,
  source_hash,allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at,
  legacy_pointer,void_event_id,actor_id,released_at
)
SELECT s.source_link_id,s.invoice_id,s.invoice_line_id,s.source_type,s.source_id,s.source_version,
       s.locked_at,s.source_hash,s.allocated_net_minor,s.allocated_tax_minor,s.allocated_gross_minor,
       s.created_at,0,e.id,COALESCE(e.actor_id,'migration-0078'),i.voided_at
  FROM invoice_source s
  JOIN invoice i ON i.id=s.invoice_id AND i.state='void' AND i.voided_at IS NOT NULL
  JOIN invoice_event e ON e.id=(
    SELECT v.id FROM invoice_event v WHERE v.invoice_id=i.id AND v.event_type='void'
     ORDER BY v.occurred_at,v.id LIMIT 1)
 WHERE s.source_type IN('time','expense','milestone');
INSERT INTO invoice_void_source_release(
  source_link_id,invoice_id,source_type,source_id,legacy_pointer,void_event_id,actor_id,released_at
)
SELECT 'void-legacy-0078-'||p.source_type||'-'||p.source_id,p.invoice_id,p.source_type,p.source_id,1,e.id,
       COALESCE(e.actor_id,'migration-0078'),i.voided_at
  FROM (
    SELECT 'time' source_type,id source_id,invoice_id FROM time_entry WHERE invoice_id IS NOT NULL
    UNION ALL SELECT 'expense',id,invoice_id FROM expense WHERE invoice_id IS NOT NULL
    UNION ALL SELECT 'milestone',id,invoice_id FROM project_milestone WHERE invoice_id IS NOT NULL
  ) p
  JOIN invoice i ON i.id=p.invoice_id AND i.state='void' AND i.voided_at IS NOT NULL
  JOIN invoice_event e ON e.id=(
    SELECT v.id FROM invoice_event v WHERE v.invoice_id=i.id AND v.event_type='void'
     ORDER BY v.occurred_at,v.id LIMIT 1)
 WHERE NOT EXISTS(SELECT 1 FROM invoice_void_source_release r
   WHERE r.invoice_id=p.invoice_id AND r.source_type=p.source_type AND r.source_id=p.source_id);
DELETE FROM invoice_source
 WHERE source_link_id IN(SELECT source_link_id FROM invoice_void_source_release WHERE legacy_pointer=0);
UPDATE time_entry SET invoice_id=NULL,billing_status='unlocked',locked_at=NULL,locked_by=NULL,
       billing_lock_id=NULL,version=version+1
 WHERE invoice_id IS NOT NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r
   WHERE r.invoice_id=time_entry.invoice_id AND r.source_type='time' AND r.source_id=time_entry.id);
UPDATE expense SET invoice_id=NULL,billing_state='unlocked',billing_lock_id=NULL,version=version+1
 WHERE invoice_id IS NOT NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r
   WHERE r.invoice_id=expense.invoice_id AND r.source_type='expense' AND r.source_id=expense.id);
UPDATE project_milestone SET invoice_id=NULL,version=version+1
 WHERE invoice_id IS NOT NULL AND EXISTS(SELECT 1 FROM invoice_void_source_release r
   WHERE r.invoice_id=project_milestone.invoice_id AND r.source_type='milestone' AND r.source_id=project_milestone.id);
