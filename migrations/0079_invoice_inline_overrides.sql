-- J&A B5 migration 79: invoice-only overrides and inline invoice fixes (phase 2).
--
-- Additive only:
-- * invoice_line_override: rate / billed hours per person, tax / PO per invoice, recorded on
--   an unissued draft only. Rows are append-only (a change supersedes the active row) and are
--   frozen with the invoice once it leaves draft; the engine applies them, so the dry run,
--   the draft and the issued snapshot carry the same exact amounts.
-- * client.tax_id: client tax identification printed on new invoices.
-- * Project lifecycle: the owner may reactivate a closing/closed project (owner decision
--   2026-11-16); the lifecycle history now records closing/closed -> active natively.
-- * Reviewed audit actions for invoice preparation, TOTP sign-in, invitation revoke,
--   project reactivation, stream tax changes and same-day rate replacement.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v78;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 79),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v78;
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
DROP TABLE migration_contract_metadata_v78;
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


ALTER TABLE client ADD COLUMN tax_id TEXT NULL
  CHECK(tax_id IS NULL OR length(trim(tax_id)) BETWEEN 1 AND 64);

CREATE TABLE invoice_line_override(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('person','invoice')),
  worker_id TEXT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  category TEXT NULL CHECK(category IS NULL OR length(category) BETWEEN 1 AND 64),
  rate_minor INTEGER NULL CHECK(rate_minor IS NULL OR rate_minor BETWEEN 0 AND 100000000000),
  billed_minutes INTEGER NULL CHECK(billed_minutes IS NULL OR billed_minutes BETWEEN 0 AND 10000000),
  worked_minutes INTEGER NULL CHECK(worked_minutes IS NULL OR worked_minutes>=0),
  tax_mode TEXT NULL CHECK(tax_mode IS NULL OR tax_mode IN ('profile','exempt')),
  tax_profile_id TEXT NULL REFERENCES tax_profile(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  purchase_no TEXT NULL CHECK(purchase_no IS NULL OR length(purchase_no) BETWEEN 1 AND 200),
  reason TEXT NULL CHECK(reason IS NULL OR length(reason)<=2000),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  superseded_at TEXT NULL CHECK(superseded_at IS NULL OR length(superseded_at)>0),
  CHECK(
    (target_kind='person' AND worker_id IS NOT NULL AND tax_mode IS NULL AND tax_profile_id IS NULL
      AND purchase_no IS NULL AND (rate_minor IS NOT NULL OR billed_minutes IS NOT NULL)) OR
    (target_kind='invoice' AND worker_id IS NULL AND category IS NULL AND rate_minor IS NULL
      AND billed_minutes IS NULL AND worked_minutes IS NULL AND (tax_mode IS NOT NULL OR purchase_no IS NOT NULL))
  ),
  CHECK(
    (tax_mode IS NULL AND tax_profile_id IS NULL) OR
    (tax_mode='exempt' AND tax_profile_id IS NULL) OR
    (tax_mode='profile' AND tax_profile_id IS NOT NULL)
  )
) STRICT;
CREATE UNIQUE INDEX invoice_line_override_active_uq ON invoice_line_override(
  invoice_id,target_kind,COALESCE(worker_id,''),COALESCE(category,'')
) WHERE superseded_at IS NULL;
CREATE INDEX invoice_line_override_invoice_idx ON invoice_line_override(invoice_id,created_at);
CREATE TRIGGER invoice_line_override_draft_insert BEFORE INSERT ON invoice_line_override
WHEN NEW.superseded_at IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM invoice WHERE id=NEW.invoice_id AND state='draft' AND invoice_number IS NULL AND issued_at IS NULL
)
BEGIN SELECT RAISE(ABORT,'invoice overrides can only be added to an unissued draft'); END;
CREATE TRIGGER invoice_line_override_append_only BEFORE UPDATE ON invoice_line_override
WHEN OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL
  OR NEW.id IS NOT OLD.id OR NEW.invoice_id IS NOT OLD.invoice_id OR NEW.target_kind IS NOT OLD.target_kind
  OR NEW.worker_id IS NOT OLD.worker_id OR NEW.category IS NOT OLD.category
  OR NEW.rate_minor IS NOT OLD.rate_minor OR NEW.billed_minutes IS NOT OLD.billed_minutes
  OR NEW.worked_minutes IS NOT OLD.worked_minutes OR NEW.tax_mode IS NOT OLD.tax_mode
  OR NEW.tax_profile_id IS NOT OLD.tax_profile_id OR NEW.purchase_no IS NOT OLD.purchase_no
  OR NEW.reason IS NOT OLD.reason OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
  OR NOT EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND state='draft' AND invoice_number IS NULL AND issued_at IS NULL)
