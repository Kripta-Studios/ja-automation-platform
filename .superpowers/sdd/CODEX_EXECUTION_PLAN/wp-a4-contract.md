# WP-A4 — Schema module extraction contract

## Verdict

`READY` — WP-B1 is accepted and its dependency direction is stable. WP-A4 is a
Complexity-A mechanical extraction for a Luna Max `migration_worker`; it does
not authorize a schema change, migration, data mutation, product-semantic
change, or new public package export.

Linked requirements:

- `SPEC-ARCH-001`
- `V31-015`

## Objective and ownership

Split `packages/database/src/schema.ts` into cohesive Drizzle schema modules
while preserving the existing `@ja/database/schema` façade, all 63 exported
table-object names, every table/column/index/foreign-key/default declaration,
and the effective migrated SQLite schema.

Exclusive owned write paths for the implementation packet:

- `packages/database/src/schema.ts`
- `packages/database/src/schema/shared.ts`
- the exact 19 domain files under `packages/database/src/schema/` listed below

Forbidden write paths:

- `packages/database/src/index.ts`
- `packages/database/package.json`
- `packages/database/drizzle.config.ts`
- `packages/database/src/repository.ts`
- `packages/database/src/v3-repository.ts`
- `packages/database/src/core/**`
- `packages/database/src/domains/**`
- every migration, test, application, documentation, traceability, planning,
  deployment, fixture, seed, Git index, and Git `HEAD` path

The worker may read all forbidden paths for verification. It may create
disposable evidence only below an OS temporary directory; no generated Drizzle
output belongs in `migrations/` or any tracked repository path.

## Frozen public contract

`packages/database/package.json` continues to expose:

```json
"./schema": "./src/schema.ts"
```

`packages/database/drizzle.config.ts` continues to point to:

```text
./src/schema.ts
```

No caller changes imports. External and test consumers continue using
`@ja/database/schema`; internal consumers that later need a table must also use
the façade unless a separate architecture contract explicitly changes the
package boundary. Do not add `./schema/*` package exports.

The current façade exports exactly 63 values and no named types. The split must
not add row aliases, insert aliases, relation objects, helper exports, default
exports, namespaces, or barrels beyond `src/schema.ts`. Existing inferred types
such as `typeof users.$inferSelect` remain available through the unchanged table
objects without introducing new named exports.

## Exact module map

Every table appears in exactly one module. File names and membership are frozen
for this packet.

| New file                       | Exported table values moved verbatim from `schema.ts`                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `schema/system.ts`             | `schemaMigrations`, `numberSequences`, `rateLimitBuckets`                                                                  |
| `schema/identity.ts`           | `users`, `sessions`, `invitations`, `accounts`, `verifications`, `passkeys`, `twoFactors`                                  |
| `schema/clients.ts`            | `clients`, `clientContacts`                                                                                                |
| `schema/projects.ts`           | `projects`, `projectMilestones`                                                                                            |
| `schema/workforce-planning.ts` | `projectMembers`, `skills`, `workerSkills`, `schedules`, `planningAssignments`, `workerAvailability`                       |
| `schema/time.ts`               | `timeEntries`                                                                                                              |
| `schema/expenses.ts`           | `expenses`                                                                                                                 |
| `schema/reports.ts`            | `dailyReports`, `periodReports`, `reportSources`, `reportTimeLinks`                                                        |
| `schema/technical.ts`          | `technicalReports`, `technicalChanges`, `projectCloseouts`                                                                 |
| `schema/documents.ts`          | `documents`, `documentAccessEvents`                                                                                        |
| `schema/commercial.ts`         | `clientLaborRates`, `internalCostRules`, `compensationRules`, `compensationSettlements`, `assignmentRateOverrides`         |
| `schema/billing.ts`            | `billingRules`, `legalEntities`, `invoiceNumberPolicies`, `taxProfiles`, `taxComponents`, `billingPeriods`, `billingLocks` |
| `schema/invoices.ts`           | `invoices`, `invoiceLines`, `invoiceSources`, `payments`, `invoiceEvents`, `invoiceAdjustments`                            |
| `schema/finance-accounting.ts` | `financeSnapshots`, `accountingPeriods`, `accountingPackRuns`, `accountingPackExports`                                     |
| `schema/workflow.ts`           | `approvalEvents`, `notifications`                                                                                          |
| `schema/jobs.ts`               | `jobs`, `outboxEvents`, `jobRuns`, `scheduledJobs`                                                                         |
| `schema/audit.ts`              | `auditEvents`                                                                                                              |
| `schema/offline.ts`            | `offlineMutations`, `mutationReceipts`                                                                                     |
| `schema/public-intake.ts`      | `publicInquiries`                                                                                                          |

The total must remain 63. `schema/shared.ts` contains only the single current
`lifecycle` column-builder object:

