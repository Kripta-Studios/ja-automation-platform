import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  formatClientProjectNumber,
  invoiceNumberSegment,
} from '../../packages/database/src/domains/billing/invoice-number-format.ts';

// Owner decision 2026-11-25: "CP-<client code>-<NNN>" per project; other projects of the same
// client use "CP-<client code>-<cost center>-<NNN>"; credit notes keep the CN series.
const directories: string[] = [];
const restores: (() => void)[] = [];
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

function seedUser(sqlite: ReturnType<typeof createDatabase>['sqlite'], id: string, role: string) {
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

function setup(format: 'client_project_sequence' | 'prefix_year_sequence') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'));
  const directory = mkdtempSync(join(tmpdir(), 'ja-cp-numbers-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  const sessionId = 'cp-numbers-finance-session';
  const at = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, `${sessionId}-token`, 'finance', new Date(Date.now() + 3_600_000).toISOString(), at, at, at);
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set(), sessionId };
  const entity = repository.createLegalEntity(owner, {
    code: 'CPNUM',
    legalName: 'Numbering Entity',
    currency: 'USD',
    billingAddress: 'Configured address',
    companyIdentifiers: 'Configured identifiers',
  });
  const revision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Numbering Entity',
    taxIdentifier: 'USCPNUM001',
    addressLine1: 'Configured address',
    locality: 'Austin',
    postalCode: '78701',
    countryCode: 'US',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Numbering fixture',
    idempotencyKey: 'cp-numbers:revision',
  });
  repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: '123',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    numberFormat: format,
  });
  const client = repository.createClient(owner, {
    legalName: 'IMPC Gmbh',
    displayName: 'IMPC Gmbh',
    currency: 'USD',
    timezone: 'UTC',
    billingEmail: 'billing@impc.example',
    billingAddress: 'IMPC billing address',
  });
  sqlite.prepare("UPDATE client SET client_code='IMPC' WHERE id=?").run(client.id);
  let counter = 0;
  const project = (costCenterCode: string) => {
    counter += 1;
    const created = repository.createProject(owner, {
      costCenterCode,
      clientId: client.id,
      name: `Project ${counter}`,
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'all_in',
      fixedPriceMinor: 10_000n,
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: created.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Numbering fixture project',
      idempotencyKey: `cp-numbers:assignment:${counter}`,
    });
    const rule = repository.createBillingRule(finance, {
      projectId: created.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
    });
    return { id: created.id, ruleId: rule.id };
  };
  repository.createTaxProfile(finance, {
    name: 'No tax',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const issue = (ruleId: string, start: string, end: string) => {
    const draft = repository.createInvoiceDraft(finance, ruleId, start, end);
    const preview = repository.invoicePreview(finance, draft.id).invoice as {
      draft_number_preview: { number: string | null } | null;
    };
    repository.approveInvoiceDraft(finance, draft.id);
    const issued = repository.issueInvoice(finance, draft.id, 'en');
    return { id: draft.id, preview: preview.draft_number_preview?.number ?? null, number: issued.invoiceNumber };
  };
  return { sqlite, repository, finance, client, project, issue };
}

describe('client/project invoice numbers', () => {
  it('formats safe segments and three-digit sequences', () => {
    expect(invoiceNumberSegment('022 - 001')).toBe('022-001');
    expect(invoiceNumberSegment('Dürr/Stuttgart')).toBe('Durr-Stuttgart');
    expect(formatClientProjectNumber('CP-IMPC', 1)).toBe('CP-IMPC-001');
    expect(formatClientProjectNumber('CP-IMPC', 1234)).toBe('CP-IMPC-1234');
  });

  it('numbers per project: the first project keeps the short form, others add the cost center', () => {
    const f = setup('client_project_sequence');
    const bbs = f.project('001');
    const junkers = f.project('004');
    const first = f.issue(bbs.ruleId, '2026-08-01', '2026-08-31');
    expect(first.preview).toBe('CP-IMPC-001');
    expect(first.number).toBe('CP-IMPC-001');
    const other = f.issue(junkers.ruleId, '2026-08-01', '2026-08-31');
    expect(other.preview).toBe('CP-IMPC-004-001');
    expect(other.number).toBe('CP-IMPC-004-001');
    const second = f.issue(bbs.ruleId, '2026-09-01', '2026-09-30');
    expect(second.number).toBe('CP-IMPC-002');
    const otherSecond = f.issue(junkers.ruleId, '2026-09-01', '2026-09-30');
    expect(otherSecond.number).toBe('CP-IMPC-004-002');
    // Stems are stored once per project and cannot be changed or removed.
    expect(
      f.sqlite.prepare('SELECT project_id,stem FROM project_invoice_number_series ORDER BY stem').all(),
    ).toEqual([
      { project_id: bbs.id, stem: 'CP-IMPC' },
      { project_id: junkers.id, stem: 'CP-IMPC-004' },
    ]);
    expect(() =>
      f.sqlite.prepare("UPDATE project_invoice_number_series SET stem='CP-X' WHERE project_id=?").run(bbs.id),
    ).toThrow(/immutable/u);
    expect(() =>
      f.sqlite.prepare('DELETE FROM project_invoice_number_series WHERE project_id=?').run(bbs.id),
    ).toThrow(/immutable/u);
    // Issued snapshots and their hashes carry the allocated number.
    const row = f.sqlite
      .prepare('SELECT invoice_number,snapshot_json,calculation_hash FROM invoice WHERE id=?')
      .get(second.id) as { invoice_number: string; snapshot_json: string; calculation_hash: string };
    expect(JSON.parse(row.snapshot_json)).toMatchObject({ number: 'CP-IMPC-002', invoiceNumber: 'CP-IMPC-002' });
    expect(row.calculation_hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('uses the client number without a client code and a suffix when the cost center collides', () => {
    const f = setup('client_project_sequence');
    f.sqlite.prepare('UPDATE client SET client_code=NULL WHERE id=?').run(f.client.id);
    const clientNumber = (
      f.sqlite.prepare('SELECT client_number FROM client WHERE id=?').get(f.client.id) as {
        client_number: string;
      }
    ).client_number;
    const a = f.project('77');
    const b = f.project('77-B');
    f.sqlite.prepare("UPDATE project SET cost_center_code='77' WHERE id=?").run(b.id);
    const c = f.project('88');
    f.sqlite.prepare("UPDATE project SET cost_center_code='77' WHERE id=?").run(c.id);
    expect(f.issue(a.ruleId, '2026-08-01', '2026-08-31').number).toBe(`CP-${clientNumber}-001`);
    expect(f.issue(b.ruleId, '2026-08-01', '2026-08-31').number).toBe(`CP-${clientNumber}-77-001`);
    expect(f.issue(c.ruleId, '2026-08-01', '2026-08-31').number).toBe(`CP-${clientNumber}-77-2-001`);
  });

  it('counts invoices the project issued before the CP series and keeps issued numbers', () => {
    const f = setup('prefix_year_sequence');
    const p = f.project('001');
    const legacy = f.issue(p.ruleId, '2026-07-01', '2026-07-31');
    expect(legacy.number).toBe('123-2026-000001');
    f.sqlite.prepare("UPDATE invoice_number_policy SET number_format='client_project_sequence'").run();
    expect(f.issue(p.ruleId, '2026-08-01', '2026-08-31').number).toBe('CP-IMPC-002');
    expect(
      f.sqlite.prepare('SELECT invoice_number FROM invoice WHERE id=?').get(legacy.id),
    ).toEqual({ invoice_number: '123-2026-000001' });
  });
});
