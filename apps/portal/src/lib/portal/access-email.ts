/** Company mail domain assumed when the Owner types only a username. */
export const COMPANY_EMAIL_DOMAIN = 'j-aautomation.com';

/**
 * Normalize an email typed in Team / access forms. A value without "@" is a
 * company username: "juan.perez" becomes "juan.perez@j-aautomation.com".
 * Shared by the live preview in the browser and the server actions, so the
 * address the Owner sees is exactly the address that is saved.
 */
export function normalizeAccessEmail(value: unknown): string {
  const email = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!email) return '';
  return email.includes('@') ? email : `${email}@${COMPANY_EMAIL_DOMAIN}`;
}

export function isCompanyEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

/** Random password using an unambiguous alphabet (no 0/O, 1/l/I). */
export function generateAccessPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let password = '';
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  // Group in blocks of four so it is easy to read aloud or copy by hand.
  return password.replace(/(.{4})(?=.)/gu, '$1-');
}
