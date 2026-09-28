# Report attachment download UI — independent candidate browser QA

Candidate `e89e7fa`, 2026-09-28. Chromium ran against the shared disposable portal at `127.0.0.1:4174` using fresh, isolated browser contexts. All records and files in these checks were synthetic and created through the web app. No production record changed.

The Worker created a daily report through the browser form, uploaded a UTF-8 text attachment through the report form (HTTP 201), and downloaded it through the new inline handler (HTTP 200). The browser download had the expected filename, `text/plain` type, attachment disposition, and no page exception.

| Role, locale, viewport | Failure exercised | Browser result |
| --- | --- | --- |
| Worker, EN, 390 × 844 | Intercepted typed 409 `REPORT_ATTACHMENT_DOWNLOAD_NOT_READY` | Explained processing/unlinked state, offered report review, focused the inline notice. |
| Manager, ES, 1440 × 900 | Intercepted typed 404 `REPORT_ATTACHMENT_DOWNLOAD_NOT_FOUND` | Spanish cause and report-review link, focused inline notice. |
| Owner, PT-BR, 390 × 844 | Intercepted typed 500 `REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED` | Portuguese safe guidance with reference, report-review link, focused inline notice. |
| Worker, EN, 390 × 844 | HTTP 200 with HTML instead of a permitted attachment | `REPORT_ATTACHMENT_DOWNLOAD_INVALID_RESPONSE`, focused inline notice; no blob opened. |
| Worker, EN, 390 × 844 | Browser network failure | `REPORT_ATTACHMENT_DOWNLOAD_NETWORK_UNAVAILABLE`, focused inline notice and retry guidance. |
| Worker, EN, 390 × 844 | Real sign-out in a second browser tab after report load | GET returned typed HTTP 401 `REPORT_ATTACHMENT_SIGN_IN_REQUIRED`, then the old tab showed sign-in guidance and a focused inline notice. |
| Worker, EN, 390 × 844 | Slow intercepted transfer, then navigation to report list | The GET failed with `net::ERR_ABORTED`; no stale notice appeared on the destination page. |

The report detail page has no `.bottom-nav`. At 390 px, every focused notice fit within the visible viewport; there was no horizontal overflow. The report stayed open and retained its scroll position for inline failures. Each intercepted HTTP failure produced Chrome's expected “Failed to load resource” console entry for its 404/409/500 status; page exceptions were absent. Cropped, synthetic notice screenshots and redacted observations are in `matrix.json` and `local-cases.json` in this folder. The full report ID, document ID, credentials, and file bytes are omitted.

The disposable fixture had no verified customer signed-copy document. One customer period report was approved through the browser, but its PDF remained queued, so the signed-copy preview link was not reachable in this run. That flow still needs independent browser evidence once a ready, verified synthetic signed copy is available.
