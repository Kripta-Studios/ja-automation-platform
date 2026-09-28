# Expense export phone visibility recheck

- Frozen product commit: `41dc838e3f3270fd593d6553d44c0075ec4528a1` (UI fix `abaea91`).
- Actual Chromium, Finance English, 390 px, disposable E2E database at local port 4174, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/expense-export-scroll-final-browser/playwright.config.ts`.

Finance entered reversed dates in the rendered custom CSV export and clicked Download CSV. The response was HTTP 400 `application/problem+json` with `EXPENSE_EXPORT_DATE_ORDER_INVALID`; Expenses and the disclosure stayed open, both dates and the adjacent field error remained, and no file downloaded. The notice top/bottom stayed at 87.7/239.3 px, clear of the 69.6 px sticky header, at 0, 50, 250, 500, and 1000 ms after it appeared. Focus stayed on the notice throughout. `finance-inline-fixed.png` shows the complete heading, explanation, and remedy on the 844 px phone viewport.

After correcting the end date, the browser received HTTP 200 `text/csv` and downloaded `Expenses_2026-09-20_2026-09-21.csv`. The actual temporary file began with the expected CSV header; it was deleted after this check. Audit count stayed 331 and no page exceptions or unexpected console errors occurred. `results.json` contains redacted timing and network metadata, without credentials or expense rows.
