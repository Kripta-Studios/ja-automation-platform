import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase, V3Repository } from '@ja/database';
import {
  assertFencedJobExecution,
  provisionServiceActor,
} from '../../packages/database/src/domains/jobs/index.ts';
import { runArtifactJobs, type ArtifactJobV3 } from '@ja/reporting';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: Array<() => void> = [];

beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Database = ReturnType<typeof createDatabase>;
type Sqlite = Database['sqlite'];

const PERIOD = {
  projectId: 'project-job',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
} as const;

function setup(): { root: string; sqlite: Sqlite; v3: V3Repository } {
  const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-artifacts-'));
  roots.push(root);
  const documentRoot = join(root, 'documents');
  mkdirSync(documentRoot, { recursive: true });
  for (const directory of [
    'receipts',
    'reports',
    'invoices',
    'technical',
    'plc-backups',
    'exports',
    'temp',
  ])
    mkdirSync(join(documentRoot, directory), { recursive: true });
  const database = createDatabase(join(root, 'app.db'));
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES('operator-1','Operator','antonny.luty@j-aautomation.com',1,'owner_admin','active',1,1,?,?,1)`,
    )
    .run(now, now);
  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES('jobs-operator-1','Jobs operator','jobs.operator@example.test',1,'finance_admin','active',1,1,?,?,1)`,
    )
    .run(now, now);
  provisionServiceActor(database.sqlite, {
    tenantId: B5_TEST_TENANT_ID,
    deploymentId: B5_TEST_DEPLOYMENT_ID,
    actorId: 'jobs-service-v1',
    name: 'J&A durable jobs',
    boundByUserId: 'jobs-operator-1',
  });
  database.sqlite.exec(`
    CREATE TABLE service_job_protected_write(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      job_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      deployment_id TEXT NOT NULL,
      capability TEXT NOT NULL
    ) STRICT;
  `);
  return { root, sqlite: database.sqlite, v3: new V3Repository(database.sqlite) };
}

function invoiceSnapshot(): Readonly<Record<string, unknown>> {
  return {
    number: 'INV-SERVICE-001',
    invoiceNumber: 'INV-SERVICE-001',
    locale: 'en',
    currency: 'EUR',
    legalEntity: { legalName: 'J&A Automation', address: 'Madrid' },
    client: { displayName: 'Service Actor Client' },
    project: { number: 'PRJ-SERVICE', name: 'Service Actor Project' },
    commercial: { streamType: 'labor' },
    calculation: { subtotalMinor: '0', taxMinor: '0', totalMinor: '0' },
    lines: [],
  };
}

function periodSnapshot(audience: 'customer' | 'internal'): Readonly<Record<string, unknown>> {
  return {
    project: {
      number: 'PRJ-SERVICE',
      name: 'Service Actor Project',
      clientName: 'Service Actor Client',
    },
    periodStart: PERIOD.periodStart,
    periodEnd: PERIOD.periodEnd,
    audience,
    locale: 'en',
    commercialSummary: {
      currency: 'EUR',
      actualMinutes: 0,
      approvedMinutes: 0,
      billableMinutes: 0,
      candidateSubtotalMinor: '0',
      operationalRevenueCandidateMinor: '0',
      invoicedNetMinor: '0',
      paidMinor: '0',
      receivableMinor: '0',
    },
    financialSummary: {
      currency: 'EUR',
      approvedCostMinor: '0',
      contributionMarginMinor: '0',
      contributionMarginBps: 0,
    },
    commercialCalculation: [],
    dailyReports: [],
    technicalReports: [],
    technicalChanges: [],
    timeSummary: [],
    sourceCounts: {},
    backupArtifacts: [],
  };
}

function accountingSnapshot(): Readonly<Record<string, unknown>> {
  return {
    periodStart: PERIOD.periodStart,
    periodEnd: PERIOD.periodEnd,
    locale: 'en',
    currency: 'EUR',
    invoiceRegister: [],
    collections: [],
    workerCosts: [],
    expenseRegister: [],
    totals: { currency: 'EUR', netMinor: '0', taxMinor: '0', grossMinor: '0' },
    totalsByCurrency: [],
  };
}

