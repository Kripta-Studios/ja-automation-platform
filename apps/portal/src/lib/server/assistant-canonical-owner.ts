import {
  CANONICAL_OWNER_EMAIL,
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
} from '@ja/database';

/** Navigation hint only; the existing action guards remain authoritative. */
export function assistantCanonicalOwner(
  user: { role?: string | null; email?: string | null } | null | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (user?.role !== 'owner_admin' || !user.email) return false;
  const email = user.email.trim().toLowerCase();
  return (
    email === CANONICAL_OWNER_EMAIL ||
    (environment.NODE_ENV !== 'production' &&
      environment.JA_TENANT_ID === SYNTHETIC_OWNER_TENANT_ID &&
      environment.JA_DEPLOYMENT_ID === SYNTHETIC_OWNER_DEPLOYMENT_ID &&
      email === SYNTHETIC_OWNER_EMAIL)
  );
}
