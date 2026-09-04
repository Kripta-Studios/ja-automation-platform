import { createDatabase } from '@ja/database';
import { createHash, timingSafeEqual } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../e2e/auth.js';
import { e2eDatabasePath, e2eDocumentRoot } from '../e2e/environment.js';
import { e2eDeploymentId, e2eTenantId } from '../e2e/support/deployment-fixture.js';

/**
 * The single deterministic data contract used by the Client Essential UAT.
 *
 * `globalSetup` seeds the disposable database with the same showcase rows for
 * every Playwright invocation.  This fixture deliberately identifies rows by
 * stable business values (rather than generated UUIDs), while the UAT creates
 * its own prefixed client/project/invitation values for mutation coverage.
 */
export const clientEssentialFixture = Object.freeze({
  tenantId: e2eTenantId,
  deploymentId: e2eDeploymentId,
  databasePath: e2eDatabasePath,
  documentRoot: e2eDocumentRoot,
  period: Object.freeze({ start: '2026-08-01', end: '2026-08-24' }),
  seededClient: Object.freeze({
    legalName: 'Northline Mobility (Demo)',
    displayName: 'Northline Mobility · Demo',
  }),
  seededProject: Object.freeze({
    name: 'Body Shop Line 4 Controls Upgrade · Demo',
    timezone: 'America/Detroit',
    costCenter: 'COST-L4',
    purchaseOrder: 'DEMO-PO-24017',
  }),
  mutation: Object.freeze({
    clientCode: 'UAT-CE-20260824',
    legalName: 'Client Essential UAT 2026',
    displayName: 'Client Essential UAT · 2026',
    projectName: 'Client Essential UAT Project · 2026',
    costCenter: 'UAT-CE-COST-2026',
    purchaseOrder: 'UAT-CE-PO-2026',
    invitationPrefix: 'client-essential-uat-20260824',
    workerEmail: 'client-essential-uat-20260824-worker@example.test',
    managerEmail: 'client-essential-uat-20260824-manager@example.test',
    financeEmail: 'client-essential-uat-20260824-finance@example.test',
  }),
  worker: Object.freeze({
    name: 'Alex Rivera',
    email: e2eCredentials.worker.email,
  }),
  roles: Object.freeze(['owner', 'worker', 'manager', 'finance'] as const),
});

export type ClientEssentialFixture = typeof clientEssentialFixture;

export type ClientEssentialStep = Readonly<{
  number: number;
  requirement: string;
  title: string;
  role: 'owner' | 'worker' | 'manager' | 'finance' | 'system';
  route: string;
  mutation: boolean;
  viewports: readonly [number, ...number[]];
}>;

/**
 * Canonical one-to-one mapping to section 8 of the Client Essential spec.
 * Keeping the catalogue in the test-owned fixture makes omissions visible in
 * review and lets reports use the same identifiers as the checklist.
 */
