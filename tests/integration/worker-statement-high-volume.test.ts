import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PortalRepository,
  V3Repository,
  WorkerStatementRepository,
  createDatabase,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import { runWorkerStatementArtifactJob } from '@ja/reporting';
import { provisionServiceActor } from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const { GET: workerStatementGet } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/[format]/+server.js');
const { POST: workerStatementRequestPost } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/+server.js');

let directory: string;
let restoreIdentity: (() => void) | undefined;
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const previousDatabasePath = process.env.JA_DATABASE_PATH;

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): Principal {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@worker-statement.test`,
      role,
      'active',
      1,
      now,
      now,
    );
  return { userId: id, role, projectIds: new Set() };
}

function event(role: Role, query: string) {
  return {
    locals: {
      user: {
        id: role === 'worker' ? 'worker' : role,
        name: 'Own Worker',
        email: 'worker@test',
        role,
        status: 'active',
      },
      session: {
        id: `${role}-session`,
        userId: role === 'worker' ? 'worker' : role,
        expiresAt: new Date(),
      },
      correlationId: `${role}-correlation`,
    },
    params: { format: 'csv' },
    url: new URL(`http://localhost/app/api/worker-statement/csv?${query}`),
  } as never;
}

async function requestWorkerStatement(query: string): Promise<Response> {
  const url = new URL(`http://localhost/app/api/worker-statement?${query}`);
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      periodStart: url.searchParams.get('periodStart'),
      periodEnd: url.searchParams.get('periodEnd'),
      requestKey: `high-volume-${Date.now()}-${Math.random()}`,
    }),
  });
  return workerStatementRequestPost({
    ...event('worker', query),
    url,
    request,
  } as never);
}

async function requestedCsvArtifact(
  query: string,
): Promise<{ artifactId: string; status: string }> {
  const response = await requestWorkerStatement(query);
  expect(response.status).toBe(202);
  const body = (await response.json()) as {
    artifacts: Array<{ artifactId: string; format: string; status: string }>;
  };
  const artifact = body.artifacts.find((entry) => entry.format === 'csv');
  if (!artifact) throw new Error('Worker statement CSV artifact was not requested');
  return artifact;
}

type Fixture = Readonly<{
  repository: PortalRepository;
  sqlite: ReturnType<typeof createDatabase>['sqlite'];
  worker: Principal;
  projectId: string;
}>;

function fixture(): Fixture {
  restoreIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-worker-statement-volume-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  const database = createDatabase();
  const { sqlite } = database;
  databases.push(sqlite);
  const repository = new PortalRepository(sqlite);
  const owner = seedUser(sqlite, 'owner', 'owner_admin');
  const workerSeed = seedUser(sqlite, 'worker', 'worker');
  const client = repository.createClient(owner, {
    legalName: 'Worker Statement Client',
    displayName: 'Worker Statement Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Worker Statement Way',
    billingEmail: 'worker-statement@example.test',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Worker Statement Project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: workerSeed.userId,
    startsOn: '2026-01-01',
  });
  const worker = repository.principalFor(workerSeed.userId);
  return { repository, sqlite, worker, projectId: project.id };
}

function createExpense(
  value: Fixture,
  worker: Principal,
  index: number,
  spentOn: string,
  amountMinor = 100n,
) {
  return value.repository.createExpense(worker, {
    projectId: value.projectId,
    spentOn,
    vendor: `Statement Vendor ${index}`,
    category: 'travel',
    description: `Statement expense ${index}`,
    currency: 'USD',
    amountMinor,
    whoPaid: 'worker',
    clientTreatment: 'reimbursable',
    paymentMethod: 'personal_card',
    receiptRequired: false,
  });
}

function bindJobActor(value: Fixture): void {
  provisionServiceActor(value.sqlite, {
    tenantId: B5_TEST_TENANT_ID,
    deploymentId: B5_TEST_DEPLOYMENT_ID,
    actorId: 'worker-statement-jobs',
    name: 'Worker statement test jobs',
    boundByUserId: 'owner',
  });
}

function queuedCsvArtifact(
  value: Fixture,
  statements: WorkerStatementRepository,
  requestKey: string,
) {
  return queuedArtifact(value, statements, 'csv', requestKey);
}

