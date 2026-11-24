-- J&A B5 migration 85: projects, team and supplier fixes (role audit 2026-11-22, group G4).
--
-- 1. Contract metadata rebuilt only to admit version 85 in its reviewed CHECK lists, like
--    every previous migration. The name list also admits migrations 83 and 84 (reserved by
--    parallel work packets) so all three apply in any merge order.
-- 2. D3 / T05: an installation authorization created a billable 'worker' assignment for the
--    supplier coordinator. Those grant-created memberships become the non-billable
--    'supplier_coordinator' scope role (dates and status unchanged). The coordinator's own
--    time rows that nobody has priced, approved for finance or invoiced yet are flagged
--    non_billable; approved, finance-reviewed, locked or invoiced rows are untouched.
-- 3. T06: a revoked authorization left the memberships it created open. Every still-active
--    supplier-created membership whose authorization was revoked (and that no other active
--    authorization covers) is ended: status inactive, end = revocation day, an earlier
--    planned end, or the last recorded day when work was recorded later (never cutting off
--    recorded history). A membership that had not started is cancelled (end before start),
--    the convention of an immediate assignment removal.
-- 4. T21: coordinator-recorded ordinary hours were stored as category 'work' instead of the
--    canonical 'regular'. Rows that are not invoiced, locked or in an invoice draft are
--    mapped to 'regular'; invoiced history keeps its snapshot value.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v8y;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 85),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession','billing_finance_audit_fixes','projects_team_supplier_fixes'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v8y;
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
DROP TABLE migration_contract_metadata_v8y;
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


UPDATE project_member
   SET assignment_role='supplier_coordinator',
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       version=version+1
 WHERE assignment_role='worker'
   AND EXISTS(SELECT 1 FROM supplier_user_profile sup
               WHERE sup.user_id=project_member.user_id AND sup.profile='supplier_coordinator')
   AND EXISTS(SELECT 1 FROM supplier_project_grant g
               WHERE g.project_id=project_member.project_id AND g.coordinator_id=project_member.user_id)
   AND EXISTS(SELECT 1 FROM audit_event a
               WHERE a.entity_type='project_member' AND a.entity_id=project_member.id
                 AND a.action='supplier.assignment.create');

UPDATE time_entry
   SET billability_state='non_billable',
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       version=version+1
 WHERE billability_state='pending'
   AND finance_approved_at IS NULL
   AND invoice_id IS NULL AND billing_lock_id IS NULL AND locked_at IS NULL
   AND billing_status='unlocked'
   AND approval_state NOT IN ('approved','void')
   AND EXISTS(SELECT 1 FROM supplier_user_profile sup
               WHERE sup.user_id=time_entry.worker_id AND sup.profile='supplier_coordinator')
   AND NOT EXISTS(SELECT 1 FROM project_member pm
                   WHERE pm.project_id=time_entry.project_id AND pm.user_id=time_entry.worker_id
                     AND pm.assignment_role NOT IN ('project_manager','supplier_coordinator')
                     AND pm.starts_on<=time_entry.work_date
                     AND (pm.ends_on IS NULL OR pm.ends_on>=time_entry.work_date))
   AND NOT EXISTS(SELECT 1 FROM invoice_source s WHERE s.source_type='time' AND s.source_id=time_entry.id);

UPDATE project_member
   SET status='inactive',
       ends_on=ended.new_end,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       version=version+1
  FROM (
    SELECT scoped.id,
           CASE
             WHEN scoped.starts_on>scoped.revoked_on AND scoped.last_recorded IS NULL THEN scoped.revoked_on
             WHEN scoped.last_recorded IS NOT NULL AND scoped.last_recorded>scoped.base_end THEN scoped.last_recorded
             ELSE scoped.base_end
           END new_end
      FROM (
        SELECT candidate.id,candidate.starts_on,candidate.revoked_on,
               CASE WHEN candidate.ends_on IS NOT NULL AND candidate.ends_on<candidate.revoked_on
                    THEN candidate.ends_on ELSE candidate.revoked_on END base_end,
               (SELECT MAX(source_date) FROM (
                  SELECT work_date source_date FROM time_entry
                   WHERE project_id=candidate.project_id AND worker_id=candidate.user_id AND approval_state<>'void'
                  UNION ALL SELECT spent_on FROM expense
                   WHERE project_id=candidate.project_id AND worker_id=candidate.user_id AND approval_state<>'void'
                  UNION ALL SELECT work_date FROM daily_report
                   WHERE project_id=candidate.project_id AND worker_id=candidate.user_id AND approval_state<>'void'
                  UNION ALL SELECT report_date FROM technical_report
                   WHERE project_id=candidate.project_id AND author_id=candidate.user_id AND approval_state<>'void'
               )) last_recorded
          FROM (
            SELECT pm.id,pm.project_id,pm.user_id,pm.starts_on,pm.ends_on,
                   (SELECT MAX(date(g.revoked_at)) FROM supplier_project_grant g
                     WHERE g.status='revoked' AND g.revoked_at IS NOT NULL AND g.project_id=pm.project_id
                       AND (g.coordinator_id=pm.user_id OR (sup.profile='external_technician' AND g.supplier_id=sup.supplier_id))
                   ) revoked_on
              FROM project_member pm
              JOIN supplier_user_profile sup ON sup.user_id=pm.user_id
             WHERE pm.status='active'
               AND EXISTS(SELECT 1 FROM audit_event a
                           WHERE a.entity_type='project_member' AND a.entity_id=pm.id
                             AND a.action='supplier.assignment.create')
               AND (
                 (sup.profile='supplier_coordinator'
                   AND EXISTS(SELECT 1 FROM supplier_project_grant g
                               WHERE g.status='revoked' AND g.project_id=pm.project_id AND g.coordinator_id=pm.user_id)
                   AND NOT EXISTS(SELECT 1 FROM supplier_project_grant g
                               WHERE g.status='active' AND g.project_id=pm.project_id AND g.coordinator_id=pm.user_id))
                 OR
                 (sup.profile='external_technician'
                   AND EXISTS(SELECT 1 FROM supplier_project_grant g
                               WHERE g.status='revoked' AND g.project_id=pm.project_id AND g.supplier_id=sup.supplier_id)
                   AND NOT EXISTS(SELECT 1 FROM supplier_project_grant g
                               WHERE g.status='active' AND g.project_id=pm.project_id AND g.supplier_id=sup.supplier_id))
               )
          ) candidate
         WHERE candidate.revoked_on IS NOT NULL
      ) scoped
  ) ended
 WHERE project_member.id=ended.id AND project_member.status='active';

UPDATE time_entry
   SET category='regular',
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       version=version+1
 WHERE category='work'
   AND invoice_id IS NULL AND billing_lock_id IS NULL AND locked_at IS NULL
   AND billing_status='unlocked'
   AND EXISTS(SELECT 1 FROM supplier_time_entry_recorder r WHERE r.time_entry_id=time_entry.id)
   AND NOT EXISTS(SELECT 1 FROM invoice_source s WHERE s.source_type='time' AND s.source_id=time_entry.id);
