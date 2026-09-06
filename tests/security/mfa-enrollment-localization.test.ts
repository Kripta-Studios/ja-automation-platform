import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatMfaEnrollmentCopy,
  mfaEnrollmentCopy,
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
    expect(profile).toContain('{#if !data.user.mfaEnrolled}');
    expect(enrollment).toContain('data-testid="mfa-enable"');
    expect(enrollment).toContain('data-testid="mfa-sign-out"');
    expect(enrollment).toContain('data-testid="mfa-continue"');
  });
});
