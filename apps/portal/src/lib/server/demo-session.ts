import { createHmac, timingSafeEqual } from 'node:crypto';

export const demoEnabled =
  process.env.JA_DEMO_MODE === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.JA_DEMO_MODE !== 'false');
const secret = process.env.JA_AUTH_SECRET ?? 'development-only-secret-change-before-production';

const signature = (userId: string) =>
  createHmac('sha256', secret).update(`ja-demo:${userId}`).digest('base64url');

export const createDemoToken = (userId: string) => `${userId}.${signature(userId)}`;

export function readDemoToken(value: string | undefined): string | null {
  if (!demoEnabled || !value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const userId = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(userId));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? userId : null;
}
