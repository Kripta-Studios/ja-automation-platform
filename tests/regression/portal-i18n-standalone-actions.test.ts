import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccessDeniedError, ValidationError, V3AccessDeniedError } from '@ja/database';
import {
  actionFail,
  actionFailure,
  actionSuccess,
} from '../../apps/portal/src/lib/server/actions/action-message';

const actionRoot = resolve(process.cwd(), 'apps/portal/src/lib/server/actions');
const actionFiles = readdirSync(actionRoot)
  .filter((file) => file.endsWith('-actions.ts'))
  .sort();

describe('localized portal action contracts', () => {
  it('returns typed params and does not expose raw repository exception text', () => {
    expect(actionSuccess('action.test.saved', { count: 2 }, 'Saved')).toEqual({
      success: true,
      messageKey: 'action.test.saved',
      messageParams: { count: 2 },
      message: 'Saved',
    });
    const invalid = actionFail(400, 'action.validation.test', { field: 'email' }, 'Invalid');
    expect(invalid.data).toMatchObject({
      success: false,
      messageKey: 'action.validation.test',
      messageParams: { field: 'email' },
      message: 'Invalid',
    });

    const failure = actionFailure(new ValidationError('SQLITE_CONSTRAINT: internal detail'));
    expect(failure.data).toMatchObject({
      messageKey: 'action.error.invalid',
      messageParams: {},
      message: 'Check the submitted values and try again.',
    });
    expect(failure.data?.message).not.toContain('SQLITE_CONSTRAINT');

    expect(actionFailure(new Error('private storage key leaked'))).toMatchObject({
      status: 500,
      data: {
        messageKey: 'action.error.unavailable',
        messageParams: {},
      },
    });
    expect(actionFailure(new AccessDeniedError('Sign in required'))).toMatchObject({
      status: 401,
      data: {
        messageKey: 'action.error.unauthenticated',
        message: 'Sign in again to continue.',
      },
    });
    expect(
      actionFailure(new V3AccessDeniedError('Recent step-up authentication is required')),
    ).toMatchObject({
      status: 403,
      data: {
        messageKey: 'action.error.stepUpRequired',
        message: 'Confirm your identity to continue.',
        stepUpRequired: true,
      },
    });
  });

  it('routes repository failures through the message-key sanitizer', () => {
    for (const file of actionFiles) {
      const source = readFileSync(resolve(actionRoot, file), 'utf8');
      expect(source, `${file} must import the localized failure adapter`).toContain(
        "from './action-message'",
      );
      expect(source, `${file} must not import the raw failure adapter`).not.toMatch(
        /import \{[^}]*\bactionFailure\b[^}]*\} from '\$lib\/server\/portal-repository'/,
      );
    }
  });

  it('gives every explicit success and failure response a stable key and params object', () => {
    for (const file of actionFiles) {
      const source = readFileSync(resolve(actionRoot, file), 'utf8');
      const explicitResponses = source.match(/\baction(?:Success|Fail)\(/g) ?? [];
      const keyedResponses = source.match(/\baction(?:Success|Fail)\(/g) ?? [];
      expect(
        keyedResponses.length,
        `${file} should expose messageKey for each explicit response (${explicitResponses.length})`,
      ).toBeGreaterThanOrEqual(explicitResponses.length);
      expect(source, `${file} should use the typed action helpers`).toContain('actionSuccess');
    }
  });

  it('keeps invitation writes from crashing the portal when the session is missing', () => {
    const source = readFileSync(resolve(actionRoot, 'access-actions.ts'), 'utf8');
    expect(source).toContain('openAccessContext');
    expect(source).toContain('confirmProtectedActionIdentity');
    expect(source).not.toContain('confirmStepUpPassword');
    expect(source).toMatch(/openPortalRepository\(locals\)/);
    expect(source).toContain('return { failure: actionFailure(error) }');
  });

  it('lets a logged-in owner complete team access writes without a second identity prompt', () => {
    const source = readFileSync(resolve(actionRoot, 'access-actions.ts'), 'utf8');
    expect(source).toContain("event.locals.user.role !== 'owner_admin'");
    expect(source).toMatch(
      /updateWorkerProfile:[\s\S]*identityScope: 'workerProfile'[\s\S]*confirmProtectedActionIdentity/,
    );
    expect(source).toMatch(
      /updateUserStatus:[\s\S]*identityScope: 'userStatus'[\s\S]*confirmProtectedActionIdentity/,
    );
    expect(source).not.toMatch(
      /parsedId\.success \|\| !name \|\| !email \|\| !role \|\| !joinedAt/,
    );
  });

  it('keeps dynamic feedback in typed params instead of interpolating user-visible copy', () => {
    const dynamicFiles = [
      'access-actions.ts',
      'billing-actions.ts',
      'finance-actions.ts',
      'operations-actions.ts',
      'project-actions.ts',
      'time-actions.ts',
    ];
    for (const file of dynamicFiles) {
      const source = readFileSync(resolve(actionRoot, file), 'utf8');
      expect(source, `${file} should use messageParams for dynamic feedback`).toMatch(
        /actionSuccess\([\s\S]*\{[^}]+\}/,
      );
    }
  });
});
