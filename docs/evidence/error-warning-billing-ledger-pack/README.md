# Billing ledger and Accounting pack browser captures

The `pack-*` files are the 390 px English and 1440 px Spanish Accounting pack cases in the [wave 11 browser matrix](../error-warning-wave11-manifest.md). Both passed the final strict scroll assertion on that frozen build. Their current file hashes are listed in the [wave 11 SHA-256 inventory](../error-warning-wave11-SHA256SUMS.txt). The phone trace also records a brief 1205 px scroll before restoration to 640 px; the final assertion was made after settling.

The `reversal-*` files are from an earlier disposable database run on built tree `be840f5f6d060f2e7d3a89bdf74a5b4022b6bc295002b194b5b2a4d379082b56`. The reversal case passed at 390 px English and 1440 px Portuguese: an over-balance native submission returned `BILLING_PAYMENT_AMOUNT_INVALID`, retained amount and reason, focused amount, linked to the selected invoice ledger, and kept the measured scroll. A permitted enhanced reversal saved one event; a worker was denied with typed `BILLING_FINANCE_REQUIRED`. These captures do not test the later source edits.

| Reversal capture | 390 px SHA-256 | 1440 px SHA-256 |
| --- | --- | --- |
| Notice screenshot | `c946263c889ec36e475734966501aee555ff14ec237bd6ac92a6a3c615edd3ef` | `feb4445ac3605e9a6c50c2649f20a705c9dbc17f61930bec21bcfa8166583bbd` |
| Sanitized steps | `289dfa09143529f012404ae018d24d007f544c8a611bc17bd48a45e9baca3974` | `78e6da5fe8587299bf22b3be455cfe3728b0276c6688ceb0700984d31517399c` |
| HTTP status and path | `e771dd65752b52beffef7ee3b94e15ea2d4ed77ac81951bac79b405e2e09a0cd` | `e771dd65752b52beffef7ee3b94e15ea2d4ed77ac81951bac79b405e2e09a0cd` |

Screenshots cover problem notices. JSON contains case steps, HTTP status, and path only; no production identifiers, credentials, query values, request bodies, or raw browser traces are included. Older red diagnostics and manifests whose pack screenshots were overwritten are preserved reversibly under `/tmp/ja-evidence-hold-20260926` and are not part of this release evidence.
