import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
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

describe('invoice lifecycle coverage', () => {
  it('invoices approved milestones and issues signed credit adjustments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-lifecycle-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    const financeSessionId = 'invoice-lifecycle-finance-session';
    const financeSessionTime = new Date().toISOString();
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        financeSessionId,
        `${financeSessionId}-token`,
        'finance',
        new Date(Date.now() + 3_600_000).toISOString(),
        financeSessionTime,
        financeSessionTime,
        financeSessionTime,
      );
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance: Principal = {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
      sessionId: financeSessionId,
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
    const entityRevision = v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: '2026-01-01',
      legalName: 'Lifecycle Entity',
      taxIdentifier: 'ESLIFECYCLE001',
      addressLine1: 'Configured address',
      locality: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Bind lifecycle fixture to canonical invoice authority',
      idempotencyKey: 'invoice-lifecycle:legal-entity-revision',
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: project.id,
      legalEntityRevisionId: entityRevision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind lifecycle fixture project to canonical invoice authority',
      idempotencyKey: 'invoice-lifecycle:legal-entity-assignment',
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

    const paymentsBeforeMalformedCommand = (
      sqlite.prepare('SELECT COUNT(*) count FROM payment WHERE invoice_id=?').get(original.id) as {
        count: number;
      }
    ).count;
    expect(() =>
      repository.recordPayment(finance, {
        invoiceId: original.id,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: '2026-09-01-not-an-instant',
        reference: 'Malformed legacy command must not write',
        idempotencyKey: 'invoice-lifecycle-malformed-payment',
      }),
    ).toThrow(/date|datetime/i);
    expect(
      sqlite.prepare('SELECT COUNT(*) count FROM payment WHERE invoice_id=?').get(original.id),
    ).toEqual({ count: paymentsBeforeMalformedCommand });

    const issuedAt = (
      sqlite.prepare('SELECT issued_at FROM invoice WHERE id=?').get(original.id) as {
        issued_at: string;
      }
    ).issued_at;
    expect(() =>
      repository.recordPayment(finance, {
        invoiceId: original.id,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: new Date(Date.parse(issuedAt) - 1).toISOString(),
        reference: 'Predates issuance',
        idempotencyKey: 'invoice-lifecycle-preissue-payment',
      }),
    ).toThrow(/precede.*issue/i);
    expect(() =>
      repository.recordPayment(finance, {
        invoiceId: original.id,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: new Date(Date.now() + 60_000).toISOString(),
        reference: 'Impossible future receipt',
        idempotencyKey: 'invoice-lifecycle-future-payment',
      }),
    ).toThrow(/future/i);
    expect(
      sqlite.prepare('SELECT COUNT(*) count FROM payment WHERE invoice_id=?').get(original.id),
    ).toEqual({ count: paymentsBeforeMalformedCommand });

    const canonicalPayment = repository.recordPayment(finance, {
      invoiceId: original.id,
      amountMinor: 100n,
      currency: 'USD',
      receivedAt: issuedAt,
      reference: 'Canonical instant',
      idempotencyKey: 'invoice-lifecycle-canonical-payment',
    });
    expect(canonicalPayment.created).toBe(true);
    expect(
      repository.recordPayment(finance, {
        invoiceId: original.id,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: issuedAt.replace('Z', '+00:00'),
        reference: 'Canonical instant',
        idempotencyKey: 'invoice-lifecycle-canonical-payment',
      }),
    ).toEqual({ id: canonicalPayment.id, created: false });
    expect(
      sqlite.prepare('SELECT received_at FROM payment WHERE id=?').get(canonicalPayment.id),
    ).toEqual({ received_at: new Date(Date.parse(issuedAt)).toISOString() });

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
      idempotencyKey: 'invoice-lifecycle-credit-001',
    });

    const adjustmentCounts = () => ({
      invoices: (
        sqlite
          .prepare("SELECT COUNT(*) count FROM invoice WHERE stream_type='adjustment'")
          .get() as { count: number }
      ).count,
      adjustments: (
        sqlite.prepare('SELECT COUNT(*) count FROM invoice_adjustment').get() as { count: number }
      ).count,
      sources: (
        sqlite
          .prepare("SELECT COUNT(*) count FROM invoice_source WHERE source_type='adjustment'")
          .get() as { count: number }
      ).count,
    });
    const beforeIndividualOvercredit = adjustmentCounts();
    expect(() =>
      repository.createInvoiceAdjustment(finance, {
        originalInvoiceId: original.id,
        adjustmentType: 'credit',
        amountMinor: 10_001n,
        reason: 'Individual credit exceeds original gross',
        idempotencyKey: 'invoice-lifecycle-overcredit-individual',
      }),
    ).toThrow(/credit.*exceed|exceed.*credit/i);
    expect(adjustmentCounts()).toEqual(beforeIndividualOvercredit);
    expect(
      repository.createInvoiceAdjustment(finance, {
        originalInvoiceId: original.id,
        adjustmentType: 'credit',
        amountMinor: 1_250n,
        reason: 'Approved commercial credit',
        idempotencyKey: 'invoice-lifecycle-credit-001',
      }),
    ).toEqual({ id: credit.id, adjustmentId: credit.adjustmentId, created: false });
    expect(() =>
      repository.createInvoiceAdjustment(finance, {
        originalInvoiceId: original.id,
        adjustmentType: 'credit',
        amountMinor: 1_251n,
        reason: 'Approved commercial credit',
        idempotencyKey: 'invoice-lifecycle-credit-001',
      }),
    ).toThrow(/already used for another command/i);
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
    const draftSourceAuthority = sqlite
      .prepare(
        `SELECT source_id,source_version,source_hash,allocated_net_minor,created_at,locked_at
           FROM invoice_source WHERE invoice_id=?`,
      )
      .get(credit.id) as {
      source_id: string;
      source_version: number;
      source_hash: string;
      allocated_net_minor: number;
      created_at: string;
      locked_at: string | null;
    };
    expect(draftSourceAuthority).toMatchObject({
      allocated_net_minor: -1_250,
      locked_at: null,
    });
    expect(draftSourceAuthority.source_hash).toMatch(/^[a-f0-9]{64}$/u);
    const adjustmentSnapshots = (
      sqlite
        .prepare(
          `SELECT snapshot_json FROM invoice_line
            WHERE invoice_id=? AND source_type='adjustment' AND source_id=? ORDER BY rowid`,
        )
        .all(credit.id, draftSourceAuthority.source_id) as Array<{ snapshot_json: string }>
    ).map((row) => row.snapshot_json);
    expect(draftSourceAuthority.source_hash).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({
            sourceType: 'adjustment',
            sourceId: draftSourceAuthority.source_id,
            sourceVersion: draftSourceAuthority.source_version,
            snapshots: adjustmentSnapshots,
          }),
        )
        .digest('hex'),
    );
    expect(draftSourceAuthority.created_at).toBeTruthy();
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
        `SELECT source_link_id,source_version,source_hash,allocated_net_minor,created_at,locked_at
           FROM invoice_source WHERE invoice_id=?`,
      )
      .get(credit.id) as {
      source_link_id: string;
      source_version: number;
      source_hash: string;
      allocated_net_minor: number;
      created_at: string;
      locked_at: string;
    };
    expect(lockedSource.locked_at).toBeTruthy();
    expect(lockedSource).toMatchObject({
      source_hash: draftSourceAuthority.source_hash,
      allocated_net_minor: draftSourceAuthority.allocated_net_minor,
      created_at: draftSourceAuthority.created_at,
    });
    expect(
      sqlite
        .prepare(
          `SELECT source_hash,locked_at FROM invoice_commercial_source_manifest
            WHERE invoice_id=? AND source_type='adjustment'`,
        )
        .get(credit.id),
    ).toEqual({
      source_hash: draftSourceAuthority.source_hash,
      locked_at: lockedSource.locked_at,
    });
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

    const beforeCumulativeOvercredit = adjustmentCounts();
    expect(() =>
      repository.createInvoiceAdjustment(finance, {
        originalInvoiceId: original.id,
        adjustmentType: 'credit',
        amountMinor: 8_751n,
        reason: 'Cumulative credit exceeds original gross',
        idempotencyKey: 'invoice-lifecycle-overcredit-cumulative',
      }),
    ).toThrow(/credit.*exceed|exceed.*credit/i);
    expect(adjustmentCounts()).toEqual(beforeCumulativeOvercredit);

    const remainderCredit = repository.createInvoiceAdjustment(finance, {
      originalInvoiceId: original.id,
      adjustmentType: 'credit',
      amountMinor: 8_750n,
      reason: 'Credit exactly the remaining gross',
      idempotencyKey: 'invoice-lifecycle-credit-remainder',
    });
    expect(
      sqlite
        .prepare('SELECT subtotal_minor,total_minor FROM invoice WHERE id=?')
        .get(remainderCredit.id),
    ).toEqual({ subtotal_minor: -8_750, total_minor: -8_750 });
    const credited = (
      sqlite
        .prepare(
          `SELECT CAST(COALESCE(SUM(-i.total_minor),0) AS TEXT) amount
             FROM invoice_adjustment ia
             JOIN invoice i ON i.id=ia.adjustment_invoice_id
            WHERE ia.original_invoice_id=? AND i.total_minor<0 AND i.state!='void'`,
        )
        .get(original.id) as { amount: string }
    ).amount;
    expect(credited).toBe('10000');
    expect(BigInt(10_000) - BigInt(credited)).toBe(0n);
    sqlite.close();
  });
});
