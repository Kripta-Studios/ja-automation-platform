import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const key = (secret: string | undefined): Buffer => {
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error('Invitation delivery secret unavailable');
  return createHash('sha256').update('ja-invitation-mail-v1\0').update(secret).digest();
};
export const sealInvitationToken = (
  token: string,
  invitationId: string,
  secret: string | undefined,
): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(invitationId));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};
export const openInvitationToken = (
  envelope: string,
  invitationId: string,
  secret: string | undefined,
): string => {
  const [version, iv, tag, ciphertext, extra] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra || envelope.length > 1024)
    throw new Error('Invalid invitation envelope');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(invitationId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
