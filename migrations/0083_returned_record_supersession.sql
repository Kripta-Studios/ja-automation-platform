-- J&A B5 migration 83: a correction supersedes the sent-back record it replaces.
--
-- A reviewer "sends back" (needs_changes) a time entry or expense; the worker answers
-- with an append-only correction linked through record_correction_link. Until now the
-- original stayed needs_changes forever, so queues, counters, hub totals, /workflow,
-- crew lists and receipt splits kept showing (and summing) it next to its correction.
--
-- Rule (same convention as the existing returned-correction retry and the correction
-- withdrawal): once the correction is sent for review (submitted, approved or locked),
-- the sent-back original is closed as 'rejected' with an approval_event that names the
-- correction. A correction draft that is still being edited or is withdrawn leaves the
-- original untouched, so the worker can still fix it. Corrections of APPROVED originals
-- are not affected: the approved original keeps counting until its correction is
-- approved (handled by the existing record_correction_link projections).
--
-- 1. Contract metadata rebuilt only to admit version 83 (as every migration does).
-- 2. Backfill: originals stuck in needs_changes behind a sent/approved correction.
-- 3. Triggers keep the rule for every approval/submit code path.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v82;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 83),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx','returned_record_supersession'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v82;
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
DROP TABLE migration_contract_metadata_v82;
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

-- 2. Backfill (append-only history first, then the state change).
INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at)
SELECT lower(hex(randomblob(16))),'time',original.id,'needs_changes','rejected',link.actor_user_id,
       'Superseded by correction '||link.correction_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM time_entry original
  JOIN record_correction_link link ON link.record_type='time_entry' AND link.original_id=original.id
  JOIN time_entry correction ON correction.id=link.correction_id
 WHERE original.approval_state='needs_changes'
   AND correction.approval_state IN('submitted','approved','locked')
   AND link.correction_id=(SELECT l2.correction_id FROM record_correction_link l2
                             JOIN time_entry c2 ON c2.id=l2.correction_id
                            WHERE l2.record_type='time_entry' AND l2.original_id=original.id
                              AND c2.approval_state IN('submitted','approved','locked')
                            ORDER BY l2.created_at DESC,l2.correction_id DESC LIMIT 1);
UPDATE time_entry SET approval_state='rejected',version=version+1,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE approval_state='needs_changes'
   AND EXISTS(SELECT 1 FROM record_correction_link link JOIN time_entry correction ON correction.id=link.correction_id
               WHERE link.record_type='time_entry' AND link.original_id=time_entry.id
                 AND correction.approval_state IN('submitted','approved','locked'));

INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at)
SELECT lower(hex(randomblob(16))),'expense',original.id,'needs_changes','rejected',link.actor_user_id,
       'Superseded by correction '||link.correction_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM expense original
  JOIN record_correction_link link ON link.record_type='expense' AND link.original_id=original.id
  JOIN expense correction ON correction.id=link.correction_id
 WHERE original.approval_state='needs_changes'
   AND correction.approval_state IN('submitted','approved','locked')
   AND link.correction_id=(SELECT l2.correction_id FROM record_correction_link l2
                             JOIN expense c2 ON c2.id=l2.correction_id
                            WHERE l2.record_type='expense' AND l2.original_id=original.id
                              AND c2.approval_state IN('submitted','approved','locked')
                            ORDER BY l2.created_at DESC,l2.correction_id DESC LIMIT 1);
UPDATE expense SET approval_state='rejected',version=version+1,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE approval_state='needs_changes'
   AND EXISTS(SELECT 1 FROM record_correction_link link JOIN expense correction ON correction.id=link.correction_id
               WHERE link.record_type='expense' AND link.original_id=expense.id
                 AND correction.approval_state IN('submitted','approved','locked'));

-- 3. Keep the rule on every path that sends a correction for review.
CREATE TRIGGER time_correction_supersedes_returned_original
AFTER UPDATE OF approval_state ON time_entry
WHEN NEW.approval_state IN('submitted','approved','locked')
 AND OLD.approval_state NOT IN('submitted','approved','locked')
 AND EXISTS(SELECT 1 FROM record_correction_link link JOIN time_entry original ON original.id=link.original_id
             WHERE link.record_type='time_entry' AND link.correction_id=NEW.id
               AND original.approval_state='needs_changes')
