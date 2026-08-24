import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { canonicalJson as canonicalJsonValue, sha256 } from '../../core/canonical-json.ts';
import {
  ensureCommand as writeFinanceCommand,
  ensureEvidence as writeFinanceEvidence,
  type FinanceCommand as Command,
  type FinanceCommandInput,
} from '../finance/finance-command-writer.ts';

/**
 * The Accounting Pack tables are intentionally a small immutable projection of
 * the legacy reporting tables.  This service is the only application writer
 * for that projection.  In particular, callers never get to provide a hash,
 * command hash or audit payload: all of those values are derived here from the
 * bytes that are persisted.
 */

export type AccountingPackMoney = bigint | number | string;

export type AccountingPackSourceItemInput = Readonly<{
  id?: string;
  itemId?: string;
  itemKind?: string;
  kind?: string;
  sourceId?: string;
  source_id?: string;
  itemVersion?: number;
  version?: number;
  effectiveAt?: string;
  effective_at?: string;
  evidenceType?: string;
  evidence_type?: string;
  evidenceId?: string;
  evidence_id?: string;
  amountMinor?: AccountingPackMoney | null;
  amount_minor?: AccountingPackMoney | null;
  currency?: string | null;
  payload?: unknown;
}>;

export type AccountingPackLegalEntityInput = Readonly<{
  legalName?: string;
  taxIdentifier?: string;
  registrationIdentifier?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  locality?: string;
  region?: string | null;
  postalCode?: string;
  countryCode?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  seriesId?: string;
}>;

export type AccountingPackSnapshotInput = Readonly<{
  /** Optional scope assertions. The deployment identity table remains authoritative. */
  tenantId?: string;
  deploymentId?: string;
  periodStart: string;
  periodEnd: string;
  currency?: string;
  timezone?: string;
  legacyLegalEntityId: string;
  /** A legacy global run is deliberately not accepted here. */
  legacyRunId?: string | null;
  legalEntityRevisionId?: string;
  legalEntity?: AccountingPackLegalEntityInput;
  sourceCutId?: string;
  changeSequenceHighWatermark?: number;
  sourceItems?: readonly AccountingPackSourceItemInput[];
  sourceCutItems?: readonly AccountingPackSourceItemInput[];
  seriesId?: string;
  revisionId?: string;
  entityBridgeId?: string;
  legacyBridgeId?: string;
  idempotencyKey?: string;
  createdAt?: string;
  effectiveAt?: string;
  revisionNumber?: number;
  predecessorRevisionId?: string | null;
  reconciliationStatus?: 'CLEAN' | 'BLOCKED';
  reconciliationDifferenceMinor?: AccountingPackMoney;
  blockerCount?: number;

  /**
   * A legacy repository snapshot can be supplied verbatim.  The service only
   * copies known fields into the closed canonical schema below.
   */
  snapshot?: Readonly<Record<string, unknown>>;
  reconciliation?: Readonly<Record<string, unknown>>;
  invoiceRegister?: readonly unknown[];
  collections?: readonly unknown[];
  workerCosts?: readonly unknown[];
  expenseRegister?: readonly unknown[];
  ledger?: readonly unknown[];
  totalsByCurrency?: readonly unknown[];
  reconciliationChecks?: Readonly<Record<string, unknown>>;
  invoiceCount?: number;
  paymentCount?: number;
  workerCostCount?: number;
  expenseCount?: number;
  sourceItemCount?: number;
  invoiceSourceCount?: number;
  sourceMismatchCount?: number;
  approvedTimeEntryCount?: number;
  approvedExpenseCount?: number;
  netMinor?: AccountingPackMoney;
  taxMinor?: AccountingPackMoney;
  grossMinor?: AccountingPackMoney;
  collectedMinor?: AccountingPackMoney;
  outstandingMinor?: AccountingPackMoney;
  workerCostMinor?: AccountingPackMoney;
  expenseCostMinor?: AccountingPackMoney;
  directCostMinor?: AccountingPackMoney;
  contributionMinor?: AccountingPackMoney;
}>;

export type AccountingPackRevisionResult = Readonly<{
  revisionId: string;
  seriesId: string;
  sourceCutId: string;
  legalEntityRevisionId: string;
  entityBridgeId: string;
  legacyRunBridgeId: string | null;
  snapshotSha256: string;
  reconciliationSha256: string;
  idempotent: boolean;
}>;

export class AccountingPackRevisionError extends Error {}

type Deployment = Readonly<{ tenantId: string; deploymentId: string }>;
type DbRow = Record<string, unknown>;
type StepUpProof = Readonly<{
  stepUpVerifiedAt: string;
  stepUpExpiresAt: string;
}>;

const CONTRACT_VERSION = 'B5-R4';
const SNAPSHOT_SCHEMA_VERSION = 'accounting-pack-snapshot-v1';
const RECONCILIATION_SCHEMA_VERSION = 'accounting-pack-reconciliation-v1';
const ENTITY_MANIFEST_VERSION = 'legal-entity-identity-manifest-v1';
const SNAPSHOT_TARGET_CONTRACT = 'accounting-pack-revision-snapshot-v1';
const ENTITY_BRIDGE_TARGET_CONTRACT = 'legal-entity-revision-bridge-v1';
const LEGACY_BRIDGE_TARGET_CONTRACT = 'accounting-pack-legacy-run-bridge-v1';

