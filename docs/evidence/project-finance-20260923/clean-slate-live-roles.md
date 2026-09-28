# Clean-slate deployed role acceptance

**Result: PASS (9/9 read-only browser cases).** Checked at 2026-09-24 12:26 UTC against `https://j-aautomation.com`, portal/jobs image `ja-automation-portal:zip-d215671b99323d6d8c4ce34b74b4f8e0` (`sha256:8c867a6f283e477fa56d19c0552a533b887db81ba2504de2e9f54ef088f6cd83`). Portal and jobs were running, portal health was healthy, and `stalwart.service` remained active. The cleaned database had 1 client, 2 projects, 0 invoices, 0 time entries, 0 expenses, 118 users, 118 accounts, and 99 mail identities during this check.

Ran `tests/production/clean-slate-roles.acceptance.spec.ts` with existing worker, finance and chief browser states on desktop Chromium (1440px), iPhone WebKit (390px) and iPad WebKit (768px). The command completed with **9 passed (24.1s)** and exit code 0. Tests made only GET requests; they did not submit forms, mutate records, issue invoices or interact with mail.

| Role | Deployed browser result |
|---|---|
| Worker | Existing session stayed authenticated. Time, Expenses and Projects loaded with HTTP 200 and visible main content at all three widths. The returned HTML and page text did not contain the tested private compensation/rate fields. Direct Finance and retained BBS project calculation requests returned HTTP 403. |
| Finance | Existing session stayed authenticated. Commercial Finance and the retained BBS project calculation loaded with HTTP 200 and visible main content at all three widths. |
| Chief | Existing session stayed authenticated. Crew loaded with HTTP 200 and visible main content at all three widths. The returned HTML and page text did not contain the tested private compensation/rate fields. Direct Finance, retained BBS project calculation and an undelegated BBS crew request returned HTTP 403. |

Privacy checks cover the visible page, the server-rendered document response, and direct requests to the finance/calculation/crew boundaries. The targeted response-body field check is not a proof that every possible API has been exhaustively enumerated. This clean-slate check does not repeat the earlier delegated-chief time/expense write journey because the QA project and its grants were intentionally removed; that workflow was accepted on the pre-clean deployment and must be rechecked when a new delegated project is configured. Physical iPhone/iPad Safari was not available; the mobile cases used Playwright WebKit at those sizes.
