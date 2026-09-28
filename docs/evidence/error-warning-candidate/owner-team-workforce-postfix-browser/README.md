# Owner Team workforce profile: diagnostic browser run

Candidate: `a938eb3a84639d444d0fc3b68592969261edc9b2`. This independent run used a separate worktree and fresh disposable database. It is diagnostic evidence for this commit; it is not release sign-off. The target was a seeded disposable Worker account. JSON files redact record IDs, screenshots crop notices or notifications, and browser traces were disabled.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/owner-team-workforce-postfix-browser/playwright.config.ts --reporter=line
```

The 390 px English and 1440 px Spanish Owner tests failed the strict notice visibility assertion, while the absent-person and Manager checks passed (four viewport skips). The results files were written before assertions and contain the actual state.

- Choosing External technician with Supplier blank immediately made Supplier required. Browser validation blocked the ordinary click, focused the select, and showed an adjacent localized error and advance cue.
- Browser JSON action requests returned `ACCESS_WORKFORCE_SUPPLIER_REQUIRED` with `supplierId` field error, `review_supplier_profile` remedy, and the attempted worker/profile/Supplier values. Native bypass submissions returned HTML 400 with the same typed code and translated field error. The editor reopened with External technician and blank Supplier, and the Specialists tab stayed selected. Supplier profile and audit counts were unchanged; no page or console errors appeared.
- The native action URL dropped the `worker` query. The top Team notice was outside the viewport after the form restored focus to a visible validation summary beside the Supplier field. On phone, the focused summary was at 367–478 px within an 844 px viewport; on desktop, 415–485 px within 900 px. The strict notice assertion failed first; the URL retention assertion would also fail against the recorded URL. The adjacent field guidance remained visible and the remedy link on the notice contained the worker query.
- A syntactically valid absent-person status request returned `ACCESS_STATUS_PERSON_UNAVAILABLE` in both browser JSON and native responses. The Spanish native notice was focused and visible with a Team directory remedy. The existing Worker status/version and total audit count did not change.
- A Project Manager's direct profile POST returned 403 before revealing worker or Supplier details and did not write a profile or audit event. This commit still returned the generic `ACTION_ERROR_FORBIDDEN` code for that role; a follow-up authorization patch is pending.

The disposable fixture emitted its expected offline sync toast and offline identity 503 responses. These were separate from the tested action responses.
