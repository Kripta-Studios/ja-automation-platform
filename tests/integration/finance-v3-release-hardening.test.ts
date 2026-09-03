import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3ConflictError, V3Repository, createDatabase } from '@ja/database';
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
  role: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@release-hardening.test`,
      role,
      'active',
      1,
      now,
      now,
    );
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-finance-v3-release-'));
  directories.push(directory);
  const databasePath = join(directory, 'app.db');
  const { sqlite } = createDatabase(databasePath);
  databases.push(sqlite);
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['finance', 'finance_admin'],
    ['manager', 'project_manager'],
    ['worker', 'worker'],
  ] as const)
    seedUser(sqlite, id, role);
  const now = new Date().toISOString();
  const sessionId = `release-hardening-step-up-${crypto.randomUUID()}`;
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
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const finance: Principal = {
    userId: 'finance',
    role: 'finance_admin',
    projectIds: new Set(),
    sessionId,
  };
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  const client = repository.createClient(owner, {
    legalName: 'Release hardening client',
    displayName: 'Release hardening client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Exact Money Way',
    billingEmail: 'billing@release-hardening.test',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Release hardening project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: 'manager',
    startsOn: '2026-08-01',
    canReview: true,
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: 'worker',
    startsOn: '2026-08-01',
  });
  const legalEntity = repository.createLegalEntity(owner, {
    code: `REL-${crypto.randomUUID().slice(0, 8)}`,
    legalName: 'Release hardening entity',
    currency: 'USD',
    billingAddress: '1 Exact Money Way',
    companyIdentifiers: 'ES-RELEASE-HARDENING',
  });
  const revision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: legalEntity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Release hardening entity',
    taxIdentifier: `ES${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`,
    addressLine1: '1 Exact Money Way',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Release hardening fixture authority',
    idempotencyKey: `release-hardening:entity:${legalEntity.id}`,
  });
  v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-08-15',
    reason: 'Release hardening fixture project authority',
    idempotencyKey: `release-hardening:assignment:${project.id}`,
  });
  const tax = repository.createTaxProfile(finance, {
    legalEntityId: legalEntity.id,
    name: 'Release hardening zero tax',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const billingRule = repository.createBillingRule(finance, {
    projectId: project.id,
    legalEntityId: legalEntity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: tax.id,
    currency: 'USD',
    effectiveFrom: '2026-01-01',
  });
  return {
    databasePath,
    sqlite,
    repository,
    v3,
    owner,
    finance,
    manager: repository.principalFor('manager'),
    worker: repository.principalFor('worker'),
    project,
    legalEntity,
    legalEntityRevisionId: revision.revisionId,
    billingRuleId: billingRule.id,
  };
}

function seedIssuedInvoice(
  value: ReturnType<typeof fixture>,
  totalMinor: bigint,
  id = `invoice-${crypto.randomUUID()}`,
): string {
  const issuedAt = '2026-08-20T12:00:00.000Z';
  const deployment = value.sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string };
  const snapshotJson = JSON.stringify({
    schema_version: 'invoice-snapshot-v1',
    legalEntity: { id: value.legalEntity.id, revisionId: value.legalEntityRevisionId },
    calculation: {
      currency: 'USD',
      subtotalMinor: totalMinor.toString(),
      taxMinor: '0',
      totalMinor: totalMinor.toString(),
    },
    generatedAt: issuedAt,
  });
  value.sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,
         subtotal_minor,tax_minor,total_minor,period_start,period_end,issued_at,due_at,
         snapshot_json,calculation_hash,source_lock_at,tenant_id,deployment_id,
         legal_entity_revision_id,created_at,updated_at,version
       ) VALUES(?,?,?,?,'labor','issued','USD',?,0,?,'2026-08-01','2026-08-31',?,
                '2026-09-20T12:00:00.000Z',?,?,?,?,?,?,?, ?,1)`,
    )
    .run(
      id,
      value.project.id,
      value.billingRuleId,
      `REL-${crypto.randomUUID().slice(0, 8)}`,
      totalMinor,
      totalMinor,
      issuedAt,
      snapshotJson,
      createHash('sha256').update(snapshotJson).digest('hex'),
      issuedAt,
      deployment.tenant_id,
      deployment.deployment_id,
      value.legalEntityRevisionId,
      issuedAt,
      issuedAt,
    );
  return id;
}

