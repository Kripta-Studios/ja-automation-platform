import type { DatabaseSync } from 'node:sqlite';

export type ProjectSiteInput = Readonly<{
  onsiteManager?: string | null;
  siteLocation?: string | null;
  onsiteContactId?: string | null;
}>;

/** Optional operating-site information is independent of the bill-to client. */
export function projectSiteSettings(
  sqlite: DatabaseSync,
  clientId: string,
  input: ProjectSiteInput,
  existing: Record<string, unknown>,
  validation: (message: string) => never,
): Array<[string, string | null]> {
  const text = (value: string | null | undefined, key: string, label: string, max: number) => {
    if (value === undefined) return (existing[key] as string | null | undefined) ?? null;
    const normalized = value?.trim() || null;
    if (normalized && normalized.length > max) return validation(`${label} is too long`);
    return normalized;
  };
  const contactId = text(input.onsiteContactId, 'onsite_contact_id', 'On-site contact', 100);
  if (
    contactId &&
    !sqlite
      .prepare('SELECT 1 FROM client_contact WHERE id=? AND client_id=?')
      .get(contactId, clientId)
  )
    return validation('On-site contact must belong to the project client');
  return [
    ['onsite_manager', text(input.onsiteManager, 'onsite_manager', 'On-site manager', 200)],
    ['site_location', text(input.siteLocation, 'site_location', 'Site location', 500)],
    ['onsite_contact_id', contactId],
  ];
}
