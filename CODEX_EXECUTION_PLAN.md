# J&A Client Essential Production Completion — Execution Plan

Retargeted: 2026-08-23
Historical planning baseline: `codex/v3-production-completion-orchestrated-20260819` at `ecd4f97a84190a36c63473126f55a79a3710d3c9`

This plan preserves useful historical repository findings but is now subordinate to `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md` and its checklist. Historical V3.1–V3.4 expansion, all P0/P1/P2 backlog items, all 207 RTM rows, and the old 42-step scenario are deferred roadmap evidence, not the client-release verdict.

## Gate R0 — Orchestration and worktree attestation

Before any implementation packet starts, the parent must record:

1. parent Sol lead/integration authority recorded;
2. each selected custom profile's actual model and reasoning effort;
3. enforced read-only filesystem permissions for reviewer/audit agents, or explicit user acceptance that read-only behavior is procedural rather than sandbox-enforced;
4. a clean ownership ledger for all write agents and the exact starting dirty-worktree snapshot.

If the runtime cannot expose an exact model override or enforce read-only permissions technically, continue with the closest available agent mechanism and procedural read-only ownership. Do not block Essential implementation solely on runtime attestation.

## Routing policy

Every packet is classified before delegation:

- **A → Luna Max by default:** bounded ownership and stable contracts; includes substantial production leaves, CRUD/UI, responsive work, repetitive refactors, fixtures, adapters, documentation, tests, and additive/mechanical migrations whose semantics are already defined.
- **B → Sol Medium:** correctness depends on multiple non-local invariants or unresolved finance, lifecycle, RBAC, durable-job, destructive-migration, or conditional offline-conflict semantics. The lead must split stable A leaves back to Luna Max.
- **C → Sol High:** architecture, cross-domain decisions, risky migration strategy, conflict resolution, and final integration sign-off.

Production importance, backend location, or code volume alone is not a reason to escalate from A to B.

## Verified baseline

### Repository state

- The actual branch differs from the branch named in `CODEX_MASTER_GOAL.md`; preserve the actual branch unless the user explicitly changes it.
- The worktree was already materially dirty before planning. Preserve all unrelated modifications and untracked files. Before implementation, capture `git status --short` and assign only exact paths.
- Toolchain: Node `v25.8.1`, pnpm `11.22.0`; the repository requires Node `24.19.0` and pnpm `11.22.0`. Re-run release evidence on the pinned Node version.
- Migrations `0001` through `0018` exist. Fresh-schema, populated pre-V3 upgrade, and schema-parity tests already provide a useful migration foundation.

### Fresh diagnostic results

