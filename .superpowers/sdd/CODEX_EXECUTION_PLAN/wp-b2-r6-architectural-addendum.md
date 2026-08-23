# WP-B2 R6.3 Superseding Finance and Migration Contract

Status: **BLOCKED — R6.3 drafted; fresh Finance + Migration reviews required**

Date: 2026-08-20

Owner: finance/reporting contract implementation lane, materializing the recovered Sol/high R6.3 handoff

This is the complete R6.3 implementation contract, not an approval or lease. It fully supersedes
R6.2/R6.1/R6.0/R5 and conflicting B5-r4 shared finance, migration, job, descriptor and schema
semantics. Non-conflicting security/RBAC clauses survive. No implementation opens until fresh
Finance Integrity and Migration Safety reviewers approve the identical bytes recorded by the parent.

## 1. Binding DAG and ownership

```text
literal R6.3 appendices + dual approval
 -> B2-MH runner/CANON/descriptors/lock
 -> freeze 0019 -> B5 executes 0019 -> schema export/review
 -> freeze 0020 -> B2 executes 0020 -> schema export/review
 -> B2-Core services/repositories
 -> freeze 0021 -> B3 executes 0021 -> schema export/review
 -> freeze 0022 -> B4 executes 0022 -> schema export/review
 -> B5-F/B5-I reconciliation
```

There is one sequential migration writer and no intervening migration number. Exact schema ownership:

| Migration | Schema sources                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------- |
| 0019      | `schema/lifecycle-security.ts`, `offline.ts`, `audit.ts`, `jobs.ts`, `documents.ts`, `technical.ts`     |
| 0020      | new `schema/finance-v2.ts`, plus `invoices.ts`, `finance-accounting.ts`, `expenses.ts`, `commercial.ts` |
| 0021      | new `schema/accounting-packs.ts`                                                                        |
| 0022      | new `schema/report-registry.ts`, plus `reports.ts`                                                      |

Only the sequential export lane leases `schema.ts`. R6.3 withdraws B5's `.manifest.json` descriptor
name and every conflicting shared path/job/capability/payload/retry/migration-owner statement.

## 2. Descriptor freeze, relocatable identity and heartbeat

Exact artifacts:

```text
packages/database/migrations/contracts/canon-v1-vectors.json
packages/database/migrations/contracts/0019.contract.json
packages/database/migrations/contracts/0019.projection.sql
packages/database/migrations/contracts/0020.contract.json
packages/database/migrations/contracts/0020.projection.sql
packages/database/migrations/contracts/0021.contract.json
packages/database/migrations/contracts/0021.projection.sql
packages/database/migrations/contracts/0022.contract.json
packages/database/migrations/contracts/0022.projection.sql
```

`.contract.json` is authoritative. For each migration, freeze SQL, projection and ordered schema
source bytes; record actual SHA-256 for them, CANON vectors, encoder, runner, heartbeat worker and
schema manifest; independently recompute/review and test; then execute/export. Any byte change
invalidates the descriptor and downstream approvals. Future/zero/example/`TBD` digests are forbidden.

The real path is ephemeral lock identity only. Verify `PRAGMA database_list` main resolves to it and
use `<realpath>.ja-migrate.lock`. Never persist/compare a path hash for readiness. 0019 creates the
immutable singleton `deployment_identity`; `database_identity_hash =
F('database-identity-v1'; tenant_id,deployment_id,anchored_at)`. A moved/restored DB retains identity.

New `packages/database/src/migrations/migration-lock-heartbeat-worker.ts` owns the `wx` handle in a
Worker thread, rewriting+flushing+fsyncing strict lock JSON every two seconds. Successful durable
writes may be at most five seconds apart. Atomics expose monotonic last success, error and stop/ack.
The synchronous runner checks health before/after every phase and before COMMIT. Gap >5 seconds,
death, write/fsync error or malformed ownership causes ROLLBACK, close and lock preservation. Only
the worker unlinks after stop acknowledgement and an exact on-disk
`{databaseIdentityHash,ownerToken,pid,startedAt}` match. Crash leaves the lock.

Each migration uses a dedicated file-backed `DatabaseSync`, `BEGIN IMMEDIATE`, deterministic
`ja_finance_hash_v1(BLOB)`, all eleven vectors, descriptor-before/after checks, pre/post projections,
metadata/schema_migration append, FK/integrity/schema checks and a final heartbeat check. Catch
rolls back; finally closes; all primary/rollback/close/heartbeat/lock errors survive in AggregateError.
Runtime opens a fresh connection/UDF. SQL contains no transaction control or schema-migration insert.

## 3. CANON-V1 closed evidence universe

`F(domain; fields...) = lowerhex(SHA-256(JAFC-v1(RECORD[TEXT(domain), fields...])))`.
JAFC-v1 has only typed NULL, INT64, TEXT, BLOB, ARRAY and RECORD; frozen byte lengths/arities; strict
UTF-8; unsigned UTF-8/binary ordering. No JSON stringify, locale ordering, affinity coercion or REAL.
The sole 33 registered formulas, with binding field order, are:

