# Project finance XLSX: candidate browser diagnostic

- Candidate code: `33091be`.
- Actual Chromium on a disposable database and candidate portal at port 4175; no production writes.
- Run with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-finance-export-candidate-browser/playwright.config.ts`.
- Owner 390 px English, Finance 1440 px Spanish, and Manager denial passed 3 browser tests. This evidence is **diagnostic** because the failed-download notice is outside the viewport.

Authenticated API requests with an invalid calendar date, reversed dates, and duplicate dates returned `application/problem+json`, stable distinct codes, field keys, permitted `review_finance_period` remedies, and a correlation ID. Each invalid request returned 400 and left the audit row count unchanged. Manager requests, even with an invalid date, returned a role-specific 403 before period guidance. Real valid XLSX responses began with the ZIP signature `PK`, included attachment headers, and completed browser downloads; those valid downloads were audited.

After a valid Billing-tab page loaded, the test changed the client-held download link to an invalid date, representing a stale or malformed link. Clicking the real export button received the real 400 response and rendered translated guidance with a correction form. The Billing tab and selected page dates remained. Focus moved to the notice, **but no scrolling followed**: in the Owner 390×844 viewport its top/bottom were 844.03/995.59 px; in Finance 1440×900 they were 900.42/1031.69 px. The entire notice was below the visible viewport. The screenshots isolate the notice and deliberately scroll it into view; the preceding geometry in the JSON files documents the actual post-click viewport state. Browser console and page errors were empty.

The UI failure setup alters a client-held link because the page itself prevents invalid period dates from reaching the export button. This is a recovery-path check, not a normal entry path. The test needs rerunning after the focus and scroll repair.
