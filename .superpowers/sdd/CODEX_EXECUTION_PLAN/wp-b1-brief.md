# WP-B1 — Database façade and domain-boundary contract

## ID and objective

WP-B1. Keep `PortalRepository` and `V3Repository` as compatible façades while extracting stable shared database infrastructure and defining dependency direction.

## Linked requirements

`SPEC-ARCH-001`, `V31-015`; prerequisite for lifecycle, finance/artifacts, security, industrial, business, and data-readiness packets.

## Preconditions and dependencies

Gate R0 must return PROCEED. Read root and `packages/database/AGENTS.md`, architecture-decomposition skill, and relevant plan/packet sections.

## Complexity and routing

Complexity B because transaction, audit, authorization/step-up, storage-key, retry, and sequence semantics have non-local invariants. Owner: `backend_domain` (Sol medium). Do not spawn subagents; parent controls later A extraction leaves.

## Exclusive owned write paths

- `packages/database/src/repository.ts`
- `packages/database/src/v3-repository.ts`
- new `packages/database/src/core/transaction.ts`
- new `packages/database/src/core/busy-retry.ts`
- new `packages/database/src/core/audit.ts`
- new `packages/database/src/core/authorization.ts`
- new `packages/database/src/core/storage-key.ts`
- new `packages/database/src/core/sequence.ts`
- narrowly scoped tests under `packages/database/**` only when required for extracted-core parity

## Forbidden write paths

`packages/database/src/schema.ts`; all migrations; finance/reporting/template modules; portal/UI; root/shared `tests/**`; docs/traceability; unrelated dirty files.

## Read-only interfaces

All current public exports/constructor signatures/method behavior, transaction boundaries, audit output/redaction, authorization and step-up behavior, storage-key validation, invoice/business numbering, exact-money consumers. No caller or schema may change without parent escalation.

## Required implementation behavior

1. Inventory public exports and hot internal dependencies.
2. Extract shared infrastructure into the six exact core modules by cohesive responsibility.
3. Keep both façade classes/API contracts stable.
4. Preserve current duplicate behavior until a later semantic convergence packet.
5. Preserve short transactions, bounded safe busy retry, exact audit/authorization/storage/sequence invariants.
6. Avoid circular dependencies and do not reinterpret financial history.

## Tests and acceptance

Use characterization tests before any behavior-affecting extraction and show RED only for new intended guards; mechanical moves may rely on pre/post parity evidence. Run narrow package tests, typecheck, integration, invariants, security, schema parity/database checks as relevant, and build. Public API inventory and behavior must remain unchanged.

## Handoff

Write full report to `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-b1-report.md`: summary, exact files, public API inventory result, commands/results, migrations (none), preserved invariants, unresolved risks, requirement IDs, and any interface change needed. Return short status only.