function queuedArtifact(
  value: Fixture,
  statements: WorkerStatementRepository,
  format: 'csv' | 'pdf',
  requestKey: string,
) {
  const v3 = new V3Repository(value.sqlite);
  return statements.requestWorkerStatementArtifact(
    value.worker,
    format,
    {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      templateVersion: 'worker-statement-test-v1',
      generationVersion: `worker-statement-${requestKey}`,
      requestKey,
      snapshot: {
        worker: { id: value.worker.userId, name: 'Own Worker' },
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        currency: 'USD',
        approvedMinutes: 0,
        pendingMinutes: 0,
        estimatedApprovedMinor: '0',
        estimatedPendingMinor: '0',
        approvedReimbursementMinor: '0',
        pendingReimbursementMinor: '0',
        missingCompensationRules: 0,
        activities: [],
        settlements: [],
        expenses: [],
      },
    },
    (artifact) => {
      v3.enqueueJob(
        'worker_statement_artifact_render',
        `worker-statement:${artifact.artifactId}:attempt:${artifact.currentAttemptNumber}`,
        { artifactId: artifact.artifactId, requestedAttempt: artifact.currentAttemptNumber },
      );
    },
  );
}

type PublishedStatementArtifact = Readonly<{
  bytes: Uint8Array;
  contentSha256: string;
  byteLength: number;
  mediaType: 'application/pdf' | 'text/csv';
}>;

function runStatementJobs(
  value: Fixture,
  statements: WorkerStatementRepository,
  published: Map<string, PublishedStatementArtifact>,
  failFormat?: 'csv' | 'pdf',
) {
  const v3 = new V3Repository(value.sqlite);
  let injectedFailure = false;
  return v3.runDueJobs(20, {
    worker_statement_artifact_render: (payload, execution) => {
      const artifactId = (payload as { artifactId: string }).artifactId;
      const artifact = statements.getWorkerStatementArtifact(value.worker, artifactId);
      const result = runWorkerStatementArtifactJob({
        repository: statements,
        payload,
        execution: {
          jobId: execution.jobId,
          jobRunId: execution.runId,
          leaseFence: execution.fenceVersion,
        },
        documentRoot: directory,
        publish: (storageKey, bytes) => {
          if (artifact.format === failFormat && !injectedFailure) {
            injectedFailure = true;
            throw new Error(`FORCED_${artifact.format.toUpperCase()}_RENDER_FAILURE`);
          }
          const copied = new Uint8Array(bytes);
          const contentSha256 = createHash('sha256').update(copied).digest('hex');
          const mediaType = artifact.format === 'pdf' ? 'application/pdf' : 'text/csv';
          const result = {
            bytes: copied,
            contentSha256,
            byteLength: copied.byteLength,
            mediaType,
          } as const;
          published.set(storageKey, result);
          return { sha256: contentSha256, byteLength: copied.byteLength };
        },
        deferCompletion: true,
      });
      if (!result.finalize) throw new Error('Worker statement finalizer was not returned');
      return result.finalize;
    },
  });
}

function statementJob(
  value: Fixture,
  artifactId: string,
): {
  id: string;
  state: string;
  attempts: number;
  active_job_run_id: string | null;
  run_after: string;
} {
  const row = value.sqlite
    .prepare(
      `SELECT id,state,attempts,active_job_run_id,run_after
        FROM job
        WHERE kind='worker_statement_artifact_render'
          AND json_extract(payload_json,'$.artifactId')=?
        ORDER BY created_at DESC,id DESC
        LIMIT 1`,
    )
    .get(artifactId) as
    | {
        id: string;
        state: string;
        attempts: number;
        active_job_run_id: string | null;
        run_after: string;
      }
    | undefined;
  if (!row) throw new Error(`Worker statement job is missing for ${artifactId}`);
  return row;
}

function statementJobRuns(
  value: Fixture,
  jobId: string,
): Array<{
  state: string;
  outcome: string | null;
  error_code: string | null;
  finished_at: string | null;
}> {
  return value.sqlite
    .prepare(
      `SELECT state,outcome,error_code,finished_at
         FROM job_run
        WHERE job_id=?
        ORDER BY started_at,id`,
    )
    .all(jobId) as Array<{
    state: string;
    outcome: string | null;
    error_code: string | null;
    finished_at: string | null;
  }>;
}

