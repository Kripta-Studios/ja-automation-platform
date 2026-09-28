# Owner Team authorization: independent browser check

Frozen product commit: `70838ac14b1f5f99ce94160607c75ae1199fe09b`. Playwright used a fresh disposable database and actual Chromium at 390 px English and 1440 px Spanish. The JSON evidence redacts record and correlation IDs; the screenshot is cropped to the Manager notice. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/owner-team-auth-final-browser/playwright.config.ts --reporter=line
```

Result: three passed, three viewport skips. The first test run stopped on an evidence harness error when trying to read the body of a native 303 redirect. The harness was corrected and the whole suite passed on the second run.

- Manager direct `setWorkforceProfile` JSON action returned `ACCESS_TEAM_OWNER_REQUIRED`, status 403, and `contact_owner`. Native 403 showed the Spanish contact-Owner instruction in a visible, keyboard-focused Team `ProblemNotice`; it did not expose Owner settings or change profile, user, or audit counts. `contact_owner` is an instruction, so the notice has no linked destination.
- Signed-out `updateUserStatus` and invalid `createLocalPortalUser` JSON actions both returned `ACCESS_TEAM_SESSION_REQUIRED`, status 401, and `sign_in_again`; authorization took precedence over invalid form fields. Native signed-out status submission redirected with 303 to the sign-in page. The login form was visible, but the attempted status values were not presented there. No profile, user, or audit write occurred.
- Owner Spanish native External technician submission with blank Supplier returned 400, kept `lang=es` and `worker=` in the URL, retained the open editor and attempted profile, and focused the Spanish field summary. No profile, user, or audit write occurred.
- All three cases had no browser page exceptions or console errors. The disposable fixture may show its separate offline identity service response.

The separate stale account-deactivation path was still being patched after this frozen candidate and is outside this check.
