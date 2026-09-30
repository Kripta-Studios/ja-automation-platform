import { generateRandomString, symmetricEncrypt } from 'better-auth/crypto';

type SecretConfig = Parameters<typeof symmetricEncrypt>[0]['key'];

// Better Auth's TOTP verifier uses the original UTF-8 secret bytes. The
// authenticator URI carries those same bytes encoded as unpadded RFC 4648 base32.
export function managedTotpUri(secret: string, account: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const byte of new TextEncoder().encode(secret)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) encoded += alphabet[(value << (5 - bits)) & 31];
  const issuer = 'J&A Automation';
  const parameters = new URLSearchParams({ secret: encoded, issuer, digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${parameters}`;
}

/** Generate the same encrypted material consumed by the Better Auth plugin.
 * Authorization and the atomic setup/audit write belong to the managed route.
 */
export async function generateManagedMfaSetup(key: SecretConfig, email: string) {
  const secret = generateRandomString(32);
  const backupCodes = Array.from({ length: 10 }, () => {
    const code = generateRandomString(10, 'a-z', '0-9', 'A-Z');
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
  const [encryptedSecret, encryptedBackupCodes] = await Promise.all([
    symmetricEncrypt({ key, data: secret }),
    symmetricEncrypt({ key, data: JSON.stringify(backupCodes) }),
  ]);
  return {
    encryptedSecret,
    encryptedBackupCodes,
    totpURI: managedTotpUri(secret, email),
    backupCodes,
  };
}