export const CLIENT_ESSENTIAL_32_STEPS = Object.freeze([
  {
    number: 1,
    requirement: 'CORE-01',
    title: 'Owner invites Worker, PM and Finance users',
    role: 'owner',
    route: '/projects',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 2,
    requirement: 'CORE-02',
    title: 'Admin creates a client',
    role: 'owner',
    route: '/projects',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 3,
    requirement: 'CORE-02',
    title: 'Admin creates a project',
    role: 'owner',
    route: '/projects',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 4,
    requirement: 'CORE-03',
    title: 'Admin configures reference hours and minimum billable rule',
    role: 'owner',
    route: '/projects/:id',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 5,
    requirement: 'CORE-02',
    title: 'Admin configures budget, PO, commercial and identifiers',
    role: 'owner',
    route: '/projects/:id',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 6,
    requirement: 'CORE-02',
    title: 'Admin assigns active workers with effective dates',
    role: 'owner',
    route: '/projects',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 7,
    requirement: 'CORE-03',
    title: 'Admin configures compensation, internal cost, overtime and Travel',
    role: 'finance',
    route: '/finance?view=commercial',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 8,
    requirement: 'CORE-05',
    title: 'Percentage-based worker can be configured',
    role: 'finance',
    route: '/finance?view=commercial',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 9,
    requirement: 'CORE-06',
    title: 'Reimbursable versus all-in Travel/expenses are configured',
    role: 'finance',
    route: '/finance?view=commercial',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 10,
    requirement: 'CORE-10',
    title: 'Labor and expense streams/cadences/tax profiles can differ',
    role: 'finance',
    route: '/billing',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 11,
    requirement: 'CORE-04',
    title: 'Worker opens the portal on a phone',
    role: 'worker',
    route: '/',
    mutation: false,
    viewports: [360, 390],
  },
  {
    number: 12,
    requirement: 'CORE-04',
    title: 'Worker records actual time and Admin correction preserves history',
    role: 'worker',
    route: '/time',
    mutation: true,
    viewports: [390],
  },
  {
    number: 13,
    requirement: 'CORE-05',
    title: 'Worker sees own pay/status/dates without commercial data',
    role: 'worker',
    route: '/pay',
    mutation: false,
    viewports: [390],
  },
  {
    number: 14,
    requirement: 'CORE-07',
    title: 'Worker submits a daily report and customer report is zero-money',
    role: 'worker',
    route: '/reports',
    mutation: true,
    viewports: [390],
  },
  {
    number: 15,
    requirement: 'CORE-07',
    title: 'Worker submits a PLC/technical report with backup attachment',
    role: 'worker',
    route: '/reports',
    mutation: true,
    viewports: [390],
  },
  {
    number: 16,
    requirement: 'CORE-06',
    title: 'Worker submits an expense with a receipt',
    role: 'worker',
    route: '/expenses',
    mutation: true,
    viewports: [390],
  },
  {
    number: 17,
    requirement: 'CORE-08',
    title: 'PM approves or rejects operational records',
    role: 'manager',
    route: '/approvals',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 18,
    requirement: 'CORE-09',
    title: 'Finance reviews billability, compensation, cost, revenue and dates',
    role: 'finance',
    route: '/finance',
    mutation: false,
    viewports: [1440],
  },
  {
    number: 19,
    requirement: 'CORE-09',
    title: 'Project finance exposes reconciled economics and source drill-down',
    role: 'finance',
    route: '/projects/:id',
    mutation: false,
    viewports: [1440],
  },
  {
    number: 20,
    requirement: 'CORE-06',
    title: 'All-in expense affects project cost without entering an expense invoice',
    role: 'finance',
    route: '/finance',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 21,
    requirement: 'CORE-06',
    title: 'Reimbursable expense enters billing after approval',
    role: 'finance',
    route: '/finance',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 22,
    requirement: 'CORE-07/10',
    title: 'Period close creates customer report and gates labor invoice',
    role: 'finance',
    route: '/reports',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 23,
    requirement: 'CORE-11',
    title: 'Finance issues an immutable identified invoice',
    role: 'finance',
    route: '/billing',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 24,
    requirement: 'CORE-05/12',
    title: 'Finance records client payments and worker/expense payment states',
    role: 'finance',
    route: '/billing',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 25,
    requirement: 'CORE-12',
    title: 'Invoice and collection ledger reconciles',
    role: 'finance',
    route: '/ledger',
    mutation: false,
    viewports: [1440],
  },
  {
    number: 26,
    requirement: 'CORE-13',
    title: 'Monthly Accounting/Finance export reconciles to source data',
    role: 'finance',
    route: '/accounting',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 27,
    requirement: 'CORE-13/16',
    title: 'Pending/failed artifacts are truthful and safely retryable',
    role: 'finance',
    route: '/accounting',
    mutation: true,
    viewports: [1440],
  },
  {
    number: 28,
    requirement: 'CORE-15',
    title: 'Worker/PM cannot access private Finance data',
    role: 'worker',
    route: '/finance',
    mutation: false,
    viewports: [390, 768],
  },
  {
    number: 29,
    requirement: 'CORE-14',
    title: 'Critical flows work on phone, tablet and desktop',
    role: 'system',
    route: '/',
    mutation: false,
    viewports: [360, 390, 768, 1440],
  },
  {
    number: 30,
    requirement: 'CORE-16',
    title: 'Automatic jobs work without manual queue processing',
    role: 'system',
    route: '/health/ready',
    mutation: false,
    viewports: [1440],
  },
  {
    number: 31,
    requirement: 'CORE-17',
    title:
      'Continuity is proven or explicitly waived by the Owner without weakening local safeguards',
    role: 'system',
    route: '/health/ready',
    mutation: false,
    viewports: [1440],
  },
  {
    number: 32,
    requirement: 'CORE-17',
    title: 'Production deployment starts correctly behind Caddy',
    role: 'system',
    route: '/health/live',
    mutation: false,
    viewports: [1440],
  },
] as const satisfies readonly ClientEssentialStep[]);

if (CLIENT_ESSENTIAL_32_STEPS.length !== 32)
  throw new Error('Client Essential UAT must contain exactly 32 steps');

export const stepByNumber = (number: number): ClientEssentialStep => {
  const step = CLIENT_ESSENTIAL_32_STEPS.find((candidate) => candidate.number === number);
  if (!step) throw new Error(`Unknown Client Essential UAT step ${number}`);
  return step;
};

/**
 * Operations evidence is intentionally a separate, operator-produced input.
 * Browser coverage cannot prove a systemd timer ran on a production host or
 * that a remote encrypted backup was restored into an isolated target. The
 * contract below lets those gates be consumed when the evidence exists while
 * keeping a missing/invalid/stale attachment an explicit release blocker.
 *
 * The digest is SHA-256 over the canonical JSON representation of the
 * contract with the top-level `sha256` field removed. Callers that need
 * stronger provenance may also provide JA_E2E_OPERATIONS_EVIDENCE_SHA256 as a
 * detached digest; the parser compares it in constant time.
 */
