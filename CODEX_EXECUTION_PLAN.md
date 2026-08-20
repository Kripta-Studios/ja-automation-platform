# J&A V3 Production Completion — Verified Execution Plan

Date: 2026-08-20
Planning baseline: `codex/v3-production-completion-orchestrated-20260819` at `ecd4f97a84190a36c63473126f55a79a3710d3c9`

This plan is based on direct repository inspection and fresh diagnostics. It supersedes unverified assumptions in the prewritten audit without treating that audit as discarded evidence. It authorizes no implementation by itself.

## Gate R0 — Orchestration attestation (blocking)

Before any implementation packet starts, the parent must record:

1. parent runtime attestation as GPT-5.6 Sol/high;
2. each selected custom profile's actual model and reasoning effort;
3. enforced read-only filesystem permissions for reviewer/audit agents, or explicit user acceptance that read-only behavior is procedural rather than sandbox-enforced;
4. a clean ownership ledger for all write agents and the exact starting dirty-worktree snapshot.

The configured profile names routed correctly in the smoke test, but the runtime did not expose exact child model/effort and read-only profiles reported unrestricted filesystem access. This is a control gap, not permission to proceed. No long-running implementation packet may start until Gate R0 is resolved.

## Routing policy

Every packet is classified before delegation:

- **A → Luna Max by default:** bounded ownership and stable contracts; includes substantial production leaves, CRUD/UI, responsive work, repetitive refactors, fixtures, adapters, documentation, tests, and additive/mechanical migrations whose semantics are already defined.
- **B → Sol Medium:** correctness depends on multiple non-local invariants or unresolved finance, lifecycle, RBAC, durable-job, destructive-migration, offline-conflict, or point-in-time semantics. The lead must split stable A leaves back to Luna Max.
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

### Verified security and data-readiness findings

- Offline caches and IndexedDB are not partitioned by authenticated user; cross-user leakage and sync misattribution are possible.
- Assignment access ignores assignment start/end dates. Project-manager payloads include client-rate/internal-cost data outside a least-privilege contract.
- Sensitive finance configuration and Accounting Pack export lack consistent step-up enforcement.
- Upload scanning can fail open; authorization/quota checks do not consistently precede disk writes; audit redaction misses secrets embedded in free text.
- CSRF comparison, auth rate limiting, cookie scope, anonymous health detail, and service-actor attribution need hardening.
- Existing `finance_snapshot` rows and scattered audit/approval/invoice records are not a point-in-time training foundation. Historical finance queries can combine past work dates with current approval/configuration state.
- No versioned feature registry, dataset manifest, model registry, prediction history, shadow lifecycle, or leakage gate exists.

## Dependency DAG

```text
R0 orchestration attestation
 ├─ A1 frontend mechanical decomposition ─┬─ P0 responsive remediation ─┬─ industrial/business UI
 │                                       └─ P0 form/design primitives ──┘
 ├─ A2 portal action/loader decomposition ───────────────────────────────┤
 ├─ B1 database façade/domain contracts ─┬─ A3 repository extraction ───┬─ lifecycle CRUD
 │                                       ├─ B2 finance contracts ───────┼─ artifact pipeline
 │                                       └─ B5 RBAC/offline contracts ──┴─ security fixes
 └─ T0 regression-test expansion ────────────────────────────────────────┘

artifact pipeline + finance contracts ── report catalog/template registry
database boundaries + lifecycle/RBAC contracts ── industrial operations
industrial event vocabulary + business operations contracts ── data-readiness foundation
P0/P1 architecture and domains ── P2 expansion/provider interfaces
P0/P1 domain gates ── A7 public/i18n/accessibility + B10 auth/PWA + B11 deployment/ops
all domain gates ── T1 executable 42-step DoD ── A6 documentation/207-row trace audit
T1 + all independent reviews ── C1 full release gate ── Sol/high sign-off
```

The first safe concurrent wave after Gate R0 is instantiated as WP-A1, WP-B1, and WP-T0 in `work-packets/INITIAL_WORK_PACKETS.md`, including exact branches, worktree paths, and owned files:

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

## Phase 3 — Industrial operations

After database/lifecycle/RBAC boundaries are stable, add the normalized Plant → Area → Line → Machine/Station hierarchy, automation assets, immutable backup versions, technical changes, FAT/SAT/commissioning, punch lists, closeout packages, and evidence attachments. Extend existing technical-change/closeout foundations rather than duplicating them.

**Gate 3:** linked/versioned lifecycle, safe storage keys, authorization, audit, upgrade migration, and field-responsive evidence pass.

## Phase 4 — Business operations

