import type { DatabaseSync } from 'node:sqlite';
import { overtimeRate, type OvertimeMethod } from '@ja/billing-engine';
import { canManageBilling, type Principal } from '@ja/domain';
import { applyBasisPoints, hourlyRateForMinutes, money, type Currency } from '@ja/money';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { readLiveSessionStepUp } from '../../core/authorization.ts';
import { canonicalJson as canonicalJsonValue, sha256 } from '../../core/canonical-json.ts';
import {
  ensureCommand as writeFinanceCommand,
  ensureEvidence as writeFinanceEvidence,
  ensureEvidenceRecord as writeFinanceEvidenceRecord,
  type FinanceCommand as Command,
  type FinanceEvidence,
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
  commercialSourceManifest?: readonly unknown[];
  paymentReversals?: readonly unknown[];
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
const AUTHORITATIVE_APPROVAL_STATES = new Set(['approved', 'locked', 'final']);
const HISTORICAL_INVOICE_STATES = new Set(['issued', 'sent', 'partially_paid', 'paid', 'overdue']);

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
  const proof = readLiveSessionStepUp(sqlite, principal);
  if (!proof) throw new AccountingPackRevisionError('Recent step-up authentication is required');
  return {
    stepUpVerifiedAt: proof.verifiedAt,
    stepUpExpiresAt: proof.expiresAt,
  };
}

