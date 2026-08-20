# WP-B1 Handoff Report

## Summary

Implemented the first database-boundary tranche while retaining `PortalRepository` and `V3Repository` as the package's compatible public façades. Shared database infrastructure is now separated into six cohesive `src/core` modules for immediate transactions, bounded busy retry, audit persistence/redaction, account and step-up authorization, storage-key safety, and number-sequence allocation.

The façades retain their existing private policy wrappers, error classes/messages, constructor signatures, public method names/signatures, transaction call sites, and domain behavior. The new core modules are internal implementation modules and are not re-exported from `packages/database/src/index.ts`.

No schema, migration, finance, reporting/template, portal, root test, documentation, or traceability file was changed by this packet.

## Exact changed files

1. `packages/database/src/repository.ts`
2. `packages/database/src/v3-repository.ts`
3. `packages/database/src/core/transaction.ts`
4. `packages/database/src/core/busy-retry.ts`
5. `packages/database/src/core/audit.ts`
6. `packages/database/src/core/authorization.ts`
7. `packages/database/src/core/storage-key.ts`
8. `packages/database/src/core/sequence.ts`

This report is the only required handoff artifact outside the implementation ownership list:

9. `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-b1-report.md`

No files were staged or committed, as required for the shared checkout.

## Public API inventory result

Package-root public exports remain unchanged because `packages/database/src/index.ts` was not modified and no core module is re-exported.

Existing public exports preserved:

- `AccessDeniedError`
- `ConflictError`
- `ValidationError`
- `ReadinessError`
- `ReadinessReason`
- `PortalRepository`
- `V3AccessDeniedError`
- `V3ConflictError`
- `V3ValidationError`
- `V3Repository`
- `CompensationInput`
- `InternalCostInput`
- `LaborRateInput`
- `OverrideInput`

Constructors remain:

- `new PortalRepository(sqlite: DatabaseSync)`
- `new V3Repository(sqlite: DatabaseSync)`
- `new ReadinessError(reasons: readonly ReadinessReason[])`

The same deterministic inventory command was run before and after extraction over top-level exports plus façade public constructor/method declaration lines:

- Before: 146 inventory lines; SHA-256 `e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`
- After: 146 inventory lines; SHA-256 `e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`

No caller or interface change is required.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills: none.
- Production data reinterpretation: none.
- Runtime test/check database activity was limited to the repository's existing test fixtures and `packages/database/data/app.db` checks.

## Commands and results

### Baseline evidence

- `git status --short`
  - Confirmed a materially dirty shared worktree before implementation; no baseline overlap existed in the owned database paths.
- `pnpm --filter @ja/database typecheck`
  - PASS before extraction.
- Public API inventory command
  - 146 lines; SHA-256 `e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74` before extraction.

### Narrow characterization/parity evidence

- `pnpm vitest run tests/security/audit-redaction.test.ts tests/security/repository-privacy.test.ts tests/security/session-step-up.test.ts tests/integration/commercial-billing.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts tests/integration/v3-finance.test.ts`
  - PASS: 7 files, 12 tests.

This was a mechanical extraction with no new behavior or guard. Per the WP-B1 acceptance contract, pre/post parity evidence was used rather than adding behavior-changing RED tests.

### Fresh final owned-scope verification

- `pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/v3-repository.ts packages/database/src/core/*.ts`
  - PASS: all matched files use Prettier style.
- `pnpm exec eslint packages/database/src/repository.ts packages/database/src/v3-repository.ts packages/database/src/core/*.ts`
  - PASS: exit 0, no findings.
- `pnpm --filter @ja/database typecheck`
  - PASS.
- `pnpm test:unit`
  - PASS: 10 files, 23 tests.
- `pnpm test:integration`
  - PASS: 5 files, 10 tests, including database migration/schema coverage in `tests/integration/database.test.ts`.
- `pnpm test:invariants`
  - PASS: 1 file, 1 test.
