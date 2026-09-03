import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restoreDeploymentIdentities: Array<() => void> = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];

beforeEach(() => restoreDeploymentIdentities.push(installB5TestDeploymentIdentity()));

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // A passing test may already have closed the handle; cleanup must remain idempotent.
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
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
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.com`,
      role,
      'active',
      1,
      now,
      now,
    );
}

function withRecentStepUp(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  principal: Principal,
): Principal {
  const now = new Date().toISOString();
  const sessionId = `commercial-step-up-${principal.userId}`;
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  return { ...principal, sessionId };
}

describe('commercial billing controls', () => {
  it('clips capped T&M, emits fixed-price allocation and bills hybrid overage', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-commercial-'));
    directories.push(directory);
    const databasePath = join(directory, 'app.db');
    const { sqlite } = createDatabase(databasePath);
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker', 'worker');
    const owner = withRecentStepUp(sqlite, {
      userId: 'owner',
      role: 'owner_admin',
      projectIds: new Set(),
    });
    const finance = withRecentStepUp(sqlite, {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
    });
    const client = repository.createClient(owner, {
      legalName: 'Commercial Client',
      displayName: 'Commercial Client',
      currency: 'USD',
      timezone: 'UTC',
      billingAddress: 'Commercial Client billing address',
      billingEmail: 'billing@commercial.example',
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
    databases.push(secondDatabase.sqlite);
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
    expect(
      sqlite
        .prepare(
          `SELECT source_type,source_id,disposition,original_minor,allocated_minor,remaining_minor,reason_code
           FROM invoice_commercial_source_manifest WHERE invoice_id=?`,
        )
        .all(cappedDraft.id),
    ).toEqual([
      expect.objectContaining({
        source_type: 'time',
        source_id: time.id,
        disposition: 'partially_included',
        original_minor: 20_000,
        allocated_minor: 15_000,
        remaining_minor: 5_000,
        reason_code: 'capped_tm_partial_allocation',
      }),
    ]);
    repository.approveInvoiceDraft(finance, cappedDraft.id);
    expect(() => repository.issueInvoice(finance, cappedDraft.id)).toThrow(
      /Canonical legal entity revision is required/u,
    );
    expect(
      sqlite.prepare('SELECT state,invoice_number FROM invoice WHERE id=?').get(cappedDraft.id),
    ).toEqual({ state: 'approved', invoice_number: null });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE entity_type='invoice' AND entity_id=? AND action='invoice.issue'",
        )
        .get(cappedDraft.id),
    ).toEqual({ count: 0 });
    const canonicalEntity = v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: '2026-01-01',
      legalName: 'Commercial Entity S.L.',
      taxIdentifier: 'ESCOM12345678',
      registrationIdentifier: 'COM-REG-001',
      addressLine1: 'Configured address',
      locality: 'Madrid',
      region: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Bind the commercial billing fixture to reviewed canonical authority',
      idempotencyKey: 'commercial-billing:canonical-entity',
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: capped.id,
      legalEntityRevisionId: canonicalEntity.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind capped billing to the reviewed canonical entity',
      idempotencyKey: 'commercial-billing:capped-project-entity',
    });
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
    expect(
      sqlite.prepare('SELECT invoice_id,billing_status FROM time_entry WHERE id=?').get(time.id),
    ).toEqual({ invoice_id: null, billing_status: 'cap_blocked' });
    expect(() =>
      sqlite
        .prepare(
          'UPDATE invoice_commercial_source_manifest SET remaining_minor=0 WHERE invoice_id=?',
        )
        .run(cappedDraft.id),
    ).toThrow(/commercial source manifest is immutable/i);
    const issuedSnapshot = JSON.parse(
      (
        sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(cappedDraft.id) as {
          snapshot_json: string;
        }
      ).snapshot_json,
    ) as { commercialSourceManifest: Array<Record<string, unknown>> };
    expect(issuedSnapshot.commercialSourceManifest).toEqual([
      expect.objectContaining({
        source_id: time.id,
        allocated_minor: '15000',
        remaining_minor: '5000',
      }),
    ]);
    repository.updateProject(owner, { projectId: capped.id, poCapMinor: 30_000n });
    const cappedRemainderRule = repository.createBillingRule(finance, {
      projectId: capped.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const cappedRemainderDraft = repository.createInvoiceDraft(
      finance,
      cappedRemainderRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(cappedRemainderDraft.id),
    ).toEqual({ subtotal_minor: 5_000 });
    expect(
      sqlite
        .prepare(
          `SELECT disposition,original_minor,allocated_minor,remaining_minor
             FROM invoice_commercial_source_manifest
            WHERE invoice_id=? AND source_type='time' AND source_id=?`,
        )
        .get(cappedRemainderDraft.id, time.id),
    ).toEqual({
      disposition: 'included',
      original_minor: 5_000,
      allocated_minor: 5_000,
      remaining_minor: 0,
    });
    repository.approveInvoiceDraft(finance, cappedRemainderDraft.id);
    repository.issueInvoice(finance, cappedRemainderDraft.id);
    expect(
      sqlite.prepare('SELECT invoice_id,billing_status FROM time_entry WHERE id=?').get(time.id),
    ).toEqual({ invoice_id: cappedRemainderDraft.id, billing_status: 'locked' });
    expect(
      sqlite
        .prepare(
          `SELECT SUM(allocated_minor) allocated
             FROM invoice_commercial_source_manifest
            WHERE source_type='time' AND source_id=?`,
        )
        .get(time.id),
    ).toEqual({ allocated: 20_000 });
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
    repository.assignWorker(owner, {
      projectId: fixed.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: fixed.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    repository.createProjectCommercialPolicy(finance, {
      projectId: fixed.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: false,
      overtimeThresholdMinutes: null,
      travelClientBillable: false,
      customerSignoffRequired: false,
    });
    const excludedAllInTravel = repository.createTimeEntry(repository.principalFor('worker'), {
      projectId: fixed.id,
      workDate: '2026-08-10',
      category: 'travel',
      minutes: 60,
      summary: 'Travel compensated to worker but excluded from client billing',
    });
    repository.submitTime(
      repository.principalFor('worker'),
      excludedAllInTravel.id,
      excludedAllInTravel.version,
    );
    repository.operationalApproveTime(
      repository.principalFor('manager'),
      excludedAllInTravel.id,
      'approved',
    );
    repository.financeApproveTime(finance, excludedAllInTravel.id, true);
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
    expect(
      sqlite
        .prepare(
          `SELECT disposition,reason_code FROM invoice_commercial_source_manifest
           WHERE invoice_id=? AND source_type='fixed_price'`,
        )
        .get(fixedDraft.id),
    ).toEqual({ disposition: 'included', reason_code: 'all_in_fixed_price' });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=? AND source_type='time' AND source_id=?",
        )
        .get(fixedDraft.id, excludedAllInTravel.id),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare('SELECT invoice_id,billing_status,billing_lock_id FROM time_entry WHERE id=?')
        .get(excludedAllInTravel.id),
    ).toEqual({ invoice_id: null, billing_status: 'unlocked', billing_lock_id: null });

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
  });
});
