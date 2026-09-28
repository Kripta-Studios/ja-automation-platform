import { describe, it, expect } from 'vitest';
import {
  ownerFinanceSummary,
  matchesCashFilter,
} from '../apps/portal/src/lib/portal/owner-finance';
import type { CashMovement } from '../apps/portal/src/lib/server/cash-calendar';
const row = (id: string, overrides: Partial<CashMovement> = {}): CashMovement => ({
  id,
  sourceId: id,
  projectId: 'p',
  project: 'Project',
  party: 'Client',
  entityId: null,
  entity: '',
  currency: 'EUR',
  kind: 'customer_receipt',
  basis: 'actual',
  date: '2026-09-02',
  dueDate: null,
  amountMinor: '100',
  reference: 'Test',
  href: '/app/billing/invoices/test',
  ...overrides,
});
describe('Owner financial overview', () => {
  it('reconciles partial collections, reversals, overdue invoices and payment evidence independently', () => {
    const rows = [
      row('receipt', { amountMinor: '60000' }),
      row('reversal', { kind: 'receipt_reversal', amountMinor: '-10000' }),
      row('due', { basis: 'expected', amountMinor: '50000', dueDate: '2026-09-01' }),
      row('future', { basis: 'expected', amountMinor: '20000', dueDate: '2026-09-10' }),
      row('no-date', { basis: 'expected', amountMinor: '30000', date: null }),
      row('pay', { kind: 'worker_compensation', basis: 'expected', amountMinor: '-5000' }),
      row('unconfirmed', {
        kind: 'worker_compensation',
        basis: 'needs_confirmation',
        amountMinor: '-9000',
      }),
      row('paid', { kind: 'worker_reimbursement', amountMinor: '-1200' }),
    ];
    const summary = ownerFinanceSummary(rows, '2026-09-10').currencies[0];
    expect(summary).toMatchObject({
      collected: '50000',
      receivable: '100000',
      overdue: '50000',
      not_due: '50000',
      payable: '5000',
      paid: '1200',
      unconfirmed: '9000',
    });
    expect(summary.months[5]).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      incoming: '60000',
      outgoing: '11200',
    });
    expect(
      rows
        .filter((item) => matchesCashFilter(item, 'overdue', '2026-09-10'))
        .map((item) => item.id),
    ).toEqual(['due']);
  });
  it('keeps large integers and currencies exact, and six months across year boundaries', () => {
    const result = ownerFinanceSummary(
      [
        row('a', { amountMinor: '9007199254740993', date: '2025-12-31' }),
        row('b', { amountMinor: '7', date: '2026-01-01' }),
        row('c', { currency: 'USD', amountMinor: '22' }),
      ],
      '2026-01-15',
    );
    expect(result.currencies[0].collected).toBe('9007199254741000');
    expect(result.currencies[1].collected).toBe('22');
    expect(result.currencies[0].months.map((item) => item.from)).toEqual([
      '2025-08-01',
      '2025-09-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
    ]);
    expect(result.currencies[0].months[4].incoming).toBe('9007199254740993');
  });
  it('does not invent money for an empty company or use undated actual transactions in monthly bars', () => {
    expect(ownerFinanceSummary([], '2026-09-10').currencies).toEqual([]);
    expect(ownerFinanceSummary([], '2026-09-10', ['EUR']).currencies[0]).toMatchObject({
      currency: 'EUR',
      collected: '0',
      paid: '0',
    });
    const summary = ownerFinanceSummary([row('undated', { date: null })], '2026-09-10')
      .currencies[0];
    expect(summary.collected).toBe('100');
    expect(summary.months.every((month) => month.incoming === '0')).toBe(true);
  });
});
