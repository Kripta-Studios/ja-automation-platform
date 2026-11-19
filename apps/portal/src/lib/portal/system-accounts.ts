/**
 * Shared company mailboxes and service senders (adm@, finance@, legal@,
 * no-reply@, admin@ "System administrator", …) exist as portal accounts so
 * their webmail works, but they are not people: they never belong in a
 * "choose a person" list (QA round 2, P3/F6). Presentation-only filter;
 * authorization is unchanged and still enforced on the server.
 */
const SERVICE_LOCAL_PARTS = new Set([
  'adm',
  'admin',
  'administrator',
  'accounts',
  'billing',
  'contact',
  'finance',
  'hr',
  'info',
  'legal',
  'mailer-daemon',
  'no-reply',
  'noreply',
  'notifications',
  'office',
  'postmaster',
  'rh',
  'sales',
  'support',
  'webmaster',
]);
const SERVICE_NAMES = /^(?:system administrator|j&a automation portal)$/iu;

export function isSystemAccount(person: { name?: unknown; email?: unknown }): boolean {
  const email = typeof person.email === 'string' ? person.email.trim().toLowerCase() : '';
  const local = email.includes('@') ? email.split('@')[0]! : '';
  if (local && SERVICE_LOCAL_PARTS.has(local)) return true;
  const name = typeof person.name === 'string' ? person.name.trim() : '';
  return SERVICE_NAMES.test(name);
}