export const CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SCHEMA =
  'ja.client-essential.operations-evidence.v1' as const;
export const CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_ENV = 'JA_E2E_OPERATIONS_EVIDENCE' as const;
export const CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_PATH_ENV =
  'JA_E2E_OPERATIONS_EVIDENCE_PATH' as const;
export const CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SHA256_ENV =
  'JA_E2E_OPERATIONS_EVIDENCE_SHA256' as const;
export const CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

type JsonObject = Readonly<Record<string, unknown>>;

type OperationsRunEvidence = Readonly<{
  id: string;
  status: 'PASS';
  automatic: true;
  completedAt: string;
}>;

type ContinuityPassEvidence = Readonly<{
  status: 'PASS';
  remoteCopy: true;
  encrypted: true;
  restoreDrill: Readonly<{ status: 'PASS'; completedAt: string }>;
}>;

type ContinuityWaiverEvidence = Readonly<{
  status: 'WAIVED';
  releaseBlocking: false;
  waivedBy: 'owner';
  waivedAt: string;
  reason: string;
  localBackup: Readonly<{ status: 'PASS'; completedAt: string }>;
  rollback: Readonly<{ status: 'PASS'; verifiedAt: string }>;
}>;

export type ClientEssentialOperationsEvidence = Readonly<{
  schema: typeof CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SCHEMA;
  schemaVersion: 1;
  evidenceId: string;
  capturedAt: string;
  tenantId: string;
  deploymentId: string;
  sha256: string;
  jobs: Readonly<{
    status: 'PASS';
    manualProcessing: false;
    runs: readonly [OperationsRunEvidence, OperationsRunEvidence, ...OperationsRunEvidence[]];
  }>;
  continuity: ContinuityPassEvidence | ContinuityWaiverEvidence;
  expiresAt?: string;
}>;

export type OperationsEvidencePreflight =
  | Readonly<{
      status: 'READY';
      path: string;
      evidence: ClientEssentialOperationsEvidence;
    }>
  | Readonly<{
      status: 'BLOCKED';
      code: string;
      prerequisite: 'automatic-jobs' | 'continuity-backup';
      message: string;
      path?: string;
    }>;

type OperationsEvidenceOptions = Readonly<{
  now?: number;
  maxAgeMs?: number;
  expectedSha256?: string;
  expectedTenantId?: string;
  expectedDeploymentId?: string;
}>;

type ReadOperationsEvidenceOptions = OperationsEvidenceOptions &
  Readonly<{
    path?: string;
    environment?: NodeJS.ProcessEnv;
  }>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new OperationsEvidenceError('OPERATIONS_EVIDENCE_SCHEMA_INVALID', `${field} is required`);
  return value.trim();
}

function parseTimestamp(value: unknown, field: string, now: number): string {
  const result = requiredString(value, field);
  const timestamp = Date.parse(result);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_TIMESTAMP_INVALID',
      `${field} is not a valid non-future timestamp`,
    );
  return result;
}

function parseDate(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!Number.isFinite(Date.parse(result)))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_TIMESTAMP_INVALID',
      `${field} is not a valid timestamp`,
    );
  return result;
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
        'Evidence contains a non-finite number',
      );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  throw new OperationsEvidenceError(
    'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
    'Evidence contains an unsupported JSON value',
  );
}

function withoutDigest(value: JsonObject): JsonObject {
  const copy = { ...value };
  delete copy.sha256;
  return copy;
}

/** Return the digest expected in a contract's top-level sha256 field. */
export function operationsEvidenceSha256(value: unknown): string {
  if (!isObject(value))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
      'Evidence must be an object',
    );
  return createHash('sha256')
    .update(canonicalJson(withoutDigest(value)), 'utf8')
    .digest('hex');
}

function digestMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual.toLowerCase(), 'utf8');
  const expectedBytes = Buffer.from(expected.toLowerCase(), 'utf8');
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function statusPass(value: unknown): boolean {
  return (
    typeof value === 'string' && /^(?:pass|passed|success|succeeded|ok|healthy)$/iu.test(value)
  );
}

function statusWaived(value: unknown): boolean {
  return typeof value === 'string' && /^waived$/iu.test(value);
}

function booleanAlias(value: JsonObject, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof value[key] === 'boolean') return value[key] as boolean;
  }
  return undefined;
}

function objectAlias(value: JsonObject, ...keys: string[]): JsonObject | undefined {
  for (const key of keys) {
    if (isObject(value[key])) return value[key];
  }
  return undefined;
}

function arrayAlias(value: JsonObject, ...keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return undefined;
}

function normalizeRun(run: unknown, index: number, now: number): OperationsRunEvidence {
  if (!isObject(run))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      `jobs.runs[${index}] must be an object`,
    );
  const id = requiredString(run.id ?? run.runId ?? run.executionId, `jobs.runs[${index}].id`);
  if (!statusPass(run.status ?? run.result ?? run.outcome ?? run.state))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      `jobs.runs[${index}] must have a successful status`,
    );
  if (run.automatic !== true)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      `jobs.runs[${index}] must prove automatic timer execution`,
    );
  if (run.manualProcessing === true || run.manual === true)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      `jobs.runs[${index}] records manual queue processing`,
    );
  const completedAt = parseTimestamp(
    run.completedAt ?? run.finishedAt ?? run.endedAt,
    `jobs.runs[${index}].completedAt`,
    now,
  );
  return { id, status: 'PASS', automatic: true, completedAt };
}

