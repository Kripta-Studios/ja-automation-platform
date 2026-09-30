import { describe, expect, it, vi } from 'vitest';
import { retryUncommittedInvitationSignup } from '../../apps/portal/src/lib/server/invitation-signup-retry';

describe('invitation signup recovery without identity mutations', () => {
  it.each([
    { code: 'ERR_SQLITE_ERROR', errcode: 5 },
    { code: 'ERR_SQLITE_ERROR', errcode: 517 },
    { body: { code: 'FAILED_TO_CREATE_USER' } },
  ])('makes one fresh attempt after a retryable failure and safe claim proof', async (failure) => {
    const result = { user: { id: 'accepted-identity' } };
    const signup = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(result);
    const proof = vi.fn(() => true);
    await expect(retryUncommittedInvitationSignup(signup, proof)).resolves.toBe(result);
    expect(signup).toHaveBeenCalledTimes(2);
    expect(proof).toHaveBeenCalledTimes(1);
  });

  it('never retries when identity evidence or a lost/expired claim prevents proof', async () => {
    const failure = { body: { code: 'FAILED_TO_CREATE_USER' } };
    const signup = vi.fn().mockRejectedValue(failure);
    await expect(retryUncommittedInvitationSignup(signup, () => false)).rejects.toBe(failure);
    expect(signup).toHaveBeenCalledTimes(1);
  });

  it('does not retry validation or credential failures', async () => {
    const failure = { body: { code: 'PASSWORD_TOO_LONG' } };
    const signup = vi.fn().mockRejectedValue(failure);
    const proof = vi.fn(() => true);
    await expect(retryUncommittedInvitationSignup(signup, proof)).rejects.toBe(failure);
    expect(signup).toHaveBeenCalledTimes(1);
    expect(proof).not.toHaveBeenCalled();
  });

  it('stops after the second failure without another proof or attempt', async () => {
    const failure = { body: { code: 'FAILED_TO_CREATE_USER' } };
    const signup = vi.fn().mockRejectedValue(failure);
    const proof = vi.fn(() => true);
    await expect(retryUncommittedInvitationSignup(signup, proof)).rejects.toBe(failure);
    expect(signup).toHaveBeenCalledTimes(2);
    expect(proof).toHaveBeenCalledTimes(1);
  });

  it('fails closed when claim proof cannot be read', async () => {
    const failure = { body: { code: 'FAILED_TO_CREATE_USER' } };
    const unavailable = new Error('proof unavailable');
    const signup = vi.fn().mockRejectedValue(failure);
    await expect(
      retryUncommittedInvitationSignup(signup, () => {
        throw unavailable;
      }),
    ).rejects.toBe(unavailable);
    expect(signup).toHaveBeenCalledTimes(1);
  });
});
