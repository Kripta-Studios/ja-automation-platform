# Project Detail period candidate browser check

- Frozen product commit: `0a0cee42913ba5d14a0584a1296116b67f07917d`.
- Actual Chromium at local port 4174 with disposable E2E database, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-detail-period-candidate-browser/playwright.config.ts`.

Owner English at 390 px, Finance Spanish at 1440 px, and Auditor Spanish at 1440 px opened invalid, reversed, and duplicated Project Detail finance-period links. All nine requests returned the appropriate stable code (`PROJECT_DETAIL_PERIOD_DATE_INVALID`, `PROJECT_DETAIL_PERIOD_RANGE_REVERSED`, `PROJECT_DETAIL_PERIOD_DATE_DUPLICATE`), translated adjacent field guidance, retained attempted dates, preserved the Commercial tab and locale, focused the notice, and withheld the finance projection. Audit count was unchanged. Manager and Worker on their own active member projects had no finance period notice or finance summary even with malformed period parameters. No page exceptions or unexpected console errors occurred.

**Remaining defect:** The Owner 390 px correction form, submitted through enhanced same-route GET with another reversed end date, retained dates, Commercial tab, code, and no finance summary, but focus moved to `body` and scroll reset from 300 to 0. The notice began at 718 px and extended to 847 px in an 844 px viewport, leaving part of the explanation/remedy cut off. `owner-enhanced-invalid.png` shows this actual state. Correcting the date afterward cleared the problem and restored the finance summary. This browser result is diagnostic, not a focus/scroll pass.

The JSON files contain redacted DOM and network facts. Screenshots show only disposable demo project details, with no finance amounts or credentials.
