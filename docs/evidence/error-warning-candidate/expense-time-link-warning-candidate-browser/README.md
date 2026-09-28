# Linked expense time warning: candidate browser evidence

## Pre-fix diagnostic, candidate `147c58d`

Chromium ran against a locally built Portal on port 4177 with its own disposable SQLite fixture. The browser created a project, assigned the test worker, recorded 2.5 hours, and created a linked expense draft through the application UI. No production record was changed.

The six create-form checks passed: Worker in English at 390 px, Spanish at 1440 px, and Portuguese at 390 px; Owner in English at 1440 px, Spanish at 390 px, and Portuguese at 1440 px. In each case, the scoped time-options GET returned 200 with the selected entry, the warning and remedy were translated, clearing the selection hid the warning, and selecting the entry restored it. The English Worker keyboard check moved from the time selector to Vendor. The warning fit horizontally within the sheet. No page or console errors occurred through this matrix. Redacted warning-only screenshots and `pre-fix-results.json` contain the per-case evidence.

An invalid zero amount produced an enhanced SvelteKit action transport HTTP 200 with `type: failure`, action status 400, and `EXPENSE_AMOUNT_INVALID`; the entered vendor and time link stayed in the form. Correcting the amount saved a draft with the linked time entry. This is a nonblocking warning in the successful save path.

**Found defect:** A direct edit URL opened the saved draft and made a successful time-options GET whose results included the linked entry, yet the edit selector displayed **Expense only / no linked hours** and the warning was absent. The direct-URL initialization in `ExpenseSection.svelte` did not copy the record's `time_entry_id` into the edit selector. `pre-fix-worker-390-en-deep-link-edit-unselected.png` captures the selected control without record identifiers. This candidate fails the direct-link edit requirement. The run stopped after recording this defect and before the native edit and temporary lookup-failure checks, due to a QA harness locator that expected the create form's **Save draft** label on the edit form. No post-fix result is inferred from this diagnostic.

The temporary Playwright trace and fixture were deleted after diagnosis because traces include browser session data. The committed artifacts contain no account credentials, cookies, or record IDs.

## Deep-link fix browser verification, candidate `08f7128`

The Portal was rebuilt from `08f7128` and served on port 4177 with offline support enabled and a fresh disposable SQLite fixture. Chromium passed both the full matrix and a focused edit rerun. The browser again created the project, assignment, logged hours, and linked expense through the UI. `results.json` holds the full run; `pre-scroll-fix-focused-results.json` records explicit edit-path outcomes and the notice geometry. Each run ended with its fixture removed.

| Check | Observed result |
| --- | --- |
| Warning and remedy on create | Worker EN 390, ES 1440, PT 390; Owner EN 1440, ES 390, PT 1440. All six scoped lookups returned 200. The warning was visible only while a verified time entry was selected, translated correctly, and fit within the form sheet. |
| Invalid expense amount | Enhanced request transport was HTTP 200 with SvelteKit `type: failure`, action status 400, and `EXPENSE_AMOUNT_INVALID`. EN, ES, and PT showed the translated **Correct the highlighted field** remedy and an error beside Amount. Vendor and time selection stayed entered. |
| Successful create and edit | Correcting Amount saved a linked draft. Direct URL Edit and row-button Edit both selected the persisted linked entry and showed its warning. Clearing/reselecting the link hid/restored the warning. A native form POST saved the edit and kept the link. |
| Temporary time-options failure | An intercepted 503 suppressed the warning for create and edit. On create, the error received focus, preserved global scroll and entered values, and offered retry; a 200 retry restored the warning. The edit kept its original link selected during the lookup failure. **The phone notice wording was occluded; see below.** |
| Empty offline queue | An online event with offline support enabled sent zero `/api/sync` requests and showed no false sync-failure toast. |
| Browser health | No page exceptions or console errors occurred in the Worker or Owner contexts. The Worker EN keyboard check moved from the time selector to Vendor. |

Screenshots show only the warning/error notices or the pre-fix selected control, without account details or record identifiers. The post-fix direct-URL and row-button edit warning screenshots are separate from the six create screenshots.

**Found phone visibility defect:** The focused Spanish 390 px `EXPENSE_LOOKUP_UNAVAILABLE` notice was under the sticky Cancel/Save actions. Its message occupied y=764–825 while the sticky actions began at y=753; hit testing at the message center reached the actions. The notice height was 121 px, the scroll body started at y=134, and moving the notice to the body top required scrollTop 726 of a possible 1358, so the full wording could fit above the actions. `pre-scroll-fix-worker-390-es-lookup-failure.png` shows the heading while the explanation and remedy are hidden. This candidate fails visible wording for that failure. A later product change must be browser verified separately.

This verifies a local candidate, not a deployed production build. The native POST bypassed SvelteKit enhancement in an active browser; a full JavaScript-disabled session was outside this focused run. The temporary 503 was browser-injected, and the empty-queue check does not cover queued offline draft conflicts.

## Phone notice scroll fix, candidate `ed1d7a2`

Chromium rebuilt the Portal from `ed1d7a2`, which includes the focused lookup-scroll fix, and repeated the Worker 390 px Spanish create failure in a fresh disposable browser fixture. The injected 503 returned `EXPENSE_LOOKUP_UNAVAILABLE`; the warning for a selected time entry stayed suppressed, the error received focus, entered vendor/time values and global scroll remained intact, and the retry button stayed usable. A 200 retry restored the verified-link warning. The focused run also reconfirmed direct-URL and row-button Edit, native linked edit save, edit lookup failure, no empty-queue sync request/toast, and zero page/console errors. `focused-results.json` is pinned to this candidate.

The previously hidden notice now sits at y=134–255 in the 390 px sheet; its full explanation is y=175–236, far above sticky actions beginning at y=753. Browser hit testing at the message reaches the notice rather than the actions, and the retry button is fully above the actions. `scroll-fix-worker-390-es-lookup-failure.png` shows the complete translated explanation; `scroll-fix-worker-390-es-retry.png` shows the visible next step. This closes the phone visibility defect observed at `08f7128`.

The candidate has not been deployed to production. The intercepted 503 verifies browser behavior for a temporary lookup failure; it does not simulate a real service outage or offline queued-draft conflict.
