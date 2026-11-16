/** Time zones used most often by J&A projects; shown first in every picker. */
export const commonProjectTimeZones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Monterrey',
  'America/Sao_Paulo',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'UTC',
] as const;

let cachedZones: readonly string[] | null = null;

/** Every IANA zone the runtime knows (Intl.supportedValuesOf), plus UTC. */
export function allTimeZones(): readonly string[] {
  if (cachedZones) return cachedZones;
  let zones: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported)) zones = [...supported];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = [...commonProjectTimeZones];
  if (!zones.includes('UTC')) zones.push('UTC');
  cachedZones = [...new Set(zones)].sort((left, right) => left.localeCompare(right));
  return cachedZones;
}

/** "UTC−06:00" style offset for the current instant (DST aware). */
export function timeZoneOffsetLabel(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((item) => item.type === 'timeZoneName')?.value;
    if (!part || part === 'GMT') return 'UTC±00:00';
    return part.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return '';
  }
}

export function timeZoneLabel(zone: string): string {
  const city = zone.split('/').slice(-1)[0]?.replaceAll('_', ' ') ?? zone;
  const offset = timeZoneOffsetLabel(zone);
  return zone === 'UTC'
    ? `UTC${offset ? ` (${offset})` : ''}`
    : `${city} — ${zone.replaceAll('_', ' ')}${offset ? ` (${offset})` : ''}`;
}