function normalizeJobs(value: unknown, now: number): ClientEssentialOperationsEvidence['jobs'] {
  if (!isObject(value))
    throw new OperationsEvidenceError('OPERATIONS_EVIDENCE_JOBS_INVALID', 'jobs is required');
  if (!statusPass(value.status ?? value.result ?? value.outcome ?? value.state))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      'jobs must have a successful overall status',
    );
  const manualProcessing = booleanAlias(
    value,
    'manualProcessing',
    'manualQueueProcessing',
    'requiresManualProcessing',
  );
  if (manualProcessing !== false)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      'jobs.manualProcessing must be false',
    );
  const runs = arrayAlias(value, 'runs', 'timerRuns', 'automaticRuns');
  if (!runs || runs.length < 2)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      'jobs.runs must contain at least two automatic successful timer runs',
    );
  const normalizedRuns = runs.map((run, index) => normalizeRun(run, index, now));
  const uniqueRunKeys = new Set(normalizedRuns.map((run) => `${run.id}|${run.completedAt}`));
  if (uniqueRunKeys.size !== normalizedRuns.length)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JOBS_INVALID',
      'jobs.runs must identify distinct timer executions',
    );
  return {
    status: 'PASS',
    manualProcessing: false,
    runs: normalizedRuns as [
      OperationsRunEvidence,
      OperationsRunEvidence,
      ...OperationsRunEvidence[],
    ],
  };
}

function normalizeContinuity(
  value: unknown,
  now: number,
  maxAgeMs: number,
): ClientEssentialOperationsEvidence['continuity'] {
  if (!isObject(value))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
      'continuity is required',
    );
  const rawStatus = value.status ?? value.result ?? value.outcome ?? value.state;
  if (statusWaived(rawStatus)) {
    if (value.releaseBlocking !== false)
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
        'waived continuity must explicitly set releaseBlocking=false',
      );
    if (value.waivedBy !== 'owner')
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
        'waived continuity must be authorized by the owner',
      );
    const waivedAt = parseTimestamp(value.waivedAt, 'continuity.waivedAt', now);
    if (now - Date.parse(waivedAt) > maxAgeMs)
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_STALE',
        'continuity.waivedAt is outside the evidence freshness window',
      );
    const reason = requiredString(value.reason, 'continuity.reason');
    const localBackup = objectAlias(value, 'localBackup');
    if (
      !localBackup ||
      !statusPass(
        localBackup.status ?? localBackup.result ?? localBackup.outcome ?? localBackup.state,
      )
    )
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
        'waived continuity must retain a successful local backup',
      );
    const localBackupCompletedAt = parseTimestamp(
      localBackup.completedAt ?? localBackup.finishedAt ?? localBackup.endedAt,
      'continuity.localBackup.completedAt',
      now,
    );
    if (now - Date.parse(localBackupCompletedAt) > maxAgeMs)
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_STALE',
        'continuity.localBackup.completedAt is outside the evidence freshness window',
      );
    const rollback = objectAlias(value, 'rollback');
    if (
      !rollback ||
      !statusPass(rollback.status ?? rollback.result ?? rollback.outcome ?? rollback.state)
    )
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
        'waived continuity must retain verified rollback material',
      );
    const rollbackVerifiedAt = parseTimestamp(
      rollback.verifiedAt ?? rollback.completedAt ?? rollback.finishedAt,
      'continuity.rollback.verifiedAt',
      now,
    );
    if (now - Date.parse(rollbackVerifiedAt) > maxAgeMs)
      throw new OperationsEvidenceError(
        'OPERATIONS_EVIDENCE_STALE',
        'continuity.rollback.verifiedAt is outside the evidence freshness window',
      );
    return {
      status: 'WAIVED',
      releaseBlocking: false,
      waivedBy: 'owner',
      waivedAt,
      reason,
      localBackup: { status: 'PASS', completedAt: localBackupCompletedAt },
      rollback: { status: 'PASS', verifiedAt: rollbackVerifiedAt },
    };
  }
  if (!statusPass(rawStatus))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
      'continuity must have a successful overall status',
    );

  const remote = objectAlias(value, 'remote', 'remoteCopy', 'replication');
  const remoteCopy =
    booleanAlias(value, 'remoteCopy', 'remoteReplicated', 'separateHost') === true ||
    (remote !== undefined &&
      (booleanAlias(remote, 'ready', 'replicated', 'remoteCopy') === true ||
        statusPass(remote.status ?? remote.result ?? remote.outcome ?? remote.state)));
  if (!remoteCopy)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
      'continuity must prove a completed separate-host remote copy',
    );

  const encryption = objectAlias(value, 'encryption', 'remoteEncryption');
  const encrypted =
    booleanAlias(value, 'encrypted', 'remoteEncrypted', 'encryptionEnabled') === true ||
    (encryption !== undefined && booleanAlias(encryption, 'enabled', 'encrypted') === true) ||
    (remote !== undefined && booleanAlias(remote, 'encrypted', 'encryptionEnabled') === true);
  if (!encrypted)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
      'continuity must explicitly prove encrypted remote storage',
    );

  const restore = objectAlias(value, 'restoreDrill', 'restore', 'drill');
  if (!restore || !statusPass(restore.status ?? restore.result ?? restore.outcome ?? restore.state))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_CONTINUITY_INVALID',
      'continuity.restoreDrill must have a successful status',
    );
  const completedAt = parseTimestamp(
    restore.completedAt ?? restore.finishedAt ?? restore.endedAt ?? value.completedAt,
    'continuity.restoreDrill.completedAt',
    now,
  );
  return {
    status: 'PASS',
    remoteCopy: true,
    encrypted: true,
    restoreDrill: { status: 'PASS', completedAt },
  };
}