function seedIssuedInvoiceWithTime(
  value: ReturnType<typeof fixture>,
  totalMinor: bigint,
  timeId: string,
  id = `invoice-${crypto.randomUUID()}`,
): string {
  const issuedAt = '2026-08-20T12:00:00.000Z';
  const deployment = value.sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string };
  const snapshotJson = JSON.stringify({
    schema_version: 'invoice-snapshot-v1',
    legalEntity: { id: value.legalEntity.id, revisionId: value.legalEntityRevisionId },
    calculation: {
      currency: 'USD',
      subtotalMinor: totalMinor.toString(),
      taxMinor: '0',
      totalMinor: totalMinor.toString(),
    },
    generatedAt: issuedAt,
  });
  value.sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,
         subtotal_minor,tax_minor,total_minor,period_start,period_end,issued_at,due_at,
         snapshot_json,calculation_hash,source_lock_at,tenant_id,deployment_id,
         legal_entity_revision_id,created_at,updated_at,version
       ) VALUES(?,?,?,?,'labor','draft','USD',?,0,?,'2026-08-01','2026-08-31',NULL,
                NULL,NULL,NULL,NULL,NULL,NULL,NULL,?, ?,1)`,
    )
    .run(
      id,
      value.project.id,
      value.billingRuleId,
      `REL-${crypto.randomUUID().slice(0, 8)}`,
      totalMinor,
      totalMinor,
      issuedAt,
      issuedAt,
    );
  value.sqlite
    .prepare(
      `INSERT INTO invoice_line(
         id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,
         subtotal_minor,source_type,source_id,snapshot_json,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `payment-trigger-line-${id}`,
      id,
      'Labor',
      1,
      1,
      totalMinor,
      totalMinor,
      'time',
      timeId,
      '{}',
      issuedAt,
    );
  value.sqlite
    .prepare(
      `INSERT INTO invoice_source(
         source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,locked_at,
         allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `payment-trigger-source-${id}`,
      id,
      `payment-trigger-line-${id}`,
      'time',
      timeId,
      1,
      issuedAt,
      totalMinor,
      0n,
      totalMinor,
      issuedAt,
    );
  value.sqlite
    .prepare(
      `UPDATE invoice SET state='issued',issued_at=?,due_at=?,snapshot_json=?,calculation_hash=?,
         source_lock_at=?,tenant_id=?,deployment_id=?,legal_entity_revision_id=? WHERE id=? AND state='draft'`,
    )
    .run(
      issuedAt,
      '2026-09-20T12:00:00.000Z',
      snapshotJson,
      createHash('sha256').update(snapshotJson).digest('hex'),
      issuedAt,
      deployment.tenant_id,
      deployment.deployment_id,
      value.legalEntityRevisionId,
      id,
    );
  return id;
}

function approveTime(value: ReturnType<typeof fixture>, workDate: string, summary: string) {
  const row = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate,
    category: 'regular',
    minutes: 60,
    summary,
  });
  value.repository.submitTime(value.worker, row.id, row.version);
  value.repository.operationalApproveTime(value.manager, row.id, 'approved');
  value.repository.financeApproveTime(value.finance, row.id, true);
  return row;
}

describe('V3 finance release hardening', () => {
  it('reads signed 64-bit invoice and payment money exactly beyond the JS safe integer', () => {
    const value = fixture();
    const exact = 9_007_199_254_740_993n;
    const invoiceId = seedIssuedInvoice(value, exact);
    const deployment = value.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string };
    value.sqlite
      .prepare(
        `INSERT INTO payment(
           id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key,
           tenant_id,deployment_id,legal_entity_revision_id,external_reference,
           prior_payment_hash,payment_payload_hash,actor_id,command_id,payment_hash
         ) VALUES('exact-payment',?,?,'USD','2026-08-21T00:00:00.000Z','EXACT',
                  '2026-08-21T00:00:00.000Z','exact-payment-idempotency',?,?,?,'EXACT',
                  NULL,'payload-hash','finance','legacy-exact-command','payment-hash')`,
      )
      .run(
        invoiceId,
        exact,
        deployment.tenant_id,
        deployment.deployment_id,
        value.legalEntityRevisionId,
      );

    expect(value.v3.masterLedger(value.finance, { projectId: value.project.id })[0]).toMatchObject({
      totalMinor: exact.toString(),
      grossPaymentsMinor: exact.toString(),
      netCollectedMinor: exact.toString(),
      outstandingMinor: '0',
    });
  });

  it('rejects reversal of a payment whose tenant provenance does not match its invoice', () => {
    const value = fixture();
    const invoiceId = seedIssuedInvoice(value, 10_000n);
    value.sqlite
      .prepare(
        `INSERT INTO payment(
           id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key,
           tenant_id,deployment_id,legal_entity_revision_id,external_reference,
           prior_payment_hash,payment_payload_hash,actor_id,command_id,payment_hash
         ) SELECT 'cross-tenant-payment',?,1000,'USD','2026-08-21T00:00:00.000Z','BAD',
                  '2026-08-21T00:00:00.000Z','cross-tenant-payment-key',
                  'other-tenant',deployment_id,?,'BAD',NULL,'payload-hash','finance',
                  'cross-tenant-command','payment-hash'
             FROM deployment_identity WHERE singleton=1`,
      )
      .run(invoiceId, value.legalEntityRevisionId);

    expect(() =>
      value.v3.reversePayment(value.finance, {
        paymentId: 'cross-tenant-payment',
        amountMinor: 100n,
        effectiveAt: '2026-08-22T00:00:00.000Z',
        reasonCode: 'bank_return',
        reason: 'Cross-tenant payment must never be reversible against this invoice',
        idempotencyKey: 'cross-tenant-reversal-key',
      }),
    ).toThrow(V3ConflictError);
  });

  it('does not unlock payment-triggered compensation from legacy payment rows without provenance', () => {
    const value = fixture();
    const time = approveTime(value, '2026-08-10', 'Payment trigger provenance');
    const rule = value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: value.project.id,
      currency: 'USD',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 5_000,
      percentageBasis: 'COLLECTED_ELIGIBLE_LABOR',
      settlementTrigger: 'ON_CLIENT_PAYMENT',
      effectiveFrom: '2026-08-01',
    });
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-08-01',
    });
    const invoiceId = seedIssuedInvoiceWithTime(value, 10_000n, time.id);
    value.sqlite
      .prepare(
        `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at)
         VALUES('legacy-payment',?,10000,'USD','2026-08-21T00:00:00.000Z','LEGACY',
                '2026-08-21T00:00:00.000Z')`,
      )
      .run(invoiceId);

    expect(() =>
      value.v3.settleCompensation(value.finance, {
        workerId: 'worker',
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(/No approved time is available to settle/i);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM compensation_settlement WHERE compensation_rule_id=?')
        .get(rule.id),
    ).toEqual({ count: 0 });
  });

  it('segments labor costs and compensation by the legal entity effective on each work date', () => {
    const value = fixture();
    const secondEntity = value.repository.createLegalEntity(value.owner, {
      code: `REL2-${crypto.randomUUID().slice(0, 8)}`,
      legalName: 'Release hardening second entity',
      currency: 'USD',
      billingAddress: '2 Exact Money Way',
      companyIdentifiers: 'ES-RELEASE-HARDENING-2',
    });
    const secondRevision = value.v3.createCanonicalLegalEntityRevision(value.finance, {
      legacyLegalEntityId: secondEntity.id,
      effectiveFrom: '2026-08-16',
      legalName: 'Release hardening second entity',
      taxIdentifier: `ES${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`,
      addressLine1: '2 Exact Money Way',
      locality: 'Madrid',
      postalCode: '28002',
      countryCode: 'ES',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Second authority for effective-date segmentation',
      idempotencyKey: `release-hardening:entity:${secondEntity.id}`,
    });
    value.v3.assignCanonicalLegalEntityToProject(value.finance, {
      projectId: value.project.id,
      legalEntityRevisionId: secondRevision.revisionId,
      effectiveFrom: '2026-08-16',
      reason: 'Project changes legal entity during the accounting period',
      idempotencyKey: `release-hardening:assignment:${secondEntity.id}`,
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: value.project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 4_000n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createInternalCostRule(value.finance, {
      workerId: 'worker',
      projectId: value.project.id,
      currency: 'USD',
      hourlyRateMinor: 5_000n,
      effectiveFrom: '2026-08-01',
    });
    const first = approveTime(value, '2026-08-10', 'First entity labor');
    const second = approveTime(value, '2026-08-20', 'Second entity labor');

    const pack = value.v3.createAccountingPack(value.finance, '2026-08-01', '2026-08-31');
    const snapshot = pack.snapshot as {
      workerCosts: Array<Record<string, unknown>>;
      workerCostSegments: Array<Record<string, unknown>>;
      sourceItems: Array<Record<string, unknown>>;
      totalsByCurrency: Array<Record<string, unknown>>;
    };
    expect(snapshot.workerCostSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legalEntityId: value.legalEntity.id,
          sourceTimeIds: [first.id],
          approvedCompensationMinor: '4000',
          internalLoadedLaborCostMinor: '5000',
        }),
        expect.objectContaining({
          legalEntityId: secondEntity.id,
          sourceTimeIds: [second.id],
          approvedCompensationMinor: '4000',
          internalLoadedLaborCostMinor: '5000',
        }),
      ]),
    );
    expect(
      snapshot.workerCostSegments.map((row) => ({
        sourceTimeIds: row.sourceTimeIds,
        legalEntityId: row.legalEntityId,
      })),
    ).toEqual(
      expect.arrayContaining([
        { sourceTimeIds: [first.id], legalEntityId: value.legalEntity.id },
        { sourceTimeIds: [second.id], legalEntityId: secondEntity.id },
      ]),
    );
  });

  it('settles from one coherent snapshot while a second connection changes the active rate', async () => {
    const value = fixture();
    const rule = value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: value.project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 100n,
      effectiveFrom: '2026-08-01',
    });
    const seed = approveTime(value, '2026-08-10', 'Concurrent settlement seed');
    const source = value.sqlite.prepare(
      `INSERT INTO time_entry(
         id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
         created_at,updated_at,version,activity_summary
       ) SELECT ?,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
                created_at,updated_at,version,activity_summary FROM time_entry WHERE id=?`,
    );
    for (let index = 0; index < 1_200; index += 1)
      source.run(`concurrent-time-${String(index).padStart(4, '0')}`, seed.id);

    const coordination = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
    const state = new Int32Array(coordination);
    const worker = new Worker(
      `const { workerData } = require('node:worker_threads');
       const { DatabaseSync } = require('node:sqlite');
       const state = new Int32Array(workerData.coordination);
       const db = new DatabaseSync(workerData.databasePath);
       db.exec('PRAGMA busy_timeout=5000');
       const update = db.prepare('UPDATE compensation_rule SET rate_minor=?,version=version+1 WHERE id=?');
       Atomics.store(state, 1, 1);
       Atomics.notify(state, 1);
       let rate = 100;
       while (Atomics.load(state, 0) === 0) {
         rate = rate === 100 ? 200 : 100;
         try {
           update.run(rate, workerData.ruleId);
           const updates = Atomics.add(state, 2, 1) + 1;
           // Give the settlement connection a scheduling window to acquire
           // its immediate transaction between real second-connection writes.
           Atomics.wait(state, 2, updates, 2);
         } catch {}
       }
       db.close();`,
      {
        eval: true,
        workerData: { databasePath: value.databasePath, ruleId: rule.id, coordination },
      },
    );
    while (Atomics.load(state, 1) === 0) Atomics.wait(state, 1, 0, 100);

    let settlement: ReturnType<typeof value.v3.settleCompensation>;
    try {
      settlement = value.v3.settleCompensation(value.finance, {
        workerId: 'worker',
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      });
    } finally {
      Atomics.store(state, 0, 1);
      await worker.terminate();
    }
    expect(Atomics.load(state, 2)).toBeGreaterThan(0);
    const amount = settlement![0]?.amountMinor;
    expect(['120100', '240200']).toContain(amount);
  });
});
