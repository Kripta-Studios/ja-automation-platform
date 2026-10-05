import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountingPackRevisionService,
  createDatabase,
  PortalRepository,
  V3Repository,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import type {
  AccountingPackSourceItemInput,
  AccountingPackSnapshotInput,
} from '../../packages/database/src/domains/accounting-pack/accounting-pack-revision-service.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

type CutSource = AccountingPackSourceItemInput & {
  itemKind: string;
  sourceId: string;
  effectiveAt: string;
};
type CutSnapshot = {
  periodStart: string;
  periodEnd: string;
  totals: Record<string, string | null>;
  invoiceRegister: Array<{ invoiceId: string }>;
  collections: unknown[];
  workerCosts: unknown[];
  expenseRegister: unknown[];
  totalsByCurrency: unknown[];
  sourceItems: CutSource[];
};

const cleanups: Array<() => void> = [];
beforeEach(() => {
  cleanups.push(installB5TestDeploymentIdentity());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function fixture(workDate = '2026-08-03') {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-cut-boundaries-'));
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  cleanups.push(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const repository = new PortalRepository(sqlite),
    v3 = new V3Repository(sqlite);
  const now = new Date().toISOString();
  const actors = new Map<string, Principal>();
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['worker', 'worker'],
  ] as const) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        id,
        id === 'owner' ? 'antonny.luty@j-aautomation.com' : 'worker@example.test',
        role,
        'active',
        1,
        now,
        now,
      );
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(`${id}-session`, `${id}-token`, id, '2027-01-01T00:00:00.000Z', now, now, now);
    actors.set(id, { userId: id, role, projectIds: new Set(), sessionId: `${id}-session` });
  }
  const owner = actors.get('owner')!,
    worker = actors.get('worker')!;
  const client = repository.createClient(owner, {
    legalName: 'Cut Test Client',
    displayName: 'Cut Test Client',
    currency: 'USD',
    timezone: 'UTC',
    billingEmail: 'cut@example.test',
    billingAddress: 'Synthetic test address',
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    costCenterCode: 'QA-ACCOUNTING-CUT-BOUNDARIES-1',
    name: 'Cut Test Project',
    currency: 'USD',
    timezone: 'UTC',
    billingModel: 'tm',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: worker.userId,
    startsOn: '2026-01-01',
  });
  const scopedWorker = { ...worker, projectIds: new Set([project.id]) };
  v3.createClientLaborRate(owner, {
    projectId: project.id,
    workerId: worker.userId,
    currency: 'USD',
    hourlyRateMinor: 10_000n,
    effectiveFrom: '2026-01-01',
  });
  v3.createInternalCostRule(owner, {
    projectId: project.id,
    workerId: worker.userId,
    currency: 'USD',
    hourlyRateMinor: 4_000n,
    effectiveFrom: '2026-01-01',
  });
  v3.createCompensationRule(owner, {
    projectId: project.id,
    workerId: worker.userId,
    currency: 'USD',
    ruleType: 'Hourly',
    rateMinor: 3_000n,
    rateBasis: 'hourly',
    effectiveFrom: '2026-01-01',
  });
  const entity = repository.createLegalEntity(owner, {
    code: 'CUT',
    legalName: 'Cut Test Entity',
    currency: 'USD',
    billingAddress: 'Synthetic test address',
    companyIdentifiers: 'CUT-TEST-TAX',
  });
  const revision = v3.createCanonicalLegalEntityRevision(owner, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Cut Test Entity',
    taxIdentifier: 'CUT-TEST-TAX',
    addressLine1: 'Synthetic test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Synthetic cut boundary authority',
    idempotencyKey: 'cut-test:entity',
  });
  v3.assignCanonicalLegalEntityToProject(owner, {
    projectId: project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Synthetic cut boundary assignment',
    idempotencyKey: 'cut-test:assignment',
  });
  repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'CUT',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
  });
  const rule = repository.createBillingRule(owner, {
    projectId: project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'manual',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
  });
  const time = repository.createTimeEntry(scopedWorker, {
    projectId: project.id,
    workDate,
    category: 'regular',
    minutes: 60,
    summary: 'Synthetic cut boundary source',
  });
  repository.submitTime(scopedWorker, time.id, time.version);
  repository.operationalApproveTime(owner, time.id, 'approved');
  repository.financeApproveTime(owner, time.id, true);
  const invoice = repository.createInvoiceDraft(owner, rule.id, workDate, workDate);
  repository.approveInvoiceDraft(owner, invoice.id);
  repository.issueInvoice(owner, invoice.id, 'en');
  return { sqlite, repository, v3, owner, entity, project, time, invoice };
}

