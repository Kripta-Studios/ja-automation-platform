# Test Instructions

These instructions apply to `tests/**` and E2E configuration.

## Tests are product evidence

Do not test only that handlers exist. Exercise the real lifecycle and failure modes.

Required examples include:

- accounting pack create → queued → processing → independent artifact statuses → download;
- PDF failure while XLSX/CSV/JSON still succeed;
- pending export returns intentional response, not 500;
- stale/accounting-pack regeneration/version behavior;
- invoice template registry and all mandatory template families;
- archive/restore and safe draft deletion rules;
- RBAC/IDOR around private artifacts and financial data;
- finance/admin mobile forms;
- mobile drawer with full labels;
- report edit visual/semantic structure;
- accessibility and keyboard flow;
- point-in-time data-readiness leakage invariants.

## Required viewports

Maintain E2E coverage for at least:

- 360×800
- 390×844
- 430×932
- 768×1024
- desktop 1440×900 or equivalent

Do not infer mobile quality from `scrollWidth <= innerWidth` alone. Assert visible labels, sensible stacking, tappable controls and absence of clipped/overlapped content.

## Test quality

- No arbitrary long sleeps when a deterministic readiness condition can be awaited.
- Do not weaken or delete a test to accommodate a regression.
- Tests must use deterministic fixtures and isolation.
- Add regression tests for every confirmed production bug fixed.