BEGIN SELECT RAISE(ABORT,'invoice overrides are append-only and frozen once the invoice leaves draft'); END;
CREATE TRIGGER invoice_line_override_retained BEFORE DELETE ON invoice_line_override
WHEN EXISTS(SELECT 1 FROM invoice WHERE id=OLD.invoice_id AND (state<>'draft' OR invoice_number IS NOT NULL OR issued_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invoice overrides of an approved or issued invoice are retained'); END;

DROP TRIGGER entity_lifecycle_subject_guard;
CREATE TRIGGER entity_lifecycle_subject_guard BEFORE INSERT ON entity_lifecycle_event WHEN
  (NEW.entity_type='client' AND NOT EXISTS(SELECT 1 FROM client WHERE id=NEW.entity_id)) OR
  (NEW.entity_type='project' AND NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.entity_id)) OR
  (NEW.provenance='migration_observed' AND (NEW.from_state IS NOT NULL OR NEW.to_state<>'archived')) OR
  (NEW.provenance='native' AND NOT (
    (NEW.entity_type='client' AND ((NEW.from_state='active' AND NEW.to_state IN ('closed','archived')) OR (NEW.from_state='closed' AND NEW.to_state IN ('active','archived')) OR (NEW.from_state='archived' AND NEW.to_state IN ('active','closed')))) OR
    (NEW.entity_type='project' AND ((NEW.from_state='draft' AND NEW.to_state IN ('planned','active','archived')) OR (NEW.from_state='planned' AND NEW.to_state IN ('active','paused','archived')) OR (NEW.from_state='active' AND NEW.to_state IN ('paused','closing')) OR (NEW.from_state='paused' AND NEW.to_state IN ('active','closing')) OR (NEW.from_state='closing' AND NEW.to_state IN ('closed','active')) OR (NEW.from_state='closed' AND NEW.to_state IN ('archived','active')) OR (NEW.from_state='archived' AND NEW.to_state IN ('draft','planned','closed')))))) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid lifecycle subject'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','invoice.approve_on_behalf','project','user','WP-INV2','restricted'),
 ('B5-R4','invoice_line_override.create','invoice','user','WP-INV2','restricted'),
 ('B5-R4','invoice_line_override.supersede','invoice','user','WP-INV2','restricted'),
 ('B5-R4','billing_rule.tax_profile_change','billing_rule','user','WP-INV2','restricted'),
 ('B5-R4','time.correct_from_invoice','time_entry','user','WP-INV2','confidential'),
 ('B5-R4','client_rate.replace_same_day','client_labor_rate','user','WP-INV2','restricted'),
 ('B5-R4','compensation_rule.replace_same_day','compensation_rule','user','WP-INV2','restricted'),
 ('B5-R4','internal_cost.replace_same_day','internal_cost_rule','user','WP-INV2','restricted'),
 ('B5-R4','security.mfa.login','user','user','WP-MFA','restricted'),
 ('B5-R4','invitation.revoke','invitation','user','WP-B5','confidential'),
 ('B5-R4','project.reactivate','project','user','WP-B5','confidential');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