function insertProtectedWrite(
  sqlite: Sqlite,
  operation: string,
  execution: Parameters<ArtifactJobV3['invoiceSnapshotFromJob']>[1],
): void {
  const authorized = assertFencedJobExecution(sqlite, execution, {
    kind:
      execution.requiredCapability === 'artifact.invoice.render'
        ? 'invoice_pdf'
        : execution.requiredCapability === 'artifact.report.render'
          ? 'period_close_report'
          : execution.requiredCapability === 'billing.draft.generate'
            ? 'auto_draft'
            : 'accounting_pack_artifact_render',
    capability: execution.requiredCapability,
  });
  sqlite
    .prepare(
      `INSERT INTO service_job_protected_write(
         operation,job_id,run_id,tenant_id,deployment_id,capability
       ) VALUES(?,?,?,?,?,?)`,
    )
    .run(
      operation,
      authorized.jobId,
      authorized.runId,
      authorized.tenantId,
      authorized.deploymentId,
      authorized.requiredCapability,
    );
}

function artifactContext(sqlite: Sqlite, v3: V3Repository): ArtifactJobV3 {
  return {
    runDueJobs: (limit, handlers) => v3.runDueJobs(limit, handlers),
    invoiceSnapshotFromJob: (invoiceId, execution) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'invoice_pdf',
        capability: 'artifact.invoice.render',
        payloadTarget: { invoiceId },
      });
      return invoiceSnapshot();
    },
    recordInvoicePdfFromJob: (invoiceId, _storageKey, _sha256, _byteLength, execution) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'invoice_pdf',
        capability: 'artifact.invoice.render',
        payloadTarget: { invoiceId },
      });
      insertProtectedWrite(sqlite, 'invoice_pdf', execution);
    },
    refreshPeriodReportsFromJob: (input, execution) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'period_close_report',
        capability: 'artifact.report.render',
        payloadTarget: input,
      });
      return [
        {
          id: 'period-report-customer',
          audience: 'customer',
          snapshot: periodSnapshot('customer'),
        },
        {
          id: 'period-report-internal',
          audience: 'internal',
          snapshot: periodSnapshot('internal'),
        },
      ];
    },
    recordPeriodReportPdfFromJob: (reportId, _storageKey, _sha256, _byteLength, execution) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'period_close_report',
        capability: 'artifact.report.render',
        payloadTarget: { projectId: PERIOD.projectId, ...PERIOD },
      });
      insertProtectedWrite(sqlite, `period_report:${reportId}`, execution);
    },
    accountingPackSnapshotFromJob: (packId, execution) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'accounting_pack_artifact_render',
        capability: 'artifact.accounting_pack.render',
        payloadTarget: { packId },
      });
      return accountingSnapshot();
    },
    recordAccountingPackExportFromJob: (
      packId,
      exportType,
      _storageKey,
      _sha256,
      _byteLength,
      execution,
    ) => {
      assertFencedJobExecution(sqlite, execution, {
        kind: 'accounting_pack_artifact_render',
        capability: 'artifact.accounting_pack.render',
        payloadTarget: { packId },
      });
      insertProtectedWrite(sqlite, `accounting_pack:${exportType}`, execution);
      return { id: `${packId}:${exportType}`, created: true };
    },
  };
}

