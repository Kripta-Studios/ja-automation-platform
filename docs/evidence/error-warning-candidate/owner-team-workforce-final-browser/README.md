# Owner Team workforce profile: independent browser QA

Frozen candidate: `f17cd4fdf28f862185f9359958c6d6e735d51ff1`. Playwright ran from a separate worktree against a fresh disposable database. The target was a seeded disposable Worker account. JSON results redact record IDs, screenshots crop notices or notifications, and traces were disabled. This is diagnostic evidence for this exact commit; a later Manager display fix is pending.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/owner-team-workforce-final-browser/playwright.config.ts --reporter=line
```

Result: four passed and four viewport skips. Owner was checked at 390 px English and 1440 px Spanish; the absent-person and Manager cases ran at 1440 px Spanish.

- On the rendered External technician form, Supplier became required and the advance cue explained why. An ordinary blank-Supplier click stayed on the form, focused Supplier, and showed a localized field error. Browser JSON and native bypass submissions returned `ACCESS_WORKFORCE_SUPPLIER_REQUIRED` with the Supplier field error and Review supplier profile remedy. The attempted worker/profile/Supplier values, open editor, Specialists tab, and `worker=` query survived native failure. The focused validation summary was visible at 367–478 px on the phone and 493–563 px on desktop, with the translated Supplier field error beside the control. The top Team notice remained above the viewport, which is acceptable here because the single-field guidance is visible. Supplier profile and audit counts did not change.
- A syntactically valid absent-person status request returned `ACCESS_STATUS_PERSON_UNAVAILABLE` in browser JSON and native responses. The Spanish native notice was focused and visible, linked to the Team directory, and did not change the existing Worker status/version or total audit count.
- A Manager direct POST returned `ACCESS_TEAM_OWNER_REQUIRED` with `contact_owner` in its JSON response and no write. On native reload, the translated contact-Owner sentence appeared only as a toast. The Team ProblemNotice was absent and focus stayed on the page body because the Team management view was hidden for Manager. This is the remaining display gap at this commit.
- No page exceptions or console errors occurred. The disposable fixture showed its separate offline sync toast and expected offline identity 503 responses. The native form action kept `worker=` but dropped the explicit `lang=es` query; displayed wording remained Spanish through the selected locale.