1. `finance_request`: `F('finance-request-v3'; tenant_id,deployment_id,operation,idempotency_key,principal_id,session_id_hash,effective_at,target_kind,target_semantic_id,amount_minor_or_null,currency_or_null,payload_hash,step_up_verified_at_or_null,step_up_expires_at_or_null,policy_revision_id_or_null,policy_hash_or_null)`.
2. `finance_command`: `F('finance-command-v3'; command_id,request_hash,tenant_id,deployment_id,operation,idempotency_key,principal_id,effective_at,target_kind,target_semantic_id,amount_minor_or_null,currency_or_null,payload_hash,session_id_hash,step_up_verified_at_or_null,step_up_expires_at_or_null,policy_revision_id_or_null,policy_hash_or_null)`.
3. `legal_entity_revision`: `F('legal-entity-revision-v1'; revision_id,series_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,legal_name,tax_identifier,registration_identifier_or_null,address_line1,address_line2_or_null,locality,region_or_null,postal_code,country_code,base_currency,timezone,effective_from,effective_to_or_null,created_at,created_by,command_id)`.
4. `configuration_revision`: `F('finance-configuration-revision-v1'; revision_id,series_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,configuration_kind,payload_hash,effective_from,effective_to_or_null,created_at,created_by,command_id)`.
5. `observed_invoice_manifest`: `F('observed-invoice-manifest-v1'; invoice_id,ARRAY[id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,issued_at,snapshot_json,created_at,updated_at,version,billing_rule_id,period_start,period_end,due_at,calculation_hash,sent_at,pdf_status,pdf_storage_key,pdf_sha256,pdf_generated_at,source_lock_at,voided_at,pdf_byte_length],ARRAY[ordered observed_invoice_event_set hashes])`; extracted SQLite types are unchanged.
6. `observed_invoice_event_set`: `F('observed-invoice-event-set-v1'; invoice_id,ARRAY[RECORD[id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key] ordered by occurred_at COLLATE BINARY,id COLLATE BINARY])`.
7. `invoice_chain_anchor`: `F('invoice-chain-anchor-v1'; anchor_id,invoice_id,tenant_id,deployment_id,observed_manifest_hash_or_null,genesis_subject_hash,genesis_event_hash,anchored_at,anchored_by,command_id)`.
8. `invoice_subject`: `F('invoice-subject-v2'; invoice_id,tenant_id,deployment_id,project_id,legal_entity_revision_id,configuration_revision_id,invoice_number,stream_type,currency,period_start,period_end,due_at,subtotal_minor,tax_minor,total_minor,calculation_hash,predecessor_subject_hash_or_null,created_at,created_by,command_id)`.
9. `invoice_line`: `F('invoice-line-v2'; line_id,invoice_id,line_number,line_kind,description,quantity_numerator,quantity_denominator,unit_amount_minor,net_amount_minor,tax_bps,tax_amount_minor,gross_amount_minor,source_bucket_key,rounding_rank,created_at)`.
10. `invoice_source`: `F('invoice-source-v2'; source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,source_hash,allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at)`.
11. `invoice_event`: `F('invoice-event-v2'; event_id,invoice_id,event_sequence,event_type,effective_at,amount_minor_or_null,currency,reason_code_or_null,reason_text_or_null,prior_event_hash,event_payload_hash,actor_id,command_id,created_at)`.
12. `payment_record`: `F('payment-record-v2'; payment_id,invoice_id,tenant_id,deployment_id,legal_entity_revision_id,currency,amount_minor,received_at,method,external_reference_or_null,idempotency_key,prior_payment_hash,payment_payload_hash,actor_id,command_id,created_at)`.
13. `payment_reversal`: `F('payment-reversal-v2'; reversal_id,original_payment_id,invoice_id,currency,amount_minor,effective_at,reason_code,reason_text_or_null,prior_reversal_hash,reversal_payload_hash,actor_id,command_id,created_at)`; amount is positive and sign derives from type.
14. `overcredit_authorization`: `F('overcredit-authorization-v1'; authorization_id,invoice_id,payment_id,tenant_id,deployment_id,currency,authorized_minor,consumed_minor,expires_at_or_null,reason,principal_id,step_up_verified_at,policy_revision_id,command_id,created_at)`.
15. `expense_classification_revision`: `F('expense-classification-revision-v1'; revision_id,series_id,expense_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,project_id,legal_entity_revision_id,currency,classification,responsibility,third_party_payer_kind_or_null,billable,markup_bps,tax_bps,effective_at,reason,created_at,created_by,command_id)`.
16. `reimbursement_principal_revision`: `F('reimbursement-principal-revision-v1'; revision_id,series_id,expense_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,worker_id,project_id,legal_entity_revision_id,currency,principal_minor,responsibility,payment_treatment,effective_at,reason,created_at,created_by,command_id)`.
17. `reimbursement_event`: `F('reimbursement-event-v2'; event_id,reimbursement_series_id,reimbursement_revision_id,event_sequence,event_type,effective_at,currency,amount_minor,original_event_id_or_null,prior_event_hash,event_payload_hash,actor_id,command_id,created_at)`.
18. `settlement_revision`: `F('compensation-settlement-revision-v2'; revision_id,series_id,worker_id,project_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,gross_minor,withholding_minor,expense_reimbursement_minor,net_minor,status,effective_at,source_manifest_hash,created_at,created_by,command_id)`.
19. `authority_event`: `F('finance-authority-event-v1'; authority_event_id,series_kind,series_id,revision_id_or_null,prior_authority_event_id_or_null,event_type,effective_at,reason_or_null,principal_id,command_id,created_at)`.
20. `minimum_top_up`: `F('minimum-top-up-v1'; adjustment_id,invoice_id,client_minimum_policy_revision_id,period_start,period_end,currency,eligible_actual_minor,contractual_minimum_minor,top_up_minor,calculation_hash,created_at,created_by,command_id)`.
21. `adjustment_source_link`: `F('adjustment-source-link-v1'; adjustment_id,invoice_id,adjustment_kind,currency,amount_minor,original_invoice_id_or_null,original_invoice_event_id_or_null,original_payment_id_or_null,reason_code,reason_text,prior_adjustment_hash,actor_id,command_id,created_at)`.
22. `direct_cost_event`: `F('direct-cost-event-v1'; event_id,series_id,event_sequence,event_type,tenant_id,deployment_id,project_id,legal_entity_revision_id,source_kind,source_id,source_version,source_hash,currency,amount_minor,effective_at,original_event_id_or_null,prior_event_hash,actor_id,command_id,created_at)`.
23. `collection_component`: `F('collection-component-v1'; component_id,batch_id,component_kind,source_invoice_line_id_or_null,source_adjustment_id_or_null,overcredit_authorization_id_or_null,currency,capacity_minor,sort_key,source_hash,created_at)`.
24. `collection_allocation`: `F('collection-allocation-v1'; allocation_id,batch_id,component_id,allocation_sequence,currency,allocated_minor,component_capacity_minor,prior_allocation_hash,created_at)`.
25. `collection_batch`: `F('collection-batch-v1'; batch_id,invoice_id,payment_id_or_null,payment_reversal_id_or_null,original_batch_id_or_null,tenant_id,deployment_id,legal_entity_revision_id,currency,collection_minor,effective_at,ARRAY[component_hashes ordered by sort_key COLLATE BINARY,component_id COLLATE BINARY],ARRAY[allocation_hashes ordered by allocation_sequence,allocation_id COLLATE BINARY],prior_batch_hash,batch_hash_basis,created_at,command_id)`.
26. `finance_change_event`: `F('finance-change-event-v1'; change_sequence,change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,effective_at,evidence_type,evidence_id,evidence_hash,command_id,created_at)`.
27. `source_cut`: `F('finance-source-cut-v1'; cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,change_sequence_high_watermark,created_at,created_by,command_id,ARRAY[item_hashes ordered by item_kind COLLATE BINARY,effective_at,item_id COLLATE BINARY])`; item = `F('finance-source-cut-item-v1'; cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_hash,amount_minor_or_null,currency_or_null)`.
28. `pack_revision`: `F('accounting-pack-revision-v1'; revision_id,series_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,status,created_at,created_by,command_id)`.
29. `report_source_manifest`: `F('report-source-manifest-v1'; manifest_id,report_revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,period_start,period_end,change_sequence_high_watermark,created_at,ARRAY[item_hashes ordered by item_kind COLLATE BINARY,effective_at,item_id COLLATE BINARY])`; item = `F('report-source-manifest-item-v1'; manifest_id,section_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_hash,amount_minor_or_null,currency_or_null)`.
30. `report_revision`: `F('period-report-revision-v1'; revision_id,series_id,definition_id,template_version_id,revision_number,predecessor_revision_id_or_null,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,period_start,period_end,source_manifest_id,source_manifest_hash,status,missing_activity_count,blocker_count,created_at,created_by,command_id)`.
31. `artifact_manifest`: `F('artifact-manifest-v1'; artifact_id,owner_kind,owner_revision_id,format,generation_version,semantic_filename,media_type,byte_length,content_sha256,storage_key,source_hash,renderer_version,ready_at,attempt_number)`.
32. `retry_decision`: `F('artifact-retry-decision-v1'; decision_id,artifact_id,owner_revision_id,format,generation_version,prior_attempt_number,next_attempt_number,decision_kind,failure_class,retryable,not_before,max_attempts,principal_id_or_null,scheduler_id_or_null,command_id_or_null,created_at)`.
33. `integrity_incident`: `F('artifact-integrity-incident-v1'; incident_id,artifact_id,owner_revision_id,format,generation_version,attempt_number,incident_kind,expected_hash_or_null,observed_hash_or_null,expected_length_or_null,observed_length_or_null,storage_key_or_null,detected_at,detected_by,command_id_or_null)`.

