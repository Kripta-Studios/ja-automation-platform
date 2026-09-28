# Export recovery browser evidence — 2026-09-26

Chromium ran against fresh candidate builds and disposable seeded SQLite/document storage at 390×844 and 1440×900. All **14 intended cases passed** across the Accounting Pack historical, pending, terminal retry, and temporary-service scenarios and the Worker Statement failure, retry-limit, and lost-response scenarios. The first 12-case run sequence was 8/12, then 3/4 focused rerun, then 1/1 isolated phone rerun; the separate artifact-service 503 run passed 2/2. The four initial failures came from QA fixture assumptions: the seed's August pack became stale after its queued canonical work, and `retryable` describes failure type independently of the five-attempt cap. The corrected tests use the real worker to finish seed jobs, request a current August version through the browser, and assert the UI/API retry cap separately. No product files or production data were changed by this QA lane.

## Accounting Pack

- Finance generated a current, reconciled August version through the form, finalized it, then downloaded historical XLSX bytes with HTTP 200 after later source changes. A ready XLSX click also returned 200.
- A subsequent source change yielded HTTP 409 `ACCOUNTING_PACK_SOURCE_CHANGED` with `review_accounting_pack`, a correlation ID, a visible focused explanation, and a review action. The GET left pack runs, revisions, exports, and jobs unchanged at both widths.
- A real durable PDF renderer failure across five attempts left PDF failed and XLSX ready. Direct PDF GET returned typed 409 `ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE`. Finance and Owner saw the safe cause, review link, and Retry PDF. Auditor saw contact-only guidance without Retry, and Worker received private 404. One explicit Retry POST returned 202, queued PDF only, and preserved the ready XLSX hash and byte length.
- A pending download returned typed processing guidance; role boundaries remained non-enumerating. Evidence: `*-accounting-postfix.json`, `*-accounting-retry-postfix.json`, and cropped `*-accounting-*-postfix.png` screenshots.
- One ready XLSX GET was intercepted with the typed 503 `ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE`. At both widths the interface showed a focused, visible status-uncertain explanation and Check pack status. The Ready filter, route, row, and scroll position remained; phone scroll stayed 1112→1112 and desktop 381→381. No retry POST or new run, revision, export, or job appeared. After status refresh, the real XLSX GET returned 200. Evidence: `*-accounting-service-503-postfix.json` and cropped notices.

## Worker Statement

- A real fenced worker publish failure left PDF failed and CSV ready. The failed notice explained the cause without exposing renderer internals, stayed focused in the viewport, and preserved scroll on Retry. Failed download returned typed 409 `WORKER_STATEMENT_RENDER_FAILED`; explicit Retry returned 202 for the same PDF artifact's next attempt.
- After five real failed attempts, the Retry control was absent, the notice directed the Worker to the owner or finance team, and a direct retry POST returned typed 409 `WORKER_STATEMENT_RETRY_LIMIT` with `contact_finance_owner`. The persisted `retryable=1` remains a failure-class fact; attempt 5/5 is the separate block.
- A Generate POST committed HTTP 202 and two artifacts while its browser response was dropped. The uncertain notice was focused and visible, the status link retained the selected period, and Check statement status found the same artifacts without another POST. Evidence records exactly one POST and two artifact rows.
- The earlier export/role browser run also passed 2/2: invalid period typed 400 with field errors, premature retry typed 409, a foreign Worker got 404, and Owner/Finance got 403 for the private statement list. Evidence: `*-worker-retry-postfix.json`, `*-worker-retry-limit-postfix.json`, `*-worker-uncertain-postfix.json`, `*-worker-statement.json`, and cropped synthetic-record notices.

## Browser diagnostics and source identity

No uncaught page exceptions appeared. Outside the explicit Accounting artifact interception, repeated HTTP 503 responses were exclusively `GET /j-aautomation/app/api/offline/identity` in the disposable configuration with offline mode disabled. Console resource errors reflect those requests and the intercepted artifact 503, with occasional inline-style CSP messages in earlier runs. The specs recorded failed-response method and redacted path to attribute them. Ignored `test-results/` traces were diagnostic only and are not release evidence; retained screenshots are cropped to synthetic records/notices.

The artifact 503 was a one-request browser interception matching the server's typed contract. It verifies client recovery behavior; it does not exercise an actual server outage path.

Source SHA-256 fingerprints for this candidate:

| Source                                                                            | SHA-256                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/portal/src/lib/PortalShell.svelte`                                          | `43d53df17223ca6539e50951b562845dd25195c6f350b35aba4798abd27efddd` |
| `apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte` | `d89212900f67ce2bb390e301822abed8b0e9a7c9eadca034dc9ec7237def0546` |
| `apps/portal/src/routes/app/api/worker-statement/worker-statement-api.ts`         | `58a81f5c489341e9ffe54c6690fb1b0ef8d7964ddd8b6bbffcd9eb580e86089c` |
| `apps/portal/src/routes/app/api/accounting-pack/accounting-pack-api.ts`           | `b15b506871a318213e3b209ad9431e43c73190d276456f1facbc17354e12b5b7` |
| `packages/database/src/v3-repository.ts`                                          | `5d1db8d663076a93e20bd5bfd665f88e2800b3d668e90a24c048aafa5e846098` |
