# Supplier report focus correction: independent browser QA

Frozen product commit: `4337255b4c8c9cf3406dd62549582076c6d6b4db`. Actual Chromium used a fresh disposable database. The Owner created a Supplier and assigned Coordinator and Technician profiles through rendered forms. Result JSON redacts record/correlation IDs and screenshots crop notices. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-focus-final-browser/playwright.config.ts --grep 'final period' --reporter=line
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-focus-final-browser/playwright.config.ts --grep 'focus timeline' --repeat-each=5 --reporter=line
```

The full matrix passed: Owner 390 EN, Coordinator 1440 ES, and Technician 390 EN retained attempted dates and available project, showed translated inline End date guidance, focused visible typed notices for reversed and malformed dates, and suppressed report rows/download on invalid periods. Owner `workspaceAction=report` direct invalid URL focused its notice. Owner CSV missing project and invalid date returned 400 problem JSON; Finance and Manager malformed CSV returned 403 before validation. No invalid filter changed Supplier profile or audit counts. Browser console and page errors were empty.

Five repeated Owner enhanced reversed-form navigations passed the settled focus gate: notice focused by +50 ms and still focused at +250, +500, and +1000 ms. Instrumentation captured immediate snapshots, DOM connection/tabindex/visibility, `focus()` calls, activeElement, scroll, and network. A preliminary strict immediate-snapshot gate failed three of five because Kit briefly placed focus on body before the deferred correction; after changing the gate to the relevant settled samples, all five repeated cases passed. Current `focus-timeline-repeat-*.json` files are from that passing rerun.

**Separate uncovered case:** Direct Owner `/supplier?workspaceAction=directory&from=2026-09-20&to=2026-09-19&lang=en` retained Directory but rendered no period notice and left focus on body, even though the URL contained an invalid range. The period notice existed only within the Time/Personnel/Report filter card at this commit. A subsequent product patch is needed and should be checked separately.

The Coordinator fixture had no granted project, so a valid Coordinator report had no CSV download. Its invalid period wording, focus, and retained date values were still exercised. The browser verified no rows/download were rendered on invalid periods; source loader guards show the report query is skipped.