```ts
export const lifecycle = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};
```

It imports only `text` from `drizzle-orm/sqlite-core`. It is internal and must
not be re-exported from `src/schema.ts`. Do not duplicate or redefine
`lifecycle` per module.

## Stable façade and re-export direction

After all domain files exist, `packages/database/src/schema.ts` becomes a pure,
explicit topological re-export façade in this order:

```ts
export * from './schema/system.ts';
export * from './schema/identity.ts';
export * from './schema/clients.ts';
export * from './schema/projects.ts';
export * from './schema/workforce-planning.ts';
export * from './schema/time.ts';
export * from './schema/expenses.ts';
export * from './schema/reports.ts';
export * from './schema/technical.ts';
export * from './schema/documents.ts';
export * from './schema/commercial.ts';
export * from './schema/billing.ts';
export * from './schema/invoices.ts';
export * from './schema/finance-accounting.ts';
export * from './schema/workflow.ts';
export * from './schema/jobs.ts';
export * from './schema/audit.ts';
export * from './schema/offline.ts';
export * from './schema/public-intake.ts';
```

No domain module imports `src/schema.ts`, another barrel, a repository façade,
or a repository domain module. Schema dependency direction is one way:

```text
schema.ts (public façade)
  -> schema domain modules
       -> shared.ts and/or lower-level entity-anchor modules
            -> drizzle-orm/sqlite-core
```

## Exact cross-module imports

Use `.ts` extensions, matching the database package's existing ESM style.
Imports not listed here are limited to the exact Drizzle constructors used by
the moved declarations.

- `identity.ts` imports `lifecycle` from `shared.ts`.
- `clients.ts` imports `lifecycle` from `shared.ts`.
- `projects.ts` imports `lifecycle` from `shared.ts` and `clients` from
  `clients.ts`.
- `workforce-planning.ts` imports `lifecycle` from `shared.ts`, `users` from
  `identity.ts`, and `projects` from `projects.ts`.
- `time.ts` imports `lifecycle` from `shared.ts`, `users` from `identity.ts`,
  and `projects` from `projects.ts`.
- `expenses.ts` imports `lifecycle` from `shared.ts`, `users` from
  `identity.ts`, and `projects` from `projects.ts`.
- `reports.ts`, `technical.ts`, and `commercial.ts` import only `lifecycle`
  from `shared.ts` in addition to their exact Drizzle constructors.
- `documents.ts` imports `lifecycle` from `shared.ts`, `users` from
  `identity.ts`, and `projects` from `projects.ts`.
- `billing.ts` imports `lifecycle` from `shared.ts` and `projects` from
  `projects.ts`.
- `invoices.ts` imports `lifecycle` from `shared.ts` and `projects` from
  `projects.ts`.
- `jobs.ts` imports `lifecycle` from `shared.ts`.
- `audit.ts` imports `projects` from `projects.ts`.
- `system.ts`, `finance-accounting.ts`, `workflow.ts`, `offline.ts`, and
  `public-intake.ts` have no schema-module imports.

This graph is acyclic. Anchor modules never import a dependent module:
`identity` and `clients` import only `shared`; `projects` may import `clients`;
all project/user-owned domains point inward to those anchors. If a moved block
appears to require the reverse direction, stop rather than introducing a cycle.

## Foreign keys, indexes, relations, and helper rules

Move declarations textually. Do not normalize them to match migration SQL and
do not infer constraints from column names. The current Drizzle declaration has
real `.references()` callbacks only in these ten tables:

- `sessions -> users` (`ON DELETE CASCADE`)
- `invitations -> users`
- `projects -> clients`
- `projectMembers -> projects, users`
- `timeEntries -> projects, users`
- `expenses -> projects, users`
- `invoices -> projects`
- `billingRules -> projects`
- `documents -> projects, users`
- `auditEvents -> projects`

All other current `*Id` fields remain exactly as declared, including fields
that are foreign keys in reviewed migration SQL but are plain `text()` in the
current Drizzle model. Adding a callback, cascade, relation, constraint, default,
index, uniqueness rule, or check is outside WP-A4.

Preserve the current table callback/index declarations exactly:

- `session_user_idx`
- `project_client_idx`
- `project_member_unique`
- `time_project_period_idx`
- `time_worker_period_idx`
- `expense_project_period_idx`
- `invoice_project_idx`
- `invoice_number_unique`
- `document_project_idx`
- `document_content_idx`

There are currently no Drizzle `relations()` declarations. Do not introduce
any. Cross-module foreign-key lambdas continue to close over the imported table
objects listed above. Shared helpers contain columns only; they must not import
tables or relations.

## Mechanical implementation order

1. Capture the pre-change dirty-worktree snapshot, the 63-name runtime export
   inventory, and the generated-Drizzle SQL baseline in an OS temp directory.
