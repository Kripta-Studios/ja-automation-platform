# WP-A3-P2 — Workforce and assignment extraction handoff

## Status

READY FOR REVIEW. The accepted `PortalRepository` façade now delegates the eight
workforce/assignment operations to a constructor-injected internal workforce domain
repository. This is a mechanical extraction only: no workforce lifecycle behavior,
RBAC policy, schema, migration, public export, or caller contract changed. No files
were staged or committed.

### Fix round 1/5

The independent API-inventory gate found that four façade parameter declarations had
been represented by imported internal aliases. The façade now restores the exact
pre-extraction inline declaration text and formatting for `createSkill`,
`setWorkerSkill`, `setWorkerAvailability`, and `assignWorker`; the internal aliases
remain private to the workforce module and are not exposed by the façade.

## Exact changed files

- `packages/database/src/repository.ts`
- `packages/database/src/domains/workforce/workforce-repository.ts`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a3-p2-report.md`

The shared checkout contains unrelated concurrent work outside this leaf's ownership.
This leaf did not modify those paths.

## Façade methods delegated

The following public `PortalRepository` methods remain present with the same names,
parameter compatibility, synchronous behavior, return shapes, and public error
classes/messages:

- `listSkills`
- `createSkill`
- `setWorkerSkill`
- `listWorkerSkills`
- `setWorkerAvailability`
- `listWorkerAvailability`
- `assignWorker`
- `listActiveWorkers`

`PortalRepository` remains the only package-facing entry point. `WorkforceRepository`
and its structural dependency/input types are internal and are not exported from
`packages/database/src/index.ts`. The constructor remains
`constructor(sqlite: DatabaseSync)`.

## Public API inventory

The parent-provided pre-leaf baseline was 146 inventory lines with SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

Post-extraction inventory remains 146 lines with the same SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

The façade pre-leaf SHA-256 was
`3D61B54DBF0FCD7AD7654080DA39E37771422F729713D40621C89361C29C3D52`.
The package-root export surface and both repository constructor signatures are
unchanged.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills/data fixes: none.
- Production data reinterpretation: none.
- No lifecycle/archive/offboarding/certification/skill lifecycle behavior was added.

## Verification commands and outcomes

Commands were run with the pinned Node `v24.19.0` / pnpm `11.22.0` environment.

- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/domains/workforce/workforce-repository.ts` — PASS.
- `pnpm exec eslint packages/database/src/repository.ts packages/database/src/domains/workforce/workforce-repository.ts` — PASS, no diagnostics.
- Parent exact public API inventory — PASS: 146 lines; SHA-256
  `e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.
- `pnpm test:security` — PASS: 4 files, 8 tests.
- `pnpm vitest run tests/integration/database.test.ts tests/integration/commercial-billing.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts` — PASS: 4 files, 7 tests.
- `pnpm test:integration` — the pre-existing WP-T0 RED tranche remains failing in `tests/integration/accounting-pack-artifacts.test.ts` (3 failures: queued lifecycle, independent format readiness, semantic filename); the other 5 integration files passed (12/15 tests passed). These failures are outside this leaf's owned production paths and are recorded as downstream artifact work, not extracted-work regressions.
- `node --experimental-strip-types -e "import('./packages/database/src/repository.ts')..."` — PASS; direct Node 24 runtime import exposed `PortalRepository` as a function.
- `git diff --check -- packages/database/src/repository.ts packages/database/src/domains/workforce/workforce-repository.ts` — PASS; only the existing tracked-façade LF-to-CRLF checkout advisory was emitted.

## Mechanical diff evidence

- The eight SQL clusters were moved without changing SQL text, bind order, query
  ordering, limits, defaults, timestamps, ID generation, transaction boundaries,
  audit action/entity/details, or returned projections.
- Skill administration preserves the existing owner/finance role check, uppercase
  code normalization, duplicate-code conflict text, audit payload, and ID/time order.
- Worker skill and availability operations preserve worker privacy, project-manager
  active-membership scope checks, active-worker validation, proficiency/date checks,
  status defaults, visibility queries, and exact access/validation error text.
- `assignWorker` preserves `canManageAssignments`, ISO date validation, the existing
  assignment-date behavior (including its known effective-date limitation), worker
  role/status query, insert defaults, audit payload, and return shape.
- `listActiveWorkers` preserves its management-role allowlist, active-account/readable
  check, global active-worker projection, and name/email ordering.
- The façade passes only structural capabilities used by this domain: SQLite,
  active/readable authorization, audit, time generation, text validation, and the
  existing access/conflict/validation error factories. The module imports neither
  façade and adds no package-root export.

## Risks and blockers

No leaf-local blocker was found. The full integration command is currently red only
because the accepted WP-T0 artifact-lifecycle regression tests intentionally describe
downstream P0/B3 behavior. Independent read-only architecture/security review remains
required before the parent releases the `repository.ts` façade lease or advances
A3-P3.

## Requirements and interface handoff

- Requirement IDs: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: **No**.
- No schema/migration/data or finance/billing semantic work is required or authorized
  by this leaf.

## Handoff control

The implementer did not stage or commit any file. The parent must perform the
independent review, verify exact owned-path scope, and route any concrete finding back
to this leaf before advancing the next Portal façade lease.
