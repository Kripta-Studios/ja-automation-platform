# Assignment error and warning browser QA

Date: 2026-09-25. Disposable Playwright database; Chromium at 390×844 and 1440×900.

## Candidate identity

- Git HEAD: `2fa2cb61220294fa742273300d829fdedcf54df3`.
- SHA-256 of the ordered `sha256sum` output for the six assignment implementation files below at the targeted capture: `d19761eee778719ca9d75027c7cc00c0a93fff23d70fab548c2c1d901ccbc524`.
- Files in that digest: `PortalShell.svelte`, `ProjectSection.svelte`, `ProblemNotice.svelte`, `action-message.ts`, `project-actions.ts`, `workforce-repository.ts` at their paths in the repository. This is a content identity for an uncommitted shared worktree, not a commit. The translation catalog was being edited concurrently and is excluded.
- QA spec: `tests/e2e/error-warning-assignment.spec.ts` (SHA-256 `a687d7424a1a8840fc4ecdc4482cd829457755e1a9ad707852e11e175ef32871` at targeted capture). Artifact hashes are in `SHA256SUMS.txt`.

## Browser result

The final matrix completed with **7 passed, 1 skipped** in 1.6 minutes. The skipped entry is the desktop copy of the locale check; Spanish and Portuguese were tested at 390 px. The command used `--trace=off` so authentication requests are not stored in a raw browser trace. Prettier and ESLint passed for the QA spec.

A bounded artifact capture then passed **2 tests, 2 intentional skips**: owner at 390 px and project manager at 1440 px. `owner-phone-390-status-race.png` and `manager-desktop-status-race.png` mask the worker selection. Matching `*-trace.json` files record only state transitions, HTTP/action statuses, retained-value assertions, focus element, and scroll coordinate. `*-service-responses.json` files contain status and URL path only; query strings and authentication material are excluded. `run-summary.txt` and `targeted-run-summary.txt` retain the two test result summaries.

## Redacted action trace

For both owner and project manager at both widths, the browser reached these steps:

1. A valid assignment created one database row and showed a confirmation.
2. A missing required start date showed an adjacent field error, retained the worker and end date, and sent no action request.
3. Direct links to Closing and Closed kept the selected project visible as a disabled option, showed the lifecycle explanation and current status, disabled submission, and showed the role-specific remedy.
4. After changing an open project's status in the disposable database, native submission returned HTTP 409, showed `PROJECT_ASSIGNMENT_BLOCKED_STATUS`, retained project, worker, and dates, and created no assignment. Focus after the later focus fix passed the non-body assertion.
5. The enhanced request returned HTTP 200 with SvelteKit JSON `{type:"failure",status:409}` and serialized code, message key, current status, and role-specific remedy.
6. Worker access checks at both widths returned enhanced action status 403, exposed no owner-only remedy, and created no assignment.

The only captured 5xx path in both role journeys is **`503 /j-aautomation/app/api/offline/identity`**. It is unrelated to `assignWorker`; the disposable fixture sets `JA_OFFLINE_ENABLED=false`. Chromium also logs the expected native 409 resource response. No JavaScript page exception or other console error failed the final run. The owner phone screenshot shows an unrelated “Sync failed” notification overlapping part of the form; this should be tracked with the offline UI, while the assignment blocker and owner remedy remain visible.

## Repeat command

For a later evidence capture, run:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH \
JA_PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
JA_ASSIGNMENT_QA_PERSIST_EVIDENCE=1 \
pnpm exec playwright test tests/e2e/error-warning-assignment.spec.ts \
  --project=phone-390 --project=desktop \
  --grep='assignment form explains status' --reporter=line --trace=off
```

Update the candidate hashes if implementation changes. The locale check already passed for both roles at 390 px: it asserted translated cause and remedy with no raw `problem.*` key or placeholder.
