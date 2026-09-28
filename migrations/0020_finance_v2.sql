-- B2 finance-v2 authority foundation.
-- The migration runner owns the transaction, contract metadata and
-- schema_migration row.  This file contains only deterministic DDL and
-- compatibility-preserving projections of the pre-0020 finance tables.

CREATE TABLE finance_hash_evidence(
  evidence_id TEXT PRIMARY KEY,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN('finance_request','finance_command','legal_entity_revision','configuration_revision','observed_invoice_manifest','observed_invoice_event_set','invoice_chain_anchor','invoice_subject','invoice_line','invoice_source','invoice_event','payment_record','payment_reversal','overcredit_authorization','expense_classification_revision','reimbursement_principal_revision','reimbursement_event','settlement_revision','authority_event','minimum_top_up','adjustment_source_link','direct_cost_event','collection_component','collection_allocation','collection_batch','finance_change_event','source_cut','pack_revision','report_source_manifest','report_revision','artifact_manifest','retry_decision','integrity_incident')),
  contract_version TEXT NOT NULL,
  semantic_id TEXT NOT NULL,
  canonical_blob BLOB NOT NULL CHECK(typeof(canonical_blob)='blob'),
  evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64),
  created_at TEXT NOT NULL,
  UNIQUE(evidence_type,contract_version,semantic_id),
  UNIQUE(evidence_type,contract_version,evidence_hash),
  UNIQUE(evidence_id,evidence_hash,evidence_type),
  UNIQUE(evidence_hash)
) STRICT;
CREATE TRIGGER finance_hash_evidence_verify BEFORE INSERT ON finance_hash_evidence
WHEN NEW.evidence_hash<>ja_finance_hash_v1(NEW.canonical_blob)
BEGIN SELECT RAISE(ABORT,'finance evidence hash mismatch'); END;
CREATE TRIGGER finance_hash_evidence_no_update BEFORE UPDATE ON finance_hash_evidence
BEGIN SELECT RAISE(ABORT,'finance evidence immutable'); END;
CREATE TRIGGER finance_hash_evidence_no_delete BEFORE DELETE ON finance_hash_evidence
BEGIN SELECT RAISE(ABORT,'finance evidence immutable'); END;

