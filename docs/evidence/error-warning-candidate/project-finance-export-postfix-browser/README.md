# Project finance XLSX: visible notice after failed download

- Candidate: `d9c212ba93625ff9fe37802c771291a1ecfb42de`, including the finance export focus/scroll repair.
- Actual Chromium on a fresh disposable E2E database and candidate portal at port 4175. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-finance-export-postfix-browser/playwright.config.ts`.
- Result: 2 browser tests passed, Owner English at 390×844 and Finance Spanish at 1440×900.

Both roles first downloaded a valid XLSX through the real Billing-tab button. The test then changed the client-held link to an invalid calendar date to exercise the real API 400 recovery path. The stable period-date code, translated explanation, field error, remedy link, page period, and Billing tab were retained. The notice gained focus and moved into view: Owner top/bottom 668.03/819.59 px; Finance top/bottom 744.42/875.69 px by 50 ms. Those bounds are below the sticky header and leave at least 24 px below the notice. The diagnostic version at `33091be` had placed the whole notice beyond the viewport on both sizes.

Network logs include a 200 XLSX response and a 400 `application/problem+json` response. The one successful download added one access audit entry; the invalid request added none. Console and page errors were empty. Screenshots isolate the problem notice, with no finance figures or credentials; JSON files contain redacted timing and geometry.

The malformed link is a stale-link simulation. Normal period input validation blocks invalid dates before the export button is available.
