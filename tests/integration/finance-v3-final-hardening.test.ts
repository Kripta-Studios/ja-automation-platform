import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, V3ValidationError, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const restoreDeploymentIdentities: Array<() => void> = [];

beforeEach(() => restoreDeploymentIdentities.push(installB5TestDeploymentIdentity()));

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: 'owner_admin' | 'finance_admin' | 'worker',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@finance-hardening.test`,
      role,
      'active',
      1,
      now,
      now,
    );
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-finance-v3-final-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  seedUser(sqlite, 'worker', 'worker');
  const now = new Date().toISOString();
  const sessionId = 'finance-v3-final-step-up';
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      'finance',
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  const finance: Principal = {
    userId: 'finance',
    role: 'finance_admin',
    projectIds: new Set(),
    sessionId,
  };
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const repository = new PortalRepository(sqlite);
  const client = repository.createClient(owner, {
    legalName: 'Final Finance Client',
    displayName: 'Final Finance Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Final Finance Way',
    billingEmail: 'billing@finance-hardening.test',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Final Finance Project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
  });
  const v3 = new V3Repository(sqlite);
  const legalEntity = repository.createLegalEntity(owner, {
    code: 'FINAL-FINANCE',
    legalName: 'Final Finance Entity',
    currency: 'USD',
    billingAddress: 'Final Finance billing address',
    companyIdentifiers: 'Final Finance identifiers',
  });
  const legalEntityRevision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: legalEntity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Final Finance Entity',
    taxIdentifier: 'ESFINALFINANCE001',
    addressLine1: 'Final Finance billing address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Bind final finance fixture to canonical invoice authority',
    idempotencyKey: 'final-finance:legal-entity-revision',
  });
  v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: project.id,
    legalEntityRevisionId: legalEntityRevision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind final finance fixture project to canonical invoice authority',
    idempotencyKey: 'final-finance:legal-entity-assignment',
  });
  const taxProfile = repository.createTaxProfile(finance, {
    legalEntityId: legalEntity.id,
    name: 'No tax',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const billingRule = repository.createBillingRule(finance, {
    projectId: project.id,
    legalEntityId: legalEntity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: taxProfile.id,
    currency: 'USD',
    effectiveFrom: '2026-01-01',
  });
  return {
    sqlite,
    repository,
    v3,
    owner,
    finance,
    project,
    legalEntity,
    legalEntityRevisionId: legalEntityRevision.revisionId,
    billingRuleId: billingRule.id,
  };
}

function seedIssuedInvoice(
  value: ReturnType<typeof fixture>,
  issuedAt = '2026-08-20T12:00:00.000Z',
): string {
  const id = `invoice-${crypto.randomUUID()}`;
  const deployment = value.sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity LIMIT 1')
    .get() as { tenant_id: string; deployment_id: string };
  const snapshot = {
    schema_version: 'invoice-snapshot-v1',
    legalEntity: {
      id: value.legalEntity.id,
      revisionId: value.legalEntityRevisionId,
    },
    servicePeriod: { start: '2026-08-01', end: '2026-08-31' },
    calculation: {
      currency: 'USD',
      subtotalMinor: '10000',
      taxMinor: '0',
      totalMinor: '10000',
    },
    generatedAt: issuedAt,
  };
  const snapshotJson = JSON.stringify(snapshot);
  const calculationHash = createHash('sha256').update(snapshotJson).digest('hex');
  const dueAt = new Date(Date.parse(issuedAt) + 30 * 86_400_000).toISOString();
  value.sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,
         subtotal_minor,tax_minor,total_minor,period_start,period_end,issued_at,due_at,
         snapshot_json,calculation_hash,source_lock_at,tenant_id,deployment_id,
         legal_entity_revision_id,created_at,updated_at,version
       ) VALUES(?,?,?,'FIN-0001','labor','issued','USD',10000,0,10000,?,?,?, ?,
                ?,?,?, ?,?,?,?, ?,1)`,
    )
    .run(
      id,
      value.project.id,
      value.billingRuleId,
      '2026-08-01',
      '2026-08-31',
      issuedAt,
      dueAt,
      snapshotJson,
      calculationHash,
      issuedAt,
      deployment.tenant_id,
      deployment.deployment_id,
      value.legalEntityRevisionId,
      issuedAt,
      issuedAt,
    );
  return id;
}