CREATE TABLE finance_command(
  command_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL UNIQUE,
  command_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_semantic_id TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT CHECK(currency IS NULL OR length(currency)=3),
  payload_hash TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  step_up_verified_at TEXT,
  step_up_expires_at TEXT,
  policy_revision_id TEXT,
  policy_hash TEXT,
  state TEXT NOT NULL CHECK(state IN('pending','completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK((state='pending' AND completed_at IS NULL) OR (state='completed' AND completed_at IS NOT NULL)),
  UNIQUE(tenant_id,deployment_id,operation,idempotency_key),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(request_hash) REFERENCES finance_hash_evidence(evidence_hash) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(command_hash) REFERENCES finance_hash_evidence(evidence_hash) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE finance_command_target(
  command_id TEXT PRIMARY KEY REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  target_kind TEXT NOT NULL,
  target_semantic_id TEXT NOT NULL,
  target_contract_version TEXT NOT NULL,
  UNIQUE(target_kind,target_semantic_id,target_contract_version)
) STRICT;
CREATE TRIGGER finance_command_target_no_update BEFORE UPDATE ON finance_command_target
BEGIN SELECT RAISE(ABORT,'finance command target immutable'); END;
CREATE TRIGGER finance_command_target_no_delete BEFORE DELETE ON finance_command_target
BEGIN SELECT RAISE(ABORT,'finance command target immutable'); END;
CREATE TRIGGER finance_command_no_delete BEFORE DELETE ON finance_command
BEGIN SELECT RAISE(ABORT,'finance command immutable'); END;
CREATE TRIGGER finance_command_evidence_guard BEFORE INSERT ON finance_command WHEN
  NOT EXISTS(SELECT 1 FROM finance_hash_evidence e WHERE e.evidence_hash=NEW.request_hash AND e.evidence_type='finance_request') OR
  NOT EXISTS(SELECT 1 FROM finance_hash_evidence e WHERE e.evidence_hash=NEW.command_hash AND e.evidence_type='finance_command')
BEGIN SELECT RAISE(ABORT,'finance command evidence identity mismatch'); END;
CREATE TRIGGER finance_command_guard_update BEFORE UPDATE ON finance_command
WHEN NOT(OLD.state='pending' AND NEW.state='completed' AND OLD.command_id=NEW.command_id
 AND OLD.request_hash=NEW.request_hash AND OLD.command_hash=NEW.command_hash
 AND OLD.tenant_id=NEW.tenant_id AND OLD.deployment_id=NEW.deployment_id
 AND OLD.operation=NEW.operation AND OLD.idempotency_key=NEW.idempotency_key
 AND OLD.principal_id=NEW.principal_id AND OLD.effective_at=NEW.effective_at
 AND OLD.target_kind=NEW.target_kind AND OLD.target_semantic_id=NEW.target_semantic_id
 AND OLD.amount_minor IS NEW.amount_minor AND OLD.currency IS NEW.currency
 AND OLD.payload_hash=NEW.payload_hash AND OLD.session_id_hash=NEW.session_id_hash
 AND OLD.step_up_verified_at IS NEW.step_up_verified_at
 AND OLD.step_up_expires_at IS NEW.step_up_expires_at
 AND OLD.policy_revision_id IS NEW.policy_revision_id
 AND OLD.policy_hash IS NEW.policy_hash
 AND OLD.created_at=NEW.created_at AND NEW.completed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid finance command transition'); END;

CREATE TABLE legal_entity_revision(
  revision_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK(revision_number>0),
  predecessor_revision_id TEXT REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  tax_identifier TEXT NOT NULL,
  registration_identifier TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  locality TEXT NOT NULL,
  region TEXT,
  postal_code TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK(length(country_code)=2),
  base_currency TEXT NOT NULL CHECK(length(base_currency)=3),
  timezone TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  revision_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK(effective_to IS NULL OR effective_from<effective_to),
  UNIQUE(series_id,revision_number),
  UNIQUE(series_id,predecessor_revision_id),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX legal_entity_one_genesis ON legal_entity_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE project_legal_entity_assignment(
  assignment_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK(effective_to IS NULL OR effective_from<effective_to),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE INDEX project_legal_entity_interval ON project_legal_entity_assignment(project_id,effective_from,effective_to);
CREATE TABLE finance_configuration_revision(
  revision_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK(revision_number>0),
  predecessor_revision_id TEXT REFERENCES finance_configuration_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  timezone TEXT NOT NULL,
  configuration_kind TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  revision_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK(effective_to IS NULL OR effective_from<effective_to),
  UNIQUE(series_id,revision_number),
  UNIQUE(series_id,predecessor_revision_id),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX finance_configuration_one_genesis ON finance_configuration_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE finance_change_event(
  change_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(evidence_type,evidence_id),
  FOREIGN KEY(evidence_id,evidence_hash,evidence_type) REFERENCES finance_hash_evidence(evidence_id,evidence_hash,evidence_type) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER finance_change_no_update BEFORE UPDATE ON finance_change_event
BEGIN SELECT RAISE(ABORT,'finance change immutable'); END;
CREATE TRIGGER finance_change_no_delete BEFORE DELETE ON finance_change_event
BEGIN SELECT RAISE(ABORT,'finance change immutable'); END;

CREATE TABLE expense_classification_series(
  id TEXT PRIMARY KEY,expense_id TEXT NOT NULL UNIQUE,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,
  tail_revision_id TEXT,current_authority_event_id TEXT,
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE expense_classification_revision(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES expense_classification_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  expense_id TEXT NOT NULL,revision_number INTEGER NOT NULL CHECK(revision_number>0),predecessor_revision_id TEXT REFERENCES expense_classification_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK(length(currency)=3),classification TEXT NOT NULL CHECK(classification IN('worker','company','client','third_party')),
  responsibility TEXT NOT NULL CHECK(responsibility IN('not_applicable','worker','company','client')),
  third_party_payer_kind TEXT, billable INTEGER NOT NULL CHECK(billable IN(0,1)), markup_bps INTEGER NOT NULL CHECK(markup_bps BETWEEN 0 AND 10000), tax_bps INTEGER NOT NULL CHECK(tax_bps BETWEEN 0 AND 100000),
  effective_at TEXT NOT NULL,reason TEXT NOT NULL,revision_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX expense_classification_one_genesis ON expense_classification_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE expense_classification_authority_event(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES expense_classification_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES expense_classification_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,prior_authority_event_id TEXT REFERENCES expense_classification_authority_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN('activate','supersede')),effective_at TEXT NOT NULL,reason TEXT,principal_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,
  UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE TABLE reimbursement_principal_series(
  id TEXT PRIMARY KEY,expense_id TEXT NOT NULL UNIQUE,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,tail_revision_id TEXT,current_authority_event_id TEXT,
  FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE reimbursement_principal_revision(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES reimbursement_principal_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,expense_id TEXT NOT NULL,revision_number INTEGER NOT NULL CHECK(revision_number>0),predecessor_revision_id TEXT REFERENCES reimbursement_principal_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,worker_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),principal_minor INTEGER NOT NULL CHECK(principal_minor>=0),responsibility TEXT NOT NULL CHECK(responsibility IN('not_applicable','worker','company','client')),payment_treatment TEXT NOT NULL,effective_at TEXT NOT NULL,reason TEXT NOT NULL,revision_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX reimbursement_principal_one_genesis ON reimbursement_principal_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE reimbursement_principal_authority_event(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES reimbursement_principal_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,revision_id TEXT NOT NULL REFERENCES reimbursement_principal_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,prior_authority_event_id TEXT REFERENCES reimbursement_principal_authority_event(id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN('activate','supersede')),effective_at TEXT NOT NULL,reason TEXT,principal_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE TABLE compensation_settlement_series_v2(
  id TEXT PRIMARY KEY,worker_id TEXT NOT NULL,project_id TEXT NOT NULL,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),tail_revision_id TEXT,current_authority_event_id TEXT,UNIQUE(worker_id,project_id,currency),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE compensation_settlement_revision_v2(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES compensation_settlement_series_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,worker_id TEXT NOT NULL,project_id TEXT NOT NULL,revision_number INTEGER NOT NULL CHECK(revision_number>0),predecessor_revision_id TEXT REFERENCES compensation_settlement_revision_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),period_start TEXT NOT NULL,period_end TEXT NOT NULL,gross_minor INTEGER NOT NULL CHECK(gross_minor>=0),withholding_minor INTEGER NOT NULL CHECK(withholding_minor>=0),expense_reimbursement_minor INTEGER NOT NULL CHECK(expense_reimbursement_minor>=0),net_minor INTEGER NOT NULL CHECK(net_minor=gross_minor-withholding_minor+expense_reimbursement_minor),status TEXT NOT NULL CHECK(status IN('candidate','failed')),effective_at TEXT NOT NULL,source_manifest_hash TEXT NOT NULL,revision_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),CHECK(period_start<period_end),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX compensation_settlement_one_genesis_v2 ON compensation_settlement_revision_v2(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE compensation_settlement_authority_event_v2(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES compensation_settlement_series_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,revision_id TEXT NOT NULL REFERENCES compensation_settlement_revision_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,prior_authority_event_id TEXT REFERENCES compensation_settlement_authority_event_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN('finalize','supersede')),effective_at TEXT NOT NULL,reason TEXT,principal_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE TABLE compensation_settlement_collection_batch(
  id TEXT PRIMARY KEY,settlement_revision_id TEXT NOT NULL REFERENCES compensation_settlement_revision_v2(id) ON UPDATE RESTRICT ON DELETE RESTRICT,collection_batch_id TEXT NOT NULL,payment_id TEXT,payment_reversal_id TEXT,source_hash TEXT NOT NULL,batch_hash TEXT NOT NULL,amount_minor INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(settlement_revision_id,collection_batch_id),CHECK((payment_id IS NULL)!=(payment_reversal_id IS NULL))
) STRICT;
CREATE TABLE client_minimum_policy_revision(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL,revision_number INTEGER NOT NULL CHECK(revision_number>0),predecessor_revision_id TEXT REFERENCES client_minimum_policy_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,client_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),period_start TEXT NOT NULL,period_end TEXT NOT NULL,minimum_minor INTEGER NOT NULL CHECK(minimum_minor>=0),eligibility_bps INTEGER NOT NULL CHECK(eligibility_bps BETWEEN 0 AND 10000),effective_from TEXT NOT NULL,effective_to TEXT,policy_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),CHECK(period_start<period_end),CHECK(effective_to IS NULL OR effective_from<effective_to)
) STRICT;
CREATE UNIQUE INDEX client_minimum_policy_one_genesis ON client_minimum_policy_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE billing_minimum_adjustment(
  id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,client_minimum_policy_revision_id TEXT NOT NULL REFERENCES client_minimum_policy_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,period_start TEXT NOT NULL,period_end TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),eligible_actual_minor INTEGER NOT NULL CHECK(eligible_actual_minor>=0),contractual_minimum_minor INTEGER NOT NULL CHECK(contractual_minimum_minor>=0),top_up_minor INTEGER NOT NULL CHECK(top_up_minor=MAX(0,contractual_minimum_minor-eligible_actual_minor)),calculation_hash TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,UNIQUE(invoice_id,client_minimum_policy_revision_id,period_start,period_end)
) STRICT;
CREATE TABLE invoice_chain_anchor(
  id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL UNIQUE REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,observed_manifest_hash TEXT,genesis_subject_hash TEXT NOT NULL,genesis_event_hash TEXT NOT NULL,anchored_at TEXT NOT NULL,anchored_by TEXT NOT NULL,command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,anchor_hash TEXT NOT NULL UNIQUE,FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE invoice_payment_reversal_event(
  id TEXT PRIMARY KEY,original_payment_id TEXT NOT NULL REFERENCES payment(id) ON UPDATE RESTRICT ON DELETE RESTRICT,invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),effective_at TEXT NOT NULL,reason_code TEXT NOT NULL,reason_text TEXT,prior_reversal_hash TEXT,reversal_payload_hash TEXT NOT NULL,actor_id TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,created_at TEXT NOT NULL,reversal_hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE invoice_overcredit_authorization(
  id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,payment_id TEXT NOT NULL REFERENCES payment(id) ON UPDATE RESTRICT ON DELETE RESTRICT,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),authorized_minor INTEGER NOT NULL CHECK(authorized_minor>0),expires_at TEXT,reason TEXT NOT NULL,principal_id TEXT NOT NULL,step_up_verified_at TEXT NOT NULL,policy_revision_id TEXT,command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,created_at TEXT NOT NULL,authorization_hash TEXT NOT NULL UNIQUE,FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE invoice_overcredit_consumption(
  id TEXT PRIMARY KEY,authorization_id TEXT NOT NULL REFERENCES invoice_overcredit_authorization(id) ON UPDATE RESTRICT ON DELETE RESTRICT,collection_batch_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor<>0),original_consumption_id TEXT,created_at TEXT NOT NULL,UNIQUE(authorization_id,collection_batch_id)
) STRICT;
CREATE TABLE direct_cost_series(
  id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),source_kind TEXT NOT NULL,source_id TEXT NOT NULL,UNIQUE(source_kind,source_id,currency),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE direct_cost_event(
  id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES direct_cost_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_sequence INTEGER NOT NULL CHECK(event_sequence>0),event_type TEXT NOT NULL CHECK(event_type IN('recognize','reverse')),tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,source_hash TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),effective_at TEXT NOT NULL,original_event_id TEXT,prior_event_hash TEXT,actor_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,created_at TEXT NOT NULL,event_hash TEXT NOT NULL UNIQUE,UNIQUE(series_id,event_sequence),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE expense_reimbursement_event_v2(
  id TEXT PRIMARY KEY,reimbursement_series_id TEXT NOT NULL REFERENCES reimbursement_principal_series(id) ON UPDATE RESTRICT ON DELETE RESTRICT,reimbursement_revision_id TEXT NOT NULL REFERENCES reimbursement_principal_revision(id) ON UPDATE RESTRICT ON DELETE RESTRICT,event_sequence INTEGER NOT NULL CHECK(event_sequence>0),event_type TEXT NOT NULL CHECK(event_type IN('recognize','pay','reverse')),effective_at TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),original_event_id TEXT,prior_event_hash TEXT,event_payload_hash TEXT NOT NULL,actor_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,created_at TEXT NOT NULL,event_hash TEXT NOT NULL UNIQUE,UNIQUE(reimbursement_series_id,event_sequence)
) STRICT;
CREATE TABLE reimbursement_reversal_event(
  id TEXT PRIMARY KEY,original_event_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),effective_at TEXT NOT NULL,reason TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,created_at TEXT NOT NULL,reversal_hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE invoice_collection_component(
  id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,component_kind TEXT NOT NULL CHECK(component_kind IN('labor','expense','milestone','minimum_top_up','tax','unapplied_credit')),source_invoice_line_id TEXT,source_adjustment_id TEXT,overcredit_authorization_id TEXT,currency TEXT NOT NULL CHECK(length(currency)=3),capacity_minor INTEGER NOT NULL CHECK(capacity_minor>=0),sort_key TEXT NOT NULL,source_hash TEXT NOT NULL,created_at TEXT NOT NULL
) STRICT;
CREATE TABLE invoice_collection_batch(
  id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,payment_id TEXT REFERENCES payment(id) ON UPDATE RESTRICT ON DELETE RESTRICT,payment_reversal_id TEXT,original_batch_id TEXT,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),collection_minor INTEGER NOT NULL,effective_at TEXT NOT NULL,prior_batch_hash TEXT,batch_hash_basis TEXT NOT NULL,batch_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,UNIQUE(payment_id),UNIQUE(payment_reversal_id),CHECK((payment_id IS NULL)!=(payment_reversal_id IS NULL)),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE invoice_collection_allocation(
  id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES invoice_collection_batch(id) ON UPDATE RESTRICT ON DELETE RESTRICT,component_id TEXT NOT NULL REFERENCES invoice_collection_component(id) ON UPDATE RESTRICT ON DELETE RESTRICT,allocation_sequence INTEGER NOT NULL CHECK(allocation_sequence>0),currency TEXT NOT NULL CHECK(length(currency)=3),allocated_minor INTEGER NOT NULL,component_capacity_minor INTEGER NOT NULL,prior_allocation_hash TEXT,allocation_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(batch_id,allocation_sequence),UNIQUE(batch_id,component_id)
) STRICT;
CREATE TABLE finance_source_cut(
  cut_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,currency TEXT NOT NULL CHECK(length(currency)=3),period_start TEXT NOT NULL,period_end TEXT NOT NULL,change_sequence_high_watermark INTEGER NOT NULL CHECK(change_sequence_high_watermark>=0),cut_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,CHECK(period_start<period_end),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE finance_source_cut_item(
  id TEXT PRIMARY KEY,cut_id TEXT NOT NULL REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,item_kind TEXT NOT NULL,item_id TEXT NOT NULL,item_version INTEGER NOT NULL CHECK(item_version>0),effective_at TEXT NOT NULL,evidence_type TEXT NOT NULL,evidence_id TEXT NOT NULL,evidence_hash TEXT NOT NULL,amount_minor INTEGER,currency TEXT CHECK(currency IS NULL OR length(currency)=3),item_hash TEXT NOT NULL UNIQUE,UNIQUE(cut_id,item_kind,item_id,item_version),FOREIGN KEY(evidence_id,evidence_hash,evidence_type) REFERENCES finance_hash_evidence(evidence_id,evidence_hash,evidence_type) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

-- Preserve legacy finance records while exposing the v2 identity/configuration
-- columns.  Existing values remain byte-for-byte unchanged; new writers must
-- populate the v2 columns through the domain services.
ALTER TABLE invoice ADD COLUMN tenant_id TEXT;
ALTER TABLE invoice ADD COLUMN deployment_id TEXT;
ALTER TABLE invoice ADD COLUMN legal_entity_revision_id TEXT;
ALTER TABLE invoice ADD COLUMN configuration_revision_id TEXT;
ALTER TABLE invoice ADD COLUMN predecessor_subject_hash TEXT;
ALTER TABLE invoice ADD COLUMN invoice_subject_hash TEXT;
ALTER TABLE invoice_line ADD COLUMN line_number INTEGER;
ALTER TABLE invoice_line ADD COLUMN line_kind TEXT;
ALTER TABLE invoice_line ADD COLUMN unit_amount_minor INTEGER;
ALTER TABLE invoice_line ADD COLUMN net_amount_minor INTEGER;
ALTER TABLE invoice_line ADD COLUMN tax_bps INTEGER;
ALTER TABLE invoice_line ADD COLUMN tax_amount_minor INTEGER;
ALTER TABLE invoice_line ADD COLUMN gross_amount_minor INTEGER;
ALTER TABLE invoice_line ADD COLUMN source_bucket_key TEXT;
ALTER TABLE invoice_line ADD COLUMN rounding_rank INTEGER;
ALTER TABLE invoice_line ADD COLUMN created_at TEXT;

ALTER TABLE invoice_source RENAME TO invoice_source_legacy_v2;
CREATE TABLE invoice_source(
  source_link_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  invoice_line_id TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN('time','expense','milestone','adjustment','minimum_top_up')),
  source_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  locked_at TEXT,
  source_hash TEXT,
  allocated_net_minor INTEGER,
  allocated_tax_minor INTEGER,
  allocated_gross_minor INTEGER,
  created_at TEXT,
  UNIQUE(invoice_id,source_type,source_id),
  UNIQUE(source_type,source_id)
) STRICT;
INSERT INTO invoice_source(source_link_id,invoice_id,source_type,source_id,source_version,locked_at)
SELECT 'legacy-source-v1:' || hex(CAST(invoice_id AS BLOB)) || ':' ||
       hex(CAST(source_type AS BLOB)) || ':' || hex(CAST(source_id AS BLOB)),
       invoice_id,source_type,source_id,source_version,locked_at
FROM invoice_source_legacy_v2;
DROP TABLE invoice_source_legacy_v2;
-- SQLite rewrites trigger SQL when a referenced table is renamed.  The
-- legacy draft-source triggers would otherwise retain a dangling reference
-- to invoice_source_legacy_v2 after the copy is dropped.  Rebind them to the
-- immutable v2 projection before any post-cutover write can observe it.
DROP TRIGGER IF EXISTS draft_invoice_time_source_no_update;
DROP TRIGGER IF EXISTS draft_invoice_time_source_no_delete;
DROP TRIGGER IF EXISTS draft_invoice_expense_source_no_update;
DROP TRIGGER IF EXISTS draft_invoice_expense_source_no_delete;
CREATE TRIGGER draft_invoice_time_source_no_update
BEFORE UPDATE ON time_entry
WHEN EXISTS(
  SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='time' AND s.source_id=OLD.id AND i.state IN('draft','approved')
)
AND(
  NEW.project_id IS NOT OLD.project_id OR NEW.worker_id IS NOT OLD.worker_id OR
  NEW.work_date IS NOT OLD.work_date OR NEW.category IS NOT OLD.category OR
  NEW.activity_summary IS NOT OLD.activity_summary OR NEW.activity_code IS NOT OLD.activity_code OR
  NEW.minutes IS NOT OLD.minutes OR NEW.site IS NOT OLD.site OR NEW.start_time IS NOT OLD.start_time OR
  NEW.end_time IS NOT OLD.end_time OR NEW.break_minutes IS NOT OLD.break_minutes
)
BEGIN SELECT RAISE(ABORT,'draft invoice time source is immutable'); END;
CREATE TRIGGER draft_invoice_time_source_no_delete
BEFORE DELETE ON time_entry
WHEN EXISTS(
  SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='time' AND s.source_id=OLD.id AND i.state IN('draft','approved')
)
BEGIN SELECT RAISE(ABORT,'draft invoice time source is immutable'); END;
CREATE TRIGGER draft_invoice_expense_source_no_update
BEFORE UPDATE ON expense
WHEN EXISTS(
  SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='expense' AND s.source_id=OLD.id AND i.state IN('draft','approved')
)
AND(
  NEW.project_id IS NOT OLD.project_id OR NEW.worker_id IS NOT OLD.worker_id OR
  NEW.spent_on IS NOT OLD.spent_on OR NEW.category IS NOT OLD.category OR NEW.vendor IS NOT OLD.vendor OR
  NEW.description IS NOT OLD.description OR NEW.currency IS NOT OLD.currency OR NEW.amount_minor IS NOT OLD.amount_minor OR
  NEW.client_treatment IS NOT OLD.client_treatment OR NEW.who_paid IS NOT OLD.who_paid OR
  NEW.payment_method IS NOT OLD.payment_method OR NEW.receipt_required IS NOT OLD.receipt_required OR
  NEW.receipt_document_id IS NOT OLD.receipt_document_id OR NEW.tax_amount_minor IS NOT OLD.tax_amount_minor OR
  NEW.markup_bps IS NOT OLD.markup_bps OR NEW.project_currency_amount_minor IS NOT OLD.project_currency_amount_minor OR
  NEW.billing_treatment IS NOT OLD.billing_treatment OR NEW.billing_amount_minor IS NOT OLD.billing_amount_minor OR
  NEW.fx_rate_bps IS NOT OLD.fx_rate_bps
)
BEGIN SELECT RAISE(ABORT,'draft invoice expense source is immutable'); END;
CREATE TRIGGER draft_invoice_expense_source_no_delete
BEFORE DELETE ON expense
WHEN EXISTS(
  SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
  WHERE s.source_type='expense' AND s.source_id=OLD.id AND i.state IN('draft','approved')
)
BEGIN SELECT RAISE(ABORT,'draft invoice expense source is immutable'); END;
CREATE UNIQUE INDEX locked_invoice_source_unique ON invoice_source(source_type,source_id) WHERE locked_at IS NOT NULL;
CREATE INDEX invoice_source_invoice_line_idx ON invoice_source(invoice_id,invoice_line_id);
CREATE TRIGGER issued_invoice_source_no_update_v2
BEFORE UPDATE ON invoice_source
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=OLD.invoice_id
    AND invoice.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice sources are immutable'); END;
CREATE TRIGGER issued_invoice_source_no_delete_v2
BEFORE DELETE ON invoice_source
WHEN OLD.locked_at IS NOT NULL OR EXISTS(
  SELECT 1 FROM invoice
  WHERE invoice.id=OLD.invoice_id
    AND invoice.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')
)
BEGIN SELECT RAISE(ABORT,'issued invoice sources are immutable'); END;

ALTER TABLE invoice_event ADD COLUMN event_sequence INTEGER;
ALTER TABLE invoice_event ADD COLUMN effective_at TEXT;
ALTER TABLE invoice_event ADD COLUMN reason_code TEXT;
ALTER TABLE invoice_event ADD COLUMN reason_text TEXT;
ALTER TABLE invoice_event ADD COLUMN prior_event_hash TEXT;
ALTER TABLE invoice_event ADD COLUMN event_payload_hash TEXT;
ALTER TABLE invoice_event ADD COLUMN command_id TEXT;
ALTER TABLE invoice_event ADD COLUMN created_at TEXT;
UPDATE invoice_event SET event_sequence=(SELECT count(*) FROM invoice_event prior WHERE prior.invoice_id=invoice_event.invoice_id AND (prior.occurred_at<invoice_event.occurred_at OR (prior.occurred_at=invoice_event.occurred_at AND prior.id<=invoice_event.id))), effective_at=occurred_at, reason_text=reason, created_at=occurred_at WHERE event_sequence IS NULL;
CREATE UNIQUE INDEX invoice_event_invoice_sequence_idx ON invoice_event(invoice_id,event_sequence);
CREATE INDEX invoice_event_prior_hash_idx ON invoice_event(invoice_id,prior_event_hash);

ALTER TABLE payment ADD COLUMN tenant_id TEXT;
ALTER TABLE payment ADD COLUMN deployment_id TEXT;
ALTER TABLE payment ADD COLUMN legal_entity_revision_id TEXT;
ALTER TABLE payment ADD COLUMN method TEXT;
ALTER TABLE payment ADD COLUMN external_reference TEXT;
ALTER TABLE payment ADD COLUMN prior_payment_hash TEXT;
ALTER TABLE payment ADD COLUMN payment_payload_hash TEXT;
ALTER TABLE payment ADD COLUMN actor_id TEXT;
ALTER TABLE payment ADD COLUMN command_id TEXT;
ALTER TABLE payment ADD COLUMN payment_hash TEXT;
CREATE INDEX payment_prior_hash_idx ON payment(invoice_id,prior_payment_hash);

ALTER TABLE invoice_adjustment ADD COLUMN tenant_id TEXT;
ALTER TABLE invoice_adjustment ADD COLUMN deployment_id TEXT;
ALTER TABLE invoice_adjustment ADD COLUMN currency TEXT;
ALTER TABLE invoice_adjustment ADD COLUMN amount_minor INTEGER;
ALTER TABLE invoice_adjustment ADD COLUMN effective_at TEXT;
ALTER TABLE invoice_adjustment ADD COLUMN prior_adjustment_hash TEXT;
ALTER TABLE invoice_adjustment ADD COLUMN adjustment_hash TEXT;
CREATE INDEX invoice_adjustment_prior_hash_idx ON invoice_adjustment(original_invoice_id,prior_adjustment_hash);

CREATE TABLE finance_internal_cost_snapshot(
  snapshot_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,project_id TEXT NOT NULL,legal_entity_revision_id TEXT,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,source_hash TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),amount_minor INTEGER NOT NULL,effective_at TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(source_kind,source_id,source_version,source_hash),FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER finance_snapshot_no_update BEFORE UPDATE ON finance_snapshot
BEGIN SELECT RAISE(ABORT,'legacy finance snapshot immutable'); END;
CREATE TRIGGER finance_snapshot_no_delete BEFORE DELETE ON finance_snapshot
BEGIN SELECT RAISE(ABORT,'legacy finance snapshot immutable'); END;

CREATE TABLE finance_v2_cutover(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  migration_version INTEGER NOT NULL CHECK(migration_version=20) REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64),
  cutover_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;

CREATE TRIGGER finance_revision_no_update BEFORE UPDATE ON legal_entity_revision
BEGIN SELECT RAISE(ABORT,'finance revision immutable'); END;
CREATE TRIGGER finance_revision_no_delete BEFORE DELETE ON legal_entity_revision
BEGIN SELECT RAISE(ABORT,'finance revision immutable'); END;
CREATE TRIGGER finance_configuration_no_update BEFORE UPDATE ON finance_configuration_revision
BEGIN SELECT RAISE(ABORT,'finance configuration immutable'); END;
CREATE TRIGGER finance_configuration_no_delete BEFORE DELETE ON finance_configuration_revision
BEGIN SELECT RAISE(ABORT,'finance configuration immutable'); END;

-- Finance history is append-only.  A later correction/reversal is a new
-- signed row linked to the preserved source; it is never an UPDATE/DELETE of
-- the historical row itself.  Series pointer rows are intentionally excluded
-- here because their guarded compare-and-set append is the only mutable
-- projection in this migration.
CREATE TRIGGER project_legal_entity_assignment_no_update BEFORE UPDATE ON project_legal_entity_assignment
BEGIN SELECT RAISE(ABORT,'legal-entity assignment immutable'); END;
CREATE TRIGGER project_legal_entity_assignment_no_delete BEFORE DELETE ON project_legal_entity_assignment
BEGIN SELECT RAISE(ABORT,'legal-entity assignment immutable'); END;
CREATE TRIGGER expense_classification_revision_no_update BEFORE UPDATE ON expense_classification_revision
BEGIN SELECT RAISE(ABORT,'expense classification immutable'); END;
CREATE TRIGGER expense_classification_revision_no_delete BEFORE DELETE ON expense_classification_revision
BEGIN SELECT RAISE(ABORT,'expense classification immutable'); END;
CREATE TRIGGER expense_classification_authority_no_update BEFORE UPDATE ON expense_classification_authority_event
BEGIN SELECT RAISE(ABORT,'expense classification authority immutable'); END;
CREATE TRIGGER expense_classification_authority_no_delete BEFORE DELETE ON expense_classification_authority_event
BEGIN SELECT RAISE(ABORT,'expense classification authority immutable'); END;
CREATE TRIGGER reimbursement_principal_revision_no_update BEFORE UPDATE ON reimbursement_principal_revision
BEGIN SELECT RAISE(ABORT,'reimbursement principal immutable'); END;
CREATE TRIGGER reimbursement_principal_revision_no_delete BEFORE DELETE ON reimbursement_principal_revision
BEGIN SELECT RAISE(ABORT,'reimbursement principal immutable'); END;
CREATE TRIGGER reimbursement_principal_authority_no_update BEFORE UPDATE ON reimbursement_principal_authority_event
BEGIN SELECT RAISE(ABORT,'reimbursement principal authority immutable'); END;
CREATE TRIGGER reimbursement_principal_authority_no_delete BEFORE DELETE ON reimbursement_principal_authority_event
BEGIN SELECT RAISE(ABORT,'reimbursement principal authority immutable'); END;
CREATE TRIGGER compensation_settlement_revision_no_update BEFORE UPDATE ON compensation_settlement_revision_v2
BEGIN SELECT RAISE(ABORT,'settlement revision immutable'); END;
CREATE TRIGGER compensation_settlement_revision_no_delete BEFORE DELETE ON compensation_settlement_revision_v2
BEGIN SELECT RAISE(ABORT,'settlement revision immutable'); END;
CREATE TRIGGER compensation_settlement_authority_no_update BEFORE UPDATE ON compensation_settlement_authority_event_v2
BEGIN SELECT RAISE(ABORT,'settlement authority immutable'); END;
CREATE TRIGGER compensation_settlement_authority_no_delete BEFORE DELETE ON compensation_settlement_authority_event_v2
BEGIN SELECT RAISE(ABORT,'settlement authority immutable'); END;
CREATE TRIGGER compensation_settlement_batch_no_update BEFORE UPDATE ON compensation_settlement_collection_batch
BEGIN SELECT RAISE(ABORT,'settlement collection immutable'); END;
CREATE TRIGGER compensation_settlement_batch_no_delete BEFORE DELETE ON compensation_settlement_collection_batch
BEGIN SELECT RAISE(ABORT,'settlement collection immutable'); END;
CREATE TRIGGER client_minimum_policy_no_update BEFORE UPDATE ON client_minimum_policy_revision
BEGIN SELECT RAISE(ABORT,'minimum policy immutable'); END;
CREATE TRIGGER client_minimum_policy_no_delete BEFORE DELETE ON client_minimum_policy_revision
BEGIN SELECT RAISE(ABORT,'minimum policy immutable'); END;
CREATE TRIGGER billing_minimum_adjustment_no_update BEFORE UPDATE ON billing_minimum_adjustment
BEGIN SELECT RAISE(ABORT,'minimum adjustment immutable'); END;
CREATE TRIGGER billing_minimum_adjustment_no_delete BEFORE DELETE ON billing_minimum_adjustment
BEGIN SELECT RAISE(ABORT,'minimum adjustment immutable'); END;
CREATE TRIGGER invoice_chain_anchor_no_update BEFORE UPDATE ON invoice_chain_anchor
BEGIN SELECT RAISE(ABORT,'invoice chain anchor immutable'); END;
CREATE TRIGGER invoice_chain_anchor_no_delete BEFORE DELETE ON invoice_chain_anchor
BEGIN SELECT RAISE(ABORT,'invoice chain anchor immutable'); END;
CREATE TRIGGER invoice_event_no_update_v2 BEFORE UPDATE ON invoice_event
BEGIN SELECT RAISE(ABORT,'invoice event immutable'); END;
CREATE TRIGGER invoice_event_no_delete_v2 BEFORE DELETE ON invoice_event
BEGIN SELECT RAISE(ABORT,'invoice event immutable'); END;
CREATE TRIGGER payment_no_update_v2 BEFORE UPDATE ON payment
BEGIN SELECT RAISE(ABORT,'payment immutable'); END;
CREATE TRIGGER payment_no_delete_v2 BEFORE DELETE ON payment
BEGIN SELECT RAISE(ABORT,'payment immutable'); END;
CREATE TRIGGER invoice_adjustment_no_update_v2 BEFORE UPDATE ON invoice_adjustment
BEGIN SELECT RAISE(ABORT,'invoice adjustment immutable'); END;
CREATE TRIGGER invoice_adjustment_no_delete_v2 BEFORE DELETE ON invoice_adjustment
BEGIN SELECT RAISE(ABORT,'invoice adjustment immutable'); END;
CREATE TRIGGER invoice_payment_reversal_no_update BEFORE UPDATE ON invoice_payment_reversal_event
BEGIN SELECT RAISE(ABORT,'payment reversal immutable'); END;
CREATE TRIGGER invoice_payment_reversal_no_delete BEFORE DELETE ON invoice_payment_reversal_event
BEGIN SELECT RAISE(ABORT,'payment reversal immutable'); END;
CREATE TRIGGER invoice_overcredit_authorization_no_update BEFORE UPDATE ON invoice_overcredit_authorization
BEGIN SELECT RAISE(ABORT,'overcredit authorization immutable'); END;
CREATE TRIGGER invoice_overcredit_authorization_no_delete BEFORE DELETE ON invoice_overcredit_authorization
BEGIN SELECT RAISE(ABORT,'overcredit authorization immutable'); END;
CREATE TRIGGER invoice_overcredit_consumption_no_update BEFORE UPDATE ON invoice_overcredit_consumption
BEGIN SELECT RAISE(ABORT,'overcredit consumption immutable'); END;
CREATE TRIGGER invoice_overcredit_consumption_no_delete BEFORE DELETE ON invoice_overcredit_consumption
BEGIN SELECT RAISE(ABORT,'overcredit consumption immutable'); END;
CREATE TRIGGER direct_cost_event_no_update BEFORE UPDATE ON direct_cost_event
BEGIN SELECT RAISE(ABORT,'direct cost event immutable'); END;
CREATE TRIGGER direct_cost_event_no_delete BEFORE DELETE ON direct_cost_event
BEGIN SELECT RAISE(ABORT,'direct cost event immutable'); END;
CREATE TRIGGER expense_reimbursement_event_no_update BEFORE UPDATE ON expense_reimbursement_event_v2
BEGIN SELECT RAISE(ABORT,'reimbursement event immutable'); END;
CREATE TRIGGER expense_reimbursement_event_no_delete BEFORE DELETE ON expense_reimbursement_event_v2
BEGIN SELECT RAISE(ABORT,'reimbursement event immutable'); END;
CREATE TRIGGER reimbursement_reversal_no_update BEFORE UPDATE ON reimbursement_reversal_event
BEGIN SELECT RAISE(ABORT,'reimbursement reversal immutable'); END;
CREATE TRIGGER reimbursement_reversal_no_delete BEFORE DELETE ON reimbursement_reversal_event
BEGIN SELECT RAISE(ABORT,'reimbursement reversal immutable'); END;
CREATE TRIGGER invoice_collection_component_no_update BEFORE UPDATE ON invoice_collection_component
BEGIN SELECT RAISE(ABORT,'collection component immutable'); END;
CREATE TRIGGER invoice_collection_component_no_delete BEFORE DELETE ON invoice_collection_component
BEGIN SELECT RAISE(ABORT,'collection component immutable'); END;
CREATE TRIGGER invoice_collection_batch_no_update BEFORE UPDATE ON invoice_collection_batch
BEGIN SELECT RAISE(ABORT,'collection batch immutable'); END;
CREATE TRIGGER invoice_collection_batch_no_delete BEFORE DELETE ON invoice_collection_batch
BEGIN SELECT RAISE(ABORT,'collection batch immutable'); END;
CREATE TRIGGER invoice_collection_allocation_no_update BEFORE UPDATE ON invoice_collection_allocation
BEGIN SELECT RAISE(ABORT,'collection allocation immutable'); END;
CREATE TRIGGER invoice_collection_allocation_no_delete BEFORE DELETE ON invoice_collection_allocation
BEGIN SELECT RAISE(ABORT,'collection allocation immutable'); END;
CREATE TRIGGER finance_source_cut_no_update BEFORE UPDATE ON finance_source_cut
BEGIN SELECT RAISE(ABORT,'finance source cut immutable'); END;
CREATE TRIGGER finance_source_cut_no_delete BEFORE DELETE ON finance_source_cut
BEGIN SELECT RAISE(ABORT,'finance source cut immutable'); END;
CREATE TRIGGER finance_source_cut_item_no_update BEFORE UPDATE ON finance_source_cut_item
BEGIN SELECT RAISE(ABORT,'finance source cut item immutable'); END;
CREATE TRIGGER finance_source_cut_item_no_delete BEFORE DELETE ON finance_source_cut_item
BEGIN SELECT RAISE(ABORT,'finance source cut item immutable'); END;
CREATE TRIGGER finance_internal_cost_snapshot_no_update BEFORE UPDATE ON finance_internal_cost_snapshot
BEGIN SELECT RAISE(ABORT,'internal cost snapshot immutable'); END;
CREATE TRIGGER finance_internal_cost_snapshot_no_delete BEFORE DELETE ON finance_internal_cost_snapshot
BEGIN SELECT RAISE(ABORT,'internal cost snapshot immutable'); END;

-- Every finance series is an immutable identity.  The two pointer columns are
-- projections only: a caller may advance them through one compare-and-set
-- append, but may not rewrite the subject, scope, currency or identity.  The
-- same rule is repeated for every v2 series instead of relying on a caller to
-- remember which fields are safe to update.
CREATE TRIGGER expense_classification_series_no_delete BEFORE DELETE ON expense_classification_series
BEGIN SELECT RAISE(ABORT,'expense classification series immutable'); END;
CREATE TRIGGER expense_classification_series_update_guard BEFORE UPDATE ON expense_classification_series WHEN
  NEW.id<>OLD.id OR NEW.expense_id<>OLD.expense_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT(NEW.tail_revision_id IS NOT NULL AND (OLD.tail_revision_id IS NULL OR NEW.tail_revision_id<>OLD.tail_revision_id))) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT(NEW.current_authority_event_id IS NOT NULL AND (OLD.current_authority_event_id IS NULL OR NEW.current_authority_event_id<>OLD.current_authority_event_id)))
BEGIN SELECT RAISE(ABORT,'invalid expense classification series update'); END;
CREATE TRIGGER expense_classification_series_pointer_guard BEFORE UPDATE ON expense_classification_series WHEN
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT EXISTS(
    SELECT 1 FROM expense_classification_revision r
    WHERE r.id=NEW.tail_revision_id AND r.series_id=NEW.id
      AND ((OLD.tail_revision_id IS NULL AND r.predecessor_revision_id IS NULL AND r.revision_number=1) OR
           (OLD.tail_revision_id IS NOT NULL AND r.predecessor_revision_id=OLD.tail_revision_id AND r.revision_number=(SELECT revision_number+1 FROM expense_classification_revision WHERE id=OLD.tail_revision_id)))
  )) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT EXISTS(
    SELECT 1 FROM expense_classification_authority_event a
    WHERE a.id=NEW.current_authority_event_id AND a.series_id=NEW.id
      AND ((OLD.current_authority_event_id IS NULL AND a.prior_authority_event_id IS NULL) OR
           (OLD.current_authority_event_id IS NOT NULL AND a.prior_authority_event_id=OLD.current_authority_event_id))
  ))
BEGIN SELECT RAISE(ABORT,'expense classification series pointer is not a compare-and-set append'); END;

CREATE TRIGGER reimbursement_principal_series_no_delete BEFORE DELETE ON reimbursement_principal_series
BEGIN SELECT RAISE(ABORT,'reimbursement principal series immutable'); END;
CREATE TRIGGER reimbursement_principal_series_update_guard BEFORE UPDATE ON reimbursement_principal_series WHEN
  NEW.id<>OLD.id OR NEW.expense_id<>OLD.expense_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT(NEW.tail_revision_id IS NOT NULL AND (OLD.tail_revision_id IS NULL OR NEW.tail_revision_id<>OLD.tail_revision_id))) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT(NEW.current_authority_event_id IS NOT NULL AND (OLD.current_authority_event_id IS NULL OR NEW.current_authority_event_id<>OLD.current_authority_event_id)))
BEGIN SELECT RAISE(ABORT,'invalid reimbursement principal series update'); END;
CREATE TRIGGER reimbursement_principal_series_pointer_guard BEFORE UPDATE ON reimbursement_principal_series WHEN
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT EXISTS(
    SELECT 1 FROM reimbursement_principal_revision r
    WHERE r.id=NEW.tail_revision_id AND r.series_id=NEW.id
      AND ((OLD.tail_revision_id IS NULL AND r.predecessor_revision_id IS NULL AND r.revision_number=1) OR
           (OLD.tail_revision_id IS NOT NULL AND r.predecessor_revision_id=OLD.tail_revision_id AND r.revision_number=(SELECT revision_number+1 FROM reimbursement_principal_revision WHERE id=OLD.tail_revision_id)))
  )) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT EXISTS(
    SELECT 1 FROM reimbursement_principal_authority_event a
    WHERE a.id=NEW.current_authority_event_id AND a.series_id=NEW.id
      AND ((OLD.current_authority_event_id IS NULL AND a.prior_authority_event_id IS NULL) OR
           (OLD.current_authority_event_id IS NOT NULL AND a.prior_authority_event_id=OLD.current_authority_event_id))
  ))
BEGIN SELECT RAISE(ABORT,'reimbursement principal series pointer is not a compare-and-set append'); END;

CREATE TRIGGER compensation_settlement_series_no_delete BEFORE DELETE ON compensation_settlement_series_v2
BEGIN SELECT RAISE(ABORT,'compensation settlement series immutable'); END;
CREATE TRIGGER compensation_settlement_series_update_guard BEFORE UPDATE ON compensation_settlement_series_v2 WHEN
  NEW.id<>OLD.id OR NEW.worker_id<>OLD.worker_id OR NEW.project_id<>OLD.project_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.currency<>OLD.currency OR
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT(NEW.tail_revision_id IS NOT NULL AND (OLD.tail_revision_id IS NULL OR NEW.tail_revision_id<>OLD.tail_revision_id))) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT(NEW.current_authority_event_id IS NOT NULL AND (OLD.current_authority_event_id IS NULL OR NEW.current_authority_event_id<>OLD.current_authority_event_id)))
BEGIN SELECT RAISE(ABORT,'invalid compensation settlement series update'); END;
CREATE TRIGGER compensation_settlement_series_pointer_guard BEFORE UPDATE ON compensation_settlement_series_v2 WHEN
  (NEW.tail_revision_id IS NOT OLD.tail_revision_id AND NOT EXISTS(
    SELECT 1 FROM compensation_settlement_revision_v2 r
    WHERE r.id=NEW.tail_revision_id AND r.series_id=NEW.id
      AND ((OLD.tail_revision_id IS NULL AND r.predecessor_revision_id IS NULL AND r.revision_number=1) OR
           (OLD.tail_revision_id IS NOT NULL AND r.predecessor_revision_id=OLD.tail_revision_id AND r.revision_number=(SELECT revision_number+1 FROM compensation_settlement_revision_v2 WHERE id=OLD.tail_revision_id)))
  )) OR
  (NEW.current_authority_event_id IS NOT OLD.current_authority_event_id AND NOT EXISTS(
    SELECT 1 FROM compensation_settlement_authority_event_v2 a
    WHERE a.id=NEW.current_authority_event_id AND a.series_id=NEW.id
      AND ((OLD.current_authority_event_id IS NULL AND a.prior_authority_event_id IS NULL) OR
           (OLD.current_authority_event_id IS NOT NULL AND a.prior_authority_event_id=OLD.current_authority_event_id))
  ))
