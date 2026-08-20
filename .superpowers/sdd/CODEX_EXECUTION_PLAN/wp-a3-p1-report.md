# WP-A3-P1 — Client directory extraction handoff

## Status

READY FOR REVIEW. The accepted WP-B1 `PortalRepository` façade now delegates the five
client/client-contact operations to a constructor-injected internal client domain repository.
This is a mechanical extraction only: no client lifecycle behavior, billing semantics, schema,
migration, public export, or caller contract changed. No files were staged or committed.

### Fix round 1/5

The independent A4 CLI gate found that Node 24's `--experimental-strip-types` runtime cannot
execute TypeScript parameter-property syntax. The client repository constructor now uses an
ordinary declared readonly field and constructor assignment. The dependency contract and runtime
behavior are unchanged.

## Exact changed files

- `packages/database/src/repository.ts`
- `packages/database/src/domains/clients/client-repository.ts`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a3-p1-report.md`

The shared checkout contains unrelated concurrent work outside this leaf's ownership. This
leaf did not modify those paths.

## Façade methods delegated

The following public `PortalRepository` methods remain present with the same names, parameter
shapes, synchronous behavior, return shapes, and public error classes/messages:

- `createClient`
- `createClientContact`
- `listClientContacts`
- `listAllClientContacts`
- `listClients`

`PortalRepository` remains the only package-facing entry point. `ClientRepository` and its
structural dependency types are internal and are not exported from `packages/database/src/index.ts`.
The constructor remains `constructor(sqlite: DatabaseSync)`.

## Public API inventory

The parent-provided pre-leaf baseline was 146 inventory lines with SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

Post-extraction inventory remains 146 lines with the same SHA-256
`e854715e7e923840fced907bc1c9bacc39b1d483f15dd624aa503a3dc3387c74`.

The package-root export surface and both repository constructor signatures are unchanged.

## Migrations and data changes

- Migrations added or edited: none.
- Schema changes: none.
- Backfills/data fixes: none.
- Production data reinterpretation: none.
- No lifecycle/archive/edit behavior was added.

## Verification commands and outcomes

All commands below were run with the pinned Node `v24.19.0` / pnpm `11.22.0` environment.

- `pnpm --filter @ja/database typecheck` — PASS.
- `pnpm db:migrate:fresh` — PASS under Node `v24.19.0`; fresh SQLite database opened with WAL,
  foreign keys enabled, and `integrity=ok`.
- `pnpm vitest run tests/integration/commercial-billing.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts tests/security/repository-privacy.test.ts` — PASS, 4 files / 5 tests.
- `pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/domains/clients/client-repository.ts` — PASS.
- `pnpm exec eslint packages/database/src/repository.ts packages/database/src/domains/clients/client-repository.ts` — PASS, no diagnostics.
- `git diff --check -- packages/database/src/repository.ts packages/database/src/domains/clients/client-repository.ts` — PASS; Git emitted only its existing LF-to-CRLF checkout advisory for the tracked façade.

## Mechanical diff evidence

- The five SQL clusters were moved without changing SQL text, bind order, query ordering,
  limits, defaults, timestamps, ID/sequence order, or transaction boundaries.
- `createClient` still allocates its sequence and ID inside the same immediate transaction,
  uses one timestamp for both client timestamps, and audits `client.create` with `{ clientNumber }`.
- `createClientContact` still validates client existence before ID/timestamp allocation, resets
  primary contacts inside the same transaction, preserves normalization/defaults, and audits
  `client_contact.create` with the same details.
- Both contact list methods retain their role checks, project-manager scope predicates,
  validation/access error text, SQL projections, bind order, and ordering.
- `listClients` retains its active-account/readability and client-administration checks and exact
  projection/order.
- The façade passes only structural capabilities used by this domain: SQLite, transaction,
  active/readable authorization, audit, sequence allocation, time generation, text validation,
  and existing access/validation error factories. The module imports neither façade.

## Risks and blockers

No leaf-local blocker was found. Independent read-only architecture/security review remains
required before the parent releases the `repository.ts` façade lease or advances A3-P2.

## Requirements and interface handoff

- Requirement IDs: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: **No**.
- No schema/migration/data or finance/billing semantic work is required or authorized by this leaf.

## Handoff control

The implementer did not stage or commit any file. The parent must perform the independent review,
verify exact owned-path scope, and route any concrete finding back to this leaf before integration.
