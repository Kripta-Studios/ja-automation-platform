# Invoice stream prerequisite browser evidence

Candidate source: `41ffab8` (isolated build and disposable SQLite fixture). No production record was created or changed. The suite creates one QA project without a billing stream in the disposable fixture, then uses the actual Billing interface under Finance and Owner sessions. Invoice and billing-rule row counts are checked before and after the browser actions.

Run with Node 24 and the installed Chromium:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH \
  node_modules/.bin/playwright test \
  -c tests/e2e/billing-invoice-stream-prerequisite.browser.config.ts
```

The browser spec rebuilds and serves the candidate Portal, provisions fresh test credentials and SQLite data, and removes the fixture pointer, lock, database and preview server on exit. It checks Finance at 390 px in English and Portuguese, and Owner at 1440 px in Spanish. Every case checks the exact warning, visible and clickable remedy, retained project, warning focus, remedy focus on Project, warning/title/link unobscured by fixed chrome, document width, no Billing write request, no browser page or console error, and unchanged financial row counts. See [results.json](results.json) for redacted measurements.

`pre-fix-phone-390-diagnostic.jpeg` is a **pre-fix** viewport trace frame from candidate `5d60869`: the fixed header covered the top of the warning. It contains only disposable QA data. The three PNGs are **post-fix** screenshots of the isolated warning on `41ffab8`; they contain no names, record IDs or credentials. Full Playwright traces were omitted because raw traces include authentication and fixture identifiers.

This focused suite tests the prerequisite path for a selected project with no active stream. It does not create a billing stream or invoice through the browser.
