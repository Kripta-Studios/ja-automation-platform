# Supplier report: independent Chromium diagnostic

Frozen candidate: `cb1c6bf5c5b665d5c42072238e0b624dae717f15`. Actual Chromium ran against a fresh disposable database. The Owner created a Supplier and assigned Coordinator and Technician profiles through the rendered interface. Results redact record and correlation IDs; screenshots crop the problem notices. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-final-browser/playwright.config.ts --reporter=line
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-final-browser/playwright.config.ts --grep 'focus timeline' --repeat-each=5 --reporter=line
```

The full matrix passed its state, wording, CSV, and no-write assertions. Owner 390 EN, Supplier coordinator 1440 ES, and External technician 390 EN saw typed reversed/malformed period notices, translated adjacent field errors, retained dates and available project, report-period remedy anchors, and no report rows/download while the period was invalid. Malformed date retained its literal input in a text control. Valid Owner and Technician reports still exposed CSV download. Owner workspace `workspaceAction=report` direct invalid URL showed and focused the typed notice. Owner missing-project and invalid-date CSV returned 400 `application/problem+json` with the correct codes and no attachment. Finance and Manager malformed CSV returned 403 before input guidance. No invalid filter changed Supplier profile or audit counts; no page exceptions or console errors occurred.

**Remaining focus race at this commit:** In the full matrix, Owner EN enhanced reversed-form submission left activeElement on the body after 250 ms despite a visible notice. A dedicated five-repeat Owner timeline reproduced body focus in three repeats and proper notice focus in two. The failing runs logged `notice.focus()` at about 102–129 ms, with a `focusin` event and aside active on return, but activeElement was body at every immediate, +50, +250, +500, and +1000 ms sample. The notice remained connected, visible, and `tabindex=-1`. Manual focus at about 1.15 seconds worked and remained. This points to a later navigation focus reset. The full matrix test records this honestly without asserting a pass; the repeated timeline is evidence for the subsequent focus fix.

The Coordinator fixture had no granted project, so its valid report contained no download; its invalid period wording and focus were still exercised. The browser verified no rows/download rendered on invalid periods; source loader guards confirm the operational report query is skipped.
