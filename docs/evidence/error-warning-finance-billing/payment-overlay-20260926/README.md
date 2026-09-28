# Approval and payment browser rerun — 2026-09-26

An isolated Chromium run on a disposable database passed four real browser cases: Owner approval and Finance payment on 390 px phone and 1440 px desktop. Forms were clicked and submitted; the stale approval kept its tab and focused one localized notice. A voided invoice rejected a new payment with `BILLING_PAYMENT_INVOICE_UNAVAILABLE`, kept the attempted payment values, and showed one focused notice without adding a payment. The run used one Playwright worker and did not authenticate to or write production.

The tested source started at HEAD `dbe849956c150c76dbea0898de1605e3daaf1006` with tracked diff SHA-256 `6170630b68c95eec0c142fb874ff4f55aa0a3173ed3a2662cc4a74b41f4d6f56`. The isolated overlay used BillingSection SHA-256 `25dde7552e01bc1b66ef3a5ec7d0bef9b642264a5b64a66dd12a745a0da8bf53` and E2E spec SHA-256 `b5eaad487bee2f7183c6f77baf776c562bba9360c82962aff4b1c30bc5e37a4e`. Later BillingSection edits are outside this exact capture and need their own verification.

The twelve files here are the passing rerun's screenshots, sanitized step JSON, and HTTP status/path lists. They include only disposable fixture identifiers. `SHA256SUMS` records each file hash. The older parent-folder finance manifest describes a different build and remains historical.
