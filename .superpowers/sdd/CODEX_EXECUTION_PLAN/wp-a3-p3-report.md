# WP-A3-P3 — Planning and schedule extraction handoff

## Status

READY FOR REVIEW. The `PortalRepository` façade now delegates the five approved
planning/schedule operations to a constructor-injected internal planning domain
repository. This is a mechanical extraction only: no planning behavior, lifecycle,
RBAC policy, schema, migration, public export, or caller contract changed. No files
were staged or committed.

## Exact changed files

- `packages/database/src/repository.ts`
- `packages/database/src/domains/planning/planning-repository.ts`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a3-p3-report.md`

The shared checkout contains unrelated concurrent work outside this leaf's
ownership. This leaf did not modify those paths.

## Façade methods delegated

The following public `PortalRepository` methods remain present with their exact
inline parameter declarations, synchronous behavior, return shapes, and public
error classes/messages:

- `listProjectSchedule`
- `updateProjectSchedule`
- `createPlanningAssignment`
- `listPlanning`
- `listAssignedProjects`

`PortalRepository` remains the only package-facing entry point. `PlanningRepository`
and its structural dependency/input types are internal and are not exported from
`packages/database/src/index.ts`. The constructor remains
`constructor(sqlite: DatabaseSync)`.

## Public API inventory

The parent-provided pre-leaf baseline was 146 inventory lines with SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

The façade method declarations were preserved exactly, including the five inline
planning/schedule input declarations; the parent should rerun its canonical
146-line inventory after this handoff. No package-root export or constructor
signature changed. The façade SHA-256 before this leaf was
`A4C6ADE13244D0750D319EDD433ECF76F7090B311E646F836981BC3AEFF586D5`; the current
façade SHA-256 is
`4919104642BA72A10014D8B1334B196A48700657433DCDDC4137DAD0E84226CD`.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills/data fixes: none.
- Production data reinterpretation: none.
- No project creation, milestone, closeout, billing, or lifecycle behavior was
  added or moved.

## Verification commands and outcomes

Commands were run with the pinned Node `v24.19.0` / pnpm `11.22.0` environment.

- `node --experimental-strip-types -e "import('./packages/database/src/repository.ts')..."` — PASS; direct Node 24 runtime import exposed `PortalRepository` as a function.
- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm vitest run tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts tests/security/repository-privacy.test.ts` — PASS: 3 files / 4 tests.
- `pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/domains/planning/planning-repository.ts` — PASS.
- `pnpm exec eslint packages/database/src/repository.ts packages/database/src/domains/planning/planning-repository.ts` — PASS, no diagnostics.
- `git diff --check -- packages/database/src/repository.ts packages/database/src/domains/planning/planning-repository.ts` — PASS; Git emitted only the tracked-façade LF-to-CRLF checkout advisory.

## Mechanical diff evidence

- `listProjectSchedule` preserves the readable-account check, role/project access
  predicate, exact schedule projection, bind order, descending effective-date/id
  ordering, and `LIMIT 1`.
- `updateProjectSchedule` preserves active-account and `canManageAssignments`
  checks, exact date/minute validation and error text, project lookup, ID/time
  allocation order, schedule/project SQL and bind order, non-transactional write
  boundary, audit action/entity/details, and `{ id, version: 1 }` return shape.
- `createPlanningAssignment` preserves active-account and assignment-management
  checks, timestamp parsing behavior, active-member lookup, overlap and unavailable
  queries/binds, conflict/validation text, published/default fields, ID/time order,
  audit payload, and `{ id }` return shape.
- `listPlanning` preserves worker privacy projection, project-manager placeholder
  construction and empty-scope behavior, unrestricted management reads, status
  filter, and ordering.
- `listAssignedProjects` preserves management/auditor global visibility, active
  membership query for other roles, exact projections, bind order, and project-number
  ordering.
- The module imports neither façade and defines no replacement transaction,
  authorization, audit, storage-key, sequence, or retry policy. The façade supplies
  the existing authorization, date/text validation, audit, time, and error factories.

## Risks and blockers

No leaf-local blocker was found. Independent read-only architecture/security review
remains required before the parent releases the `repository.ts` façade lease or
advances A3-P4.

## Requirements and interface handoff

- Requirement IDs: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: **No**.
- No schema/migration/data or finance/billing semantic work is required or
  authorized by this leaf.

## Handoff control

The implementer did not stage or commit any file. The parent must perform the
independent review, verify exact owned-path scope and canonical API fingerprint, and
route any concrete finding back to this leaf before advancing the next Portal façade
lease.