describe('V3 final finance hardening', () => {
  it('normalizes payment timestamps and rejects dates before issue or in the future', () => {
    const value = fixture();
    const invoiceId = seedIssuedInvoice(value);

    expect(() =>
      value.v3.recordPayment(value.finance, {
        invoiceId,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: '2026-08-20T11:59:59.999Z',
        idempotencyKey: 'payment-before-issue',
      }),
    ).toThrow(/before.*issued/i);
    expect(() =>
      value.v3.recordPayment(value.finance, {
        invoiceId,
        amountMinor: 100n,
        currency: 'USD',
        receivedAt: '2999-01-01T00:00:00.000Z',
        idempotencyKey: 'payment-in-the-future',
      }),
    ).toThrow(/future/i);

    const payment = value.v3.recordPayment(value.finance, {
      invoiceId,
      amountMinor: 100n,
      currency: 'USD',
      receivedAt: '2026-08-20T12:00:01Z',
      idempotencyKey: 'payment-normalized-time',
    });
    expect(
      value.sqlite.prepare('SELECT received_at FROM payment WHERE id=?').get(payment.id),
    ).toEqual({ received_at: '2026-08-20T12:00:01.000Z' });
  });

  it('normalizes payment reversal timestamps and rejects dates before payment or in the future', () => {
    const value = fixture();
    const invoiceId = seedIssuedInvoice(value);
    const payment = value.v3.recordPayment(value.finance, {
      invoiceId,
      amountMinor: 100n,
      currency: 'USD',
      receivedAt: '2026-08-20T12:00:01.000Z',
      idempotencyKey: 'reversal-date-source-payment',
    });

    expect(() =>
      value.v3.reversePayment(value.finance, {
        paymentId: payment.id,
        amountMinor: 10n,
        effectiveAt: '2026-08-20T12:00:00.999Z',
        reasonCode: 'correction',
        reason: 'Cannot reverse before collection',
        idempotencyKey: 'reversal-before-payment',
      }),
    ).toThrow(/predate.*payment/i);
    expect(() =>
      value.v3.reversePayment(value.finance, {
        paymentId: payment.id,
        amountMinor: 10n,
        effectiveAt: '2999-01-01T00:00:00.000Z',
        reasonCode: 'correction',
        reason: 'Cannot book future history',
        idempotencyKey: 'reversal-in-the-future',
      }),
    ).toThrow(/future/i);

    const reversal = value.v3.reversePayment(value.finance, {
      paymentId: payment.id,
      amountMinor: 10n,
      effectiveAt: '2026-08-20T12:00:02Z',
      reasonCode: 'correction',
      reason: 'Canonical timestamp proof',
      idempotencyKey: 'reversal-normalized-time',
    });
    expect(
      value.sqlite
        .prepare('SELECT effective_at FROM invoice_payment_reversal_event WHERE id=?')
        .get(reversal.id),
    ).toEqual({ effective_at: '2026-08-20T12:00:02.000Z' });
  });

  it('rejects zero-byte Accounting Pack exports', () => {
    const value = fixture();
    const pack = value.v3.createAccountingPack(value.finance, '2120-01-01', '2120-01-31');
    expect(() =>
      value.v3.recordAccountingPackExport(
        value.finance,
        pack.id,
        'expense_csv',
        'exports/empty.csv',
        'a'.repeat(64),
        0,
      ),
    ).toThrow(V3ValidationError);
  });
});
