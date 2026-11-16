import { describe, expect, it } from 'vitest';
import {
  isoDateInZone,
  parseHoursText,
  personName,
} from '../../apps/portal/src/lib/portal/sections/time-hours';
import { weekCellMinutes } from '../../apps/portal/src/lib/server/actions/time-actions';

describe('timesheet hours parsing', () => {
  it('accepts decimal, comma and clock formats', () => {
    expect(parseHoursText('8')).toBe(480);
    expect(parseHoursText('7.5')).toBe(450);
    expect(parseHoursText('7,5')).toBe(450);
    expect(parseHoursText('7:30')).toBe(450);
    expect(parseHoursText('7h30')).toBe(450);
    expect(parseHoursText('7h')).toBe(420);
    expect(parseHoursText('7.3')).toBe(438);
    expect(parseHoursText('0')).toBe(0);
    expect(parseHoursText('')).toBeNull();
  });
  it('rejects invalid or over-24 h values', () => {
    for (const value of ['abc', '25', '24:30', '7:', '-1', '7:75', '1.234'])
      expect(parseHoursText(value)).toBeUndefined();
    expect(parseHoursText('24')).toBe(1440);
  });
  it('uses the same rules on the server action', () => {
    expect(weekCellMinutes('7:30')).toBe(450);
    expect(weekCellMinutes('25')).toBeUndefined();
  });
  it('formats usernames as names and dates in a zone', () => {
    expect(personName('gabriel.lamoglia')).toBe('Gabriel Lamoglia');
    expect(personName('Alex Rivera')).toBe('Alex Rivera');
    expect(isoDateInZone('UTC', new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-16');
    expect(isoDateInZone('America/New_York', new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
  });
});
