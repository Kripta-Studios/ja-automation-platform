import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, V3AccessDeniedError, V3ValidationError } from '@ja/database';

const state = vi.hoisted(() => ({
  bootstrapError: null as Error | null,
  readinessError: null as Error | null,
  openCount: 0,
  closeCount: 0,
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => {
    state.openCount += 1;
    if (state.bootstrapError) throw state.bootstrapError;
    return {
      principal: { role: 'finance_admin' },
      sqlite: { close: () => (state.closeCount += 1) },
      repository: {
        billingReadiness: () => {
          if (state.readinessError) throw state.readinessError;
          return { state: 'ready', reasons: [] };
        },
      },
    };
  },
}));

import { GET } from '../../apps/portal/src/routes/app/api/billing/readiness/+server';

const url = new URL(
  'http://localhost/app/api/billing/readiness?billingRuleId=stream-1&periodStart=2026-09-01&periodEnd=2026-09-30',
);

async function check(locals: Record<string, unknown> = { user: { id: 'actor' }, session: {} }) {
  const response = await GET({ locals, url } as never);
  return { response, body: await response.json() };
}

describe('billing readiness API problems', () => {
  beforeEach(() => {
    state.bootstrapError = null;
    state.readinessError = null;
    state.openCount = 0;
    state.closeCount = 0;
  });

  it('returns a typed sign-in problem before reading billing state', async () => {
    const { response, body } = await check({});
    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 'BILLING_READINESS_SIGN_IN_REQUIRED',
      messageKey: 'problem.billing.readinessSignInRequired',
      remedies: [{ id: 'sign_in_again' }],
    });
    expect(state.openCount).toBe(0);
  });

  it('returns a typed selection problem for invalid query fields', async () => {
    const response = await GET({
      locals: { user: { id: 'actor' }, session: {} },
      url: new URL('http://localhost/app/api/billing/readiness?billingRuleId=stream-1'),
    } as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'BILLING_READINESS_SELECTION_INVALID',
      remedies: [{ id: 'review_selected_period' }],
    });
    expect(state.openCount).toBe(0);
  });

  it.each([
    [
      new AccessDeniedError('Active account required'),
      'BILLING_READINESS_ACCOUNT_INACTIVE',
      'contact_owner',
    ],
    [
      new V3AccessDeniedError('Finance role required'),
      'BILLING_READINESS_ACCESS_REQUIRED',
      'contact_finance',
    ],
  ] as const)('maps bootstrap access change to %s', async (error, code, remedy) => {
    state.bootstrapError = error;
    const { response, body } = await check();
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      code,
      remedies: [{ id: remedy }],
      fieldErrors: {},
    });
    expect(body.correlationId).toEqual(expect.any(String));
    expect(state.closeCount).toBe(0);
  });

  it.each([
    ['Billing rule not found', 'BILLING_READINESS_STREAM_UNAVAILABLE', 'review_billing_setup'],
    [
      'Billing period is outside the stream effective dates',
      'BILLING_READINESS_OUTSIDE_EFFECTIVE_DATES',
      'review_billing_setup',
    ],
    [
      'Billing period does not match the configured cadence',
      'BILLING_READINESS_CADENCE_MISMATCH',
      'review_selected_period',
    ],
    [
      'Period start is after period end',
      'BILLING_READINESS_PERIOD_INVALID',
      'review_selected_period',
    ],
  ] as const)('maps %s to a specific remedy', async (message, code, remedy) => {
    state.readinessError = new V3ValidationError(message);
    const { response, body } = await check();
    expect(response.status).toBe(code === 'BILLING_READINESS_PERIOD_INVALID' ? 400 : 409);
    expect(body).toMatchObject({ code, remedies: [{ id: remedy }] });
    expect(body.error).not.toBe(message);
    expect(state.closeCount).toBe(1);
  });

  it('hides unexpected details behind a reference and offers a safe retry', async () => {
    state.readinessError = new Error('secret database details');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { response, body } = await check();
      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'BILLING_READINESS_UNAVAILABLE',
        remedies: [{ id: 'retry_readiness' }],
      });
      expect(JSON.stringify(body)).not.toContain('secret database details');
      expect(body.correlationId).toEqual(expect.any(String));
      expect(state.closeCount).toBe(1);
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('preserves the ready response shape', async () => {
    const { response, body } = await check();
    expect(response.status).toBe(200);
    expect(body).toEqual({ state: 'ready', reasons: [] });
    expect(state.closeCount).toBe(1);
  });
});
