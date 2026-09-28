// Better Auth resets its 10-second window after the last sign-in. Leave a
// 12-second gap so each role gets a fresh window on a shared CI runner.
export function signInWaitMs(previousAttemptAt, now) {
  return previousAttemptAt === null ? 0 : Math.max(0, previousAttemptAt + 12_000 - now);
}

export function retryAfterSeconds(headers) {
  for (const name of ['retry-after', 'x-retry-after']) {
    const value = headers[name];
    if (!/^\d+$/u.test(value ?? '')) continue;
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 900) return seconds;
  }
  return null;
}
