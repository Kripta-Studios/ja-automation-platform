# Closeout browser QA — candidate `92c5de1`

Actual headless Chromium against the disposable Portal preview on 27 September 2026. The fixture was created by Playwright global setup. No production data was used. The browser interacted with the rendered form; the database was queried read-only before and after the blocked submission.

## Stale Finalize race

Owner opened a lifecycle project's closeout at 390 px in English and at 1440 px in Spanish. In each case, Owner prepared and confirmed the draft through the UI. Finance then refreshed the same draft in a separate authenticated browser context while Owner's Finalize form remained open. Owner submitted Finalize without reloading.

| Check                             | 390 px, English                                                                     | 1440 px, Spanish                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Prepare, confirm, Finance refresh | Enhanced action success, `status: 200` each                                         | Same                                                                              |
| Stale Finalize response           | Enhanced HTTP 200 envelope, failure `status: 409`, `CLOSEOUT_CONFIRMATION_REQUIRED` | Same                                                                              |
| Visible cause                     | “Confirm the exact current client snapshot before finalizing the closeout.”         | “Confirma la copia exacta y actual para el cliente antes de finalizar el cierre.” |
| Remedy                            | “Review current closeout”, same closeout route                                      | “Revisar el cierre actual”, same route                                            |
| Focus and scroll after 1.1 s      | Notice focused; top 82 px, header bottom 70 px; scroll 1433 → 314 px                | Notice focused; top 84 px, header bottom 72 px; scroll 779 → 310 px               |
| State after block                 | Closeout URL retained; draft still active; revision state and timestamp unchanged   | Same                                                                              |
| Browser diagnostics               | No page exceptions, console errors, or failed requests                              | Same                                                                              |

The Finalize form has no editable fields, so value retention does not apply. It remains mounted after the failure. The old confirmed view is not automatically replaced with Finance's refreshed snapshot; the remedy navigates to the current closeout. This is a remaining UX observation, not evidence of a write or permission bypass. The page has no tab selection to retain.

## Owner reopen reason

On the same disposable 390 px project, Owner confirmed the refreshed draft, finalized the closeout, and used the rendered Reopen form. A single whitespace character passed native `required` validation and reached the server. The enhanced response was HTTP 200 with failure `status: 400` and `CLOSEOUT_REOPEN_REASON_REQUIRED`. The UI said “Enter a reason of 1 to 2000 characters before reopening” and offered “Enter a reason”; the whitespace input was retained and the database state did not change. A subsequent valid QA reason produced action success `status: 200` and reopened the project. No page exception occurred.

The active keyboard target after 1.1 s was `#validation-reopen-6-summary`, with its top at 776 px in the 844 px phone viewport. The captured notice image is 153 px tall. This indicates the summary likely extended below the viewport; the run did not capture the target's bottom or full viewport screenshot, so treat it as a focus visibility issue for a dedicated retest. The project was left reopened in the disposable fixture.

## Role denial

Manager at 390 px and Worker at 1440 px each received HTTP 403 on the closeout route. Both saw “Access restricted”, the Finance or Owner role requirement, and “Contact an owner”. No JavaScript page exceptions occurred. Chromium logged the expected 403 failed-resource console entry for the denied navigation.

## Artifacts

- [Machine-readable redacted observations](results.json)
- [Reopen observations](reopen-results.json)
- [390 px English notice](closeout-stale-finalize-phone-390-notice.png)
- [1440 px Spanish notice](closeout-stale-finalize-desktop-notice.png)
- [390 px reopen reason notice](closeout-reopen-reason-phone-390-notice.png)

Screenshots include only the error notice. Fixture identifiers in JSON paths were replaced with `[REDACTED-ID]`. No credentials, account addresses, or client data are stored in these artifacts. This covers one stale finalization race, two permission checks, and Owner reopen reason validation; it does not validate document-source races or Finance's direct Reopen denial.
