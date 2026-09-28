# Supplier report period: independent browser check

Frozen candidate: `e519cb8ccf3d28b5ce456508967ee0fef38ba618`. Actual Chromium used a fresh disposable database. The Owner created a Supplier and assigned disposable Coordinator and Technician profiles through the rendered interface. JSON redacts record and correlation IDs; screenshots crop the notices. No production request or data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/supplier-report-period-postfix-browser/playwright.config.ts --reporter=line
```

Result: one passed, covering Owner at 390 px English, Supplier coordinator at 1440 px Spanish, and External technician at 390 px English. This is diagnostic evidence for the frozen commit; two display defects and one CSV authorization defect were found. The first run stopped on a focus assertion after recording the Owner case; the second run recorded all roles and passed the transport/state assertions.

- Reversed dates on the rendered report form kept the attempted dates and available project, displayed `SUPPLIER_REPORT_PERIOD_ORDER_INVALID` with a Review report period anchor to End date, and suppressed report rows and CSV download. Owner and Technician notices were focused and visible. The Coordinator notice was visible but focus remained on the body after 250 ms. The adjacent End date error literally displayed `problem.supplier.reportPeriodOrderInvalid` in English and Spanish. That translation key must be resolved before release.
- A malformed direct `from=2026-13-40` browser GET returned 200 with `SUPPLIER_REPORT_PERIOD_DATE_INVALID`, retained the exact malformed string in a text input, showed translated adjacent field guidance, and focused the visible notice. Valid Owner and Technician reports still exposed CSV download. The Coordinator fixture had no granted project, so it had no valid report rows or download to compare.
- The Supplier workspace direct invalid period URL showed the typed notice and suppressed its report link. This snapshot captured body focus; its focus effect may not have settled because the check ran immediately after navigation.
- Owner CSV with missing project and malformed date returned 400 `application/problem+json`, respectively `SUPPLIER_REPORT_PROJECT_REQUIRED` and `SUPPLIER_REPORT_PERIOD_DATE_INVALID`, with field errors, remedies, correlation IDs, and no CSV attachment.
- Finance CSV with missing project returned 400 `SUPPLIER_REPORT_PROJECT_REQUIRED` on this commit. Authorization should precede the parameter check; a later patch is pending and needs a separate browser rerun.
- Invalid filters changed no Supplier profile or audit count. No page exceptions or console errors occurred. Browser request status and visible wording are in `results.json`.

The visible suppression of rows/download verifies no report was rendered. The browser cannot by itself prove that no database report query was executed; the page loader's `!period.periodProblem` guard supports that source-level conclusion.