function canonicalInput(
  f: ReturnType<typeof fixture>,
  pack: ReturnType<V3Repository['createAccountingPack']>,
): AccountingPackSnapshotInput {
  const s = pack.snapshot as CutSnapshot,
    t = s.totals;
  return {
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    currency: 'USD',
    timezone: 'UTC',
    legacyLegalEntityId: f.entity.id,
    sourceItems: s.sourceItems,
    invoiceRegister: s.invoiceRegister,
    collections: s.collections,
    workerCosts: s.workerCosts,
    expenseRegister: s.expenseRegister,
    totalsByCurrency: s.totalsByCurrency,
    invoiceCount: s.invoiceRegister.length,
    paymentCount: s.collections.length,
    workerCostCount: s.workerCosts.length,
    expenseCount: s.expenseRegister.length,
    sourceItemCount: s.sourceItems.length,
    invoiceSourceCount: s.sourceItems.filter((i) => i.itemKind === 'invoice_source').length,
    sourceMismatchCount: 0,
    approvedTimeEntryCount: s.sourceItems.filter((i) => i.itemKind === 'time').length,
    approvedExpenseCount: 0,
    netMinor: t.totalInvoicedMinor ?? '0',
    taxMinor: t.taxInvoicedMinor ?? '0',
    grossMinor: t.grossInvoicedMinor ?? '0',
    collectedMinor: t.collectedMinor ?? '0',
    outstandingMinor: t.outstandingMinor ?? '0',
    workerCostMinor: t.internalLaborCostMinor ?? '0',
    expenseCostMinor: '0',
    directCostMinor: t.directCostMinor ?? '0',
    contributionMinor: t.contributionMinor ?? '0',
    createdAt: new Date().toISOString(),
    effectiveAt: new Date().toISOString(),
    idempotencyKey: 'cut-test:negative-input',
  };
}

