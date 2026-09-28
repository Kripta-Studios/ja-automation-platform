# Independent Finance reimbursement browser check

Actual headless Chromium against a fresh disposable candidate Portal preview on 27 September 2026. The candidate was based on `1871f31` with the reviewed Finance stale-policy and opt-in review-refresh overlay. The shared Playwright MCP profile was occupied by another agent, so this check used a separate local Playwright Chromium process. No production account or database was used.

Owner created a synthetic project and an active worker assignment through the rendered web forms. Both POSTs returned HTTP 200 and read-only database checks confirmed the records. Finance and Owner then exercised project-default and person-override policy races in two browser tabs. One tab saved a new policy; the stale tab attempted a different mode with a reason.

**Initial discovery:** The four races passed the response, translation, retained-value, focus, remedy, and no-overwrite checks at 390 px and 1440 px across English, Spanish, and Portuguese. However, the initial notice appeared near the top of the Finance page and focusing it moved scroll position by 1,338–2,262 px. [Initial redacted observations](results.json) and the four original notice screenshots are preserved as discovery evidence.

**Post-fix result: 4/4 passed.** A fresh disposable fixture and candidate preview were used after placing the policy conflict notice beside the submitted form. Owner again created the project and worker assignment through the rendered UI. Each stale POST returned HTTP 409 with `WORKER_REIMBURSEMENT_POLICY_CHANGED`. The translated notice explained the changed policy and separated worker reimbursement from customer billing. The attempted mode and reason, selected project, and Person expense policies task stayed in place. The notice held keyboard focus fully below the sticky header and within the viewport, with no horizontal overflow. Scroll position changed by **0 px in all four cases**. The exact scoped Review updated record link loaded the newer saved mode. Read-only checks found no overwrite or additional audit event from the rejected submit or review navigation. Both tabs recorded no page exception, unexpected console error, or other HTTP error; the disposable preview's offline-identity 503 was excluded as an expected fixture response.

| Case                                | Initial scroll | Post-fix scroll |
| ----------------------------------- | -------------: | --------------: |
| Finance project default, 390 px EN  |     2222 → 463 |     2222 → 2222 |
| Owner worker override, 390 px PT    |     2725 → 463 |     2725 → 2725 |
| Owner project default, 1440 px ES   |     1712 → 374 |     1712 → 1712 |
| Finance worker override, 1440 px EN |     1992 → 374 |     1992 → 1992 |

The [post-fix redacted observations](post-fix-results.json) contain response statuses, pass/fail flags, viewport sizes, and exact scroll offsets. All eight PNGs crop only the generic policy notice. They contain no credentials, account addresses, record IDs, project names, or raw request bodies. Both disposable databases and browser processes were removed after their respective checks.
