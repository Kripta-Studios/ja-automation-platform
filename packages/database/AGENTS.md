# Database / Repository Instructions

These instructions apply to `packages/database/**`.

## Domain decomposition

Do not continue expanding monolithic repository files. Move behavior into cohesive domain modules while preserving the modular monolith, transactions, API contracts and tests.

Recommended boundaries include clients, projects, workers, planning, time, expenses, reports, industrial assets, technical changes, billing, invoices, accounting, documents, audit, jobs and data-readiness.

## Lifecycle rules

- Important entities need explicit lifecycle/state transitions.
- Clients/projects/workers/configuration objects generally use archive/deactivate/restore when they have history.
- Financial history must not be hard-deleted after issuance/finalization.
- Draft deletion is allowed only when dependency/invariant checks prove it is safe and the audit trail is appropriate.
- Version or supersede artifacts whose historical version matters.

## Financial integrity

- Never use JS `number` arithmetic for money if it can introduce binary floating-point error. Keep minor units / bigint semantics consistent.
- Wrap related writes in transactions.
- Preserve reconciliation invariants.
- Idempotency is required for retryable jobs and externally triggered writes.

## Data-readiness

Build point-in-time-safe infrastructure:

- `project_state_snapshot` with `as_of`/snapshot timestamp and schema version;
- immutable business-event history for material state transitions;
- feature-definition/version metadata;
- training export metadata and reproducibility hashes;
- model registry and historical predictions;
- no future-derived values in historical snapshots.

Never backfill historical snapshots using facts that were not known at the historical timestamp unless they are explicitly marked as reconstructed/non-point-in-time and excluded from leakage-sensitive training.

## Migrations

Test migrations against both a fresh DB and a representative pre-migration DB. Preserve old data. Avoid destructive column repurposing.
