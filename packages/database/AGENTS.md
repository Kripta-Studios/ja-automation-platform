# Database / Repository Instructions

These instructions apply to `packages/database/**`.

## Domain decomposition

Do not continue expanding monolithic repository files. Move behavior into cohesive domain modules while preserving the modular monolith, transactions, API contracts and tests.

Recommended Client Essential boundaries include identity, clients, projects, assignments, time, expenses, daily/technical reports, compensation/project finance, billing, invoices/payments, accounting exports, documents, audit and jobs. Preserve existing post-core modules, but do not create industrial-platform or data-readiness boundaries merely to satisfy deferred roadmap scope.

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

## Deferred data-readiness

ML/data-readiness infrastructure is post-core roadmap and must not be started unless explicitly commissioned. If Essential work touches existing point-in-time records, preserve their `as_of` meaning and never introduce future-derived facts into historical snapshots.

## Migrations

Test migrations against both a fresh DB and a representative pre-migration DB. Preserve old data. Avoid destructive column repurposing.
