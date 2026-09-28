# Expense lookup recovery browser QA

On 2026-09-26, the isolated candidate passed **6/6** disposable Playwright cases at 390 px and 1440 px. The Worker expense form retained its selected project, worker, date, linked hours, and description through a simulated time-options 503; focused the visible typed problem; kept Save draft available; and recovered after one explicit retry. Editing an expense to another date kept the old link visible with a specific warning and disabled Save until the link was removed. An active correction to the original time record did not falsely invalidate an unchanged expense link.

Command with the pinned Node 24 runtime:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/error-warning-expense-lookup-recovery.spec.ts --project=phone-390 --project=desktop --reporter=line
```

The first two runs exposed three test fixture or assertion errors and one real notice-visibility defect. The fixture and assertions were corrected, and ExpenseSection now focuses and scrolls the lookup notice into the sheet. The final suite passed all six cases in 1.1 minutes. The final rerun also removed the fixture's unrelated offline-sync toast only before taking the cropped date-warning screenshot; product assertions were completed first.

The 16 PNG/JSON files contain only cropped synthetic controls or notices, reduced step outcomes, and endpoint path/status pairs. They omit cookies, credentials, request bodies, customer records, raw network captures, and Playwright traces. The injected 503 reference is a disposable fixed test value.