Every evidence row stores restricted `evidence_type`, `contract_version`, canonical BLOB and hash;
trigger dispatch recomputes it. Projection SQL emits the exact order and aborts unknown type,
duplicate semantic identity, invalid UTF-8 or unsupported SQLite value type.

## 4. Exact money, scope, time and third-party truth

- Money is signed SQLite INTEGER/application bigint; division is half away from zero.
- Percentage/discount/markup bps: 0..10000; tax bps: 0..100000; general factors: 0..100000.
  Withholding sign derives from event/type, never a negative rate.
- Round each accounting bucket first; allocate residuals separately for positive/negative pools.
  Invoice/tax ties: source_type binary, source_id binary, source_version. Collection: component_id
  binary. Pack/report: item_kind binary, canonical UTC effective_at, item_id binary.
- Every new row matches the immutable tenant/deployment singleton and pins legal entity revision/hash,
  configuration revision, entity/project timezone where applicable, and one ISO currency. No FX,
  mixed currency, current/default lookup or NULL/global scope.
- Instants are canonical UTC millisecond `YYYY-MM-DDTHH:mm:ss.SSSZ`; periods are half-open. Reversals
  enter by their own effective instant.
- Third party is closed: worker/not_applicable→worker_paid; company→company_paid;
  client→client_direct; third_party requires worker/company/client responsibility and maps likewise.
  Legacy unknown blocks reimbursement, billing, direct cost, CLEAN pack/report authority.

## 5. Literal DDL contract

Every new table is `STRICT`; every historical FK is `ON UPDATE RESTRICT ON DELETE RESTRICT`.
The following schema catalogue is literal and exhaustive: names, columns, nullability, CHECKs,
FKs, unique/index and trigger families may not be weakened. Rebuild copy statements preserve all
pre-0018 bytes before the cutover marker.

### 5.1 0019 additions

```sql
CREATE TABLE deployment_identity(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), tenant_id TEXT NOT NULL,
 deployment_id TEXT NOT NULL, anchored_at TEXT NOT NULL,
 database_identity_hash TEXT NOT NULL UNIQUE CHECK(length(database_identity_hash)=64),
 UNIQUE(tenant_id,deployment_id)
) STRICT;
CREATE TRIGGER deployment_identity_no_update BEFORE UPDATE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TRIGGER deployment_identity_no_delete BEFORE DELETE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TABLE migration_contract_metadata(
 migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 22),
 migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN('lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry')),
 descriptor_version TEXT NOT NULL CHECK(descriptor_version='ja-migration-contract-v1'),
 descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64),
 sql_sha256 TEXT NOT NULL CHECK(length(sql_sha256)=64),
 projection_sha256 TEXT NOT NULL CHECK(length(projection_sha256)=64),
 vector_sha256 TEXT NOT NULL CHECK(length(vector_sha256)=64),
 encoder_sha256 TEXT NOT NULL CHECK(length(encoder_sha256)=64),
 runner_sha256 TEXT NOT NULL CHECK(length(runner_sha256)=64),
 heartbeat_worker_sha256 TEXT NOT NULL CHECK(length(heartbeat_worker_sha256)=64),
 schema_hash_manifest BLOB NOT NULL CHECK(typeof(schema_hash_manifest)='blob'),
 schema_hash_manifest_sha256 TEXT NOT NULL CHECK(length(schema_hash_manifest_sha256)=64),
 pre_projection_sha256 TEXT NOT NULL CHECK(length(pre_projection_sha256)=64),
 post_projection_sha256 TEXT NOT NULL CHECK(length(post_projection_sha256)=64),
 node_version TEXT NOT NULL, sqlite_version TEXT NOT NULL, applied_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
```

0019 otherwise reproduces frozen B5 lifecycle-security DDL exactly; B2 cannot edit it. Its schema
path is exactly `packages/database/src/schema/lifecycle-security.ts`.

### 5.2 0020 exact table/constraint appendix

