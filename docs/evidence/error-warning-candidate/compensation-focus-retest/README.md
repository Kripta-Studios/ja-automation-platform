# Compensation stale-date focus retest — pass

Actual Chromium on 27 September 2026 against a fresh disposable Portal preview, with candidate parent `ef58db1` plus reviewed settlement and Finance focus patches. The tracked candidate diff had SHA-256 `a09532f74e129837f1f2f79a7ee8c9691684542e7a92a201f242886c2b7b60aa` from `git diff HEAD --binary`. The screenshots and JSON contain no actual customer records, dates, IDs, credentials, or account addresses.

Owner opened the expected-payment form; Finance saved a new date in a second authenticated browser context; Owner submitted the stale form. This was run independently at 390 px in English and 1440 px in Spanish, using separate seeded settlements. Both native submissions returned HTTP **409** and `FINANCE_SETTLEMENT_PLANNING_CHANGED`. The notice explained that the settlement changed and linked to review it. The current and attempted dates appeared in the conflict panel; the attempted entry remained in a disabled input with no Save button.

Finance's value remained in the database after the blocked Owner submission, with **no additional planning audit event**. The project selection, Economic view, and Settlements source stayed selected. A fresh view carried the new previous-date token, and a subsequent authorized save returned HTTP 200, updated the date, and added exactly one audit event.

| Viewport         | Focused notice after 1.1 s | Sticky header | Viewport bottom | Result        |
| ---------------- | -------------------------- | ------------- | --------------- | ------------- |
| 390 px, English  | 85–273 px                  | bottom 70 px  | 844 px          | Fully visible |
| 1440 px, Spanish | 88–235 px                  | bottom 72 px  | 900 px          | Fully visible |

The problem notice is keyboard focused, and its heading, cause, and remedy are readable in both [phone](stale-date-phone-390-notice.png) and [desktop](stale-date-desktop-1440-notice.png) screenshots. There were no JavaScript page exceptions or leaked stacks. Chromium logged expected failed-resource lines for the 409 action and the disposable preview's 503 offline-identity endpoint. [Redacted observations](results.json) record statuses, retention, focus geometry, and database assertions; attempted and current dates are represented by booleans, not literal values.
