# Expense export deployed browser baseline

- Captured 2026-09-27 in actual headless Chromium against deployed `https://j-aautomation.com/j-aautomation/app`.
- Finance English at 390 px signed in through the rendered page. The browser opened the custom export disclosure, entered valid but reversed dates, and clicked its rendered CSV link. This was a GET download attempt only; no expense or other business record was changed. Credentials were read at runtime from the private test-account file and are absent from evidence.
- Reproduce with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH node docs/evidence/error-warning-candidate/expense-export-production-baseline/production-readonly.mjs`.

The rendered CSV link preserved `from=2026-09-20&to=2026-09-19`. Clicking returned HTTP 400 `text/html` and displayed `400 Choose a valid date range`. The browser navigated from Expenses to `/expenses/export`, so the open disclosure, entered dates, focus, and tab were lost. There was no CSV download, field guidance, or remedy link. A Content Security Policy inline-style console warning accompanied the error page; no JavaScript page exception occurred.

The Worker test account did not reach the workspace in this production run, so no Worker export result is claimed. `production-results.json` contains redacted DOM and network evidence; no export content or financial amounts were saved.
