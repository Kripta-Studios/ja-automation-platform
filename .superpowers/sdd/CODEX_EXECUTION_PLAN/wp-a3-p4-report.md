# WP-A3-P4 — Operational time-entry extraction handoff

## Status

READY FOR REVIEW. The `PortalRepository` façade now delegates the seven approved
worker-owned and operational-review time-entry operations to a constructor-injected
internal time domain repository. This is a mechanical extraction only: finance
approval, sensitive detail projection, billing, offline behavior, lifecycle behavior,
schema, migrations, RBAC policy, and public caller contracts were not changed. No
files were staged or committed.

## Exact changed files

- `packages/database/src/repository.ts`
- `packages/database/src/domains/time/time-entry-repository.ts`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a3-p4-report.md`

The shared checkout contains unrelated concurrent work outside this leaf's
ownership. This leaf did not modify those paths.

## Façade methods delegated

The following public `PortalRepository` methods remain present with their exact
parameter declarations, synchronous behavior, return shapes, and public error
classes/messages:

- `createTimeEntry`
- `submitTime`
- `updateTimeEntry`
- `operationalApproveTime`
- `listOwnTime`
- `listOwnTimeWeek`
- `copyOwnTimeLayout`

`financeApproveTime` remains in the façade. `timeDetail` remains in the façade so
its role-dependent billing/cost projection can be reviewed with finance/security
ownership. `PortalRepository` remains the only package-facing entry point. The
constructor remains `constructor(sqlite: DatabaseSync)`, and the new module is not
exported from `packages/database/src/index.ts`.

## Public API inventory

The parent-provided pre-leaf baseline was 146 inventory lines with SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

The seven façade method declarations were preserved exactly, including the inline
`updateTimeEntry`, `operationalApproveTime`, and `copyOwnTimeLayout` declarations.
The parent should rerun its canonical 146-line inventory after this handoff; no
package-root export or constructor signature changed. The façade SHA-256 before
this leaf was
`4919104642BA72A10014D8B1334B196A48700657433DCDDC4137DAD0E84226CD`.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills/data fixes: none.
- Production data reinterpretation: none.
- No finance approval, sensitive projection, report, expense, offline, billing, or
  lifecycle behavior was added or moved.

## Verification commands and outcomes

Commands were run with the pinned Node `v24.19.0` / pnpm `11.22.0` environment.

- `node --experimental-strip-types -e "import('./packages/database/src/repository.ts')..."`
  — PASS; direct Node 24 runtime import exposed `PortalRepository` as a function.
- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm vitest run tests/integration/commercial-billing.test.ts tests/integration/portal-workflow.test.ts tests/integration/v3-finance.test.ts tests/security/repository-privacy.test.ts`
  — PASS: 4 files / 7 tests.
- `pnpm test:invariants` — PASS: 1 file / 1 test.
- `pnpm test:security` — PASS: 4 files / 8 tests.
- `pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/domains/time/time-entry-repository.ts`
  — PASS.
- `pnpm exec eslint packages/database/src/repository.ts packages/database/src/domains/time/time-entry-repository.ts`
  — PASS, no diagnostics.
- `git diff --check -- packages/database/src/repository.ts packages/database/src/domains/time/time-entry-repository.ts`
  — PASS; Git emitted only the tracked-façade LF-to-CRLF checkout advisory.

## Mechanical diff evidence

- `createTimeEntry` preserves active-account and ISO-date checks, minute bounds,
  assignment-date query and binds, ID/timestamp order, exact insert columns/defaults,
  text validation, audit action/details, and `{ id, version: 1 }` return shape.
- `submitTime` preserves the editable-state, worker ownership, optimistic-version,
  invoice-lock predicate, timestamp order, conflict text, audit payload, and version
  return shape.
- `updateTimeEntry` preserves ownership, invoice/billing locks, editable approval
  states, date/minute/break validation, exact `COALESCE` update SQL/bind order,
  optimistic version guard, audit payload, conflict text, and returned version.
- `operationalApproveTime` preserves project-review authorization, submitted-state
  guard, transaction boundary, approval update and event SQL/binds, approval-event
  ID/timestamp order, audit action/details, and decision-specific approved fields.
- `listOwnTime` and `listOwnTimeWeek` preserve readable-account checks, worker
  scoping, projections, ordering, limits, ISO-date validation, and week shape.
- `copyOwnTimeLayout` preserves date validation, source query/order/filter, offset
  calculation, assignment-date checks, duplicate predicate/binds, zero-minute draft
  defaults, ID/timestamp order, transaction boundary, audit details, and created/
  skipped return shape.
- The module imports neither façade and defines no replacement transaction,
  authorization, audit, storage-key, sequence, retry, finance, or lifecycle policy.
  The façade supplies existing authorization, transaction, audit, validation,
  timestamp, text, date, and ISO-date-shifting capabilities.

## Risks and blockers

No leaf-local blocker was found. Independent read-only architecture/security and
requirements review remains required before the parent releases the
`repository.ts` façade lease or advances the parent integration gate.

## Requirements and interface handoff

- Requirement IDs: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: **No**.
- No schema/migration/data or finance/billing semantic work is required or
  authorized by this leaf.

## Handoff control

The implementer did not stage or commit any file. The parent must perform the
independent review, verify exact owned-path scope and canonical API fingerprint, and
route any concrete finding back to this leaf before releasing the façade lease.