const accountingPackError = (message: string): never => {
  throw new AccountingPackRevisionError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonicalJson(value: unknown): string {
  return canonicalJsonValue(value, accountingPackError);
}

function safeText(value: unknown, field: string, max = 5000): string {
  if (typeof value !== 'string') throw new AccountingPackRevisionError(`${field} is required`);
  const clean = value.trim();
  if (!clean || clean.length > max) throw new AccountingPackRevisionError(`${field} is invalid`);
  return clean;
}

function safeOptionalText(value: unknown, field: string, max = 5000): string | null {
  if (value === null || value === undefined || value === '') return null;
  return safeText(value, field, max);
}

function safeDate(value: unknown, field: string): string {
  const clean = safeText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean))
    throw new AccountingPackRevisionError(`${field} must be an ISO date`);
  const parsed = new Date(`${clean}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== clean)
    throw new AccountingPackRevisionError(`${field} must be an ISO date`);
  return clean;
}

function safeInstant(value: unknown, field: string): string {
  const clean = safeText(value, field, 40);
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== clean)
    throw new AccountingPackRevisionError(`${field} must be an ISO UTC instant`);
  return clean;
}

function safeCurrency(value: unknown): string {
  const clean = safeText(value, 'Currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(clean)) throw new AccountingPackRevisionError('Currency is invalid');
  return clean;
}

function safeTimezone(value: unknown): string {
  const clean = safeText(value, 'Timezone', 120);
  if (/[^A-Za-z0-9_+./:-]/u.test(clean))
    throw new AccountingPackRevisionError('Timezone is invalid');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean }).format();
  } catch {
    throw new AccountingPackRevisionError('Timezone is invalid');
  }
  return clean;
}

function safeCount(value: unknown, field: string, fallback = 0): number {
  const candidate = value === undefined || value === null ? fallback : value;
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0)
    throw new AccountingPackRevisionError(`${field} must be a non-negative integer`);
  return candidate;
}

function safeMoney(value: unknown, field: string, fallback = 0n): bigint {
  const candidate = value === undefined || value === null ? fallback : value;
  let parsed: bigint;
  try {
    if (typeof candidate === 'bigint') parsed = candidate;
    else if (typeof candidate === 'number') {
      if (!Number.isSafeInteger(candidate)) throw new Error('not integer');
      parsed = BigInt(candidate);
    } else if (typeof candidate === 'string' && /^-?\d+$/u.test(candidate.trim()))
      parsed = BigInt(candidate.trim());
    else throw new Error('not integer');
  } catch {
    throw new AccountingPackRevisionError(`${field} must be an integer minor-unit amount`);
  }
  if (parsed < -9_223_372_036_854_775_808n || parsed > 9_223_372_036_854_775_807n)
    throw new AccountingPackRevisionError(`${field} is outside SQLite integer range`);
  return parsed;
}

function readValue(
  input: Readonly<Record<string, unknown>>,
  snapshot: Readonly<Record<string, unknown>>,
  totals: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
    if (snapshot[key] !== undefined) return snapshot[key];
    if (totals[key] !== undefined) return totals[key];
  }
  return undefined;
}

function readArray(
  input: Readonly<Record<string, unknown>>,
  snapshot: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly unknown[] {
  for (const key of keys) {
    const value = input[key] ?? snapshot[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new AccountingPackRevisionError(`${key} must be an array`);
    return value;
  }
  return [];
}

function assertEqual(actual: unknown, expected: unknown, field: string): void {
  if (actual !== expected) throw new AccountingPackRevisionError(`${field} is not idempotent`);
}

function assertDeployment(sqlite: DatabaseSync, input: AccountingPackSnapshotInput): Deployment {
  const deployment = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (!deployment) throw new AccountingPackRevisionError('Deployment identity is required');
  if (input.tenantId !== undefined && input.tenantId !== deployment.tenant_id)
    throw new AccountingPackRevisionError('Tenant scope mismatch');
  if (input.deploymentId !== undefined && input.deploymentId !== deployment.deployment_id)
    throw new AccountingPackRevisionError('Deployment scope mismatch');
  return { tenantId: deployment.tenant_id, deploymentId: deployment.deployment_id };
}

function assertStepUpProof(sqlite: DatabaseSync, principal: Principal): StepUpProof {
  if (!principal.sessionId)
    throw new AccountingPackRevisionError('Recent step-up authentication is required');
  const session = sqlite
    .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
    .get(principal.sessionId, principal.userId) as
    | { step_up_at: string | null; expires_at: string }
    | undefined;
  const nowMs = Date.now();
  const stepUpMs = session?.step_up_at ? Date.parse(session.step_up_at) : Number.NaN;
  const sessionExpiresMs = session?.expires_at ? Date.parse(session.expires_at) : Number.NaN;
  const stepUpExpiresMs = stepUpMs + 10 * 60_000;
  if (
    !session?.step_up_at ||
    !Number.isFinite(stepUpMs) ||
    !Number.isFinite(sessionExpiresMs) ||
    stepUpMs > nowMs ||
    stepUpExpiresMs <= nowMs ||
    sessionExpiresMs <= nowMs
  )
    throw new AccountingPackRevisionError('Recent step-up authentication is required');
  return {
    stepUpVerifiedAt: session.step_up_at,
    stepUpExpiresAt: new Date(Math.min(stepUpExpiresMs, sessionExpiresMs)).toISOString(),
  };
}

function assertPrincipal(sqlite: DatabaseSync, principal: Principal): StepUpProof {
  if (principal.isServiceActor || !canManageBilling(principal))
    throw new AccountingPackRevisionError('Finance role required');
  const user = sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
    | { status: string }
    | undefined;
  if (!user || user.status !== 'active')
    throw new AccountingPackRevisionError('Active finance principal required');
  return assertStepUpProof(sqlite, principal);
}

function rowValue<T>(row: DbRow | undefined, key: string): T | undefined {
  return row?.[key] as T | undefined;
}

function ensureEvidence(
  sqlite: DatabaseSync,
  evidenceId: string,
  evidenceType: string,
  contractVersion: string,
  semanticId: string,
  blob: Buffer,
  createdAt: string,
): string {
  return writeFinanceEvidence(
    sqlite,
    evidenceId,
    evidenceType,
    contractVersion,
    semanticId,
    blob,
    createdAt,
    accountingPackError,
  );
}

function ensureCommand(
  sqlite: DatabaseSync,
  deployment: Deployment,
  principal: Principal,
  descriptor: Readonly<{
    operation: string;
    targetKind: string;
    targetSemanticId: string;
    targetContractVersion: string;
    idempotencyKey: string;
    effectiveAt: string;
    currency?: string | null;
    amountMinor?: bigint | null;
    payload: unknown;
    createdAt: string;
  }>,
): Command {
  const proof = assertStepUpProof(sqlite, principal);
  return writeFinanceCommand(
    sqlite,
    deployment,
    principal,
    {
      ...descriptor,
      payload: {
        ...asObject(descriptor.payload),
        step_up_proof: {
          verified_at: proof.stepUpVerifiedAt,
          expires_at: proof.stepUpExpiresAt,
        },
      },
      stepUpVerifiedAt: proof.stepUpVerifiedAt,
      stepUpExpiresAt: proof.stepUpExpiresAt,
    } satisfies FinanceCommandInput,
    accountingPackError,
  );
}

function ensureAudit(
  sqlite: DatabaseSync,
  principal: Principal,
  deployment: Deployment,
  action: string,
  entityType: string,
  entityId: string,
  command: Command,
  createdAt: string,
): string {
  const details = {
    command_id: command.commandId,
    command_hash: command.commandHash,
    target_kind: entityType,
    target_semantic_id: entityId,
    target_contract_version:
      entityType === 'legal_entity_revision_bridge'
        ? ENTITY_BRIDGE_TARGET_CONTRACT
        : entityType === 'accounting_pack_legacy_run_bridge'
          ? LEGACY_BRIDGE_TARGET_CONTRACT
          : SNAPSHOT_TARGET_CONTRACT,
  };
  const detailsJson = JSON.stringify(details);
  const auditId = `fp-audit-${sha256(`${action}:${entityType}:${entityId}:${command.commandId}`).slice(0, 48)}`;
  const existing = sqlite
    .prepare(
      `SELECT actor_id,action,entity_type,entity_id,occurred_at,details_json,
              audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
       FROM audit_event WHERE id=?`,
    )
    .get(auditId) as DbRow | undefined;
  if (existing) {
    for (const [key, value] of [
      ['actor_id', principal.userId],
      ['action', action],
      ['entity_type', entityType],
      ['entity_id', entityId],
      ['details_json', detailsJson],
      ['audit_contract_version', CONTRACT_VERSION],
      ['actor_kind', 'user'],
      ['tenant_id', deployment.tenantId],
      ['deployment_id', deployment.deploymentId],
      ['correlation_id', command.commandId],
      ['provenance', 'native'],
    ] as const)
      assertEqual(existing[key], value, `Audit ${key}`);
    return auditId;
  }
  sqlite
    .prepare(
      `INSERT INTO audit_event(
         id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,
         before_json,after_json,reason,correlation_id,metadata_json,audit_contract_version,
         actor_kind,service_actor_id,service_capability,job_id,job_run_id,tenant_id,deployment_id,
         provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,?)`,
    )
    .run(
      auditId,
      principal.userId,
      action,
      entityType,
      entityId,
      createdAt,
      detailsJson,
      null,
      null,
      null,
      null,
      command.commandId,
      detailsJson,
      CONTRACT_VERSION,
      'user',
      deployment.tenantId,
      deployment.deploymentId,
      'native',
    );
  return auditId;
}

function assertExistingRow(
  row: DbRow | undefined,
  expected: Readonly<Record<string, unknown>>,
  label: string,
): void {
  if (!row) return;
  for (const [key, value] of Object.entries(expected))
    assertEqual(row[key], value, `${label} ${key}`);
}

function asObject(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function ensureLegalEntityRevision(
  sqlite: DatabaseSync,
  deployment: Deployment,
  principal: Principal,
  input: AccountingPackSnapshotInput,
  legacy: DbRow,
  currency: string,
  timezone: string,
  periodStart: string,
  createdAt: string,
  effectiveAt: string,
  idempotencyKey: string,
): string {
  const legalEntityInput = input.legalEntity ?? {};
  const bridgedAuthority = sqlite
    .prepare(
      `SELECT b.bridge_id,b.canonical_revision_id,r.series_id,
              (SELECT tail.revision_id FROM legal_entity_revision tail
                WHERE tail.series_id=r.series_id
                ORDER BY tail.revision_number DESC LIMIT 1) tail_revision_id
         FROM legal_entity_revision_bridge b
         JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
        WHERE b.tenant_id=? AND b.deployment_id=? AND b.legacy_legal_entity_id=?`,
    )
    .get(deployment.tenantId, deployment.deploymentId, input.legacyLegalEntityId) as
    | {
        bridge_id: string;
        canonical_revision_id: string;
        series_id: string;
        tail_revision_id: string;
      }
    | undefined;
  const revisionId =
    input.legalEntityRevisionId ??
    bridgedAuthority?.tail_revision_id ??
    `fp-entity-revision-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${input.legacyLegalEntityId}`).slice(0, 40)}`;
  const existing = sqlite
    .prepare('SELECT * FROM legal_entity_revision WHERE revision_id=?')
    .get(revisionId) as DbRow | undefined;
  const entitySeriesId =
    legalEntityInput.seriesId ??
    `fp-entity-series-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${input.legacyLegalEntityId}`).slice(0, 40)}`;
  if (existing) {
    assertExistingRow(
      existing,
      {
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        base_currency: currency,
        timezone,
      },
      'Legal entity revision',
    );
    return revisionId;
  }
  const revisionCount = sqlite
    .prepare(
      'SELECT COALESCE(MAX(revision_number),0) count FROM legal_entity_revision WHERE series_id=?',
    )
    .get(entitySeriesId) as { count: number };
  const revisionNumber = revisionCount.count + 1;
  const predecessor =
    revisionNumber === 1
      ? null
      : ((
          sqlite
            .prepare(
              'SELECT revision_id FROM legal_entity_revision WHERE series_id=? AND revision_number=?',
            )
            .get(entitySeriesId, revisionNumber - 1) as { revision_id: string } | undefined
        )?.revision_id ?? null);
  if (revisionNumber > 1 && !predecessor)
    throw new AccountingPackRevisionError('Legal entity revision predecessor is missing');
  const entityCommand = ensureCommand(sqlite, deployment, principal, {
    operation: 'legal_entity_revision.create',
    targetKind: 'legal_entity_revision',
    targetSemanticId: revisionId,
    targetContractVersion: 'legal-entity-revision-v1',
    idempotencyKey: `${idempotencyKey}:legal-entity-revision`,
    effectiveAt,
    currency,
    payload: {
      legacy_legal_entity_id: input.legacyLegalEntityId,
      revision_id: revisionId,
      legal_name: legalEntityInput.legalName ?? legacy.legal_name,
      currency,
      timezone,
    },
    createdAt,
  });
  const companyIdentifiers =
    safeOptionalText(legacy.company_identifiers, 'Company identifiers') ?? '';
  const revisionHash = sha256(
    canonicalJson({
      schema_version: 'legal-entity-revision-v1',
      revision_id: revisionId,
      series_id: entitySeriesId,
      revision_number: revisionNumber,
      predecessor_revision_id: predecessor,
      tenant_id: deployment.tenantId,
      deployment_id: deployment.deploymentId,
      legal_name: legalEntityInput.legalName ?? legacy.legal_name,
      tax_identifier:
        (legalEntityInput.taxIdentifier ?? companyIdentifiers) ||
        `legacy:${input.legacyLegalEntityId}`,
      base_currency: currency,
      timezone,
      effective_from: legalEntityInput.effectiveFrom ?? `${periodStart}T00:00:00.000Z`,
    }),
  );
  sqlite
    .prepare(
      `INSERT INTO legal_entity_revision(
         revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
         legal_name,tax_identifier,registration_identifier,address_line1,address_line2,locality,
         region,postal_code,country_code,base_currency,timezone,effective_from,effective_to,
         revision_hash,created_at,created_by,command_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      entitySeriesId,
      revisionNumber,
      predecessor,
      deployment.tenantId,
      deployment.deploymentId,
      safeText(legalEntityInput.legalName ?? legacy.legal_name, 'Legal name'),
      safeText(
        (legalEntityInput.taxIdentifier ?? companyIdentifiers) ||
          `legacy:${input.legacyLegalEntityId}`,
        'Tax identifier',
      ),
      safeOptionalText(legalEntityInput.registrationIdentifier, 'Registration identifier'),
      safeText(legalEntityInput.addressLine1 ?? legacy.billing_address ?? 'Address', 'Address'),
      safeOptionalText(legalEntityInput.addressLine2, 'Address line 2'),
      safeText(legalEntityInput.locality ?? 'N/A', 'Locality'),
      safeOptionalText(legalEntityInput.region, 'Region'),
      safeText(legalEntityInput.postalCode ?? '00000', 'Postal code'),
      safeText(legalEntityInput.countryCode ?? 'US', 'Country code', 2).toUpperCase(),
      currency,
      timezone,
      safeInstant(
        legalEntityInput.effectiveFrom ?? `${periodStart}T00:00:00.000Z`,
        'Legal entity effective from',
      ),
      legalEntityInput.effectiveTo
        ? safeInstant(legalEntityInput.effectiveTo, 'Legal entity effective to')
        : null,
      revisionHash,
      createdAt,
      principal.userId,
      entityCommand.commandId,
    );
  return revisionId;
}

