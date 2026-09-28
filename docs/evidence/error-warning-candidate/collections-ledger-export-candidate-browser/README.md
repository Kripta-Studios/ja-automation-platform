# Collection Ledger export: candidate browser evidence

- Candidate code: `33091be`.
- Actual Chromium on a newly seeded disposable database and candidate portal at port 4175; no production writes.
- Run with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-finance-export-candidate-browser/playwright.config.ts --grep ledger`.
- Result: 4 browser tests passed. Owner at 390 px in English; Finance at 1440 px in Spanish and 390 px in Portuguese; Manager denied.

Direct authenticated CSV API requests with invalid calendar dates, reversed dates, and duplicate filters returned 400 `application/problem+json` with stable codes, field keys, a permitted filter-review remedy, and correlation IDs. Invalid requests produced no audit writes. Manager requests returned role-specific 403 before filter details. Valid CSV and XLSX requests returned their correct MIME types and nonempty attachment bytes; XLSX started with `PK`. A real UI CSV download also completed and removed the earlier problem notice.

For the visible UI recovery check, the test set the search field to `DEMO`, confirmed the export link remained available, then duplicated `q` in the client-held link. The real API response appeared as a translated in-page notice; the search text was retained, the notice received focus, and a linked field summary focused the search input when clicked. The remedy returned to ledger filters. Console and page errors were empty. The notice was visible on both widths; at 390 px its bottom was 843.66 px in an 844 px viewport, leaving almost no bottom margin.

The browser screenshot files isolate the notice and linked issue list, so no ledger rows or financial values are shown. JSON files record redacted codes, geometry, response status/MIME categories, audit counts, and download filenames. The duplicate-link condition is a stale or malformed client-link simulation; direct API validation covers the actual invalid date and range requests.
