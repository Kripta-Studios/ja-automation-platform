# WP-A3 — Database extraction-leaf contract

## ID and objective

`WP-A3`. Define stable Complexity-A extraction leaves that continue decomposing `PortalRepository` and `V3Repository` after accepted WP-B1, without changing public behavior, finance semantics, schemas, migrations, or data.

Linked requirements:

- `SPEC-ARCH-001`
- `V31-015`

This is a Sol/B-lead contract for Luna `backend_leaf` implementers. It authorizes only the mechanical leaves listed below. It does not authorize semantic convergence, lifecycle redesign, RBAC changes, financial refactoring, schema work, or new product behavior.

## Preconditions and upstream dependencies

1. WP-B1 is accepted.
2. These six WP-B1 core modules are stable and read-only to every WP-A3 leaf:
   - `packages/database/src/core/transaction.ts`
   - `packages/database/src/core/busy-retry.ts`
   - `packages/database/src/core/audit.ts`
   - `packages/database/src/core/authorization.ts`
   - `packages/database/src/core/storage-key.ts`
   - `packages/database/src/core/sequence.ts`
3. The parent records a fresh dirty-worktree snapshot and an API inventory/fingerprint immediately before each leaf starts.
4. The parent grants one explicit façade lease per active leaf. A worker may not start if another writer owns the same façade.
5. Each leaf begins from the reviewed output of the preceding leaf on that façade. Workers must not recreate an earlier façade version or overwrite accepted delegations.

## Stable extraction shape

Each domain module is an internal implementation module. It is not re-exported from `packages/database/src/index.ts`.

The façade remains the public object and retains every public method with its exact name, parameters, default values, synchronous return behavior, returned shape, and thrown public error class. A moved façade method becomes a small delegation wrapper; callers never construct or import a domain repository directly.

Use constructor-injected, structural dependencies local to each domain module. A domain module may receive only the capabilities it uses, selected from:

- `sqlite: DatabaseSync`;
- `transaction<T>(work: () => T): T`;
- `audit(principal, action, entityType, entityId, details): void`;
- `assertActive(principal): void`;
- `assertReadable(principal): void`;
- `assertProjectMembership(principal, projectId, onDate?): void`;
- `canViewRecord(principal, projectId, ownerId): boolean` where an existing façade policy must be preserved;
- `nextSequence(scope, scopeId): number`;
- error factories/callbacks that construct the existing façade error classes with exact messages.

Rules for dependencies:

1. Domain modules must not import `repository.ts` or `v3-repository.ts`; that would create a cycle.
2. Domain modules must not define replacement RBAC, step-up, audit, transaction, storage-key, sequence, or busy-retry policy. Existing façade/core capability callbacks remain authoritative.
3. Domain modules may import stable value helpers directly from `@ja/domain` or schema-free validation/value libraries already used by the moved code, but imports must be no broader than the original method cluster.
4. Existing private input aliases may move into the relevant internal module and be imported by the façade, but they must not be added to package-root exports. Structural input and return behavior must remain identical.
5. SQL text, bind order, query ordering, limits, default values, timestamps, ID generation order, transaction scope, audit action/entity/details, and error text move mechanically. Do not rewrite or optimize SQL in this packet.
6. Do not create a shared mutable `domains/index.ts`, barrel, base class, or catch-all context file. Each leaf owns only its domain module and the temporarily leased façade. This prevents new hot files and accidental cross-domain coupling.

## Dependency DAG and execution order

```text
WP-B1 accepted
    |
    +-- Wave 1P: A3-P1 clients -------------------------+
    |                                                    |
    +-- Wave 1V: A3-V1 technical changes (parallel) ----+--> independent review
                                                         |
                                                         v
                                                  A3-P2 workforce
                                                         |
                                                  independent review
                                                         |
                                                         v
                                                  A3-P3 planning
                                                         |
                                                  independent review
                                                         |
                                                         v
                                                  A3-P4 operational time
                                                         |
                                                  independent review
                                                         |
                                                         v
                                              parent integration gate
```

`A3-P1` and `A3-V1` may run concurrently because they own different façades and different new module paths. `A3-P2`, `A3-P3`, and `A3-P4` are strictly sequential because each temporarily edits `repository.ts`. No other pair of WP-A3 write leaves may run concurrently.

