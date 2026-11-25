import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  invoiceNumberingDirectories,
  setupInvoiceNumbering,
} from '../fixtures/invoice-numbering-fixture';

// Corrected invoices (migration 0092): new accounting packs and reports read the CURRENT
// version; packs made earlier keep what they contained; search finds every version number.
const restores: (() => void)[] = [];
const cleanups = restores;
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const directory of invoiceNumberingDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

type Row = Record<string, unknown>;

function corrected() {
  const f = setupInvoiceNumbering('client_project_sequence');
  const p = f.project('001');
  const invoice = f.issue(p.ruleId, '2026-08-01', '2026-08-31');
  const snapshot = f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(invoice.id) as Row;
  const lineId = String((JSON.parse(String(snapshot.snapshot_json)).lines as Row[])[0]!.id);
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  return { ...f, p, invoice, lineId, start: day(-1), end: day(1) };
}

function packFixture(workDate = '2026-08-03') {
  const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-version-pack-'));
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
  const invoice = repository.createInvoiceDraft(owner, rule.id, workDate, workDate);
  repository.approveInvoiceDraft(owner, invoice.id);
  repository.issueInvoice(owner, invoice.id, 'en');
  return { sqlite, repository, v3, owner, entity, project, time, invoice };
}

function register(pack: { snapshot: unknown }, invoiceId: string) {
  const rows = (pack.snapshot as { invoiceRegister: Row[] }).invoiceRegister;
  return rows.find((row) => row.invoiceId === invoiceId);
}

describe('corrected invoice versions in packs, reports and search', () => {
  it('a new accounting pack counts the current version; an earlier pack keeps its values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
    const f = packFixture();
    const before = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05');
    expect(register(before, f.invoice.id)).toMatchObject({ netMinor: '10000', grossMinor: '10000' });

    const issued = f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(f.invoice.id) as Row;
    const lineId = String((JSON.parse(String(issued.snapshot_json)).lines as Row[])[0]!.id);
    vi.setSystemTime(new Date('2026-10-05T13:00:00.000Z'));
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'line',
      lineId,
      amountMinor: 12_500n,
    });

    const after = f.v3.createAccountingPack(f.owner, '2026-10-01', '2026-10-05');
    expect(after.id).not.toBe(before.id);
    expect(register(after, f.invoice.id)).toMatchObject({ netMinor: '12500', grossMinor: '12500' });
    // The pack made before the correction still holds what it contained.
    const stored = f.sqlite
      .prepare('SELECT snapshot_json FROM accounting_pack_run WHERE id=?')
      .get(before.id) as Row;
    expect(
      register({ snapshot: JSON.parse(String(stored.snapshot_json)) }, f.invoice.id),
    ).toMatchObject({ netMinor: '10000', grossMinor: '10000' });
  });

  it('the project finance report reads the current version amounts', () => {
    const f = corrected();
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'line',
      lineId: f.lineId,
      amountMinor: 12_500n,
    });
    const finance = f.v3.projectFinance(f.finance, f.p.id) as Row;
    expect(JSON.stringify(finance)).toContain('12500');
  });

  it('search finds a corrected invoice by any of its version numbers', () => {
    const f = corrected();
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'invoiceNumber',
      value: 'CP-IMPC-777',
      reason: 'Client asked for their own number',
    });
    const find = (query: string) =>
      (f.repository.search(f.owner, query) as Row[]).filter((row) => row.type === 'invoice');
    expect(find('CP-IMPC-777')).toEqual([
      expect.objectContaining({ id: f.invoice.id, label: 'CP-IMPC-777' }),
    ]);
    expect(find('CP-IMPC-001')).toEqual([
      expect.objectContaining({ id: f.invoice.id, label: 'CP-IMPC-777' }),
    ]);
  });
});
