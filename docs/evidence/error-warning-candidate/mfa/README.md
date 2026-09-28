# MFA browser recovery evidence

`tests/e2e/error-warning-mfa-recovery.spec.ts` contains 16 active scenarios at
390 px and 1440 px: Owner and Worker each exercise a real typed 400 MFA field
response, plus English, Spanish, and Portuguese service guidance and the
pre-disable consequence warning. The service response is intercepted as a
deterministic 503; its code, wording, focus, remedy, disabled retry, scroll,
and network response are asserted in the browser. The disable warning uses a
synthetic successful setup response to exercise the UI without enrolling or
disabling a real account.

The tests run only against Playwright's disposable database and local preview.
The spec turns off automatic traces, screenshots, and videos because the setup
view displays an authenticator URI and one-time recovery codes. It writes only
cropped problem-notice screenshots and redacted JSON summaries after the 503.
No setup URI, recovery code, credential, cookie, or full auth payload belongs
in this evidence directory.

The exact candidate browser run passed **16/16 active cases** on 2026-09-26
at 390 px and 1440 px (16 cross-project cases intentionally skipped):

```sh
pnpm exec playwright test tests/e2e/error-warning-mfa-recovery.spec.ts --project=phone-390 --project=desktop --reporter=line
```

The 12 PNG files are notice-only crops for the uncertain-state cases; the 12
JSON files contain role, locale, viewport, typed status/code, focus/review-link
assertions, and scroll delta. The six phone crops were inspected at original
resolution after waiting for fixture-toast removal and animation frames; all
notices are readable and clear of fixed navigation. No raw browser trace or
one-time MFA setup material is staged.
