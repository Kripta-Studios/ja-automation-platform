import { describe, expect, it } from 'vitest';
import { utcToZonedLocal, zoneLabel, zonedLocalToUtcIso } from '../apps/portal/src/lib/portal/zoned-time';

describe('project time zone conversion (D13, T31)', () => {
  it('stores a Mexico City 08:00 as 14:00 UTC and shows it back as 08:00', () => {
    const utc = zonedLocalToUtcIso('2026-11-24T08:00', 'America/Mexico_City');
    expect(utc).toBe('2026-11-24T14:00:00.000Z');
    expect(utcToZonedLocal(utc, 'America/Mexico_City')).toBe('2026-11-24T08:00');
  });
  it('follows daylight saving time in Madrid', () => {
    expect(zonedLocalToUtcIso('2026-07-01T08:00', 'Europe/Madrid')).toBe('2026-07-01T06:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-12-01T08:00', 'Europe/Madrid')).toBe('2026-12-01T07:00:00.000Z');
  });
  it('reads stored values without a zone suffix as UTC and falls back to UTC', () => {
    expect(utcToZonedLocal('2026-11-24T14:00:00', 'America/Mexico_City')).toBe('2026-11-24T08:00');
    expect(zonedLocalToUtcIso('2026-11-24T08:00', 'Not/AZone')).toBe('2026-11-24T08:00:00.000Z');
    expect(zonedLocalToUtcIso('garbage', 'UTC')).toBe('');
  });
  it('labels the zone with its offset', () => {
    expect(zoneLabel('America/Mexico_City', new Date('2026-11-24T12:00:00Z'))).toBe(
      'America/Mexico City (UTC−06:00)',
    );
    expect(zoneLabel('UTC')).toBe('UTC (UTC+00:00)');
  });
});
