# Supplier browser storage recovery

On 2026-09-26, the isolated candidate passed the focused Chromium test at 390 × 844 and 1440 × 900: **2 passed, 2 viewport skips**. The run used the disposable Playwright database and no production records.

The test made `sessionStorage.setItem`, `getItem`, and `removeItem` throw `SecurityError` for the Supplier submission-position key. A Supplier Coordinator still saved one valid team-hours batch (HTTP 200). A second batch exceeding the daily limit returned HTTP 400 with `SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT`; the notice appeared, the date field received focus inside the viewport, values and selected tab were retained, and there were no page exceptions or unexpected console/server errors. The fixture-disabled offline identity endpoint may return its expected 503 during navigation.

Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/supplier-storage-blocked-browser.spec.ts --project=phone-390 --project=desktop --reporter=line`.

The [phone](phone-390.json) and [desktop](desktop.json) summaries contain only viewport, status, code, focus, retained-value, and error-count fields. No screenshot, raw request body, session value, credential, or trace was copied into this evidence folder.
