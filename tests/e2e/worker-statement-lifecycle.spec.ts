import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createDatabase, V3Repository, WorkerStatementRepository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const PERIOD_START = '2026-08-01';
const PERIOD_END = '2026-08-31';

type WorkerStatementArtifact = Readonly<{
  artifactId: string;
  format: 'pdf' | 'csv';
  status: string;
  semanticFilename: string;
  mediaType: string | null;
  byteLength: number | null;
  currentAttemptNumber: number;
  readyAt: string | null;
  rendererVersion: string | null;
}>;

type WorkerStatementJob = Readonly<{
  id: string;
  state: string;
  attempts: number;
  required_capability: string;
}>;

type PersistedWorkerStatementArtifact = Readonly<{
  artifact_id: string;
  format: 'pdf' | 'csv';
  status: string;
  semantic_filename: string;
  media_type: 'application/pdf' | 'text/csv' | null;
  byte_length: number | null;
  content_sha256: string | null;
  storage_key: string;
}>;

function pdfMagicValid(bytes: Buffer): boolean {
  if (bytes.byteLength < 8) return false;
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 1024)).toString('latin1');
  return bytes.subarray(0, 5).toString('ascii') === '%PDF-' && tail.includes('%%EOF');
}

function csvContentValid(bytes: Buffer): boolean {
  if (bytes.byteLength === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser test uses the same WorkerStatementRepository contract as the production jobs
 * process. This verifier only supplies the test-owned disposable storage root; it does not mark
 * an artifact ready or bypass the durable claim/run/fence checks.
 */
function verifyWorkerStatementStorage(
  root: string,
  storageKey: string,
  expected?: Readonly<{ mediaType?: string }>,
): {
  exists: boolean;
  byteLength: number | null;
  contentSha256: string | null;
  mediaType?: string;
  magicValid?: boolean;
} {
  try {
    const targetRoot = resolve(root);
    const target = resolve(targetRoot, storageKey);
    const relativeTarget = relative(targetRoot, target);
    if (
      !relativeTarget ||
      relativeTarget.split(/[\\/]/u).includes('..') ||
      relativeTarget.startsWith('/') ||
      relativeTarget.startsWith('\\')
    )
      return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
    const stats = lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile())
      return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
    const bytes = readFileSync(target);
    const mediaType =
      expected?.mediaType ?? (pdfMagicValid(bytes) ? 'application/pdf' : 'text/csv');
    const magicValid =
      mediaType === 'application/pdf' ? pdfMagicValid(bytes) : csvContentValid(bytes);
    return {
      exists: true,
      byteLength: bytes.byteLength,
      contentSha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType,
      magicValid,
    };
  } catch {
    return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
  }
}

function runServiceArtifactCycle(): { processed: number; failed: number } {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const workerStatement = new WorkerStatementRepository(database.sqlite, {
      verify: (storageKey, expected) =>
        verifyWorkerStatementStorage(fixture.documentRoot, storageKey, expected),
    });
    const v3 = new V3Repository(database.sqlite);
    return runArtifactJobs({
      // The Worker Statement handler does not use the human PortalRepository adapter. Supplying
      // the narrow adapter makes it explicit that this is a service-worker fixture invocation,
      // never an action or "run jobs" control available to an authenticated user.
      repository: { createInvoiceDraftFromJob: () => undefined },
      v3,
      documentRoot: fixture.documentRoot,
      workerStatement,
    });
  } finally {
    database.sqlite.close();
  }
}

function readWorkerStatementJobs(jobIds: readonly string[]): WorkerStatementJob[] {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return jobIds
      .map(
        (jobId) =>
          database.sqlite
            .prepare(
              `SELECT id,state,attempts,required_capability
                 FROM job
                WHERE id=? AND kind='worker_statement_artifact_render'`,
            )
            .get(jobId) as WorkerStatementJob | undefined,
      )
      .filter((job): job is WorkerStatementJob => Boolean(job));
  } finally {
    database.sqlite.close();
  }
}

