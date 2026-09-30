import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { generateManagedMfaSetup } from '$lib/server/managed-mfa-setup';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';
import {
  assertAuthAuditReady,
  AUTH_AUDIT_ACTIONS,
  AuthAuditFailure,
  MANAGED_MFA_AUTH_CALL,
  recordAuthAudit,
} from '$lib/server/auth-audit';

type MfaBody = { action?: unknown; code?: unknown };
type Sqlite = ReturnType<typeof createDatabase>['sqlite'];

type MfaProblem = Readonly<{
  status: number;
  code: string;
  messageKey: `problem.mfa.${string}`;
  remedies: readonly { id: string }[];
  fieldErrors?: Record<string, string[]>;
  reference?: boolean;
}>;

const problems = {
  signIn: {
    status: 401,
    code: 'MFA_SIGN_IN_REQUIRED',
    messageKey: 'problem.mfa.signInRequired',
    remedies: [{ id: 'sign_in_again' }],
  },
  invalidAction: {
    status: 400,
    code: 'MFA_ACTION_INVALID',
    messageKey: 'problem.mfa.actionInvalid',
    remedies: [{ id: 'review_mfa_settings' }],
  },
  invalidCode: {
    status: 400,
    code: 'MFA_CODE_INVALID',
    messageKey: 'problem.mfa.codeInvalid',
    fieldErrors: { code: ['problem.mfa.codeInvalid'] },
    remedies: [{ id: 'review_mfa_code' }],
  },
  alreadyEnrolled: {
    status: 409,
    code: 'MFA_ALREADY_ENROLLED',
    messageKey: 'problem.mfa.alreadyEnrolled',
    remedies: [{ id: 'review_mfa_status' }],
  },
  verificationRejected: {
    status: 400,
    code: 'MFA_VERIFICATION_REJECTED',
    messageKey: 'problem.mfa.verificationRejected',
    fieldErrors: { code: ['problem.mfa.verificationRejected'] },
    remedies: [{ id: 'review_mfa_code' }],
  },
  requestRejected: {
    status: 400,
    code: 'MFA_REQUEST_REJECTED',
    messageKey: 'problem.mfa.requestRejected',
    remedies: [{ id: 'review_mfa_settings' }],
  },
  conflict: {
    status: 409,
    code: 'MFA_CHANGE_CONFLICT',
    messageKey: 'problem.mfa.changeConflict',
    remedies: [{ id: 'review_mfa_status' }],
  },
  forbidden: {
    status: 403,
    code: 'MFA_CHANGE_NOT_PERMITTED',
    messageKey: 'problem.mfa.changeNotPermitted',
    remedies: [{ id: 'contact_owner' }],
  },
  auditUnavailable: {
    status: 503,
    code: 'MFA_AUDIT_UNAVAILABLE',
    messageKey: 'problem.mfa.auditUnavailable',
    remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
  },
  stateUncertain: {
    status: 503,
    code: 'MFA_CHANGE_STATE_UNCERTAIN',
    messageKey: 'problem.mfa.changeStateUncertain',
    remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
    reference: true,
  },
  unavailable: {
    status: 500,
    code: 'MFA_CHANGE_UNAVAILABLE',
    messageKey: 'problem.mfa.changeUnavailable',
    remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
    reference: true,
  },
} as const satisfies Record<string, MfaProblem>;

function mfaProblem(problem: MfaProblem, correlationId?: string) {
  const reference = correlationId || randomUUID();
  return json(
    {
      success: false,
      code: problem.code,
      messageKey: problem.messageKey,
      params: problem.reference ? { correlationId: reference } : {},
      fieldErrors: problem.fieldErrors ?? {},
      remedies: problem.remedies,
      correlationId: reference,
      error: englishCoverageKey(problem.messageKey),
    },
    { status: problem.status, headers: { 'cache-control': 'private, no-store' } },
  );
}

function rejectedStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = candidate.statusCode ?? candidate.status;
  if (typeof status === 'number') return status;
  if (status === 'BAD_REQUEST') return 400;
  if (status === 'UNAUTHORIZED') return 401;
  if (status === 'FORBIDDEN') return 403;
  if (status === 'CONFLICT') return 409;
  return undefined;
}

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