BEGIN SELECT RAISE(ABORT,'compensation settlement series pointer is not a compare-and-set append'); END;

CREATE TRIGGER direct_cost_series_no_delete BEFORE DELETE ON direct_cost_series
BEGIN SELECT RAISE(ABORT,'direct cost series immutable'); END;
CREATE TRIGGER direct_cost_series_no_update BEFORE UPDATE ON direct_cost_series
BEGIN SELECT RAISE(ABORT,'direct cost series immutable'); END;

-- A revision line is a linked append.  In particular, a caller cannot make a
-- revision number look current while pointing at another series (or create a
-- second genesis).  These guards complement the UNIQUE indexes so the rule is
-- explicit and remains true for direct SQL writers.
CREATE TRIGGER legal_entity_revision_line_guard BEFORE INSERT ON legal_entity_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM legal_entity_revision prior
    WHERE prior.revision_id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  ))
BEGIN SELECT RAISE(ABORT,'invalid legal entity revision predecessor'); END;
CREATE TRIGGER finance_configuration_revision_line_guard BEFORE INSERT ON finance_configuration_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM finance_configuration_revision prior
    WHERE prior.revision_id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  ))
BEGIN SELECT RAISE(ABORT,'invalid finance configuration revision predecessor'); END;
CREATE TRIGGER expense_classification_revision_line_guard BEFORE INSERT ON expense_classification_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM expense_classification_revision prior
    WHERE prior.id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  )) OR
  NOT EXISTS(SELECT 1 FROM expense_classification_series s WHERE s.id=NEW.series_id AND s.expense_id=NEW.expense_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'invalid expense classification revision subject'); END;
