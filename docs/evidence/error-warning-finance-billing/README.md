# Finance and billing browser QA

Chromium Playwright against a disposable seeded database, tested at phone 390 px and desktop widths on 2026-09-25. The portal was built and served from an isolated source copy to keep concurrent builds from replacing its assets.

- Full error and warning suite: **10/10 passed**. Owner and manager approvals, Finance and owner invoice payment, and Finance preview in Spanish and Portuguese were exercised through visible forms.
- Payment recovery: a normal payment succeeded without a scroll jump; a stale payment returned a typed error, restored amount and reference in the invoice drawer, disabled retry for the void invoice, and left the payment count unchanged.
- Reused payment key: **2/2 passed** in a separate phone and desktop run. A different amount with the prior successful key returned a failure envelope with status 409 and `BILLING_IDEMPOTENCY_REUSED`; the drawer retained entered values, disabled retry, and recorded no extra payment.
- Finance preview: invalid fields and payer conflict showed localized notices with retained form values and focused validation. A worker request to the Finance preview returned HTTP 403.
- Payer-conflict scroll position was unchanged through response and focus: phone **1746 → 1746 → 1746 px**; desktop **1470 → 1470 → 1470 px** (submit, response, focus).

The adjacent PNGs mask entered reasons and payment references. The `*-trace.json` files contain only test steps and UI outcomes; `*-network.json` lists HTTP statuses and paths. Browser trace ZIPs, cookies, and session credentials are excluded.