function privateMfaHeaders(headers?: Headers): Headers {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set('cache-control', 'private, no-store');
  return responseHeaders;
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
  if (!locals.user || !locals.session) return mfaProblem(problems.signIn, locals.correlationId);
  const body = (await request.json().catch(() => null)) as MfaBody | null;
  const action = body?.action;
  const codeValue = typeof body?.code === 'string' ? body.code : undefined;
  if (action !== 'enable' && action !== 'verify' && action !== 'disable')
    return mfaProblem(problems.invalidAction, locals.correlationId);
  if (action === 'verify' && (!codeValue || !/^\d{6}$/.test(codeValue)))
    return mfaProblem(problems.invalidCode, locals.correlationId);

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
      // A verified factor is not safely rotatable through setup. Keep the
      // existing recovery material intact; unfinished setup remains retryable
      // because its factor has not been verified/enrolled yet.
      if (before.mfaEnrolled || before.twoFactor?.verified)
        return mfaProblem(problems.alreadyEnrolled, locals.correlationId);
      const authContext = await auth.$context;
      const setup = await generateManagedMfaSetup(authContext.secretConfig, locals.user.email);
      // Managed account settings intentionally authorize setup with the live
      // session. Better Auth's public enable endpoint also requires a password
      // for credential accounts, even with allowPasswordless, so it cannot
      // implement the account holder's optional MFA policy.
      commitProjectionAndAudit(
        userId,
        AUTH_AUDIT_ACTIONS.mfaSetupStarted,
        { method: 'totp', sessionId, outcome: 'setup_started' },
        (sqlite, updatedAt) => {
          const current = sqlite
            .prepare(
              `SELECT u.email,u.mfa_enrolled,tf.id,tf.verified
               FROM user u LEFT JOIN two_factor tf ON tf.user_id=u.id
               WHERE u.id=? AND u.status='active'
                 AND EXISTS(SELECT 1 FROM session s WHERE s.id=? AND s.user_id=u.id AND s.expires_at>?)`,
            )
            .get(userId, sessionId, updatedAt) as
            | { email: string; mfa_enrolled: number; id: string | null; verified: number | null }
            | undefined;
          if (!current) throw Object.assign(new Error('MFA_SESSION_EXPIRED'), { statusCode: 401 });
          if (current.mfa_enrolled || current.verified)
            throw Object.assign(new Error('MFA_ALREADY_ENROLLED'), { statusCode: 409 });
          if (current.email !== locals.user?.email)
            throw Object.assign(new Error('MFA_ACCOUNT_CHANGED'), { statusCode: 409 });
          let changed: number | bigint;
          if (current.id)
            changed = sqlite
              .prepare(
                `UPDATE two_factor SET secret=?,backup_codes=?,verified=0,
                   failed_verification_count=0,locked_until=NULL WHERE id=? AND user_id=? AND verified=0`,
              )
              .run(setup.encryptedSecret, setup.encryptedBackupCodes, current.id, userId).changes;
          else
            changed = sqlite
              .prepare(
                `INSERT INTO two_factor(id,secret,backup_codes,user_id,verified,failed_verification_count,locked_until)
                 VALUES(?,?,?,?,0,0,NULL)`,
              )
              .run(randomUUID(), setup.encryptedSecret, setup.encryptedBackupCodes, userId).changes;
          if (Number(changed) !== 1) throw new Error('MFA_SETUP_UPDATE_FAILED');
        },
      );
      return json(
        {
          enabled: false,
          requiresVerification: true,
          totpURI: setup.totpURI,
          backupCodes: setup.backupCodes,
        },
        { headers: privateMfaHeaders() },
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
        { headers: privateMfaHeaders(authResult.headers) },
      );
    }

    assertAuthAuditReady([AUTH_AUDIT_ACTIONS.mfaDisable]);
    commitProjectionAndAudit(
      userId,
      AUTH_AUDIT_ACTIONS.mfaDisable,
      { method: 'totp', sessionId, outcome: 'disabled' },
      (sqlite, updatedAt) => {
        sqlite.prepare('DELETE FROM two_factor WHERE user_id=?').run(userId);
        const changed = sqlite
          .prepare(
            `UPDATE user
                SET two_factor_enabled=0,mfa_enrolled=0,mfa_required=0,
                    updated_at=?,version=version+1
              WHERE id=?`,
          )
          .run(updatedAt, userId);
        if (Number(changed.changes) !== 1) throw new Error('MFA_PROJECTION_UPDATE_FAILED');
      },
    );
    return json({ enabled: false }, { headers: privateMfaHeaders() });
  } catch (error) {
    const status = rejectedStatus(error);
    const problem =
      error instanceof AuthAuditFailure
        ? error.message === 'MFA_AUDIT_COMPENSATION_FAILED'
          ? problems.stateUncertain
          : problems.auditUnavailable
        : status === 401
          ? problems.signIn
          : status === 403
            ? problems.forbidden
            : status === 409
              ? problems.conflict
              : status === 400
                ? action === 'verify'
                  ? problems.verificationRejected
                  : problems.requestRejected
                : problems.unavailable;
    const correlationId = locals.correlationId || randomUUID();
    // Auth failures can carry submitted codes or generated secrets in their
    // message/cause. Log only stable, non-sensitive diagnostics.
    console.error('MFA change failed', {
      correlationId,
      userId,
      action,
      code: problem.code,
      status: problem.status,
    });
    return mfaProblem(problem, correlationId);
  }
};