function assertPrincipal(sqlite: DatabaseSync, principal: Principal): StepUpProof {
  if (!canManageBilling(principal)) throw new AccountingPackRevisionError('Finance role required');
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

function ensureEvidenceRecord(
  sqlite: DatabaseSync,
  evidenceId: string,
  evidenceType: string,
  contractVersion: string,
  semanticId: string,
  blob: Buffer,
  createdAt: string,
): FinanceEvidence {
  return writeFinanceEvidenceRecord(
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
  periodEnd: string,
  createdAt: string,
  effectiveAt: string,
  idempotencyKey: string,
): string {
  const legalEntityInput = input.legalEntity ?? {};
  const bridgedAuthority = sqlite
    .prepare(
      `SELECT b.bridge_id,b.canonical_revision_id,r.series_id
         FROM legal_entity_revision_bridge b
         JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
        WHERE b.tenant_id=? AND b.deployment_id=? AND b.legacy_legal_entity_id=?`,
    )
    .get(deployment.tenantId, deployment.deploymentId, input.legacyLegalEntityId) as
    | {
        bridge_id: string;
        canonical_revision_id: string;
        series_id: string;
      }
    | undefined;
  const canonicalSeriesId =
    bridgedAuthority?.series_id ??
    `fp-entity-series-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${input.legacyLegalEntityId}`).slice(0, 40)}`;
  if (legalEntityInput.seriesId !== undefined && legalEntityInput.seriesId !== canonicalSeriesId)
    throw new AccountingPackRevisionError(
      'Legal entity canonical series does not belong to the requested legacy legal entity',
    );
  const entitySeriesId = canonicalSeriesId;
  const foreignOwner = sqlite
    .prepare(
      `SELECT b.legacy_legal_entity_id
         FROM legal_entity_revision_bridge b
         JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
        WHERE b.tenant_id=? AND b.deployment_id=? AND r.series_id=?
          AND b.legacy_legal_entity_id<>?
        LIMIT 1`,
    )
    .get(
      deployment.tenantId,
      deployment.deploymentId,
      entitySeriesId,
      input.legacyLegalEntityId,
    ) as { legacy_legal_entity_id: string } | undefined;
  if (foreignOwner)
    throw new AccountingPackRevisionError(
      'Legal entity canonical series is owned by another legacy legal entity',
    );
  const periodCut = `${periodEnd}T23:59:59.999Z`;
  const activeAtCut = (): DbRow[] =>
    sqlite
      .prepare(
        `SELECT * FROM legal_entity_revision
          WHERE series_id=? AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>?)
          ORDER BY revision_number`,
      )
      .all(entitySeriesId, periodCut, periodCut) as DbRow[];
  const seriesCount = Number(
    (
      sqlite
        .prepare('SELECT COUNT(*) count FROM legal_entity_revision WHERE series_id=?')
        .get(entitySeriesId) as { count: number }
    ).count,
  );
  let revisionId = input.legalEntityRevisionId;
  if (revisionId === undefined) {
    const active = activeAtCut();
    if (active.length > 1)
      throw new AccountingPackRevisionError(
        'Multiple legal-entity revisions overlap at the deterministic period cut',
      );
    if (active.length === 1) revisionId = safeText(active[0]!.revision_id, 'Legal entity revision');
    else if (seriesCount > 0)
      throw new AccountingPackRevisionError(
        'No legal-entity revision is effective at the deterministic period cut (effective-date gap)',
      );
    else
      revisionId = `fp-entity-revision-${sha256(`${deployment.tenantId}:${deployment.deploymentId}:${input.legacyLegalEntityId}`).slice(0, 40)}`;
  }
  const existing = sqlite
    .prepare('SELECT * FROM legal_entity_revision WHERE revision_id=?')
    .get(revisionId) as DbRow | undefined;
  if (existing) {
    const assertedEffectiveBounds: Record<string, unknown> = {};
    if (legalEntityInput.effectiveFrom !== undefined)
      assertedEffectiveBounds.effective_from = safeInstant(
        legalEntityInput.effectiveFrom,
        'Legal entity effective from',
      );
    if (legalEntityInput.effectiveTo !== undefined)
      assertedEffectiveBounds.effective_to = legalEntityInput.effectiveTo
        ? safeInstant(legalEntityInput.effectiveTo, 'Legal entity effective to')
        : null;
    assertExistingRow(
      existing,
      {
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        series_id: entitySeriesId,
        base_currency: currency,
        timezone,
        ...assertedEffectiveBounds,
      },
      'Legal entity revision',
    );
  } else {
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
    const effectiveFrom = safeInstant(
      legalEntityInput.effectiveFrom ?? `${periodStart}T00:00:00.000Z`,
      'Legal entity effective from',
    );
    const effectiveTo = legalEntityInput.effectiveTo
      ? safeInstant(legalEntityInput.effectiveTo, 'Legal entity effective to')
      : null;
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
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
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
        effectiveFrom,
        effectiveTo,
        revisionHash,
        createdAt,
        principal.userId,
        entityCommand.commandId,
      );
  }
  const effective = activeAtCut();
  if (effective.length === 0)
    throw new AccountingPackRevisionError(
      'No legal-entity revision is effective at the deterministic period cut (effective-date gap)',
    );
  if (effective.length > 1)
    throw new AccountingPackRevisionError(
      'Multiple legal-entity revisions overlap at the deterministic period cut',
    );
  if (rowValue<string>(effective[0], 'revision_id') !== revisionId)
    throw new AccountingPackRevisionError(
      'Requested legal-entity revision is not effective at the deterministic period cut',
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

type CanonicalReconciliation = Readonly<{
  checks: Readonly<{
    invoiceSources: boolean;
    payments: boolean;
    workerCosts: boolean;
    expenses: boolean;
    directCosts: boolean;
    contribution: boolean;
  }>;
  reconciles: boolean;
}>;

type SourceAuthorityCheck = Readonly<{
  mismatchCount: number;
  reasons: readonly string[];
  values: SnapshotValues;
}>;

/**
 * The canonical revision service is deliberately not a JSON copier.  The
 * legacy repository can provide a useful projection, but the projection is
 * not evidence by itself: every source-cut item must resolve to the
 * authoritative row that owns its identity/version.  This check runs before
 * the source cut and immutable snapshot are written, inside the caller's
 * immediate transaction.
 */
function validateAuthoritativeSourceItems(
  sqlite: DatabaseSync,
  sourceItems: readonly (AccountingPackSourceItemInput & {
    normalizedKind: string;
    normalizedSourceId: string;
    normalizedVersion: number;
    normalizedEffectiveAt: string;
    normalizedAmountMinor: bigint | null;
    normalizedCurrency: string;
  })[],
  periodStart: string,
  periodEnd: string,
  timezone: string,
  currency: string,
  scope: Readonly<{
    deployment: Deployment;
    legacyLegalEntityId: string;
    legalEntityRevisionId: string;
  }>,
): SourceAuthorityCheck {
  const reasons: string[] = [];
  const invoiceIds = new Set<string>();
  const paymentIds = new Set<string>();
  const paymentReversalIds = new Set<string>();
  const workerCostIds = new Set<string>();
  const expenseCostIds = new Set<string>();
  const declaredInvoiceIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'invoice')
      .map((item) => item.normalizedSourceId),
  );
  const declaredPaymentIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'payment')
      .map((item) => item.normalizedSourceId),
  );
  const declaredReversalIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'payment_reversal')
      .map((item) => item.normalizedSourceId),
  );
  const declaredTimeIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'time')
      .map((item) => item.normalizedSourceId),
  );
  const declaredExpenseIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'expense')
      .map((item) => item.normalizedSourceId),
  );
  const declaredCompensationIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'compensation')
      .map((item) => item.normalizedSourceId),
  );
  const declaredSettlementIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'compensation_settlement')
      .map((item) => item.normalizedSourceId),
  );
  const declaredDirectCostIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'direct_cost')
      .map((item) => item.normalizedSourceId),
  );
  let invoiceSourceCount = 0;
  let approvedTimeEntryCount = 0;
  let approvedExpenseCount = 0;
  let netMinor = 0n;
  let taxMinor = 0n;
  let grossMinor = 0n;
  let collectedMinor = 0n;
  let workerCostMinor = 0n;
  let expenseCostMinor = 0n;
  const localDateInTimezone = (instant: string, effectiveTimezone: string): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: effectiveTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
  };
  const effectiveAtMatchesAuthority = (declared: string, authoritativeDate: string): boolean => {
    // Date-only operational fields are already business-calendar facts. The
    // source-item contract carries them as UTC-midnight instants, so comparing
    // their ISO date avoids shifting the fact into the prior day in western
    // timezones.
    if (authoritativeDate.length === 10) return declared.slice(0, 10) === authoritativeDate;
    const parsed = new Date(authoritativeDate);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === declared;
  };
  const amountMatches = (
    expected: unknown,
    actual: bigint | null,
    monetarySource: boolean,
  ): boolean => {
    if (expected === null || expected === undefined) return !monetarySource && actual === null;
    if (actual === null || actual === undefined) return false;
    try {
      return BigInt(String(expected)) === actual;
    } catch {
      return false;
    }
  };
  const splitComposite = (value: string, parts: number): string[] | null => {
    const result: string[] = [];
    let cursor = 0;
    for (let index = 0; index < parts - 1; index += 1) {
      const separator = value.indexOf(':', cursor);
      if (separator <= cursor) return null;
      result.push(value.slice(cursor, separator));
      cursor = separator + 1;
    }
    if (cursor >= value.length) return null;
    result.push(value.slice(cursor));
    return result;
  };
  const rowFor = (sql: string, ...values: (string | number | bigint | null)[]): DbRow | undefined =>
    sqlite.prepare(sql).get(...values) as DbRow | undefined;
  const sourceTimezoneFor = (
    projectId: string | undefined,
    sourceTimezone?: string | null,
  ): string => {
    if (sourceTimezone !== undefined && sourceTimezone !== null)
      return safeTimezone(sourceTimezone);
    if (projectId) {
      const project = rowFor('SELECT timezone FROM project WHERE id=?', projectId);
      const projectTimezone = rowValue<unknown>(project, 'timezone');
      if (projectTimezone !== undefined && projectTimezone !== null)
        return safeTimezone(projectTimezone);
    }
    // Records without a project (for example a legacy adjustment whose parent
    // row has been removed) are still evaluated against the pack timezone. The
    // parent/source authority checks below will reject the missing identity.
    return timezone;
  };
  const sourceDateInPeriodFor = (
    value: string,
    projectId?: string,
    sourceTimezone?: string | null,
  ): boolean => {
    const date =
      value.length === 10
        ? value
        : localDateInTimezone(value, sourceTimezoneFor(projectId, sourceTimezone));
    return date >= periodStart && date <= periodEnd;
  };
  const sourceDateAtOrBeforePeriodEndFor = (
    value: string,
    projectId?: string,
    sourceTimezone?: string | null,
  ): boolean => {
    const date =
      value.length === 10
        ? value
        : localDateInTimezone(value, sourceTimezoneFor(projectId, sourceTimezone));
    return date <= periodEnd;
  };
  // Source completeness is an equality, not a caller-supplied count. Derive
  // the canonical invoice register for this entity/currency/period and reject
  // any omission even when the caller also forges internally balanced totals.
  const expectedInvoiceIds = new Set(
    (
      sqlite
        .prepare(
          `SELECT i.id,i.project_id,i.issued_at,i.tenant_id,i.deployment_id,i.legal_entity_revision_id
             FROM invoice i
             JOIN billing_rule br ON br.id=i.billing_rule_id
            WHERE i.currency=? AND br.legal_entity_id=?
              AND i.state IN ('issued','sent','partially_paid','paid','overdue')
              AND i.voided_at IS NULL AND i.issued_at IS NOT NULL`,
        )
        .all(currency, scope.legacyLegalEntityId) as DbRow[]
    )
      .filter((row) => {
        const tenantId = rowValue<string | null>(row, 'tenant_id');
        const deploymentId = rowValue<string | null>(row, 'deployment_id');
        const revisionId = rowValue<string | null>(row, 'legal_entity_revision_id');
        const issuedAt = rowValue<string>(row, 'issued_at');
        return (
          Boolean(
            issuedAt && sourceDateInPeriodFor(issuedAt, rowValue<string>(row, 'project_id')),
          ) &&
          (tenantId === null || tenantId === undefined || tenantId === scope.deployment.tenantId) &&
          (deploymentId === null ||
            deploymentId === undefined ||
            deploymentId === scope.deployment.deploymentId) &&
          (revisionId === null ||
            revisionId === undefined ||
            revisionId === scope.legalEntityRevisionId)
        );
      })
      .map((row) => rowValue<string>(row, 'id')!),
  );
  for (const invoiceId of expectedInvoiceIds)
    if (!declaredInvoiceIds.has(invoiceId))
      reasons.push(`invoice:${invoiceId}:omitted_from_source_cut`);
  for (const invoiceId of declaredInvoiceIds)
    if (!expectedInvoiceIds.has(invoiceId))
      reasons.push(`invoice:${invoiceId}:not_in_canonical_cut`);
  const declaredInvoiceSourceIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'invoice_source')
      .map((item) => item.normalizedSourceId),
  );
  const declaredManifestIds = new Set(
    sourceItems
      .filter((item) => item.normalizedKind.trim().toLowerCase() === 'commercial_manifest')
      .map((item) => item.normalizedSourceId),
  );
  for (const invoiceId of expectedInvoiceIds) {
    const persistedSources = sqlite
      .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
      .all(invoiceId) as DbRow[];
    for (const row of persistedSources) {
      const semanticId = `${invoiceId}:${rowValue<string>(row, 'source_type')}:${rowValue<string>(row, 'source_id')}`;
      if (!declaredInvoiceSourceIds.has(semanticId))
        reasons.push(`invoice_source:${semanticId}:omitted_from_source_cut`);
    }
    const persistedManifest = sqlite
      .prepare(
        'SELECT source_type,source_id FROM invoice_commercial_source_manifest WHERE invoice_id=?',
      )
      .all(invoiceId) as DbRow[];
    for (const row of persistedManifest) {
      const semanticId = `${invoiceId}:${rowValue<string>(row, 'source_type')}:${rowValue<string>(row, 'source_id')}`;
      if (!declaredManifestIds.has(semanticId))
        reasons.push(`commercial_manifest:${semanticId}:omitted_from_source_cut`);
    }
  }
  const invoiceIsInScope = (row: DbRow | undefined, reasonPrefix: string): boolean => {
    if (!row) return false;
    let valid = true;
    const state = rowValue<string>(row, 'state');
    if (!HISTORICAL_INVOICE_STATES.has(state ?? '') || rowValue(row, 'voided_at') !== null) {
      reasons.push(`${reasonPrefix}:parent_invoice_not_issued`);
      valid = false;
    }
    if (rowValue<string>(row, 'currency') !== currency) {
      reasons.push(`${reasonPrefix}:parent_invoice_currency_mismatch`);
      valid = false;
    }
    const tenantId = rowValue<string | null>(row, 'tenant_id');
    const deploymentId = rowValue<string | null>(row, 'deployment_id');
    if (tenantId !== null && tenantId !== undefined && tenantId !== scope.deployment.tenantId) {
      reasons.push(`${reasonPrefix}:parent_invoice_tenant_mismatch`);
      valid = false;
    }
    if (
      deploymentId !== null &&
      deploymentId !== undefined &&
      deploymentId !== scope.deployment.deploymentId
    ) {
      reasons.push(`${reasonPrefix}:parent_invoice_deployment_mismatch`);
      valid = false;
    }
    const revisionId = rowValue<string | null>(row, 'legal_entity_revision_id');
    const legacyEntityId = rowValue<string | null>(row, 'billing_legal_entity_id');
    // Both authority axes must agree. A matching canonical revision must
    // never mask a billing rule owned by another legacy entity. Historical
    // invoices without a canonical revision may use the reviewed legacy
    // bridge, but any persisted revision must match the point-in-time cut.
    if (
      legacyEntityId !== scope.legacyLegalEntityId ||
      (revisionId !== null && revisionId !== scope.legalEntityRevisionId)
    ) {
      reasons.push(`${reasonPrefix}:parent_invoice_legal_entity_mismatch`);
      valid = false;
    }
    return valid;
  };
  type OperationalSourceAuthority = Readonly<{
    projectId: string;
    projectCurrency: string;
    version: number;
    businessDate: string;
    sourceTimezone: string | null;
  }>;
  const operationalSourceAuthority = (
    sourceType: string,
    sourceId: string,
  ): { supported: boolean; row: OperationalSourceAuthority | undefined } => {
    let row: DbRow | undefined;
    if (sourceType === 'time')
      row = rowFor(
        `SELECT t.project_id,p.currency project_currency,t.version,t.work_date business_date,
                t.project_timezone source_timezone
           FROM time_entry t JOIN project p ON p.id=t.project_id WHERE t.id=?`,
        sourceId,
      );
    else if (sourceType === 'expense')
      row = rowFor(
        `SELECT e.project_id,p.currency project_currency,e.version,e.spent_on business_date
           FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
        sourceId,
      );
    else if (sourceType === 'milestone')
      row = rowFor(
        `SELECT m.project_id,p.currency project_currency,m.version,
                COALESCE(m.due_on,m.approved_at,m.created_at) business_date
           FROM project_milestone m JOIN project p ON p.id=m.project_id WHERE m.id=?`,
        sourceId,
      );
    else return { supported: false, row: undefined };
    if (!row) return { supported: true, row: undefined };
    return {
      supported: true,
      row: {
        projectId: rowValue<string>(row, 'project_id')!,
        projectCurrency: rowValue<string>(row, 'project_currency')!,
        version: rowValue<number>(row, 'version')!,
        businessDate: rowValue<string>(row, 'business_date')!,
        sourceTimezone: rowValue<string | null>(row, 'source_timezone') ?? null,
      },
    };
  };
  const projectLegalEntityMatches = (
    projectId: string,
    authoritativeDate: string,
    reasonPrefix: string,
    recordMismatch = true,
    sourceTimezone?: string | null,
  ): boolean => {
    const project = rowFor('SELECT timezone FROM project WHERE id=?', projectId);
    const effectiveTimezoneValue =
      sourceTimezone === undefined || sourceTimezone === null
        ? rowValue<unknown>(project, 'timezone')
        : sourceTimezone;
    let effectiveTimezone: string;
    try {
      effectiveTimezone = safeTimezone(effectiveTimezoneValue);
    } catch {
      if (recordMismatch) reasons.push(`${reasonPrefix}:project_timezone_invalid`);
      return false;
    }
    let businessDate: string;
    if (/^\d{4}-\d{2}-\d{2}$/u.test(authoritativeDate)) {
      try {
        businessDate = safeDate(authoritativeDate, 'Authoritative civil date');
      } catch {
        if (recordMismatch) reasons.push(`${reasonPrefix}:authoritative_date_invalid`);
        return false;
      }
    } else {
      const instant = new Date(authoritativeDate);
      if (Number.isNaN(instant.valueOf())) {
        if (recordMismatch) reasons.push(`${reasonPrefix}:authoritative_date_invalid`);
        return false;
      }
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: effectiveTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(instant);
        const values = new Map(parts.map((part) => [part.type, part.value]));
        businessDate = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
      } catch {
        if (recordMismatch) reasons.push(`${reasonPrefix}:project_timezone_invalid`);
        return false;
      }
    }
    const assignmentRows = sqlite
      .prepare(
        `SELECT legal_entity_revision_id
           FROM project_legal_entity_assignment
          WHERE project_id=? AND tenant_id=? AND deployment_id=?
            AND substr(effective_from,1,10)<=?
            AND (effective_to IS NULL OR substr(effective_to,1,10)>=?)`,
      )
      .all(
        projectId,
        scope.deployment.tenantId,
        scope.deployment.deploymentId,
        businessDate,
        businessDate,
      ) as DbRow[];
    const projectHasCanonicalHistory = Boolean(
      rowFor(
        `SELECT 1 present FROM project_legal_entity_assignment
          WHERE project_id=? AND tenant_id=? AND deployment_id=? LIMIT 1`,
        projectId,
        scope.deployment.tenantId,
        scope.deployment.deploymentId,
      ),
    );
    if (projectHasCanonicalHistory) {
      const matches =
        assignmentRows.length === 1 &&
        rowValue<string>(assignmentRows[0], 'legal_entity_revision_id') ===
          scope.legalEntityRevisionId;
      if (!matches && recordMismatch) reasons.push(`${reasonPrefix}:project_legal_entity_mismatch`);
      return matches;
    }
    // Historical projects may predate canonical assignments. The reviewed
    // bridge remains valid only when every effective legacy billing rule for
    // the project resolves to this pack's legacy entity; a second EUR entity
    // must never be accepted merely because currency happens to match.
    const legacyRows = sqlite
      .prepare(
        `SELECT DISTINCT legal_entity_id FROM billing_rule
          WHERE project_id=? AND enabled=1 AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>=?)`,
      )
      .all(projectId, businessDate, businessDate) as DbRow[];
    const matches =
      legacyRows.length > 0 &&
      legacyRows.every(
        (row) => rowValue<string>(row, 'legal_entity_id') === scope.legacyLegalEntityId,
      );
    if (!matches && recordMismatch)
      reasons.push(`${reasonPrefix}:project_legacy_legal_entity_mismatch`);
    return matches;
  };
  const validateOperationalSource = (
    sourceType: string,
    sourceId: string,
    invoiceProjectId: string | undefined,
    recordedVersion: number | null | undefined,
    reasonPrefix: string,
  ): OperationalSourceAuthority | undefined => {
    const authority = operationalSourceAuthority(sourceType, sourceId);
    if (!authority.supported) return undefined;
    // Issued links may legitimately outlive an operational row; their locked
    // source hash remains immutable authority. When the operational row still
    // exists, however, its project, currency and version are authoritative and
    // must agree with the issued link.
    if (!authority.row) return undefined;
    let valid = true;
    if (authority.row.projectId !== invoiceProjectId) {
      reasons.push(`${reasonPrefix}:source_project_mismatch`);
      valid = false;
    }
    if (authority.row.projectCurrency !== currency) {
      reasons.push(`${reasonPrefix}:source_project_currency_mismatch`);
      valid = false;
    }
    if (recordedVersion === null || recordedVersion === undefined) {
      reasons.push(`${reasonPrefix}:missing_operational_source_version`);
      valid = false;
    } else if (recordedVersion !== authority.row.version) {
      reasons.push(`${reasonPrefix}:operational_version_mismatch`);
      valid = false;
    }
    if (
      !projectLegalEntityMatches(
        authority.row.projectId,
        authority.row.businessDate,
        reasonPrefix,
        true,
        authority.row.sourceTimezone,
      )
    )
      valid = false;
    return valid ? authority.row : undefined;
  };

  // Resolve the legacy entity that owns a source at its project-local civil
  // date.  The producer includes this segment in worker-cost identities so a
  // project reassignment cannot merge two point-in-time accounting scopes.
  // A missing canonical assignment is only bridged when the historical
  // billing rules unambiguously identify one legacy entity; otherwise the
  // source remains explicitly `unassigned` and cannot become authoritative.
  const projectLegalEntityIdAt = (
    projectId: string,
    authoritativeDate: string,
    sourceTimezone?: string | null,
  ): string | null => {
    const project = rowFor('SELECT timezone FROM project WHERE id=?', projectId);
    const effectiveTimezoneValue =
      sourceTimezone === undefined || sourceTimezone === null
        ? rowValue<unknown>(project, 'timezone')
        : sourceTimezone;
    let effectiveTimezone: string;
    try {
      effectiveTimezone = safeTimezone(effectiveTimezoneValue);
    } catch {
      return null;
    }
    let businessDate: string;
    if (/^\d{4}-\d{2}-\d{2}$/u.test(authoritativeDate)) {
      try {
        businessDate = safeDate(authoritativeDate, 'Source civil date');
      } catch {
        return null;
      }
    } else {
      try {
        businessDate = localDateInTimezone(authoritativeDate, effectiveTimezone);
      } catch {
        return null;
      }
    }
    const assignmentRows = sqlite
      .prepare(
        `SELECT bridge.legacy_legal_entity_id
           FROM project_legal_entity_assignment assignment
           JOIN legal_entity_revision_bridge bridge
             ON bridge.canonical_revision_id=assignment.legal_entity_revision_id
            AND bridge.tenant_id=assignment.tenant_id
            AND bridge.deployment_id=assignment.deployment_id
          WHERE assignment.project_id=? AND assignment.tenant_id=? AND assignment.deployment_id=?
            AND substr(assignment.effective_from,1,10)<=?
            AND (assignment.effective_to IS NULL OR substr(assignment.effective_to,1,10)>=?)
          ORDER BY assignment.effective_from DESC,assignment.assignment_id DESC`,
      )
      .all(
        projectId,
        scope.deployment.tenantId,
        scope.deployment.deploymentId,
        businessDate,
        businessDate,
      ) as DbRow[];
    if (assignmentRows.length === 1)
      return rowValue<string>(assignmentRows[0], 'legacy_legal_entity_id') ?? null;
    if (assignmentRows.length > 1) return null;
    const projectHasCanonicalHistory = Boolean(
      rowFor(
        `SELECT 1 FROM project_legal_entity_assignment
          WHERE project_id=? AND tenant_id=? AND deployment_id=? LIMIT 1`,
        projectId,
        scope.deployment.tenantId,
        scope.deployment.deploymentId,
      ),
    );
    if (projectHasCanonicalHistory) return null;
    const legacyRows = sqlite
      .prepare(
        `SELECT DISTINCT legal_entity_id
           FROM billing_rule
          WHERE project_id=? AND enabled=1 AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>=?)`,
      )
      .all(projectId, businessDate, businessDate) as DbRow[];
    return legacyRows.length === 1
      ? (rowValue<string>(legacyRows[0], 'legal_entity_id') ?? null)
      : null;
  };

  const canonicalCommercialSourceHash = (
    invoiceId: string,
    sourceType: string,
    sourceId: string,
    sourceVersion: number,
  ): string => {
    const lineSourceType = sourceType === 'minimum_top_up' ? 'billing_adjustment' : sourceType;
    const snapshots = (
      sqlite
        .prepare(
          `SELECT snapshot_json
             FROM invoice_line
            WHERE invoice_id=? AND source_type=? AND source_id=?
            ORDER BY rowid`,
        )
        .all(invoiceId, lineSourceType, sourceId) as Array<{ snapshot_json: string }>
    ).map((line) => line.snapshot_json);
    // Keep this byte-for-byte compatible with rebuildInvoiceCommercialManifest:
    // ordinary sources bind identity, version and the exact stored line snapshots;
    // synthetic fixed-price/minimum rows bind the exact snapshot byte sequence.
    return sourceType === 'fixed_price' || sourceType === 'minimum_top_up'
      ? sha256(snapshots.join('\n'))
      : sha256(
          JSON.stringify({
            sourceType,
            sourceId,
            sourceVersion,
            snapshots,
          }),
        );
  };

  const canonicalLineAllocation = (
    invoiceId: string,
    sourceType: string,
    sourceId: string,
  ): Readonly<{ count: number; net: bigint; tax: bigint; gross: bigint }> => {
    const lineSourceType = sourceType === 'minimum_top_up' ? 'billing_adjustment' : sourceType;
    const row = rowFor(
      `SELECT COUNT(*) line_count,
              CAST(COALESCE(SUM(subtotal_minor),0) AS TEXT) net_minor,
              CAST(COALESCE(SUM(COALESCE(tax_amount_minor,tax_minor,0)),0) AS TEXT) tax_minor,
              CAST(COALESCE(SUM(COALESCE(gross_amount_minor,
                   subtotal_minor+COALESCE(tax_amount_minor,tax_minor,0))),0) AS TEXT) gross_minor
         FROM invoice_line
        WHERE invoice_id=? AND source_type=? AND source_id=?`,
      invoiceId,
      lineSourceType,
      sourceId,
    );
    return {
      count: rowValue<number>(row, 'line_count') ?? 0,
      net: BigInt(rowValue<string>(row, 'net_minor') ?? '0'),
      tax: BigInt(rowValue<string>(row, 'tax_minor') ?? '0'),
      gross: BigInt(rowValue<string>(row, 'gross_minor') ?? '0'),
    };
  };

  const assertCanonicalSourceHash = (
    kind: 'invoice_source' | 'commercial_manifest',
    sourceSemanticId: string,
    invoiceId: string,
    sourceType: string,
    sourceId: string,
    sourceVersion: number | null | undefined,
    persistedHash: string | null | undefined,
    payload: Readonly<Record<string, unknown>>,
  ): boolean => {
    if (!persistedHash || sourceVersion === null || sourceVersion === undefined) return false;
    const canonicalHash = canonicalCommercialSourceHash(
      invoiceId,
      sourceType,
      sourceId,
      sourceVersion,
    );
    let valid = true;
    if (persistedHash !== canonicalHash) {
      reasons.push(`${kind}:${sourceSemanticId}:source_hash_mismatch`);
      valid = false;
    }
    const assertedHash = payload.sourceHash ?? payload.source_hash;
    if (assertedHash !== undefined && assertedHash !== canonicalHash) {
      reasons.push(`${kind}:${sourceSemanticId}:payload_source_hash_mismatch`);
      valid = false;
    }
    return valid;
  };

  type TimeAuthorityRow = Readonly<{
    id?: string;
    version: number;
    worker_id: string;
    project_id: string;
    category: string;
    activity_code: string | null;
    work_date: string;
    minutes: number;
    approval_state: string;
    project_currency: string;
    source_timezone?: string | null;
    legal_entity_id?: string | null;
    billability_state?: string;
    compensation_amount_minor?: string | null;
  }>;
  type InternalCostRow = Readonly<{
    id: string;
    currency: string;
    hourly_rate_minor: string;
    overtime_method: OvertimeMethod | null;
    overtime_multiplier_bps: number | null;
    overtime_rate_minor: string | null;
  }>;
  const internalCostFor = (row: TimeAuthorityRow): InternalCostRow | undefined => {
    const assignment = rowFor(
      `SELECT id FROM project_member
        WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=?
          AND (ends_on IS NULL OR ends_on>=?)
        ORDER BY starts_on DESC LIMIT 1`,
      row.project_id,
      row.worker_id,
      row.work_date,
      row.work_date,
    );
    if (assignment) {
      const override = rowFor(
        `SELECT internal_cost_rule_id FROM assignment_rate_override
          WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
            AND (activity_code=? OR activity_code IS NULL)
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY (time_category IS NOT NULL) DESC,(activity_code IS NOT NULL) DESC,
                   priority DESC,effective_from DESC,id DESC LIMIT 1`,
        rowValue<string>(assignment, 'id')!,
        row.category,
        row.activity_code,
        row.work_date,
        row.work_date,
      );
      const ruleId = rowValue<string | null>(override, 'internal_cost_rule_id');
      if (ruleId) {
        const rule = rowFor(
          `SELECT id,currency,CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,
                  overtime_method,overtime_multiplier_bps,
                  CAST(overtime_rate_minor AS TEXT) overtime_rate_minor
             FROM internal_cost_rule
            WHERE id=? AND worker_id=? AND (project_id=? OR project_id IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          `,
          ruleId,
          row.worker_id,
          row.project_id,
          row.work_date,
          row.work_date,
        ) as InternalCostRow | undefined;
        if (rule) return rule;
      }
    }
    return rowFor(
      `SELECT id,currency,CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,
              overtime_method,overtime_multiplier_bps,
              CAST(overtime_rate_minor AS TEXT) overtime_rate_minor
         FROM internal_cost_rule
        WHERE worker_id=? AND (project_id=? OR project_id IS NULL)
          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
        ORDER BY (project_id IS NOT NULL) DESC,effective_from DESC,id DESC LIMIT 1`,
      row.worker_id,
      row.project_id,
      row.work_date,
      row.work_date,
    ) as InternalCostRow | undefined;
  };
  const authoritativeTimeCost = (row: TimeAuthorityRow): bigint | null => {
    const rule = internalCostFor(row);
    if (!rule || rule.currency !== row.project_currency) return null;
    const base = BigInt(rule.hourly_rate_minor);
    const effectiveRate =
      row.category === 'overtime'
        ? overtimeRate(base, rule.overtime_method ?? 'NONE', {
            multiplierBps: rule.overtime_multiplier_bps ?? undefined,
            fixedRateMinor:
              rule.overtime_method === 'FIXED_RATE' && rule.overtime_rate_minor !== null
                ? BigInt(rule.overtime_rate_minor)
                : undefined,
            fixedAdditionMinor:
              rule.overtime_method === 'FIXED_ADDITION_PER_HOUR' &&
              rule.overtime_rate_minor !== null
                ? BigInt(rule.overtime_rate_minor)
                : undefined,
          })
        : base;
    return hourlyRateForMinutes(money(row.project_currency as Currency, effectiveRate), row.minutes)
      .minorUnits;
  };
  const compensationRuleFor = (row: TimeAuthorityRow): DbRow | undefined => {
    const assignment = rowFor(
      `SELECT id FROM project_member
        WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=?
          AND (ends_on IS NULL OR ends_on>=?)
        ORDER BY starts_on DESC LIMIT 1`,
      row.project_id,
      row.worker_id,
      row.work_date,
      row.work_date,
    );
    if (assignment) {
      const override = rowFor(
        `SELECT compensation_rule_id FROM assignment_rate_override
          WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
            AND (activity_code=? OR activity_code IS NULL)
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY (time_category IS NOT NULL) DESC,(activity_code IS NOT NULL) DESC,
                   priority DESC,effective_from DESC,id DESC LIMIT 1`,
        rowValue<string>(assignment, 'id')!,
        row.category,
        row.activity_code,
        row.work_date,
        row.work_date,
      );
      const ruleId = rowValue<string | null>(override, 'compensation_rule_id');
      if (ruleId) {
        const rule = rowFor(
          `SELECT *,CAST(rate_minor AS TEXT) rate_minor_text,
                  CAST(overtime_rate_minor AS TEXT) overtime_rate_minor_text
             FROM compensation_rule
             WHERE id=? AND worker_id=? AND (project_id=? OR project_id IS NULL)
               AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,
          ruleId,
          row.worker_id,
          row.project_id,
          row.work_date,
          row.work_date,
        );
        if (rule) return rule;
      }
    }
    return rowFor(
      `SELECT *,CAST(rate_minor AS TEXT) rate_minor_text,
              CAST(overtime_rate_minor AS TEXT) overtime_rate_minor_text
         FROM compensation_rule
         WHERE worker_id=? AND (project_id=? OR project_id IS NULL)
           AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
        ORDER BY (project_id IS NOT NULL) DESC,effective_from DESC,id DESC LIMIT 1`,
      row.worker_id,
      row.project_id,
      row.work_date,
      row.work_date,
    );
  };
  const compensationAmountFor = (row: TimeAuthorityRow): bigint | null => {
    const persisted = rowValue<string | null>(row, 'compensation_amount_minor');
    if (persisted !== null && persisted !== undefined) return BigInt(persisted);
    const rule = compensationRuleFor(row);
    if (!rule) return null;
    const ruleCurrency = rowValue<string>(rule, 'currency');
    if (ruleCurrency !== row.project_currency) return null;
    const ruleType = rowValue<string>(rule, 'rule_type') ?? 'Hourly';
    const rateBasis = rowValue<string>(rule, 'rate_basis') ?? 'hourly';
    if (
      ruleType === 'Daily' ||
      rateBasis === 'daily' ||
      ruleType === 'FixedPerBillingPeriod' ||
      ruleType === 'FixedProjectAmount' ||
      ruleType === 'CustomApprovedAdjustment'
    )
      return 0n;
    if (ruleType === 'PercentageOfEligibleClientLabor') {
      if (row.billability_state === 'non_billable') return 0n;
      const clientRate = rowFor(
        `SELECT CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,eligible_for_percentage,
                overtime_method,overtime_multiplier_bps,
                CAST(overtime_rate_minor AS TEXT) overtime_rate_minor
           FROM client_labor_rate
          WHERE project_id=? AND (worker_id=? OR worker_id IS NULL)
            AND (category=? OR category IS NULL)
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY (worker_id IS NOT NULL) DESC,(category IS NOT NULL) DESC,
                   effective_from DESC,id DESC LIMIT 1`,
        row.project_id,
        row.worker_id,
        row.category,
        row.work_date,
        row.work_date,
      );
      if (!clientRate || rowValue<number>(clientRate, 'eligible_for_percentage') !== 1) return 0n;
      const clientBase = BigInt(rowValue<string>(clientRate, 'hourly_rate_minor') ?? '0');
      const clientEffectiveRate =
        row.category === 'overtime'
          ? overtimeRate(
              clientBase,
              rowValue<OvertimeMethod>(clientRate, 'overtime_method') ?? 'NONE',
              {
                multiplierBps: rowValue<number>(clientRate, 'overtime_multiplier_bps') ?? undefined,
                fixedRateMinor:
                  rowValue<OvertimeMethod>(clientRate, 'overtime_method') === 'FIXED_RATE'
                    ? BigInt(rowValue<string>(clientRate, 'overtime_rate_minor') ?? '0')
                    : undefined,
                fixedAdditionMinor:
                  rowValue<OvertimeMethod>(clientRate, 'overtime_method') ===
                  'FIXED_ADDITION_PER_HOUR'
                    ? BigInt(rowValue<string>(clientRate, 'overtime_rate_minor') ?? '0')
                    : undefined,
              },
            )
          : clientBase;
      const clientAmount = hourlyRateForMinutes(
        money(row.project_currency as Currency, clientEffectiveRate),
        row.minutes,
      ).minorUnits;
      return applyBasisPoints(
        money(row.project_currency as Currency, clientAmount),
        rowValue<number>(rule, 'percentage_bps') ?? 0,
      ).minorUnits;
    }
    let rate = BigInt(rowValue<string>(rule, 'rate_minor_text') ?? '0');
    if (row.category === 'overtime')
      rate = overtimeRate(rate, rowValue<OvertimeMethod>(rule, 'overtime_method') ?? 'NONE', {
        multiplierBps: rowValue<number>(rule, 'overtime_multiplier_bps') ?? undefined,
        fixedRateMinor:
          rowValue<OvertimeMethod>(rule, 'overtime_method') === 'FIXED_RATE'
            ? BigInt(rowValue<string>(rule, 'overtime_rate_minor_text') ?? '0')
            : undefined,
        fixedAdditionMinor:
          rowValue<OvertimeMethod>(rule, 'overtime_method') === 'FIXED_ADDITION_PER_HOUR'
            ? BigInt(rowValue<string>(rule, 'overtime_rate_minor_text') ?? '0')
            : undefined,
      });
    const modifier =
      row.category === 'travel'
        ? rowValue<OvertimeMethod>(rule, 'travel_method')
        : row.category === 'standby'
          ? rowValue<OvertimeMethod>(rule, 'standby_method')
          : [0, 6].includes(new Date(`${row.work_date}T00:00:00.000Z`).getUTCDay())
            ? rowValue<OvertimeMethod>(rule, 'weekend_method')
            : 'BASE';
    if (modifier === 'NONE') return 0n;
    if (modifier && modifier !== 'BASE')
      rate = overtimeRate(rate, modifier, {
        multiplierBps: rowValue<number>(rule, 'overtime_multiplier_bps') ?? undefined,
        fixedRateMinor:
          modifier === 'FIXED_RATE'
            ? BigInt(rowValue<string>(rule, 'overtime_rate_minor_text') ?? '0')
            : undefined,
        fixedAdditionMinor:
          modifier === 'FIXED_ADDITION_PER_HOUR'
            ? BigInt(rowValue<string>(rule, 'overtime_rate_minor_text') ?? '0')
            : undefined,
      });
    return hourlyRateForMinutes(money(row.project_currency as Currency, rate), row.minutes)
      .minorUnits;
  };

  const canonicalTimeRows = (
    sqlite
      .prepare(
        `SELECT t.id,t.version,t.worker_id,t.project_id,t.category,t.activity_code,t.work_date,
                t.minutes,t.approval_state,t.billability_state,
                CAST(t.compensation_amount_minor AS TEXT) compensation_amount_minor,
                t.project_timezone source_timezone,p.currency project_currency
           FROM time_entry t JOIN project p ON p.id=t.project_id
          WHERE t.work_date BETWEEN ? AND ?
            AND t.approval_state IN ('approved','locked','final')`,
      )
      .all(periodStart, periodEnd) as TimeAuthorityRow[]
  )
    .map((row) => ({
      ...row,
      legal_entity_id: projectLegalEntityIdAt(row.project_id, row.work_date, row.source_timezone),
    }))
    .filter(
      (row) =>
        row.project_currency === currency &&
        row.legal_entity_id === scope.legacyLegalEntityId &&
        projectLegalEntityMatches(
          row.project_id,
          row.work_date,
          `time:${row.id ?? ''}`,
          false,
          row.source_timezone,
        ),
    );
  const expectedTimeIds = new Set(canonicalTimeRows.map((row) => row.id!).filter(Boolean));
  const canonicalTimeGroups = new Map<string, TimeAuthorityRow[]>();
  for (const row of canonicalTimeRows) {
    const identity = `${row.worker_id}:${row.project_id}:${row.legal_entity_id ?? 'unassigned'}`;
    const group = canonicalTimeGroups.get(identity) ?? [];
    group.push(row);
    canonicalTimeGroups.set(identity, group);
  }
  const resolveCanonicalTimeGroup = (
    assertedIdentity: string,
  ): Readonly<{
    identity: string;
    workerId: string | undefined;
    projectId: string | undefined;
    legalEntityId: string | undefined;
    rows: readonly TimeAuthorityRow[];
  }> => {
    const direct = canonicalTimeGroups.has(assertedIdentity) ? assertedIdentity : undefined;
    const matches = direct
      ? [direct]
      : [...canonicalTimeGroups.keys()].filter((candidate) =>
          candidate.startsWith(`${assertedIdentity}:`),
        );
    if (matches.length !== 1)
      return {
        identity: assertedIdentity,
        workerId: undefined,
        projectId: undefined,
        legalEntityId: undefined,
        rows: [],
      };
    const identity = matches[0]!;
    const [workerId, projectId, legalEntityId] = splitComposite(identity, 3) ?? [];
    return {
      identity,
      workerId,
      projectId,
      legalEntityId,
      rows: canonicalTimeGroups.get(identity) ?? [],
    };
  };
  const expectedCompensationIds = new Set<string>();
  const expectedLaborDirectCostIds = new Set<string>();
  for (const [identity, rows] of canonicalTimeGroups) {
    if (rows.some((row) => compensationAmountFor(row) !== null))
      expectedCompensationIds.add(identity);
    if (rows.some((row) => authoritativeTimeCost(row) !== null))
      expectedLaborDirectCostIds.add(`labor:${identity}`);
  }
  const canonicalExpenseRows = (
    sqlite
      .prepare(
        `SELECT e.id,e.project_id,e.spent_on,e.approval_state,e.who_paid,
                COALESCE(e.billing_treatment,e.client_treatment) treatment,p.currency project_currency
           FROM expense e JOIN project p ON p.id=e.project_id
          WHERE e.spent_on BETWEEN ? AND ?
            AND e.approval_state IN ('approved','locked','final')`,
      )
      .all(periodStart, periodEnd) as DbRow[]
  ).filter(
    (row) =>
      rowValue<string>(row, 'project_currency') === currency &&
      projectLegalEntityMatches(
        rowValue<string>(row, 'project_id')!,
        rowValue<string>(row, 'spent_on')!,
        `expense:${rowValue<string>(row, 'id') ?? ''}`,
        false,
      ),
  );
  const expectedExpenseIds = new Set(
    canonicalExpenseRows.map((row) => rowValue<string>(row, 'id')!).filter(Boolean),
  );
  const expectedExpenseDirectCostIds = new Set(
    canonicalExpenseRows
      .filter(
        (row) =>
          rowValue<string>(row, 'who_paid') !== 'client' &&
          rowValue<string>(row, 'treatment') !== 'client_direct',
      )
      .map((row) => `expense:${rowValue<string>(row, 'id')!}`),
  );
  const expectedDirectCostIds = new Set([
    ...expectedLaborDirectCostIds,
    ...expectedExpenseDirectCostIds,
  ]);
  const resolveEntityAwareIdentity = (
    kind: string,
    sourceId: string,
    expected: ReadonlySet<string>,
  ): string => {
    if (expected.has(sourceId)) return sourceId;
    // Older callers used worker:project and labor:worker:project. Preserve
    // that bridge only when it identifies one and only one point-in-time
    // entity segment. The canonical producer uses the entity-aware form.
    if (kind === 'compensation' || (kind === 'direct_cost' && sourceId.startsWith('labor:'))) {
      const matches = [...expected].filter((candidate) => candidate.startsWith(`${sourceId}:`));
      if (matches.length === 1) return matches[0]!;
    }
    return sourceId;
  };
  const canonicalDeclaredCompensationIds = new Set(
    [...declaredCompensationIds].map((sourceId) =>
      resolveEntityAwareIdentity('compensation', sourceId, expectedCompensationIds),
    ),
  );
  const canonicalDeclaredDirectCostIds = new Set(
    [...declaredDirectCostIds].map((sourceId) =>
      resolveEntityAwareIdentity('direct_cost', sourceId, expectedDirectCostIds),
    ),
  );
  const expectedSettlementIds = new Set(
    (
      sqlite
        .prepare(
          `SELECT id,project_id,period_end,currency
             FROM compensation_settlement
            WHERE period_start=? AND period_end=? AND state IN ('approved','settled')`,
        )
        .all(periodStart, periodEnd) as DbRow[]
    )
      .filter(
        (row) =>
          rowValue<string>(row, 'currency') === currency &&
          projectLegalEntityMatches(
            rowValue<string>(row, 'project_id')!,
            rowValue<string>(row, 'period_end')!,
            `compensation_settlement:${rowValue<string>(row, 'id') ?? ''}`,
            false,
          ),
      )
      .map((row) => rowValue<string>(row, 'id')!),
  );

  const requireExactCanonicalIdentities = (
    kind: string,
    expected: ReadonlySet<string>,
    declared: ReadonlySet<string>,
  ): void => {
    for (const id of expected)
      if (!declared.has(id)) reasons.push(`${kind}:${id}:omitted_from_source_cut`);
    for (const id of declared)
      if (!expected.has(id)) reasons.push(`${kind}:${id}:unexpected_in_source_cut`);
  };
  requireExactCanonicalIdentities('time', expectedTimeIds, declaredTimeIds);
  requireExactCanonicalIdentities('expense', expectedExpenseIds, declaredExpenseIds);
  requireExactCanonicalIdentities(
    'compensation',
    expectedCompensationIds,
    canonicalDeclaredCompensationIds,
  );
  requireExactCanonicalIdentities(
    'compensation_settlement',
    expectedSettlementIds,
    declaredSettlementIds,
  );
  requireExactCanonicalIdentities(
    'direct_cost',
    expectedDirectCostIds,
    canonicalDeclaredDirectCostIds,
  );

  for (const item of sourceItems) {
    const kind = item.normalizedKind.trim().toLowerCase();
    const sourceId = item.normalizedSourceId;
    let authoritative = false;
    let expectedVersion: number | undefined;
    let expectedAmount: unknown;
    let expectedCurrency: string | undefined;
    let sourceDate: string | undefined;
    let sourceProjectId: string | undefined;
    let sourceTimezone: string | null | undefined;
    let canonicalPayload: unknown = null;

    try {
      if (kind === 'invoice') {
        const row = rowFor(
          `SELECT i.version,CAST(i.subtotal_minor AS TEXT) subtotal_minor,
                  CAST(i.tax_minor AS TEXT) tax_minor,CAST(i.total_minor AS TEXT) total_minor,
                  i.currency,i.state,
                  i.voided_at,i.issued_at,i.created_at,i.project_id,i.tenant_id,i.deployment_id,
                  i.legal_entity_revision_id,br.legal_entity_id billing_legal_entity_id
             FROM invoice i LEFT JOIN billing_rule br ON br.id=i.billing_rule_id WHERE i.id=?`,
          sourceId,
        );
        const state = rowValue<string>(row, 'state');
        const voidedAt = rowValue<string | null>(row, 'voided_at');
        authoritative =
          Boolean(row) &&
          HISTORICAL_INVOICE_STATES.has(state ?? '') &&
          voidedAt === null &&
          invoiceIsInScope(row, `${kind}:${sourceId}`) &&
          projectLegalEntityMatches(
            rowValue<string>(row, 'project_id') ?? '',
            rowValue<string>(row, 'issued_at') ?? periodEnd,
            `${kind}:${sourceId}`,
          );
        if (row && !authoritative) reasons.push(`${kind}:${sourceId}:invoice_not_issued`);
        expectedVersion = rowValue<number>(row, 'version');
        expectedAmount = rowValue<string>(row, 'subtotal_minor');
        expectedCurrency = rowValue<string>(row, 'currency');
        sourceDate = rowValue<string>(row, 'issued_at') ?? rowValue<string>(row, 'created_at');
        sourceProjectId = rowValue<string>(row, 'project_id');
        if (authoritative && !invoiceIds.has(sourceId)) {
          invoiceIds.add(sourceId);
          netMinor += BigInt(rowValue<string>(row, 'subtotal_minor') ?? '0');
          taxMinor += BigInt(rowValue<string>(row, 'tax_minor') ?? '0');
          grossMinor += BigInt(rowValue<string>(row, 'total_minor') ?? '0');
        }
      } else if (kind === 'time') {
        const row = rowFor(
          `SELECT t.version,t.worker_id,t.project_id,t.category,t.activity_code,t.work_date,
                  t.minutes,t.approval_state,t.project_timezone source_timezone,p.currency project_currency
             FROM time_entry t JOIN project p ON p.id=t.project_id WHERE t.id=?`,
          sourceId,
        ) as TimeAuthorityRow | undefined;
        authoritative =
          Boolean(row) &&
          projectLegalEntityMatches(
            row?.project_id ?? '',
            row?.work_date ?? periodEnd,
            `${kind}:${sourceId}`,
          );
        expectedVersion = row?.version;
        expectedCurrency = row?.project_currency;
        sourceDate = row?.work_date;
        sourceProjectId = row?.project_id;
        sourceTimezone = row?.source_timezone;
        if (row) {
          approvedTimeEntryCount += 1;
          if (!['approved', 'locked'].includes(row.approval_state))
            reasons.push(`${kind}:${sourceId}:time_not_approved`);
          const laborDirectCostId = `labor:${row.worker_id}:${row.project_id}:${row.legal_entity_id ?? 'unassigned'}`;
          if (
            expectedLaborDirectCostIds.has(laborDirectCostId) &&
            authoritativeTimeCost(row) === null
          )
            reasons.push(`${kind}:${sourceId}:missing_internal_cost`);
        }
      } else if (kind === 'expense') {
        const row = rowFor(
          `SELECT e.version,e.project_id,p.currency project_currency,
                  CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                  CAST(e.amount_minor AS TEXT) amount_minor,e.currency,e.spent_on,e.approval_state
             FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
          sourceId,
        );
        const approvalState = rowValue<string>(row, 'approval_state');
        authoritative =
          Boolean(row) &&
          AUTHORITATIVE_APPROVAL_STATES.has(approvalState ?? '') &&
          projectLegalEntityMatches(
            rowValue<string>(row, 'project_id') ?? '',
            rowValue<string>(row, 'spent_on') ?? periodEnd,
            `${kind}:${sourceId}`,
          );
        if (row && !authoritative) reasons.push(`${kind}:${sourceId}:expense_not_approved`);
        expectedVersion = rowValue<number>(row, 'version');
        const projectCurrency = rowValue<string>(row, 'project_currency');
        const originalCurrency = rowValue<string>(row, 'currency');
        const converted = rowValue<string | null>(row, 'project_currency_amount_minor');
        if (converted === null && projectCurrency !== originalCurrency)
          reasons.push(`${kind}:${sourceId}:missing_project_currency_amount`);
        expectedAmount =
          converted ??
          (projectCurrency === originalCurrency
            ? rowValue<string>(row, 'amount_minor')
            : undefined);
        expectedCurrency = projectCurrency;
        sourceDate = rowValue<string>(row, 'spent_on');
        sourceProjectId = rowValue<string>(row, 'project_id');
        approvedExpenseCount += authoritative ? 1 : 0;
      } else if (kind === 'payment') {
        const row = rowFor(
          `SELECT CAST(p.amount_minor AS TEXT) amount_minor,p.currency,p.received_at,p.invoice_id,p.tenant_id,p.deployment_id,
                  p.legal_entity_revision_id,i.project_id,i.state,i.voided_at,i.issued_at,
                  i.currency invoice_currency,
                  i.tenant_id invoice_tenant_id,i.deployment_id invoice_deployment_id,
                  i.legal_entity_revision_id invoice_legal_entity_revision_id,
                  br.legal_entity_id billing_legal_entity_id
             FROM payment p JOIN invoice i ON i.id=p.invoice_id
             LEFT JOIN billing_rule br ON br.id=i.billing_rule_id WHERE p.id=?`,
          sourceId,
        );
        const invoiceId = rowValue<string>(row, 'invoice_id');
        if (row && !declaredInvoiceIds.has(invoiceId ?? ''))
          reasons.push(`${kind}:${sourceId}:invoice_not_in_pack`);
        if (row && rowValue<string>(row, 'received_at')! < rowValue<string>(row, 'issued_at')!)
          reasons.push(`${kind}:${sourceId}:payment_before_invoice_issuance`);
        const invoiceScopeRow = row
          ? {
              ...row,
              currency: row.invoice_currency,
              tenant_id: row.invoice_tenant_id,
              deployment_id: row.invoice_deployment_id,
              legal_entity_revision_id: row.invoice_legal_entity_revision_id,
            }
          : undefined;
        if (
          row &&
          ((rowValue<string | null>(row, 'tenant_id') !== null &&
            rowValue<string | null>(row, 'tenant_id') !== scope.deployment.tenantId) ||
            (rowValue<string | null>(row, 'deployment_id') !== null &&
              rowValue<string | null>(row, 'deployment_id') !== scope.deployment.deploymentId) ||
            (rowValue<string | null>(row, 'legal_entity_revision_id') !== null &&
              rowValue<string | null>(row, 'legal_entity_revision_id') !==
                scope.legalEntityRevisionId))
        )
          reasons.push(`${kind}:${sourceId}:payment_scope_mismatch`);
        const paymentScopeMatches =
          !row ||
          ((rowValue<string | null>(row, 'tenant_id') === null ||
            rowValue<string | null>(row, 'tenant_id') === scope.deployment.tenantId) &&
            (rowValue<string | null>(row, 'deployment_id') === null ||
              rowValue<string | null>(row, 'deployment_id') === scope.deployment.deploymentId) &&
            (rowValue<string | null>(row, 'legal_entity_revision_id') === null ||
              rowValue<string | null>(row, 'legal_entity_revision_id') ===
                scope.legalEntityRevisionId));
        authoritative =
          Boolean(row) &&
          declaredInvoiceIds.has(invoiceId ?? '') &&
          rowValue<string>(row, 'received_at')! >= rowValue<string>(row, 'issued_at')! &&
          paymentScopeMatches &&
          invoiceIsInScope(invoiceScopeRow, `${kind}:${sourceId}`);
        expectedVersion = 1;
        expectedAmount = rowValue<string>(row, 'amount_minor');
        expectedCurrency = rowValue<string>(row, 'currency');
        sourceDate = rowValue<string>(row, 'received_at');
        sourceProjectId = rowValue<string>(row, 'project_id');
        if (row && !paymentIds.has(sourceId)) {
          paymentIds.add(sourceId);
          collectedMinor += BigInt(rowValue<string>(row, 'amount_minor') ?? '0');
        }
      } else if (kind === 'payment_reversal') {
        const row = rowFor(
          `SELECT CAST(r.amount_minor AS TEXT) amount_minor,r.currency,r.effective_at,r.invoice_id,r.original_payment_id,
                   p.invoice_id original_payment_invoice_id,p.received_at original_payment_received_at,
                   p.currency original_payment_currency,
                   CAST(p.amount_minor AS TEXT) original_payment_amount_minor,
                   CAST((SELECT COALESCE(SUM(all_reversals.amount_minor),0)
                      FROM invoice_payment_reversal_event all_reversals
                     WHERE all_reversals.original_payment_id=r.original_payment_id) AS TEXT)
                     cumulative_reversal_minor,
                   i.project_id,i.state,i.voided_at,
                   i.currency invoice_currency,i.tenant_id invoice_tenant_id,
                  i.deployment_id invoice_deployment_id,
                  i.legal_entity_revision_id invoice_legal_entity_revision_id,
                  br.legal_entity_id billing_legal_entity_id
             FROM invoice_payment_reversal_event r
             JOIN payment p ON p.id=r.original_payment_id
             JOIN invoice i ON i.id=r.invoice_id
             LEFT JOIN billing_rule br ON br.id=i.billing_rule_id WHERE r.id=?`,
          sourceId,
        );
        const invoiceId = rowValue<string>(row, 'invoice_id');
        if (row && !declaredInvoiceIds.has(invoiceId ?? ''))
          reasons.push(`${kind}:${sourceId}:invoice_not_in_pack`);
        if (
          row &&
          rowValue<string>(row, 'original_payment_invoice_id') !==
            rowValue<string>(row, 'invoice_id')
        )
          reasons.push(`${kind}:${sourceId}:original_payment_invoice_mismatch`);
        if (
          row &&
          rowValue<string>(row, 'effective_at')! <
            rowValue<string>(row, 'original_payment_received_at')!
        )
          reasons.push(`${kind}:${sourceId}:reversal_before_original_payment`);
        if (
          row &&
          rowValue<string>(row, 'currency') !== rowValue<string>(row, 'original_payment_currency')
        )
          reasons.push(`${kind}:${sourceId}:reversal_currency_mismatch`);
        if (
          row &&
          BigInt(rowValue<string>(row, 'cumulative_reversal_minor') ?? '0') >
            BigInt(rowValue<string>(row, 'original_payment_amount_minor') ?? '0')
        )
          reasons.push(`${kind}:${sourceId}:cumulative_reversal_exceeds_original_payment`);
        const invoiceScopeRow = row
          ? {
              ...row,
              currency: row.invoice_currency,
              tenant_id: row.invoice_tenant_id,
              deployment_id: row.invoice_deployment_id,
              legal_entity_revision_id: row.invoice_legal_entity_revision_id,
            }
          : undefined;
        authoritative =
          Boolean(row) &&
          declaredInvoiceIds.has(invoiceId ?? '') &&
          rowValue<string>(row, 'original_payment_invoice_id') === invoiceId &&
          rowValue<string>(row, 'effective_at')! >=
            rowValue<string>(row, 'original_payment_received_at')! &&
          rowValue<string>(row, 'currency') ===
            rowValue<string>(row, 'original_payment_currency') &&
          BigInt(rowValue<string>(row, 'cumulative_reversal_minor') ?? '0') <=
            BigInt(rowValue<string>(row, 'original_payment_amount_minor') ?? '0') &&
          invoiceIsInScope(invoiceScopeRow, `${kind}:${sourceId}`);
        expectedVersion = 1;
        expectedAmount = rowValue<string>(row, 'amount_minor');
        expectedCurrency = rowValue<string>(row, 'currency');
        sourceDate = rowValue<string>(row, 'effective_at');
        sourceProjectId = rowValue<string>(row, 'project_id');
        if (row && !paymentReversalIds.has(sourceId)) {
          paymentReversalIds.add(sourceId);
          collectedMinor -= BigInt(rowValue<string>(row, 'amount_minor') ?? '0');
        }
      } else if (kind === 'compensation_settlement') {
        const row = rowFor(
          `SELECT s.worker_id,s.project_id,s.compensation_rule_id,s.period_start,s.period_end,
                  s.source_basis,CAST(s.source_amount_minor AS TEXT) source_amount_minor,
                  s.percentage_bps,CAST(s.amount_minor AS TEXT) amount_minor,s.currency,s.state,
                  s.settled_at,r.worker_id rule_worker_id,r.project_id rule_project_id,
                  r.currency rule_currency,r.effective_from rule_effective_from,
                  r.effective_to rule_effective_to,r.version rule_version,
                  r.percentage_bps rule_percentage_bps
             FROM compensation_settlement s
             JOIN compensation_rule r ON r.id=s.compensation_rule_id
            WHERE s.id=?`,
          sourceId,
        );
        const payload = asObject(item.payload);
        const state = rowValue<string>(row, 'state');
        const workerId = rowValue<string>(row, 'worker_id');
        const projectId = rowValue<string>(row, 'project_id');
        const settlementPeriodStart = rowValue<string>(row, 'period_start');
        const settlementPeriodEnd = rowValue<string>(row, 'period_end');
        const ruleVersion = rowValue<number>(row, 'rule_version');
        const settlementAmount = rowValue<string>(row, 'amount_minor');
        const settlementCurrency = rowValue<string>(row, 'currency');
        const settlementPercentage = rowValue<number | null>(row, 'percentage_bps');
        if (row && !['approved', 'settled'].includes(state ?? ''))
          reasons.push(`${kind}:${sourceId}:settlement_not_approved`);
        if (row && (settlementPeriodStart !== periodStart || settlementPeriodEnd !== periodEnd))
          reasons.push(`${kind}:${sourceId}:settlement_period_mismatch`);
        let ruleMatches = Boolean(row);
        for (const [field, matches] of [
          ['rule_worker', rowValue<string>(row, 'rule_worker_id') === workerId],
          [
            'rule_project',
            rowValue<string | null>(row, 'rule_project_id') === null ||
              rowValue<string | null>(row, 'rule_project_id') === projectId,
          ],
          ['rule_currency', rowValue<string>(row, 'rule_currency') === settlementCurrency],
          [
            'rule_effective_period',
            (rowValue<string>(row, 'rule_effective_from') ?? '') <= (settlementPeriodStart ?? '') &&
              (rowValue<string | null>(row, 'rule_effective_to') === null ||
                (rowValue<string>(row, 'rule_effective_to') ?? '') >= (settlementPeriodEnd ?? '')),
          ],
          ['rule_version', ruleVersion === item.normalizedVersion],
          [
            'rule_percentage',
            rowValue<number | null>(row, 'rule_percentage_bps') === settlementPercentage,
          ],
        ] as const) {
          if (!matches) {
            reasons.push(`${kind}:${sourceId}:${field}_mismatch`);
            ruleMatches = false;
          }
        }
        const settledAtMatches =
          state === 'settled'
            ? Boolean(rowValue<string | null>(row, 'settled_at'))
            : rowValue<string | null>(row, 'settled_at') === null;
        if (row && !settledAtMatches) reasons.push(`${kind}:${sourceId}:settled_at_state_mismatch`);
        const payloadBindings: ReadonlyArray<readonly [string, unknown, unknown]> = [
          ['worker_id', payload.worker_id ?? payload.workerId, workerId],
          ['project_id', payload.project_id ?? payload.projectId, projectId],
          ['period_start', payload.period_start ?? payload.periodStart, settlementPeriodStart],
          ['period_end', payload.period_end ?? payload.periodEnd, settlementPeriodEnd],
          ['state', payload.state, state],
          [
            'compensation_rule_id',
            payload.compensation_rule_id ?? payload.compensationRuleId,
            rowValue<string>(row, 'compensation_rule_id'),
          ],
          ['rule_version', payload.rule_version ?? payload.ruleVersion, ruleVersion],
          ['currency', payload.currency, settlementCurrency],
          [
            'amount_minor',
            payload.amount_minor ?? payload.amountMinor ?? payload.amount,
            settlementAmount,
          ],
          [
            'percentage_bps',
            Object.hasOwn(payload, 'percentage_bps')
              ? payload.percentage_bps
              : payload.percentageBps,
            settlementPercentage,
          ],
          [
            'source_basis',
            payload.source_basis ?? payload.sourceBasis,
            rowValue<string>(row, 'source_basis'),
          ],
          [
            'source_amount_minor',
            payload.source_amount_minor ?? payload.sourceAmountMinor,
            rowValue<string>(row, 'source_amount_minor'),
          ],
        ];
        canonicalPayload = row
          ? {
              worker_id: workerId,
              project_id: projectId,
              period_start: settlementPeriodStart,
              period_end: settlementPeriodEnd,
              state,
              settled_at: rowValue<string | null>(row, 'settled_at'),
              compensation_rule_id: rowValue<string>(row, 'compensation_rule_id'),
              rule_version: ruleVersion,
              currency: settlementCurrency,
              amount_minor: settlementAmount,
              percentage_bps: settlementPercentage,
              source_basis: rowValue<string>(row, 'source_basis'),
              source_amount_minor: rowValue<string>(row, 'source_amount_minor'),
            }
          : null;
        let payloadMatches = true;
        for (const [field, asserted, expected] of payloadBindings) {
          if (asserted === undefined || String(asserted) !== String(expected)) {
            reasons.push(`${kind}:${sourceId}:${field}_mismatch`);
            payloadMatches = false;
          }
        }
        if (row && settlementPercentage !== null && settlementPercentage !== undefined) {
          const canonicalAmount = applyBasisPoints(
            money(
              settlementCurrency as Currency,
              BigInt(rowValue<string>(row, 'source_amount_minor') ?? '0'),
            ),
            settlementPercentage,
          ).minorUnits;
          if (canonicalAmount !== BigInt(settlementAmount ?? '0')) {
            reasons.push(`${kind}:${sourceId}:derived_amount_mismatch`);
            payloadMatches = false;
          }
        }
        authoritative =
          Boolean(row) &&
          Boolean(workerId) &&
          Boolean(projectId) &&
          ['approved', 'settled'].includes(state ?? '') &&
          settlementPeriodStart === periodStart &&
          settlementPeriodEnd === periodEnd &&
          ruleMatches &&
          settledAtMatches &&
          payloadMatches &&
          projectLegalEntityMatches(
            projectId ?? '',
            settlementPeriodEnd ?? periodEnd,
            `${kind}:${sourceId}`,
          );
        expectedVersion = ruleVersion;
        expectedAmount = settlementAmount;
        expectedCurrency = settlementCurrency;
        sourceDate = settlementPeriodEnd;
        sourceProjectId = projectId;
      } else if (kind === 'invoice_source' || kind === 'commercial_manifest') {
        const composite = splitComposite(sourceId, 3);
        if (composite) {
          const invoiceId = composite[0]!;
          const sourceType = composite[1]!;
          const nestedSourceId = composite[2]!;
          if (!declaredInvoiceIds.has(invoiceId))
            reasons.push(`${kind}:${sourceId}:parent_invoice_not_in_pack`);
          if (kind === 'invoice_source') {
            const row = rowFor(
              `SELECT s.source_version,s.invoice_line_id,
                       CAST(s.allocated_net_minor AS TEXT) allocated_net_minor,
                       CAST(s.allocated_tax_minor AS TEXT) allocated_tax_minor,
                       CAST(s.allocated_gross_minor AS TEXT) allocated_gross_minor,
                       s.source_hash,s.locked_at,
                       i.issued_at,i.state,i.voided_at,
                       i.project_id,i.currency,i.tenant_id,i.deployment_id,i.legal_entity_revision_id,
                       br.legal_entity_id billing_legal_entity_id
                 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
                 LEFT JOIN billing_rule br ON br.id=i.billing_rule_id
                WHERE s.invoice_id=? AND s.source_type=? AND s.source_id=?`,
              invoiceId,
              sourceType,
              nestedSourceId,
            );
            const sourceVersion = rowValue<number | null>(row, 'source_version');
            const operationalLookup = operationalSourceAuthority(sourceType, nestedSourceId);
            const operational = row
              ? validateOperationalSource(
                  sourceType,
                  nestedSourceId,
                  rowValue<string>(row, 'project_id'),
                  sourceVersion,
                  `${kind}:${sourceId}`,
                )
              : undefined;
            const operationalRequired = Boolean(operationalLookup.row);
            const lockedAt = rowValue<string | null>(row, 'locked_at');
            const sourceHash = rowValue<string | null>(row, 'source_hash');
            const allocation = canonicalLineAllocation(invoiceId, sourceType, nestedSourceId);
            const linkedLineId = rowValue<string | null>(row, 'invoice_line_id');
            const linkedLineMatches =
              linkedLineId === null ||
              linkedLineId === undefined ||
              Boolean(
                rowFor(
                  `SELECT 1 present FROM invoice_line
                    WHERE id=? AND invoice_id=? AND source_type=? AND source_id=?`,
                  linkedLineId,
                  invoiceId,
                  sourceType === 'minimum_top_up' ? 'billing_adjustment' : sourceType,
                  nestedSourceId,
                ),
              );
            if (row && !linkedLineMatches)
              reasons.push(`${kind}:${sourceId}:invoice_line_link_mismatch`);
            const persistedNet = rowValue<string | null>(row, 'allocated_net_minor');
            const persistedTax = rowValue<string | null>(row, 'allocated_tax_minor');
            const persistedGross = rowValue<string | null>(row, 'allocated_gross_minor');
            const allocationMatches =
              allocation.count === 0
                ? persistedNet === null && persistedTax === null && persistedGross === null
                : persistedNet !== null &&
                  persistedNet !== undefined &&
                  persistedTax !== null &&
                  persistedTax !== undefined &&
                  persistedGross !== null &&
                  persistedGross !== undefined &&
                  BigInt(persistedNet) === allocation.net &&
                  BigInt(persistedTax) === allocation.tax &&
                  BigInt(persistedGross) === allocation.gross &&
                  allocation.gross === allocation.net + allocation.tax;
            if (row && !allocationMatches) reasons.push(`${kind}:${sourceId}:allocation_mismatch`);
            if (row && !lockedAt) reasons.push(`${kind}:${sourceId}:missing_locked_at`);
            if (row && !sourceHash) reasons.push(`${kind}:${sourceId}:missing_source_hash`);
            const hashMatches = row
              ? assertCanonicalSourceHash(
                  kind,
                  sourceId,
                  invoiceId,
                  sourceType,
                  nestedSourceId,
                  sourceVersion,
                  sourceHash,
                  asObject(item.payload),
                )
              : false;
            canonicalPayload = sourceHash ? { source_hash: sourceHash } : null;
            const manifestHash = rowValue<string | null>(
              rowFor(
                `SELECT source_hash FROM invoice_commercial_source_manifest
                  WHERE invoice_id=? AND source_type=? AND source_id=?`,
                invoiceId,
                sourceType,
                nestedSourceId,
              ),
              'source_hash',
            );
            if (row && sourceHash !== manifestHash)
              reasons.push(`${kind}:${sourceId}:manifest_source_hash_mismatch`);
            authoritative =
              Boolean(row) &&
              declaredInvoiceIds.has(invoiceId) &&
              invoiceIsInScope(row, `${kind}:${sourceId}`) &&
              Boolean(lockedAt) &&
              Boolean(sourceHash) &&
              hashMatches &&
              sourceHash === manifestHash &&
              linkedLineMatches &&
              allocationMatches &&
              (!operationalRequired || Boolean(operational));
            expectedVersion = sourceVersion ?? undefined;
            expectedAmount = rowValue<string | null>(row, 'allocated_net_minor');
            // locked_at proves immutability, not accounting-period ownership.
            // Bind the source to its authoritative operational business date,
            // exactly as the commercial-manifest sibling is bound below.
            sourceProjectId = rowValue<string>(row, 'project_id');
            if (operational) {
              sourceDate = operational.businessDate;
              sourceTimezone = operational.sourceTimezone;
            } else if (sourceType === 'adjustment')
              sourceDate = rowValue<string>(
                rowFor('SELECT created_at FROM invoice_adjustment WHERE id=?', nestedSourceId),
                'created_at',
              );
            else sourceDate = rowValue<string>(row, 'issued_at') ?? lockedAt ?? undefined;
            if (row) invoiceSourceCount += 1;
          } else {
            const row = rowFor(
              `SELECT m.source_version,m.disposition,
                       CAST(m.original_minor AS TEXT) original_minor,
                       CAST(m.allocated_minor AS TEXT) allocated_minor,
                       CAST(m.remaining_minor AS TEXT) remaining_minor,
                       m.reason_code,m.source_hash,m.created_at,m.locked_at,i.issued_at,
                       i.state,i.voided_at,
                       i.project_id,i.currency,i.tenant_id,i.deployment_id,i.legal_entity_revision_id,
                       br.legal_entity_id billing_legal_entity_id
                 FROM invoice_commercial_source_manifest m JOIN invoice i ON i.id=m.invoice_id
                 LEFT JOIN billing_rule br ON br.id=i.billing_rule_id
                WHERE m.invoice_id=? AND m.source_type=? AND m.source_id=?`,
              invoiceId,
              sourceType,
              nestedSourceId,
            );
            const sourceVersion = rowValue<number | null>(row, 'source_version');
            const operationalLookup = operationalSourceAuthority(sourceType, nestedSourceId);
            const operational = row
              ? validateOperationalSource(
                  sourceType,
                  nestedSourceId,
                  rowValue<string>(row, 'project_id'),
                  sourceVersion,
                  `${kind}:${sourceId}`,
                )
              : undefined;
            const operationalRequired = Boolean(operationalLookup.row);
            const lockedAt = rowValue<string | null>(row, 'locked_at');
            const sourceHash = rowValue<string | null>(row, 'source_hash');
            const allocation = canonicalLineAllocation(invoiceId, sourceType, nestedSourceId);
            const disposition = rowValue<string>(row, 'disposition');
            const original = rowValue<string | null>(row, 'original_minor');
            const allocated = rowValue<string | null>(row, 'allocated_minor');
            const remaining = rowValue<string | null>(row, 'remaining_minor');
            const reasonCode = rowValue<string>(row, 'reason_code');
            const manifestAllocatedNet =
              sourceType === 'adjustment' && allocation.net < 0n ? -allocation.net : allocation.net;
            const manifestAllocationMatches =
              Boolean(reasonCode?.trim()) &&
              (allocation.count === 0
                ? allocated === null || allocated === undefined || BigInt(allocated) === 0n
                : allocated !== null &&
                  allocated !== undefined &&
                  BigInt(allocated) === manifestAllocatedNet) &&
              (original === null ||
                original === undefined ||
                (allocated !== null &&
                  allocated !== undefined &&
                  remaining !== null &&
                  remaining !== undefined &&
                  BigInt(original) === BigInt(allocated) + BigInt(remaining))) &&
              (disposition !== 'included' ||
                remaining === null ||
                remaining === undefined ||
                BigInt(remaining) === 0n) &&
              (!['blocked', 'excluded'].includes(disposition ?? '') ||
                allocated === null ||
                allocated === undefined ||
                BigInt(allocated) === 0n);
            if (row && !manifestAllocationMatches)
              reasons.push(`${kind}:${sourceId}:manifest_allocation_mismatch`);
            if (row && !lockedAt) reasons.push(`${kind}:${sourceId}:missing_locked_at`);
            if (row && !sourceHash) reasons.push(`${kind}:${sourceId}:missing_source_hash`);
            const hashMatches = row
              ? assertCanonicalSourceHash(
                  kind,
                  sourceId,
                  invoiceId,
                  sourceType,
                  nestedSourceId,
                  sourceVersion,
                  sourceHash,
                  asObject(item.payload),
                )
              : false;
            canonicalPayload = sourceHash ? { source_hash: sourceHash } : null;
            authoritative =
              Boolean(row) &&
              declaredInvoiceIds.has(invoiceId) &&
              invoiceIsInScope(row, `${kind}:${sourceId}`) &&
              Boolean(lockedAt) &&
              Boolean(sourceHash) &&
              hashMatches &&
              manifestAllocationMatches &&
              (!operationalRequired || Boolean(operational));
            expectedVersion = sourceVersion ?? 1;
            expectedAmount = rowValue<string | null>(row, 'allocated_minor');
            // The allocation becomes immutable at issue, but its effective
            // business date remains the authoritative source date. Manifest
            // created_at is merely implementation metadata and cannot move a
            // historical time/expense/milestone into another accounting cut.
            sourceProjectId = rowValue<string>(row, 'project_id');
            if (operational) {
              sourceDate = operational.businessDate;
              sourceTimezone = operational.sourceTimezone;
            } else if (sourceType === 'adjustment')
              sourceDate = rowValue<string>(
                rowFor('SELECT created_at FROM invoice_adjustment WHERE id=?', nestedSourceId),
                'created_at',
              );
            else
              sourceDate = rowValue<string>(row, 'issued_at') ?? rowValue<string>(row, 'locked_at');
          }
        }
      } else if (kind === 'compensation' || kind === 'direct_cost') {
        const payload = asObject(item.payload);
        if (kind === 'compensation') {
          const group = resolveCanonicalTimeGroup(sourceId);
          const { workerId, projectId, rows } = group;
          const sourceTimeIds = Array.isArray(payload.sourceTimeIds)
            ? payload.sourceTimeIds.filter((value): value is string => typeof value === 'string')
            : [];
          const canonicalSourceTimeIds = rows.map((row) => row.id!).sort();
          const assertedSourceTimeIds = [...sourceTimeIds].sort();
          const referencedRows =
            canonicalSourceTimeIds.length > 0 &&
            canonicalSourceTimeIds.length === assertedSourceTimeIds.length &&
            canonicalSourceTimeIds.every((id, index) => id === assertedSourceTimeIds[index]);
          if (!referencedRows) reasons.push(`${kind}:${sourceId}:source_time_ids_mismatch`);
          canonicalPayload = { sourceTimeIds: canonicalSourceTimeIds };
          authoritative =
            Boolean(workerId && projectId) &&
            referencedRows &&
            rows.every(
              (row) =>
                AUTHORITATIVE_APPROVAL_STATES.has(row.approval_state) &&
                projectLegalEntityMatches(row.project_id, row.work_date, `${kind}:${sourceId}`),
            );
          for (const row of rows)
            if (!AUTHORITATIVE_APPROVAL_STATES.has(row.approval_state))
              reasons.push(`${kind}:${sourceId}:time_not_approved`);
          expectedVersion = 1;
          sourceDate = periodEnd;
          sourceProjectId = projectId;
          sourceTimezone = rows[0]?.source_timezone;
          expectedCurrency = rows[0]?.project_currency;
          if (authoritative) {
            let canonicalAmount = 0n;
            let canonicalAmountKnown = true;
            for (const row of rows) {
              const amount = compensationAmountFor(row);
              if (amount === null) canonicalAmountKnown = false;
              else canonicalAmount += amount;
            }
            if (!canonicalAmountKnown) {
              const settlement = rowFor(
                `SELECT COUNT(*) count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) amount,
                        MAX(currency) currency
                   FROM compensation_settlement
                  WHERE worker_id=? AND project_id=? AND period_start=? AND period_end=?
                    AND state IN ('approved','settled')`,
                workerId!,
                projectId!,
                periodStart,
                periodEnd,
              );
              if (Number(rowValue<number>(settlement, 'count') ?? 0) > 0) {
                canonicalAmount = BigInt(rowValue<string>(settlement, 'amount') ?? '0');
                expectedCurrency = rowValue<string>(settlement, 'currency') ?? expectedCurrency;
                canonicalAmountKnown = true;
              }
            }
            if (canonicalAmountKnown) expectedAmount = canonicalAmount;
            else reasons.push(`${kind}:${sourceId}:compensation_source_amount_unavailable`);
          }
        } else if (sourceId.startsWith('expense:')) {
          const expenseId = sourceId.slice('expense:'.length);
          canonicalPayload = { expenseId };
          const row = rowFor(
            `SELECT e.project_id,CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                    CAST(e.amount_minor AS TEXT) amount_minor,e.currency,e.spent_on,
                    e.who_paid,COALESCE(e.billing_treatment,e.client_treatment) treatment,
                    e.approval_state,p.currency project_currency
               FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
            expenseId,
          );
          const approvalState = rowValue<string>(row, 'approval_state');
          authoritative =
            Boolean(row) &&
            AUTHORITATIVE_APPROVAL_STATES.has(approvalState ?? '') &&
            projectLegalEntityMatches(
              rowValue<string>(row, 'project_id') ?? '',
              rowValue<string>(row, 'spent_on') ?? periodEnd,
              `${kind}:${sourceId}`,
            );
          if (row && !authoritative) reasons.push(`${kind}:${sourceId}:expense_not_approved`);
          expectedVersion = 1;
          const projectCurrency = rowValue<string>(row, 'project_currency');
          const originalCurrency = rowValue<string>(row, 'currency');
          const converted = rowValue<string | null>(row, 'project_currency_amount_minor');
          if (converted === null && projectCurrency !== originalCurrency)
            reasons.push(`${kind}:${sourceId}:missing_project_currency_amount`);
          expectedAmount =
            converted ??
            (projectCurrency === originalCurrency
              ? rowValue<string>(row, 'amount_minor')
              : undefined);
          expectedCurrency = projectCurrency;
          sourceDate = rowValue<string>(row, 'spent_on');
          if (
            authoritative &&
            row &&
            rowValue<string>(row, 'who_paid') !== 'client' &&
            rowValue<string>(row, 'treatment') !== 'client_direct' &&
            !expenseCostIds.has(expenseId) &&
            expectedAmount !== undefined
          ) {
            expenseCostIds.add(expenseId);
            expenseCostMinor += BigInt(String(expectedAmount));
          }
        } else if (sourceId.startsWith('labor:')) {
          const group = resolveCanonicalTimeGroup(sourceId.slice('labor:'.length));
          const { projectId, rows } = group;
          const sourceTimeIds = Array.isArray(payload.sourceTimeIds)
            ? payload.sourceTimeIds.filter((value): value is string => typeof value === 'string')
            : [];
          const canonicalSourceTimeIds = rows.map((row) => row.id!).sort();
          const assertedSourceTimeIds = [...sourceTimeIds].sort();
          const exactSourceTimes =
            canonicalSourceTimeIds.length > 0 &&
            canonicalSourceTimeIds.length === assertedSourceTimeIds.length &&
            canonicalSourceTimeIds.every((id, index) => id === assertedSourceTimeIds[index]);
          if (!exactSourceTimes) reasons.push(`${kind}:${sourceId}:source_time_ids_mismatch`);
          canonicalPayload = { sourceTimeIds: canonicalSourceTimeIds };
          authoritative =
            exactSourceTimes &&
            rows.every(
              (row) =>
                AUTHORITATIVE_APPROVAL_STATES.has(row.approval_state) &&
                projectLegalEntityMatches(row.project_id, row.work_date, `${kind}:${sourceId}`),
            );
          for (const row of rows)
            if (!AUTHORITATIVE_APPROVAL_STATES.has(row.approval_state))
              reasons.push(`${kind}:${sourceId}:time_not_approved`);
          expectedVersion = 1;
          sourceDate = periodEnd;
          sourceProjectId = projectId;
          sourceTimezone = rows[0]?.source_timezone;
          let authoritativeCost = 0n;
          for (const row of rows) {
            const rowCost = authoritativeTimeCost(row);
            if (rowCost === null) reasons.push(`${kind}:${sourceId}:missing_internal_cost`);
            else authoritativeCost += rowCost;
          }
          expectedAmount = authoritativeCost;
          expectedCurrency = rows[0]?.project_currency;
          if (authoritative && !workerCostIds.has(sourceId)) {
            workerCostIds.add(sourceId);
            workerCostMinor += authoritativeCost;
          }
        }
      }
    } catch {
      authoritative = false;
    }

    const mutableItem = item as typeof item & {
      normalizedId: string;
      normalizedEvidenceType: string;
      evidenceBlob: Buffer;
      itemHash: string;
    };
    const canonicalEvidenceBlob = Buffer.from(
      canonicalJson({
        schema_version: 'accounting-pack-source-item-v1',
        cut_period_start: periodStart,
        cut_period_end: periodEnd,
        id: mutableItem.normalizedId,
        item_kind: item.normalizedKind,
        item_id: item.normalizedSourceId,
        item_version: item.normalizedVersion,
        effective_at: item.normalizedEffectiveAt,
        evidence_type: mutableItem.normalizedEvidenceType,
        amount_minor: item.normalizedAmountMinor,
        currency: item.normalizedCurrency,
        payload: canonicalPayload,
      }),
    );
    Object.assign(mutableItem, {
      payload: canonicalPayload,
      evidenceBlob: canonicalEvidenceBlob,
      itemHash: sha256(canonicalEvidenceBlob),
    });

    if (!authoritative) {
      reasons.push(`${kind}:${sourceId}:missing_authoritative_row`);
      continue;
    }
    if (expectedVersion !== undefined && expectedVersion !== item.normalizedVersion)
      reasons.push(`${kind}:${sourceId}:version_mismatch`);
    if (expectedCurrency !== undefined && expectedCurrency !== item.normalizedCurrency)
      reasons.push(`${kind}:${sourceId}:currency_mismatch`);
    const requiresAmount =
      kind === 'invoice_source' || kind === 'commercial_manifest'
        ? expectedAmount !== null && expectedAmount !== undefined
        : kind !== 'time';
    if (!amountMatches(expectedAmount, item.normalizedAmountMinor, requiresAmount))
      reasons.push(`${kind}:${sourceId}:amount_mismatch`);
    if (sourceDate) {
      try {
        if (!effectiveAtMatchesAuthority(item.normalizedEffectiveAt, sourceDate))
          reasons.push(`${kind}:${sourceId}:effective_at_mismatch`);
        if (!sourceDateInPeriodFor(sourceDate, sourceProjectId, sourceTimezone))
          reasons.push(`${kind}:${sourceId}:effective_date_outside_period`);
      } catch {
        reasons.push(`${kind}:${sourceId}:invalid_effective_date`);
      }
    }
  }
  let outstandingMinor = 0n;
  for (const invoiceId of invoiceIds) {
    const invoice = rowFor(
      'SELECT CAST(total_minor AS TEXT) total_minor,currency,project_id FROM invoice WHERE id=?',
      invoiceId,
    );
    const invoiceCurrency = rowValue<string>(invoice, 'currency');
    const invoiceProjectId = rowValue<string>(invoice, 'project_id');
    const persistedPayments = sqlite
      .prepare(
        'SELECT id,CAST(amount_minor AS TEXT) amount_minor,currency,received_at FROM payment WHERE invoice_id=?',
      )
      .all(invoiceId) as Array<{
      id: string;
      amount_minor: string;
      currency: string;
      received_at: string;
    }>;
    const persistedReversals = sqlite
      .prepare(
        `SELECT r.id,CAST(r.amount_minor AS TEXT) amount_minor,r.currency,r.effective_at,
                r.original_payment_id,p.invoice_id original_invoice_id,p.currency original_currency,
                p.received_at original_received_at,CAST(p.amount_minor AS TEXT) original_amount_minor,
                CAST((SELECT COALESCE(SUM(all_r.amount_minor),0)
                        FROM invoice_payment_reversal_event all_r
                       WHERE all_r.original_payment_id=r.original_payment_id) AS TEXT)
                  cumulative_reversal_minor
           FROM invoice_payment_reversal_event r
           LEFT JOIN payment p ON p.id=r.original_payment_id
          WHERE r.invoice_id=?`,
      )
      .all(invoiceId) as Array<{
      id: string;
      amount_minor: string;
      currency: string;
      effective_at: string;
      original_payment_id: string;
      original_invoice_id: string | null;
      original_currency: string | null;
      original_received_at: string | null;
      original_amount_minor: string | null;
      cumulative_reversal_minor: string;
    }>;
    let invoiceOutstanding = BigInt(rowValue<string>(invoice, 'total_minor') ?? '0');
    for (const payment of persistedPayments) {
      if (payment.currency !== invoiceCurrency)
        reasons.push(`payment:${payment.id}:invoice_currency_mismatch`);
      if (sourceDateAtOrBeforePeriodEndFor(payment.received_at, invoiceProjectId))
        invoiceOutstanding -= BigInt(payment.amount_minor);
      if (
        sourceDateInPeriodFor(payment.received_at, invoiceProjectId) &&
        !declaredPaymentIds.has(payment.id)
      )
        reasons.push(`payment:${payment.id}:missing_from_source_cut`);
    }
    for (const reversal of persistedReversals) {
      if (reversal.original_invoice_id !== invoiceId)
        reasons.push(`payment_reversal:${reversal.id}:original_payment_invoice_mismatch`);
      if (
        reversal.original_received_at === null ||
        reversal.effective_at < reversal.original_received_at
      )
        reasons.push(`payment_reversal:${reversal.id}:reversal_before_original_payment`);
      if (reversal.currency !== invoiceCurrency || reversal.original_currency !== invoiceCurrency)
        reasons.push(`payment_reversal:${reversal.id}:reversal_currency_mismatch`);
      if (
        reversal.original_amount_minor === null ||
        BigInt(reversal.cumulative_reversal_minor) > BigInt(reversal.original_amount_minor)
      )
        reasons.push(
          `payment_reversal:${reversal.id}:cumulative_reversal_exceeds_original_payment`,
        );
      if (sourceDateAtOrBeforePeriodEndFor(reversal.effective_at, invoiceProjectId))
        invoiceOutstanding += BigInt(reversal.amount_minor);
      if (
        sourceDateInPeriodFor(reversal.effective_at, invoiceProjectId) &&
        !declaredReversalIds.has(reversal.id)
      )
        reasons.push(`payment_reversal:${reversal.id}:missing_from_source_cut`);
    }
    if (invoiceOutstanding < 0n) reasons.push(`invoice:${invoiceId}:negative_outstanding_balance`);
    outstandingMinor += invoiceOutstanding;
  }
  const directCostMinor = workerCostMinor + expenseCostMinor;
  return {
    mismatchCount: reasons.length,
    reasons,
    values: {
      invoiceCount: invoiceIds.size,
      paymentCount: paymentIds.size + paymentReversalIds.size,
      workerCostCount: workerCostIds.size,
      expenseCount: approvedExpenseCount,
      sourceItemCount: sourceItems.length,
      invoiceSourceCount,
      sourceMismatchCount: reasons.length,
      approvedTimeEntryCount,
      approvedExpenseCount,
      netMinor,
      taxMinor,
      grossMinor,
      collectedMinor,
      outstandingMinor,
      workerCostMinor,
      expenseCostMinor,
      directCostMinor,
      contributionMinor: netMinor - directCostMinor,
    },
  };
}

type NormalizedSnapshot = Readonly<{
  snapshotJson: string;
  reconciliationJson: string;
  values: SnapshotValues;
  reconciliation: CanonicalReconciliation;
}>;

function deriveCanonicalReconciliation(
  sourceItems: readonly AccountingPackSourceItemInput[],
  values: SnapshotValues,
): CanonicalReconciliation {
  const kindCount = new Map<string, number>();
  for (const item of sourceItems) {
    const kind = String(item.itemKind ?? item.kind ?? '')
      .trim()
      .toLowerCase();
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
  }
  const count = (kind: string): number => kindCount.get(kind) ?? 0;
  const checks = {
    invoiceSources:
      count('invoice') === values.invoiceCount && count('time') === values.approvedTimeEntryCount,
    payments: count('payment') + count('payment_reversal') === values.paymentCount,
    workerCosts: count('compensation') === values.workerCostCount,
    expenses: count('expense') === Math.max(values.expenseCount, values.approvedExpenseCount),
    directCosts: values.directCostMinor === 0n || count('direct_cost') > 0,
    contribution:
      values.grossMinor === values.netMinor + values.taxMinor &&
      values.directCostMinor === values.workerCostMinor + values.expenseCostMinor &&
      values.contributionMinor === values.netMinor - values.directCostMinor,
  };
  return {
    checks,
    reconciles: values.sourceMismatchCount === 0 && Object.values(checks).every(Boolean),
  };
}

function detailText(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  }
  return null;
}

function assertDetailIdentities(
  field: string,
  rows: readonly unknown[],
  expectedIds: ReadonlySet<string>,
  identity: (row: Record<string, unknown>) => string | null,
): void {
  // Compatibility callers may omit legacy detail arrays. When a detail array
  // is supplied, however, it becomes part of the immutable snapshot and must
  // be an exact projection of the authoritative source cut.
  if (rows.length === 0) return;
  const actualIds = rows.map((value) => identity(asObject(value)));
  const actual = new Set(actualIds.filter((value): value is string => Boolean(value)));
  if (
    actualIds.some((value) => value === null) ||
    actual.size !== rows.length ||
    actual.size !== expectedIds.size ||
    [...actual].some((value) => !expectedIds.has(value))
  )
    throw new AccountingPackRevisionError(
      `${field} does not match authoritative Accounting Pack detail rows`,
    );
}

function assertSnapshotDetailsAuthoritative(
  sqlite: DatabaseSync,
  sourceItems: readonly AccountingPackSourceItemInput[],
  details: Readonly<{
    invoiceRegister: readonly unknown[];
    collections: readonly unknown[];
    workerCosts: readonly unknown[];
    expenseRegister: readonly unknown[];
    ledger: readonly unknown[];
    totalsByCurrency: readonly unknown[];
  }>,
  values: SnapshotValues,
  currency: string,
): void {
  type DetailSource = Readonly<{
    amountMinor: AccountingPackMoney | null | undefined;
    currency: string | null | undefined;
    effectiveAt: string | undefined;
    version: number | undefined;
  }>;
  const sourceMap = new Map<string, DetailSource>();
  for (const item of sourceItems) {
    const kind = String(item.itemKind ?? item.kind ?? '')
      .trim()
      .toLowerCase();
    const sourceId = String(item.sourceId ?? item.source_id ?? '').trim();
    if (!kind || !sourceId) continue;
    sourceMap.set(`${kind}:${sourceId}`, {
      amountMinor: item.amountMinor ?? item.amount_minor,
      currency: item.currency,
      effectiveAt: item.effectiveAt ?? item.effective_at,
      version: item.itemVersion ?? item.version,
    });
  }
  const fail = (field: string): never => {
    throw new AccountingPackRevisionError(
      `${field} does not match authoritative Accounting Pack detail rows`,
    );
  };
  const requireDetail = <T>(value: T | undefined, field: string): T => {
    if (value === undefined) fail(field);
    return value as T;
  };
  const assertMoneyField = (
    field: string,
    row: Record<string, unknown>,
    expected: AccountingPackMoney | null | undefined,
    ...keys: string[]
  ): void => {
    const asserted = keys.map((key) => row[key]).find((value) => value !== undefined);
    if (
      asserted !== undefined &&
      (expected === null ||
        expected === undefined ||
        safeMoney(asserted, field) !== safeMoney(expected, field))
    )
      fail(field);
  };
  const assertTextField = (
    field: string,
    row: Record<string, unknown>,
    expected: string | null | undefined,
    ...keys: string[]
  ): void => {
    const asserted = keys.map((key) => row[key]).find((value) => value !== undefined);
    if (asserted !== undefined && String(asserted ?? '') !== String(expected ?? '')) fail(field);
  };
  const assertEffectiveDate = (
    field: string,
    row: Record<string, unknown>,
    expected: unknown,
    ...keys: string[]
  ): void => {
    const asserted = keys.map((key) => row[key]).find((value) => value !== undefined);
    if (asserted === undefined) return;
    if (asserted === null && (expected === null || expected === undefined)) return;
    if (typeof expected !== 'string' || typeof asserted !== 'string') fail(field);
    const actual = asserted as string;
    const authoritativeDate = expected as string;
    if (actual !== authoritativeDate && actual.slice(0, 10) !== authoritativeDate.slice(0, 10))
      fail(field);
  };
  const sourceIds = (kind: string): Set<string> =>
    new Set(
      sourceItems
        .filter(
          (item) =>
            String(item.itemKind ?? item.kind ?? '')
              .trim()
              .toLowerCase() === kind,
        )
        .map((item) => String(item.sourceId ?? item.source_id ?? '').trim())
        .filter(Boolean),
    );
  const invoiceIds = sourceIds('invoice');
  const paymentIds = sourceIds('payment');
  const reversalIds = sourceIds('payment_reversal');
  const collectionIds = new Set([...paymentIds, ...reversalIds]);
  const compensationIds = sourceIds('compensation');
  const expenseIds = sourceIds('expense');
  const resolveWorkerCostIdentity = (row: Record<string, unknown>): string | null => {
    const workerId = detailText(row, 'workerId', 'worker_id');
    const projectId = detailText(row, 'projectId', 'project_id');
    if (!workerId || !projectId) return null;
    const base = `${workerId}:${projectId}`;
    const legalEntityId = detailText(row, 'legalEntityId', 'legal_entity_id');
    const explicit = legalEntityId ? `${base}:${legalEntityId}` : base;
    if (compensationIds.has(explicit)) return explicit;
    const candidates = [...compensationIds].filter((candidate) => candidate.startsWith(`${base}:`));
    return candidates.length === 1 ? candidates[0]! : base;
  };

  assertDetailIdentities('invoiceRegister', details.invoiceRegister, invoiceIds, (row) =>
    detailText(row, 'invoiceId', 'invoice_id', 'id'),
  );
  assertDetailIdentities('collections', details.collections, collectionIds, (row) => {
    const reversalId = detailText(row, 'reversalId', 'reversal_id');
    return reversalId ?? detailText(row, 'paymentId', 'payment_id', 'id');
  });
  assertDetailIdentities('workerCosts', details.workerCosts, compensationIds, (row) => {
    return resolveWorkerCostIdentity(row);
  });
  assertDetailIdentities('expenseRegister', details.expenseRegister, expenseIds, (row) =>
    detailText(row, 'expenseId', 'expense_id', 'id'),
  );
  assertDetailIdentities('ledger', details.ledger, invoiceIds, (row) =>
    detailText(row, 'invoiceId', 'invoice_id', 'id'),
  );

  for (const value of details.invoiceRegister) {
    const row = asObject(value);
    const id = detailText(row, 'invoiceId', 'invoice_id', 'id');
    const source = requireDetail(
      id ? sourceMap.get(`invoice:${id}`) : undefined,
      'invoiceRegister',
    );
    const invoice = requireDetail(
      sqlite
        .prepare(
          `SELECT version,CAST(subtotal_minor AS TEXT) subtotal_minor,
                  CAST(tax_minor AS TEXT) tax_minor,CAST(total_minor AS TEXT) total_minor,
                  currency,issued_at,due_at FROM invoice WHERE id=?`,
        )
        .get(id) as DbRow | undefined,
      'invoiceRegister',
    );
    assertMoneyField(
      'invoiceRegister net amount',
      row,
      source.amountMinor,
      'netMinor',
      'net_minor',
      'subtotalMinor',
      'subtotal_minor',
    );
    assertMoneyField(
      'invoiceRegister tax amount',
      row,
      invoice.tax_minor as AccountingPackMoney,
      'taxMinor',
      'tax_minor',
    );
    assertMoneyField(
      'invoiceRegister gross amount',
      row,
      invoice.total_minor as AccountingPackMoney,
      'grossMinor',
      'gross_minor',
      'totalMinor',
      'total_minor',
    );
    assertTextField('invoiceRegister currency', row, source.currency, 'currency');
    if (row.version !== undefined && Number(row.version) !== source.version)
      fail('invoiceRegister version');
    assertEffectiveDate(
      'invoiceRegister issue date',
      row,
      source.effectiveAt,
      'issueDate',
      'issue_date',
      'issuedAt',
      'issued_at',
    );
    assertEffectiveDate(
      'invoiceRegister due date',
      row,
      invoice.due_at,
      'dueDate',
      'due_date',
      'dueAt',
      'due_at',
    );
  }

  for (const value of details.collections) {
    const row = asObject(value);
    const reversalId = detailText(row, 'reversalId', 'reversal_id');
    const paymentId = detailText(row, 'paymentId', 'payment_id', 'id');
    const kind = reversalId ? 'payment_reversal' : 'payment';
    const id = reversalId ?? paymentId;
    const source = requireDetail(id ? sourceMap.get(`${kind}:${id}`) : undefined, 'collections');
    const signedAmount =
      source.amountMinor === null || source.amountMinor === undefined
        ? source.amountMinor
        : kind === 'payment_reversal'
          ? -safeMoney(source.amountMinor, 'collection source amount')
          : source.amountMinor;
    assertMoneyField(
      'collections amount',
      row,
      signedAmount,
      'amountCollectedInMonthMinor',
      'amount_collected_in_month_minor',
      'amountMinor',
      'amount_minor',
    );
    assertTextField('collections currency', row, source.currency, 'currency');
    assertEffectiveDate(
      'collections date',
      row,
      source.effectiveAt,
      'paymentDate',
      'payment_date',
      'effectiveAt',
      'effective_at',
    );
  }

  for (const value of details.workerCosts) {
    const row = asObject(value);
    const id = resolveWorkerCostIdentity(row);
    const compensation = requireDetail(
      id ? sourceMap.get(`compensation:${id}`) : undefined,
      'workerCosts',
    );
    const labor = id ? sourceMap.get(`direct_cost:labor:${id}`) : undefined;
    assertMoneyField(
      'workerCosts compensation amount',
      row,
      compensation.amountMinor,
      'approvedCompensationMinor',
      'approved_compensation_minor',
      'compensationMinor',
      'compensation_minor',
    );
    assertTextField('workerCosts currency', row, compensation.currency, 'currency');
    if (labor) {
      assertMoneyField(
        'workerCosts internal labor amount',
        row,
        labor.amountMinor,
        'internalLoadedLaborCostMinor',
        'internal_loaded_labor_cost_minor',
      );
      assertTextField('workerCosts internal labor currency', row, labor.currency, 'currency');
    }
  }

  for (const value of details.expenseRegister) {
    const row = asObject(value);
    const id = detailText(row, 'expenseId', 'expense_id', 'id');
    const source = requireDetail(
      id ? sourceMap.get(`expense:${id}`) : undefined,
      'expenseRegister',
    );
    const expense = requireDetail(
      sqlite
        .prepare(
          `SELECT CAST(amount_minor AS TEXT) amount_minor,
                  CAST(tax_amount_minor AS TEXT) tax_amount_minor,currency,
                  CAST(project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                  spent_on FROM expense WHERE id=?`,
        )
        .get(id) as DbRow | undefined,
      'expenseRegister',
    );
    assertMoneyField(
      'expenseRegister source amount',
      row,
      expense.amount_minor as AccountingPackMoney,
      'amountMinor',
      'amount_minor',
    );
    assertMoneyField(
      'expenseRegister tax amount',
      row,
      (expense.tax_amount_minor ?? 0) as AccountingPackMoney,
      'taxMinor',
      'tax_minor',
    );
    const gross =
      BigInt(String(expense.amount_minor ?? 0)) + BigInt(String(expense.tax_amount_minor ?? 0));
    assertMoneyField('expenseRegister gross amount', row, gross, 'grossMinor', 'gross_minor');
    assertTextField('expenseRegister source currency', row, expense.currency as string, 'currency');
    assertMoneyField(
      'expenseRegister project amount',
      row,
      source.amountMinor,
      'projectCurrencyAmountMinor',
      'project_currency_amount_minor',
    );
    assertTextField(
      'expenseRegister project currency',
      row,
      source.currency,
      'projectCurrency',
      'project_currency',
    );
    if (row.version !== undefined && Number(row.version) !== source.version)
      fail('expenseRegister version');
    assertEffectiveDate(
      'expenseRegister date',
      row,
      source.effectiveAt,
      'date',
      'spentOn',
      'spent_on',
    );
  }

  for (const value of details.ledger) {
    const row = asObject(value);
    const id = detailText(row, 'invoiceId', 'invoice_id', 'id');
    const source = requireDetail(id ? sourceMap.get(`invoice:${id}`) : undefined, 'ledger');
    const invoice = requireDetail(
      sqlite
        .prepare(
          `SELECT version,CAST(subtotal_minor AS TEXT) subtotal_minor,
                  CAST(tax_minor AS TEXT) tax_minor,CAST(total_minor AS TEXT) total_minor,
                  currency,issued_at,due_at FROM invoice WHERE id=?`,
        )
        .get(id) as DbRow | undefined,
      'ledger',
    );
    assertMoneyField(
      'ledger subtotal',
      row,
      source.amountMinor,
      'subtotalMinor',
      'subtotal_minor',
      'netMinor',
      'net_minor',
    );
    assertMoneyField(
      'ledger tax amount',
      row,
      invoice.tax_minor as AccountingPackMoney,
      'taxMinor',
      'tax_minor',
    );
    assertMoneyField(
      'ledger total amount',
      row,
      invoice.total_minor as AccountingPackMoney,
      'totalMinor',
      'total_minor',
      'grossMinor',
      'gross_minor',
    );
    assertTextField('ledger currency', row, source.currency, 'currency');
    if (row.version !== undefined && Number(row.version) !== source.version) fail('ledger version');
    assertEffectiveDate(
      'ledger issue date',
      row,
      source.effectiveAt,
      'issueDate',
      'issue_date',
      'issuedAt',
      'issued_at',
    );
    assertEffectiveDate(
      'ledger due date',
      row,
      invoice.due_at,
      'dueDate',
      'due_date',
      'dueAt',
      'due_at',
    );
  }

  if (details.totalsByCurrency.length > 0) {
    if (details.totalsByCurrency.length !== 1)
      throw new AccountingPackRevisionError(
        'totalsByCurrency does not match authoritative Accounting Pack detail rows',
      );
    const row = asObject(details.totalsByCurrency[0]);
    const rowCurrency = detailText(row, 'currency');
    const assertedNet =
      row.totalInvoicedMinor ?? row.netMinor ?? row.net_minor ?? row.total_invoiced_minor;
    if (
      rowCurrency !== currency ||
      assertedNet === undefined ||
      safeMoney(assertedNet, 'totalsByCurrency net amount') !== values.netMinor
    )
      throw new AccountingPackRevisionError(
        'totalsByCurrency does not match authoritative Accounting Pack detail rows',
      );
    assertMoneyField(
      'totalsByCurrency tax amount',
      row,
      values.taxMinor,
      'taxInvoicedMinor',
      'tax_invoiced_minor',
      'taxMinor',
      'tax_minor',
    );
    assertMoneyField(
      'totalsByCurrency gross amount',
      row,
      values.grossMinor,
      'grossInvoicedMinor',
      'gross_invoiced_minor',
      'grossMinor',
      'gross_minor',
    );
    assertMoneyField(
      'totalsByCurrency collected amount',
      row,
      values.collectedMinor,
      'collectedMinor',
      'collected_minor',
    );
    assertMoneyField(
      'totalsByCurrency outstanding amount',
      row,
      values.outstandingMinor,
      'outstandingMinor',
      'outstanding_minor',
    );
    assertMoneyField(
      'totalsByCurrency worker cost',
      row,
      values.workerCostMinor,
      'internalLaborCostMinor',
      'internal_labor_cost_minor',
    );
    assertMoneyField(
      'totalsByCurrency direct cost',
      row,
      values.directCostMinor,
      'directCostMinor',
      'direct_cost_minor',
    );
    assertMoneyField(
      'totalsByCurrency contribution',
      row,
      values.contributionMinor,
      'contributionMinor',
      'contribution_minor',
    );
  }
}

function normalizeSnapshot(
  sqlite: DatabaseSync,
  input: AccountingPackSnapshotInput,
  sourceItems: readonly AccountingPackSourceItemInput[],
  periodStart: string,
  periodEnd: string,
  currency: string,
  timezone: string,
  scope: Parameters<typeof validateAuthoritativeSourceItems>[6],
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
  const sourceAuthority = validateAuthoritativeSourceItems(
    sqlite,
    sourceItems as Parameters<typeof validateAuthoritativeSourceItems>[1],
    periodStart,
    periodEnd,
    timezone,
    currency,
    scope,
  );
  if (sourceAuthority.reasons.length > 0)
    throw new AccountingPackRevisionError(
      `Accounting Pack source authority mismatch: ${sourceAuthority.reasons.join(', ')}`,
    );
  // Caller aggregates are assertions only.  The immutable snapshot is built
  // exclusively from authoritative rows resolved above in this transaction.
  // Rejecting a disagreement prevents a balanced forged projection from
  // becoming an apparently clean historical revision.
  for (const field of Object.keys(sourceAuthority.values) as Array<keyof SnapshotValues>)
    if (values[field] !== sourceAuthority.values[field])
      throw new AccountingPackRevisionError(
        `${field} does not match authoritative Accounting Pack sources`,
      );
  const canonicalValues = sourceAuthority.values;
  assertSnapshotDetailsAuthoritative(
    sqlite,
    sourceItems,
    { invoiceRegister, collections, workerCosts, expenseRegister, ledger, totalsByCurrency },
    canonicalValues,
    currency,
  );
  for (const [field, value] of [
    ['netMinor', canonicalValues.netMinor],
    ['taxMinor', canonicalValues.taxMinor],
    ['grossMinor', canonicalValues.grossMinor],
    ['collectedMinor', canonicalValues.collectedMinor],
    ['outstandingMinor', canonicalValues.outstandingMinor],
    ['workerCostMinor', canonicalValues.workerCostMinor],
    ['expenseCostMinor', canonicalValues.expenseCostMinor],
    ['directCostMinor', canonicalValues.directCostMinor],
  ] as const)
    if (value < 0n) throw new AccountingPackRevisionError(`${field} must be non-negative`);
  if (canonicalValues.grossMinor !== canonicalValues.netMinor + canonicalValues.taxMinor)
    throw new AccountingPackRevisionError('Gross must equal net plus tax');
  if (
    canonicalValues.directCostMinor !==
    canonicalValues.workerCostMinor + canonicalValues.expenseCostMinor
  )
    throw new AccountingPackRevisionError('Direct cost must equal worker plus expense cost');
  if (
    canonicalValues.contributionMinor !==
    canonicalValues.netMinor - canonicalValues.directCostMinor
  )
    throw new AccountingPackRevisionError('Contribution must equal net minus direct cost');
  if (canonicalValues.sourceItemCount !== sourceItems.length)
    throw new AccountingPackRevisionError('Source item count does not match source-cut items');
  const canonicalReconciliation = deriveCanonicalReconciliation(sourceItems, canonicalValues);

  const totals = {
    currency,
    net_minor: canonicalValues.netMinor,
    tax_minor: canonicalValues.taxMinor,
    gross_minor: canonicalValues.grossMinor,
    collected_minor: canonicalValues.collectedMinor,
    outstanding_minor: canonicalValues.outstandingMinor,
    worker_cost_minor: canonicalValues.workerCostMinor,
    expense_cost_minor: canonicalValues.expenseCostMinor,
    direct_cost_minor: canonicalValues.directCostMinor,
    contribution_minor: canonicalValues.contributionMinor,
  };
  const sourceProjection = {
    invoice_source_count: canonicalValues.invoiceSourceCount,
    source_mismatch_count: canonicalValues.sourceMismatchCount,
    approved_time_entry_count: canonicalValues.approvedTimeEntryCount,
    approved_expense_count: canonicalValues.approvedExpenseCount,
    source_item_count: canonicalValues.sourceItemCount,
  };
  const exactProjection = {
    invoice_count: canonicalValues.invoiceCount,
    payment_count: canonicalValues.paymentCount,
    worker_cost_count: canonicalValues.workerCostCount,
    expense_count: canonicalValues.expenseCount,
    source_item_count: canonicalValues.sourceItemCount,
    net_minor: canonicalValues.netMinor,
    tax_minor: canonicalValues.taxMinor,
    gross_minor: canonicalValues.grossMinor,
    collected_minor: canonicalValues.collectedMinor,
    outstanding_minor: canonicalValues.outstandingMinor,
    worker_cost_minor: canonicalValues.workerCostMinor,
    expense_cost_minor: canonicalValues.expenseCostMinor,
    direct_cost_minor: canonicalValues.directCostMinor,
    contribution_minor: canonicalValues.contributionMinor,
  };
  const snapshotObject = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    period_start: periodStart,
    period_end: periodEnd,
    currency,
    timezone,
    invoice_count: canonicalValues.invoiceCount,
    payment_count: canonicalValues.paymentCount,
    worker_cost_count: canonicalValues.workerCostCount,
    expense_count: canonicalValues.expenseCount,
    source_item_count: canonicalValues.sourceItemCount,
    invoice_source_count: canonicalValues.invoiceSourceCount,
    source_mismatch_count: canonicalValues.sourceMismatchCount,
    approved_time_entry_count: canonicalValues.approvedTimeEntryCount,
    approved_expense_count: canonicalValues.approvedExpenseCount,
    net_minor: canonicalValues.netMinor,
    tax_minor: canonicalValues.taxMinor,
    gross_minor: canonicalValues.grossMinor,
    collected_minor: canonicalValues.collectedMinor,
    outstanding_minor: canonicalValues.outstandingMinor,
    worker_cost_minor: canonicalValues.workerCostMinor,
    expense_cost_minor: canonicalValues.expenseCostMinor,
    direct_cost_minor: canonicalValues.directCostMinor,
    contribution_minor: canonicalValues.contributionMinor,
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
    invoice_source_count: canonicalValues.invoiceSourceCount,
    source_mismatch_count: canonicalValues.sourceMismatchCount,
    approved_time_entry_count: canonicalValues.approvedTimeEntryCount,
    approved_expense_count: canonicalValues.approvedExpenseCount,
    checks: canonicalReconciliation.checks,
    reconciles: canonicalReconciliation.reconciles,
  };
  return {
    snapshotJson: canonicalJson(snapshotObject),
    reconciliationJson: canonicalJson(reconciliationObject),
    values: canonicalValues,
    reconciliation: canonicalReconciliation,
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
    ).toLowerCase();
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
        `source-evidence-${sha256(
          `${normalizedKind}:${normalizedSourceId}:${normalizedVersion}:${periodStart}:${periodEnd}`,
        ).slice(0, 32)}`,
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
    const uniqueness = `${normalizedKind}:${normalizedSourceId}`;
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
  const legacyEvidenceMatches = (blob: Uint8Array, stableBlob: Buffer): boolean => {
    const withoutPhysicalId = Buffer.from(blob)
      .toString('utf8')
      .replace(/,"evidence_id":"(?:\\.|[^"\\])*"/u, '');
    return withoutPhysicalId === stableBlob.toString('utf8');
  };
  const resolvedItems = normalizedItems.map((item) => {
    const legacySemanticId = `${item.normalizedKind}:${item.normalizedSourceId}:${item.normalizedVersion}`;
    const scopedSemanticId = `${legacySemanticId}:${periodStart}:${periodEnd}:${currency}`;
    const suppliedOwner = sqlite
      .prepare(
        `SELECT evidence_id,semantic_id,canonical_blob,evidence_hash
           FROM finance_hash_evidence WHERE evidence_id=?`,
      )
      .get(item.normalizedEvidenceId) as
      | {
          evidence_id: string;
          semantic_id: string;
          canonical_blob: Uint8Array;
          evidence_hash: string;
        }
      | undefined;
    if (
      suppliedOwner &&
      suppliedOwner.semantic_id !== legacySemanticId &&
      suppliedOwner.semantic_id !== scopedSemanticId
    )
      throw new AccountingPackRevisionError('Source item evidence semantic identity conflict');
    const semanticOwner =
      suppliedOwner ??
      (sqlite
        .prepare(
          `SELECT evidence_id,semantic_id,canonical_blob,evidence_hash
             FROM finance_hash_evidence
            WHERE evidence_type=? AND contract_version='accounting-pack-source-item-v1'
              AND semantic_id IN(?,?)
            ORDER BY CASE semantic_id WHEN ? THEN 0 ELSE 1 END`,
        )
        .get(item.normalizedEvidenceType, scopedSemanticId, legacySemanticId, scopedSemanticId) as
        | {
            evidence_id: string;
            semantic_id: string;
            canonical_blob: Uint8Array;
            evidence_hash: string;
          }
        | undefined);
    if (semanticOwner && legacyEvidenceMatches(semanticOwner.canonical_blob, item.evidenceBlob))
      return {
        ...item,
        canonicalEvidenceId: semanticOwner.evidence_id,
        canonicalEvidenceHash: semanticOwner.evidence_hash,
      };
    const canonicalEvidence = ensureEvidenceRecord(
      sqlite,
      item.normalizedEvidenceId,
      item.normalizedEvidenceType,
      'accounting-pack-source-item-v1',
      semanticOwner?.semantic_id ?? scopedSemanticId,
      item.evidenceBlob,
      createdAt,
    );
    return {
      ...item,
      canonicalEvidenceId: canonicalEvidence.evidenceId,
      canonicalEvidenceHash: canonicalEvidence.evidenceHash,
    };
  });
  const cutItemIdentity = (item: (typeof resolvedItems)[number]) => {
    const id = `fp-source-cut-item-${sha256(`${sourceCutId}:${item.normalizedId}`).slice(0, 40)}`;
    const hash = sha256(
      canonicalJson({
        schema_version: 'accounting-pack-source-cut-item-v1',
        cut_id: sourceCutId,
        item_id: item.normalizedId,
        evidence_hash: item.canonicalEvidenceHash,
      }),
    );
    return { id, hash };
  };
  const watermarkInput = (input as unknown as Record<string, unknown>).changeSequenceHighWatermark;
  const databaseMaximum = Number(
    (
      sqlite
        .prepare('SELECT COALESCE(MAX(change_sequence),0) value FROM finance_change_event')
        .get() as {
        value: number;
      }
    ).value,
  );
  const watermark =
    watermarkInput === undefined
      ? databaseMaximum
      : safeCount(watermarkInput, 'Change sequence high watermark');
  if (watermark !== databaseMaximum)
    throw new AccountingPackRevisionError(
      'Change sequence high watermark must equal the current database maximum',
    );
  const cutPayload = {
    schema_version: 'accounting-pack-source-cut-v1',
    cut_id: sourceCutId,
    tenant_id: deployment.tenantId,
    deployment_id: deployment.deploymentId,
    legal_entity_revision_id: legalEntityRevisionId,
    currency,
    period_start: periodStart,
    period_end: periodEnd,
    change_sequence_high_watermark: watermark,
    items: resolvedItems.map((item) => {
      const identity = cutItemIdentity(item);
      return { id: identity.id, item_hash: identity.hash };
    }),
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
  for (const item of resolvedItems) {
    const membership = cutItemIdentity(item);
    const existingItem = sqlite
      .prepare(
        'SELECT *,CAST(amount_minor AS TEXT) amount_minor_text FROM finance_source_cut_item WHERE id=?',
      )
      .get(membership.id) as DbRow | undefined;
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
          evidence_id: item.canonicalEvidenceId,
          evidence_hash: item.canonicalEvidenceHash,
          amount_minor_text: item.normalizedAmountMinor?.toString() ?? null,
          currency,
          item_hash: membership.hash,
        },
        'Source cut item',
      );
      continue;
    }
    insertItem.run(
      membership.id,
      sourceCutId,
      item.normalizedKind,
      item.normalizedSourceId,
      item.normalizedVersion,
      item.normalizedEffectiveAt,
      item.normalizedEvidenceType,
      item.canonicalEvidenceId,
      item.canonicalEvidenceHash,
      item.normalizedAmountMinor,
      currency,
      membership.hash,
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
        periodEnd,
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
      const callerRevision = this.sqlite
        .prepare('SELECT * FROM accounting_pack_revision WHERE revision_id=?')
        .get(revisionId) as DbRow | undefined;
      if (callerRevision)
        assertExistingRow(
          callerRevision,
          {
            series_id: seriesId,
            tenant_id: deployment.tenantId,
            deployment_id: deployment.deploymentId,
            legal_entity_revision_id: legalEntityRevisionId,
            currency,
            timezone,
            period_start: periodStart,
            period_end: periodEnd,
          },
          'Accounting pack revision',
        );
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
        this.sqlite,
        input,
        normalizedItems,
        periodStart,
        periodEnd,
        currency,
        timezone,
        { deployment, legacyLegalEntityId, legalEntityRevisionId },
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
            snapshot.reconciliation.reconciles ? 'CLEAN' : 'BLOCKED',
            0n,
            Object.values(snapshot.reconciliation.checks).filter((value) => !value).length +
              snapshot.values.sourceMismatchCount,
            snapshot.reconciliation.reconciles ? 'candidate' : 'failed',
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
        const sourceCutItemId = `fp-source-cut-item-${sha256(
          `${sourceCutId}:${item.normalizedId}`,
        ).slice(0, 40)}`;
        const canonicalSourceItem = this.sqlite
          .prepare('SELECT evidence_hash FROM finance_source_cut_item WHERE id=?')
          .get(sourceCutItemId) as { evidence_hash: string } | undefined;
        if (!canonicalSourceItem)
          throw new AccountingPackRevisionError('Canonical source cut item is missing');
        const projectionId = `fp-source-projection-${sha256(`${batchId}:${sourceCutItemId}`).slice(0, 40)}`;
        const projection = this.sqlite
          .prepare('SELECT * FROM accounting_pack_source_cut_item WHERE id=?')
          .get(projectionId) as DbRow | undefined;
        if (projection)
          assertExistingRow(
            projection,
            {
              batch_id: batchId,
              source_cut_item_id: sourceCutItemId,
              evidence_hash: canonicalSourceItem.evidence_hash,
            },
            'Source cut projection',
          );
        else
          this.sqlite
            .prepare(
              'INSERT INTO accounting_pack_source_cut_item(id,batch_id,source_cut_item_id,evidence_hash) VALUES(?,?,?,?)',
            )
            .run(projectionId, batchId, sourceCutItemId, canonicalSourceItem.evidence_hash);
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