describe('service actor artifact execution boundary', () => {
  it('runs invoice, period report, automatic draft and every Accounting Pack format without a human principal', () => {
    const { root, sqlite, v3 } = setup();
    try {
      expect(() => new PortalRepository(sqlite).principalFor('jobs-service-v1')).toThrow(
        /active account required/i,
      );
      const jobV3 = artifactContext(sqlite, v3);
      const context = {
        documentRoot: join(root, 'documents'),
        v3: jobV3,
        repository: {
          createInvoiceDraftFromJob: (
            billingRuleId: string,
            periodStart: string,
            periodEnd: string,
            execution: Parameters<ArtifactJobV3['invoiceSnapshotFromJob']>[1],
          ) => {
            assertFencedJobExecution(sqlite, execution, {
              kind: 'auto_draft',
              capability: 'billing.draft.generate',
              payloadTarget: { billingRuleId, periodStart, periodEnd },
            });
            insertProtectedWrite(sqlite, 'auto_draft', execution);
          },
        },
      };

      v3.enqueueJob('invoice_pdf', 'service-artifact:invoice', { invoiceId: 'invoice-job' });
      v3.enqueueJob('period_close_report', 'service-artifact:period', {
        ...PERIOD,
        reportLocale: 'en',
      });
      v3.enqueueJob('auto_draft', 'service-artifact:draft', {
        billingRuleId: 'billing-rule-job',
        periodStart: PERIOD.periodStart,
        periodEnd: PERIOD.periodEnd,
      });
      v3.enqueueJob('accounting_pack_artifact_render', 'service-artifact:pack', {
        packId: 'pack-job',
        formats: ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'],
      });

      sqlite
        .prepare("UPDATE user SET status='suspended',version=version+1 WHERE id='jobs-operator-1'")
        .run();

      const first = runArtifactJobs(context);
      const jobStates = sqlite
        .prepare('SELECT kind,state,last_error_code FROM job ORDER BY kind')
        .all();
      expect(first, JSON.stringify(jobStates)).toMatchObject({ processed: 4, failed: 0 });
      expect(first.accountingPackResults?.filter((entry) => entry.status === 'ready')).toHaveLength(
        5,
      );

      const second = runArtifactJobs(context);
      expect(second.processed).toBe(0);
      expect(second.failed).toBe(0);

      expect(
        sqlite.prepare('SELECT id FROM user WHERE id=?').get('jobs-service-v1'),
      ).toBeUndefined();
      const writes = sqlite
        .prepare('SELECT operation,capability FROM service_job_protected_write ORDER BY id')
        .all() as Array<{ operation: string; capability: string }>;
      expect(writes).toEqual([
        { operation: 'invoice_pdf', capability: 'artifact.invoice.render' },
        { operation: 'period_report:period-report-customer', capability: 'artifact.report.render' },
        { operation: 'period_report:period-report-internal', capability: 'artifact.report.render' },
        { operation: 'auto_draft', capability: 'billing.draft.generate' },
        { operation: 'accounting_pack:pdf', capability: 'artifact.accounting_pack.render' },
        { operation: 'accounting_pack:xlsx', capability: 'artifact.accounting_pack.render' },
        { operation: 'accounting_pack:invoice_csv', capability: 'artifact.accounting_pack.render' },
        { operation: 'accounting_pack:expense_csv', capability: 'artifact.accounting_pack.render' },
        { operation: 'accounting_pack:json', capability: 'artifact.accounting_pack.render' },
      ]);

      const auditRows = sqlite
        .prepare(
          `SELECT actor_id,actor_kind,service_actor_id,service_capability,job_id,job_run_id,
                  tenant_id,deployment_id
             FROM audit_event
            WHERE actor_kind='service'
            ORDER BY occurred_at,rowid`,
        )
        .all() as Array<Record<string, string | null>>;
      expect(auditRows.length).toBe(12);
      expect(auditRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actor_id: null,
            actor_kind: 'service',
            service_actor_id: 'jobs-service-v1',
            tenant_id: B5_TEST_TENANT_ID,
            deployment_id: B5_TEST_DEPLOYMENT_ID,
          }),
        ]),
      );
      expect(
        auditRows.every(
          (row) =>
            row.actor_id === null &&
            row.service_actor_id === 'jobs-service-v1' &&
            row.job_id !== null &&
            row.job_run_id !== null &&
            row.service_capability !== null &&
            row.tenant_id === B5_TEST_TENANT_ID &&
            row.deployment_id === B5_TEST_DEPLOYMENT_ID,
        ),
      ).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