## Precise non-overlapping implementation batches

### A3-P1 — Client directory extraction

Objective: move the stable client/client-contact operations from `PortalRepository` into one cohesive internal domain module.

Complexity: A; owner profile `backend_leaf` (Luna Max).

Exclusive owned write paths while active:

- new `packages/database/src/domains/clients/client-repository.ts`
- temporary exclusive façade lease: `packages/database/src/repository.ts`

Methods whose implementations move and whose façade methods remain/delegate:

- `createClient`
- `createClientContact`
- `listClientContacts`
- `listAllClientContacts`
- `listClients`

Shared types/dependencies:

- existing `ClientInput` structural contract;
- `DatabaseSync`, `Principal`, `Currency`;
- `canManageClients`, `newId`;
- façade callbacks for active/readable authorization, transaction, audit, sequence allocation, validation errors, access errors, text validation, and time generation.

Explicit exclusions:

- `createProject` does not move; it contains project budget/billing-model and exact-money inputs.
- no client lifecycle/archive/edit behavior may be added; that belongs to WP-B5.
- no billing contact semantics may be reinterpreted.

Required tests/evidence:

- pre/post public API inventory and identical fingerprint;
- `pnpm --filter @ja/database typecheck`;
- `pnpm vitest run tests/integration/commercial-billing.test.ts tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts tests/security/repository-privacy.test.ts`;
- owned-file Prettier, ESLint, and `git diff --check`;
- diff review proving client SQL/bind order/audit/error strings are mechanical moves.

Acceptance:

- all five public façade methods are still present and delegate;
- package-root exports and constructor remain unchanged;
- client/client-contact behavior and query visibility are byte-for-byte equivalent at the SQL/error/audit contract level;
- no other method or domain is moved.

### A3-V1 — Technical-change extraction

Objective: move the existing technical-change workflow from `V3Repository` into a cohesive internal module without changing industrial safety or approval semantics.

Complexity: A only because this is a mechanical move under a frozen workflow contract; owner profile `backend_leaf` (Luna Max). Any requested workflow change escalates to the industrial/B lead.

Exclusive owned write paths while active:

- new `packages/database/src/domains/technical-changes/technical-change-repository.ts`
- temporary exclusive façade lease: `packages/database/src/v3-repository.ts`

Methods whose implementations move and whose façade methods remain/delegate:

- `createTechnicalChange`
- `submitTechnicalChange`
- `reviewTechnicalChange`
- `listTechnicalChanges`

Shared types/dependencies:

- existing `TechnicalChangeInput` structural contract;
- `DatabaseSync`, `Principal`;
- `canReviewProject`, `newId`;
- façade callbacks for active/writable/project-access authorization, transaction, audit, V3 access/conflict/validation errors, text validation, and timestamp generation.

Explicit exclusions:

- safety-impact validation requirements, approval states, approval-event history, notification behavior, and reviewer policy are frozen;
- no industrial hierarchy, asset, FAT/SAT, punch-list, or closeout behavior may be added;
- no technical-report method from `PortalRepository` moves in this leaf.

Required tests/evidence:

- pre/post public API inventory and identical fingerprint;
- `pnpm --filter @ja/database typecheck`;
- `pnpm test:security`;
- `pnpm vitest run tests/security/repository-privacy.test.ts`;
- owned-file Prettier, ESLint, and `git diff --check`;
- diff review proving approval SQL, transaction scope, notifications, audit, role checks, state guards, and exact errors are unchanged.

Acceptance:

- all four public V3 façade methods remain and delegate;
- no technical-change state, safety rule, authorization, notification, or audit behavior changes;
- no other V3 method moves.

### A3-P2 — Workforce and assignment extraction

Objective: move stable skills, availability, and project-member assignment operations from `PortalRepository`.

Complexity: A; owner profile `backend_leaf` (Luna Max).

Dependencies:

- A3-P1 accepted and its `repository.ts` delegation preserved.

Exclusive owned write paths while active:

- new `packages/database/src/domains/workforce/workforce-repository.ts`
- temporary exclusive façade lease: `packages/database/src/repository.ts`

Methods whose implementations move and whose façade methods remain/delegate:

- `listSkills`
- `createSkill`
- `setWorkerSkill`
- `listWorkerSkills`
- `setWorkerAvailability`
- `listWorkerAvailability`
- `assignWorker`
- `listActiveWorkers`

Shared types/dependencies:

- `DatabaseSync`, `Principal`;
- `canManageAssignments`, `newId`;
- façade callbacks for active/readable authorization, audit, access/conflict/validation errors, text validation, and timestamp generation.

Explicit exclusions:

- `principalFor`, `updateUserStatus`, and V3 `createInvitation` remain in their façades because identity, account-state, step-up, token, and outbox semantics are security/B-owned;
- compensation/rate overrides and worker pay do not move;
- no offboarding, archive, certification, or new skill lifecycle is added.

Required tests/evidence:

- pre/post public API inventory and identical fingerprint;
- `pnpm --filter @ja/database typecheck`;
- `pnpm test:integration`;
- `pnpm test:security`;
- owned-file Prettier, ESLint, and `git diff --check`;
- diff review proving worker privacy, PM project scoping, active-assignment dates, audit actions, and exact error classes/messages are unchanged.

Acceptance:

- all eight public façade methods remain and delegate;
- assignment rows, dates, status defaults, skill/availability visibility, audit, and errors remain unchanged;
- accepted A3-P1 client delegation is preserved.

### A3-P3 — Planning and schedule extraction

Objective: move non-financial schedule/planning reads and writes from `PortalRepository`.

Complexity: A; owner profile `backend_leaf` (Luna Max).

Dependencies:

- A3-P2 accepted and prior Portal delegations preserved.

Exclusive owned write paths while active:

- new `packages/database/src/domains/planning/planning-repository.ts`
- temporary exclusive façade lease: `packages/database/src/repository.ts`

Methods whose implementations move and whose façade methods remain/delegate:

- `listProjectSchedule`
- `updateProjectSchedule`
- `createPlanningAssignment`
- `listPlanning`
- `listAssignedProjects`

Shared types/dependencies:

- existing inline schedule and planning input structures;
- `DatabaseSync`, `Principal`;
- `canManageAssignments`, `newId`;
- façade callbacks for active/readable authorization, audit, access/validation errors, date/text validation, and timestamp generation.

Explicit exclusions:

- `createProject` remains in the façade pending lifecycle/B5 and finance/B2 coordination;
- `createProjectMilestone`, `listMilestonesForReview`, `submitProjectMilestone`, and `reviewProjectMilestone` remain in the façade because milestones feed invoice generation and are B2-owned for extraction;
- project closeout methods do not move;
- no planning conflict detection or new lifecycle is added.

Required tests/evidence:

- pre/post public API inventory and identical fingerprint;
- `pnpm --filter @ja/database typecheck`;
- `pnpm vitest run tests/integration/invoice-lifecycle.test.ts tests/integration/portal-workflow.test.ts tests/security/repository-privacy.test.ts`;
- owned-file Prettier, ESLint, and `git diff --check`;
- diff review proving project scoping, schedule minute/date validation, query ordering, inserted defaults, audit details, and error text are unchanged.

Acceptance:

- all five public façade methods remain and delegate;
- project schedule and planning SQL/visibility behavior remain identical;
- milestone, project creation, closeout, and billing behavior are untouched;
- accepted A3-P1/P2 delegations are preserved.

### A3-P4 — Operational time-entry extraction

Objective: move worker-owned and operational-review time-entry operations while leaving finance review, sensitive detail projection, billing, and lifecycle redesign outside this A leaf.

Complexity: A only under the frozen existing behavior; owner profile `backend_leaf` (Luna Max). Any state-machine or delete/correction change escalates to WP-B5/B2.

Dependencies:

- A3-P3 accepted and all prior Portal delegations preserved.

Exclusive owned write paths while active:

- new `packages/database/src/domains/time/time-entry-repository.ts`
- temporary exclusive façade lease: `packages/database/src/repository.ts`

Methods whose implementations move and whose façade methods remain/delegate:

- `createTimeEntry`
- `submitTime`
- `updateTimeEntry`
- `operationalApproveTime`
- `listOwnTime`
- `listOwnTimeWeek`
- `copyOwnTimeLayout`

