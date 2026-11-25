import { afterEach, describe, expect, it } from 'vitest';
import { AssignmentExtrasRepository } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
} from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';

/**
 * One-screen invoice, per person: tick hours, overtime, per diem, safety allowance and
 * expenses in or out (owner request 2026-11-25). The total shown is the engine's exact total
 * for that choice; left-out hours, expenses, per diem and allowance stay open.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'extras-invoice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'extras-invoice');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'extras-invoice');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 10000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'XTRA',
    legalName: 'Extras issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'EXTRAS-ISSUER',
  });
  f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const member = (
    f.sqlite.prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?').get(f.project.id, f.worker.userId) as {
      id: string;
    }
  ).id;
  new AssignmentExtrasRepository(f.sqlite).set(owner, {
    projectMemberId: member,
    expectedVersion: 0,
    perDiemClientMinor: '5000',
    allowanceBasis: 'month',
    allowanceClientMinor: '20000',
    overtimeClient: { method: 'multiplier', value: '15000' },
  });
  const time = (date: string, minutes: number, category = 'regular') => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category,
      minutes,
      summary: 'Extras labor',
    });
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const context = ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal: finance }) as unknown as Parameters<
    typeof quickInvoicePreview
  >[0];
  return { f, finance, time, context, workerId: f.worker.userId };
}

describe('quick invoice: per-person parts', () => {
  it('lists the parts of each person and prices every choice exactly', () => {
    const s = setup();
    s.time('2026-08-03', 480);
    s.time('2026-08-03', 60, 'overtime');
    const input = { projectId: s.f.project.id, ...period };
    const full = quickInvoicePreview(s.context, input);
    expect(full.state).toBe('ready');
    // 8 h × 100.00 + 1 h × 150.00 + 1 day × 50.00 + 1 month × 200.00
    expect(full.subtotalMinor).toBe(String(80000 + 15000 + 5000 + 20000));
    expect(full.components).toEqual([
      expect.objectContaining({
        workerId: s.workerId,
        hours: { available: true, included: true },
        overtime: { available: true, included: true },
        perDiem: { available: true, included: true },
        allowance: { available: true, included: true },
        expenses: { available: false, included: true },
      }),
    ]);
    expect(full.groups.filter((group) => group.extraKind).map((group) => [group.extraKind, group.units, group.amountMinor])).toEqual([
      ['allowance', 1, '20000'],
      ['per_diem', 1, '5000'],
    ]);

    const leaveOutExtras = {
      people: [
        { workerId: s.workerId, category: 'overtime', billedMinutes: 0 },
        { workerId: s.workerId, category: 'per_diem', billedMinutes: 0 },
      ],
    };
    const partial = quickInvoicePreview(s.context, { ...input, overrides: leaveOutExtras });
    expect(partial.subtotalMinor).toBe(String(80000 + 20000));
    expect(partial.components?.[0]).toMatchObject({
      overtime: { available: true, included: false },
      perDiem: { available: true, included: false },
      allowance: { available: true, included: true },
    });

    // Hours left out: the time stays open. With nobody else on the invoice nothing is left to
    // select, so there is nothing to invoice, and the parts stay listed to tick hours back.
    const noHours = quickInvoicePreview(s.context, { ...input, leaveOut: { hours: [s.workerId], expenses: [] } });
    expect(noHours.state).toBe('empty');
    expect(noHours.components?.[0]).toMatchObject({
      hours: { available: true, included: false },
      overtime: { included: false },
    });
    // Previews write nothing.
    expect(s.f.sqlite.prepare('SELECT count(*) n FROM invoice').get()).toEqual({ n: 0 });
  });

  it('leaves the hours of one person out while others are billed', () => {
    const s = setup();
    const other = s.f.outsider;
    s.f.repository.assignWorker(s.f.owner, { projectId: s.f.project.id, workerId: other.userId, startsOn: '2026-01-01' });
    s.f.v3.createClientLaborRate(s.finance, {
      projectId: s.f.project.id,
      workerId: other.userId,
      currency: 'EUR',
      hourlyRateMinor: 7000n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-08-01',
    });
    const otherPrincipal = stepUpB5Principal(s.f.sqlite, other, 'extras-other');
    const row = s.f.repository.createTimeEntry(otherPrincipal, {
      projectId: s.f.project.id,
      workDate: '2026-08-04',
      category: 'regular',
      minutes: 120,
      summary: 'Other labor',
    });
    s.f.repository.submitTime(otherPrincipal, row.id, row.version);
    s.f.repository.operationalApproveTime(s.f.manager, row.id, 'approved');
    s.f.repository.financeApproveTime(s.finance, row.id, true);
    const mine = s.time('2026-08-03', 480);
    const input = { projectId: s.f.project.id, ...period, leaveOut: { hours: [s.workerId], expenses: [] } };
    const preview = quickInvoicePreview(s.context, input);
    expect(preview.state).toBe('ready');
    // Other person's 2 h × 70.00 + this person's per diem and allowance (hours left out).
    expect(preview.subtotalMinor).toBe(String(14000 + 5000 + 20000));
    const created = quickInvoiceCreate(s.context, {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'extras-leave-hours',
    });
    expect(created.ok).toBe(true);
    // The left-out hours are on no invoice: a later invoice can still bill them.
    expect(
      s.f.sqlite.prepare("SELECT count(*) n FROM invoice_source WHERE source_type='time' AND source_id=?").get(mine),
    ).toEqual({ n: 0 });
  });

  it('creates the draft the user saw and keeps left-out parts open', () => {
    const s = setup();
    s.time('2026-08-03', 480);
    const input = {
      projectId: s.f.project.id,
      ...period,
      overrides: { people: [{ workerId: s.workerId, category: 'per_diem', billedMinutes: 0 }] },
    };
    const preview = quickInvoicePreview(s.context, input);
    expect(preview.subtotalMinor).toBe(String(80000 + 20000));
    const created = quickInvoiceCreate(s.context, {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'extras-create-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const lines = s.f.sqlite
      .prepare('SELECT snapshot_json FROM invoice_line WHERE invoice_id=?')
      .all(created.invoiceId) as Array<{ snapshot_json: string }>;
    expect(lines.map((line) => JSON.parse(line.snapshot_json).extraKind).filter(Boolean)).toEqual(['allowance']);
    // The left-out choice is recorded on the draft (append-only invoice override).
    expect(
      s.f.sqlite
        .prepare("SELECT category,billed_minutes FROM invoice_line_override WHERE invoice_id=? AND superseded_at IS NULL")
        .all(created.invoiceId),
    ).toEqual([{ category: 'per_diem', billed_minutes: 0 }]);
    expect(
      s.f.sqlite.prepare("SELECT 1 FROM audit_event WHERE action='invoice_line_override.create'").get(),
    ).toBeTruthy();
  });
});
