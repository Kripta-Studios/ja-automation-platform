# Localized PDF lost-response recheck

Disposable Chromium fixture, candidate build, 26 September 2026. Run:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/localized-pdf-recovery-browser.spec.ts --grep 'older ready PDF|lost PDF Generate responses' --reporter=line
```

Result: **4 passed**, 12 skipped by the test's viewport guard. The passing cases cover 390 px phone and 1440 px desktop.

| Case                                                    | Browser and server evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old Ready variant after a new Generate response is lost | The first English PDF was Ready; a disposable report edit made a new Generate POST return 202 and create a distinct Queued variant. The browser response was aborted and its status recheck was served the old Ready collection. The UI showed focused `LOCALIZED_PDF_REQUEST_UNCERTAIN` with Refresh, kept Generate disabled, and did not claim the stale variant was the new result. Refresh then showed Queued. Exactly one new POST occurred. |
| Typed status recheck after a lost Generate response     | The real collection API supplied `PDF_SIGN_IN_REQUIRED`/401 for an anonymous request and `PDF_DOWNLOAD_UNAVAILABLE`/404 for a missing record. Those response envelopes and statuses were routed into the browser's rechecks after two separately accepted 202 POSTs whose browser responses were aborted. The UI showed the focused sign-in link and access/Refresh remedy. One POST per locale, with no duplicate POST.                          |

JSON files record the status codes, codes, remedy IDs, POST counts, focus, page exception count, and expected console-error count. Screenshots crop to the notice, so they contain no account, project, or report details. Console errors were limited to simulated `net::ERR_FAILED`, the deliberately fulfilled 401/404 responses, and the fixture-only offline identity 503. No page exceptions occurred. Browser route interception is used to reproduce a lost response and a stale or denied status recheck deterministically; the typed envelopes themselves were sourced from the running backend.