function storedStatementVerification(
  published: Map<string, PublishedStatementArtifact>,
  storageKey: string,
  expected?: Readonly<{ mediaType: 'application/pdf' | 'text/csv' }>,
) {
  const stored = published.get(storageKey);
  if (!stored) return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
  const contentSha256 = createHash('sha256').update(stored.bytes).digest('hex');
  const magicValid =
    expected?.mediaType === 'application/pdf'
      ? Buffer.from(stored.bytes.subarray(0, 5)).toString('ascii') === '%PDF-' &&
        Buffer.from(stored.bytes.subarray(Math.max(0, stored.bytes.byteLength - 1024)))
          .toString('latin1')
          .includes('%%EOF')
      : stored.bytes.byteLength > 0 && !stored.bytes.includes(0);
  return {
    exists: true,
    byteLength: stored.bytes.byteLength,
    contentSha256,
    mediaType: stored.mediaType,
    magicValid,
  };
}

function claimAndExpireStatement(
  value: Fixture,
  statements: WorkerStatementRepository,
  artifact: Readonly<{ artifactId: string; currentAttemptNumber: number }>,
): void {
  const job = value.sqlite
    .prepare(
      `SELECT * FROM job
       WHERE kind='worker_statement_artifact_render'
         AND json_extract(payload_json,'$.artifactId')=?`,
    )
    .get(artifact.artifactId) as Record<string, unknown> & { id: string };
  const binding = value.sqlite
    .prepare(
      `SELECT b.service_actor_id,s.version actor_version,s.capabilities_json,
              b.version binding_version,d.tenant_id,d.deployment_id
       FROM deployment_service_actor_binding b
       JOIN service_actor s ON s.id=b.service_actor_id
       JOIN deployment_identity d ON d.singleton=b.singleton
       WHERE b.singleton=1`,
    )
    .get() as {
    service_actor_id: string;
    actor_version: number;
    capabilities_json: string;
    binding_version: number;
    tenant_id: string;
    deployment_id: string;
  };
  const runId = `expired-${artifact.artifactId}`;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const leaseUntil = new Date(started + 5 * 60_000).toISOString();
  value.sqlite.exec('BEGIN IMMEDIATE');
  try {
    value.sqlite
      .prepare(
        `UPDATE job SET state='claimed',active_job_run_id=?,lease_until=?,attempts=attempts+1,
           fence_version=1,version=version+1,updated_at=?
         WHERE id=? AND state='queued' AND fence_version=0`,
      )
      .run(runId, leaseUntil, startedAt, job.id);
    value.sqlite
      .prepare(
        `INSERT INTO job_run(
           id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,required_capability,
           service_actor_id,service_actor_version,service_actor_capabilities_json,
           configured_binding_version,correlation_id,payload_sha256,state,fence_version,
           fencing_token,lease_until
         ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        runId,
        job.id,
        startedAt,
        binding.tenant_id,
        binding.deployment_id,
        job.kind,
        job.required_capability,
        binding.service_actor_id,
        binding.actor_version,
        binding.capabilities_json,
        binding.binding_version,
        job.correlation_id,
        job.payload_sha256,
        'claimed',
        1,
        `fence-${runId}`,
        leaseUntil,
      );
    value.sqlite
      .prepare("UPDATE job_run SET state='running' WHERE id=? AND state='claimed'")
      .run(runId);
    value.sqlite.exec('COMMIT');
  } catch (error) {
    value.sqlite.exec('ROLLBACK');
    throw error;
  }
  statements.claimWorkerStatementArtifact(
    artifact.artifactId,
    { jobId: job.id, jobRunId: runId, leaseFence: 1 },
    artifact.currentAttemptNumber,
  );
  value.sqlite
    .prepare(
      `UPDATE job_run SET state='lease_expired',finished_at=?,outcome='retry_scheduled',
         error_code='LEASE_LOST',retry_run_after=? WHERE id=? AND state='running'`,
    )
    .run(
      new Date(started + 6 * 60_000).toISOString(),
      new Date(started + 11 * 60_000).toISOString(),
      runId,
    );
}

beforeEach(() => {
  directory = '';
  restoreIdentity = undefined;
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  restoreIdentity?.();
  restoreIdentity = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('worker statement high-volume exports', () => {
  it('does not let lifetime rows outside the period trigger the old 250-row truncation path', async () => {
    const value = fixture();
    const worker = value.worker;
    for (let index = 0; index < 260; index++) createExpense(value, worker, index, '2026-07-15');
    const inPeriod = createExpense(value, worker, 260, '2026-08-01', 123456789012345n);
    createExpense(value, worker, 261, '2026-08-31');

    const artifact = await requestedCsvArtifact(
      'periodStart=2026-08-01&periodEnd=2026-08-31&workerId=other-worker',
    );
    expect(artifact.status).toBe('queued');
    const row = value.sqlite
      .prepare('SELECT snapshot_json FROM worker_statement_artifact WHERE artifact_id=?')
      .get(artifact.artifactId) as { snapshot_json: string };
    const snapshot = JSON.parse(row.snapshot_json) as {
      expenses: Array<{ id: string; vendor: string; reimbursementAmountMinor: string }>;
    };
    expect(snapshot.expenses).toHaveLength(2);
    expect(snapshot.expenses.some((expense) => expense.id === inPeriod.id)).toBe(true);
    expect(
      snapshot.expenses.some((expense) => expense.reimbursementAmountMinor === '123456789012345'),
    ).toBe(true);
    expect(snapshot.expenses.some((expense) => expense.vendor === 'Statement Vendor 0')).toBe(
      false,
    );
  });

  it('exports every requested-period row beyond 250 and excludes rejected/void expenses', async () => {
    const value = fixture();
    const worker = value.worker;
    for (let index = 0; index < 251; index++) createExpense(value, worker, index, '2026-08-15');
    const rejected = createExpense(value, worker, 251, '2026-08-15');
    const voided = createExpense(value, worker, 252, '2026-08-15');
    value.sqlite
      .prepare("UPDATE expense SET approval_state='rejected' WHERE id=?")
      .run(rejected.id);
    value.sqlite.prepare("UPDATE expense SET approval_state='void' WHERE id=?").run(voided.id);

    const artifact = await requestedCsvArtifact('periodStart=2026-08-15&periodEnd=2026-08-15');
    const row = value.sqlite
      .prepare('SELECT snapshot_json FROM worker_statement_artifact WHERE artifact_id=?')
      .get(artifact.artifactId) as { snapshot_json: string };
    const snapshot = JSON.parse(row.snapshot_json) as { expenses: Array<{ id: string }> };
    expect(snapshot.expenses).toHaveLength(251);
    expect(snapshot.expenses.some((expense) => expense.id === rejected.id)).toBe(false);
    expect(snapshot.expenses.some((expense) => expense.id === voided.id)).toBe(false);
  });

  it('retains own historical time and expenses using each source date after assignment expiry', async () => {
    const value = fixture();
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.projectId,
      workDate: '2026-08-05',
      category: 'regular',
      minutes: 420,
      summary: 'Historical assigned work',
    });
    const expense = createExpense(value, value.worker, 300, '2026-08-06', 98765n);
    const outsideAssignmentTime = value.repository.createTimeEntry(value.worker, {
      projectId: value.projectId,
      workDate: '2026-08-15',
      category: 'regular',
      minutes: 60,
      summary: 'Outside revised assignment',
    });
    const outsideAssignmentExpense = createExpense(value, value.worker, 301, '2026-08-15', 12345n);
    value.sqlite
      .prepare(
        `UPDATE project_member
         SET ends_on='2026-08-10'
         WHERE project_id=? AND user_id=? AND status='active'`,
      )
      .run(value.projectId, value.worker.userId);

    expect(value.repository.principalFor(value.worker.userId).projectIds.size).toBe(0);
    const artifact = await requestedCsvArtifact('periodStart=2026-08-01&periodEnd=2026-08-31');
    const row = value.sqlite
      .prepare('SELECT snapshot_json FROM worker_statement_artifact WHERE artifact_id=?')
      .get(artifact.artifactId) as { snapshot_json: string };
    const snapshot = JSON.parse(row.snapshot_json) as {
      activities: Array<{ id: string }>;
      expenses: Array<{ id: string }>;
      pendingReimbursementMinor: string;
    };

    expect(snapshot.activities.map((entry) => entry.id)).toContain(time.id);
    expect(snapshot.activities.map((entry) => entry.id)).not.toContain(outsideAssignmentTime.id);
    expect(snapshot.expenses.map((entry) => entry.id)).toContain(expense.id);
    expect(snapshot.expenses.map((entry) => entry.id)).not.toContain(outsideAssignmentExpense.id);
    expect(snapshot.pendingReimbursementMinor).toBe('98765');
  });

  it('preserves a foreign worker reimbursement in its authoritative source currency', () => {
    const value = fixture();
    const foreign = value.repository.createExpense(value.worker, {
      projectId: value.projectId,
      spentOn: '2026-08-17',
      vendor: 'Foreign statement vendor',
      category: 'travel',
      description: 'Foreign expense awaiting authoritative conversion',
      currency: 'EUR',
      amountMinor: 20_001n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      paymentMethod: 'personal_card',
      receiptRequired: false,
    });
    value.sqlite.prepare("UPDATE expense SET approval_state='approved' WHERE id=?").run(foreign.id);

    const expenses = value.repository.listWorkerStatementExpenses(
      value.worker,
      '2026-08-01',
      '2026-08-31',
    );
    expect(expenses).toContainEqual(
      expect.objectContaining({
        id: foreign.id,
        reimbursementAmountMinor: '20001',
        currency: 'EUR',
      }),
    );
  });

  it('excludes rejected and void time entries from the statement detail', () => {
    const value = fixture();
    const included = value.repository.createTimeEntry(value.worker, {
      projectId: value.projectId,
      workDate: '2026-08-17',
      category: 'regular',
      minutes: 60,
      summary: 'Included statement activity',
    });
    const rejected = value.repository.createTimeEntry(value.worker, {
      projectId: value.projectId,
      workDate: '2026-08-17',
      category: 'regular',
      minutes: 120,
      summary: 'Rejected statement activity',
    });
    const voided = value.repository.createTimeEntry(value.worker, {
      projectId: value.projectId,
      workDate: '2026-08-17',
      category: 'regular',
      minutes: 180,
      summary: 'Voided statement activity',
    });
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='approved' WHERE id=?")
      .run(included.id);
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='rejected' WHERE id=?")
      .run(rejected.id);
    value.sqlite.prepare("UPDATE time_entry SET approval_state='void' WHERE id=?").run(voided.id);

    const rows = value.repository.listWorkerStatementTime(value.worker, '2026-08-01', '2026-08-31');

    expect(rows.map((row) => row.id)).toEqual([included.id]);
  });

  it('keeps PDF ready while CSV fails, then retries CSV independently with durable truth', () => {
    const value = fixture();
    bindJobActor(value);
    const published = new Map<string, PublishedStatementArtifact>();
    const statements = new WorkerStatementRepository(value.sqlite, {
      verify: (storageKey, expected) =>
        storedStatementVerification(published, storageKey, expected),
    });
    const csv = queuedArtifact(value, statements, 'csv', 'format-independent-csv');
    const pdf = statements
      .listWorkerStatementArtifacts(value.worker, {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
      .find((artifact) => artifact.format === 'pdf');
    if (!pdf) throw new Error('The paired PDF Worker statement artifact is missing');

    const firstRun = runStatementJobs(value, statements, published, 'csv');
    expect(firstRun).toMatchObject({ processed: 1, failed: 1 });
    expect(statements.getWorkerStatementArtifact(value.worker, csv.artifactId)).toMatchObject({
      status: 'failed',
      currentAttemptNumber: 1,
      errorCode: 'WORKER_STATEMENT_RENDER_FAILED',
      retryable: true,
    });
    const readyPdf = statements.getWorkerStatementArtifact(value.worker, pdf.artifactId);
    expect(readyPdf).toMatchObject({
      status: 'ready',
      currentAttemptNumber: 1,
      mediaType: 'application/pdf',
      byteLength: expect.any(Number),
      contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const pdfBytes = published.get(readyPdf.storageKey);
    expect(pdfBytes).toBeDefined();
    expect(pdfBytes?.contentSha256).toBe(readyPdf.contentSha256);
    expect(pdfBytes?.byteLength).toBe(readyPdf.byteLength);

    const csvJobAfterFailure = statementJob(value, csv.artifactId);
    expect(csvJobAfterFailure.state).toBe('dead_letter');
    expect(csvJobAfterFailure.attempts).toBe(1);
    expect(csvJobAfterFailure.active_job_run_id).toEqual(expect.any(String));
    expect(statementJobRuns(value, csvJobAfterFailure.id)).toEqual([
      expect.objectContaining({
        state: 'failed',
        outcome: 'failed_terminal',
        error_code: 'HANDLER_FAILED',
        finished_at: expect.any(String),
      }),
    ]);
    expect(
      value.sqlite
        .prepare(
          `SELECT attempt_number,outcome,failure_class,retryable
             FROM worker_statement_artifact_attempt
            WHERE artifact_id=?
            ORDER BY attempt_number`,
        )
        .all(csv.artifactId),
    ).toEqual([
      expect.objectContaining({
        attempt_number: 1,
        outcome: 'failed',
        failure_class: 'FORCED_CSV_RENDER_FAILURE',
        retryable: 1,
      }),
    ]);

    const retried = statements.retryWorkerStatementArtifact(
      value.worker,
      csv.artifactId,
      (artifact) => {
        expect(artifact.status).toBe('queued');
        expect(artifact.currentAttemptNumber).toBe(2);
        new V3Repository(value.sqlite).enqueueJob(
          'worker_statement_artifact_render',
          `worker-statement:${artifact.artifactId}:attempt:${artifact.currentAttemptNumber}`,
          { artifactId: artifact.artifactId, requestedAttempt: artifact.currentAttemptNumber },
        );
      },
    );
    expect(retried).toMatchObject({ status: 'queued', currentAttemptNumber: 2 });
    const retryRun = runStatementJobs(value, statements, published);
    expect(retryRun).toMatchObject({ processed: 1, failed: 0 });

    const readyCsv = statements.getWorkerStatementArtifact(value.worker, csv.artifactId);
    expect(readyCsv).toMatchObject({
      status: 'ready',
      currentAttemptNumber: 2,
      mediaType: 'text/csv',
      byteLength: expect.any(Number),
      contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const csvBytes = published.get(readyCsv.storageKey);
    expect(csvBytes).toBeDefined();
    expect(csvBytes?.contentSha256).toBe(readyCsv.contentSha256);
    expect(csvBytes?.byteLength).toBe(readyCsv.byteLength);
    expect(statements.getWorkerStatementArtifact(value.worker, pdf.artifactId)).toMatchObject({
      status: 'ready',
      currentAttemptNumber: 1,
      contentSha256: readyPdf.contentSha256,
      byteLength: readyPdf.byteLength,
    });

    const csvAttempts = value.sqlite
      .prepare(
        `SELECT attempt_number,outcome,failure_class,retryable
           FROM worker_statement_artifact_attempt
          WHERE artifact_id=?
          ORDER BY attempt_number`,
      )
      .all(csv.artifactId);
    expect(csvAttempts).toEqual([
      expect.objectContaining({
        attempt_number: 1,
        outcome: 'failed',
        failure_class: 'FORCED_CSV_RENDER_FAILURE',
        retryable: 1,
      }),
      expect.objectContaining({
        attempt_number: 2,
        outcome: 'ready',
        failure_class: null,
        retryable: null,
      }),
    ]);
    const retryJob = statementJob(value, csv.artifactId);
    const obsoleteJob = value.sqlite
      .prepare('SELECT id,state,attempts,active_job_run_id FROM job WHERE id=?')
      .get(csvJobAfterFailure.id) as
      | { id: string; state: string; attempts: number; active_job_run_id: string | null }
      | undefined;
    expect(obsoleteJob).toMatchObject({
      id: csvJobAfterFailure.id,
      state: 'dead_letter',
      attempts: 1,
      active_job_run_id: expect.any(String),
    });
    expect(retryJob.id).not.toBe(csvJobAfterFailure.id);
    expect(retryJob.state).toBe('succeeded');
    expect(retryJob.attempts).toBe(1);
    expect(statementJobRuns(value, retryJob.id)).toEqual([
      expect.objectContaining({
        state: 'succeeded',
        outcome: 'succeeded',
        error_code: null,
        finished_at: expect.any(String),
      }),
    ]);
    expect(
      value.sqlite
        .prepare(
          `SELECT COUNT(*) count
             FROM job
            WHERE kind='worker_statement_artifact_render'
              AND state='queued'
              AND run_after<=?`,
        )
        .get(new Date().toISOString()),
    ).toEqual({ count: 0 });
  });

  it('commits an integrity-blocked terminal failure after durable job success', () => {
    const value = fixture();
    bindJobActor(value);
    const statements = new WorkerStatementRepository(value.sqlite, {
      verify: () => ({
        exists: false,
        byteLength: null,
        contentSha256: null,
        magicValid: false,
      }),
    });
    const artifact = queuedCsvArtifact(value, statements, 'integrity-failure');
    const v3 = new V3Repository(value.sqlite);

    const run = v3.runDueJobs(20, {
      worker_statement_artifact_render: (payload, execution) => {
        const result = runWorkerStatementArtifactJob({
          repository: statements,
          payload,
          execution: {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          documentRoot: directory,
          publish: (_storageKey, bytes) => ({
            sha256: createHash('sha256').update(bytes).digest('hex'),
            byteLength: bytes.byteLength,
          }),
          deferCompletion: true,
        });
        return result.finalize;
      },
    });

    const durableState = value.sqlite
      .prepare(
        'SELECT id,kind,state,last_error_code lastErrorCode,fence_version fenceVersion FROM job ORDER BY created_at,id',
      )
      .all();
    const artifactStates = value.sqlite
      .prepare(
        'SELECT artifact_id artifactId,format,status,error_code errorCode,claimed_job_id claimedJobId FROM worker_statement_artifact ORDER BY format',
      )
      .all();
    const runStates = value.sqlite
      .prepare('SELECT job_id jobId,state,error_code errorCode FROM job_run')
      .all();
    const failureAudits = value.sqlite
      .prepare(
        "SELECT metadata_json metadata FROM audit_event WHERE action='service_job.fail' ORDER BY occurred_at,id",
      )
      .all();
    expect(
      statements.getWorkerStatementArtifact(value.worker, artifact.artifactId),
      JSON.stringify({ run, durableState, artifactStates, runStates, failureAudits }),
    ).toMatchObject({
      status: 'failed',
      errorCode: 'ARTIFACT_INTEGRITY_FAILED',
      retryable: true,
      integrityBlocked: true,
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT incident_kind FROM worker_statement_integrity_incident WHERE artifact_id=?',
        )
        .get(artifact.artifactId),
    ).toEqual({ incident_kind: 'storage_verification_failed' });
  });

  it('normalizes invalid observed storage metadata before committing integrity quarantine', () => {
    const value = fixture();
    bindJobActor(value);
    const statements = new WorkerStatementRepository(value.sqlite, {
      verify: () => ({
        exists: true,
        byteLength: 0,
        contentSha256: 'A'.repeat(64),
        mediaType: 'text/csv',
        magicValid: false,
      }),
    });
    const artifact = queuedCsvArtifact(value, statements, 'integrity-invalid-observation');
    const v3 = new V3Repository(value.sqlite);

    const run = v3.runDueJobs(20, {
      worker_statement_artifact_render: (payload, execution) => {
        const result = runWorkerStatementArtifactJob({
          repository: statements,
          payload,
          execution: {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          documentRoot: directory,
          publish: (_storageKey, bytes) => ({
            sha256: createHash('sha256').update(bytes).digest('hex'),
            byteLength: bytes.byteLength,
          }),
          deferCompletion: true,
        });
        return result.finalize;
      },
    });

    const durableState = value.sqlite
      .prepare(
        'SELECT id,kind,state,last_error_code lastErrorCode,fence_version fenceVersion FROM job ORDER BY created_at,id',
      )
      .all();
    const artifactStates = value.sqlite
      .prepare(
        'SELECT artifact_id artifactId,format,status,error_code errorCode,claimed_job_id claimedJobId FROM worker_statement_artifact ORDER BY format',
      )
      .all();
    const runStates = value.sqlite
      .prepare('SELECT job_id jobId,state,error_code errorCode FROM job_run')
      .all();
    const failureAudits = value.sqlite
      .prepare(
        "SELECT metadata_json metadata FROM audit_event WHERE action='service_job.fail' ORDER BY occurred_at,id",
      )
      .all();
    expect(
      statements.getWorkerStatementArtifact(value.worker, artifact.artifactId),
      JSON.stringify({ run, durableState, artifactStates, runStates, failureAudits }),
    ).toMatchObject({
      status: 'failed',
      errorCode: 'ARTIFACT_INTEGRITY_FAILED',
      retryable: true,
      integrityBlocked: true,
    });
    expect(
      value.sqlite
        .prepare(
          `SELECT expected_hash,observed_hash,observed_length
           FROM worker_statement_integrity_incident WHERE artifact_id=?`,
        )
        .get(artifact.artifactId),
    ).toMatchObject({ observed_hash: 'a'.repeat(64), observed_length: null });
  });

  it('recovers an interrupted post-success finalizer with an idempotent execution fence', () => {
    const value = fixture();
    bindJobActor(value);
    const statements = new WorkerStatementRepository(value.sqlite);
    const artifact = queuedCsvArtifact(value, statements, 'abandoned-running');
    const v3 = new V3Repository(value.sqlite);

    v3.runDueJobs(20, {
      worker_statement_artifact_render: (_payload, execution) => {
        statements.claimWorkerStatementArtifact(
          artifact.artifactId,
          {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          artifact.currentAttemptNumber,
        );
      },
    });
    expect(statements.getWorkerStatementArtifact(value.worker, artifact.artifactId).status).toBe(
      'running',
    );

    const reference = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const recovered = statements.recoverAbandonedRunning(reference, 5 * 60 * 1000);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      artifactId: artifact.artifactId,
      status: 'failed',
      errorCode: 'FINALIZATION_INTERRUPTED',
      retryable: true,
    });
    expect(statements.recoverAbandonedRunning(reference, 5 * 60 * 1000)).toEqual([]);
  });

  it('recovers only a terminal lease-expired claim and records its immutable attempt', () => {
    const value = fixture();
    bindJobActor(value);
    const statements = new WorkerStatementRepository(value.sqlite);
    const artifact = queuedCsvArtifact(value, statements, 'lease-expired');
    claimAndExpireStatement(value, statements, artifact);

    const recovered = statements.recoverAbandonedRunning(
      new Date(Date.now() + 60 * 60_000).toISOString(),
      60_000,
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      status: 'failed',
      errorCode: 'LEASE_EXPIRED',
      retryable: true,
    });
    expect(
      value.sqlite
        .prepare(
          `SELECT outcome,failure_class,retryable
           FROM worker_statement_artifact_attempt WHERE artifact_id=?`,
        )
        .get(artifact.artifactId),
    ).toEqual({ outcome: 'failed', failure_class: 'lease_expired', retryable: 1 });
  });

  it('exposes the artifact recovery alias with the same fenced, idempotent transition', () => {
    const value = fixture();
    bindJobActor(value);
    const statements = new WorkerStatementRepository(value.sqlite);
    const artifact = queuedCsvArtifact(value, statements, 'recovery-alias');
    claimAndExpireStatement(value, statements, artifact);

    const reference = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(statements.recoverAbandonedArtifacts(reference, 60_000)).toHaveLength(1);
    expect(statements.recoverAbandonedArtifacts(reference, 60_000)).toEqual([]);
  });

  it('rejects invalid or unbounded periods before querying the statement', () => {
    fixture();
    for (const query of [
      'periodStart=2026-08-01',
      'periodEnd=2026-08-31',
      'periodStart=2026-08-01&periodStart=2026-08-02&periodEnd=2026-08-31',
      'periodStart=2026-02-30&periodEnd=2026-03-01',
      'periodStart=2026-09-01&periodEnd=2026-08-31',
    ])
      expect(() => workerStatementGet(event('worker', query))).toThrowError();
  });
});
