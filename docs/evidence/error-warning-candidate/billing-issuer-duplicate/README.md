# Duplicate invoice issuer code — candidate browser evidence

Run on 2026-09-27 against the isolated candidate build and disposable Playwright database. Commit hash: pending release commit.

The Owner created one invoice issuer, reopened the Spanish billing setup form, then tried to create another issuer with the same code. The enhanced action returned a typed 409 `BILLING_ISSUER_CODE_EXISTS` with a `code` field error and `review_billing_setup` remedy. At 390 and 1440 px, the form retained code, legal name, currency, and address; the code field was marked invalid, focused, and visible. Its adjacent Spanish field error was linked by `aria-describedby`. The database still contained one row for that code with the original legal name. No page or console errors were observed.

Playwright result: **2 passed**, **2 intentional project skips** in 56.1 seconds. The [phone notice](duplicate-phone-390.png) and [desktop notice](duplicate-desktop.png) are notice-only crops; the [phone summary](duplicate-phone-390.json) and [desktop summary](duplicate-desktop.json) contain only stable assertion results. The unique disposable issuer code, form text, credentials, raw response, and full-page screenshots are excluded.
