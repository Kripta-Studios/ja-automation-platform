# Owner Team workforce profile: pre-fix browser baseline

Release candidate: `6a08b733c270bafacf1c23fe97f1c8ba8af5221c`. Independent Playwright runs used this exact commit and a fresh disposable database. The target was a seeded disposable Worker account. Browser traces were disabled; JSON results redact record IDs, and screenshots crop only the notification region.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/owner-team-missing-supplier-baseline-browser/playwright.config.ts --reporter=line
```

The main run passed at 390 px English and 1440 px Spanish, with two viewport skips. A separate desktop run passed the optional absent-person status probe. In the Team editor, Owner selected External technician and left Supplier blank. A browser JSON action request returned failure status 400 with `ACTION_ERROR_INVALID`, `action.error.invalid`, no field errors, and no remedies. Native submission returned HTML 400 and showed only the generic toast: “Check the submitted values and try again” in English, “Los datos no son válidos” in Spanish. No inline notice or Supplier guidance appeared.

After the native response, the editor closed, the attempted profile and Supplier selection were unavailable, the `worker` query was lost, scroll returned to 0, and focus was on the page body. The selected Specialists tab remained. Supplier profile and user audit counts did not change. The fixture also displayed a separate offline sync toast unrelated to this submission. No browser page exceptions or console errors occurred.

The optional browser request used a syntactically valid UUID absent from the disposable database in the rendered `updateUserStatus` form. Its JSON action failure also returned `ACTION_ERROR_INVALID` with no field errors or remedies. The existing Worker status/version and total audit count did not change.
