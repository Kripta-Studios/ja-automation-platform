# My Pay and Accounting Pack browser QA

Candidate product source: `339c533`. Run date: 2026-09-28. This was one portal-only build at a loopback preview backed by the Playwright disposable SQLite and document root. All sign-ins used the real login form. No production state was changed.

## My Pay

The Worker generated PDF and CSV statements from the My Pay controls for the August 2026 period in English, Spanish, and Portuguese. The normal durable service runner processed the queued jobs in the disposable fixture; no artifact status or immutable provenance row was edited directly. All six ready links produced Chromium download events, HTTP 200 responses, the expected PDF or CSV MIME type, `attachment` disposition, and a filename with the selected period and correct extension. Private file bytes and worker names were not retained.

The ready PDF link was then exercised with browser-intercepted typed 401, 403, 404, failed 409, and 503 responses, plus a network abort and a malformed 200 response. These are **injected UI cases**, separate from the real 200 downloads. All 21 EN/ES/PT notices used translated cause and remedy text, received keyboard focus, stayed clear of the fixed phone navigation at 390 px, avoided horizontal overflow, and kept the selected period URL. The desktop check used 1440 px. The browser console recorded expected failed-resource entries for the injected responses and abort; there were no page-script exceptions. [Detailed My Pay observations](my-pay-results.json) and cropped [English 503](en-503-notice-1440.png) and [Portuguese 409](pt-409-notice-390.png) notices contain no statement content.

A middle click on an intercepted 404 PDF link kept one browser tab, focused the inline notice, and did not open raw JSON. A real signed-out direct artifact request returned typed 401. A foreign Owner artifact request returned the same typed 404 as a missing artifact. Owner and Finance statement-list requests returned typed 403; a project manager could open My Pay and list their own statements. Intercepted pending and integrity 409 download failures also showed focused, specific remedies. [Role and middle-click observations](worker-middle-role-results.json) and the [cropped phone notice](worker-middle-click-404-notice-390.png) record these checks.

### Recovery defect found

When an intercepted failed-artifact 409 is followed by a failed status-refresh GET, the notice says “Retry statement” while the stale PDF link still says Ready and **no Retry statement button exists**. The user cannot take the offered next step. The UI should treat the artifact state as unconfirmed until refresh succeeds, offer a working status recheck, and show Retry only after the refreshed artifact is confirmed failed and retryable. The structured observation is `worker-stale-ready-after-409-and-refresh-503`.

Two smaller wording issues remain in this source: the 401 notice repeats the complete sign-in sentence as both explanation and link label; the 403 remedy points to the workspace but its label says “Check statement status.” Use action labels that describe the actual destination.

## Accounting Pack

The disposable fixture contained one real stale Accounting Pack run and no ready export rows. Through real Owner and Finance browser sessions, invalid format and missing pack GETs returned typed 404, while GET and valid-key retry on that stale pack returned typed `ACCOUNTING_PACK_SOURCE_CHANGED` 409. Invalid retry keys returned typed 400 with an `idempotencyKey` field error. Signed-out GET and retry returned typed 401. Manager and Worker requests for the existing pack returned the same typed 404 as a missing pack. Every JSON error carried `private, no-store`, a nonempty correlation ID, and a matching `x-correlation-id` header. [Redacted network matrix](accounting-pack-results.json).

The Accounting register was visible to Owner and Finance. Because no ready Accounting Pack export existed in this fixture, a real export-click failure and a 503 setup failure were not reachable through its UI in this run. No export row or immutable trigger was bypassed to manufacture one. Project manager statement download success and a naturally failed worker artifact were likewise outside this focused run; their role access and injected failure presentation were checked as described above.
