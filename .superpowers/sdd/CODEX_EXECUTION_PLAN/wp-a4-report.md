# WP-A4 handoff — schema module extraction

Status: READY FOR REVIEW (owned extraction complete; all WP-A4-specific gates
pass under the pinned toolchain. The broader integration suite contains only
the three expected downstream T0 accounting-pack RED tests described below.)

## Summary

Performed a mechanical split of `packages/database/src/schema.ts` into the
architect-defined 19 domain modules plus the internal `shared.ts` lifecycle
builder. The public `schema.ts` remains the unchanged package façade boundary
and now contains only the explicit topological re-exports from the contract.
No table declaration, column, callback, foreign key, index, default, nullable
state, or lifecycle semantics were changed.

## Exact changed files

- `packages/database/src/schema.ts`
- `packages/database/src/schema/shared.ts`
- `packages/database/src/schema/system.ts`
- `packages/database/src/schema/identity.ts`
- `packages/database/src/schema/clients.ts`
- `packages/database/src/schema/projects.ts`
- `packages/database/src/schema/workforce-planning.ts`
- `packages/database/src/schema/time.ts`
- `packages/database/src/schema/expenses.ts`
- `packages/database/src/schema/reports.ts`
- `packages/database/src/schema/technical.ts`
- `packages/database/src/schema/documents.ts`
- `packages/database/src/schema/commercial.ts`
- `packages/database/src/schema/billing.ts`
- `packages/database/src/schema/invoices.ts`
- `packages/database/src/schema/finance-accounting.ts`
- `packages/database/src/schema/workflow.ts`
- `packages/database/src/schema/jobs.ts`
- `packages/database/src/schema/audit.ts`
- `packages/database/src/schema/offline.ts`
- `packages/database/src/schema/public-intake.ts`

No migration, seed, data, package export, Drizzle config, repository, index,
or application file was changed.

## Baselines and parity

Toolchain: Node `v24.19.0`, pnpm `11.22.0`.

Pre-change evidence is retained at:
`C:\Users\Álvaro Schwiedop\AppData\Local\Temp\ja-wp-a4-82a6251f6d0443bab53537b6cf501bfd`

- Pre-change `schema.ts` SHA-256:
  `6EF6F3D3E12273AAF1EFA4A3F00C80B6E20E5529E4CE2457653D3C1D9AEA1B81`
- Runtime exports before and after: 63 table values; `lifecycle` absent.
- Export inventory SHA-256 before and after:
  `8C11D1544361950DE1FBB4BF2720E3AEA8682F1803942C54AA1ABD25BBCDFED6`
- Declaration inventory and normalized declaration-text comparison: PASS,
  all 63 assigned declarations found exactly once in their contract modules.
- Drizzle SQL before raw SHA-256:
  `77757EC730CE664D800A0A702FDC872206A62CA5E966CAB9479AECBB42831147`
- Drizzle SQL after raw SHA-256:
  `96D703196273B58BCD882E8D68C449645218F8403534782BC439D2F660BE658A`
- Generated SQL statement count: 89 before and 89 after.
- Canonical normalized statement-multiset comparison: PASS. The raw hash
  differs only because the façade's frozen topological module order changes
  generated statement order; the sorted canonical statements are identical.

After-generation evidence is retained at:
`C:\Users\Álvaro Schwiedop\AppData\Local\Temp\ja-wp-a4-final-97fe2e78d64a4733abbbdf0d3125ade7`

## Commands and outcomes

Passed:

- `node --experimental-strip-types --input-type=module -e "...schema exports..."`
  before and after; byte-identical inventories, `count=63`.
- Drizzle Kit generation before and after with the contract command; canonical
  parity passed.
- `pnpm vitest run tests/integration/database.test.ts -t "enables WAL, foreign keys and STRICT schema"`
- `pnpm vitest run tests/integration/database.test.ts -t "upgrades a populated pre-V3 database without losing business rows"`
- `pnpm vitest run tests/integration/database.test.ts -t "keeps the declared Drizzle schema aligned with the migrated SQLite schema"`
- `pnpm exec prettier --check packages/database/src/schema.ts packages/database/src/schema`
- `pnpm exec eslint packages/database/src/schema.ts packages/database/src/schema`
- `pnpm --filter @ja/database typecheck`
- `git diff --check -- packages/database/src/schema.ts packages/database/src/schema`
- Ownership guards for package exports, Drizzle config, migrations, database
  package index, and pre-existing `tests` status.

Completed after the concurrent A3 implementation became coherent:

- `pnpm db:migrate:fresh`: PASS; `test-fresh.db` reported `journal=wal`,
  `foreign_keys=1`, and `integrity=ok`.
- The contract's post-fresh `foreign_key_check` and `integrity_check` command:
  PASS; zero foreign-key rows and exactly `integrity_check=ok`.
- `pnpm db:check`: PASS; `app.db` reported `journal=wal`, `foreign_keys=1`,
  and `integrity=ok`.
- `pnpm db:integrity`: PASS; `app.db` reported `journal=wal`,
  `foreign_keys=1`, and `integrity=ok`.
- Final post-gate export and Drizzle generation parity: PASS; evidence is
  retained at `C:\Users\Álvaro Schwiedop\AppData\Local\Temp\ja-wp-a4-postgates-09d9431ac34243e5ba731021e764badf`.
- `pnpm typecheck`: PASS across all 10 workspace projects.
- `pnpm build`: PASS for the website and portal. Existing Rollup annotation and
  `node:sqlite` externalization warnings remained non-fatal.

`pnpm test:integration` ran 6 files: 5 files and 12 tests passed. The only
failures were the 3 new tests in
`tests/integration/accounting-pack-artifacts.test.ts`, which intentionally
remain RED for downstream artifact lifecycle implementation: per-format
success when PDF fails, queued pack creation, and period-bearing filenames.
No WP-A4 schema test failed.

## Review and handoff

- Requirements: `SPEC-ARCH-001`, `V31-015`.
- Another agent must change an interface: no.
- Migrations/data changes: none.
- No files were staged or committed (`git diff --cached --name-only` empty).
- Independent `backend_domain` review is required before acceptance; this
  implementer does not self-certify the packet.

Unresolved risk: the three downstream T0 accounting-pack tests remain RED and
must be handled by the artifact lifecycle work packet. WP-A4 has no unresolved
schema, migration, fresh-database, foreign-key, integrity, typecheck, build, or
ownership-gate blocker. If a later schema parity gate fails, stop and escalate
rather than changing a declaration.
