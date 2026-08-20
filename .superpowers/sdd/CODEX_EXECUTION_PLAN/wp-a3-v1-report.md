# WP-A3-V1 — Technical-change extraction handoff

## Status

READY FOR REVIEW. The accepted WP-B1 `V3Repository` façade now delegates the four
technical-change operations to a constructor-injected internal technical-change domain
repository. This is a mechanical extraction only: no industrial safety, approval, notification,
RBAC, audit, schema, migration, public export, or caller contract changed. No files were staged
or committed.

## Exact changed files

- `packages/database/src/v3-repository.ts`
- `packages/database/src/domains/technical-changes/technical-change-repository.ts`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a3-v1-report.md`

The shared checkout contains unrelated concurrent work outside this leaf's ownership. This leaf
did not modify those paths.

## Façade methods delegated

The following public `V3Repository` methods remain present with the same names, parameter shapes,
default behavior, synchronous behavior, return shapes, and public error classes/messages:

- `createTechnicalChange`
- `submitTechnicalChange`
- `reviewTechnicalChange`
- `listTechnicalChanges`

`V3Repository` remains the only package-facing entry point. `TechnicalChangeRepository`, its
input type, and its structural dependency types are internal and are not exported from
`packages/database/src/index.ts`. The constructor remains `constructor(sqlite: DatabaseSync)`.

## Public API inventory

The parent-provided pre-leaf baseline was 146 inventory lines with SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

Post-extraction inventory remains 146 lines with the same SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

The pre-leaf `v3-repository.ts` SHA-256 was
`5700348876fa77e3196a783a0faa51b4ea469e844f997b2de14d6c85e138f649`.
The current façade SHA-256 after the accepted WP-B1 core extraction and this leaf is
`047bb4f8eb55591b0ba56e2433f6aacd84624c8cf1d030295aacc7ae21f46f14`.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills/data fixes: none.
- Production data reinterpretation: none.
- Technical-change lifecycle/safety/approval behavior: unchanged.

## Verification commands and outcomes

All commands below were run with the pinned Node `v24.19.0` / pnpm `11.22.0` environment.

- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm vitest run tests/security/repository-privacy.test.ts` — PASS, 1 file / 1 test.
- `pnpm test:security` — PASS, 4 files / 8 tests.
- `pnpm exec prettier --write packages/database/src/v3-repository.ts packages/database/src/domains/technical-changes/technical-change-repository.ts` — PASS.
- `pnpm exec prettier --check packages/database/src/v3-repository.ts packages/database/src/domains/technical-changes/technical-change-repository.ts` — PASS after formatting.
- `pnpm exec eslint packages/database/src/v3-repository.ts packages/database/src/domains/technical-changes/technical-change-repository.ts` — PASS, no diagnostics.
- `git diff --check -- packages/database/src/v3-repository.ts packages/database/src/domains/technical-changes/technical-change-repository.ts` — PASS; Git emitted only its existing LF-to-CRLF checkout advisory for the tracked façade.

## Mechanical diff evidence

- The four technical-change SQL clusters were moved without changing SQL text, bind order, query
  ordering, limits, defaults, timestamps, ID generation order, or transaction boundaries.
- `createTechnicalChange` retains active/writable and project authorization, component/change
  validation, safety-impact validation/rollback requirements, technical-report project matching,
  draft insertion, and the exact `technical_change.create` audit details.
- `submitTechnicalChange` retains the exact optimistic version/state guard, timestamp position,
  conflict error, and `technical_change.submit` audit details.
- `reviewTechnicalChange` retains active/reviewer authorization, submitted-state guard, reason
  requirements, safety approval guard, the same transaction around state/version update,
  approval-event insert, notification insert, and audit event.
- `listTechnicalChanges` retains queue authorization, project-manager and worker visibility
  predicates, empty-project behavior, SQL projection/order/limit, and returned rows.
- The façade injects only SQLite, existing transaction/authorization/audit capabilities, project
  review policy, ID/time/text helpers, and exact façade error factories. The domain module imports
  neither repository façade and adds no replacement policy.

## Independent review fix round 1

The reviewer identified that the domain constructor used TypeScript parameter-property syntax,
which is not supported by Node 24's `--experimental-strip-types` runtime used by database CLI
entrypoints. The constructor now uses an explicitly declared readonly field and a normal
assignment. This is syntax-only and does not change behavior, dependencies, or public API.

Additional pinned-runtime evidence after the fix:

- `node --experimental-strip-types --input-type=module -e "import('./packages/database/src/domains/technical-changes/technical-change-repository.ts')"` — PASS; direct strip-only import completed and exported class verified.
- `pnpm --filter @ja/database db:check` — PASS; WAL, foreign keys, and SQLite integrity verified.
- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm vitest run tests/security/repository-privacy.test.ts` — PASS, 1 file / 1 test.
- Owned-file Prettier, ESLint, and `git diff --check` — PASS.

## Risks and blockers

No leaf-local blocker was found. Independent read-only architecture/security review remains
required before the parent releases the `v3-repository.ts` façade lease or advances the next
V3 extraction leaf.

## Requirements and interface handoff

- Requirement IDs: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: **No**.
- No schema/migration/data or finance/billing semantic work is required or authorized by this leaf.

## Handoff control

The implementer did not stage or commit any file. The parent must perform the independent review,
verify exact owned-path scope, and route any concrete finding back to this leaf before integration.
