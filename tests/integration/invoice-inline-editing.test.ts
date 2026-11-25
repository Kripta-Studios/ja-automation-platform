import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

/**
 * Inline invoice editing (owner request 2026-11-25): a draft's header texts, line
 * descriptions, rate and hours are edited on the invoice itself. Rate/hours change this
 * invoice only (never time entries or pay); header texts stay on the draft unless "also
 * update the record" is ticked; everything is frozen at issue; issued invoices are refused.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };
type Row = Record<string, unknown>;

function setup(withRate = true) {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'inline-invoice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'inline-invoice');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'inline-invoice');
  const manager = stepUpB5Principal(f.sqlite, f.manager, 'inline-invoice');
  if (withRate)
    f.v3.createClientLaborRate(finance, {
      projectId: f.project.id,
      workerId: f.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 10000n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-08-01',
    });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'INLINE',
    legalName: 'Inline issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'INLINE-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Inline issuer',
    taxIdentifier: 'INLINE-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Inline invoice fixture authority',
    idempotencyKey: 'inline-issuer-revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Inline invoice fixture authority',
    idempotencyKey: 'inline-issuer-assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'INL',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00Z',
  });
  const rule = f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  /** draft | submitted | needs_changes | approved */
  const time = (date: string, minutes: number, state: string) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Inline invoice labor',
    });
    if (state === 'draft') return row.id;
    f.repository.submitTime(worker, row.id, row.version);
    if (state === 'submitted') return row.id;
    if (state === 'needs_changes') {
      f.repository.operationalApproveTime(f.manager, row.id, 'needs_changes', 'Check the hours');
      return row.id;
    }
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  return { f, finance, owner, worker, manager, time, rule };
}


function draft() {
  const s = setup();
  const entry = s.time('2026-08-04', 120, 'approved');
  s.time('2026-08-05', 60, 'approved');
  const created = s.f.repository.createInvoiceDraft(s.finance, s.rule.id, period.periodStart, period.periodEnd);
  const view = () => s.f.repository.invoicePreview(s.finance, created.id) as { invoice: Row; lines: Row[] };
  return { ...s, entry, id: created.id, view };
}