```sql
CREATE TABLE finance_hash_evidence(
 evidence_id TEXT PRIMARY KEY,
 evidence_type TEXT NOT NULL CHECK(evidence_type IN('finance_request','finance_command','legal_entity_revision','configuration_revision','observed_invoice_manifest','observed_invoice_event_set','invoice_chain_anchor','invoice_subject','invoice_line','invoice_source','invoice_event','payment_record','payment_reversal','overcredit_authorization','expense_classification_revision','reimbursement_principal_revision','reimbursement_event','settlement_revision','authority_event','minimum_top_up','adjustment_source_link','direct_cost_event','collection_component','collection_allocation','collection_batch','finance_change_event','source_cut','pack_revision','report_source_manifest','report_revision','artifact_manifest','retry_decision','integrity_incident')),
 contract_version TEXT NOT NULL, semantic_id TEXT NOT NULL,
 canonical_blob BLOB NOT NULL CHECK(typeof(canonical_blob)='blob'),
 evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64), created_at TEXT NOT NULL,
 UNIQUE(evidence_type,contract_version,semantic_id), UNIQUE(evidence_type,contract_version,evidence_hash),
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
 command_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL UNIQUE, command_hash TEXT NOT NULL UNIQUE,
 tenant_id TEXT NOT NULL, deployment_id TEXT NOT NULL, operation TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, principal_id TEXT NOT NULL, effective_at TEXT NOT NULL,
 target_kind TEXT NOT NULL, target_semantic_id TEXT NOT NULL, amount_minor INTEGER,
 currency TEXT CHECK(currency IS NULL OR length(currency)=3), payload_hash TEXT NOT NULL,
 session_id_hash TEXT NOT NULL, step_up_verified_at TEXT, step_up_expires_at TEXT,
 policy_revision_id TEXT, policy_hash TEXT,
 state TEXT NOT NULL CHECK(state IN('pending','completed')), completed_at TEXT, created_at TEXT NOT NULL,
 CHECK((state='pending' AND completed_at IS NULL) OR (state='completed' AND completed_at IS NOT NULL)),
 UNIQUE(tenant_id,deployment_id,operation,idempotency_key),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(request_hash) REFERENCES finance_hash_evidence(evidence_hash) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(command_hash) REFERENCES finance_hash_evidence(evidence_hash) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE finance_command_target(
  command_id TEXT PRIMARY KEY REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  target_kind TEXT NOT NULL, target_semantic_id TEXT NOT NULL, target_contract_version TEXT NOT NULL,
  UNIQUE(target_kind,target_semantic_id,target_contract_version)
 ) STRICT;
CREATE TRIGGER finance_command_target_no_update BEFORE UPDATE ON finance_command_target
BEGIN SELECT RAISE(ABORT,'finance command target immutable'); END;
CREATE TRIGGER finance_command_target_no_delete BEFORE DELETE ON finance_command_target
BEGIN SELECT RAISE(ABORT,'finance command target immutable'); END;
CREATE TRIGGER finance_command_no_delete BEFORE DELETE ON finance_command
BEGIN SELECT RAISE(ABORT,'finance command immutable'); END;
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
 revision_id TEXT PRIMARY KEY, series_id TEXT NOT NULL, revision_number INTEGER NOT NULL CHECK(revision_number>0),
 predecessor_revision_id TEXT REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL, deployment_id TEXT NOT NULL, legal_name TEXT NOT NULL,
 tax_identifier TEXT NOT NULL, registration_identifier TEXT, address_line1 TEXT NOT NULL,
 address_line2 TEXT, locality TEXT NOT NULL, region TEXT, postal_code TEXT NOT NULL,
 country_code TEXT NOT NULL CHECK(length(country_code)=2),
 base_currency TEXT NOT NULL CHECK(length(base_currency)=3), timezone TEXT NOT NULL,
 effective_from TEXT NOT NULL, effective_to TEXT, revision_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL,
 command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_from<effective_to),
 UNIQUE(series_id,revision_number), UNIQUE(series_id,predecessor_revision_id),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX legal_entity_one_genesis ON legal_entity_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE project_legal_entity_assignment(
 assignment_id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
 legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL, deployment_id TEXT NOT NULL, effective_from TEXT NOT NULL,
 effective_to TEXT, created_at TEXT NOT NULL,
 command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_from<effective_to),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE INDEX project_legal_entity_interval ON project_legal_entity_assignment(project_id,effective_from,effective_to);
CREATE TABLE finance_configuration_revision(
 revision_id TEXT PRIMARY KEY, series_id TEXT NOT NULL, revision_number INTEGER NOT NULL CHECK(revision_number>0),
 predecessor_revision_id TEXT REFERENCES finance_configuration_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL, deployment_id TEXT NOT NULL,
 legal_entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 currency TEXT NOT NULL CHECK(length(currency)=3), timezone TEXT NOT NULL,
 configuration_kind TEXT NOT NULL, payload_hash TEXT NOT NULL,
 effective_from TEXT NOT NULL, effective_to TEXT, revision_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL,
 command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_from<effective_to),
 UNIQUE(series_id,revision_number), UNIQUE(series_id,predecessor_revision_id),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX finance_configuration_one_genesis ON finance_configuration_revision(series_id) WHERE predecessor_revision_id IS NULL;

CREATE TABLE finance_change_event(
 change_sequence INTEGER PRIMARY KEY AUTOINCREMENT, change_id TEXT NOT NULL UNIQUE,
 tenant_id TEXT NOT NULL, deployment_id TEXT NOT NULL, entity_kind TEXT NOT NULL,
 entity_id TEXT NOT NULL, change_kind TEXT NOT NULL, effective_at TEXT NOT NULL,
 evidence_type TEXT NOT NULL, evidence_id TEXT NOT NULL,
 evidence_hash TEXT NOT NULL, command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 created_at TEXT NOT NULL, UNIQUE(evidence_type,evidence_id),
 FOREIGN KEY(evidence_id) REFERENCES finance_hash_evidence(evidence_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER finance_change_no_update BEFORE UPDATE ON finance_change_event BEGIN SELECT RAISE(ABORT,'finance change immutable'); END;
CREATE TRIGGER finance_change_no_delete BEFORE DELETE ON finance_change_event BEGIN SELECT RAISE(ABORT,'finance change immutable'); END;
```

The remaining 0020 declarations are frozen by this exact column matrix; every row is append-only
except guarded series pointers and the command transition above:

| Table                                        | Exact columns beyond `id TEXT PRIMARY KEY`                                                                                                                                                                                                                                                                             | Exact CHECK/FK/uniqueness                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- | ------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `expense_classification_series`              | `expense_id,tenant_id,deployment_id,tail_revision_id,current_authority_event_id`                                                                                                                                                                                                                                       | unique expense; native scope FK                                                                          |
| `expense_classification_revision`            | `series_id,expense_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,project_id,legal_entity_revision_id,currency,classification,responsibility,third_party_payer_kind,billable,markup_bps,tax_bps,effective_at,reason,revision_hash,created_at,created_by,command_id`                                | line predecessor/genesis; classification `worker                                                         | company                                                                                                   | client                                                         | third_party`; responsibility `not_applicable | worker | company                                                                     | client`; billable 0/1; markup 0..10000; tax 0..100000; native entity/scope |
| `expense_classification_authority_event`     | `series_id,revision_id,prior_authority_event_id,event_type,effective_at,reason,principal_id,command_id,event_hash,created_at`                                                                                                                                                                                          | event `activate                                                                                          | supersede`; same-series target; one genesis/child; CAS pointer                                            |
| `reimbursement_principal_series`             | `expense_id,tenant_id,deployment_id,tail_revision_id,current_authority_event_id`                                                                                                                                                                                                                                       | unique expense; native scope                                                                             |
| `reimbursement_principal_revision`           | `series_id,expense_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,worker_id,project_id,legal_entity_revision_id,currency,principal_minor,responsibility,payment_treatment,effective_at,reason,revision_hash,created_at,created_by,command_id`                                                      | principal ≥0; closed responsibility/treatment; line/genesis; native scope/entity/currency                |
| `reimbursement_principal_authority_event`    | authority-event columns above                                                                                                                                                                                                                                                                                          | `activate                                                                                                | supersede`; same-series; one genesis/child; CAS                                                           |
| `compensation_settlement_series_v2`          | `worker_id,project_id,tenant_id,deployment_id,currency,tail_revision_id,current_authority_event_id`                                                                                                                                                                                                                    | unique native worker/project/currency                                                                    |
| `compensation_settlement_revision_v2`        | `series_id,worker_id,project_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,gross_minor,withholding_minor,expense_reimbursement_minor,net_minor,status,effective_at,source_manifest_hash,revision_hash,created_at,created_by,command_id` | half-open period; withholding/reimbursement ≥0; net=gross-withholding+reimbursement; status `candidate   | failed`; line/genesis                                                                                     |
| `compensation_settlement_authority_event_v2` | authority-event columns                                                                                                                                                                                                                                                                                                | `finalize                                                                                                | supersede`; same-series; one genesis/child; CAS                                                           |
| `compensation_settlement_collection_batch`   | `settlement_revision_id,collection_batch_id,source_hash,payment_id,payment_reversal_id,batch_hash,amount_minor,created_at`                                                                                                                                                                                             | exactly one payment/reversal; unique settlement+batch                                                    |
| `client_minimum_policy_revision`             | `series_id,revision_number,predecessor_revision_id,client_id,project_id,legal_entity_revision_id,currency,period_start,period_end,minimum_minor,eligibility_bps,effective_from,effective_to,policy_hash,created_at,created_by,command_id`                                                                              | minimum ≥0; bps 0..10000; half-open periods; line/genesis; non-overlap                                   |
| `billing_minimum_adjustment`                 | `invoice_id,client_minimum_policy_revision_id,period_start,period_end,currency,eligible_actual_minor,contractual_minimum_minor,top_up_minor,calculation_hash,created_at,created_by,command_id`                                                                                                                         | unique invoice/policy/period; `top_up_minor=max(0,minimum-eligible)`                                     |
| `invoice_chain_anchor`                       | `invoice_id,tenant_id,deployment_id,observed_manifest_hash,genesis_subject_hash,genesis_event_hash,anchored_at,anchored_by,command_id,anchor_hash`                                                                                                                                                                     | one/invoice; legacy observed hash or new command; native scope                                           |
| `invoice_payment_reversal_event`             | `original_payment_id,invoice_id,currency,amount_minor,effective_at,reason_code,reason_text,prior_reversal_hash,reversal_payload_hash,actor_id,command_id,created_at,reversal_hash`                                                                                                                                     | positive; unique command; chain; cumulative ≤ original                                                   |
| `invoice_overcredit_authorization`           | `invoice_id,payment_id,tenant_id,deployment_id,currency,authorized_minor,expires_at,reason,principal_id,step_up_verified_at,policy_revision_id,command_id,created_at,authorization_hash`                                                                                                                               | positive ceiling; exact payment/invoice/entity/scope/currency; immutable                                 |
| `invoice_overcredit_consumption`             | `authorization_id,collection_batch_id,amount_minor,original_consumption_id,created_at`                                                                                                                                                                                                                                 | positive consumes; negative must link positive reversal; cumulative 0..ceiling                           |
| `direct_cost_series`                         | `tenant_id,deployment_id,project_id,legal_entity_revision_id,currency,source_kind,source_id`                                                                                                                                                                                                                           | unique native source/currency                                                                            |
| `direct_cost_event`                          | `series_id,event_sequence,event_type,tenant_id,deployment_id,project_id,legal_entity_revision_id,source_kind,source_id,source_version,source_hash,currency,amount_minor,effective_at,original_event_id,prior_event_hash,actor_id,command_id,created_at,event_hash`                                                     | `recognize                                                                                               | reverse`; positive amount; reversal links original; one sequence/predecessor; cumulative reversal bounded |
| `expense_reimbursement_event_v2`             | `reimbursement_series_id,reimbursement_revision_id,event_sequence,event_type,effective_at,currency,amount_minor,original_event_id,prior_event_hash,event_payload_hash,actor_id,command_id,created_at,event_hash`                                                                                                       | `recognize                                                                                               | pay                                                                                                       | reverse`; positive; one sequence/predecessor; reversal bounded |
| `reimbursement_reversal_event`               | `original_event_id,amount_minor,effective_at,reason,command_id,created_at,reversal_hash`                                                                                                                                                                                                                               | positive; unique command; cumulative bounded                                                             |
| `invoice_collection_component`               | `batch_id,component_kind,source_invoice_line_id,source_adjustment_id,overcredit_authorization_id,currency,capacity_minor,sort_key,source_hash,created_at`                                                                                                                                                              | kind `labor                                                                                              | expense                                                                                                   | milestone                                                      | minimum_top_up                               | tax    | unapplied_credit`; one exact source; capacity ≥0; overcredit only unapplied |
| `invoice_collection_batch`                   | `invoice_id,payment_id,payment_reversal_id,original_batch_id,tenant_id,deployment_id,legal_entity_revision_id,currency,collection_minor,effective_at,prior_batch_hash,batch_hash_basis,batch_hash,created_at,command_id`                                                                                               | exactly one payment/reversal; positive payment; negative reversal+original; unique each payment/reversal |
| `invoice_collection_allocation`              | `batch_id,component_id,allocation_sequence,currency,allocated_minor,component_capacity_minor,prior_allocation_hash,allocation_hash,created_at`                                                                                                                                                                         | unique batch sequence/component; sum=batch; no capacity excess; reversal exact negation                  |
| `finance_source_cut`                         | `tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,change_sequence_high_watermark,cut_hash,created_at,created_by,command_id`                                                                                                                                                           | half-open; native scope/entity/currency; immutable                                                       |
| `finance_source_cut_item`                    | `cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,evidence_hash,amount_minor,currency,item_hash`                                                                                                                                                                                           | unique cut/kind/id/version; exact evidence; completeness at watermark                                    |

```sql
CREATE TABLE finance_v2_cutover(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 migration_version INTEGER NOT NULL CHECK(migration_version=20)
   REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
 descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64), cutover_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
```

0020 rebuilds `invoice`, `invoice_line`, `invoice_source`, `invoice_event`, `payment`,
`invoice_adjustment`, and extends `finance_internal_cost_snapshot`. It preserves every legacy
column/byte and adds every field in formulas 8–13/21 plus native scope/entity/configuration.
Required indexes: issued invoice number/entity; line invoice/number; global
`invoice_source(source_type,source_id)`; event invoice/sequence, invoice/prior-hash and idempotency;
payment idempotency/prior-hash; adjustment prior-hash; exact internal-cost
`(source_kind,source_id,source_version,source_hash)`. Sources are exactly
`time|expense|milestone|adjustment|minimum_top_up`; v2 generic adjustment is rejected; minimum top-up
must reference exact adjustment/version/hash. Issued/source/event/payment/adjustment/finalized legacy
rows reject update/delete/reinterpretation.