- `pnpm test:security`
  - PASS: 4 files, 8 tests.
- `pnpm db:check`
  - PASS: journal `wal`, foreign keys `1`, integrity `ok`.
- `pnpm db:integrity`
  - PASS: journal `wal`, foreign keys `1`, integrity `ok`.
- Final public API inventory command
  - PASS parity: 146 lines; SHA-256 unchanged at `e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.
- `git diff --check -- packages/database/src/repository.ts packages/database/src/v3-repository.ts packages/database/src/core`
  - PASS: no whitespace errors. Git emitted only the checkout's existing LF-to-CRLF advisory for the two tracked façade files.

### Broader gates with external/concurrent blockers

- `pnpm typecheck`
  - Database package PASS.
  - Workspace command FAIL due to a concurrent, out-of-scope portal test error in `apps/portal/src/lib/portal/offline-controller.test.ts:55`: mock `entityType` inferred as `string` rather than the `OfflineMutation` literal union.
- `pnpm build`
  - Website build PASS.
  - Workspace command FAIL in the portal because `apps/portal/src/lib/PortalShell.svelte` imports a concurrently absent `./portal/sections/TodaySection.svelte`.

Both failures are outside WP-B1 ownership and do not involve a database interface change. They were not modified here.

All pnpm commands emitted the existing engine warning: repository requires Node `24.19.0`, while verification ran on Node `v25.8.1` with pnpm `11.22.0`.

## Preserved invariants

- Façade dependency direction remains inward: callers continue to depend on `PortalRepository`/`V3Repository`; façades now depend on internal core infrastructure; core modules do not import either façade.
- No circular import was introduced among core modules or façades.
- Transaction behavior remains `BEGIN IMMEDIATE` → work → `COMMIT`, with rollback attempts preserving the original exception.
- Busy retry remains bounded to three total attempts, retries only SQLite busy/locked errors, and preserves repository-specific structured log labels (`portal` and `v3`).
- Existing short transaction boundaries and every façade transaction call site remain unchanged.
- Audit secret-key matching, recursive array/object redaction, metadata JSON, before/after/reason/project/correlation extraction, nullable V3 actors, event IDs, timestamps, and insert column order remain unchanged.
- Portal authorization still rejects inactive/missing accounts and rejects auditor writes; Portal readable checks still allow active auditors.
- V3 active/writable/finance/finance-readable/project-access policy composition remains in the V3 façade.
- Production step-up still bypasses service actors, requires a live matching session, and enforces the same ten-minute window and exact error text.
- Storage-key validation still rejects empty, absolute, backslash-containing, and `..` path-segment keys while preserving the three façade-specific error messages.
- Client/project/invoice sequence allocation uses the same `number_sequence` select/insert/update SQL, returns the same values, and remains inside the caller's existing transaction.
- Exact-money conversions/calculations and all invoice/financial lifecycle code were untouched.
- Current duplicate façade policy behavior was preserved; the packet did not attempt semantic convergence.

## Unresolved risks and blockers

1. Full workspace typecheck is currently blocked by the concurrent portal mock typing error described above.
2. Full workspace build is currently blocked by the concurrent missing `TodaySection.svelte` import described above.
3. Final release evidence still needs to be rerun on the pinned Node `24.19.0`; this packet's environment was Node `v25.8.1`.
4. Independent read-only review remains required by the parent orchestration contract; this implementer does not self-certify integration readiness.

No WP-B1 database behavior blocker was found by the owned-scope verification.

## Requirement IDs

- `SPEC-ARCH-001`
- `V31-015`

This packet is also the database-boundary prerequisite for later lifecycle, finance/artifact, security, industrial, business, and data-readiness packets; it does not claim implementation of those downstream requirements.

## Interface-change handoff

Another agent must change an interface: **No**.

The concurrent frontend owner/reviewer must resolve its own typecheck/build failures, but no database API, schema, migration, or caller update is needed for WP-B1.
