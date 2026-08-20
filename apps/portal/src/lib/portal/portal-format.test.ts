import { describe, expect, it } from 'vitest';

import {
  categorySummary,
  compact,
  decimalToMinor,
  formNumber,
  formValue,
  hours,
  initials,
  money,
  shiftWeek,
} from './portal-format';

describe('portal format helpers', () => {
  it('preserves the existing money, hour, category, date, and initials presentation', () => {
    expect(money('12345', 'USD')).toBe('$123.45');
    expect(hours(75)).toBe('1.3h');
    expect(categorySummary({ regular: 60, travel_time: 30, standby: 0 })).toBe(
      'regular 1.0h · travel time 0.5h',
    );
    expect(shiftWeek('2026-08-17', 7)).toBe('2026-08-24');
    expect(initials('  Álvaro   Schwiedop Perez ')).toBe('ÁS');
  });

  it('preserves form normalization and exact decimal-to-minor conversion', () => {
    const form = new FormData();
    form.set('name', '  field work  ');
    form.set('minutes', ' 90 ');
    form.set('invalid', 'not-a-number');

    expect(formValue(form, 'name')).toBe('field work');
    expect(formNumber(form, 'minutes')).toBe(90);
    expect(formNumber(form, 'invalid')).toBeUndefined();
    expect(decimalToMinor('12.3')).toBe('1230');
    expect(decimalToMinor('0.05')).toBe('5');
    expect(decimalToMinor('12.345')).toBeUndefined();
    expect(compact({ keep: 0, yes: false, dropEmpty: '', dropMissing: undefined })).toEqual({
      keep: 0,
      yes: false,
    });
  });
});
