import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  renderAccountingPackArtifacts,
  REPORT_TEMPLATE_VERSION,
  runArtifactJobs,
  type ArtifactJobContext,
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

type B5ArtifactPrincipal = Readonly<{
  actor: string;
  tenantId: string;
  deploymentId: string;
  serviceActorId: string;
  jobId: string;
  jobRunId: string;
  fenceVersion: number;
  capability: string;
}>;

function b5ArtifactPrincipal(): {
  execution: B5DurableJobFixture;
  principal: B5ArtifactPrincipal;
} {
  const execution = makeB5DurableJobFixture({ jobState: 'running', runState: 'running' });
  return {
    execution,
    principal: {
      actor: execution.serviceActor.id,
      tenantId: execution.tenantId,
      deploymentId: execution.deploymentId,
      serviceActorId: execution.serviceActor.id,
      jobId: execution.job.id,
      jobRunId: execution.jobRun.id,
      fenceVersion: execution.jobRun.fenceVersion,
      capability: execution.jobRun.capability,
    },
  };
}

function expectB5ArtifactExecution(
  principal: B5ArtifactPrincipal,
  execution: B5DurableJobFixture,
): void {
  expect(principal).toMatchObject({
    actor: execution.serviceActor.id,
    tenantId: execution.tenantId,
    deploymentId: execution.deploymentId,
    serviceActorId: execution.serviceActor.id,
    jobId: execution.job.id,
    jobRunId: execution.jobRun.id,
    fenceVersion: execution.jobRun.fenceVersion,
    capability: execution.jobRun.capability,
  });
}

function baseContext(
  root: string,
  v3: NonNullable<ArtifactJobContext<B5ArtifactPrincipal>['v3']>,
  principal: B5ArtifactPrincipal,
): ArtifactJobContext<B5ArtifactPrincipal> {
  return {
    principal,
    documentRoot: root,
    repository: { createInvoiceDraft: () => undefined },
    v3,
  };
}

describe('requested reporting artifact implementation', () => {
  it('rejects a pre-existing destination with different deterministic content and cleans temp files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-reporting-collision-'));
    roots.push(root);
    const { principal } = b5ArtifactPrincipal();
    const target = join(root, 'invoices', 'invoice-1', `${REPORT_TEMPLATE_VERSION}.pdf`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from('unrelated pre-existing content'));
    let thrown: unknown;
    let recorded = false;

    const result = runArtifactJobs(
      baseContext(
        root,
        {
          runDueJobs: (_limit, handlers) => {
            try {
              handlers.invoice_pdf({ invoiceId: 'invoice-1' });
              return { processed: 1, failed: 0, overdueMarked: 0 };
            } catch (error) {
              thrown = error;
              return { processed: 0, failed: 1, overdueMarked: 0 };
            }
          },
          invoiceSnapshot: () => ({ number: 'JA-INV-0001' }),
          recordInvoicePdf: () => {
            recorded = true;
          },
          refreshPeriodReports: () => [],
          recordPeriodReportPdf: () => undefined,
          accountingPackSnapshot: () => snapshot,
          recordAccountingPackExport: () => ({ id: 'export-1', created: true }),
          recordDocumentScan: () => undefined,
        },
        principal,
      ),
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
    const { execution, principal } = b5ArtifactPrincipal();
    const ready: string[] = [];
    const failed: string[] = [];

    const result = runArtifactJobs(
      baseContext(
        root,
        {
          runDueJobs: (_limit, handlers) => {
            try {
              expect(handlers.accounting_pack_artifact_render).toBeTypeOf('function');
              handlers.accounting_pack_artifact_render({ packId: 'pack-1' });
              return { processed: 1, failed: 0, overdueMarked: 0 };
            } catch {
              return { processed: 0, failed: 1, overdueMarked: 0 };
            }
          },
          invoiceSnapshot: () => ({}),
          recordInvoicePdf: () => undefined,
          refreshPeriodReports: () => [],
          recordPeriodReportPdf: () => undefined,
          accountingPackSnapshot: () => snapshot,
          recordAccountingPackExport: (actor, _packId, exportType) => {
            expectB5ArtifactExecution(actor, execution);
            ready.push(exportType);
            return { id: `export-${exportType}`, created: true };
          },
          recordAccountingPackExportFailure: (actor, _packId, exportType) => {
            expectB5ArtifactExecution(actor, execution);
            failed.push(exportType);
          },
          recordDocumentScan: () => undefined,
        },
        principal,
      ),
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
