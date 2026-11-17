-- J&A B5 migration 82: multi-currency support and ECB exchange rates.
--
-- 1. Currency CHECKs: worker_compensation_payment_event and project_person_defaults
--    were the only tables restricted to USD/BRL/EUR. They are rebuilt with the same
--    columns, data, indexes and immutability triggers; the currency CHECK becomes the
--    ISO-4217 shape used by every other money table (the application enforces the
--    curated list). project_member_default_terms is rebuilt only to keep its foreign
--    key bound to the rebuilt project_person_defaults table.
-- 2. exchange_rate: append-only ECB daily reference rates (1 EUR = rate QUOTE), stored
--    as exact decimal text; exchange_rate_fetch: one row per refresh attempt.
-- 3. currency_conversion: explicit, immutable, audited conversion of one source
--    record amount into another currency (rate, source, rate date, confirmer).
-- The contract metadata table is rebuilt only to admit version 82 in its reviewed
-- CHECK lists, exactly like every previous migration.

DROP TRIGGER migration_contract_metadata_no_update;
DROP TRIGGER migration_contract_metadata_no_delete;
DROP TRIGGER migration_contract_metadata_no_replace;
DROP TRIGGER finance_v2_cutover_no_update;
DROP TRIGGER finance_v2_cutover_no_delete;
DROP TRIGGER finance_v2_cutover_no_replace;
ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v8x;
CREATE TABLE migration_contract_metadata(
  migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 82),
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
    'expense_occurrence_time_shift_link','crew_leader_time','crew_expense_recorder','assignment_commercial_fallback','assignment_expense_policy','operational_time_expense_request','crew_shared_expense_allocation','combined_time_expense_billing','project_billing_setup_templates','approved_invoice_supersession','project_expense_budget','invoiced_expense_reimbursement','credit_note_overdue_repair','planning_assignment_actions','legacy_fx_reimbursement_settlement','correction_draft_withdrawal','default_ja_usd_invoice_issuer','project_worker_reimbursement_default','optional_planning_publication','invoice_preview_edit_defaults','issuer_document_settings','project_person_defaults','dated_reimbursement_preferences','unused_issuing_authority_replacement','client_labor_billing_units','project_site_client_crm','invoice_composition_selection','digital_work_coordination','void_invoice_source_release','invoice_inline_overrides','scale_indexes','assignment_purchase_order','multi_currency_fx'
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
INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_v8x;
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
DROP TABLE migration_contract_metadata_v8x;
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