export class OperationsEvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OperationsEvidenceError';
    this.code = code;
  }
}

/** Parse and validate a contract value without touching the filesystem. */
export function parseClientEssentialOperationsEvidence(
  value: unknown,
  options: OperationsEvidenceOptions = {},
): ClientEssentialOperationsEvidence {
  if (!isObject(value))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
      'Evidence must be an object',
    );
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_MAX_AGE_MS;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
      'Evidence max age is invalid',
    );
  if (value.schema !== CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SCHEMA || value.schemaVersion !== 1)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_SCHEMA_INVALID',
      `Evidence schema must be ${CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SCHEMA} version 1`,
    );
  const evidenceId = requiredString(value.evidenceId, 'evidenceId');
  const capturedAt = parseTimestamp(value.capturedAt ?? value.generatedAt, 'capturedAt', now);
  const capturedMs = Date.parse(capturedAt);
  if (now - capturedMs > maxAgeMs)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_STALE',
      `Evidence captured at ${capturedAt} is older than the ${maxAgeMs}ms freshness window`,
    );
  const hasExpiresAt = Object.prototype.hasOwnProperty.call(value, 'expiresAt');
  const expiresAt = hasExpiresAt ? parseDate(value.expiresAt, 'expiresAt') : undefined;
  if (expiresAt && Date.parse(expiresAt) < now)
    throw new OperationsEvidenceError('OPERATIONS_EVIDENCE_STALE', 'Evidence has expired');
  const tenantId = requiredString(value.tenantId, 'tenantId');
  const deploymentId = requiredString(value.deploymentId, 'deploymentId');
  const continuityRequestsWaiver =
    isObject(value.continuity) &&
    statusWaived(
      value.continuity.status ??
        value.continuity.result ??
        value.continuity.outcome ??
        value.continuity.state,
    );
  if (continuityRequestsWaiver && (!options.expectedTenantId || !options.expectedDeploymentId))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_IDENTITY_MISMATCH',
      'Owner-waived continuity evidence requires an expected tenant and deployment identity',
    );
  if (options.expectedTenantId && tenantId !== options.expectedTenantId)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_IDENTITY_MISMATCH',
      'Evidence tenant does not match the expected deployment tenant',
    );
  if (options.expectedDeploymentId && deploymentId !== options.expectedDeploymentId)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_IDENTITY_MISMATCH',
      'Evidence deployment does not match the expected deployment',
    );
  const suppliedSha256 = requiredString(value.sha256, 'sha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(suppliedSha256))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_DIGEST_INVALID',
      'sha256 must be 64 hex characters',
    );
  const computedSha256 = operationsEvidenceSha256(value);
  if (!digestMatches(computedSha256, suppliedSha256))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_DIGEST_MISMATCH',
      'Evidence SHA-256 does not match the canonical contract contents',
    );
  if (options.expectedSha256 && !digestMatches(suppliedSha256, options.expectedSha256.trim()))
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_DETACHED_DIGEST_MISMATCH',
      'Evidence does not match the supplied detached SHA-256 digest',
    );
  return {
    schema: CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SCHEMA,
    schemaVersion: 1,
    evidenceId,
    capturedAt,
    tenantId,
    deploymentId,
    sha256: suppliedSha256,
    jobs: normalizeJobs(value.jobs, now),
    continuity: normalizeContinuity(value.continuity, now, maxAgeMs),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/** Read an operator evidence JSON file and fail closed on malformed input. */
export function readClientEssentialOperationsEvidence(
  options: ReadOperationsEvidenceOptions = {},
): ClientEssentialOperationsEvidence {
  const environment = options.environment ?? process.env;
  const configuredPath =
    options.path ??
    environment[CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_ENV] ??
    environment[CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_PATH_ENV];
  if (!configuredPath || configuredPath.trim() === '')
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_MISSING',
      `Set ${CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_ENV} (or ${CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_PATH_ENV}) to an operator evidence JSON file`,
    );
  let path: string;
  try {
    path = resolve(configuredPath);
  } catch {
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_PATH_INVALID',
      'Evidence path is invalid',
    );
  }
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(path);
  } catch {
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_MISSING',
      `Evidence file does not exist: ${path}`,
    );
  }
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_PATH_INVALID',
      'Evidence path must point to a regular non-symlink file',
    );
  if (stats.size > 1_048_576)
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_PATH_INVALID',
      'Evidence file exceeds the 1 MiB safety limit',
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new OperationsEvidenceError(
      'OPERATIONS_EVIDENCE_JSON_INVALID',
      `Evidence JSON cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseClientEssentialOperationsEvidence(parsed, {
    ...options,
    expectedSha256:
      options.expectedSha256 ?? environment[CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_SHA256_ENV],
  });
}

/** Convert an evidence read/parse failure into an explicit UAT preflight result. */
export function preflightClientEssentialOperationsEvidence(
  options: ReadOperationsEvidenceOptions = {},
): OperationsEvidencePreflight {
  const environment = options.environment ?? process.env;
  const path =
    options.path ??
    environment[CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_ENV] ??
    environment[CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_PATH_ENV];
  try {
    const evidence = readClientEssentialOperationsEvidence(options);
    return { status: 'READY', path: resolve(path ?? ''), evidence };
  } catch (error) {
    const code =
      error instanceof OperationsEvidenceError ? error.code : 'OPERATIONS_EVIDENCE_INVALID';
    const message = error instanceof Error ? error.message : String(error);
    const prerequisite: 'automatic-jobs' | 'continuity-backup' =
      code.includes('CONTINUITY') || code.includes('BACKUP')
        ? 'continuity-backup'
        : 'automatic-jobs';
    let resolvedPath: string | undefined;
    if (path) {
      try {
        resolvedPath = resolve(path);
      } catch {
        resolvedPath = undefined;
      }
    }
    return {
      status: 'BLOCKED',
      code,
      prerequisite,
      message,
      ...(resolvedPath ? { path: resolvedPath } : {}),
    };
  }
}

export type SeededBusinessRows = Readonly<{
  client: Readonly<{ id: string; clientNumber: string; displayName: string; status: string }>;
  project: Readonly<{
    id: string;
    projectNumber: string;
    name: string;
    clientId: string;
    status: string;
    version: number;
  }>;
  worker: Readonly<{ id: string; name: string; email: string }>;
  manager: Readonly<{ id: string; name: string; email: string }>;
  finance: Readonly<{ id: string; name: string; email: string }>;
}>;

/**
 * Resolve the seeded business rows without relying on generated UUIDs.  This
 * is read-only and is used only to bind browser assertions to the fixture's
 * authoritative IDs (for example a project detail route or a source row).
 */
export function readSeededBusinessRows(
  databasePath = clientEssentialFixture.databasePath,
): SeededBusinessRows {
  const database = createDatabase(databasePath);
  try {
    const client = database.sqlite
      .prepare(
        `SELECT id,client_number,display_name,status
           FROM client
          WHERE legal_name=?
          LIMIT 1`,
      )
      .get(clientEssentialFixture.seededClient.legalName) as
      | { id: string; client_number: string; display_name: string; status: string }
      | undefined;
    if (!client) throw new Error('Client Essential seeded client is missing');

    const project = database.sqlite
      .prepare(
        `SELECT id,project_number,name,client_id,status,version
           FROM project
          WHERE name=? AND client_id=?
          LIMIT 1`,
      )
      .get(clientEssentialFixture.seededProject.name, client.id) as
      | {
          id: string;
          project_number: string;
          name: string;
          client_id: string;
          status: string;
          version: number;
        }
      | undefined;
    if (!project) throw new Error('Client Essential seeded project is missing');

    const readUser = (email: string, label: string) => {
      const row = database.sqlite
        .prepare("SELECT id,name,email FROM user WHERE email=? AND status='active' LIMIT 1")
        .get(email) as { id: string; name: string; email: string } | undefined;
      if (!row) throw new Error(`Client Essential seeded ${label} account is missing`);
      return row;
    };
    return {
      client: {
        id: client.id,
        clientNumber: client.client_number,
        displayName: client.display_name,
        status: client.status,
      },
      project: {
        id: project.id,
        projectNumber: project.project_number,
        name: project.name,
        clientId: project.client_id,
        status: project.status,
        version: Number(project.version),
      },
      worker: readUser(e2eCredentials.worker.email, 'Worker'),
      manager: readUser(e2eCredentials.manager.email, 'PM'),
      finance: readUser(e2eCredentials.finance.email, 'Finance'),
    };
  } finally {
    database.sqlite.close();
  }
}

type UatRole = keyof typeof e2eCredentials;
type StoredCookies = Awaited<ReturnType<ReturnType<Page['context']>['cookies']>>;

const uatSessions = new WeakMap<
  Page,
  { activeRole?: UatRole; cookiesByRole: Map<UatRole, StoredCookies> }
>();

export async function signInFresh(page: Page, role: UatRole): Promise<void> {
  // The serial UAT changes roles repeatedly. Preserve one real authenticated
  // session per role so the journey does not manufacture credential-rate-limit
  // failures, while clearing the active cookie jar at every role boundary.
  const sessions = uatSessions.get(page) ?? { cookiesByRole: new Map<UatRole, StoredCookies>() };
  uatSessions.set(page, sessions);

  if (sessions.activeRole === role && !new URL(page.url()).pathname.endsWith('/login')) return;

  if (sessions.activeRole) {
    sessions.cookiesByRole.set(sessions.activeRole, await page.context().cookies());
  }
  await page.context().clearCookies();

  const cached = sessions.cookiesByRole.get(role);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto(portal(''), { waitUntil: 'networkidle' });
    if (!new URL(page.url()).pathname.endsWith('/login')) {
      sessions.activeRole = role;
      return;
    }
    sessions.cookiesByRole.delete(role);
    await page.context().clearCookies();
  }

  await signIn(page, role);
  sessions.activeRole = role;
  sessions.cookiesByRole.set(role, await page.context().cookies());
}

export async function stepUp(page: Page, role: keyof typeof e2eCredentials): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials[role].password },
  });
  if (!response.ok()) {
    throw new Error(`Step-up failed for ${role}: HTTP ${response.status()}`);
  }
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
            element.classList.length ? `.${Array.from(element.classList).join('.')}` : ''
          }`,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          text: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        };
      })
      .filter((element) => element.right > viewportWidth + 1 || element.left < -1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 8);
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth,
      offenders,
    };
  });
  if (
    dimensions.documentWidth > dimensions.viewportWidth + 1 ||
    dimensions.bodyWidth > dimensions.viewportWidth + 1
  ) {
    throw new Error(
      `Horizontal overflow at ${dimensions.viewportWidth}px: ${JSON.stringify(dimensions)}`,
    );
  }
}

