---
name: finance-integrity
description: Review or implement J&A financial workflows with exact-money, reconciliation, idempotency, artifact lifecycle and immutable-history constraints. Use for billing, invoices, accounting packs, rates, payments, exports and finance migrations.
---

# Finance Integrity

Mandatory invariants:

- exact money representation;
- deterministic period boundaries/timezones;
- no double billing on retries;
- issued/finalized history is immutable except explicit void/credit/versioned corrections;
- every source snapshot can be reconciled to included records;
- artifact status is truthful and per-format;
- PDF failure cannot block other export formats;
- stale pack/snapshot behavior is explicit (refresh/new version), not silently reused;
- semantic filenames;
- export/download authorization;
- retries are idempotent;
- partial write failures roll back or produce recoverable, explicit state.

Test both happy paths and forced failures.