function readPersistedWorkerStatementArtifact(
  artifactId: string,
): PersistedWorkerStatementArtifact {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT artifact_id,format,status,semantic_filename,media_type,byte_length,
                content_sha256,storage_key
           FROM worker_statement_artifact
          WHERE artifact_id=?`,
      )
      .get(artifactId) as PersistedWorkerStatementArtifact | undefined;
    if (!row) throw new Error(`Persisted Worker statement artifact is missing: ${artifactId}`);
    return row;
  } finally {
    database.sqlite.close();
  }
}

function assertWorkerStatementServiceCapability(): void {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const binding = database.sqlite
      .prepare(
        `SELECT s.status, s.capabilities_json
           FROM deployment_service_actor_binding b
           JOIN service_actor s ON s.id=b.service_actor_id
          WHERE b.singleton=1 AND b.tenant_id=? AND b.deployment_id=?`,
      )
      .get(process.env.JA_TENANT_ID ?? '', process.env.JA_DEPLOYMENT_ID ?? '') as
      | { status: string; capabilities_json: string }
      | undefined;
    if (!binding) throw new Error('The E2E fixture has no deployment service actor binding');
    let capabilities: unknown;
    try {
      capabilities = JSON.parse(binding.capabilities_json);
    } catch {
      throw new Error('The E2E fixture service actor capabilities are not valid JSON');
    }
    expect(binding.status).toBe('active');
    expect(capabilities).toContain('artifact.worker_statement.render');
  } finally {
    database.sqlite.close();
  }
}

function readWorkerStatementRun(jobId: string): Readonly<{
  state: string;
  outcome: string | null;
  actorId: string;
  capability: string;
}> {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const run = database.sqlite
      .prepare(
        `SELECT r.state,r.outcome,r.service_actor_id actorId,r.required_capability capability
           FROM job_run r
           JOIN job j ON j.active_job_run_id=r.id AND j.id=r.job_id
          WHERE j.id=?
          ORDER BY r.started_at DESC
          LIMIT 1`,
      )
      .get(jobId) as
      | { state: string; outcome: string | null; actorId: string; capability: string }
      | undefined;
    if (!run) throw new Error(`No durable run was recorded for worker statement job ${jobId}`);
    return run;
  } finally {
    database.sqlite.close();
  }
}

async function stepUpWorker(page: Page): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials.worker.password },
  });
  expect(response.ok(), 'Worker private artifact download requires a session-bound step-up').toBe(
    true,
  );
}

async function jsonBody<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

test('Worker statement durable lifecycle is queued, service-rendered, private and immutable', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // One representative desktop run is enough for the durable API/artifact evidence. The wider
  // responsive matrix is owned by the UI_PLAN suites and remains independent of this flow.
  test.skip(
    testInfo.project.name !== 'desktop',
    'Worker statement lifecycle uses one evidence viewport',
  );

  await signIn(page, 'worker');
  const requestKey = `e2e-worker-statement-${testInfo.project.name}-${randomUUID()}`;
  const requestResponse = await page.request.post(portal('/api/worker-statement'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: {
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      requestKey,
    },
  });
  expect(requestResponse.status(), 'Worker statement request must be accepted asynchronously').toBe(
    202,
  );
  expect(requestResponse.headers()['retry-after']).toBe('2');

  const requestBody = await jsonBody<{
    artifacts: WorkerStatementArtifact[];
    jobs: Array<{ artifactId: string; format: string; id: string | null; created: boolean }>;
  }>(requestResponse);
  expect(requestBody.artifacts).toHaveLength(2);
  expect(requestBody.artifacts.map((artifact) => artifact.format).sort()).toEqual(['csv', 'pdf']);
  expect(requestBody.artifacts.every((artifact) => artifact.status === 'queued')).toBe(true);
  expect(requestBody.jobs).toHaveLength(2);
  expect(requestBody.jobs.every((job) => job.id && job.created)).toBe(true);

  const artifactByFormat = new Map(
    requestBody.artifacts.map((artifact) => [artifact.format, artifact] as const),
  );
  const csv = artifactByFormat.get('csv');
  const pdf = artifactByFormat.get('pdf');
  if (!csv || !pdf) throw new Error('Worker statement request did not return both formats');
  const jobIds = requestBody.jobs.map((job) => job.id).filter((id): id is string => Boolean(id));
  expect(jobIds).toHaveLength(2);

  // The status API exposes queued truthfully and provides a polling/download location; no browser
  // action can claim or finalize the job.
  const queuedDetailResponse = await page.request.get(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(csv.artifactId)}`),
  );
  expect(queuedDetailResponse.status()).toBe(200);
  const queuedDetail = await jsonBody<{
    artifact: WorkerStatementArtifact;
    download: string;
  }>(queuedDetailResponse);
  expect(queuedDetail.artifact.status).toBe('queued');
  expect(queuedDetail.download).toContain(
    `/j-aautomation/app/api/worker-statement/artifacts/${csv.artifactId}/download`,
  );

  // Process through the same durable service runner used by the deployment timer. This is
  // deliberately outside the authenticated browser session and records service provenance.
  assertWorkerStatementServiceCapability();
  let lastCycle = { processed: 0, failed: 0 };
  let jobs = readWorkerStatementJobs(jobIds);
  for (let cycle = 0; cycle < 5 && jobs.some((job) => job.state !== 'succeeded'); cycle += 1) {
    lastCycle = runServiceArtifactCycle();
    jobs = readWorkerStatementJobs(jobIds);
    if (jobs.some((job) => job.state === 'dead_letter')) break;
  }
  expect(
    lastCycle.processed + lastCycle.failed,
    'service runner must inspect queued work',
  ).toBeGreaterThan(0);
  expect(jobs).toHaveLength(2);
  expect(jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ state: 'succeeded', attempts: 1 }),
      expect.objectContaining({ state: 'succeeded', attempts: 1 }),
    ]),
  );
  for (const jobId of jobIds) {
    expect(readWorkerStatementRun(jobId)).toMatchObject({
      state: 'succeeded',
      outcome: 'succeeded',
      capability: 'artifact.worker_statement.render',
    });
  }

  const readyListResponse = await page.request.get(
    portal(`/api/worker-statement?periodStart=${PERIOD_START}&periodEnd=${PERIOD_END}`),
  );
  expect(readyListResponse.status()).toBe(200);
  const readyList = await jsonBody<{ artifacts: WorkerStatementArtifact[] }>(readyListResponse);
  const readyArtifacts = readyList.artifacts.filter((artifact) =>
    artifact.semanticFilename.includes(`${PERIOD_START}-${PERIOD_END}`),
  );
  expect(readyArtifacts).toHaveLength(2);
  expect(readyArtifacts.every((artifact) => artifact.status === 'ready')).toBe(true);
  expect(readyArtifacts.every((artifact) => artifact.readyAt && artifact.rendererVersion)).toBe(
    true,
  );
  expect(readyArtifacts.every((artifact) => (artifact.byteLength ?? 0) > 0)).toBe(true);

  const persistedArtifacts = readyArtifacts.map((artifact) => {
    const persisted = readPersistedWorkerStatementArtifact(artifact.artifactId);
    expect(persisted.status).toBe('ready');
    expect(persisted.format).toBe(artifact.format);
    expect(persisted.semantic_filename).toBe(artifact.semanticFilename);
    expect(persisted.media_type).toBe(artifact.mediaType);
    expect(persisted.byte_length).toBe(artifact.byteLength);
    expect(persisted.content_sha256).toMatch(/^[a-f0-9]{64}$/u);
    const stored = verifyWorkerStatementStorage(
      readE2EFixturePointer().documentRoot,
      persisted.storage_key,
      { mediaType: persisted.media_type ?? undefined },
    );
    expect(stored).toMatchObject({
      exists: true,
      byteLength: persisted.byte_length,
      contentSha256: persisted.content_sha256,
      mediaType: persisted.media_type,
      magicValid: true,
    });
    return { api: artifact, persisted };
  });

  await stepUpWorker(page);
  for (const { api, persisted } of persistedArtifacts) {
    const downloadResponse = await page.request.get(
      portal(`/api/worker-statement/artifacts/${encodeURIComponent(api.artifactId)}/download`),
    );
    expect(downloadResponse.status()).toBe(200);
    expect(downloadResponse.headers()['content-type']).toContain(persisted.media_type ?? '');
    expect(downloadResponse.headers()['content-length']).toBe(String(persisted.byte_length));
    expect(downloadResponse.headers()['content-disposition']).toContain(
      `filename="${persisted.semantic_filename}"`,
    );
    const bytes = await downloadResponse.body();
    expect(bytes.byteLength).toBe(persisted.byte_length);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(persisted.content_sha256);
    if (api.format === 'pdf') {
      expect(pdfMagicValid(bytes)).toBe(true);
    } else {
      expect(csvContentValid(bytes)).toBe(true);
      expect(bytes.toString('utf8')).toMatch(/worker|project|approved|reimbursement/i);
    }
  }

  const readyCsv = readyArtifacts.find((artifact) => artifact.format === 'csv');
  if (!readyCsv) throw new Error('Ready Worker statement CSV was not returned');

  // A second Worker must not learn whether the first Worker owns a valid artifact. Both status and
  // download use the same non-enumerating 404 boundary before any private bytes are read.
  await page.context().clearCookies();
  await signIn(page, 'worker2');
  const otherListResponse = await page.request.get(
    portal(`/api/worker-statement?periodStart=${PERIOD_START}&periodEnd=${PERIOD_END}`),
  );
  expect(otherListResponse.status()).toBe(200);
  const otherList = await jsonBody<{ artifacts: WorkerStatementArtifact[] }>(otherListResponse);
  expect(otherList.artifacts.some((artifact) => artifact.artifactId === readyCsv.artifactId)).toBe(
    false,
  );
  const otherStatusResponse = await page.request.get(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(readyCsv.artifactId)}`),
  );
  expect(otherStatusResponse.status()).toBe(404);
  const otherDownloadResponse = await page.request.get(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(readyCsv.artifactId)}/download`),
  );
  expect(otherDownloadResponse.status()).toBe(404);
  expect(await otherDownloadResponse.text()).not.toContain(readyCsv.semanticFilename);

  // PMs are operational reviewers, not Worker compensation principals. Finance and Owner are
  // also denied by the current worker-only policy; each role must receive the same non-disclosure
  // boundary rather than learning whether the Worker artifact exists.
  for (const [role, suffix] of [
    ['manager', 'pm'],
    ['finance', 'finance'],
    ['owner', 'owner'],
  ] as const) {
    await page.context().clearCookies();
    await signIn(page, role);
    const roleListResponse = await page.request.get(portal('/api/worker-statement'));
    expect(roleListResponse.status()).toBe(403);
    expect(await roleListResponse.text()).not.toContain(readyCsv.artifactId);
    const roleRequestResponse = await page.request.post(portal('/api/worker-statement'), {
      headers: { origin: new URL(page.url()).origin, referer: page.url() },
      data: {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        requestKey: `${requestKey}-${suffix}`,
      },
    });
    expect(roleRequestResponse.status()).toBe(403);
    expect(await roleRequestResponse.text()).not.toContain(readyCsv.artifactId);
  }
});
