# J&A browser audit — 2026-09-25

## Scope and build

- Production URL: `https://j-aautomation.com/j-aautomation/app/`. Chromium opened this read-only, followed redirects to the login page, and did not authenticate or change production records. The login form rendered, with no console warnings/errors, page errors, failed requests, or HTTP errors. See `production-login.json` and `production-login.png`.
- Authenticated flows ran on an isolated loopback portal (`127.0.0.1:4174` then `5174`) and disposable synthetic database. No live data was modified. Database had 25 synthetic projects, including CP020 and Junkers DFW. Browser: Google Chrome for Testing 151.0.7922.34 (Chromium via Playwright). Playwright MCP also opened the production login page and checked its accessibility snapshot, console, and network.
- Source HEAD during the audit: `2fa2cb61220294fa742273300d829fdedcf54df3`. The local QA build included uncommitted fixes subsequently under review, including optional tax profiles and J&A invoice bank defaults. `apps/portal/build/index.js` SHA-256: `790c0a16d501835b2f72cf456f6616cce9610d189b1896a6e5cc2367a3b57bd3`. The production release current at audit time was `ja-automation-45e36e489be1ea515c4c4ba0adbd1767938b4fb8feb38c4659bdb6bd6fc02d4d`.

## Browser actions and observed results

1. Owner signed in through the real form on isolated QA. Time, Expenses, Approvals, Billing, Commercial Configuration and Projects rendered with successful network responses. No page or HTTP errors were seen.
2. Log time opened by click. It offered decimal Actual hours, category, date, and a meal-only linked expense. Saving 1.5 hours on a future date closed the form; reopening defaulted to the following day. See `audit-submit.json`, `time-open.png`.
3. Record expense opened by click. Vendor was optional, currency defaulted to USD, and future date was accepted. Saving with Vendor blank closed the form and increased the record count. See `audit-submit.json`, `expense-open.png`.
4. In Approvals, clicking Expenses then Apply filters preserved the Expenses tab and set `?tab=expenses&order=priority`. See `audit-interactions.json`.
5. Owner opened the weekly table and saved 2.25h Monday plus 1.75h Tuesday as drafts. The form offered separate hour, category and activity fields for seven days. See `audit-week.json`, `week-table-filled.png`.
6. Owner saved a 1.25h time draft with a linked meal expense. Clicking Submit all week drafts submitted that meal and four time drafts in the selected week; a separate unlinked expense remained draft. The JSON contains before/after database states to corroborate the browser action. All POST responses were HTTP 200; no console/page/HTTP errors were recorded. See `audit-week.json` and `week-after-submit.png`.
7. Owner chose a worker and Oct 1 in the calendar, clicked Log time on this day, saved 1.5h, clicked Edit draft to change it to 2.5h, then clicked Delete draft. The calendar and database both showed create, edit, then removal. See `audit-calendar.json` and calendar screenshots.
8. With all tax profiles removed from a **copy** of the disposable database and two active issuers retained, the project Billing setup showed “No tax profile configured” for labor and expense. Continue stayed enabled at step 2 and reached step 3 when clicked. See `audit-no-tax.json`, `no-tax-step2.png`, `no-tax-step3.png`.
9. An existing synthetic JA-USA invoice draft opened in Chromium. The issuer heading showed J&A Automation LLC; BILL TO showed the distinct project client IMPC Gmbh. A visible warning required a reviewed project issuing authority before issue. SWIFT, account, bank name and beneficiary were prefilled and editable (`readonly=false`, `disabled=false`). Values are deliberately omitted from this evidence bundle. See `bank-fields-redacted.json`.

10. With Chromium DevTools Protocol Runtime and Network enabled, saving a future time entry stored only a next-day date and synthetic worker reference in the `ja-time-next-day` localStorage key; reopening Log time selected that next day. No session tokens or unrelated storage keys were read. See `cdp-next-day-redacted.json`.
11. Expense Description auto-filled “Perdiem” for an assignment with an effective per diem policy and “Only hours” for another assignment without it. Currency started USD and could be changed to EUR. See `expense-description-defaults.json` and screenshots.
12. Owner clicked Download finance export in the QA project. The XLSX contained 14 Expenses rows with $1,216.50 recorded from receipts and $850 finance-approved client charges. The Invoice expenses sheet had 12 rows totaling $850, matching the Invoices sheet expense count and client charge. Actual reimbursed remained $0 because no repayment had been recorded. See `xlsx-summary-redacted.json`.

## Diagnostic note and limits

- The current local QA build produced a SvelteKit warning about `history.pushState`/`replaceState` during route hydration, including sign-in and project navigation. A browser init trace (`audit-history.json`) shows it originates in the built SvelteKit chunk at `Module.xn` during initial `history.replaceState`. It was not an HTTP or page error and did not block the tested flows. The source of the framework warning remains to be resolved.
- Production was checked only through the unauthenticated login because no production credentials were available for this audit. Authenticated behavior above is QA browser evidence and requires a final smoke test after the pending production deployment.