2. Add `shared.ts` without changing the façade.
3. Add anchor modules in dependency order: `system`, `identity`, `clients`,
   then `projects`.
4. Add dependent modules: `workforce-planning`, `time`, `expenses`, `documents`,
   `billing`, `invoices`, and `audit`.
5. Add the independent/lower-coupling modules: `reports`, `technical`,
   `commercial`, `finance-accounting`, `workflow`, `jobs`, `offline`, and
   `public-intake`.
6. Only after every new module typechecks in the package, replace the original
   declarations in `schema.ts` with the exact re-export façade above. There must
   be no interval committed/staged where both old and new exported declarations
   are public.
7. Run owned-file formatting only after generated SQL and export inventory
   parity are established. Formatting must not reorder columns or table
   callbacks.
8. Run the narrow checks, then the broader database/integration gates. Do not
   generate, edit, rename, or renumber a migration.

No opportunistic cleanup is allowed: retain column order, property names,
table names, SQL names, callback bodies, defaults, nullable state, boolean
modes, uniqueness calls, and declaration semantics. The source-order grouping
changes only because declarations move into the frozen domain map.

## Exact verification contract

All commands run from the repository root under Node `24.19.0` and pnpm
`11.22.0`. Existing engine warnings under another Node version invalidate final
packet evidence.

### 1. Public export inventory parity

Before and after extraction, run and save this output outside the repository:

```powershell
node --experimental-strip-types --input-type=module -e "const m=await import('./packages/database/src/schema.ts'); console.log(Object.keys(m).sort().join('\n')); console.log('count='+Object.keys(m).length)"
```

The before/after output must be byte-identical, contain `count=63`, and contain
only the 63 table values assigned in the module map. `lifecycle` must be absent.

### 2. Generated Drizzle SQL parity

Before the first source edit, generate into an empty OS temp directory; after
the final edit, repeat into a different empty OS temp directory using the same
command and name:

```powershell
$beforeTemp = Join-Path ([System.IO.Path]::GetTempPath()) "ja-wp-a4-before-$PID"
New-Item -ItemType Directory -Path $beforeTemp | Out-Null
Push-Location packages/database
pnpm exec drizzle-kit generate --dialect sqlite --schema ./src/schema.ts --out $beforeTemp --name wp_a4_parity --prefix index
Pop-Location
```

After extraction, repeat with a different empty directory:

```powershell
$afterTemp = Join-Path ([System.IO.Path]::GetTempPath()) "ja-wp-a4-after-$PID"
New-Item -ItemType Directory -Path $afterTemp | Out-Null
Push-Location packages/database
pnpm exec drizzle-kit generate --dialect sqlite --schema ./src/schema.ts --out $afterTemp --name wp_a4_parity --prefix index
Pop-Location
```

Then compare the sole generated SQL file from each directory:

```powershell
$beforeSql = @(Get-ChildItem -LiteralPath $beforeTemp -Filter '*.sql')
$afterSql = @(Get-ChildItem -LiteralPath $afterTemp -Filter '*.sql')
if ($beforeSql.Count -ne 1 -or $afterSql.Count -ne 1) { throw 'Expected one generated SQL file per snapshot' }
$beforeRawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $beforeSql[0].FullName).Hash
$afterRawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $afterSql[0].FullName).Hash
$canonicalize = {
  param([string]$path)
  (((Get-Content -Raw -LiteralPath $path) -replace "`r`n", "`n") -split '--> statement-breakpoint' |
      ForEach-Object { ($_ -replace '\s+', ' ').Trim() } |
      Where-Object { $_ } |
      Sort-Object) -join "`n"
}
$beforeCanonical = & $canonicalize $beforeSql[0].FullName
$afterCanonical = & $canonicalize $afterSql[0].FullName
if ($beforeCanonical -cne $afterCanonical) { throw 'Generated Drizzle schema changed' }
```

Generation must discover all 63 table exports through `src/schema.ts`. Record
both raw hashes. They should match; if they do not, the only permissible cause
is statement ordering, and the canonical statement-multiset comparison must
still match exactly. Any changed statement, constraint, index, default, or FK
fails the packet and requires reviewer escalation.

### 3. Fresh, populated-upgrade, and declared/effective parity tests

Run the existing integration tests without modifying them:

```powershell
pnpm vitest run tests/integration/database.test.ts -t "enables WAL, foreign keys and STRICT schema"
pnpm vitest run tests/integration/database.test.ts -t "upgrades a populated pre-V3 database without losing business rows"
pnpm vitest run tests/integration/database.test.ts -t "keeps the declared Drizzle schema aligned with the migrated SQLite schema"
pnpm db:migrate:fresh
```

The populated upgrade must retain its seeded user/client/project/time rows and
finish at migration version 18. The declared/effective test must enumerate the
re-exported module tables through `@ja/database/schema` and match every declared
column to the freshly migrated SQLite database.

### 4. Foreign-key and integrity evidence

After `pnpm db:migrate:fresh`, run:

```powershell
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db=new DatabaseSync('packages/database/data/test-fresh.db'); const fk=db.prepare('PRAGMA foreign_key_check').all(); const integrity=db.prepare('PRAGMA integrity_check').all(); db.close(); if(fk.length!==0 || integrity.length!==1 || integrity[0].integrity_check!=='ok'){console.error({fk,integrity});process.exit(1)}"
pnpm db:check
pnpm db:integrity
```

`foreign_key_check` must return zero rows and `integrity_check` exactly `ok`.

### 5. Static and broader gates

```powershell
pnpm exec prettier --check packages/database/src/schema.ts packages/database/src/schema
pnpm exec eslint packages/database/src/schema.ts packages/database/src/schema
pnpm --filter @ja/database typecheck
pnpm test:integration
pnpm typecheck
pnpm build
git diff --check -- packages/database/src/schema.ts packages/database/src/schema
git diff --exit-code -- packages/database/package.json packages/database/drizzle.config.ts migrations packages/database/src/index.ts
git status --short -- tests
```

The final `git diff --exit-code` and test status are ownership guards. The
`tests` status output must be byte-identical to the pre-packet snapshot because
that tree already contains unrelated work. If another guarded path was already
dirty in the parent snapshot, compare its pre/post diff hash instead of
overwriting user work.

## Acceptance criteria

WP-A4 is accepted only when all of the following are true:

1. Only the owned façade and exact new schema-module paths changed.
2. `@ja/database/schema` still exports the same 63 names and no helper/type
   additions; package exports and Drizzle config are unchanged.
3. Every table declaration exists exactly once and in its assigned module.
4. Generated Drizzle SQL before/after has an identical canonical statement
   multiset; raw hashes are also identical unless the independent reviewer
   confirms that the sole raw difference is statement order.
5. Fresh migration, populated upgrade, declared/effective column parity,
   foreign-key check, integrity, package/workspace typecheck, integration, and
   build gates pass on the pinned toolchain.
6. No migration, data/backfill, relation, FK/index/default, repository, product,
   or runtime behavior change exists.
7. An independent `backend_domain` reviewer inspects the move and returns PASS;
   the migration worker does not self-certify.

## WP-A3 sequencing decision

WP-A4 does **not** need to wait for WP-A3. The accepted WP-A3 contract explicitly
forbids edits to `schema.ts`, `index.ts`, migrations, and tests; its internal
repository domains do not import schema modules and may not add package-root
exports. Current repository façades also do not import `@ja/database/schema`.
Therefore A3 and A4 have disjoint write paths and stable contracts after WP-B1.

A4 must pause only if the parent changes A3 ownership to include
`packages/database/src/schema/**`, permits a direct schema-submodule import, or
another active packet owns the schema façade. That would be a hot-path/contract
conflict requiring parent resolution, not a reason to redesign this split.
When both run in one shared checkout, each worker should run final broad gates
only after the other's in-progress files are coherent; transient broad-gate
failures are not authorization to edit the other packet.

## Risks and rollback

Key risks:

- Drizzle Kit might fail to discover values through the façade; generated SQL
  parity is the blocking proof.
- A copied block can silently lose a column, index callback, reference callback,
  default, boolean mode, or uniqueness declaration.
- Re-exporting `shared.ts` would expand the public API and expose `lifecycle`.
- A reverse schema import can create ESM initialization cycles and partially
  initialized table references.
- “Correcting” declared FKs/indexes to resemble migration SQL would be a real
  schema-semantic change and is forbidden even where the current declaration is
  incomplete.

Rollback contains no database action because WP-A4 creates no migration and
touches no data. On any parity or review failure, restore only
`packages/database/src/schema.ts` from the captured pre-packet content and
remove the exact newly added `packages/database/src/schema/*.ts` files using a
reviewed patch/recoverable operation. Do not reset the worktree, revert unrelated
changes, create a down migration, stage, or commit. Disposable temp-generated
Drizzle/test databases may be removed after their resolved paths are verified
to be within the packet's temp/test locations.

## Required handoff

Return:

- summary of the mechanical extraction;
- exact changed files;
- pre/post 63-export inventory and generated-SQL hashes;
- migrations/data changes (`none` expected);
- all commands and exact outcomes;
- FK/integrity and fresh/populated/parity evidence;
- unresolved risks/blockers;
- requirement IDs `SPEC-ARCH-001` and `V31-015`;
- whether another agent must change an interface (`no` expected);
- confirmation that no files were staged or committed.