Required trigger families: revision same-series/one-child/non-overlap; CAS tail/authority pointers;
native scope/entity/currency; command-target existence dispatch to invoice/payment/expense/
reimbursement/settlement/direct_cost; completed command requires target+reversal/authority/change/
chain hash equality; bounded reversals; overcredit ceiling; batch allocation equality/capacity/exact
negation; source-cut every-and-only watermark items; canonical timestamps and immutable history.

Reversal transaction is exactly: `BEGIN IMMEDIATE`; insert pending command + request/command evidence

- exactly one target; validate positive target/remaining amount; insert immutable reversal; append
  change + domain chain event; guarded pending→completed; completion-trigger validates all facts;
  `COMMIT`. No reversal INSERT trigger requires/completes a completed command.

### 5.3 0021 exact accounting-pack appendix

```sql
CREATE TABLE accounting_pack_series(
 series_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,
 legal_entity_revision_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),
 timezone TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 tail_revision_id TEXT,current_authority_event_id TEXT,CHECK(period_start<period_end),
 UNIQUE(tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE accounting_pack_revision(
 revision_id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES accounting_pack_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 revision_number INTEGER NOT NULL CHECK(revision_number>0),
 predecessor_revision_id TEXT REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),timezone TEXT NOT NULL,
 period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 source_cut_id TEXT NOT NULL REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 source_cut_hash TEXT NOT NULL,reconciliation_status TEXT NOT NULL CHECK(reconciliation_status IN('CLEAN','BLOCKED')),
 reconciliation_difference_minor INTEGER NOT NULL,blocker_count INTEGER NOT NULL CHECK(blocker_count>=0),
 status TEXT NOT NULL CHECK(status IN('candidate','failed')),revision_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,created_by TEXT NOT NULL,
 command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX accounting_pack_one_genesis ON accounting_pack_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE accounting_pack_authority_event(
 authority_event_id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES accounting_pack_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 prior_authority_event_id TEXT REFERENCES accounting_pack_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN('finalize','supersede')),effective_at TEXT NOT NULL,
 reason TEXT,principal_id TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX accounting_pack_authority_genesis ON accounting_pack_authority_event(series_id) WHERE prior_authority_event_id IS NULL;
CREATE TABLE accounting_pack_source_cut_batch(
 id TEXT PRIMARY KEY,revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 cut_id TEXT NOT NULL REFERENCES finance_source_cut(cut_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 change_sequence_high_watermark INTEGER NOT NULL,cut_hash TEXT NOT NULL,UNIQUE(revision_id,cut_id)
) STRICT;
CREATE TABLE accounting_pack_source_cut_item(
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES accounting_pack_source_cut_batch(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 source_cut_item_id TEXT NOT NULL REFERENCES finance_source_cut_item(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 evidence_hash TEXT NOT NULL,UNIQUE(batch_id,source_cut_item_id)
) STRICT;
CREATE TABLE accounting_pack_reconciliation_line(
 id TEXT PRIMARY KEY,revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 line_sequence INTEGER NOT NULL CHECK(line_sequence>0),category TEXT NOT NULL,source_kind TEXT NOT NULL,
 source_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),expected_minor INTEGER NOT NULL,
 actual_minor INTEGER NOT NULL,difference_minor INTEGER NOT NULL CHECK(difference_minor=actual_minor-expected_minor),
 created_at TEXT NOT NULL,UNIQUE(revision_id,line_sequence),UNIQUE(revision_id,category,source_kind,source_id)
) STRICT;
CREATE TABLE accounting_pack_artifact(
 artifact_id TEXT PRIMARY KEY,revision_id TEXT NOT NULL REFERENCES accounting_pack_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 format TEXT NOT NULL CHECK(format IN('pdf','xlsx','invoice_csv','expense_csv','json')),
 generation_version TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('queued','running','ready','failed')),
 current_attempt_number INTEGER NOT NULL CHECK(current_attempt_number>0),semantic_filename TEXT NOT NULL,
 media_type TEXT,byte_length INTEGER,content_sha256 TEXT,storage_key TEXT,source_hash TEXT NOT NULL,
 renderer_version TEXT,ready_at TEXT,error_code TEXT,retryable INTEGER CHECK(retryable IS NULL OR retryable IN(0,1)),
 max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 5),
 CHECK((status='ready' AND media_type IS NOT NULL AND byte_length>0 AND length(content_sha256)=64
  AND storage_key IS NOT NULL AND renderer_version IS NOT NULL AND ready_at IS NOT NULL AND error_code IS NULL)
  OR status<>'ready'),UNIQUE(revision_id,format,generation_version)
) STRICT;
CREATE TABLE accounting_pack_retry_decision(
 decision_id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 owner_revision_id TEXT NOT NULL,format TEXT NOT NULL,generation_version TEXT NOT NULL,
 prior_attempt_number INTEGER NOT NULL,next_attempt_number INTEGER NOT NULL,
 decision_kind TEXT NOT NULL CHECK(decision_kind IN('manual','scheduler')),failure_class TEXT NOT NULL,
 retryable INTEGER NOT NULL CHECK(retryable=1),not_before TEXT NOT NULL,max_attempts INTEGER NOT NULL CHECK(max_attempts BETWEEN 1 AND 5),
 principal_id TEXT,scheduler_id TEXT,command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 created_at TEXT NOT NULL,decision_hash TEXT NOT NULL UNIQUE,
 CHECK((decision_kind='manual' AND principal_id IS NOT NULL AND scheduler_id IS NULL AND command_id IS NOT NULL)
  OR (decision_kind='scheduler' AND principal_id IS NULL AND scheduler_id IS NOT NULL AND command_id IS NULL)),
 CHECK(next_attempt_number=prior_attempt_number+1),UNIQUE(artifact_id,generation_version,next_attempt_number)
) STRICT;
CREATE TABLE accounting_pack_artifact_attempt(
 id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 attempt_number INTEGER NOT NULL CHECK(attempt_number>0),job_id TEXT,job_run_id TEXT,
 manual_command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 retry_decision_id TEXT REFERENCES accounting_pack_retry_decision(decision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 lease_fence INTEGER,started_at TEXT,finished_at TEXT,outcome TEXT CHECK(outcome IN('ready','failed')),
 failure_class TEXT,retryable INTEGER CHECK(retryable IN(0,1)),created_at TEXT NOT NULL,
 CHECK((attempt_number=1 AND job_id IS NOT NULL AND job_run_id IS NOT NULL AND manual_command_id IS NULL AND retry_decision_id IS NULL)
  OR (attempt_number>1 AND ((manual_command_id IS NULL)!=(retry_decision_id IS NULL)))),
 UNIQUE(artifact_id,attempt_number)
) STRICT;
CREATE TABLE accounting_pack_integrity_incident(
 incident_id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES accounting_pack_artifact(artifact_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 owner_revision_id TEXT NOT NULL,format TEXT NOT NULL,generation_version TEXT NOT NULL,
 attempt_number INTEGER NOT NULL,incident_kind TEXT NOT NULL,expected_hash TEXT,observed_hash TEXT,
 expected_length INTEGER,observed_length INTEGER,storage_key TEXT,detected_at TEXT NOT NULL,
 detected_by TEXT NOT NULL,command_id TEXT REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 incident_hash TEXT NOT NULL UNIQUE
) STRICT;
```