| Gate                             | Result         | Verified evidence                                                                                                      |
| -------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`              | FAIL           | 20 existing files need formatting, including planning/skill files; do not conflate with new implementation regressions |
| lint / typecheck                 | PASS           | current worktree                                                                                                       |
| unit                             | PASS           | 10 files, 23 tests                                                                                                     |
| reporting                        | PASS           | 1 file, 3 tests                                                                                                        |
| integration                      | PASS           | 5 files, 10 tests                                                                                                      |
| invariants                       | PASS           | 1 test                                                                                                                 |
| security                         | PASS           | 4 files, 8 tests; coverage is not sufficient for the newly identified findings                                         |
| offline                          | PASS           | 1 file, 2 tests; cross-user isolation is not covered                                                                   |
| database checks                  | PASS           | WAL, foreign keys, integrity                                                                                           |
| build                            | PASS           | current Node version, with a Next standalone-start warning                                                             |
| E2E                              | PASS with gaps | 14 passed, 4 skipped; only phone-390 and desktop projects; no owner/finance mobile or artifact-failure lifecycle       |
| backup/restore operational tests | PASS           | current fixtures                                                                                                       |
| strict spec audit                | FAIL           | all 35 mandatory rows incomplete; script also needs UTF-8-safe Windows output                                          |

### Architecture evidence

The main hot files remain:

| File                                                   | Lines | Planning consequence                                                      |
| ------------------------------------------------------ | ----: | ------------------------------------------------------------------------- |
| `packages/database/src/v3-repository.ts`               | 5,694 | one exclusive database-decomposition owner                                |
| `packages/database/src/repository.ts`                  | 4,928 | same owner as above until façade contracts are stable                     |
| `apps/portal/src/portal.css`                           | 4,377 | one exclusive frontend-decomposition owner                                |
| `apps/portal/src/lib/PortalShell.svelte`               | 3,189 | same owner as CSS during mechanical extraction                            |
| `apps/portal/src/routes/app/[section]/+page.server.ts` | 1,028 | separate server-action extraction owner after action-name contract freeze |
| `packages/database/src/schema.ts`                      |   966 | separate schema extraction owner after repository boundaries stabilize    |

`PortalChrome.svelte`, `billing-actions.ts`, and `operations-actions.ts` are already partial extractions. Continue from those boundaries; do not restart the refactor.

### Verified P0 correctness findings

- Accounting Pack creation queues one job for all formats, while generation eagerly renders PDF first. A PDF failure can prevent XLSX/CSV/JSON output.
- Creation returns a draft and the UI reports “ready” before artifacts exist. Missing exports raise a validation error that the route does not translate, producing HTTP 500.
- Accounting Pack runs are unique by period/legal entity and returned unchanged on repeat; there is no immutable revision model or per-format status/error lifecycle.
- The background production timer exists and runs every five minutes, so auto-processing is **PARTIAL**, not absent.
- Export filenames use pack IDs rather than business semantics.
- Invoice templates are not a real registry: the package exposes one generic renderer and the portal accepts free-text `templateId`.
- Mobile navigation uses `font-size: 0`/first-letter labels; admin/security items disappear at narrow widths. Touch targets, worker tables, and invoice previews also fail the required mobile behavior.
- Finance stacking CSS exists, but required owner/finance browser evidence does not. Treat it as **PARTIAL**.
- Issued invoice history has useful immutability foundations, but period reports and Accounting Packs can be refreshed/deleted or finalized without adequate reconciliation/artifact conditions.

### Verified security findings and deferred data-readiness notes

- Offline caches and IndexedDB are not partitioned by authenticated user; cross-user leakage and sync misattribution are possible.
- Assignment access ignores assignment start/end dates. Project-manager payloads include client-rate/internal-cost data outside a least-privilege contract.
- Sensitive finance configuration and Accounting Pack export lack consistent step-up enforcement.
- Upload scanning can fail open; authorization/quota checks do not consistently precede disk writes; audit redaction misses secrets embedded in free text.
- CSRF comparison, auth rate limiting, cookie scope, anonymous health detail, and service-actor attribution need hardening.
- Historical ML/data-readiness gaps remain documented but are deferred post-core. Existing records must not be corrupted by Essential work.

## Dependency DAG

```text
W0 authority + repository-grounded CORE audit
 └─ W1 security/domain foundations
     ├─ W2 operational truth: clients/projects/assignments/time/expenses/reports/approvals
     └─ W3 financial truth: commercial rules/compensation/profitability/billing/invoices/payments
          └─ W4 six report families + truthful private artifacts
               └─ W5 responsive/accessibility + automatic jobs + deployment/backup/restore
                    └─ Client Essential 32-step journey + independent reviews + final sign-off

