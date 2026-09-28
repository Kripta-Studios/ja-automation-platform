# Finance Cash candidate browser check

- Product commit: `fe6ced96320fd166113d5ad8b2059f7fa208e219`.
- Date: 2026-09-27. Actual Chromium against one disposable E2E database at local port 4174. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/finance-cash-postfix-browser/playwright.config.ts`.
- Evidence: redacted DOM/network snapshots in `finance-results.json` and `auditor-results.json`; screenshots show the failed Finance filter and Spanish Auditor denial. JSON contains no email, credential, UUID, or cash amount.

## Passed

Finance English at 390 px sees `FINANCE_CASH_FILTER_INVALID`, `FINANCE_CASH_DATE_INVALID`, `FINANCE_CASH_DATE_ORDER_INVALID`, and `FINANCE_CASH_PROJECT_UNAVAILABLE` for direct links. Each returns an actionable notice and adjacent field error, retains attempted filters, focuses the notice, and suppresses Cash groups. Correcting a reversed end date through the rendered form restores a normal Cash group. The invalid rendered form also retains dates and focuses the notice. Audit count stayed 331 before and after the Finance paths in the first run; the final recorded run also has equal before/after counts.

Auditor Spanish at 1440 px gets HTTP 403 and the localized restricted-access page for valid and malformed Cash links. Thus permission checks now precede filter validation. No page exceptions or unexpected console errors occurred.

## Follow-up required

`currency=ZZZ&group=quarter` still returns HTTP 200 without a problem. The currency is retained as an unavailable selection, but `group` silently becomes week. This does not explain that the request could not be honored.

An enhanced reversed-date submission from scrollY 300 focuses the notice, but the sticky header obscures its heading and most of the explanation. The notice top stays at −0.3 px while the header bottom is 69.6 px at 0, 50, 250, 500, and 1000 ms after notice visibility. `finance-enhanced-invalid.png` shows the actual 390 px viewport. This is a visibility defect, despite the field error and remedy remaining visible. Both issues are queued for a later product candidate.
