import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moneyText, type MoneyCopyKey } from '../../apps/portal/src/lib/portal/money-copy';
import { AccessDeniedError, ValidationError, V3AccessDeniedError } from '@ja/database';
import {
  actionFail,
  actionFailure,
  actionSuccess,
} from '../../apps/portal/src/lib/server/actions/action-message';

const actionRoot = resolve(process.cwd(), 'apps/portal/src/lib/server/actions');
const actionFiles = readdirSync(actionRoot)
  .filter((file) => file.endsWith('-actions.ts') && file !== 'rates-actions.ts')
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
        messageKey: 'problem.error.unexpected',
        messageParams: { correlationId: expect.any(String) },
      },
    });
    expect(actionFailure(new AccessDeniedError('Sign in required'))).toMatchObject({
      status: 401,
      data: {
        messageKey: 'action.error.unauthenticated',
        message: 'Sign in again to continue.',
      },
    });
    expect(actionFailure(new V3AccessDeniedError('Forbidden'))).toMatchObject({
      status: 403,
      data: {
        messageKey: 'action.error.forbidden',
        message: 'You do not have permission to perform this action.',
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

  it('uses a stable message key in typed success responses', () => {
    for (const file of actionFiles) {
      const source = readFileSync(resolve(actionRoot, file), 'utf8');
      expect(source, `${file} should use the typed action helpers`).toMatch(
        /\bactionSuccess\(\s*'action\.[^']+'/u,
      );
    }
  });

  it('keeps rate responses keyed by outcome and localizes the known failure codes', () => {
    const source = readFileSync(resolve(actionRoot, 'rates-actions.ts'), 'utf8');
    expect(source).toContain("rateSave: { kind, code: 'saved', changed: result.changed, values }");
    expect(source).toContain('rateSave: { kind, code, values }');
    expect(source).not.toMatch(/rateSave:.*(?:error\.message|message:)/u);

    const panel = readFileSync(
      resolve(actionRoot, '../../portal/sections/RatesPanel.svelte'),
      'utf8',
    );
    expect(panel).toContain("save ? `err_${save.code}` : 'err_failed'");
    for (const code of ['failed', 'forbidden', 'same_day'] as const) {
      const key: MoneyCopyKey = `err_${code}`;
      const english = moneyText('en', key);
      expect(moneyText('es', key)).not.toBe(english);
      expect(moneyText('pt', key)).not.toBe(english);
    }
  });

  it('keeps invitation writes from crashing the portal when the session is missing', () => {
    const source = readFileSync(resolve(actionRoot, 'access-actions.ts'), 'utf8');
    expect(source).toContain('openAccessContext');
    expect(source).not.toContain('confirmProtectedActionIdentity');
    expect(source).not.toContain('step-up');
    expect(source).toMatch(/openPortalRepository\(locals\)/);
    expect(source).toContain(
      'directoryFailure(error, directoryAction, values, locals.correlationId)',
    );
    expect(source).toContain(': actionFailure(error)');
  });

  it('lets a logged-in owner complete team access writes without a second identity prompt', () => {
    const source = readFileSync(resolve(actionRoot, 'access-actions.ts'), 'utf8');
    expect(source).toContain("event.locals.user.role !== 'owner_admin'");
    expect(source).toMatch(/updateWorkerProfile:[\s\S]*repository\.updateWorkerProfile/);
    expect(source).toMatch(/updateUserStatus:[\s\S]*repository\.updateUserStatus/);
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
