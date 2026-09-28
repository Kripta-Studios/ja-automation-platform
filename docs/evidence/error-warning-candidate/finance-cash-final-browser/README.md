# Finance Cash follow-up browser check

- Frozen product commit: `fa8eeb6a975e74344ba9351a6f3f5bd7320b08c2`.
- Actual Chromium with disposable E2E database at local port 4174, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/finance-cash-final-browser/playwright.config.ts`.

Finance English at 390 px and Owner Spanish at 1440 px each opened `currency=ZZZ&group=quarter`. The page retained both attempted values and the date, returned `FINANCE_CASH_CURRENCY_INVALID`, displayed translated adjacent errors for both fields, focused a visible linked summary, and suppressed Cash groups. An invalid group alone returned `FINANCE_CASH_GROUP_INVALID` with field guidance. Choosing USD and monthly grouping in the rendered form cleared the problem and restored normal Cash groups. Audit counts were unchanged for both roles; no page exceptions or unexpected console errors occurred.

The Finance 390 px enhanced reversed-date GET started at scrollY 300. At 0, 50, 250, 500, and 1000 ms after the notice became visible, focus stayed on the notice; its top stayed at 87.7 px, below the 70 px sticky header, with the full heading, explanation, and remedy visible. The resulting scrollY was 472. `finance-enhanced-fixed.png` shows the actual viewport. The earlier obstruction at product `fe6ced9` is resolved.

Redacted DOM/network details are in the JSON files. The screenshots contain no cash amounts or credentials.