CREATE TRIGGER reimbursement_principal_revision_line_guard BEFORE INSERT ON reimbursement_principal_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM reimbursement_principal_revision prior
    WHERE prior.id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  )) OR
  NOT EXISTS(SELECT 1 FROM reimbursement_principal_series s WHERE s.id=NEW.series_id AND s.expense_id=NEW.expense_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'invalid reimbursement principal revision subject'); END;
CREATE TRIGGER compensation_settlement_revision_line_guard BEFORE INSERT ON compensation_settlement_revision_v2 WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM compensation_settlement_revision_v2 prior
    WHERE prior.id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  )) OR
  NOT EXISTS(SELECT 1 FROM compensation_settlement_series_v2 s WHERE s.id=NEW.series_id AND s.worker_id=NEW.worker_id AND s.project_id=NEW.project_id AND s.currency=NEW.currency AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'invalid compensation settlement revision subject'); END;
CREATE TRIGGER client_minimum_policy_revision_line_guard BEFORE INSERT ON client_minimum_policy_revision WHEN
  (NEW.predecessor_revision_id IS NULL AND NEW.revision_number<>1) OR
  (NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM client_minimum_policy_revision prior
    WHERE prior.id=NEW.predecessor_revision_id AND prior.series_id=NEW.series_id
      AND prior.revision_number=NEW.revision_number-1
  ))
