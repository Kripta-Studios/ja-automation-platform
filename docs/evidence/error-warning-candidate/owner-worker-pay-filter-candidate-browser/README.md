# Owner worker-pay filter: candidate browser evidence

- Candidate: `f3955489afc09a62df1001fe3a7f80ef662407a6`, including the combined duplicate and malformed date retention repair.
- Actual Chromium and a fresh disposable E2E database at port 4175. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/owner-worker-pay-filter-candidate-browser/playwright.config.ts`.
- Result: 7 browser tests passed. Owner English at 390 px, Spanish at 1440 px, Portuguese at 390 px; Owner correction retry; Finance, Manager, and Worker denial.

Owner direct links exercised invalid calendar date, reversed dates, duplicate parameters, an unavailable worker, a duplicate parameter whose first value is `not-a-date`, and duplicate plus malformed start/end fields. Each returned a 200 document with a stable specific code, translated notice, permitted correction link, preserved raw dates and worker selection, and no pay summary or activity rows. The unavailable worker stayed selected as a disabled option with an explanation. The combined malformed fields rendered as text inputs so neither invalid value disappeared. When two fields failed, the summary linked both controls and received focus. Invalid reads left the audit row count unchanged; page and console errors were empty.

On the 390 px Owner form, another reversed end date submitted through the real GET form retained the worker and dates, preserved the initial 274 px scroll position, and focused the visible notice at 161–313 px. A valid end-date retry removed the problem and restored the worker-pay summary. The route returned 200 document/fetch responses. Finance, Manager, and Worker each received 403 before any pay rows or filter details. Their error page said access was restricted and directed them back to a section available to their role.

The JSON files hold redacted browser state, response status categories, audit counts, and focus/geometry. Screenshots use synthetic fixture people only and show the invalid form without compensation amounts or credentials. The two test invocations used separate fresh disposable fixture databases; both used the same candidate code.