-- 1a. Compensation payments: same table, ISO-4217-shaped currency CHECK.
DROP TRIGGER worker_compensation_payment_no_delete;
DROP TRIGGER worker_compensation_payment_no_update;
DROP INDEX worker_compensation_payment_settlement_idx;
DROP INDEX worker_compensation_payment_one_reversal;
ALTER TABLE worker_compensation_payment_event RENAME TO worker_compensation_payment_event_v81;
CREATE TABLE worker_compensation_payment_event(
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES compensation_settlement(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN('payment','reversal')),
  reverses_event_id TEXT REFERENCES worker_compensation_payment_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  payee_kind TEXT NOT NULL CHECK(payee_kind IN('person','supplier')),
  payee_user_id TEXT REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  payee_supplier_id TEXT REFERENCES supplier(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  paid_on TEXT NOT NULL CHECK(length(paid_on)=10),
  reference TEXT NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
  note TEXT CHECK(note IS NULL OR length(note)<=2000),
  created_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  CHECK(
    (payee_kind='person' AND payee_user_id IS NOT NULL AND payee_supplier_id IS NULL) OR
    (payee_kind='supplier' AND payee_user_id IS NULL AND payee_supplier_id IS NOT NULL)
  ),
  CHECK(
    (event_type='payment' AND reverses_event_id IS NULL) OR
    (event_type='reversal' AND reverses_event_id IS NOT NULL)
  )
) STRICT;
-- A reversal is always recorded after the payment it reverses, so rowid order satisfies the self reference.
INSERT INTO worker_compensation_payment_event
  SELECT * FROM worker_compensation_payment_event_v81 ORDER BY rowid;
-- Reversals only reference payments; remove them first so RESTRICT never fires on the old copy.
DELETE FROM worker_compensation_payment_event_v81 WHERE event_type='reversal';
DROP TABLE worker_compensation_payment_event_v81;
CREATE INDEX worker_compensation_payment_settlement_idx
  ON worker_compensation_payment_event(settlement_id,paid_on,created_at);
CREATE UNIQUE INDEX worker_compensation_payment_one_reversal
  ON worker_compensation_payment_event(reverses_event_id) WHERE reverses_event_id IS NOT NULL;
CREATE TRIGGER worker_compensation_payment_no_delete
BEFORE DELETE ON worker_compensation_payment_event
BEGIN SELECT RAISE(ABORT,'worker compensation payment history is immutable'); END;
CREATE TRIGGER worker_compensation_payment_no_update
BEFORE UPDATE ON worker_compensation_payment_event
BEGIN SELECT RAISE(ABORT,'worker compensation payment history is immutable'); END;

-- 1b. Project agreement defaults (and the link table that references them).
DROP TRIGGER project_person_defaults_no_update;
DROP TRIGGER project_person_defaults_no_delete;
DROP INDEX project_person_defaults_date_idx;
ALTER TABLE project_person_defaults RENAME TO project_person_defaults_v81;
CREATE TABLE project_person_defaults (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK(currency=upper(currency) AND currency GLOB '[A-Z][A-Z][A-Z]'),
  effective_from TEXT NOT NULL CHECK(length(effective_from)=10),
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  version INTEGER NOT NULL CHECK(version>0),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  UNIQUE(project_id,effective_from),
  UNIQUE(project_id,version)
) STRICT;
INSERT INTO project_person_defaults SELECT * FROM project_person_defaults_v81 ORDER BY rowid;
ALTER TABLE project_member_default_terms RENAME TO project_member_default_terms_v81;
CREATE TABLE project_member_default_terms (
  project_member_id TEXT PRIMARY KEY REFERENCES project_member(id) ON DELETE CASCADE,
  default_id TEXT NOT NULL REFERENCES project_person_defaults(id) ON DELETE CASCADE
) STRICT;
INSERT INTO project_member_default_terms SELECT * FROM project_member_default_terms_v81 ORDER BY rowid;
DROP TABLE project_member_default_terms_v81;
DROP TABLE project_person_defaults_v81;
CREATE INDEX project_person_defaults_date_idx ON project_person_defaults(project_id,effective_from);
CREATE TRIGGER project_person_defaults_no_update BEFORE UPDATE ON project_person_defaults
BEGIN SELECT RAISE(ABORT,'project agreement defaults are immutable'); END;
CREATE TRIGGER project_person_defaults_no_delete BEFORE DELETE ON project_person_defaults
WHEN EXISTS(SELECT 1 FROM project WHERE id=OLD.project_id)
BEGIN SELECT RAISE(ABORT,'project agreement defaults are immutable'); END;

-- 2. ECB daily reference rates: 1 EUR = rate_decimal QUOTE. Exact decimal text, append-only.
CREATE TABLE exchange_rate(
  rate_date TEXT NOT NULL CHECK(length(rate_date)=10 AND rate_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  base_currency TEXT NOT NULL CHECK(base_currency='EUR'),
  quote_currency TEXT NOT NULL CHECK(quote_currency=upper(quote_currency) AND quote_currency GLOB '[A-Z][A-Z][A-Z]' AND quote_currency<>'EUR'),
  rate_decimal TEXT NOT NULL CHECK(length(rate_decimal) BETWEEN 1 AND 24 AND rate_decimal NOT GLOB '*[^0-9.]*'
    AND rate_decimal GLOB '[0-9]*' AND rate_decimal NOT GLOB '*.*.*' AND rate_decimal NOT GLOB '*.'),
  source TEXT NOT NULL CHECK(source IN ('ECB')),
  fetched_at TEXT NOT NULL CHECK(length(fetched_at)>0),
  PRIMARY KEY(rate_date,quote_currency)
) STRICT;
CREATE INDEX exchange_rate_quote_date_idx ON exchange_rate(quote_currency,rate_date);
CREATE TRIGGER exchange_rate_no_update BEFORE UPDATE ON exchange_rate
BEGIN SELECT RAISE(ABORT,'exchange rates are append-only'); END;
CREATE TRIGGER exchange_rate_no_delete BEFORE DELETE ON exchange_rate
BEGIN SELECT RAISE(ABORT,'exchange rates are append-only'); END;

-- One row per refresh attempt (scheduled runner cycle or on demand). No personal data.
CREATE TABLE exchange_rate_fetch(
  id TEXT PRIMARY KEY,
  attempted_at TEXT NOT NULL CHECK(length(attempted_at)>0),
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('scheduled','on_demand')),
  outcome TEXT NOT NULL CHECK(outcome IN ('succeeded','failed')),
  latest_rate_date TEXT CHECK(latest_rate_date IS NULL OR length(latest_rate_date)=10),
  inserted_count INTEGER NOT NULL DEFAULT 0 CHECK(inserted_count>=0),
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) BETWEEN 1 AND 80),
  CHECK((outcome='succeeded' AND error_code IS NULL) OR (outcome='failed' AND error_code IS NOT NULL))
) STRICT;
CREATE INDEX exchange_rate_fetch_time_idx ON exchange_rate_fetch(attempted_at);
CREATE TRIGGER exchange_rate_fetch_no_update BEFORE UPDATE ON exchange_rate_fetch
BEGIN SELECT RAISE(ABORT,'exchange rate fetch log is append-only'); END;