BEGIN
  INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at)
  SELECT lower(hex(randomblob(16))),'time',link.original_id,'needs_changes','rejected',
         COALESCE(NEW.approved_by,link.actor_user_id),'Superseded by correction '||NEW.id,NEW.updated_at
    FROM record_correction_link link
   WHERE link.record_type='time_entry' AND link.correction_id=NEW.id;
  UPDATE time_entry SET approval_state='rejected',version=version+1,updated_at=NEW.updated_at
   WHERE approval_state='needs_changes'
     AND id=(SELECT link.original_id FROM record_correction_link link
              WHERE link.record_type='time_entry' AND link.correction_id=NEW.id);
END;

CREATE TRIGGER expense_correction_supersedes_returned_original
AFTER UPDATE OF approval_state ON expense
WHEN NEW.approval_state IN('submitted','approved','locked')
 AND OLD.approval_state NOT IN('submitted','approved','locked')
 AND EXISTS(SELECT 1 FROM record_correction_link link JOIN expense original ON original.id=link.original_id
             WHERE link.record_type='expense' AND link.correction_id=NEW.id
               AND original.approval_state='needs_changes')
BEGIN
  INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at)
  SELECT lower(hex(randomblob(16))),'expense',link.original_id,'needs_changes','rejected',
         COALESCE(NEW.approved_by,link.actor_user_id),'Superseded by correction '||NEW.id,NEW.updated_at
    FROM record_correction_link link
   WHERE link.record_type='expense' AND link.correction_id=NEW.id;
  UPDATE expense SET approval_state='rejected',version=version+1,updated_at=NEW.updated_at
   WHERE approval_state='needs_changes'
     AND id=(SELECT link.original_id FROM record_correction_link link
              WHERE link.record_type='expense' AND link.correction_id=NEW.id);
END;

-- 4. A superseded original stays the canonical root of its correction chain: when the
--    reviewer sends the correction back too, the worker's retry links to the same root
--    (repository createCorrectionDraft). The link guard from migration 36 is recreated
--    unchanged except that it also admits a root closed by step 2/3 above (identified by
--    its 'Superseded by correction' approval_event), never a reviewer-rejected record.
DROP TRIGGER correction_link_subject_guard;
CREATE TRIGGER correction_link_subject_guard BEFORE INSERT ON record_correction_link WHEN
  (NEW.record_type='time_entry' AND (NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id))) OR
  (NEW.record_type='expense' AND (NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id))) OR
  (NEW.record_type='daily_report' AND (NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='technical_report' AND (NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='time_entry' AND (
    NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id AND (approval_state IN ('approved','locked','needs_changes') OR billing_status='locked' OR locked_at IS NOT NULL OR (approval_state='rejected' AND EXISTS(SELECT 1 FROM approval_event ae WHERE ae.entity_type='time' AND ae.entity_id=NEW.original_id AND ae.from_state='needs_changes' AND ae.to_state='rejected' AND ae.reason LIKE 'Superseded by correction %')))) OR
    NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id AND approval_state='draft' AND invoice_id IS NULL AND COALESCE(billing_status,'unlocked')='unlocked' AND locked_at IS NULL) OR
    NOT EXISTS(
      SELECT 1 FROM time_entry original
      JOIN time_entry correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='expense' AND (
    NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id AND (approval_state IN ('approved','locked','needs_changes') OR billing_state='locked' OR billing_lock_id IS NOT NULL OR (approval_state='rejected' AND EXISTS(SELECT 1 FROM approval_event ae WHERE ae.entity_type='expense' AND ae.entity_id=NEW.original_id AND ae.from_state='needs_changes' AND ae.to_state='rejected' AND ae.reason LIKE 'Superseded by correction %')))) OR
    NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id AND approval_state='draft' AND invoice_id IS NULL AND COALESCE(billing_state,'unlocked')='unlocked' AND billing_lock_id IS NULL) OR
    NOT EXISTS(
      SELECT 1 FROM expense original
      JOIN expense correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='daily_report' AND (
    NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id AND approval_state IN ('approved','locked')) OR
    NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id AND approval_state='draft') OR
    NOT EXISTS(
      SELECT 1 FROM daily_report original
      JOIN daily_report correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.worker_id=correction.worker_id
    )
  )) OR
  (NEW.record_type='technical_report' AND (
    NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id AND approval_state IN ('approved','locked')) OR
    NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id AND approval_state='draft') OR
    NOT EXISTS(
      SELECT 1 FROM technical_report original
      JOIN technical_report correction ON correction.id=NEW.correction_id
      WHERE original.id=NEW.original_id
        AND original.project_id=correction.project_id
        AND original.author_id=correction.author_id
    )
  )) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid correction subject'); END;
