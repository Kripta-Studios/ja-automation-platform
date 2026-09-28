# Deployed billing setup and draft-readiness retest

Date: 2026-09-24 12:14 UTC. Public origin: `https://j-aautomation.com/j-aautomation/app/projects`. Deployed portal image: `ja-automation-portal:zip-d215671b99323d6d8c4ce34b74b4f8e0` (healthy at test start); site image with the same release suffix (healthy). Tests used an ordinary authenticated owner browser state and the designated QA client. No invoice was issued, sent, or paid.

## Result

| Browser profile | Result | Evidence |
| --- | --- | --- |
| Chromium desktop | PASS | `project-billing-modes.acceptance.spec.ts`: 1 passed in 14.1 s, exit 0 |
| WebKit iPhone 390 px | PASS | Same spec: passed in combined WebKit run |
| WebKit iPad 768 px | PASS | Same spec: 2 passed in 31.3 s total, exit 0 |

The browser test created a marked QA project under the designated QA client with required cost center and an optional expense budget, then found the project through search. It checked the saved budget after reopening the edit form. On the project's Billing tab it saved the default **one invoice with two sections** configuration as a reusable template, reloaded the page, and confirmed both mode and template remained. It then deliberately requested a one-day invoice draft against the configured cadence. The live app returned an inline readiness notice, kept the invoice form open on the Billing tab, retained the attempted period and billing stream, and showed a link back to Billing setup. This is the regression that previously failed because the action fell back to Overview and hid the form. Finally, the test saved **two separate invoices**, reloaded, and confirmed that mode persisted. It checked no document overflow and a minimum 44 px Continue control at each profile's viewport.

The test does not claim that these three newly created QA projects have billable sources or that it generated an invoice; actual combined/separate invoice generation and PDF checks are recorded separately in `live-invoice-modes.md`. The marked QA projects and saved templates from this retest remain disposable business data for the planned clean-slate cutover. These are simulated WebKit device profiles; no physical iPhone or iPad was used.

Command: `pnpm exec playwright test --config=playwright.production-acceptance.config.ts tests/production/project-billing-modes.acceptance.spec.ts` with the production origin, designated QA client and owner auth-state environment, run once with `--project=desktop` and once with `--project=iphone-webkit-390 --project=ipad-webkit-768`. The auth-state path and credentials were not included in the evidence output.