/**
 * Assert the responsive contract that a page can be usable even when its
 * document happens to report a narrow scroll width. In particular, verify
 * that mobile navigation exposes readable labels, touch controls retain a
 * real hit area, and phone field groups do not overlap one another.
 */
export async function expectResponsiveLayout(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Responsive layout assertion requires a fixed viewport');
  const main = page.locator('main').first();
  const mainMetrics = await main.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      display: style.display,
      visibility: style.visibility,
    };
  });
  if (
    mainMetrics.display === 'none' ||
    mainMetrics.visibility === 'hidden' ||
    mainMetrics.width <= 0 ||
    mainMetrics.left < -1 ||
    mainMetrics.right > viewport.width + 1
  ) {
    throw new Error(
      `Main content is not contained by the viewport: ${JSON.stringify(mainMetrics)}`,
    );
  }

  const visibleMainControls = await main
    .locator('button, input:not([type="hidden"]), select, textarea, a[role="button"], [role="tab"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name:
              element.getAttribute('aria-label')?.trim() ||
              element.textContent?.trim().replace(/\s+/gu, ' ') ||
              element.getAttribute('name') ||
              element.tagName,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        }),
    );
  const outOfViewport = visibleMainControls.filter(
    (control) => control.left < -1 || control.right > viewport.width + 1,
  );
  if (outOfViewport.length > 0)
    throw new Error(`Responsive controls escape the viewport: ${JSON.stringify(outOfViewport)}`);
  const undersized = visibleMainControls.filter(
    (control) => control.width < 44 || control.height < 44,
  );
  if (undersized.length > 0)
    throw new Error(
      `Responsive controls are below the 44px touch target: ${JSON.stringify(undersized)}`,
    );

  if (viewport.width <= 430) {
    const menu = page.locator('button.menu-button').first();
    const drawer = page.locator('#portal-navigation').first();
    if ((await menu.count()) !== 1 || (await drawer.count()) !== 1)
      throw new Error('Phone layout must expose a navigation toggle and drawer');
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
    const drawerLabels = await drawer
      .locator('nav a .nav-label, .admin-nav a .nav-label')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const text = element.textContent?.trim() ?? '';
          return {
            text,
            width: rect.width,
            height: rect.height,
            fontSize: style.fontSize,
            display: style.display,
            visibility: style.visibility,
          };
        }),
      );
    if (
      drawerLabels.length === 0 ||
      drawerLabels.some(
        (label) =>
          label.text.length < 2 ||
          label.width < 16 ||
          label.height <= 0 ||
          label.fontSize === '0px' ||
          label.display === 'none' ||
          label.visibility === 'hidden',
      )
    ) {
      throw new Error(`Phone navigation labels are not readable: ${JSON.stringify(drawerLabels)}`);
    }
    await page.keyboard.press('Escape');

    const bottomNavigation = page.locator('nav.bottom-nav').first();
    if ((await bottomNavigation.count()) !== 1)
      throw new Error('Phone layout must expose bottom navigation');
    const bottomLabels = await bottomNavigation.locator('a').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = element.textContent?.trim().replace(/\s+/gu, ' ') ?? '';
        return {
          text,
          width: rect.width,
          height: rect.height,
          fontSize: style.fontSize,
          display: style.display,
          visibility: style.visibility,
        };
      }),
    );
    if (
      bottomLabels.length === 0 ||
      bottomLabels.some(
        (label) =>
          label.text.length < 2 ||
          label.width < 32 ||
          label.height < 44 ||
          label.fontSize === '0px' ||
          label.display === 'none' ||
          label.visibility === 'hidden',
      )
    ) {
      throw new Error(
        `Phone bottom navigation labels are not usable: ${JSON.stringify(bottomLabels)}`,
      );
    }

    const fieldGroupOverlaps = await main.locator('[data-ui="field-group"]').evaluateAll((groups) =>
      groups.flatMap((group) => {
        const fields = Array.from(group.children)
          .filter((child) => {
            const style = getComputedStyle(child);
            const rect = child.getBoundingClientRect();
            return (
              child.getAttribute('data-ui') === 'field' &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((child) => {
            const rect = child.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
          });
        const overlaps: Array<{ first: number; second: number }> = [];
        fields.forEach((field, index) => {
          fields.slice(index + 1).forEach((other, offset) => {
            const horizontal = field.left < other.right - 1 && other.left < field.right - 1;
            const vertical = field.top < other.bottom - 1 && other.top < field.bottom - 1;
            if (horizontal && vertical) overlaps.push({ first: index, second: index + offset + 1 });
          });
        });
        return overlaps;
      }),
    );
    if (fieldGroupOverlaps.length > 0)
      throw new Error(`Phone form fields overlap: ${JSON.stringify(fieldGroupOverlaps)}`);
  }
}

/**
 * Assert the browser-level accessibility contract shared by every UAT page:
 * visible controls have a name/label, keyboard focus can reach them, and
 * ordinary touch controls retain the required 44px hit area.
 */
export async function expectAccessibleControls(
  page: Page,
  root: Locator = page.locator('main'),
): Promise<void> {
  const controls = await root
    .locator('button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0
          );
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          const htmlElement = element as HTMLElement;
          const inputType = element instanceof HTMLInputElement ? element.type : '';
          const label = element.closest('label');
          const associatedLabel =
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
              ? element.labels?.[0]
              : undefined;
          const name =
            element.getAttribute('aria-label')?.trim() ||
            element.getAttribute('title')?.trim() ||
            label?.textContent?.trim() ||
            associatedLabel?.textContent?.trim() ||
            element.textContent?.trim() ||
            '';
          return {
            tag: element.tagName,
            inputType,
            name,
            tabIndex: htmlElement.tabIndex,
            role: element.getAttribute('role') ?? '',
            width: box.width,
            height: box.height,
          };
        }),
    );
  const unnamed = controls.filter(({ name }) => !name);
  if (unnamed.length > 0)
    throw new Error(`Unnamed interactive controls: ${JSON.stringify(unnamed)}`);
  // ARIA tabs use a roving tabindex: only the selected tab is in the page's
  // tab order while arrow keys move focus to the other visible tabs.
  const unfocusable = controls.filter(({ tabIndex, role }) => tabIndex < 0 && role !== 'tab');
  if (unfocusable.length > 0)
    throw new Error(`Unfocusable interactive controls: ${JSON.stringify(unfocusable)}`);
  const undersized = controls.filter(
    ({ inputType, width, height }) =>
      !['checkbox', 'radio', 'file'].includes(inputType) && (width < 44 || height < 44),
  );
  if (undersized.length > 0)
    throw new Error(`Interactive controls below 44px: ${JSON.stringify(undersized)}`);
}

export async function expectCardTableRepresentation(page: Page): Promise<void> {
  const tables = page.locator('table');
  const tableCount = await tables.count();
  if (tableCount === 0) return;
  const contracts = await tables.evaluateAll((tableElements) =>
    tableElements.map((table) => {
      const region = table.closest<HTMLElement>('[data-table-region]');
      const scrollParent = table.closest<HTMLElement>('.table-wrap, .timesheet-table-wrap');
      return {
        mobileRepresentation: region?.getAttribute('data-mobile-representation') ?? null,
        overflowX: scrollParent ? getComputedStyle(scrollParent).overflowX : null,
      };
    }),
  );
  if (
    contracts.some(
      ({ mobileRepresentation, overflowX }) =>
        !['cards', 'scroll'].includes(mobileRepresentation ?? '') && overflowX !== 'auto',
    )
  ) {
    throw new Error(
      `A rendered table has no explicit mobile cards/scroll representation contract: ${JSON.stringify(contracts)}`,
    );
  }
}

export function uatArtifactFile(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf'))
    return {
      name,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% Client Essential UAT fixture\n', 'utf8'),
    };
  return {
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  };
}
