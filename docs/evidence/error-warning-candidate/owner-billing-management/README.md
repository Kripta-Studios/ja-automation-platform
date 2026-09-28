# Owner billing and management problem browser QA

Candidate: base commit `8669fa3` with the shared worktree's uncommitted problem and UI changes. Run against the Playwright disposable SQLite database and local Chromium servers on 2026-09-26. No production business data was changed.

Command:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/owner-billing-management-problem-browser.spec.ts --project=phone-390 --project=desktop
```

Result: **8 passed, 0 failed, 6 intentionally skipped** (each viewport case is registered in both projects and skips the other project). The browser widths were 390 px and 1440 px.

Follow-up after the management notice visibility fix: **4 passed, 0 failed, 4 intentionally skipped** with `--grep 'management changed record'`. This rerun covered both widths with normal storage and with the management scroll storage key denied; the two runs were separate, so the full suite was not repeated after this fix.

Final focused rerun after the duplicate alert CSS correction: **4 passed, 0 failed, 4 intentionally skipped** with the same command and widths. It also asserted exactly one visible problem notice and one visible assertive problem alert, with the global copy hidden while the inline copy is focused.

The spec checked these typed POST responses and corresponding visible cause and remedy text on both widths:

| Code                            | Scenario                                                   | Observed                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLING_DELETE_RECORD_CHANGED` | Stale draft invoice version                                | 409; Review invoice link; deletion reason retained; notice focused                                                                                                      |
| `BILLING_DELETE_REASON_INVALID` | Blank reason after whitespace                              | 400; reason field retained and focused                                                                                                                                  |
| `BILLING_DELETE_INVOICE_ISSUED` | Issued invoice deletion request                            | 409; safe review link; no deletion form exposed                                                                                                                         |
| `BILLING_EMAIL_PDF_NOT_READY`   | Issued invoice PDF pending                                 | 409; review remedy; recipient retained; notice focused                                                                                                                  |
| `BILLING_EMAIL_PDF_TOO_LARGE`   | Disposable PDF metadata above 20 MB limit                  | 409; contact Finance remedy; recipient retained; notice focused                                                                                                         |
| `MANAGEMENT_OPERATION_INVALID`  | Invalid Owner management operation, Spanish UI             | 400; review updated record link; reason, focus, and scroll retained                                                                                                     |
| `ACTION_MANAGEMENT_CHANGED`     | Stale expense version submitted from a scrolled Owner form | 409; inline review remedy; reason retained; notice focused and fully inside viewport; scroll remained within 500 px of the pre-submit position; record remained present |

Finance and worker received 403 on Owner management. Finance could not access the approved invoice deletion form. The draft and issued invoices remained in their original states after blocked deletion. No email was queued. The ready PDF metadata was fabricated only in the disposable database to trigger the size blocker; no PDF was generated or sent. The issued invoice deletion case used an injected form to exercise the server because the interface correctly omits that control.

The fresh candidate run had no page errors or unexpected console errors in the management flow. Earlier CSP inline-style errors disappeared after the candidate stylesheet change. Each PNG here crops only the problem notice. Paired JSON files record code, viewport, response status, route, and method; they contain no cookies, tokens, request bodies, account names, or invoice IDs. Playwright traces were not copied into this evidence directory.

The follow-up also confirmed that denying only `management-form-scroll:` session storage keys does not stop a conflict submission or focus recovery. Denying the entire session storage API caused an unrelated `RecordBrowser` hydration error in an exploratory run, so the retained focused test limits denial to the management key. The final focused run confirmed the duplicate global assertive alert was hidden when the inline alert rendered.

`BILLING_DELETE_SOURCE_LINES_RESERVED` and `BILLING_EMAIL_DELIVERY_UNCERTAIN` were not exercised in this browser suite. The first needs a Finance draft with reserved source lines; the second needs an existing uncertain SMTP outbox event. Both need separate disposable fixtures to avoid a real invoice or email transition.
