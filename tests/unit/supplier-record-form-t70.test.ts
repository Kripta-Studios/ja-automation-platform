import { describe, expect, it } from 'vitest';
import { validSupplierPersonHours } from '../../apps/portal/src/lib/portal/supplier-person-hours';
import { supplierCopy } from '../../apps/portal/src/routes/app/supplier/copy';
import { expenseCopy } from '../../apps/portal/src/lib/portal/sections/expense-copy';

describe('T70 supplier per-person hours', () => {
  it('accepts decimal, comma and clock formats', () => {
    for (const value of ['7.5', '7,5', '7:30', '8', '24']) {
      expect(validSupplierPersonHours(value), value).toBe(true);
    }
  });
  it('rejects text, zero and more than a day', () => {
    for (const value of ['abc', '0', '0:00', '24.5', '25', '-1', '']) {
      expect(validSupplierPersonHours(value), value).toBe(false);
    }
  });
});

describe('T70/T69 copy is translated', () => {
  it('has the new supplier keys in every locale', () => {
    for (const key of [
      'assignedHelp',
      'reportLanguage',
      'overnightHint',
      'personHoursInvalid',
    ] as const) {
      const values = (['en', 'es', 'pt'] as const).map((locale) => supplierCopy[locale][key]);
      expect(values.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
      expect(new Set(values).size).toBe(3);
    }
  });
  it('tells external technicians to ask the coordinator about refunds in every locale', () => {
    const values = (['en', 'es', 'pt'] as const).map((locale) =>
      expenseCopy(locale, 'supplierTechnicianNote'),
    );
    expect(new Set(values).size).toBe(3);
    expect(values[0]).toContain('supplier coordinator');
  });
});
