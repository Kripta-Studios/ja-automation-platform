import { describe, expect, it } from 'vitest';
import {
  isoDateInZone,
  parseCellDetail,
  parseClockText,
  parseHoursText,
  personName,
  shiftMinutes,
  timeDetailText,
} from '../../apps/portal/src/lib/portal/sections/time-hours';
import { decimalHoursFromMinutes } from '../../apps/portal/src/lib/portal/minute-hours';
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
    for (const value of ['abc', '25', '24:30', '7:', '-1', '7:75', '1.23456', '24.01'])
      expect(parseHoursText(value)).toBeUndefined();
    expect(parseHoursText('24')).toBe(1440);
  });
  it('accepts any whole minute, including values the app itself displayed', () => {
    // 9:20, 10:25 and 72 h 40 min weeks come from real signed sheets.
    expect(parseHoursText('9:20')).toBe(560);
    expect(parseHoursText('9.33')).toBe(560);
    expect(parseHoursText('9.3333')).toBe(560);
    expect(parseHoursText('10:25')).toBe(625);
    expect(parseHoursText('10.42')).toBe(625);
    expect(parseHoursText('1.234')).toBe(74);
    // Every minute of a day round-trips through the 2-decimal display.
    for (let minutes = 0; minutes <= 1440; minutes += 1)
      expect(parseHoursText(decimalHoursFromMinutes(minutes))).toBe(minutes);
  });
  it('computes optional shift detail, overnight on the start date', () => {
    expect(parseClockText('7:00')).toBe('07:00');
    expect(parseClockText('1720')).toBe('17:20');
    expect(parseClockText('')).toBeNull();
    expect(parseClockText('25:00')).toBeUndefined();
    expect(shiftMinutes('07:00', '17:20', 60)).toBe(560);
    expect(shiftMinutes('12:00', '02:00', 40)).toBe(800);
    expect(shiftMinutes('22:00', '06:30', 30)).toBe(480);
    expect(shiftMinutes('08:00', '08:00', 0)).toBeUndefined();
    expect(shiftMinutes('08:00', '09:00', 60)).toBeUndefined();
    expect(parseCellDetail({ start: '07:00', end: '17:20', breakMinutes: '60', note: ' x ' })).toEqual({
      ok: true,
      detail: { startTime: '07:00', endTime: '17:20', breakMinutes: 60, note: 'x' },
      minutes: 560,
    });
    expect(parseCellDetail({ start: '', end: '', breakMinutes: '', note: 'note only' })).toEqual({
      ok: true,
      detail: { startTime: null, endTime: null, breakMinutes: null, note: 'note only' },
    });
    expect(parseCellDetail(undefined)).toEqual({ ok: true, detail: null });
    expect(parseCellDetail({ start: '07:00', end: '' })).toEqual({ ok: false, error: 'pair' });
    expect(parseCellDetail({ start: '07:00', end: '08:00', breakMinutes: '90' })).toEqual({ ok: false, error: 'break' });
    expect(timeDetailText({ start_time: '13:00', end_time: '23:00', break_minutes: 40, activity_summary: 'Line' })).toBe(
      '13:00–23:00 · −40 min · Line',
    );
    expect(timeDetailText({})).toBe('');
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
