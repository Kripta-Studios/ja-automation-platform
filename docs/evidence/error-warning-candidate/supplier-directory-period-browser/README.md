# Supplier owner tabs: independent browser diagnostic

Frozen product commit: `6be0adbaf939a51a7f6349292508cdd29b86c440`. Actual Chromium used a fresh disposable database and an Owner at 390 px English. Result JSON redacts record IDs; screenshots crop notices. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-directory-period-browser/playwright.config.ts --reporter=line
```

One test passed its diagnostic assertions. Direct invalid-period links to Directory, Setup and access, and Authorize installation each returned 200, retained the requested tab and dates in the URL, showed exactly one visible, focused `SUPPLIER_REPORT_PERIOD_ORDER_INVALID` notice, and supplied a Review report period link with project, dates, language, and `workspaceAction=report`. No Supplier profile or audit write occurred; browser page and console errors were empty.

**Remaining remedy bug at this commit:** Clicking Review report period from Directory updated the URL to `workspaceAction=report` but left Directory selected and its card visible. The Report filter inputs were absent (`from=null`, `to=null`) after 250 ms. The same Svelte component kept its prior `workspaceAction` state on same-route navigation. The remedy target was therefore unreachable by clicking. A subsequent product fix needs a separate browser rerun.
