import { describe, expect, it } from 'vitest';
import {
  CANONICAL_OWNER_EMAIL,
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
} from '@ja/database';
import { assistantCanonicalOwner } from '../../apps/portal/src/lib/server/assistant-canonical-owner';

const fixtureEnvironment = {
  NODE_ENV: 'development',
  JA_TENANT_ID: SYNTHETIC_OWNER_TENANT_ID,
  JA_DEPLOYMENT_ID: SYNTHETIC_OWNER_DEPLOYMENT_ID,
};

describe('canonical owner navigation hint', () => {
  it('requires the owner role and canonical identity', () => {
    expect(assistantCanonicalOwner({ role: 'owner_admin', email: CANONICAL_OWNER_EMAIL })).toBe(
      true,
    );
    expect(assistantCanonicalOwner({ role: 'finance_admin', email: CANONICAL_OWNER_EMAIL })).toBe(
      false,
    );
    expect(assistantCanonicalOwner({ role: 'owner_admin', email: 'another@example.test' })).toBe(
      false,
    );
    expect(assistantCanonicalOwner(null)).toBe(false);
  });

  it('recognizes the designated synthetic owner only within the isolated nonproduction deployment', () => {
    const user = { role: 'owner_admin', email: SYNTHETIC_OWNER_EMAIL };
    expect(assistantCanonicalOwner(user, fixtureEnvironment)).toBe(true);
    expect(assistantCanonicalOwner(user, { ...fixtureEnvironment, NODE_ENV: 'production' })).toBe(
      false,
    );
    expect(assistantCanonicalOwner(user, { ...fixtureEnvironment, JA_TENANT_ID: 'other' })).toBe(
      false,
    );
    expect(
      assistantCanonicalOwner(user, { ...fixtureEnvironment, JA_DEPLOYMENT_ID: 'other' }),
    ).toBe(false);
    expect(assistantCanonicalOwner(user, {})).toBe(false);
  });
});
