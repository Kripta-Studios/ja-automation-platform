# Time correction withdrawal dependency: independent browser QA

Candidate: `9581660e4cc3eae99bc8cd03c6157391e1567575` (`98911ec4bd527765652f77e216a94000018bc85e`). These checks ran in an isolated worktree against a fresh disposable database. The test created a project, assignment, approved time entry, correction draft, and linked expense through the rendered app. It used database reads only to check record state and audit writes.

Run with:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/time-correction-withdraw-dependency-postfix-browser/playwright.config.ts --reporter=line
```

The 390 px English run passed. A separate 1440 px Spanish run passed after the test refilled the withdrawal reason immediately before native submission; locale hydration had cleared the earlier test fill in that run. The final evidence is in `results-phone-390.json` and `results-desktop.json`. The four screenshots crop only the warning or error notice. UUIDs are redacted in the JSON; browser traces are disabled.

Both runs confirmed:

- The Worker sees `TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE` as an advance warning after a second tab adds an expense. The warning explains the saved dependency, shows Draft status, removes the withdrawal form, and links to the authorized expense detail in the active locale.
- The Owner sees the same warning and can follow the expense link.
- The stale Worker tab receives the typed 409 action failure in both the SvelteKit JSON action response and native form response. The JSON failure includes the attempted reason and `review_linked_expense` remedy. The native page displays the entered reason, focuses the inline error notice, and keeps the notice in view. Neither response falls back to the generic conflict key.
- The correction remains Draft at version 1, with no new audit event; the linked expense remains associated with it. There were no page exceptions or console errors. The expected offline identity endpoint returned 503 in this disposable fixture.

The JSON action check is a browser `fetch` with SvelteKit's enhanced-form request headers, so it verifies the enhanced response contract rather than a rendered enhanced `use:enhance` interaction. The withdrawal form itself submits natively.