BEGIN SELECT RAISE(ABORT,'invalid minimum policy revision predecessor'); END;

CREATE TRIGGER expense_classification_authority_subject_guard BEFORE INSERT ON expense_classification_authority_event WHEN
  NOT EXISTS(SELECT 1 FROM expense_classification_revision r WHERE r.id=NEW.revision_id AND r.series_id=NEW.series_id) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_classification_authority_event prior WHERE prior.id=NEW.prior_authority_event_id AND prior.series_id=NEW.series_id))
BEGIN SELECT RAISE(ABORT,'expense classification authority is outside its series'); END;
CREATE TRIGGER reimbursement_principal_authority_subject_guard BEFORE INSERT ON reimbursement_principal_authority_event WHEN
  NOT EXISTS(SELECT 1 FROM reimbursement_principal_revision r WHERE r.id=NEW.revision_id AND r.series_id=NEW.series_id) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reimbursement_principal_authority_event prior WHERE prior.id=NEW.prior_authority_event_id AND prior.series_id=NEW.series_id))
BEGIN SELECT RAISE(ABORT,'reimbursement principal authority is outside its series'); END;
CREATE TRIGGER compensation_settlement_authority_subject_guard BEFORE INSERT ON compensation_settlement_authority_event_v2 WHEN
  NOT EXISTS(SELECT 1 FROM compensation_settlement_revision_v2 r WHERE r.id=NEW.revision_id AND r.series_id=NEW.series_id) OR
  (NEW.prior_authority_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM compensation_settlement_authority_event_v2 prior WHERE prior.id=NEW.prior_authority_event_id AND prior.series_id=NEW.series_id))
BEGIN SELECT RAISE(ABORT,'compensation settlement authority is outside its series'); END;