-- 3. Explicit, audited conversion of one source amount into another currency.
--    1 source currency unit = rate_decimal target currency units. A correction is a new
--    row that supersedes the previous one; rows are never edited.
CREATE TABLE currency_conversion(
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('expense','invoice_line','document')),
  source_id TEXT NOT NULL CHECK(length(source_id) BETWEEN 1 AND 200),
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  document_date TEXT NOT NULL CHECK(length(document_date)=10),
  source_currency TEXT NOT NULL CHECK(source_currency=upper(source_currency) AND source_currency GLOB '[A-Z][A-Z][A-Z]'),
  source_amount_minor INTEGER NOT NULL CHECK(source_amount_minor>=0),
  target_currency TEXT NOT NULL CHECK(target_currency=upper(target_currency) AND target_currency GLOB '[A-Z][A-Z][A-Z]'),
  target_amount_minor INTEGER NOT NULL CHECK(target_amount_minor>=0),
  rate_decimal TEXT NOT NULL CHECK(length(rate_decimal) BETWEEN 1 AND 24 AND rate_decimal NOT GLOB '*[^0-9.]*'
    AND rate_decimal GLOB '[0-9]*' AND rate_decimal NOT GLOB '*.*.*' AND rate_decimal NOT GLOB '*.'),
  rate_source TEXT NOT NULL CHECK(rate_source IN ('ECB','manual')),
  rate_date TEXT CHECK(rate_date IS NULL OR length(rate_date)=10),
  proposed_rate_decimal TEXT CHECK(proposed_rate_decimal IS NULL OR length(proposed_rate_decimal) BETWEEN 1 AND 24),
  amount_edited INTEGER NOT NULL DEFAULT 0 CHECK(amount_edited IN (0,1)),
  note TEXT CHECK(note IS NULL OR length(note)<=500),
  supersedes_id TEXT REFERENCES currency_conversion(id) ON DELETE CASCADE,
  confirmed_by TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)>0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 240),
  CHECK(source_currency<>target_currency),
  CHECK(rate_source='manual' OR rate_date IS NOT NULL)
) STRICT;
CREATE INDEX currency_conversion_source_idx
  ON currency_conversion(source_kind,source_id,target_currency,confirmed_at);
CREATE UNIQUE INDEX currency_conversion_one_successor
  ON currency_conversion(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE TRIGGER currency_conversion_no_update BEFORE UPDATE ON currency_conversion
BEGIN SELECT RAISE(ABORT,'currency conversions are immutable'); END;
CREATE TRIGGER currency_conversion_no_delete BEFORE DELETE ON currency_conversion
WHEN OLD.project_id IS NULL OR EXISTS(SELECT 1 FROM project WHERE id=OLD.project_id)
BEGIN SELECT RAISE(ABORT,'currency conversions are immutable'); END;

DROP TRIGGER audit_action_registry_manifest_guard;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
 ('B5-R4','currency_conversion.confirm','currency_conversion','user','WP-FX','restricted'),
 ('B5-R4','exchange_rate.refresh','exchange_rate','user','WP-FX','internal'),
 ('B5-R4','exchange_rate.refresh','exchange_rate','system','WP-FX','internal');
CREATE TRIGGER audit_action_registry_manifest_guard BEFORE INSERT ON audit_action_registry WHEN NOT EXISTS(
 SELECT 1 FROM audit_action_registry reviewed WHERE reviewed.contract_version=NEW.contract_version
 AND reviewed.action=NEW.action AND reviewed.entity_type=NEW.entity_type AND reviewed.actor_kind=NEW.actor_kind
 AND reviewed.owner_packet=NEW.owner_packet AND reviewed.data_classification=NEW.data_classification
)
BEGIN SELECT RAISE(ABORT,'audit action is not in the reviewed manifest'); END;