type SnapshotValues = Readonly<{
  invoiceCount: number;
  paymentCount: number;
  workerCostCount: number;
  expenseCount: number;
  sourceItemCount: number;
  invoiceSourceCount: number;
  sourceMismatchCount: number;
  approvedTimeEntryCount: number;
  approvedExpenseCount: number;
  netMinor: bigint;
  taxMinor: bigint;
  grossMinor: bigint;
  collectedMinor: bigint;
  outstandingMinor: bigint;
  workerCostMinor: bigint;
  expenseCostMinor: bigint;
  directCostMinor: bigint;
  contributionMinor: bigint;
}>;

type NormalizedSnapshot = Readonly<{
  snapshotJson: string;
  reconciliationJson: string;
  values: SnapshotValues;
}>;

function normalizeSnapshot(
  input: AccountingPackSnapshotInput,
  sourceItems: readonly AccountingPackSourceItemInput[],
  periodStart: string,
  periodEnd: string,
  currency: string,
  timezone: string,
): NormalizedSnapshot {
  const inputRecord = input as unknown as Readonly<Record<string, unknown>>;
  const legacySnapshot = asObject(input.snapshot);
  const legacyTotals = asObject(legacySnapshot.totals);
  const invoiceRegister = readArray(
    inputRecord,
    legacySnapshot,
    'invoiceRegister',
    'invoice_register',
  );
  const collections = readArray(inputRecord, legacySnapshot, 'collections');
  const workerCosts = readArray(inputRecord, legacySnapshot, 'workerCosts', 'worker_costs');
  const expenseRegister = readArray(
    inputRecord,
    legacySnapshot,
    'expenseRegister',
    'expense_register',
  );
  const ledger = readArray(inputRecord, legacySnapshot, 'ledger');
  const totalsByCurrency = readArray(
    inputRecord,
    legacySnapshot,
    'totalsByCurrency',
    'totals_by_currency',
  );
  const sourceReconciliation = asObject(
    legacySnapshot.sourceReconciliation ?? legacySnapshot.source_reconciliation,
  );
  const values = {
    invoiceCount: safeCount(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'invoiceCount', 'invoice_count'),
      'Invoice count',
      invoiceRegister.length,
    ),
    paymentCount: safeCount(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'paymentCount', 'payment_count'),
      'Payment count',
      collections.length,
    ),
    workerCostCount: safeCount(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'workerCostCount', 'worker_cost_count'),
      'Worker cost count',
      workerCosts.length,
    ),
    expenseCount: safeCount(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'expenseCount', 'expense_count'),
      'Expense count',
      expenseRegister.length,
    ),
    sourceItemCount: safeCount(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'sourceItemCount', 'source_item_count'),
      'Source item count',
      sourceItems.length,
    ),
    invoiceSourceCount: safeCount(
      readValue(
        inputRecord,
        legacySnapshot,
        sourceReconciliation,
        'invoiceSourceCount',
        'invoice_source_count',
      ),
      'Invoice source count',
      0,
    ),
    sourceMismatchCount: safeCount(
      readValue(
        inputRecord,
        legacySnapshot,
        sourceReconciliation,
        'sourceMismatchCount',
        'source_mismatch_count',
      ),
      'Source mismatch count',
      0,
    ),
    approvedTimeEntryCount: safeCount(
      readValue(
        inputRecord,
        legacySnapshot,
        sourceReconciliation,
        'approvedTimeEntryCount',
        'approved_time_entry_count',
      ),
      'Approved time-entry count',
      0,
    ),
    approvedExpenseCount: safeCount(
      readValue(
        inputRecord,
        legacySnapshot,
        sourceReconciliation,
        'approvedExpenseCount',
        'approved_expense_count',
      ),
      'Approved expense count',
      0,
    ),
    netMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'netMinor',
        'net_minor',
        'totalInvoicedMinor',
      ),
      'Net minor',
    ),
    taxMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'taxMinor',
        'tax_minor',
        'taxInvoicedMinor',
      ),
      'Tax minor',
    ),
    grossMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'grossMinor',
        'gross_minor',
        'grossInvoicedMinor',
      ),
      'Gross minor',
    ),
    collectedMinor: safeMoney(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'collectedMinor', 'collected_minor'),
      'Collected minor',
    ),
    outstandingMinor: safeMoney(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'outstandingMinor', 'outstanding_minor'),
      'Outstanding minor',
    ),
    workerCostMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'workerCostMinor',
        'worker_cost_minor',
        'internalLaborCostMinor',
      ),
      'Worker cost minor',
    ),
    expenseCostMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'expenseCostMinor',
        'expense_cost_minor',
        'otherDirectCostMinor',
      ),
      'Expense cost minor',
    ),
    directCostMinor: safeMoney(
      readValue(inputRecord, legacySnapshot, legacyTotals, 'directCostMinor', 'direct_cost_minor'),
      'Direct cost minor',
    ),
    contributionMinor: safeMoney(
      readValue(
        inputRecord,
        legacySnapshot,
        legacyTotals,
        'contributionMinor',
        'contribution_minor',
      ),
      'Contribution minor',
    ),
  };
  for (const [field, value] of [
    ['netMinor', values.netMinor],
    ['taxMinor', values.taxMinor],
    ['grossMinor', values.grossMinor],
    ['collectedMinor', values.collectedMinor],
    ['outstandingMinor', values.outstandingMinor],
    ['workerCostMinor', values.workerCostMinor],
    ['expenseCostMinor', values.expenseCostMinor],
    ['directCostMinor', values.directCostMinor],
  ] as const)
    if (value < 0n) throw new AccountingPackRevisionError(`${field} must be non-negative`);
  if (values.grossMinor !== values.netMinor + values.taxMinor)
    throw new AccountingPackRevisionError('Gross must equal net plus tax');
  if (values.directCostMinor !== values.workerCostMinor + values.expenseCostMinor)
    throw new AccountingPackRevisionError('Direct cost must equal worker plus expense cost');
  if (values.contributionMinor !== values.netMinor - values.directCostMinor)
    throw new AccountingPackRevisionError('Contribution must equal net minus direct cost');
  if (values.sourceItemCount !== sourceItems.length)
    throw new AccountingPackRevisionError('Source item count does not match source-cut items');

  const totals = {
    currency,
    net_minor: values.netMinor,
    tax_minor: values.taxMinor,
    gross_minor: values.grossMinor,
    collected_minor: values.collectedMinor,
    outstanding_minor: values.outstandingMinor,
    worker_cost_minor: values.workerCostMinor,
    expense_cost_minor: values.expenseCostMinor,
    direct_cost_minor: values.directCostMinor,
    contribution_minor: values.contributionMinor,
  };
  const sourceProjection = {
    invoice_source_count: values.invoiceSourceCount,
    source_mismatch_count: values.sourceMismatchCount,
    approved_time_entry_count: values.approvedTimeEntryCount,
    approved_expense_count: values.approvedExpenseCount,
    source_item_count: values.sourceItemCount,
  };
  const exactProjection = {
    invoice_count: values.invoiceCount,
    payment_count: values.paymentCount,
    worker_cost_count: values.workerCostCount,
    expense_count: values.expenseCount,
    source_item_count: values.sourceItemCount,
    net_minor: values.netMinor,
    tax_minor: values.taxMinor,
    gross_minor: values.grossMinor,
    collected_minor: values.collectedMinor,
    outstanding_minor: values.outstandingMinor,
    worker_cost_minor: values.workerCostMinor,
    expense_cost_minor: values.expenseCostMinor,
    direct_cost_minor: values.directCostMinor,
    contribution_minor: values.contributionMinor,
  };
  const snapshotObject = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    period_start: periodStart,
    period_end: periodEnd,
    currency,
    timezone,
    invoice_count: values.invoiceCount,
    payment_count: values.paymentCount,
    worker_cost_count: values.workerCostCount,
    expense_count: values.expenseCount,
    source_item_count: values.sourceItemCount,
    invoice_source_count: values.invoiceSourceCount,
    source_mismatch_count: values.sourceMismatchCount,
    approved_time_entry_count: values.approvedTimeEntryCount,
    approved_expense_count: values.approvedExpenseCount,
    net_minor: values.netMinor,
    tax_minor: values.taxMinor,
    gross_minor: values.grossMinor,
    collected_minor: values.collectedMinor,
    outstanding_minor: values.outstandingMinor,
    worker_cost_minor: values.workerCostMinor,
    expense_cost_minor: values.expenseCostMinor,
    direct_cost_minor: values.directCostMinor,
    contribution_minor: values.contributionMinor,
    invoice_register: invoiceRegister,
    collections,
    worker_costs: workerCosts,
    expense_register: expenseRegister,
    ledger,
    totals,
    totals_by_currency: totalsByCurrency.length ? totalsByCurrency : [totals],
    source_reconciliation: sourceProjection,
    exact_reconciliation: exactProjection,
  };
  const reconciliationObject = {
    schema_version: RECONCILIATION_SCHEMA_VERSION,
    period_start: periodStart,
    period_end: periodEnd,
    currency,
    timezone,
    ...exactProjection,
    invoice_source_count: values.invoiceSourceCount,
    source_mismatch_count: values.sourceMismatchCount,
    approved_time_entry_count: values.approvedTimeEntryCount,
    approved_expense_count: values.approvedExpenseCount,
    checks: asObject(input.reconciliationChecks ?? asObject(input.reconciliation).checks),
    reconciles: true,
  };
  return {
    snapshotJson: canonicalJson(snapshotObject),
    reconciliationJson: canonicalJson(reconciliationObject),
    values,
  };
}

