# Report Review candidate browser check

- Frozen product commit: `41dc838e3f3270fd593d6553d44c0075ec4528a1` (Report Review product included).
- Actual Chromium against disposable E2E database at local port 4174, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/report-review-candidate-browser/playwright.config.ts`.

Finance English at 390 px, Owner Spanish at 1440 px, and Project Manager English at 390 px each selected a project from their rendered role-scoped picker. Invalid, reversed, and duplicate dates returned `REPORT_REVIEW_PERIOD_DATE_INVALID`, `REPORT_REVIEW_PERIOD_RANGE_REVERSED`, and `REPORT_REVIEW_PERIOD_DATE_DUPLICATE`. An unavailable project returned `REPORT_REVIEW_PROJECT_UNAVAILABLE` while retaining its unavailable selection; a missing project returned `REPORT_REVIEW_PROJECT_REQUIRED`. Each case retained attempted dates, displayed translated adjacent field guidance and a remedy, focused a visible notice, and withheld review reports. Audit counts were unchanged.

Finance also submitted reversed dates through the rendered GET form from scrollY 97. The enhanced result kept project and dates, focused the notice at 428–579 px within the 844 px viewport at 0, 50, 250, 500, and 1000 ms, and preserved scrollY 97. Correcting the end date cleared the problem. Auditor Spanish at 1440 px received HTTP 403 for valid and malformed links before filter guidance. No page exceptions or unexpected console errors occurred.

Redacted DOM/network details and the focus timeline are in the JSON files. Screenshots show only the filter problem, not report or finance data. The first diagnostic test run used an evidence selector scoped to the notice instead of the form; the corrected selector passed all five browser tests without a product change.