0021 adds unconditional immutability for revisions/events/cuts/items/lines/attempts/decisions/incidents;
same-series predecessor/genesis and CAS-only series pointers; exact cut-copy equality; artifact
queued→running→ready|failed guards with immutable ready manifest and fence/job provenance; and a
replacement command-target dispatch adding pack revision/artifact while retaining every 0020 kind.
Final authority requires CLEAN, exact difference zero, zero blockers, current complete cut and
integrity-valid current-generation PDF, XLSX, invoice CSV and expense CSV. JSON is optional. A later
candidate/failed tail never displaces authority; staleness is derived from change sequence.

### 5.4 0022 exact registry/report appendix

```sql
CREATE TABLE report_definition(
 definition_id TEXT PRIMARY KEY,family_id TEXT NOT NULL,display_name TEXT NOT NULL,
 authorization_contract TEXT NOT NULL,filter_contract_hash TEXT NOT NULL,query_version TEXT NOT NULL,
 column_schema_hash TEXT NOT NULL,semantic_filename_token TEXT NOT NULL,
 snapshot_mode TEXT NOT NULL CHECK(snapshot_mode IN('source_cut','query_snapshot')),
 created_at TEXT NOT NULL,UNIQUE(family_id,definition_id)
) STRICT;
CREATE TABLE report_template_version(
 template_version_id TEXT PRIMARY KEY,definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 version_number INTEGER NOT NULL CHECK(version_number>0),renderer_contract_hash TEXT NOT NULL,
 template_hash TEXT NOT NULL,required_formats TEXT NOT NULL,schema_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,UNIQUE(definition_id,version_number)
) STRICT;
CREATE TABLE report_template_authority_event(
 authority_event_id TEXT PRIMARY KEY,definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 template_version_id TEXT NOT NULL REFERENCES report_template_version(template_version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 prior_authority_event_id TEXT REFERENCES report_template_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN('activate','supersede')),effective_at TEXT NOT NULL,
 principal_id TEXT NOT NULL,command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 created_at TEXT NOT NULL,UNIQUE(definition_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX report_template_authority_genesis ON report_template_authority_event(definition_id) WHERE prior_authority_event_id IS NULL;
CREATE TABLE period_report_series(
 series_id TEXT PRIMARY KEY,definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),timezone TEXT NOT NULL,
 period_start TEXT NOT NULL,period_end TEXT NOT NULL,tail_revision_id TEXT,current_authority_event_id TEXT,
 CHECK(period_start<period_end),UNIQUE(definition_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE report_source_manifest(
 manifest_id TEXT PRIMARY KEY,report_revision_id TEXT NOT NULL UNIQUE,tenant_id TEXT NOT NULL,
 deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),
 timezone TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 change_sequence_high_watermark INTEGER NOT NULL CHECK(change_sequence_high_watermark>=0),
 manifest_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE TABLE report_source_manifest_item(
 id TEXT PRIMARY KEY,manifest_id TEXT NOT NULL REFERENCES report_source_manifest(manifest_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 section_id TEXT NOT NULL,item_kind TEXT NOT NULL,item_id TEXT NOT NULL,item_version INTEGER NOT NULL CHECK(item_version>0),
 effective_at TEXT NOT NULL,evidence_type TEXT NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES finance_hash_evidence(evidence_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 evidence_hash TEXT NOT NULL,amount_minor INTEGER,currency TEXT CHECK(currency IS NULL OR length(currency)=3),
 item_hash TEXT NOT NULL UNIQUE,UNIQUE(manifest_id,section_id,item_kind,item_id,item_version)
) STRICT;
CREATE TABLE period_report_revision(
 revision_id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES period_report_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 definition_id TEXT NOT NULL REFERENCES report_definition(definition_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 template_version_id TEXT NOT NULL REFERENCES report_template_version(template_version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 revision_number INTEGER NOT NULL CHECK(revision_number>0),
 predecessor_revision_id TEXT REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,legal_entity_revision_id TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),timezone TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 source_manifest_id TEXT NOT NULL REFERENCES report_source_manifest(manifest_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 source_manifest_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('candidate','failed')),
 missing_activity_count INTEGER NOT NULL CHECK(missing_activity_count>=0),blocker_count INTEGER NOT NULL CHECK(blocker_count>=0),
 revision_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL,
 command_id TEXT NOT NULL REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 UNIQUE(series_id,revision_number),UNIQUE(series_id,predecessor_revision_id),
 FOREIGN KEY(tenant_id,deployment_id) REFERENCES deployment_identity(tenant_id,deployment_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(legal_entity_revision_id) REFERENCES legal_entity_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX period_report_one_genesis ON period_report_revision(series_id) WHERE predecessor_revision_id IS NULL;
CREATE TABLE period_report_authority_event(
 authority_event_id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES period_report_series(series_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 revision_id TEXT NOT NULL REFERENCES period_report_revision(revision_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 prior_authority_event_id TEXT REFERENCES period_report_authority_event(authority_event_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN('finalize','supersede')),effective_at TEXT NOT NULL,
 reason TEXT,principal_id TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE REFERENCES finance_command(command_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(series_id,prior_authority_event_id)
) STRICT;
CREATE UNIQUE INDEX period_report_authority_genesis ON period_report_authority_event(series_id) WHERE prior_authority_event_id IS NULL;
```

`period_report_artifact`, `_attempt`, `_retry_decision`, `_integrity_incident` have the identical
columns, nullability, CHECKs, FKs and indexes as their `accounting_pack_*` counterparts, substituting
`period_report_revision` and allowing exactly the activated template's format enum. This literal
identity is verified by normalized `sqlite_schema` projection equality. 0022 adds immutable/CAS/
manifest-completeness/artifact-fence guards, legacy finalized report/source update-delete guards, and
replaces command-target dispatch to add report revision/artifact without losing earlier kinds.

