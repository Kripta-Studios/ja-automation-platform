import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: string,
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@example.com`, role, 'active', 1, now, now);
}

describe('commercial billing controls', () => {
  it('clips capped T&M, emits fixed-price allocation and bills hybrid overage', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-commercial-'));
    directories.push(directory);
    const databasePath = join(directory, 'app.db');
    const { sqlite } = createDatabase(databasePath);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker', 'worker');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
    const client = repository.createClient(owner, {
      legalName: 'Commercial Client',
      displayName: 'Commercial Client',
      currency: 'USD',
      timezone: 'UTC',
    });
    const capped = repository.createProject(owner, {
      clientId: client.id,
      name: 'Capped Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'capped_tm',
      poCapMinor: 15_000n,
    });
    repository.assignWorker(owner, {
      projectId: capped.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: capped.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const manager = repository.principalFor('manager');
    const worker = repository.principalFor('worker');
    v3.createClientLaborRate(finance, {
      projectId: capped.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-08-01',
    });
    const time = repository.createTimeEntry(worker, {
      projectId: capped.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 120,
      summary: 'Capped work',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);
    const entity = repository.createLegalEntity(owner, {
      code: 'COM',
      legalName: 'Commercial Entity',
      currency: 'USD',
      billingAddress: 'Configured address',
      companyIdentifiers: 'Configured identifiers',
    });
    const tax = repository.createTaxProfile(finance, {
      name: 'Commercial tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const cappedRule = repository.createBillingRule(finance, {
      projectId: capped.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'every_14_days',
      anchorDate: '2026-08-03',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: entity.id,
      prefix: 'COM',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const concurrentCloseRule = repository.createBillingRule(finance, {
      projectId: capped.id,
      legalEntityId: entity.id,
      streamType: 'expense',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const secondDatabase = createDatabase(databasePath);
    const secondRepository = new PortalRepository(secondDatabase.sqlite);
    const secondV3 = new V3Repository(secondDatabase.sqlite);
    const closeResults = await Promise.all([
      Promise.resolve(
        v3.closeBillingPeriod(finance, concurrentCloseRule.id, '2026-08-03', '2026-08-16'),
      ),
      Promise.resolve(
        secondV3.closeBillingPeriod(finance, concurrentCloseRule.id, '2026-08-03', '2026-08-16'),
      ),
    ]);
    expect(closeResults.filter((result) => result.closed)).toHaveLength(1);
    expect(closeResults.filter((result) => !result.closed)).toHaveLength(1);
    const cappedDraft = repository.createInvoiceDraft(
      finance,
      cappedRule.id,
      '2026-08-03',
      '2026-08-16',
    );
    expect(
      (
        sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(cappedDraft.id) as {
          subtotal_minor: number;
        }
      ).subtotal_minor,
    ).toBe(15_000);
    expect(
      (
        sqlite
          .prepare('SELECT snapshot_json FROM invoice_line WHERE invoice_id=?')
          .get(cappedDraft.id) as { snapshot_json: string }
      ).snapshot_json,
    ).toContain('capApplied');
    repository.approveInvoiceDraft(finance, cappedDraft.id);
    const issueResults = await Promise.all([
      Promise.resolve(repository.issueInvoice(finance, cappedDraft.id)),
      Promise.resolve(secondRepository.issueInvoice(finance, cappedDraft.id)),
    ]);
    expect(issueResults.filter((result) => result.issued)).toHaveLength(1);
    expect(issueResults.filter((result) => !result.issued)).toHaveLength(1);
    expect(
      (
        sqlite
          .prepare('SELECT COUNT(*) count FROM invoice WHERE id=? AND invoice_number IS NOT NULL')
          .get(cappedDraft.id) as { count: number }
      ).count,
    ).toBe(1);
    expect(() =>
      repository.createInvoiceDraft(finance, cappedRule.id, '2026-08-17', '2026-08-30'),
    ).toThrow(/Billing period is not ready/);

    const fixed = repository.createProject(owner, {
      clientId: client.id,
      name: 'Fixed Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'all_in',
      fixedPriceMinor: 30_000n,
    });
    const fixedRule = repository.createBillingRule(finance, {
      projectId: fixed.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const fixedDraft = repository.createInvoiceDraft(
      finance,
      fixedRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      (
        sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(fixedDraft.id) as {
          subtotal_minor: number;
        }
      ).subtotal_minor,
    ).toBe(30_000);

    const hybrid = repository.createProject(owner, {
      clientId: client.id,
      name: 'Hybrid Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'hybrid',
    });
    repository.assignWorker(owner, {
      projectId: hybrid.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: hybrid.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const hybridManager = repository.principalFor('manager');
    const hybridWorker = repository.principalFor('worker');
    v3.createClientLaborRate(finance, {
      projectId: hybrid.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-08-01',
    });
    const hybridTime = repository.createTimeEntry(hybridWorker, {
      projectId: hybrid.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 120,
      summary: 'Hybrid overage',
    });
    repository.submitTime(hybridWorker, hybridTime.id, hybridTime.version);
    repository.operationalApproveTime(hybridManager, hybridTime.id, 'approved');
    repository.financeApproveTime(finance, hybridTime.id, true);
    const hybridRule = repository.createBillingRule(finance, {
      projectId: hybrid.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
      fixedAmountMinor: 5_000n,
      includedMinutes: 60,
    });
    const hybridDraft = repository.createInvoiceDraft(
      finance,
      hybridRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      (
        sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(hybridDraft.id) as {
          subtotal_minor: number;
        }
      ).subtotal_minor,
    ).toBe(15_000);
    secondDatabase.sqlite.close();
    sqlite.close();
  });
});