Shared types/dependencies:

- existing `TimeInput` structural contract;
- `DatabaseSync`, `Principal`;
- `canReviewProject`, `newId`;
- façade callbacks for active/readable authorization, transaction, audit, access/conflict/validation errors, date/text validation, ISO-date shifting, and timestamp generation.

Explicit exclusions:

- `financeApproveTime` is B2-owned and forbidden;
- `timeDetail` remains in the façade because its role-dependent projection exposes billing/cost fields and must be reviewed with security/finance ownership;
- report, expense, offline-sync, billing-readiness, settlement, invoice, and compensation behavior does not move;
- no draft-delete, correction, archive, overlap validation, or state transition is added or changed.

Required tests/evidence:

- pre/post public API inventory and identical fingerprint;
- `pnpm --filter @ja/database typecheck`;
- `pnpm vitest run tests/integration/commercial-billing.test.ts tests/integration/portal-workflow.test.ts tests/integration/v3-finance.test.ts tests/security/repository-privacy.test.ts`;
- `pnpm test:invariants`;
- owned-file Prettier, ESLint, and `git diff --check`;
- diff review proving editable-state/invoice-lock guards, optimistic versions, assignment-date checks, approval-event/audit writes, copy-layout duplicate checks, and transaction boundaries are unchanged.

Acceptance:

- all seven public façade methods remain and delegate;
- operational time behavior and downstream finance-visible rows remain identical;
- finance approval and sensitive detail projection remain in the façade;
- accepted A3-P1/P2/P3 delegations are preserved.

## Temporarily leased façade ownership

Every WP-A3 implementation leaf must edit a façade to install imports and delegation wrappers. The lease is temporary and exclusive:

| Leaf  | Temporary façade lease                   | May run concurrently with |
| ----- | ---------------------------------------- | ------------------------- |
| A3-P1 | `packages/database/src/repository.ts`    | A3-V1 only                |
| A3-V1 | `packages/database/src/v3-repository.ts` | A3-P1 only                |
| A3-P2 | `packages/database/src/repository.ts`    | no WP-A3 Portal leaf      |
| A3-P3 | `packages/database/src/repository.ts`    | no WP-A3 Portal leaf      |
| A3-P4 | `packages/database/src/repository.ts`    | no WP-A3 Portal leaf      |

The parent must not assign an overlapping B2/B3/B5/database packet while a lease is active. A worker must escalate rather than edit another leaf's module or resolve a conflict by overwriting accepted code.

## Global forbidden paths and behavior

All leaves are forbidden from editing:

- `packages/database/src/schema.ts`;
- `packages/database/src/index.ts`;
- every migration;
- the six WP-B1 core modules;
- tests (characterization gaps require a separately owned test packet);
- portal/UI, reporting, invoice-template, finance, documentation, RTM, and unrelated dirty files;
- Git index or HEAD.

All leaves are forbidden from:

- adding package-root exports;
- changing constructor signatures or public method signatures;
- changing synchronous methods to async;
- changing SQL, bind order, query order/limits, timestamps, IDs, defaults, transactions, audit records/redaction, RBAC/step-up, errors, money representation, or returned shapes;
- adding schema, migrations, data fixes, product behavior, lifecycle transitions, archive/delete semantics, or TODO placeholders;
- importing a façade from a domain module or one domain module from another.

## Finance/billing boundary reserved for WP-B2

WP-B2 owns all billing/finance semantic extraction. No WP-A3 leaf may move, delegate, edit, or opportunistically clean up these methods/helpers.

Portal façade forbidden finance/billing surface includes:

- `financeApproveTime`, `financeApproveExpense`;
- `createCompensationRule`, `createClientLaborRate`, `createInternalCostRule`;
- `createLegalEntity`, `createInvoiceNumberPolicy`, `createTaxProfile`, `createBillingRule`;
- `listLegalEntities`, `listTaxProfiles`, both `billingReadiness` paths;
- `createInvoiceDraft`, `createInvoiceAdjustment`, `approveInvoiceDraft`, `issueInvoice`, `sendInvoice`, `recordPayment`, `voidInvoice`;
- `findClientRate`, `insertInvoiceLine`, `insertInvoiceSource`, `recheckInvoiceSources`;
- `workerPay`, `projectFinance`, finance portions of `dashboard`/`projectOverview`, `invoicePreview`, `listInvoices`, `listBillingRules`, and `listFinanceProjects`;
- milestone methods because milestone state feeds invoice sources;
- project creation fields involving billing model, currency, budgets, caps, or fixed price.

