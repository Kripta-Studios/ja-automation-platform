import { describe, expect, it } from 'vitest';
import {
  extrasFormValues,
  parseExtrasForm,
  parseMultiplierBps,
} from '../../apps/portal/src/lib/server/assignment-extras-form.ts';

describe('assignment extras form', () => {
  it('reads typed amounts and multipliers exactly, empty boxes mean not used', () => {
    expect(parseMultiplierBps('1.5')).toBe('15000');
    expect(parseMultiplierBps('x1,25')).toBe('12500');
    expect(parseMultiplierBps('abc')).toBeNull();
    const parsed = parseExtrasForm(
      {
        version: '2',
        perDiemClient: '50',
        perDiemWorker: '30,5',
        allowanceBasis: 'month',
        allowanceClient: '1000.00',
        allowanceWorker: '',
        overtimeClientMethod: 'multiplier',
        overtimeClient: '1.5',
        overtimeWorkerMethod: 'rate',
        overtimeWorker: '25',
        expenses: 'both',
      },
      'USD',
    );
    expect(parsed).toEqual({
      ok: true,
      input: {
        expectedVersion: 2,
        perDiemClientMinor: '5000',
        perDiemWorkerMinor: '3050',
        allowanceBasis: 'month',
        allowanceClientMinor: '100000',
        allowanceWorkerMinor: null,
        overtimeClient: { method: 'multiplier', value: '15000' },
        overtimeWorker: { method: 'rate', value: '2500' },
        expenses: 'both',
      },
    });
    expect(parseExtrasForm({ version: '0' }, 'USD')).toMatchObject({
      ok: true,
      input: { perDiemClientMinor: null, allowanceBasis: null, overtimeClient: null },
    });
  });

  it('names the box that is wrong', () => {
    expect(parseExtrasForm({ perDiemClient: '5O' }, 'USD')).toMatchObject({
      ok: false,
      error: { field: 'perDiemClient' },
    });
    expect(parseExtrasForm({ allowanceClient: '10' }, 'USD')).toMatchObject({
      ok: false,
      error: { field: 'allowanceBasis' },
    });
    expect(
      parseExtrasForm({ overtimeClientMethod: 'multiplier', overtimeClient: '12' }, 'USD'),
    ).toMatchObject({
      ok: false,
      error: { field: 'overtimeClient' },
    });
  });

  it('shows saved extras back as typed values', () => {
    expect(
      extrasFormValues(
        {
          id: 'x',
          projectMemberId: 'm',
          version: 3,
          currency: 'USD',
          perDiemClientMinor: '5000',
          perDiemWorkerMinor: null,
          allowanceBasis: 'day',
          allowanceClientMinor: '2550',
          allowanceWorkerMinor: '1000',
          overtimeClient: { method: 'multiplier', value: '15000' },
          overtimeWorker: { method: 'rate', value: '2500' },
          reason: null,
          effectiveFrom: null,
          createdAt: '2026-11-25T00:00:00Z',
        },
        'worker',
        'USD',
      ),
    ).toEqual({
      version: 3,
      perDiemClient: '50.00',
      perDiemWorker: '',
      allowanceBasis: 'day',
      allowanceClient: '25.50',
      allowanceWorker: '10.00',
      overtimeClientMethod: 'multiplier',
      overtimeClient: '1.5',
      overtimeWorkerMethod: 'rate',
      overtimeWorker: '25.00',
      expenses: 'worker',
      // D4: '' = not a supplier's technician (no "who pays" choice).
      supplierExpenses: '',
      effectiveFrom: '',
      appliesFrom: '',
      previous: null,
    });
  });

  it('passes the "applies from" day and shows the values before it', () => {
    expect(
      parseExtrasForm({ perDiemClient: '5', effectiveFrom: '2026-12-01' }, 'USD'),
    ).toMatchObject({ ok: true, input: { effectiveFrom: '2026-12-01' } });
    expect(parseExtrasForm({ effectiveFrom: '1 Dec' }, 'USD')).toMatchObject({
      ok: false,
      error: { field: 'effectiveFrom' },
    });
    const base = {
      id: 'x',
      projectMemberId: 'm',
      currency: 'USD',
      perDiemWorkerMinor: null,
      allowanceBasis: null,
      allowanceClientMinor: null,
      allowanceWorkerMinor: null,
      overtimeClient: null,
      overtimeWorker: null,
      reason: null,
      createdAt: '2026-11-25T00:00:00Z',
    } as const;
    const shown = extrasFormValues(
      { ...base, version: 2, perDiemClientMinor: '7000', effectiveFrom: '2026-12-01' },
      null,
      'USD',
      { ...base, version: 1, perDiemClientMinor: '5000', effectiveFrom: null },
    );
    expect(shown).toMatchObject({
      perDiemClient: '70.00',
      appliesFrom: '2026-12-01',
      previous: { version: 1, perDiemClient: '50.00', appliesFrom: '' },
    });
  });
});
