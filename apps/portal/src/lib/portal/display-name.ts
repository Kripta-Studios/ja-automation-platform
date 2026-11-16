/**
 * Presentation-only person names.
 *
 * Many accounts were created with the login (e-mail local part) as the stored
 * name, e.g. "gabriel.lamoglia". People should see "Gabriel Lamoglia". Names
 * that already look like a human name ("Antonny Nascimento", "María José")
 * are returned unchanged. This never changes stored data or authorization.
 */
const usernameLike = /^[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*$/u;

function titleCase(part: string): string {
  return part ? part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase() : part;
}

export function personDisplayName(name: unknown, email?: unknown): string {
  const raw = typeof name === 'string' ? name.trim() : '';
  const fallback = typeof email === 'string' ? email.trim() : '';
  const source = raw || fallback;
  if (!source) return '';
  // "gabriel.lamoglia@j-aautomation.com" -> local part.
  const local = source.includes('@') && !/\s/u.test(source) ? source.split('@')[0]! : source;
  if (/\s/u.test(local)) return local;
  // A single lower-case word or a dotted/underscored login is a username, not a name.
  if (!usernameLike.test(local)) return local;
  // Keep deliberate capitalisation such as "Jean-Luc" or "McAllister".
  if (local !== local.toLocaleLowerCase() && !/[._]/u.test(local)) return local;
  const parts = local.split(/[._-]+/u).filter((part) => part && !/^\d+$/u.test(part));
  return parts.length ? parts.map(titleCase).join(' ') : local;
}

/** Up to two initials from the presented name. */
export function personInitials(name: unknown, email?: unknown): string {
  return personDisplayName(name, email)
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .slice(0, 2)
    .join('');
}