V3 façade forbidden finance/billing surface includes:

- compensation, labor-rate, internal-cost, assignment-rate-override, rate-resolution, amount, settlement, and reimbursement methods/helpers;
- `workerPay`, `projectFinance`, `financePortfolio`, `masterLedger`;
- payments, reimbursement recording, invoice voiding, billing readiness, billing-period close;
- period reports, Accounting Packs, invoice/accounting artifacts, snapshots, export registration/download metadata, and related storage-key paths.

If an authorized A method cannot be moved without changing a forbidden finance method or interpreting finance truth, stop that leaf and escalate to the parent/B2 owner.

Other B-owned/deferred boundaries:

- identity/account status/invitations and private documents: security/RBAC lead;
- offline mutation synchronization: offline-conflict B lead;
- durable jobs/outbox/scheduling: WP-B3;
- client/project/time/report/expense lifecycle changes: WP-B5;
- expenses and receipt/document workflows: B2/B5/security coordination;
- reports and project closeout: reporting/lifecycle/finance coordination.

## Public API invariants for every leaf

1. `packages/database/src/index.ts` continues exporting the same public symbols only.
2. `PortalRepository` and `V3Repository` constructors remain `constructor(sqlite: DatabaseSync)`.
3. All public method names, overload/default behavior, input compatibility, synchronous behavior, return shapes, and thrown error classes/messages remain unchanged.
4. Existing error classes remain defined/exported from their façade modules.
5. Internal domain types/modules are not package-root exports and are not imported by callers.
6. Existing private façade policy may be passed as callbacks but may not be duplicated with changed semantics.
7. No transaction grows or crosses a previous method boundary; no write leaves its prior transaction.
8. Audit event content/order/redaction and authorization/step-up checks occur at the same point relative to validation and writes.
9. Exact-money/minor-unit consumers and issued/final financial history are untouched.
10. The pre/post API inventory/fingerprint must match for each leaf. Any mismatch is a failure requiring rollback/escalation, not an accepted refactor artifact.

## Parent integration acceptance

After all five leaves and independent reviews:

- only the five exact new domain module paths, the two façades, and leaf reports may differ from the accepted WP-B1 database baseline;
- each façade remains the sole public entry point and delegates only the authorized methods;
- no circular dependency exists;
- no duplicate implementation of an extracted method remains in a façade;
- no SQL/behavior diff exists beyond movement and delegation;
- package typecheck, unit, integration, invariants, security, database checks, and build are run and recorded;
- broader failures caused by unrelated concurrent work are reported with exact paths/output and are not fixed across ownership boundaries;
- independent reviewer returns PASS or routes a concrete failure to the responsible leaf.

Recommended final commands:

```powershell
pnpm exec prettier --check packages/database/src/repository.ts packages/database/src/v3-repository.ts packages/database/src/domains
pnpm exec eslint packages/database/src/repository.ts packages/database/src/v3-repository.ts packages/database/src/domains
pnpm --filter @ja/database typecheck
pnpm test:unit
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm db:check
pnpm db:integrity
pnpm build
```

Migration impact: **none**. No fresh migration, upgrade migration, schema backfill, or data mutation is authorized or expected.

## Leaf handoff contract

Each Luna implementer returns a report containing:

- leaf ID and summary;
- exact changed files;
- exact façade methods delegated;
- pre/post public API inventory and fingerprint;
- migrations/data changes (`none` expected);
- commands/tests run and exact outcomes;
- diff evidence for preserved SQL, transactions, audit, authorization, errors, and returned shapes;
- unresolved risks/blockers;
- requirement IDs `SPEC-ARCH-001` and `V31-015`;
- whether another agent must change an interface (`no` expected);
- confirmation that no files were staged or committed.

Implementers do not self-certify completion. A separate read-only reviewer must inspect each material leaf before the parent advances the next Portal façade lease or final integration.
