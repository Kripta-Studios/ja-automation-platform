import { describe, expect, it } from 'vitest';
import { supplierPeriod } from '../../apps/portal/src/lib/server/supplier-context';

describe('supplier operational report period problems', () => {
  it.each([
    ['not-a-date', '2026-09-30', ['from']],
    ['2026-02-30', '2026-09-30', ['from']],
    ['2026-09-01', '2026-02-30', ['to']],
    ['', '', ['from', 'to']],
  ] as const)('retains invalid dates %s–%s and points to %s', (from, to, fields) => {
    const url = new URL('http://localhost/app/supplier/report');
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    const period = supplierPeriod(url);
    expect(period.from).toBe(from);
    expect(period.to).toBe(to);
    expect(period.periodProblem).toMatchObject({
      code: 'SUPPLIER_REPORT_PERIOD_DATE_INVALID',
      messageKey: 'problem.supplier.reportPeriodDateInvalid',
      remedies: [{ id: 'review_report_period' }],
    });
    expect(Object.keys(period.periodProblem?.fieldErrors ?? {})).toEqual(fields);
    expect(period.periodProblem?.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/u);
  });

  it('marks the end field when the dates are reversed', () => {
    const period = supplierPeriod(
      new URL('http://localhost/app/supplier/report?from=2026-09-30&to=2026-09-01'),
      'request-123',
    );
    expect(period).toMatchObject({ from: '2026-09-30', to: '2026-09-01' });
    expect(period.periodProblem).toMatchObject({
      code: 'SUPPLIER_REPORT_PERIOD_ORDER_INVALID',
      messageKey: 'problem.supplier.reportPeriodOrderInvalid',
      fieldErrors: { to: ['problem.supplier.reportPeriodOrderInvalid'] },
      remedies: [{ id: 'review_report_period' }],
      correlationId: 'request-123',
    });
  });

  it('accepts a valid range without a report problem', () => {
    const period = supplierPeriod(
      new URL('http://localhost/app/supplier/report?from=2026-09-01&to=2026-09-30'),
    );
    expect(period).toEqual({ from: '2026-09-01', to: '2026-09-30', periodProblem: null });
  });
});
