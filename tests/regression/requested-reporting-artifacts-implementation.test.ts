import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  renderAccountingPackArtifacts,
  REPORT_TEMPLATE_VERSION,
  runArtifactJobs,
  type ArtifactJobContext,
  type ArtifactJobExecution,
} from '@ja/reporting';
import {
  makeB5DurableJobFixture,
  type B5DurableJobFixture,
} from '../fixtures/b5-durable-job-fixture.js';

const roots: string[] = [];
const originalChromiumPath = process.env.JA_CHROMIUM_PATH;

afterEach(() => {
  if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
  else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const snapshot = {
  periodStart: '2120-01-01',
  periodEnd: '2120-01-31',
  invoiceRegister: [{ invoiceNumber: 'JA-INV-0001', totalMinor: '1000' }],
  collections: [],
  workerCosts: [],
  expenseRegister: [{ category: 'travel', amountMinor: '100' }],
  totals: { revenueMinor: '1000' },
};

function b5ArtifactPrincipal(): {
  execution: B5DurableJobFixture;
  proof: ArtifactJobExecution;
} {
  const execution = makeB5DurableJobFixture({ jobState: 'running', runState: 'running' });
  return {
    execution,
    proof: {
      jobId: execution.job.id,
      runId: execution.jobRun.id,
      tenantId: execution.tenantId,
      deploymentId: execution.deploymentId,
      requiredCapability: execution.jobRun.capability,
      fenceVersion: execution.jobRun.fenceVersion,
    },
  };
}

function expectB5ArtifactExecution(
  proof: ArtifactJobExecution,
  execution: B5DurableJobFixture,
): void {
  expect(proof).toMatchObject({
    jobId: execution.job.id,
    runId: execution.jobRun.id,
    tenantId: execution.tenantId,
    deploymentId: execution.deploymentId,
    requiredCapability: execution.jobRun.capability,
    fenceVersion: execution.jobRun.fenceVersion,
  });
}

function baseContext(root: string, v3: ArtifactJobContext['v3']): ArtifactJobContext {
  return {
    documentRoot: root,
    repository: { createInvoiceDraftFromJob: () => undefined },
    v3,
  };
}

describe('requested reporting artifact implementation', () => {
  it('rejects a pre-existing destination with different deterministic content and cleans temp files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-reporting-collision-'));
    roots.push(root);
    const { proof } = b5ArtifactPrincipal();
    const target = join(root, 'invoices', 'invoice-1', `${REPORT_TEMPLATE_VERSION}.pdf`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from('unrelated pre-existing content'));
    let thrown: unknown;
    let recorded = false;

    const result = runArtifactJobs(
      baseContext(root, {
        runDueJobs: (_limit, handlers) => {
          try {
            handlers.invoice_pdf({ invoiceId: 'invoice-1' }, proof);
            return { processed: 1, failed: 0, overdueMarked: 0 };
          } catch (error) {
            thrown = error;
            return { processed: 0, failed: 1, overdueMarked: 0 };
          }
        },
        invoiceSnapshotFromJob: () => ({ number: 'JA-INV-0001' }),
        recordInvoicePdfFromJob: () => {
          recorded = true;
        },
        refreshPeriodReportsFromJob: () => [],
        recordPeriodReportPdfFromJob: () => undefined,
        accountingPackSnapshotFromJob: () => snapshot,
        recordAccountingPackExportFromJob: () => ({ id: 'export-1', created: true }),
        recordDocumentScanFromJob: () => undefined,
      }),
    );

    expect(result).toMatchObject({ processed: 0, failed: 1 });
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(/collision|existing content/i);
    expect(recorded).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe('unrelated pre-existing content');
    expect(readdirSync(dirname(target)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps Accounting Pack format failures scoped while recording all independent successes', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-reporting-independent-'));
    roots.push(root);
    process.env.JA_CHROMIUM_PATH = join(root, 'missing-chromium');
    const { execution, proof } = b5ArtifactPrincipal();
    const ready: string[] = [];
    const failed: string[] = [];

    const result = runArtifactJobs(
      baseContext(root, {
        runDueJobs: (_limit, handlers) => {
          try {
            expect(handlers.accounting_pack_artifact_render).toBeTypeOf('function');
            handlers.accounting_pack_artifact_render({ packId: 'pack-1' }, proof);
            return { processed: 1, failed: 0, overdueMarked: 0 };
          } catch {
            return { processed: 0, failed: 1, overdueMarked: 0 };
          }
        },
        invoiceSnapshotFromJob: () => ({}),
        recordInvoicePdfFromJob: () => undefined,
        refreshPeriodReportsFromJob: () => [],
        recordPeriodReportPdfFromJob: () => undefined,
        accountingPackSnapshotFromJob: () => snapshot,
        recordAccountingPackExportFromJob: (_packId, exportType, _key, _sha, _bytes, actor) => {
          expectB5ArtifactExecution(actor, execution);
          ready.push(exportType);
          return { id: `export-${exportType}`, created: true };
        },
        recordAccountingPackExportFailureFromJob: (_packId, exportType, _error, actor) => {
          expectB5ArtifactExecution(actor, execution);
          failed.push(exportType);
        },
        recordDocumentScanFromJob: () => undefined,
      }),
    );

    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(ready).toEqual(['xlsx', 'invoice_csv', 'expense_csv', 'json']);
    expect(failed).toEqual(['pdf']);
    expect(result.accountingPackResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ packId: 'pack-1', exportType: 'pdf', status: 'failed' }),
        expect.objectContaining({ packId: 'pack-1', exportType: 'xlsx', status: 'ready' }),
        expect.objectContaining({ packId: 'pack-1', exportType: 'invoice_csv', status: 'ready' }),
        expect.objectContaining({ packId: 'pack-1', exportType: 'expense_csv', status: 'ready' }),
        expect.objectContaining({ packId: 'pack-1', exportType: 'json', status: 'ready' }),
      ]),
    );
  });

  it('exposes independent renderer results without aborting later formats', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-reporting-build-results-'));
    roots.push(root);
    process.env.JA_CHROMIUM_PATH = join(root, 'missing-chromium');

    const results = renderAccountingPackArtifacts(snapshot);

    expect(results.map((result) => [result.type, result.status])).toEqual([
      ['pdf', 'failed'],
      ['xlsx', 'ready'],
      ['invoice_csv', 'ready'],
      ['expense_csv', 'ready'],
      ['json', 'ready'],
    ]);
    for (const result of results.filter((item) => item.status === 'ready'))
      expect(result.bytes?.byteLength).toBeGreaterThan(0);
  });
});
