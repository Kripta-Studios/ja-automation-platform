import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  SupplierWorkforceRepository,
  V3AccessDeniedError,
  V3Repository,
  WorkerStatementRepository,
} from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});
describe('live supplier financial restriction', () => {
  it('denies compensation to supplier accounts while keeping finance out of operational payloads', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'supplier-operational');
    const stamp = new Date().toISOString();
    fixture.sqlite
      .prepare(
        "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES('supplier-fixture-login',?,'credential',?,'isolated-test-hash',?,?)",
      )
      .run(worker.userId, worker.userId, stamp, stamp);
    const entry = fixture.repository.createTimeEntry(worker, {
      projectId: fixture.project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Operational privacy regression',
    });
    const supplier = new SupplierWorkforceRepository(fixture.sqlite);
    const finance = new V3Repository(fixture.sqlite);
    const statements = new WorkerStatementRepository(fixture.sqlite);
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'supplier-owner');
    const ownReceipt = fixture.repository.registerPrivateDocument(worker, {
      projectId: fixture.project.id,
      sha256: 'd'.repeat(64),
      mediaType: 'image/png',
      byteLength: 5,
      storageKey: 'receipts/supplier-own.png',
      originalFilename: 'supplier-own.png',
      artifactType: 'receipt',
      artifactClassification: 'standard',
      sensitivity: 'sensitive',
    });
    const otherReceipt = fixture.repository.registerPrivateDocument(owner, {
      projectId: fixture.project.id,
      sha256: 'e'.repeat(64),
      mediaType: 'image/png',
      byteLength: 5,
      storageKey: 'receipts/supplier-other.png',
      originalFilename: 'supplier-other.png',
      artifactType: 'receipt',
      artifactClassification: 'standard',
      sensitivity: 'sensitive',
    });
    const financeDocument = fixture.repository.registerPrivateDocument(owner, {
      projectId: fixture.project.id,
      sha256: 'f'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/supplier-finance.pdf',
      originalFilename: 'supplier-finance.pdf',
      artifactType: 'payroll',
      artifactClassification: 'finance',
      sensitivity: 'sensitive',
    });
    const ownReport = fixture.repository.createDailyReport(worker, {
      projectId: fixture.project.id,
      workDate: '2026-08-03',
      summary: 'Supplier own operational report',
      tasksCompleted: 'Privacy regression',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const otherReport = fixture.repository.createDailyReport(owner, {
      projectId: fixture.project.id,
      workDate: '2026-08-03',
      summary: 'Owner private operational report',
      tasksCompleted: 'Privacy regression',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const company = supplier.createSupplier(owner, {
      name: 'No financial access supplier',
    });
    for (const profile of ['external_technician', 'supplier_coordinator'] as const) {
      supplier.setAccountProfile(owner, {
        userId: worker.userId,
        supplierId: company.id,
        profile,
      });
      const principal =
        profile === 'supplier_coordinator'
          ? (() => {
              supplier.grantProject(owner, {
                supplierId: company.id,
                projectId: fixture.project.id,
                coordinatorId: worker.userId,
                startsOn: '2026-01-01',
              });
              return stepUpB5Principal(fixture.sqlite, worker, 'supplier-financial');
            })()
          : stepUpB5Principal(fixture.sqlite, worker, 'supplier-external');
      const payloads = [
        fixture.repository.listOwnTime(principal),
        fixture.repository.listTimeForScope(principal),
        fixture.repository.timeDetail(principal, entry.id),
        fixture.repository.listOwnTimeWeek(principal, '2026-08-03'),
      ];
      expect(finance.authorizeDocument(principal, ownReceipt.id).filename).toBe('supplier-own.png');
      expect(() => finance.authorizeDocument(principal, otherReceipt.id)).toThrow(
        V3AccessDeniedError,
      );
      expect(() => finance.authorizeDocument(principal, financeDocument.id)).toThrow(
        V3AccessDeniedError,
      );
      expect(fixture.repository.reportDetail(principal, ownReport.id).report.id).toBe(ownReport.id);
      expect(() => fixture.repository.reportDetail(principal, otherReport.id)).toThrow(
        AccessDeniedError,
      );
      for (const payload of payloads)
        expect(JSON.stringify(payload)).not.toMatch(
          /billability|invoice_id|billable_minutes|client_rate|compensation_amount|internal_cost|billing_status|currency/,
        );
      expect(() => finance.workerPay(principal, '2026-08-01', '2026-08-31')).toThrow(
        V3AccessDeniedError,
      );
      expect(() => finance.listCompensationSettlements(principal)).toThrow(V3AccessDeniedError);
      expect(() => statements.listArtifacts(principal)).toThrow(AccessDeniedError);
      expect(() =>
        fixture.repository.listWorkerStatementTime(principal, '2026-08-01', '2026-08-31'),
      ).toThrow();
      expect(() =>
        fixture.repository.listWorkerStatementExpenses(principal, '2026-08-01', '2026-08-31'),
      ).toThrow();
      expect(() => finance.financePortfolio(principal)).toThrow(V3AccessDeniedError);
      expect(() =>
        supplier.setAccountProfile(worker, {
          userId: worker.userId,
          profile: 'standard',
        }),
      ).toThrow();
    }
    supplier.setAccountProfile(owner, {
      userId: worker.userId,
      profile: 'standard',
    });
    const standardWorker = stepUpB5Principal(fixture.sqlite, worker, 'restored-standard-worker');
    expect(() => finance.workerPay(standardWorker, '2026-08-01', '2026-08-31')).not.toThrow();
  });
});