Add versioned presets/report blocks, recurring jobs, scope/change orders, immutable budget baseline and versioned forecasts, travel/cost treatment, timesheet/planning conflict flows, skills/certifications, unified approvals, dashboards/search, integrity/job/artifact/import centers, document retention, offline recovery, operations health, and business settings.

Budget/change-order/approval/finance semantics remain B work; stable CRUD/UI/import/admin leaves remain A work.

**Gate 4:** representative role-based workflows operate without parallel spreadsheets and preserve finance, audit, authorization, and responsive invariants.

## Phase 5 — Point-in-time data readiness

Start only after industrial and business event vocabularies are stable.

- Define immutable `business_event` records with `event_time`, `known_at`, actor/source/provenance, schema version, and hash.
- Define immutable project snapshots with `as_of`, source-cut watermark, schema version, provenance, and reconstruction status.
- Version feature definitions with availability time; store targets separately from features.
- Produce reproducible dataset manifests with source ranges, splits, schema and content hashes; use project-disjoint and time-forward splits.
- Add model registry, immutable prediction history, shadow/activate/rollback/disable lifecycle, and explicit experimental UI semantics.
- Exclude reconstructed legacy records from trusted evaluation unless separately labeled and approved.

**Gate 5:** future facts, current-state joins, target-derived inputs, overlapping splits, and post-`as_of` information are rejected by dedicated leakage tests; no model-quality claim is made without real validation.

## Phase 6 — P2 expansion and production-grade provider boundaries

After P0/P1 architecture and invariants are stable, implement the backlog's P2 scope: command palette; report scheduling; mileage; configurable notifications; document preview/tags/retention; safe undo; feature flags; multicurrency and tax-profile validation; bank/payment import; accounting export adapters; selected integration API/webhooks; strictly isolated client portal and customer sign-off; email send history; operational KPIs; industrial attachments/photo evidence/knowledge base; and the CPU inference adapter boundary.

Live third-party calls may remain disabled only when credentials/contracts are genuinely unavailable. Provider contracts, configuration validation, authorization, idempotency, observable error/retry UX, and contract tests must still be production-quality. P3 model training/research remains experimental, but its enabling data contracts and feature flags are mandatory and may not imply validated model quality.

**Gate 6:** every P2 backlog ID has item-level evidence or a narrowly documented external prerequisite; no disabled integration presents a fake success state; P3 enabling infrastructure passes security and leakage review.

## Phase 7 — Full-spec hardening and 42-step acceptance

Execute WP-A7 for the public Next.js site, locale parity, assets, base-path behavior, and accessibility; WP-B10 for public-form isolation plus invitation-only authentication/MFA/step-up/privacy/PWA; WP-B11 for deployment/Caddy/container/jobs/health/backup/restore; WP-T1 to implement the uninterrupted section 77 test harness; WP-A6 for documentation and exhaustive trace tooling; and read-only WP-C1 only after WP-T1 passes independent review.

**Gate 7:** all eight authoritative responsive sizes, the public/portal/deployment surfaces, every backlog ID in mandatory staged scope, and all 42 Definition-of-Done steps have independent executable evidence.

## Migration and rollback strategy

- Preserve migrations `0001`–`0018`; assign new numbers centrally and sequentially.
- Prefer additive tables/columns, dual-read/backfill where required, and delayed cleanup. Never repurpose historical fields when meaning changes.
- Test every migration on a fresh database, the existing populated pre-V3 fixture, and a scrubbed representative database copy.
- Verify foreign keys, integrity, row counts, financial reconciliation, artifact hashes, authorization defaults, and schema parity.
- Backfill historical artifacts as `ready` only when file/hash evidence is valid; otherwise mark them explicitly unavailable/failed. Mark reconstructed data-readiness history as reconstructed and exclude it from trusted training/evaluation by default.
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

For each packet: narrow tests first, then lint/typecheck/build as relevant, upgrade/fresh migration evidence for data changes, and independent review. Browser packets must verify 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, and 1920×1080, including keyboard/focus and deliberate table behavior.

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

Also run migration-upgrade, backup/restore, artifact openability/failure-injection, performance sanity, finance/integrity, security/RBAC, data-leakage, responsive, and final integration reviews. The strict UTF-8 traceability audit must parse exactly 207 unique requirement rows—62 core/group rows, 103 backlog rows, and 42 item-level DoD rows—and fail on duplicates, missing authoritative IDs, malformed rows, or any mandatory non-PASS state.

**Release verdict:** `READY` only when every original-spec/core-surface row, every individually indexed P0/P1/P2 backlog item, and all 42 Definition-of-Done steps are `PASS`; all required tests run without skips; documentation matches behavior; and independent Sol/high integration review has no blocker. `PARTIAL`, `FAIL`, `OPEN`, an unmapped authoritative requirement, or unresolved Gate R0 means `NOT READY`.
