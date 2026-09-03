import { createDatabase } from '@ja/database';
import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import {
  assertAuthAuditReady,
  AUTH_AUDIT_ACTIONS,
  AuthAuditFailure,
  MANAGED_MFA_AUTH_CALL,
  recordAuthAudit,
} from '$lib/server/auth-audit';

type MfaBody = { action?: unknown; password?: unknown; code?: unknown };
type Sqlite = ReturnType<typeof createDatabase>['sqlite'];

function managedMfaCall<T extends Record<string, unknown>>(
  input: T,
): T & { [MANAGED_MFA_AUTH_CALL]: true } {
  return { ...input, [MANAGED_MFA_AUTH_CALL]: true } as T & {
    [MANAGED_MFA_AUTH_CALL]: true;
  };
}

type BetterAuthResult<T> = Readonly<{ response: T; headers?: Headers }> | T;

function unwrapBetterAuthResult<T>(result: BetterAuthResult<T>): {
  data: T;
  headers?: Headers;
} {
  const candidate =
    result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
  if (candidate && 'response' in candidate && candidate.response !== undefined) {
    return {
      data: candidate.response as T,
      headers: candidate.headers instanceof Headers ? candidate.headers : undefined,
    };
  }
  return { data: result as T };
}

type TwoFactorSnapshot = Readonly<{
  mfaEnrolled: number;
  twoFactorEnabled: number;
  mfaRequired: number;
  twoFactor: {
    id: string;
    secret: string;
    backupCodes: string;
    userId: string;
    verified: number;
    failedVerificationCount: number;
    lockedUntil: string | null;
  } | null;
}>;

function now(): string {
  return new Date().toISOString();
}

function snapshot(sqlite: Sqlite, userId: string): TwoFactorSnapshot {
  const row = sqlite
    .prepare(
      `SELECT u.mfa_enrolled,u.two_factor_enabled,u.mfa_required,
              tf.id tf_id,tf.secret tf_secret,tf.backup_codes tf_backup_codes,
              tf.user_id tf_user_id,tf.verified tf_verified,
              tf.failed_verification_count tf_failed_verification_count,
              tf.locked_until tf_locked_until
       FROM user u LEFT JOIN two_factor tf ON tf.user_id=u.id
       WHERE u.id=?`,
    )
    .get(userId) as
    | {
        mfa_enrolled: number;
        two_factor_enabled: number;
        mfa_required: number;
        tf_id?: string;
        tf_secret?: string;
        tf_backup_codes?: string;
        tf_user_id?: string;
        tf_verified?: number;
        tf_failed_verification_count?: number;
        tf_locked_until?: string | null;
      }
    | undefined;
  if (!row) throw new Error('MFA_USER_NOT_FOUND');
  return {
    mfaEnrolled: row.mfa_enrolled,
    twoFactorEnabled: row.two_factor_enabled,
    mfaRequired: row.mfa_required,
    twoFactor:
      row.tf_id && row.tf_secret !== undefined && row.tf_backup_codes !== undefined
        ? {
            id: row.tf_id,
            secret: row.tf_secret,
            backupCodes: row.tf_backup_codes,
            userId: row.tf_user_id ?? userId,
            verified: row.tf_verified ?? 0,
            failedVerificationCount: row.tf_failed_verification_count ?? 0,
            lockedUntil: row.tf_locked_until ?? null,
          }
        : null,
  };
}

/**
 * Restore Better Auth's two-factor projection after an audit failure. This is
 * intentionally a direct snapshot restore rather than a second setup call:
 * setup generates a new secret and recovery-code set and would silently alter
 * an already enrolled authenticator.
 */