describe('inline invoice editing', () => {
  it('keeps header texts on the draft, freezes them at issue and updates the client only when asked', () => {
    const d = draft();
    const clientBefore = d.f.sqlite.prepare('SELECT c.legal_name,c.billing_address,c.version FROM client c JOIN project p ON p.client_id=c.id WHERE p.id=?').get(d.f.project.id) as Row;
    let version = Number(d.view().invoice.version);
    version = d.f.repository.updateInvoiceDraftPresentation(d.finance, d.id, {
      expectedVersion: version,
      field: 'clientName',
      value: 'Edited Client GmbH',
    }).version;
    expect(d.view().invoice).toMatchObject({ client_legal_name: 'Edited Client GmbH' });
    expect(d.f.sqlite.prepare('SELECT c.legal_name FROM client c JOIN project p ON p.client_id=c.id WHERE p.id=?').get(d.f.project.id)).toEqual({ legal_name: clientBefore.legal_name });
    version = d.f.repository.updateInvoiceDraftPresentation(d.finance, d.id, {
      expectedVersion: version,
      field: 'clientAddress',
      value: 'Hauptstrasse 1\n70173 Stuttgart',
      alsoUpdateRecord: true,
    }).version;
    expect(d.f.sqlite.prepare('SELECT c.billing_address FROM client c JOIN project p ON p.client_id=c.id WHERE p.id=?').get(d.f.project.id)).toEqual({ billing_address: 'Hauptstrasse 1\n70173 Stuttgart' });
    expect(d.f.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE action='client.update'").get()).toMatchObject({ n: expect.any(Number) });
    const line = d.view().lines[0]!;
    version = d.f.repository.updateInvoiceDraftPresentation(d.finance, d.id, {
      expectedVersion: version,
      field: 'lineDescription',
      lineKey: String(line.line_key),
      value: 'Commissioning support, line 4',
    }).version;
    expect(d.view().lines[0]).toMatchObject({ description: 'Commissioning support, line 4' });
    expect(() =>
      d.f.repository.updateInvoiceDraftPresentation(d.finance, d.id, {
        expectedVersion: version - 1,
        field: 'projectName',
        value: 'Stale',
      }),
    ).toThrow(ConflictError);
    expect(() =>
      d.f.repository.updateInvoiceDraftPresentation(d.worker, d.id, {
        expectedVersion: version,
        field: 'projectName',
        value: 'Worker edit',
      }),
    ).toThrow(AccessDeniedError);
    d.f.repository.approveInvoiceDraft(d.finance, d.id);
    d.f.repository.issueInvoice(d.finance, d.id, 'en');
    const issued = JSON.parse(String((d.f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(d.id) as Row).snapshot_json));
    expect(issued.client).toMatchObject({ legalName: 'Edited Client GmbH', billingAddress: 'Hauptstrasse 1\n70173 Stuttgart' });
    expect(issued.lines[0]).toMatchObject({ description: 'Commissioning support, line 4' });
    // Issued invoices are never edited in place.
    expect(() =>
      d.f.repository.updateInvoiceDraftPresentation(d.owner, d.id, {
        expectedVersion: Number(d.view().invoice.version),
        field: 'clientName',
        value: 'After issue',
      }),
    ).toThrow(ConflictError);
  });

  it('changes rate and hours of this invoice only; time entries and worker pay stay unchanged', () => {
    const d = draft();
    const timeBefore = d.f.sqlite.prepare('SELECT * FROM time_entry ORDER BY id').all();
    const before = d.view();
    const totalBefore = BigInt(String(before.invoice.total_minor));
    const line = before.lines.find((row) => row.source_id === d.entry)!;
    expect(line).toBeDefined();
    let version = Number(before.invoice.version);
    // Keep a draft-only edit to prove the rebuild preserves it.
    version = d.f.repository.updateInvoiceDraftPresentation(d.finance, d.id, {
      expectedVersion: version,
      field: 'projectName',
      value: 'Line 4 retrofit',
    }).version;
    const rebuilt = d.f.repository.updateInvoiceDraftLine(d.finance, d.id, {
      expectedVersion: version,
      lineId: String(line.id),
      rateMinor: '12000',
    });
    const afterRate = d.f.repository.invoicePreview(d.finance, rebuilt.id) as { invoice: Row; lines: Row[] };
    expect(BigInt(String(afterRate.invoice.total_minor))).toBe((totalBefore * 12000n) / 10000n);
    expect(afterRate.invoice.project_name).toBe('Line 4 retrofit');
    const edited = afterRate.lines.find((row) => row.source_id === d.entry)!;
    const again = d.f.repository.updateInvoiceDraftLine(d.finance, rebuilt.id, {
      expectedVersion: Number(afterRate.invoice.version),
      lineId: String(edited.id),
      billedMinutes: 180,
    });
    const afterHours = d.f.repository.invoicePreview(d.finance, again.id) as { invoice: Row; lines: Row[] };
    // 3 h + 1 h at 120.00 = 480.00
    expect(String(afterHours.invoice.subtotal_minor)).toBe('48000');
    expect(d.f.sqlite.prepare('SELECT * FROM time_entry ORDER BY id').all()).toEqual(timeBefore);
    expect(
      d.f.sqlite.prepare("SELECT COUNT(*) n FROM invoice_line_override WHERE invoice_id=? AND superseded_at IS NULL").get(again.id),
    ).toEqual({ n: 1 });
    expect(() =>
      d.f.repository.updateInvoiceDraftLine(d.finance, again.id, {
        expectedVersion: Number(afterHours.invoice.version),
        lineId: 'missing',
        rateMinor: '1',
      }),
    ).toThrow(ValidationError);
  });
});