Required stable IDs are `worker-statement/time`, `worker-statement/compensation-estimate`,
`worker-statement/reimbursement`, `client-labor/daily`, `client-labor/weekly`,
`client-labor/custom-period`, `client-labor/consolidated-workers`, `client-labor/staffing-assignments`,
`technical/plc-change`, `technical/period-summary`, `technical/backup-register`,
`technical/unresolved-issues`, `project-profitability/contribution`, `project-profitability/client`,
`project-profitability/worker`, `project-profitability/budget-vs-actual`,
`project-profitability/travel-leakage`, `project-profitability/forecast-at-completion`,
`billing-run/unbilled-wip`, `accounts-receivable/aging`, `accounts-receivable/collections`,
`billing-run/labor-invoice`, `billing-run/expense-invoice`, `billing-run/fixed-milestone-invoice`,
`billing-run/adjustment-credit`, `billing-run/internal-reconciliation`,
`accounting-pack/master-ledger`, `accounting-pack/default`,
`accounting-pack/source-reconciliation`, `invoice-register/monthly`,
`accounts-receivable/monthly-collections`, `labor-cost/monthly-worker-direct-cost`,
`expense/monthly-register`, `revenue/monthly-contribution`, `accounts-receivable/outstanding`, and
`missing-activity/default`. Startup fails closed on omission, duplicate, alias, missing required
format or missing renderer/template contract.

## 6. Immutable authority and artifact truth

Issued invoice subject, number, lines, sources, totals, entity/config/currency and calculation are
immutable. Legacy issued invoices anchor observed manifest/event-set without invented v2 facts; new
invoices have v2 genesis. Payments/reversals are immutable positive chains and idempotent replay
returns the same semantic result. Overcredit requires current exact authorization and excess becomes
only `unapplied_credit`. Void appends authority/chain facts and requires net unreversed collection
zero, no consumed credit and no unresolved issued adjustment/refund.

Each positive payment has one positive finalized batch; allocations sum to payment and remain within
capacity. Reversal copies each allocation with exact opposite sign and identical order. A source cut
contains every and only finalized batch/allocation at its watermark. Pack/report graphs are lines;
finality is an append-only event/CAS pointer, not mutable revision state. Later candidate/failed tails
do not displace authority; staleness derives from post-cut change sequence and regeneration is n+1.

Pack finality requires CLEAN, difference zero, blocker count zero, complete/current cut and current-
generation integrity-valid PDF, XLSX, invoice CSV and expense CSV. JSON is optional. Report finality
requires all and only activated-template required formats. Required failure blocks authority but not
sibling work; optional failure does not block. Renderers consume persisted rounded allocations.

## 7. Retry and exact B5 durable-job boundary

Canonical kind: `accounting_pack_artifact_render`. Capability:
`artifact.accounting_pack.render`. Payload fields exactly:
`kind,artifactId,revisionId,format,generationVersion,requestedAttempt`. Idempotency exactly:
`accounting-pack-artifact-render:{artifactId}:{generationVersion}:a{attempt}`.

Default/maximum attempts is 5; `unknown` caps at 3; persisted ceiling may only decrease. Attempt 1
has non-NULL job/job_run and NULL retry provenance. Attempt >1 has XOR stepped-up Finance command or
scheduler decision; job linkage becomes non-NULL at claim/run and stays immutable.

```text
delaySeconds = min(3600,60*2^(attempt-1))
             + (first8hex(SHA256(artifactId + ':' + attempt)) mod 30)
```

Scheduler requires failed current generation, retryable class, below ceiling, due `not_before`, no
incident and no next attempt/job. Manual uses the same gates except time and requires step-up.
Generation+attempt uniqueness prevents doubles. B5 retries only lease-loss/reclaim within the same
artifact attempt, maximum three fenced job_runs. Renderer/dependency/storage failure terminalizes
the job; B3 may create the next artifact attempt/job. Reclaim never increments artifact attempt.
Sole public scheduler: `runDueConfiguredDurableJobs`; ordinary users never process jobs manually.

Ready download returns authorized bytes. Queued/running returns HTTP 202 plus status/Retry-After;
failed or integrity-blocked returns stable 409 without bytes; absent/unauthorized stays 404. None is 500. Semantic filenames are deterministic by entity/period/revision/format and retry never changes
the economic revision.

## 8. Normative fixtures and validation

```text
tests/fixtures/databases/build-pre-0018-finance-legacy.ts
tests/fixtures/databases/pre-0018-finance-legacy.db
tests/fixtures/databases/pre-0018-finance-legacy.manifest.json
tests/fixtures/databases/build-post-0022-finance-authoritative.ts
tests/fixtures/databases/post-0022-finance-authoritative.db
tests/fixtures/databases/post-0022-finance-authoritative.manifest.json
tests/migrations/r6-3-populated-history.test.ts
```

Pre-0018 is schema head 18 with no future table/column/row. Post-0022 uses only the public runner and
domain services. Manifests contain contract version; builder/DB hashes; schema head; ordered
migration IDs/descriptor hashes; normalized sqlite_schema object hashes; counts; projection path,
count and evidence hashes; blockers; finance/AR/reconciliation totals; semantic IDs; artifact
hash/length/status; and expected FK/integrity results.

Normative adversarial cases are: relocated identity; >7-second phase with heartbeat gap ≤5 seconds;
heartbeat death/write failure rollback and lock preservation; 11 vectors and 33 formulas; observed
NULL/BLOB/Unicode/binary ties; top-up/generic-adjustment rejection; source uniqueness and replay
conflict; pending-command reversal plus invalid variants; cross-kind target uniqueness; revision
branch/genesis/CAS; collection duplicate/cap/tie/exact reversal; overcredit gates; void blockers;
scope/entity/currency/timezone/time; all third-party combinations/legacy blocker; incomplete/future
cuts; pack/report required-vs-optional independent failure with no PDF-first short circuit; attempt
provenance XOR; ceiling/jitter/generation fence; lease reclaim without new attempt; legacy bytes,
FK/integrity and injected rollback.

Before any leaf, concatenate and execute 0019→0022 on fresh and populated pre-0018 copies, compare
projections/descriptors, and run rollback/reopen/relocation/heartbeat/CANON suites. Fresh Migration
Safety and Finance Integrity reviewers must approve identical R6.3 bytes. Any BLOCKED/FAIL returns to
Sol. B5 then reconciles descriptor paths/hashes, exports, metadata, job/outcome vocabulary, terminal
audit order, retry boundary and manifests.

## 9. Release condition

R6.3 remains **BLOCKED — R6.3 drafted; fresh Finance + Migration reviews required**. No runner,
0019–0022, schema, service, renderer, artifact, report, fixture, ledger or RTM lease is opened.
