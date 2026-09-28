# Offline transport browser QA

Chromium exercised a disposable SQLite fixture on local Portal preview port 4177. An Owner created a project and Worker assignment through the web interface; the Worker queued time drafts through the web interface. The test intercepted only `POST /j-aautomation/app/api/sync` to simulate 503 and 401. It made no production writes.

## Final focused pass — exact candidate `5c59872`

Chromium passed the full Worker offline time-draft recovery test on this integrated candidate. A 503 showed an **Error** toast (`data-variant="danger"`, `role="alert"`), retained the draft as `needs_review`, and kept the service cause and remedy visible after reload. A reviewed manual retry returned 200 using the same mutation ID and created exactly one time entry. A separate 401 showed an **Error** toast and session guidance, retained its draft, and did not resubmit on another online event.

The 390 px phone had a 390 px document scroll width, no horizontal overflow, and browser hit-testing confirmed that the review link and Retry button were actionable. English at 390 px and Spanish/Portuguese at 1440 px showed the expected wording. Network statuses were `503, 200, 401`; there were no page exceptions, failed requests, browser console errors, offline `createTime` POSTs, or recorded defects. See [results.json](results.json), the cropped screenshots, and the reproducible [Playwright test](candidate.spec.ts).

This is a focused offline time-draft recovery pass; it does not establish every offline entity or role as release-ready.

## Earlier functional pass with toast defect — product SHA `e96843d`

This isolated product SHA contains `b8e4c97`, the phone review-panel CSS fix from `8c796cf`, and the offline passkey guard from `8c5149d`. Playwright Chromium passed the full browser test:

| Check | Result |
| --- | --- |
| Worker 390 px English | The sheet closed after offline Save; review link and Retry passed hit-testing and trial clicks. Viewport and document scroll width both measured 390 px, with no overflow. Focus stayed on the Save button and page scroll stayed at 0 through reconnect. |
| Worker 1440 px Spanish and Portuguese | Exact translated service cause and remedies appeared. They remained usable as the locale changed. |
| 503 and reload | One intercepted 503 moved the draft to `needs_review` with a stored `service` reason. The reason, review link, and local draft survived reload; no unattended POST followed another online event. |
| Reviewed manual retry | After opening saved records, the real sync endpoint returned 200. It used the same mutation ID, removed the local draft, and created exactly one time entry. |
| 401 | A second offline draft moved to `needs_review` with a stored `session` reason, a visible review link, and no unattended repeat submission. |
| Network and browser errors | Sync statuses were `503, 200, 401`. No `createTime` POST occurred while offline. Console errors and page exceptions were empty. One aborted SvelteKit data GET during client navigation was recorded as `net::ERR_ABORTED`; it did not surface as a page exception. |
| Toast severity | The 503 service-unavailable message also appeared in a toast labeled **Success**. The same text describes a failure and a review action, so this label is misleading. See [pre-toast-severity-worker-390-en-503-review.png](pre-toast-severity-worker-390-en-503-review.png). |

The functional recovery path passed, but the toast severity still needed the fix verified in candidate `5c59872` above. See [pre-toast-severity-results.json](pre-toast-severity-results.json) and the matching screenshot.

## Historical diagnostic — candidate `51f9157`

| Case | Browser result |
| --- | --- |
| 503, Worker, 390 px English | Exact service-unavailable text rendered and the review controls existed in the DOM after duplicate online triggers. The time draft remained in IndexedDB as `needs_review`; only one 503 POST occurred. Focus stayed on the Save button; page scroll stayed at 0; there was no horizontal overflow. Visual inspection showed the open time-entry sheet completely covering the review panel. |
| 503, Worker, 1440 px Spanish and Portuguese | Cause, saved-record link, and manual retry were translated in the DOM. The draft and one-request count persisted across locale changes. Visual inspection showed the open sheet obscuring the right part of the panel and its controls. |
| Reload with unresolved 503 draft | Review panel, link, and local draft persisted, with no automatic POST. The cause-specific service text was lost on reload. |
| Manual retry after record review | The real endpoint returned 500 with `legacy offline read only`; no time entry was created, and the local draft remained available. This blocks successful offline sync. |
| 401, Worker, 1440 px English | Session-ended guidance, review link, and `needs_review` draft were visible. A second online event did not submit again. |

At this historical candidate, Playwright `toBeVisible()` checked DOM visibility, but screenshots showed the sheet overlay on top of the panel. The real endpoint returned 500 because `syncMutation()` wrote to a legacy ledger that migration 0019 made read-only. The later product changes addressed these findings and were browser-verified above.

This historical run captured no browser console errors. The cause of a transient `Failed to fetch` page exception was identified in the later `771da0c` run below.

## Artifacts

- [results.json](results.json): redacted final focused pass, including network status sequence `503, 200, 401` and IndexedDB states.
- [pre-ledger-results.json](pre-ledger-results.json): prior diagnostic with the intermittent page exception.
- [pre-fix-results.json](pre-fix-results.json): `e14f5e8` reproduction of the disappearing cause message, fixed for active-page use in `51f9157`.
- `worker-390-en-503-review.png`, `worker-1440-es-503-review.png`, `worker-1440-pt-503-review.png`, and `worker-1440-en-401-review.png`: cropped review panels with only disposable fixture data.
- [candidate.spec.ts](candidate.spec.ts) and [playwright.config.ts](playwright.config.ts): reproducible browser setup.

No trace, session cookie, password, or production record is included.

## Follow-up candidate `b8e4c97` (diagnostic)

Actual Chromium confirmed that the sheet now closes after offline Save. A 503 draft stayed in `needs_review` with its `service` reason through reload, and a reviewed manual retry returned 200, used the same mutation ID, and created exactly one time entry. A separate 401 draft stayed in `needs_review` with its `session` reason and did not resubmit on another online event. English at 390 px and Spanish/Portuguese at 1440 px showed translated guidance and browser-actionable controls. Network statuses were `503, 200, 401`; no raw 500 occurred.

The 390 px review panel overflowed to 456 px, with the Retry control reaching x=443. See [pre-mobile-wrap-results.json](pre-mobile-wrap-results.json) and [pre-mobile-wrap-worker-390-en-503-review.png](pre-mobile-wrap-worker-390-en-503-review.png). The later CSS fix is browser-verified above. One `Failed to fetch` page exception occurred while the browser was deliberately offline; its source was identified in the next diagnostic run.

## Follow-up candidate `771da0c` (mobile wrap verified)

This isolated candidate contains the same product changes as `b8e4c97` plus the phone review-panel CSS fix from `8c796cf`. Chromium measured 390 px document width and 390 px scroll width, with no overflowing descendants. Both the saved-record link and manual Retry passed center hit-testing and browser trial clicks. The updated phone screenshot shows the complete cause and remedies in readable stacked rows.

The end-to-end path again returned `503, 200, 401`: the service-failed draft retained its cause through reload, a reviewed retry used the same mutation ID and created one time record, and the session-failed draft remained local without unattended resubmission. English, Spanish, and Portuguese text was visible in the tested 390/1440 layouts. There was no browser console error or raw 500.

The browser page exception was traced to a failed **GET** `/app/api/auth/passkey/list-user-passkeys` on each deliberate offline transition (`net::ERR_INTERNET_DISCONNECTED`). No `createTime` POST was made offline. The subsequent passkey guard eliminated the page exception in the final focused pass. See [pre-passkey-guard-results.json](pre-passkey-guard-results.json).