describe('Accounting Pack issue-date cut and frozen operational provenance', () => {
  it('includes August invoice children in October without moving August time or cost facts', () => {
    const f = fixture();
    const august = f.v3.createAccountingPack(f.owner, '2026-08-01', '2026-08-31')
      .snapshot as CutSnapshot;
    expect(august.invoiceRegister).toHaveLength(0);
    expect(august.totals.internalLaborCostMinor).toBe('4000');
    const october = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05')
      .snapshot as CutSnapshot;
    expect(october.invoiceRegister.map((i) => i.invoiceId)).toEqual([f.invoice.id]);
    expect(october.totals).toMatchObject({
      totalInvoicedMinor: '10000',
      internalLaborCostMinor: '0',
      directCostMinor: '0',
      contributionMinor: '10000',
    });
    expect(
      october.sourceItems.filter((i) => ['time', 'direct_cost'].includes(i.itemKind)),
    ).toHaveLength(0);
    const children = october.sourceItems.filter((i) =>
      ['invoice_source', 'commercial_manifest'].includes(i.itemKind),
    );
    expect(children).toHaveLength(2);
    for (const child of children) expect(child.effectiveAt.slice(0, 10)).toBe('2026-08-03');
    expect(f.sqlite.prepare('SELECT work_date FROM time_entry WHERE id=?').get(f.time.id)).toEqual({
      work_date: '2026-08-03',
    });
  });

  it('excludes a void as of the current cut while retaining it in an earlier historical cut and ledger', () => {
    const f = fixture();
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
    f.v3.voidInvoice(
      f.owner,
      f.invoice.id,
      'Synthetic cancellation after historical cut',
      'cut-test:void',
    );
    const earlier = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-06')
      .snapshot as CutSnapshot;
    expect(earlier.invoiceRegister.map((i) => i.invoiceId)).toEqual([f.invoice.id]);
    const current = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-10')
      .snapshot as CutSnapshot;
    expect(current.invoiceRegister).toHaveLength(0);
    expect(
      current.sourceItems.filter((i) =>
        ['invoice', 'invoice_source', 'commercial_manifest'].includes(i.itemKind),
      ),
    ).toHaveLength(0);
    // With no surviving financial scope, the consolidated amount is absent.
    expect(current.totalsByCurrency).toEqual([]);
    expect(current.totals.totalInvoicedMinor).toBeNull();
    expect(f.v3.masterLedger(f.owner, { start: '2026-10-01', end: '2026-10-10' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: f.invoice.id, billingStatus: 'void' }),
      ]),
    );
    expect(
      f.sqlite.prepare('SELECT state,total_minor FROM invoice WHERE id=?').get(f.invoice.id),
    ).toEqual({ state: 'void', total_minor: 10000 });
  });

  it('rejects frozen children after the cut end even with an issued parent in the pack', () => {
    const f = fixture('2026-11-03');
    expect(() => f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05')).toThrow(
      /effective_date_outside_period/,
    );
  });

  it.each([
    [
      'forged operational date',
      (i: CutSource) => ({ ...i, effectiveAt: '2026-08-04T00:00:00.000Z' }),
      /effective_at_mismatch/,
    ],
    [
      'wrong parent',
      (i: CutSource) => ({ ...i, sourceId: `foreign-parent:time:${i.sourceId.split(':').at(-1)}` }),
      /parent_invoice_not_in_pack|missing_authoritative_row/,
    ],
    ['forged amount', (i: CutSource) => ({ ...i, amountMinor: '10001' }), /amount_mismatch/],
    [
      'forged membership',
      (i: CutSource) => ({
        ...i,
        sourceId: `${i.sourceId.slice(0, i.sourceId.lastIndexOf(':'))}:foreign-source`,
      }),
      /missing_authoritative_row|omitted_from_source_cut/,
    ],
  ] as const)(
    'rejects %s while admitting legitimate older child evidence',
    (_name, change, error) => {
      const f = fixture(),
        pack = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05');
      const input = canonicalInput(f, pack);
      const sourceItems = input.sourceItems!.map((i) =>
        i.itemKind === 'invoice_source' ? change(i as CutSource) : i,
      );
      expect(() =>
        new AccountingPackRevisionService(f.sqlite).createCanonicalRevision(f.owner, {
          ...input,
          sourceItems,
        }),
      ).toThrow(error);
    },
  );

  it('requires every frozen child and rejects old operational cost facts injected into October', () => {
    const f = fixture(),
      october = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05');
    const input = canonicalInput(f, october),
      service = new AccountingPackRevisionService(f.sqlite);
    const missing = input.sourceItems!.filter((i) => i.itemKind !== 'commercial_manifest');
    expect(() =>
      service.createCanonicalRevision(f.owner, {
        ...input,
        sourceItems: missing,
        sourceItemCount: missing.length,
      }),
    ).toThrow(/omitted_from_source_cut/);
    const august = f.v3.createAccountingPack(f.owner, '2026-08-01', '2026-08-31')
      .snapshot as CutSnapshot;
    const oldTime = august.sourceItems.find((i) => i.itemKind === 'time');
    expect(oldTime).toBeTruthy();
    if (!oldTime) throw new Error('The August pack must retain its operational time source');
    expect(() =>
      service.createCanonicalRevision(f.owner, {
        ...input,
        sourceItems: [...input.sourceItems!, oldTime],
        sourceItemCount: input.sourceItems!.length + 1,
      }),
    ).toThrow(/effective_date_outside_period/);
  });
});
