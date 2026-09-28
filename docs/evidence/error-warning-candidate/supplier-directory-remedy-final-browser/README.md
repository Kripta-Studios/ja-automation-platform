# Supplier Directory period remedy: independent browser QA

Frozen product commit: `0daba56d0bcec493e1d72a6e2e3c2595b152de1d`. Actual Chromium used a fresh disposable database and an Owner at 390 px English. Result JSON redacts record IDs; screenshots crop notices. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-directory-remedy-final-browser/playwright.config.ts --reporter=line
```

One test passed. Direct invalid-period links to Directory, Setup and access, and Authorize installation each retained the requested tab and date query, displayed exactly one visible focused `SUPPLIER_REPORT_PERIOD_ORDER_INVALID` notice, and offered Review report period with project, dates, language, and Report target. Clicking that remedy from Directory selected Operational report on the same route, retained project/start/end/language in its filter controls, and focused its single visible notice. Clicking Directory afterward restored Directory with one notice. Supplier profile and audit counts did not change. Browser page and console errors were empty.
