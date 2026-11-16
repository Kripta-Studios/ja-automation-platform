/**
 * Person names for the People directory and the owner "Fix names" tool.
 *
 * `personDisplayName` (shared with the shell, see display-name.ts) is the one
 * helper used to *show* a person. The functions below decide whether the
 * *stored* name is really a login ("gabriel.lamoglia") and propose a proper
 * name to save ("Gabriel Lamoglia"). Saving always goes through the server
 * profile update (validation + audit); nothing here changes data.
 */
import { personDisplayName, personInitials } from './display-name';

export { personDisplayName, personInitials };

function localPart(email: unknown): string {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return value.includes('@') ? value.split('@')[0]! : value;
}

/** True when the stored name is empty, the e-mail itself, or a login-like token. */
export function nameLooksLikeLogin(name: unknown, email?: unknown): boolean {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return true;
  if (/\s/u.test(raw)) return false;
  const lower = raw.toLocaleLowerCase();
  if (lower.includes('@')) return true;
  const local = localPart(email);
  if (local && lower === local) return true;
  // "juan_perez", "maria-lopez", "rodolfo" (all lower case, no spaces).
  return raw === lower && /^[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*$/u.test(raw);
}

/**
 * Proposed human name: from the stored login-like name, otherwise from the
 * e-mail local part. Returns '' when nothing better can be proposed.
 */
export function proposedPersonName(name: unknown, email?: unknown): string {
  if (!nameLooksLikeLogin(name, email)) return '';
  const raw = typeof name === 'string' ? name.trim() : '';
  const fromName = raw ? personDisplayName(raw) : '';
  const candidate =
    fromName && /\s/u.test(fromName) ? fromName : personDisplayName('', email) || fromName;
  const cleaned = candidate.replace(/\s+/gu, ' ').trim();
  if (!cleaned || cleaned === raw) return '';
  return cleaned.length >= 2 ? cleaned.slice(0, 160) : '';
}
