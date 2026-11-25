import { describe, expect, it } from 'vitest';
import {
  parseClientIntervalForm,
  parsePayIntervalForm,
} from '../../apps/portal/src/lib/server/intervals.ts';
import {
  intervalCopy,
  intervalLabel,
  periodRange,
} from '../../apps/portal/src/lib/portal/interval-copy.ts';

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe('pay and billing interval forms', () => {
  it('parses a pay interval, empty = not set / same as the person', () => {
    expect(parsePayIntervalForm(form({ payInterval: 'monthly', expectedVersion: '2' }))).toEqual({
      ok: true,
      value: { interval: 'monthly', anchorDate: null, expectedVersion: 2 },
    });
    expect(parsePayIntervalForm(form({ payInterval: '', expectedVersion: '0' }))).toMatchObject({
      ok: true,
      value: { interval: null },
    });
    expect(
      parsePayIntervalForm(
        form({ payInterval: 'every_14_days', payAnchorDate: '2026-11-02', expectedVersion: '0' }),
      ),
    ).toMatchObject({ ok: true, value: { anchorDate: '2026-11-02' } });
    expect(
      parsePayIntervalForm(form({ payInterval: 'daily', expectedVersion: '0' })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { payInterval: expect.any(Array) },
    });
    expect(
      parsePayIntervalForm(
        form({ payInterval: 'weekly', payAnchorDate: '2026-11-02', expectedVersion: '0' }),
      ).ok,
    ).toBe(false);
    expect(parsePayIntervalForm(form({ payInterval: 'weekly' })).ok).toBe(false);
  });

  it('parses a client interval with cutoff day or two-week start', () => {
    expect(
      parseClientIntervalForm(
        form({ billingInterval: 'monthly', monthlyCutoffDay: '25', expectedVersion: '1' }),
      ),
    ).toEqual({
      ok: true,
      value: { cadence: 'monthly', anchorDate: null, monthlyCutoffDay: 25, expectedVersion: 1 },
    });
    expect(
      parseClientIntervalForm(
        form({ billingInterval: 'monthly', monthlyCutoffDay: '', expectedVersion: '1' }),
      ),
    ).toMatchObject({ ok: true, value: { monthlyCutoffDay: null } });
    expect(
      parseClientIntervalForm(
        form({ billingInterval: 'monthly', monthlyCutoffDay: '30', expectedVersion: '1' }),
      ).ok,
    ).toBe(false);
    expect(
      parseClientIntervalForm(form({ billingInterval: 'every_14_days', expectedVersion: '0' })).ok,
    ).toBe(false);
    // A cutoff sent with another interval is ignored.
    expect(
      parseClientIntervalForm(
        form({ billingInterval: 'milestone', monthlyCutoffDay: '25', expectedVersion: '0' }),
      ),
    ).toMatchObject({ ok: true, value: { cadence: 'milestone', monthlyCutoffDay: null } });
  });

  it('says intervals and periods in plain words in EN, ES and PT', () => {
    expect(intervalLabel('en', 'monthly', 25)).toBe('Monthly, closing on day 25');
    expect(intervalLabel('es', 'every_14_days')).toBe('Cada 2 semanas');
    expect(intervalLabel('pt', 'milestone')).toBe('Por marco');
    expect(intervalLabel('en', null)).toBe('Not set');
    const year = new Date().getUTCFullYear();
    expect(periodRange('en', `${year}-11-01`, `${year}-11-30`)).toBe('1–30 Nov');
    expect(periodRange('en', `${year}-10-26`, `${year}-11-25`)).toBe('26 Oct – 25 Nov');
    expect(periodRange('en', '2026-12-29', '2027-01-11')).toBe('29 Dec 2026 – 11 Jan 2027');
    expect(intervalCopy('en', 'nextInvoice', { range: '1–30 Nov' })).toBe(
      'Next invoice covers 1–30 Nov',
    );
    expect(intervalCopy('pt', 'nextPay', { range: '1–30 nov' })).toBe(
      'O próximo pagamento cobre 1–30 nov',
    );
  });
});
