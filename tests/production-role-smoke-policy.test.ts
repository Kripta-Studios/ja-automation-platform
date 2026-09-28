import { describe, expect, it } from 'vitest';
import { retryAfterSeconds, signInWaitMs } from '../scripts/production-role-smoke-policy.mjs';

describe('production role smoke sign-in pacing', () => {
  it('keeps consecutive sign-in attempts outside the shared auth burst limit', () => {
    expect(signInWaitMs(null, 1_000)).toBe(0);
    const firstAttemptAt = 1_000;
    const earlyNextAttemptAt = 3_000;
    expect(signInWaitMs(firstAttemptAt, earlyNextAttemptAt)).toBe(10_000);
    expect(signInWaitMs(firstAttemptAt, 13_000)).toBe(0);

    let previousAttemptAt: number | null = null;
    const attempts: number[] = [];
    for (let role = 0; role < 6; role += 1) {
      const readyAt = 1_000 + role * 1_000;
      const attemptAt = readyAt + signInWaitMs(previousAttemptAt, readyAt);
      attempts.push(attemptAt);
      previousAttemptAt = attemptAt;
    }
    expect(attempts).toEqual([1_000, 13_000, 25_000, 37_000, 49_000, 61_000]);
  });

  it('accepts retry timing from both portal and Better Auth rate limits', () => {
    expect(retryAfterSeconds({ 'retry-after': '30' })).toBe(30);
    expect(retryAfterSeconds({ 'x-retry-after': '8' })).toBe(8);
    expect(retryAfterSeconds({ 'retry-after': '0', 'x-retry-after': '7' })).toBe(7);
    expect(retryAfterSeconds({})).toBeNull();
  });
});
