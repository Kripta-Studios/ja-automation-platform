# Independent integration review

Date: 2026-09-22. Verdict: **SHIP after the running browser matrix passes**.

This read-only review covered changes owned by the parent and other implementers:
operational submission handling, Expense/Report wiring, ResponsiveSheet, the notification
inbox, ProjectSection filters and empty states, Today agenda, Shell integration, and regression
assertion updates. The reviewer implemented navigation helpers and PortalChrome, so those
components require the other reviewers' independent coverage; this document does not claim
independent review of its author's implementation.

## Findings

No concrete functional regression or change requiring redesign was found in the reviewed scope.

- Submission freezing occurs after SvelteKit constructs FormData. This ordering was checked
  against the installed `@sveltejs/kit/src/runtime/app/forms.js`, not assumed. Prior disabled
  states are restored on failure and in `finally`; validation runs after restoration, so file
  inputs remain mounted and visible invalid fields remain actionable.
- Expense/Report offline handling checks `data.offlineEnabled !== false`; disabled offline
  storage now produces explicit reconnect feedback instead of silently suppressing submission.
- Confirmed save and refresh failure are distinguished. `savedForm` prevents a second submit
  of the same successful form when refreshing the register fails. Ambiguous network failures
  instruct the user to check the register before retrying.
- Shared-sheet protection checks dirty values, checkbox/radio state and file metadata. Close,
  Cancel, Escape, internal navigation and unload share the guard; busy forms cannot be closed.
  The updated browser test now includes browser Back and native beforeunload cancellation,
  addressing the earlier evidence gap. Successful saves close directly through their existing
  success callback; reset events establish a fresh comparison baseline.
- ProjectSection keeps one search/status authority, retains RecordBrowser sorting/pagination,
  and renders the no-results message outside TableRegion so mobile cards cannot hide it.
- Notification counts explicitly cover the latest 50 authorized records. Mark-read uses the
  existing user-scoped repository action and only updates the visible state after success.
  Read-only auditor access to personal read state is supported by the existing repository.
- Today uses the same UTC convention as planning controls and the existing calendar. Worker
  records and project targets still come from the existing authorized projections; no actual
  work time or financial state is inferred from planning.
- The ReportSection regression assertions match the implementation already present at HEAD:
  dynamic `statusOptions` includes `attention`, and both signoff/generated rows use
  `$derived.by`. The keyboard test now checks the single SectionNavigator shortcut owner.
  No security assertion was removed or relaxed.
- The literal catalog inventory includes the added operational messages; allowing the
  invariant `UTC` abbreviation in visible-text coverage does not allow untranslated prose.

## Evidence and release conditions

- `git diff --check` passed during this review.
- The reviewer previously ran the scoped navigation/i18n units: 47 passed, and portal typecheck
  exited successfully. These are earlier checks, not a substitute for the final integrated run.
- No new test process was launched for this final review. The parent's
  `/tmp/ja-ux-browser-matrix.log` showed the 92-test matrix progressing through phone-360
  workflows without a reported failure at review time. Final matrix results remain the
  parent's release gate and must be recorded separately.
- Five screenshots under the historical `workspace-ux-20260922/after` directory were modified
  by existing browser tests. Preserve the previous evidence and place new screenshots under
  this release's directory before packaging; the parent was notified.

No migrations, production database writes, financial-rule changes, or authorization changes
were introduced by the reviewed UX implementation. Production preservation and health checks
remain necessary after deployment and are outside this source review's verdict.

## Focused inbox presentation follow-up

The final NotificationSection adjustment was reviewed in source: the total separates the bold
number and translated label with an inline-flex gap; the scoped `.inbox-row-actions .state-tag`
rule gives the read/new label explicit alignment, padding, width and pill styling. Its specificity
overrides the shared legacy badge styles without changing other sections. Actions retain their
44px minimum targets, and the status remains a non-interactive text label. No data, permission,
submission or filtering behavior changed. **Conforme / SHIP**, subject to the parent's planned
inbox/form/guard browser rerun at the four representative widths. `git diff --check` remained
clean; the reviewer did not start tests or alter the runtime implementation for this follow-up.