Offline/PWA ── CONDITIONAL on confirmed go-live connectivity need
V3.1–V3.4 industrial/ERP/integration/ML expansion ── DEFERRED POST-CORE ROADMAP
```

### Active Client Essential execution queue — 2026-08-23

| Order | Packet | Complexity / owner | Scope and dependency | State |
| ---: | --- | --- | --- | --- |
| 0 | CE-W0-MIG | B / Sol lead | Freeze current 0019–0024 migration bytes, populated upgrade/rollback and adversarial contract evidence | PASS: 32 focused tests |
| 1 | CE-W1-SEC-A1 | A / Luna backend leaf | Role-safe DTOs, effective-assignment object access, report-date authorization and same-project receipts; requires CE-W0-MIG | ACTIVE |
| 2 | CE-W1-SEC-A2 | A / Luna backend leaf | Step-up throttling and Finance export header/date validation; independent HTTP paths | ACTIVE |
| 3 | CE-W2-OPS-B1 | B / Sol domain lead with Luna leaves | Project-state write guards, required client metadata, non-destructive report correction, server-required reasons and Owner override; after SEC-A1 repository lease | PENDING |
| 4 | CE-W2-OPS-A1 | A / Luna CRUD/UI leaf | Reachable client/project restore/close/archive, usable assignment end, expense draft edit and correction controls; after OPS-B1 contracts | PENDING |
| 5 | CE-W2-REPORT-B1 | B / Sol domain lead with Luna leaves | Report supersession, authoritative `report_date`, report-linked private attachments and immutable PLC backup history | PENDING |
| 6 | CE-W3-FIN-B1 | B / Sol finance lead | Approved-only project metrics, source-linked WIP, frozen historical direct costs, fixed/milestone attribution, void-payment exclusion | PENDING |
| 7 | CE-W3-PAY-B1 | B / Sol finance lead | Payment reversal/correction, paid-invoice void guards, ledger/accounting reconciliation and concurrency | depends on FIN-B1 |
| 8 | CE-W3-INV-A1 | A / Luna backend leaf | One versioned registry with five materially distinct invoice rendering variants | ACTIVE |
| 9 | CE-W3-INV-A2 | A / Luna CRUD/UI/backend leaves | Enforce registry IDs in schemas/actions/repository and controlled selector; after INV-A1 and SEC-A1 repository lease | PENDING |
| 10 | CE-W4-ART-B1 | B / Sol finance/report lead | Canonical Accounting Pack revision wiring, explicit stale/new-version behavior, worker statement and ledger exports | after FIN-B1/PAY-B1 |
| 11 | CE-W4-JOB-A1 | A / Luna test leaf | Align stale artifact lifecycle tests to reviewed queued/claimed job contract and remove deterministic cleanup race | ACTIVE |
| 12 | CE-W5-WEB-A1 | A / Luna frontend leaf | Bounded public-site lint gate; preserve current base-path/UI behavior | ACTIVE |
| 13 | CE-W5-OPS-A1 | A/B split | Current source build, automatic timer flow, health/disk policy, realistic issued/private-artifact restore drill | after migrations/jobs/reports |
| 14 | CE-W5-E2E | A / independent browser test worker | Worker/PM/Finance/Owner 32-step journey at 360/390, 768 and 1440 | after all preceding Essential contracts |
| 15 | CE-RELEASE | C / Sol integration | Independent spec/security/finance/browser review and Client Essential gate | final |

Only one active writer may own `repository.ts`/`v3-repository.ts`; finance and operational packets using those hot files run sequentially. Invoice renderer, public-site HTTP/UI and test-only packets remain independent.

Historical packets in `work-packets/INITIAL_WORK_PACKETS.md` are retained as evidence but must be reclassified against Client Essential scope before execution. The first safe wave is chosen from audited Essential gaps, not from old backlog ordering.

1. frontend mechanical decomposition with exclusive ownership of `PortalShell.svelte` and `portal.css`;
2. database contract/decomposition work with exclusive ownership of both repository megafiles;
3. regression-test expansion with ownership limited to test infrastructure/specs.

## Phase 1 — Safe architecture boundaries

### Frontend

- Keep `PortalShell.svelte` as a compatibility façade while extracting portal data/format helpers, offline controller, and one section at a time.
- Split CSS mechanically in current source order before changing behavior: legacy, foundation, login, shell, surfaces, dashboards, forms/management, details/invoices, responsive, and final polish layers.
- Extract reusable `FormCard`, `SectionCard`, field/action-row, status, table/mobile-list, and focus primitives only after source-order parity tests exist.
- Extract `[section]/+page.server.ts` into loader/action registries without renaming public form actions.

### Database

- Keep `PortalRepository` and `V3Repository` as compatibility façades while extracting transaction/retry, audit, authorization/step-up, storage-key, and sequence utilities.
- Then extract identity/access, clients/projects/workforce/planning, time/expenses/reports/documents, billing/invoices/payments, compensation/rates/finance, period/accounting, and offline/jobs/outbox modules.
- Preserve existing duplicate behavior during mechanical extraction; semantic convergence requires dedicated invariant tests and an explicit contract decision.
- Split `schema.ts` into domain modules with a stable re-export only after repository dependency direction is known.

**Gate 1:** mechanical-extraction diff reviewed independently; public exports/action names preserved; narrow tests, typecheck, build, and parity tests pass; hot-file ownership is released before domain writers start.

## Phase 2 — P0 correctness and security

1. Define finance contracts for exact rounding, daily-minimum rate selection, net/gross reimbursable cost, timezone boundaries, legal-entity/currency scope, credit semantics, partial reimbursement, configuration invalidation, and finalized-record supersession. Use accountant-approved examples.
2. Introduce immutable Accounting Pack revisions and one lifecycle row/job per format: `queued`, `running`, `ready`, `failed`, error, attempts, hash, size, semantic filename, timestamps. Generate via temp file + fsync + atomic rename; do not trust partial pre-existing files.
3. Translate pending/failed/missing download states into explicit non-500 responses. Make retries idempotent and independent by format.
4. Bind each pack revision to a consistent source cut, legal entity, currency, reconciliation evidence, issued-invoice artifact metadata, and configuration versions.
5. Implement the five-template versioned registry and required report catalog, with registry selectors, safe rendering, CSV formula protection, XLSX columns beyond Z, XML-control stripping, and openability tests.
6. Remove mobile label hacks, restore every permitted navigation item, enforce 44px controls, stack dense forms, and provide deliberate mobile representations for tables/previews.
7. Complete client/project archive/restore and coherent draft lifecycle rules without hard-deleting issued/finalized history.
8. Partition offline caches/queues by user and tenancy; enforce assignment dates and least-privilege project-manager payloads; make scan failure closed in production; authorize before storage writes; add quota, step-up, redaction, CSRF, rate-limit, cookie, health, and service-actor tests.

**Gate 2:** every P0 matrix row has executable evidence and an independent reviewer verdict; forced PDF failure leaves non-PDF formats usable; required mobile flows pass at every specified viewport.

## Deferred roadmap — expanded industrial operations

Plant hierarchy, generic asset registry, FAT/SAT, punch lists, closeout packages, photo annotation/knowledge base, and related expansion are **DEFERRED POST-CORE ROADMAP**. Client Essential work keeps only daily/PLC technical reports, private technical attachments, and immutable PLC backup history.

This section has no Client Essential gate beyond the required report/backup subset.

## Deferred roadmap — generic business operations

Generic change orders, advanced forecast/EAC, skills/certifications, global search, universal approvals/bulk actions/notifications/imports, and separate integrity/job/artifact centers are **DEFERRED POST-CORE ROADMAP**. Essential travel/expense treatment, basic budget-vs-actual, domain approvals, truthful job state and operations remain in the CORE waves.

Essential approval/finance semantics remain B work; stable bounded UI/test leaves remain A work.

There is no generic-business-platform gate for Client Essential delivery.

## Deferred roadmap — point-in-time ML/data readiness

This entire phase is **DEFERRED POST-CORE ROADMAP** and must not start during Client Essential delivery unless explicitly commissioned.

- Define immutable `business_event` records with `event_time`, `known_at`, actor/source/provenance, schema version, and hash.
- Define immutable project snapshots with `as_of`, source-cut watermark, schema version, provenance, and reconstruction status.
- Version feature definitions with availability time; store targets separately from features.
- Produce reproducible dataset manifests with source ranges, splits, schema and content hashes; use project-disjoint and time-forward splits.
- Add model registry, immutable prediction history, shadow/activate/rollback/disable lifecycle, and explicit experimental UI semantics.
- Exclude reconstructed legacy records from trusted evaluation unless separately labeled and approved.

Existing point-in-time records must not be corrupted, but missing ML infrastructure is not a Client Essential release blocker.

## Deferred roadmap — P2/P3 expansion and provider platforms

Command palette, mileage subsystem, generic notification/document/feature-flag products, bank/provider/API/webhook platforms, client portal, email history, advanced FX/tax, industrial knowledge/photo expansion and inference adapters are **DEFERRED POST-CORE ROADMAP** unless a concrete Client Essential dependency is documented.

Existing integrations must remain safe and truthful. New generic provider contracts and ML enabling infrastructure are not mandatory for Client Essential delivery.

This deferred section has no Client Essential release gate.

## Phase 6 — Client Essential hardening and 32-step acceptance

Preserve the public Next.js site and verify its production base path/portal entry/isolation. Complete invitation-only auth, step-up/privacy, representative responsive/accessibility journeys, automatic jobs, deployment/Caddy/health, backup/restore, and one executable Client Essential 32-step multi-role acceptance journey. Offline/PWA remains conditional on the go-live connectivity decision.

**Gate 6:** all non-conditional CORE-01..17 requirements and applicable Client Essential DoD steps have independent evidence; representative 360/390, 768 and 1440 journeys pass; deferred roadmap rows do not block the verdict.

## Migration and rollback strategy

- Preserve migrations `0001`–`0018`; assign new numbers centrally and sequentially.
- Prefer additive tables/columns, dual-read/backfill where required, and delayed cleanup. Never repurpose historical fields when meaning changes.
- Test every migration on a fresh database, the existing populated pre-V3 fixture, and a scrubbed representative database copy.
- Verify foreign keys, integrity, row counts, financial reconciliation, artifact hashes, authorization defaults, and schema parity.
- Backfill historical artifacts as `ready` only when file/hash evidence is valid; otherwise mark them explicitly unavailable/failed. Preserve any existing reconstructed data-readiness labels without expanding that deferred subsystem.
- Rollback means restoring a verified backup and prior compatible application image. Do not write destructive down-migrations for issued/finalized or append-only history.

## Exclusive ownership map

| Hot path                                                                             | Exclusive writer until released                |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `PortalShell.svelte`, `PortalChrome.svelte`, `portal.css`, new section/style modules | frontend decomposition packet                  |
| `[section]/+page.server.ts`, extracted action/loader registries                      | portal server decomposition packet             |
| `repository.ts`, `v3-repository.ts`, extracted repository modules                    | database decomposition packet                  |
| `schema.ts`, schema re-export modules                                                | schema decomposition packet                    |
| migration number and migration files                                                 | one parent-assigned migration packet at a time |
| accounting/reporting job and financial report modules                                | finance/artifact packet                        |
| invoice-template registry/renderers                                                  | report/template packet                         |
| Playwright config, auth fixtures, shared E2E helpers                                 | test-infrastructure packet                     |

No domain packet may edit a hot path still owned by a decomposition packet. Reviewers are always separate agents and have no write ownership.

## Release gates

For each packet: narrow tests first, then lint/typecheck/build as relevant, upgrade/fresh migration evidence for data changes, and independent review. Browser packets use representative 360/390 phone, 768 tablet, and 1440 desktop evidence, including keyboard/focus and deliberate table behavior; add widths when a reproduced defect/risk warrants it.

Before a production-completion claim, run under the pinned Node version:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:reporting
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm db:check
pnpm db:integrity
pnpm build
pnpm test:e2e
```

Also run applicable migration-upgrade, backup/restore, artifact openability/failure-injection, finance/integrity, security/RBAC, responsive, and final integration reviews. Historical strict-RTM tooling may remain as a roadmap diagnostic, but 207-row completeness and deferred data-leakage gates do not control the Client Essential verdict.

**Release verdict:** `CLIENT READY` only when every non-conditional Client Essential requirement and applicable DoD item is `PASS` with evidence, required gates pass, documentation matches behavior, and independent integration review has no Essential blocker. Historical V3.1–V3.4/207-row/42-step failures are deferred roadmap, not release blockers.
