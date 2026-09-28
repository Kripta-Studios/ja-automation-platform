# Expense export candidate browser check

- Frozen product commit: `de773448ae030f1a19bf323580460be3571356c2`.
- Actual Chromium against disposable E2E database at local port 4174, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/expense-export-candidate-browser/playwright.config.ts`.

Finance English at 390 px entered reversed dates in the rendered custom export disclosure and clicked CSV. The fetch returned HTTP 400 `application/problem+json` with `EXPENSE_EXPORT_DATE_ORDER_INVALID`. Expenses and the disclosure stayed open; both entered dates, the inline translated field error, remedy, and keyboard focus were retained. No JSON/HTML file downloaded. Correcting the end date produced HTTP 200 `text/csv`, a `.csv` filename, and a real CSV header (`Date,Client,Project,Worker,Vendor,Category,Description,Currency,Recorded amount,Payer,Status`); the temporary downloaded file was deleted immediately after reading its header. Audit count stayed unchanged.

Owner Spanish at 1440 px received the translated inline problem and field remedy for the same reversed dates without navigation or download. Worker direct GET with another worker's ID returned HTTP 403 `EXPENSE_EXPORT_WORKER_SCOPE_DENIED` and `review_own_expenses`; the page stayed on Expenses and no records downloaded. A delayed export intercepted in the browser was canceled by navigation to Profile with no stale notice/download, page exception, or unexpected console error.

**Visibility defect at this frozen commit:** In Finance's 390 px failure, the focused notice top was −0.3 px while the sticky header ended at 69.6 px. `finance-inline-viewport.png` shows the notice heading and most explanation hidden beneath the header, though the remedy and adjacent field error remain visible. The product follow-up must place the notice below the header. The disposable environment also showed a separate sync status toast in this screenshot; it did not affect the export response.

The JSON files contain redacted DOM/network metadata, no credentials or financial rows. Screenshots show only the export form and guidance. The first diagnostic run's CSV-header assertion read Playwright's response body as empty; the final Finance rerun read the actual temporary download file and passed the header assertion.
