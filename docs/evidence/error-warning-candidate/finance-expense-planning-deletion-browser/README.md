# Finance expense planning after draft deletion: browser QA

Candidate product commit: **`85b696d`**. Environment: disposable local SQLite database and portal preview, actual Chromium sessions, no production access. Result: **3/3 browser tests passed** in 29.4 seconds.

| Finance viewport and locale | Native planning save after deletion               | Focus and safe viewport                         |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| 390 × 844, English          | 404 `FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE` | Notice and recap 85–450 px; safe area 78–756 px |
| 1440 × 900, Spanish         | Same                                              | 88–357 px; safe area 80–884 px                  |
| 430 × 932, Portuguese       | Same                                              | 85–470 px; safe area 78–844 px                  |

## Actual browser journey

Owner created a clearly marked QA project and Worker assignment through Projects, then recorded a draft expense through Expenses without a receipt. Finance opened the same draft's Commercial planning dates and entered two future dates. While that form stayed open, Owner deleted the draft through its Expenses **Delete** form. Finance submitted the stale planning form natively. No request was intercepted.

The response was HTTP 404 with the stable code and retained dates, without generic validation copy. A global alert explained that the expense was no longer available and no planning dates were saved. A visible localized recap showed both entered dates. Keyboard focus moved to the notice, which was fully visible above the fixed phone navigation; the Commercial view and selected project stayed open. **Review current expenses** opened the Finance Commercial list in the chosen language. Database checks confirmed the deleted expense stayed absent and the failed save and remedy added no audit event. Owner and Finance pages had no console or page exceptions.

This test covers Owner deletion and Finance planning editing on a never-submitted draft. It does not cover a concurrently archived/locked expense, enhanced submission, or other roles. Dates and QA identifiers in JSON are non-sensitive; fixture IDs are replaced with `[qa-id]`. Screenshots show only the alert and entered-date recap. No credentials, cookies, or raw traces are stored.

The reusable [browser spec](candidate.spec.ts) and [config](playwright.config.ts) use the standard disposable global setup and require one portal build before preview.
