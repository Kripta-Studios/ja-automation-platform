# WP-A2 handoff — portal section loader/action decomposition

## Status

READY FOR REVIEW

The implementation is a mechanical extraction under the frozen WP-A2 contract. The parent must route the twelve owned production paths to the independent security reviewer; this handoff is not a self-certification of acceptance.

## Changed files

Exactly the twelve owned production paths changed or were created:

- `apps/portal/src/routes/app/[section]/+page.server.ts`
- `apps/portal/src/routes/app/[section]/section-load.ts`
- `apps/portal/src/routes/app/[section]/section-actions.ts`
- `apps/portal/src/lib/server/portal-week.ts`
- `apps/portal/src/lib/server/actions/project-actions.ts`
- `apps/portal/src/lib/server/actions/access-actions.ts`
- `apps/portal/src/lib/server/actions/time-actions.ts`
- `apps/portal/src/lib/server/actions/expense-actions.ts`
- `apps/portal/src/lib/server/actions/document-actions.ts`
- `apps/portal/src/lib/server/actions/approval-actions.ts`
- `apps/portal/src/lib/server/actions/finance-actions.ts`
- `apps/portal/src/lib/server/actions/notification-actions.ts`

No tests, fixtures, generated `$types`, registries, repository/service files, schema, migration, manifest, lockfile, documentation, Git index, or `HEAD` were edited by WP-A2.

## Frozen baselines and inventory

- Route before: 1,028 lines; final façade: 6 lines.
- Route precondition SHA-256: `ADE441A414289DC47065C0FD57FEBD7B48B619BEA618ADF9322A58F32E3EBAE5`.
- `billing-actions.ts` unchanged SHA-256: `A033508EF6402E00EF3469D46AA1FD52FAE6A9484E8F02E51A5CB2A29F3426B8`.
- `operations-actions.ts` unchanged SHA-256: `63A4877491EEC69BEE03B3CA6CE66F9F34D3D82646CDF3D72EE6954039EADDF3`.
- `sectionActions` count: 53.
- Ordered 53-action inventory SHA-256: `3DD7043A3C214D9E8E4374FDAF4A6FF321E68A605F608FBC60B8AA533ACF8B1B`.
- No action-name collision was found.

## Parity evidence

- Loader admission order, all fifteen sections, common response keys, section shapes, role branches, synchronous call order, and one `finally` SQLite close were moved unchanged.
- `mondayOf` and `weeklyView` body parity: PASS.
- All 27 moved inline handler body comparisons against the frozen route: PASS.
- Every action retains its original section gate, validation transformations, repository/V3 call and argument order, failure/status/message shape, upload cleanup state machine, and close behavior.
- The final route façade contains only generated route types, `sectionActions`/`sectionLoad` imports, and their exports.
- No reverse route/library import or extracted-handler-to-handler call was introduced.

## Validation

Pinned runtime:

- Node: `v24.19.0`
- pnpm: `11.22.0`

Commands:

- `pnpm --filter @ja/portal typecheck` — PASS.
- Scoped ESLint over all twelve owned paths — PASS, 0 errors.
- `pnpm test:integration` — command FAILED because the existing WP-T0 artifact lifecycle file has 4 RED tests and 11 passing tests (15 total). The failures assert downstream queued/per-format artifact semantics and are outside WP-A2’s frozen extraction boundary; no WP-A2 path or product fix was made for them.
- `pnpm test:security` — PASS, 4 files / 8 tests.
- `pnpm typecheck` — PASS across the workspace.
- `pnpm build` — PASS; only existing Rollup/node:sqlite warnings were emitted.
- Scoped `git diff --check` — PASS.
- Inventory and moved-body parity checker — PASS (53 actions, loader, helpers, 27 handlers).

Browser/manual verification: none assigned for this backend/route mechanical tranche.

## Data, writes, and unresolved risks

- Migrations: none.
- Database or production data writes: none.
- External writes/deploy/push: none.
- Contract-known semantic defects were deliberately preserved for their separate packets: synchronous artifact processing and the existing Accounting Pack “ready” message, plus the known upload/step-up/storage-key/audit concerns. WP-A2 does not reinterpret any of them.
- The independent security review remains required before acceptance.

## Requirements and interfaces

- Requirements believed advanced: `SPEC-ARCH-001`, `V31-015`.
- No interface or path change is required from another agent.