function normalizeSourceItems(
  input: AccountingPackSnapshotInput,
  createdAt: string,
  periodStart: string,
  periodEnd: string,
  currency: string,
  idempotencyKey: string,
): readonly (AccountingPackSourceItemInput & {
  normalizedId: string;
  normalizedKind: string;
  normalizedSourceId: string;
  normalizedVersion: number;
  normalizedEffectiveAt: string;
  normalizedEvidenceType: string;
  normalizedEvidenceId: string;
  normalizedAmountMinor: bigint | null;
  normalizedCurrency: string;
  itemHash: string;
  evidenceBlob: Buffer;
})[] {
  const items = input.sourceItems ?? input.sourceCutItems ?? [];
  const seen = new Set<string>();
  return items.map((raw, index) => {
    const value = raw as AccountingPackSourceItemInput;
    const normalizedId = safeText(
      value.id ??
        value.itemId ??
        `source-item-${sha256(`${idempotencyKey}:${periodStart}:${periodEnd}:${index + 1}`).slice(0, 24)}`,
      'Source item id',
      200,
    );
    const normalizedKind = safeText(
      value.itemKind ?? value.kind ?? 'invoice',
      'Source item kind',
      80,
    );
    const normalizedSourceId = safeText(
      value.sourceId ?? value.source_id ?? normalizedId,
      'Source id',
      200,
    );
    const normalizedVersion = value.itemVersion ?? value.version ?? 1;
    if (!Number.isSafeInteger(normalizedVersion) || normalizedVersion < 1)
      throw new AccountingPackRevisionError('Source item version is invalid');
    const normalizedEffectiveAt = safeInstant(
      value.effectiveAt ?? value.effective_at ?? createdAt,
      'Source item effective at',
    );
    const normalizedEvidenceType = safeText(
      value.evidenceType ?? value.evidence_type ?? 'invoice_source',
      'Source item evidence type',
      80,
    );
    const normalizedEvidenceId = safeText(
      value.evidenceId ??
        value.evidence_id ??
        `source-evidence-${sha256(`${idempotencyKey}:${periodStart}:${periodEnd}:${normalizedId}`).slice(0, 32)}`,
      'Source item evidence id',
      200,
    );
    const normalizedAmountMinor =
      value.amountMinor === null || value.amount_minor === null
        ? null
        : safeMoney(value.amountMinor ?? value.amount_minor, 'Source item amount');
    const normalizedCurrency = safeCurrency(value.currency ?? currency);
    if (normalizedCurrency !== currency)
      throw new AccountingPackRevisionError('Source item currency is outside the pack scope');
    const uniqueness = `${normalizedKind}:${normalizedSourceId}:${normalizedVersion}`;
    if (seen.has(uniqueness)) throw new AccountingPackRevisionError('Duplicate source item');
    seen.add(uniqueness);
    const evidenceBlob = Buffer.from(
      canonicalJson({
        schema_version: 'accounting-pack-source-item-v1',
        cut_period_start: periodStart,
        cut_period_end: periodEnd,
        id: normalizedId,
        item_kind: normalizedKind,
        item_id: normalizedSourceId,
        item_version: normalizedVersion,
        effective_at: normalizedEffectiveAt,
        evidence_type: normalizedEvidenceType,
        evidence_id: normalizedEvidenceId,
        amount_minor: normalizedAmountMinor,
        currency: normalizedCurrency,
        payload: value.payload ?? null,
      }),
    );
    return {
      ...value,
      normalizedId,
      normalizedKind,
      normalizedSourceId,
      normalizedVersion,
      normalizedEffectiveAt,
      normalizedEvidenceType,
      normalizedEvidenceId,
      normalizedAmountMinor,
      normalizedCurrency,
      itemHash: sha256(evidenceBlob),
      evidenceBlob,
    };
  });
}

