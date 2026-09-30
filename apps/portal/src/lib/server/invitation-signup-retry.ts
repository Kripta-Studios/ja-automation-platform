// Better Auth wraps SQLite user-insert failures with this code. Retry only
// after the caller independently proves that its claim created no identity.
export function isInvitationSignupRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { body?: { code?: unknown }; code?: unknown; errcode?: unknown };
  return (
    failure.body?.code === 'FAILED_TO_CREATE_USER' ||
    (failure.code === 'ERR_SQLITE_ERROR' && (failure.errcode === 5 || failure.errcode === 517))
  );
}

export async function retryUncommittedInvitationSignup<T>(
  signup: () => Promise<T>,
  canRetry: () => boolean,
): Promise<T> {
  try {
    return await signup();
  } catch (error) {
    if (!isInvitationSignupRetryable(error)) throw error;
    // Give a competing writer a bounded opportunity to finish before taking
    // another snapshot. The caller holds no database connection while waiting.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (!canRetry()) throw error;
    // The failed auth transaction has rolled back. A new transaction sees a
    // fresh WAL snapshot; never loop or retry after any identity was created.
    return signup();
  }
}
