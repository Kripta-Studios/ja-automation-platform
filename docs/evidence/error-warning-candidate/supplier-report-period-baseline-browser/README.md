# Supplier report date filters: actual-browser baseline

Frozen release candidate: `b9f46b30660284fc34985cb621637ac74040a7ed`. Actual Chromium used a disposable database. The Owner created a disposable Supplier and assigned two disposable worker profiles through the rendered Supplier forms. Record IDs are redacted in JSON and screenshots show only the report error page. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-period-baseline-browser/playwright.config.ts --reporter=line
```

Result: one passed, covering Owner at 390 px English, Supplier coordinator at 1440 px Spanish, and External technician at 390 px English. The first harness run timed out while expecting an HTTP 400 from the enhanced GET form navigation; the second run recorded the actual transport without that assumption and passed.

- All three roles opened `/supplier/report` successfully. After choosing `from=2026-09-20` and `to=2026-09-19` in the rendered form and clicking Apply, the app navigated to a generic **Error** page. English said “The action could not be completed. Try again shortly”; Spanish said “La acción no se pudo completar. Inténtalo de nuevo.” The URL retained the attempted dates, but the form, project selection, field errors, and report-specific remedy were gone. Focus was on the body. The enhanced navigation fetched `report/__data.json` with transport 200 and then rendered the error page, so the test could not attach an HTTP 400 to the form click.
- A malformed `from=2026-13-40` direct browser GET returned HTTP 400 and the same generic error page for each role.
- Owner missing-project direct browser GET to `/supplier/report.csv?lang=en` returned HTTP 400 with a plain “Select an installation” page, no report picker or remedy. It was not a CSV download.
- Supplier profile and audit counts were unchanged by invalid filters. No page exceptions or console errors occurred. The screenshots and `results.json` contain the role, viewport, URL, visible wording, focus, and network response list.

The source rule is `supplierPeriod()` in `apps/portal/src/lib/server/supplier-context.ts`; it raises generic HTTP 400 `Invalid report period` for invalid or reversed dates. Both the report page and Supplier workspace load call it. The CSV missing-project response is in `apps/portal/src/routes/app/supplier/report.csv/+server.ts`.
