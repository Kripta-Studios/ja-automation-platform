import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatMfaEnrollmentCopy,
  mfaEnrollmentCopy,
  mfaProblemFromResponse,
  mfaProblemIsService,
  mfaUncertainProblem,
} from '../../apps/portal/src/routes/app/mfa-enrollment/mfa-enrollment-copy.js';

describe('optional MFA enrollment localization', () => {
  it.each(['en', 'es', 'pt'] as const)(
    'provides complete %s standalone enrollment copy',
    (locale) => {
      const copy = mfaEnrollmentCopy[locale];
      expect(copy.heading).not.toHaveLength(0);
      expect(copy.recoveryWarning).not.toHaveLength(0);
      expect(copy.signOut).not.toHaveLength(0);
      expect(copy.continueWithout).not.toHaveLength(0);
      expect(copy.disableWarning).not.toHaveLength(0);
      expect(copy.reviewMfaStatus).not.toHaveLength(0);
      expect(copy.retry).not.toMatch(/password|contraseña|senha/iu);
      expect(copy.intro).toContain('{name}');
      expect(formatMfaEnrollmentCopy(copy.intro, 'Alex')).toContain('Alex');
    },
  );

  it('keeps browser MFA controls behind enrollment state without a twelve-character gate', () => {
    const enrollment = readFileSync(
      'apps/portal/src/routes/app/mfa-enrollment/+page.svelte',
      'utf8',
    );
    const profile = readFileSync('apps/portal/src/lib/PortalShell.svelte', 'utf8');
    expect(enrollment).not.toContain('minlength="12"');
    expect(enrollment).not.toContain('name="password"');
    expect(profile).not.toContain('minlength="12"');
    expect(profile).not.toContain('name="password"');
    expect(profile).toContain('{#if !mfaEnrolled && !mfaSetupUri}');
    expect(enrollment).toContain('data-testid="mfa-enable"');
    expect(enrollment).toContain('data-testid="mfa-sign-out"');
    expect(enrollment).toContain('data-testid="mfa-continue"');
  });

  it('keeps a typed MFA failure and its safe recovery metadata', () => {
    const problem = mfaProblemFromResponse({
      success: false,
      code: 'MFA_CODE_INVALID',
      messageKey: 'problem.mfa.codeInvalid',
      params: {},
      fieldErrors: { code: ['problem.mfa.codeInvalid'] },
      remedies: [{ id: 'review_mfa_code' }],
      correlationId: 'test-reference',
      error: 'Internal diagnostics are not for display',
    });
    expect(problem).toMatchObject({
      code: 'MFA_CODE_INVALID',
      messageKey: 'problem.mfa.codeInvalid',
      remedies: [{ id: 'review_mfa_code' }],
      correlationId: 'test-reference',
    });
    expect(problem).not.toHaveProperty('error');
    expect(
      mfaProblemFromResponse({ code: 'UNEXPECTED_ERROR', messageKey: 'problem.mfa.foo' }),
    ).toBeNull();
  });

  it('treats a lost response as uncertain and does not suggest an immediate retry', () => {
    const problem = mfaUncertainProblem();
    expect(problem.code).toBe('MFA_NETWORK_OUTCOME_UNKNOWN');
    expect(problem.remedies.map((remedy) => remedy.id)).toEqual([
      'review_mfa_status',
      'contact_owner',
    ]);
    expect(mfaProblemIsService(problem)).toBe(true);
  });
});