function ensureSourceCut(
  sqlite: DatabaseSync,
  deployment: Deployment,
  principal: Principal,
  input: AccountingPackSnapshotInput,
  normalizedItems: ReturnType<typeof normalizeSourceItems>,
  currency: string,
  periodStart: string,
  periodEnd: string,
  legalEntityRevisionId: string,
  command: Command,
  sourceCutId: string,
  createdAt: string,
): string {
  const watermarkInput = (input as unknown as Record<string, unknown>).changeSequenceHighWatermark;
  const watermark =
    watermarkInput === undefined
      ? Number(
          (
            sqlite
              .prepare('SELECT COALESCE(MAX(change_sequence),0) value FROM finance_change_event')
              .get() as {
              value: number;
            }
          ).value,
        )
      : safeCount(watermarkInput, 'Change sequence high watermark');
  const cutPayload = {
    schema_version: 'accounting-pack-source-cut-v1',
    tenant_id: deployment.tenantId,
    deployment_id: deployment.deploymentId,
    legal_entity_revision_id: legalEntityRevisionId,
    currency,
    period_start: periodStart,
    period_end: periodEnd,
    change_sequence_high_watermark: watermark,
    items: normalizedItems.map((item) => ({ id: item.normalizedId, item_hash: item.itemHash })),
  };
  const cutBlob = Buffer.from(canonicalJson(cutPayload));
  const cutHash = sha256(cutBlob);
  ensureEvidence(
    sqlite,
    `fp-cut-evidence-${cutHash.slice(0, 48)}`,
    'source_cut',
    'accounting-pack-source-cut-v1',
    sourceCutId,
    cutBlob,
    createdAt,
  );
  const existing = sqlite
    .prepare('SELECT * FROM finance_source_cut WHERE cut_id=?')
    .get(sourceCutId) as DbRow | undefined;
  if (existing) {
    assertExistingRow(
      existing,
      {
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        legal_entity_revision_id: legalEntityRevisionId,
        currency,
        period_start: periodStart,
        period_end: periodEnd,
        change_sequence_high_watermark: watermark,
        cut_hash: cutHash,
      },
      'Source cut',
    );
  } else {
    sqlite
      .prepare(
        `INSERT INTO finance_source_cut(
           cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
           change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        sourceCutId,
        deployment.tenantId,
        deployment.deploymentId,
        legalEntityRevisionId,
        currency,
        periodStart,
        periodEnd,
        watermark,
        cutHash,
        createdAt,
        principal.userId,
        command.commandId,
      );
  }
  const insertItem = sqlite.prepare(
    `INSERT INTO finance_source_cut_item(
       id,cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,
       evidence_hash,amount_minor,currency,item_hash
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const item of normalizedItems) {
    ensureEvidence(
      sqlite,
      item.normalizedEvidenceId,
      item.normalizedEvidenceType,
      'accounting-pack-source-item-v1',
      `${sourceCutId}:${item.normalizedId}`,
      item.evidenceBlob,
      createdAt,
    );
    const existingItem = sqlite
      .prepare(
        'SELECT *,CAST(amount_minor AS TEXT) amount_minor_text FROM finance_source_cut_item WHERE id=?',
      )
      .get(item.normalizedId) as DbRow | undefined;
    if (existingItem) {
      assertExistingRow(
        existingItem,
        {
          cut_id: sourceCutId,
          item_kind: item.normalizedKind,
          item_id: item.normalizedSourceId,
          item_version: item.normalizedVersion,
          effective_at: item.normalizedEffectiveAt,
          evidence_type: item.normalizedEvidenceType,
          evidence_id: item.normalizedEvidenceId,
          evidence_hash: item.itemHash,
          amount_minor_text: item.normalizedAmountMinor?.toString() ?? null,
          currency,
          item_hash: item.itemHash,
        },
        'Source cut item',
      );
      continue;
    }
    insertItem.run(
      item.normalizedId,
      sourceCutId,
      item.normalizedKind,
      item.normalizedSourceId,
      item.normalizedVersion,
      item.normalizedEffectiveAt,
      item.normalizedEvidenceType,
      item.normalizedEvidenceId,
      item.itemHash,
      item.normalizedAmountMinor,
      currency,
      item.itemHash,
    );
  }
  return cutHash;
}

export class AccountingPackRevisionService {
  private readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  createCanonicalRevision(
    principal: Principal,
    input: AccountingPackSnapshotInput,
  ): AccountingPackRevisionResult {
    const work = (): AccountingPackRevisionResult => {
      assertPrincipal(this.sqlite, principal);
      const deployment = assertDeployment(this.sqlite, input);
      const periodStart = safeDate(input.periodStart, 'Period start');
      const periodEnd = safeDate(input.periodEnd, 'Period end');
      if (periodEnd <= periodStart)
        throw new AccountingPackRevisionError('Period end must follow period start');
      const createdAt = safeInstant(input.createdAt ?? new Date().toISOString(), 'Created at');
      const effectiveAt = safeInstant(input.effectiveAt ?? createdAt, 'Effective at');
      const legacyLegalEntityId = safeText(
        input.legacyLegalEntityId,
        'Legacy legal entity id',
        200,
      );
      const legacy = this.sqlite
        .prepare('SELECT * FROM legal_entity WHERE id=?')
        .get(legacyLegalEntityId) as DbRow | undefined;
      if (!legacy) throw new AccountingPackRevisionError('Legacy legal entity not found');
      const currency = safeCurrency(input.currency ?? legacy.currency);
      const timezone = safeTimezone(input.timezone ?? 'UTC');
      assertEqual(rowValue<string>(legacy, 'currency'), currency, 'Legacy entity currency');
      const idempotencyKey = safeText(
        input.idempotencyKey ??
          `${deployment.tenantId}:${deployment.deploymentId}:${legacyLegalEntityId}:${periodStart}:${periodEnd}`,
        'Idempotency key',
        300,
      );
      const legalEntityRevisionId = ensureLegalEntityRevision(
        this.sqlite,
        deployment,
        principal,
        input,
        legacy,
        currency,
        timezone,
        periodStart,
        createdAt,
        effectiveAt,
        idempotencyKey,
      );
      const normalizedItems = normalizeSourceItems(
        input,
        createdAt,
        periodStart,
        periodEnd,
        currency,
        idempotencyKey,
      );
      const sourceCutId =
        input.sourceCutId ??
        `fp-source-cut-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${idempotencyKey}:source-cut`).slice(0, 40)}`;
      const revisionId =
        input.revisionId ??
        `fp-accounting-pack-revision-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${idempotencyKey}:revision`).slice(0, 40)}`;
      const seriesId =
        input.seriesId ??
        `fp-accounting-pack-series-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${legalEntityRevisionId}:${currency}:${periodStart}:${periodEnd}`).slice(0, 40)}`;
      const existingIdentityBridge = this.sqlite
        .prepare(
          `SELECT bridge_id FROM legal_entity_revision_bridge
            WHERE tenant_id=? AND deployment_id=? AND legacy_legal_entity_id=?`,
        )
        .get(deployment.tenantId, deployment.deploymentId, legacyLegalEntityId) as
        | { bridge_id: string }
        | undefined;
      const entityBridgeId =
        input.entityBridgeId ??
        existingIdentityBridge?.bridge_id ??
        `fp-entity-bridge-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${legacyLegalEntityId}:${legalEntityRevisionId}`).slice(0, 40)}`;
      const snapshot = normalizeSnapshot(
        input,
        normalizedItems,
        periodStart,
        periodEnd,
        currency,
        timezone,
      );
      const snapshotHash = sha256(snapshot.snapshotJson);
      const reconciliationHash = sha256(snapshot.reconciliationJson);
      const snapshotCommand = ensureCommand(this.sqlite, deployment, principal, {
        operation: 'accounting_pack_revision_snapshot.create',
        targetKind: 'accounting_pack_revision_snapshot',
        targetSemanticId: revisionId,
        targetContractVersion: SNAPSHOT_TARGET_CONTRACT,
        idempotencyKey: `${idempotencyKey}:snapshot`,
        effectiveAt,
        currency,
        amountMinor: snapshot.values.grossMinor,
        payload: {
          revision_id: revisionId,
          source_cut_id: sourceCutId,
          snapshot_sha256: snapshotHash,
          reconciliation_sha256: reconciliationHash,
        },
        createdAt,
      });
      const sourceCutHash = ensureSourceCut(
        this.sqlite,
        deployment,
        principal,
        input,
        normalizedItems,
        currency,
        periodStart,
        periodEnd,
        legalEntityRevisionId,
        snapshotCommand,
        sourceCutId,
        createdAt,
      );
      const existingSeries = this.sqlite
        .prepare('SELECT * FROM accounting_pack_series WHERE series_id=?')
        .get(seriesId) as DbRow | undefined;
      if (existingSeries)
        assertExistingRow(
          existingSeries,
          {
            tenant_id: deployment.tenantId,
            deployment_id: deployment.deploymentId,
            legal_entity_revision_id: legalEntityRevisionId,
            currency,
            timezone,
            period_start: periodStart,
            period_end: periodEnd,
          },
          'Accounting pack series',
        );
      else
        this.sqlite
          .prepare(
            `INSERT INTO accounting_pack_series(
               series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
               period_start,period_end,tail_revision_id,current_authority_event_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            seriesId,
            deployment.tenantId,
            deployment.deploymentId,
            legalEntityRevisionId,
            currency,
            timezone,
            periodStart,
            periodEnd,
            null,
            null,
          );
      const existingRevision = this.sqlite
        .prepare('SELECT * FROM accounting_pack_revision WHERE revision_id=?')
        .get(revisionId) as DbRow | undefined;
      const latestRevision = this.sqlite
        .prepare(
          `SELECT revision_id,revision_number
           FROM accounting_pack_revision
           WHERE series_id=?
           ORDER BY revision_number DESC
           LIMIT 1`,
        )
        .get(seriesId) as { revision_id: string; revision_number: number } | undefined;
      const priorRevision =
        existingRevision !== undefined
          ? (rowValue<string | null>(existingRevision, 'predecessor_revision_id') ?? null)
          : input.predecessorRevisionId !== undefined
            ? input.predecessorRevisionId
            : (latestRevision?.revision_id ?? null);
      const revisionNumber =
        existingRevision !== undefined
          ? safeCount(existingRevision.revision_number, 'Accounting pack revision number')
          : (input.revisionNumber ?? (latestRevision ? latestRevision.revision_number + 1 : 1));
      if (revisionNumber < 1)
        throw new AccountingPackRevisionError('Accounting pack revision number is invalid');
      const revisionHash =
        existingRevision !== undefined
          ? safeText(existingRevision.revision_hash, 'Accounting pack revision hash', 64)
          : sha256(
              canonicalJson({
                schema_version: 'accounting-pack-revision-v1',
                revision_id: revisionId,
                series_id: seriesId,
                revision_number: revisionNumber,
                predecessor_revision_id: priorRevision,
                tenant_id: deployment.tenantId,
                deployment_id: deployment.deploymentId,
                legal_entity_revision_id: legalEntityRevisionId,
                currency,
                timezone,
                period_start: periodStart,
                period_end: periodEnd,
                source_cut_id: sourceCutId,
                source_cut_hash: sourceCutHash,
                snapshot_sha256: snapshotHash,
                reconciliation_sha256: reconciliationHash,
              }),
            );
      if (existingRevision)
        assertExistingRow(
          existingRevision,
          {
            series_id: seriesId,
            revision_number: revisionNumber,
            predecessor_revision_id: priorRevision,
            tenant_id: deployment.tenantId,
            deployment_id: deployment.deploymentId,
            legal_entity_revision_id: legalEntityRevisionId,
            currency,
            timezone,
            period_start: periodStart,
            period_end: periodEnd,
            source_cut_id: sourceCutId,
            source_cut_hash: sourceCutHash,
            revision_hash: revisionHash,
          },
          'Accounting pack revision',
        );
      else
        this.sqlite
          .prepare(
            `INSERT INTO accounting_pack_revision(
               revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
               legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,
               source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,
               status,revision_hash,created_at,created_by,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            revisionId,
            seriesId,
            revisionNumber,
            priorRevision,
            deployment.tenantId,
            deployment.deploymentId,
            legalEntityRevisionId,
            currency,
            timezone,
            periodStart,
            periodEnd,
            sourceCutId,
            sourceCutHash,
            input.reconciliationStatus ?? 'CLEAN',
            safeMoney(input.reconciliationDifferenceMinor, 'Reconciliation difference'),
            safeCount(input.blockerCount, 'Blocker count'),
            input.reconciliationStatus === 'BLOCKED' ? 'failed' : 'candidate',
            revisionHash,
            createdAt,
            principal.userId,
            snapshotCommand.commandId,
          );
      const batchId = `fp-source-batch-${sha256(`${revisionId}:${sourceCutId}`).slice(0, 40)}`;
      const existingBatch = this.sqlite
        .prepare('SELECT * FROM accounting_pack_source_cut_batch WHERE id=?')
        .get(batchId) as DbRow | undefined;
      if (existingBatch)
        assertExistingRow(
          existingBatch,
          { revision_id: revisionId, cut_id: sourceCutId, cut_hash: sourceCutHash },
          'Source cut batch',
        );
      else
        this.sqlite
          .prepare(
            'INSERT INTO accounting_pack_source_cut_batch(id,revision_id,cut_id,change_sequence_high_watermark,cut_hash) VALUES(?,?,?,?,?)',
          )
          .run(
            batchId,
            revisionId,
            sourceCutId,
            Number(
              (
                this.sqlite
                  .prepare(
                    'SELECT change_sequence_high_watermark FROM finance_source_cut WHERE cut_id=?',
                  )
                  .get(sourceCutId) as { change_sequence_high_watermark: number }
              ).change_sequence_high_watermark,
            ),
            sourceCutHash,
          );
      for (const item of normalizedItems) {
        const projectionId = `fp-source-projection-${sha256(`${batchId}:${item.normalizedId}`).slice(0, 40)}`;
        const projection = this.sqlite
          .prepare('SELECT * FROM accounting_pack_source_cut_item WHERE id=?')
          .get(projectionId) as DbRow | undefined;
        if (projection)
          assertExistingRow(
            projection,
            {
              batch_id: batchId,
              source_cut_item_id: item.normalizedId,
              evidence_hash: item.itemHash,
            },
            'Source cut projection',
          );
        else
          this.sqlite
            .prepare(
              'INSERT INTO accounting_pack_source_cut_item(id,batch_id,source_cut_item_id,evidence_hash) VALUES(?,?,?,?)',
            )
            .run(projectionId, batchId, item.normalizedId, item.itemHash);
      }
      const snapshotAudit = ensureAudit(
        this.sqlite,
        principal,
        deployment,
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        revisionId,
        snapshotCommand,
        createdAt,
      );
      const existingSnapshot = this.sqlite
        .prepare('SELECT * FROM accounting_pack_revision_snapshot WHERE revision_id=?')
        .get(revisionId) as DbRow | undefined;
      if (existingSnapshot)
        assertExistingRow(
          existingSnapshot,
          {
            tenant_id: deployment.tenantId,
            deployment_id: deployment.deploymentId,
            legal_entity_revision_id: legalEntityRevisionId,
            currency,
            period_start: periodStart,
            period_end: periodEnd,
            source_cut_id: sourceCutId,
            source_cut_hash: sourceCutHash,
            snapshot_sha256: snapshotHash,
            reconciliation_sha256: reconciliationHash,
            command_id: snapshotCommand.commandId,
            audit_event_id: snapshotAudit,
          },
          'Accounting pack snapshot',
        );
      else
        this.sqlite
          .prepare(
            `INSERT INTO accounting_pack_revision_snapshot(
          revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
          source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,reconciliation_sha256,
          command_id,audit_event_id,created_at,schema_version,timezone,invoice_count,payment_count,worker_cost_count,
          expense_count,source_item_count,invoice_source_count,source_mismatch_count,approved_time_entry_count,
          approved_expense_count,net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,worker_cost_minor,
          expense_cost_minor,direct_cost_minor,contribution_minor
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            revisionId,
            deployment.tenantId,
            deployment.deploymentId,
            legalEntityRevisionId,
            currency,
            periodStart,
            periodEnd,
            sourceCutId,
            sourceCutHash,
            snapshot.snapshotJson,
            snapshotHash,
            snapshot.reconciliationJson,
            reconciliationHash,
            snapshotCommand.commandId,
            snapshotAudit,
            createdAt,
            SNAPSHOT_SCHEMA_VERSION,
            timezone,
            snapshot.values.invoiceCount,
            snapshot.values.paymentCount,
            snapshot.values.workerCostCount,
            snapshot.values.expenseCount,
            snapshot.values.sourceItemCount,
            snapshot.values.invoiceSourceCount,
            snapshot.values.sourceMismatchCount,
            snapshot.values.approvedTimeEntryCount,
            snapshot.values.approvedExpenseCount,
            snapshot.values.netMinor,
            snapshot.values.taxMinor,
            snapshot.values.grossMinor,
            snapshot.values.collectedMinor,
            snapshot.values.outstandingMinor,
            snapshot.values.workerCostMinor,
            snapshot.values.expenseCostMinor,
            snapshot.values.directCostMinor,
            snapshot.values.contributionMinor,
          );
      const existingBridge = this.sqlite
        .prepare('SELECT * FROM legal_entity_revision_bridge WHERE bridge_id=?')
        .get(entityBridgeId) as DbRow | undefined;
      let entityBridgeCommand: Command;
      let entityAudit: string;
      if (existingBridge) {
        const existingProvenance = this.sqlite
          .prepare(
            `SELECT fc.request_hash,fc.command_hash,fc.operation,fc.target_kind,
                    fc.target_semantic_id,fc.state,fc.tenant_id,fc.deployment_id,
                    ae.action,ae.entity_type,ae.entity_id,ae.correlation_id
             FROM finance_command fc
             JOIN audit_event ae ON ae.id=?
             WHERE fc.command_id=?`,
          )
          .get(String(existingBridge.audit_event_id), String(existingBridge.command_id)) as
          | DbRow
          | undefined;
        if (!existingProvenance)
          throw new AccountingPackRevisionError('Legal entity bridge provenance is missing');
        for (const [key, value] of [
          ['operation', 'legal_entity_revision_bridge.create'],
          ['target_kind', 'legal_entity_revision_bridge'],
          ['target_semantic_id', entityBridgeId],
          ['state', 'completed'],
          ['tenant_id', deployment.tenantId],
          ['deployment_id', deployment.deploymentId],
          ['action', 'legal_entity_revision_bridge.create'],
          ['entity_type', 'legal_entity_revision_bridge'],
          ['entity_id', entityBridgeId],
          ['correlation_id', existingBridge.command_id],
        ] as const)
          assertEqual(existingProvenance[key], value, `Legal entity bridge provenance ${key}`);
        entityBridgeCommand = {
          commandId: String(existingBridge.command_id),
          requestHash: String(existingProvenance.request_hash),
          commandHash: String(existingProvenance.command_hash),
        };
        entityAudit = String(existingBridge.audit_event_id);
        const bridgeSeries = this.sqlite
          .prepare(
            `SELECT bridged.series_id bridged_series_id,selected.series_id selected_series_id
               FROM legal_entity_revision bridged
               JOIN legal_entity_revision selected ON selected.revision_id=?
              WHERE bridged.revision_id=?`,
          )
          .get(legalEntityRevisionId, String(existingBridge.canonical_revision_id)) as
          | { bridged_series_id: string; selected_series_id: string }
          | undefined;
        if (!bridgeSeries || bridgeSeries.bridged_series_id !== bridgeSeries.selected_series_id)
          throw new AccountingPackRevisionError(
            'Legal entity revision does not belong to the bridged canonical series',
          );
      } else {
        entityBridgeCommand = ensureCommand(this.sqlite, deployment, principal, {
          operation: 'legal_entity_revision_bridge.create',
          targetKind: 'legal_entity_revision_bridge',
          targetSemanticId: entityBridgeId,
          targetContractVersion: ENTITY_BRIDGE_TARGET_CONTRACT,
          idempotencyKey: `legal-entity-bridge:${legacyLegalEntityId}:${legalEntityRevisionId}`,
          effectiveAt,
          currency,
          payload: {
            bridge_id: entityBridgeId,
            legacy_legal_entity_id: legacyLegalEntityId,
            canonical_revision_id: legalEntityRevisionId,
          },
          createdAt,
        });
        entityAudit = ensureAudit(
          this.sqlite,
          principal,
          deployment,
          'legal_entity_revision_bridge.create',
          'legal_entity_revision_bridge',
          entityBridgeId,
          entityBridgeCommand,
          createdAt,
        );
      }
      const legacyCode = safeText(legacy.code, 'Legacy legal entity code');
      const legacyName = safeText(legacy.legal_name, 'Legacy legal entity name');
      const legacyVersion = safeCount(legacy.version, 'Legacy legal entity version');
      if (legacyVersion < 1)
        throw new AccountingPackRevisionError('Legacy legal entity version is invalid');
      const identityManifest = canonicalJson({
        schema_version: ENTITY_MANIFEST_VERSION,
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        legacy_legal_entity_id: legacyLegalEntityId,
        legacy_legal_entity_code: legacyCode,
        legacy_legal_entity_name: legacyName,
        legacy_legal_entity_version: legacyVersion,
        legacy_currency: currency,
        canonical_revision_id: legalEntityRevisionId,
        canonical_revision_hash:
          rowValue<string>(
            this.sqlite
              .prepare('SELECT revision_hash FROM legal_entity_revision WHERE revision_id=?')
              .get(legalEntityRevisionId) as DbRow | undefined,
            'revision_hash',
          ) ?? '',
        canonical_currency: currency,
        canonical_timezone: timezone,
      });
      const identityHash = sha256(identityManifest);
      if (existingBridge)
        assertExistingRow(
          existingBridge,
          {
            tenant_id: deployment.tenantId,
            deployment_id: deployment.deploymentId,
            legacy_legal_entity_id: legacyLegalEntityId,
            command_id: entityBridgeCommand.commandId,
            audit_event_id: entityAudit,
          },
          'Legal entity bridge',
        );
      else
        this.sqlite
          .prepare(
            `INSERT INTO legal_entity_revision_bridge(
          bridge_id,tenant_id,deployment_id,legacy_legal_entity_id,canonical_revision_id,legacy_legal_entity_code,
          legacy_legal_entity_name,legacy_legal_entity_version,legacy_currency,canonical_revision_hash,canonical_currency,
          canonical_timezone,identity_manifest_version,identity_manifest_json,identity_manifest_sha256,command_id,audit_event_id,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            entityBridgeId,
            deployment.tenantId,
            deployment.deploymentId,
            legacyLegalEntityId,
            legalEntityRevisionId,
            legacyCode,
            legacyName,
            legacyVersion,
            currency,
            JSON.parse(identityManifest).canonical_revision_hash,
            currency,
            timezone,
            ENTITY_MANIFEST_VERSION,
            identityManifest,
            identityHash,
            entityBridgeCommand.commandId,
            entityAudit,
            createdAt,
          );
      const currentSeries = this.sqlite
        .prepare('SELECT tail_revision_id FROM accounting_pack_series WHERE series_id=?')
        .get(seriesId) as { tail_revision_id: string | null };
      if (!existingRevision && currentSeries.tail_revision_id !== revisionId)
        this.sqlite
          .prepare('UPDATE accounting_pack_series SET tail_revision_id=? WHERE series_id=?')
          .run(revisionId, seriesId);
      let legacyBridgeId: string | null = null;
      if (input.legacyRunId !== undefined && input.legacyRunId !== null) {
        const legacyRunId = safeText(input.legacyRunId, 'Legacy run id', 200);
        const legacyRun = this.sqlite
          .prepare(
            'SELECT id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json FROM accounting_pack_run WHERE id=?',
          )
          .get(legacyRunId) as DbRow | undefined;
        if (
          !legacyRun ||
          rowValue<string | null>(legacyRun, 'legal_entity_id') === null ||
          rowValue<string>(legacyRun, 'state') !== 'final'
        )
          throw new AccountingPackRevisionError(
            'Only a finalized entity-scoped legacy run may be bridged',
          );
        assertEqual(legacyRun.legal_entity_id, legacyLegalEntityId, 'Legacy run entity');
        assertEqual(legacyRun.period_start, periodStart, 'Legacy run period start');
        assertEqual(legacyRun.period_end, periodEnd, 'Legacy run period end');
        legacyBridgeId =
          input.legacyBridgeId ??
          `fp-legacy-bridge-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${legacyRunId}:${revisionId}`).slice(0, 40)}`;
        const legacyCommand = ensureCommand(this.sqlite, deployment, principal, {
          operation: 'accounting_pack_legacy_run_bridge.create',
          targetKind: 'accounting_pack_legacy_run_bridge',
          targetSemanticId: legacyBridgeId,
          targetContractVersion: LEGACY_BRIDGE_TARGET_CONTRACT,
          idempotencyKey: `${idempotencyKey}:legacy-bridge`,
          effectiveAt,
          currency,
          payload: {
            bridge_id: legacyBridgeId,
            legacy_run_id: legacyRunId,
            revision_id: revisionId,
          },
          createdAt,
        });
        const legacyAudit = ensureAudit(
          this.sqlite,
          principal,
          deployment,
          'accounting_pack_legacy_run_bridge.create',
          'accounting_pack_legacy_run_bridge',
          legacyBridgeId,
          legacyCommand,
          createdAt,
        );
        if (
          typeof legacyRun.snapshot_json !== 'string' ||
          typeof legacyRun.reconciliation_json !== 'string'
        )
          throw new AccountingPackRevisionError('Legacy Accounting Pack JSON is invalid');
        const legacySnapshotHash = sha256(legacyRun.snapshot_json);
        const legacyReconciliationHash = sha256(legacyRun.reconciliation_json);
        const existingLegacy = this.sqlite
          .prepare('SELECT * FROM accounting_pack_legacy_run_bridge WHERE bridge_id=?')
          .get(legacyBridgeId) as DbRow | undefined;
        if (existingLegacy)
          assertExistingRow(
            existingLegacy,
            {
              tenant_id: deployment.tenantId,
              deployment_id: deployment.deploymentId,
              legacy_run_id: legacyRunId,
              revision_id: revisionId,
              legacy_snapshot_sha256: legacySnapshotHash,
              legacy_reconciliation_sha256: legacyReconciliationHash,
              snapshot_sha256: snapshotHash,
              reconciliation_sha256: reconciliationHash,
              command_id: legacyCommand.commandId,
              audit_event_id: legacyAudit,
            },
            'Legacy run bridge',
          );
        else
          this.sqlite
            .prepare(
              `INSERT INTO accounting_pack_legacy_run_bridge(
          bridge_id,tenant_id,deployment_id,legacy_run_id,legacy_legal_entity_id,revision_id,legal_entity_revision_id,currency,
          period_start,period_end,source_cut_id,source_cut_hash,timezone,legacy_snapshot_sha256,legacy_reconciliation_sha256,
          snapshot_sha256,reconciliation_sha256,command_id,audit_event_id,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(
              legacyBridgeId,
              deployment.tenantId,
              deployment.deploymentId,
              legacyRunId,
              legacyLegalEntityId,
              revisionId,
              legalEntityRevisionId,
              currency,
              periodStart,
              periodEnd,
              sourceCutId,
              sourceCutHash,
              timezone,
              legacySnapshotHash,
              legacyReconciliationHash,
              snapshotHash,
              reconciliationHash,
              legacyCommand.commandId,
              legacyAudit,
              createdAt,
            );
      }
      return {
        revisionId,
        seriesId,
        sourceCutId,
        legalEntityRevisionId,
        entityBridgeId,
        legacyRunBridgeId: legacyBridgeId,
        snapshotSha256: snapshotHash,
        reconciliationSha256: reconciliationHash,
        idempotent: Boolean(existingRevision),
      };
    };
    // The normal Accounting Pack flow persists its compatibility projection and canonical
    // revision atomically. Direct domain callers still receive the same immediate transaction.
    if (this.sqlite.isTransaction) return work();
    return runImmediateTransaction(this.sqlite, 'accounting-pack-revision', work);
  }

  createAccountingPackRevision(
    principal: Principal,
    input: AccountingPackSnapshotInput,
  ): AccountingPackRevisionResult {
    return this.createCanonicalRevision(principal, input);
  }
}

export function createAccountingPackRevision(
  sqlite: DatabaseSync,
  principal: Principal,
  input: AccountingPackSnapshotInput,
): AccountingPackRevisionResult {
  return new AccountingPackRevisionService(sqlite).createCanonicalRevision(principal, input);
}

export const createCanonicalAccountingPackRevision = createAccountingPackRevision;
