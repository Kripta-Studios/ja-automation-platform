import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
} from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';

const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const original = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  if (original === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = original;
});

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'quick-invoice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'quick-invoice');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'quick-invoice');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 12345n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'QUICK',
    legalName: 'Quick issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'QUICK-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Quick issuer',
    taxIdentifier: 'QUICK-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Quick invoice fixture authority',
    idempotencyKey: 'quick-issuer-revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Quick invoice fixture authority',
    idempotencyKey: 'quick-issuer-assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'QUICK',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00Z',
  });
  f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const time = (date: string, minutes: number, approve = true) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Quick invoice labor',
    });
    if (!approve) return row.id;
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const context = (principal: typeof finance) =>
    ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal }) as unknown as Parameters<
      typeof quickInvoicePreview
    >[0];
  return { f, finance, owner, worker, time, context };
}

const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };

describe('void invoice source release migration78', () => {
  it('releases sources of invoices voided before the upgrade and keeps their history', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-void-schema77-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (
        entry === 'contracts' ||
        (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 77)
      )
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const s = setup();
    const { f, finance, owner, time, context } = s;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 77,
    });
    const t1 = time('2026-08-20', 60);
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    const created = quickInvoiceCreate(context(finance), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'migration78-original',
    });
    if (!created.ok) throw new Error('draft expected');
    f.repository.issueReviewedInvoice(finance, created.invoiceId, preview.totalMinor);
    // Schema 77 semantics of a void: only the event and the state change.
    const voidedAt = new Date().toISOString();
    f.sqlite
      .prepare(
        "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES('void-event-77',?,'void','Voided before upgrade',?,?,'void-before-78')",
      )
      .run(created.invoiceId, owner.userId, voidedAt);
    f.sqlite
      .prepare("UPDATE invoice SET state='void',voided_at=?,updated_at=?,version=version+1 WHERE id=?")
      .run(voidedAt, voidedAt, created.invoiceId);
    // Schema 77: the void invoice still holds its hours.
    expect(f.sqlite.prepare('SELECT invoice_id FROM time_entry WHERE id=?').get(t1)).toEqual({
      invoice_id: created.invoiceId,
    });
    const links = f.sqlite
      .prepare('SELECT source_link_id,source_type,source_id FROM invoice_source WHERE invoice_id=? ORDER BY 1')
      .all(created.invoiceId);
    const invoiceBefore = f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(created.invoiceId);
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 83,
    });
    expect(f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(created.invoiceId)).toEqual(invoiceBefore);
    expect(
      f.sqlite
        .prepare('SELECT source_link_id,source_type,source_id FROM invoice_void_source_release WHERE invoice_id=? ORDER BY 1')
        .all(created.invoiceId),
    ).toEqual(links);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice_source WHERE invoice_id=?').get(created.invoiceId)).toEqual({ n: 0 });
    expect(f.sqlite.prepare('SELECT invoice_id,billing_status FROM time_entry WHERE id=?').get(t1)).toEqual({
      invoice_id: null,
      billing_status: 'unlocked',
    });
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  }, 60_000);
});
