import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
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
    .run(id, id, `${id}@example.com`, role, 'active', 1, now, now);
}

describe('invoice lifecycle coverage', () => {
  it('invoices approved milestones and issues signed credit adjustments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-lifecycle-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance: Principal = {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
      isServiceActor: true,
    };
    const client = repository.createClient(owner, {
      legalName: 'Lifecycle Client',
      displayName: 'Lifecycle Client',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'billing-lifecycle@example.test',
      billingAddress: 'Lifecycle Client billing address',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Lifecycle Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'all_in',
      fixedPriceMinor: 10_000n,
    });
    const entity = repository.createLegalEntity(owner, {
      code: 'LIFE',
      legalName: 'Lifecycle Entity',
      currency: 'USD',
      billingAddress: 'Configured address',
      companyIdentifiers: 'Configured identifiers',
    });
    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: entity.id,
      prefix: 'LIFE',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const tax = repository.createTaxProfile(finance, {
      name: 'No tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const laborRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-01-01',
    });
    const original = repository.createInvoiceDraft(
      finance,
      laborRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    repository.approveInvoiceDraft(finance, original.id);
    const issued = repository.issueInvoice(finance, original.id, 'es');
    expect(issued.issued).toBe(true);
    expect(issued.invoiceNumber).toMatch(/^LIFE-/);
    expect(
      JSON.parse(
        (
          sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(original.id) as {
            snapshot_json: string;
          }
        ).snapshot_json,
      ).locale,
    ).toBe('es');

    const milestone = repository.createProjectMilestone(owner, {
      projectId: project.id,
      name: 'Commissioning acceptance',
      description: 'Approved acceptance milestone',
      amountMinor: 5_000n,
      dueOn: '2026-08-20',
    });
    repository.submitProjectMilestone(owner, milestone.id, milestone.version);
    repository.reviewProjectMilestone(finance, milestone.id, 'approved');
    const milestoneRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'milestone',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-01-01',
    });
    const milestoneInvoice = repository.createInvoiceDraft(
      finance,
      milestoneRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      (
        sqlite
          .prepare('SELECT subtotal_minor FROM invoice WHERE id=?')
          .get(milestoneInvoice.id) as {
          subtotal_minor: number;
        }
      ).subtotal_minor,
    ).toBe(5_000);

    const credit = repository.createInvoiceAdjustment(finance, {
      originalInvoiceId: original.id,
      adjustmentType: 'credit',
      amountMinor: 1_250n,
      reason: 'Approved commercial credit',
    });
    expect(
      (
        sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(credit.id) as {
          subtotal_minor: number;
        }
      ).subtotal_minor,
    ).toBe(-1_250);
    expect(
      (
        sqlite
          .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
          .get(credit.id) as { source_type: string; source_id: string }
      ).source_type,
    ).toBe('adjustment');
    repository.approveInvoiceDraft(finance, credit.id);
    const issuedCredit = repository.issueInvoice(finance, credit.id);
    expect(issuedCredit.issued).toBe(true);
    expect(
      JSON.parse(
        (
          sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(credit.id) as {
            snapshot_json: string;
          }
        ).snapshot_json,
      ).template,
    ).toMatchObject({ id: 'credit-adjustment', version: 1 });
    const lockedSource = sqlite
      .prepare(
        'SELECT source_link_id,source_version,locked_at FROM invoice_source WHERE invoice_id=?',
      )
      .get(credit.id) as { source_link_id: string; source_version: number; locked_at: string };
    expect(lockedSource.locked_at).toBeTruthy();
    expect(
      (
        sqlite.prepare('SELECT source_lock_at FROM invoice WHERE id=?').get(credit.id) as {
          source_lock_at: string;
        }
      ).source_lock_at,
    ).toBe(lockedSource.locked_at);
    expect(() =>
      sqlite
        .prepare('UPDATE invoice_source SET source_version=? WHERE source_link_id=?')
        .run(lockedSource.source_version + 1, lockedSource.source_link_id),
    ).toThrow(/issued invoice sources are immutable/i);
    expect(repository.issueInvoice(finance, credit.id)).toEqual({
      invoiceNumber: issuedCredit.invoiceNumber,
      issued: false,
    });
    expect(
      sqlite
        .prepare('SELECT source_version,locked_at FROM invoice_source WHERE source_link_id=?')
        .get(lockedSource.source_link_id),
    ).toEqual({ source_version: lockedSource.source_version, locked_at: lockedSource.locked_at });
    expect(
      sqlite
        .prepare('SELECT adjustment_invoice_id FROM invoice_adjustment WHERE original_invoice_id=?')
        .get(original.id),
    ).toMatchObject({ adjustment_invoice_id: credit.id });
    sqlite.close();
  });
});