function restoreSnapshot(userId: string, state: TwoFactorSnapshot): void {
  const database = createDatabase();
  try {
    const updatedAt = now();
    database.sqlite.exec('BEGIN IMMEDIATE');
    database.sqlite
      .prepare(
        'UPDATE user SET mfa_enrolled=?,two_factor_enabled=?,updated_at=?,version=version+1 WHERE id=?',
      )
      .run(state.mfaEnrolled, state.twoFactorEnabled, updatedAt, userId);
    database.sqlite.prepare('DELETE FROM two_factor WHERE user_id=?').run(userId);
    if (state.twoFactor) {
      database.sqlite
        .prepare(
          `INSERT INTO two_factor(
             id,secret,backup_codes,user_id,verified,failed_verification_count,locked_until
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          state.twoFactor.id,
          state.twoFactor.secret,
          state.twoFactor.backupCodes,
          state.twoFactor.userId,
          state.twoFactor.verified,
          state.twoFactor.failedVerificationCount,
          state.twoFactor.lockedUntil,
        );
    }
    database.sqlite.exec('COMMIT');
  } catch (error) {
    try {
      database.sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original error; the caller reports compensation failure.
    }
    throw error;
  } finally {
    database.sqlite.close();
  }
}

function commitProjectionAndAudit(
  userId: string,
  action: (typeof AUTH_AUDIT_ACTIONS)[keyof typeof AUTH_AUDIT_ACTIONS],
  details: Record<string, unknown>,
  updateProjection: (sqlite: Sqlite, updatedAt: string) => void,
): void {
  const database = createDatabase();
  try {
    database.sqlite.exec('BEGIN IMMEDIATE');
    updateProjection(database.sqlite, now());
    recordAuthAudit(
      {
        action: action.action,
        entityType: action.entityType,
        entityId: userId,
        userId,
        details,
      },
      database.sqlite,
    );
    database.sqlite.exec('COMMIT');
  } catch (error) {
    try {
      database.sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original audit/projection error.
    }
    throw error;
  } finally {
    database.sqlite.close();
  }
}

function compensateOrFail(userId: string, state: TwoFactorSnapshot, auditError: unknown): never {
  try {
    restoreSnapshot(userId, state);
  } catch (compensationError) {
    throw new AuthAuditFailure('MFA_AUDIT_COMPENSATION_FAILED', {
      auditError,
      compensationError,
    });
  }
  throw auditError;
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as MfaBody | null;
  const action = body?.action;
  const password = body?.password;
  const passwordValue = typeof password === 'string' ? password : undefined;
  const codeValue = typeof body?.code === 'string' ? body.code : undefined;
  if (action !== 'enable' && action !== 'verify' && action !== 'disable')
    return json({ error: 'A valid MFA action is required' }, { status: 400 });
  if (
    (action === 'enable' || action === 'disable') &&
    (!passwordValue || passwordValue.length < 12)
  )
    return json({ error: 'A valid password is required' }, { status: 400 });
  if (action === 'verify' && (!codeValue || !/^\d{6}$/.test(codeValue)))
    return json({ error: 'Enter the six-digit authenticator code' }, { status: 400 });

  const userId = locals.user.id;
  const sessionId = locals.session.id;
  const headers = request.headers;
  try {
    if (action === 'enable') {
      assertAuthAuditReady([AUTH_AUDIT_ACTIONS.mfaSetupStarted]);
      const before = (() => {
        const database = createDatabase();
        try {
          return snapshot(database.sqlite, userId);
        } finally {
          database.sqlite.close();
        }
      })();
      const result = await auth.api.enableTwoFactor(
        managedMfaCall({
          body: { password: passwordValue, method: 'totp', issuer: 'J&A Automation' },
          headers,
          returnHeaders: true,
        }),
      );
      const authResult = unwrapBetterAuthResult(result);
      try {
        recordAuthAudit({
          action: AUTH_AUDIT_ACTIONS.mfaSetupStarted.action,
          entityType: AUTH_AUDIT_ACTIONS.mfaSetupStarted.entityType,
          entityId: userId,
          userId,
          details: { method: 'totp', sessionId, outcome: 'setup_started' },
        });
      } catch (error) {
        compensateOrFail(userId, before, error);
      }
      return json(
        {
          enabled: false,
          requiresVerification: true,
          totpURI:
            'totpURI' in authResult.data
              ? (authResult.data as { totpURI?: string }).totpURI
              : undefined,
          backupCodes:
            'backupCodes' in authResult.data
              ? (authResult.data as { backupCodes?: string[] }).backupCodes
              : undefined,
        },
        authResult.headers ? { headers: authResult.headers } : undefined,
      );
    }

    if (action === 'verify') {
      assertAuthAuditReady([AUTH_AUDIT_ACTIONS.mfaEnable]);
      const before = (() => {
        const database = createDatabase();
        try {
          return snapshot(database.sqlite, userId);
        } finally {
          database.sqlite.close();
        }
      })();
      const verifyResult = await auth.api.verifyTOTP(
        managedMfaCall({
          body: { code: codeValue as string, trustDevice: false },
          headers,
          returnHeaders: true,
        }),
      );
      const authResult = unwrapBetterAuthResult(verifyResult);
      try {
        commitProjectionAndAudit(
          userId,
          AUTH_AUDIT_ACTIONS.mfaEnable,
          { method: 'totp', sessionId, verified: true, outcome: 'enabled' },
          (sqlite, updatedAt) => {
            const changed = sqlite
              .prepare('UPDATE user SET mfa_enrolled=1,updated_at=?,version=version+1 WHERE id=?')
              .run(updatedAt, userId);
            if (Number(changed.changes) !== 1) throw new Error('MFA_PROJECTION_UPDATE_FAILED');
          },
        );
      } catch (error) {
        compensateOrFail(userId, before, error);
      }
      return json(
        { enabled: true, verified: true },
        authResult.headers ? { headers: authResult.headers } : undefined,
      );
    }

    assertAuthAuditReady([AUTH_AUDIT_ACTIONS.mfaDisable]);
    const before = (() => {
      const database = createDatabase();
      try {
        return snapshot(database.sqlite, userId);
      } finally {
        database.sqlite.close();
      }
    })();
    if (before.mfaRequired === 1)
      return json({ error: 'Your organization requires MFA' }, { status: 403 });
    const disableResult = await auth.api.disableTwoFactor(
      managedMfaCall({ body: { password: passwordValue }, headers, returnHeaders: true }),
    );
    const authResult = unwrapBetterAuthResult(disableResult);
    try {
      commitProjectionAndAudit(
        userId,
        AUTH_AUDIT_ACTIONS.mfaDisable,
        { method: 'totp', sessionId, outcome: 'disabled' },
        (sqlite, updatedAt) => {
          const changed = sqlite
            .prepare('UPDATE user SET mfa_enrolled=0,updated_at=?,version=version+1 WHERE id=?')
            .run(updatedAt, userId);
          if (Number(changed.changes) !== 1) throw new Error('MFA_PROJECTION_UPDATE_FAILED');
        },
      );
    } catch (error) {
      compensateOrFail(userId, before, error);
    }
    return json(
      { enabled: false },
      authResult.headers ? { headers: authResult.headers } : undefined,
    );
  } catch (error) {
    const auditFailure = error instanceof AuthAuditFailure;
    console.error(
      JSON.stringify({
        event: 'security.mfa.change_failed',
        userId,
        action,
        error: auditFailure ? error.message : 'authentication or MFA operation rejected',
      }),
    );
    return json(
      {
        error: auditFailure
          ? 'MFA change could not be recorded safely; no change was applied'
          : 'MFA change was not accepted',
      },
      { status: auditFailure ? 503 : 401 },
    );
  }
};
