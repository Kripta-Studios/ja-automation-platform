# Deployed export error baseline

Observed on deployed production at `2026-09-27T17:34:55Z` using disposable test accounts. The browser script performs only deliberately invalid GET requests. It never follows a valid export link, accepts a download, or changes a business record. This is a read-only baseline, not a candidate-build verification. The selected project identifier and account credentials are omitted from the saved evidence.

## Browser matrix

| Role and viewport | Route | Invalid cases | Actual response and visible result |
| --- | --- | --- | --- |
| Finance, 390 px, English | Project finance XLSX | Impossible start date, reversed period, two invalid start values | All HTTP 400 `text/html`; browser navigates to bare error page with `periodStart must be a valid ISO calendar date` or `Period start must not follow period end`. No problem code, field guidance, or remedy. Focus is on `body`. |
| Finance, 390 px, English | Collection Ledger CSV | Impossible date, reversed period, duplicate invalid dates, unsupported currency, unsupported report | All HTTP 400 `text/html`; bare error page shows `Period dates must be valid ISO calendar dates`, `Period start must not follow period end`, `One complete period is required`, `Invalid ledger currency`, or `Invalid collection report`. No problem code, field guidance, or remedy. Focus is on `body`. |
| Finance, 390 px, English | Collection Ledger XLSX | Impossible date, unsupported currency, unsupported report | All HTTP 400 `text/html` with the same bare error-page behavior. |
| Auditor, 1440 px, Spanish | Both export routes and formats | The same deliberately invalid queries | All HTTP 403 `text/html` with `Finance role required`. Role denial takes precedence over invalid input. The error remains English despite `lang=es` session; focus is on `body`. |

The Finance account could open an authorized project page and see its rendered finance-export link. The Ledger page loaded, but its export link was absent in this fixture, so the invalid Ledger URLs were navigated directly. No request returned an attachment and Playwright observed zero downloads. The browser recorded zero uncaught page errors. The console contained expected failed-resource messages for 400/403 navigation and CSP inline-style warnings on error pages; those warnings are separate from business validation.

The deliberately duplicated project-finance query used two invalid date values, so this run establishes only that the request fails; it does not distinguish duplicate-specific handling from date validation. We did not inspect production audit storage. The route returned no successful artifact response, and no valid export was requested.

Raw, redacted observations are in [production-results.json](production-results.json). The replay script is [production-readonly.mjs](production-readonly.mjs).
