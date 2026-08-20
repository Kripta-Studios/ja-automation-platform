# Initial Multi-Agent Work Packets — Verified 2026-08-20

These are orchestration contracts, not implementation authorization. The parent must copy each selected packet into a concrete assignment with exact owned/forbidden paths, branch/worktree, dependencies, acceptance checks, and handoff evidence.

## Global controls

- **R0 is blocking:** attest the parent model/effort and child runtime routing, enforce reviewer read-only permissions or obtain explicit user acceptance of procedural read-only behavior, snapshot the dirty worktree, and open the ownership ledger.
- Classify every packet: **A → Luna Max**, **B → Sol Medium**, **C → Sol High**. B leads must delegate stable non-overlapping A leaves back to Luna Max.
- No two write agents may own the same hot file. Reviewers never write and never review their own implementation.
- One parent-assigned migration writer controls migration numbering at a time.
- All handoffs include: changed paths, preserved public contracts, migrations/backfill/rollback, commands and exact results, unresolved risks, and reviewer-ready evidence.

## Instantiated first wave (created only after WP-R0 passes)

All three worktrees start from `ecd4f97a84190a36c63473126f55a79a3710d3c9`. Do not copy unrelated dirty-worktree changes into them. The parent creates these branches/worktrees only in a later implementation-authorized turn.

| Packet | Branch                                        | Exact worktree directory                                                    | Exclusive ownership                                                                                                     |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| WP-A1  | `codex/wp-a1-frontend-decomposition-20260820` | `C:\Users\Álvaro Schwiedop\Desktop\KriptaStudios\NexIA\J-Aautomation-wp-a1` | `PortalShell.svelte`, `PortalChrome.svelte`, `portal.css`, and the exact new helper/section/style files listed in WP-A1 |
| WP-B1  | `codex/wp-b1-database-boundaries-20260820`    | `C:\Users\Álvaro Schwiedop\Desktop\KriptaStudios\NexIA\J-Aautomation-wp-b1` | both repository façades and the six exact new core modules listed in WP-B1                                              |
| WP-T0  | `codex/wp-t0-p0-regression-tests-20260820`    | `C:\Users\Álvaro Schwiedop\Desktop\KriptaStudios\NexIA\J-Aautomation-wp-t0` | Playwright/test infrastructure and the three exact new regression specs listed in WP-T0                                 |

The path sets are disjoint. WP-A2/A3/A4 and all functional packets remain unopened until their prerequisite owner releases the relevant hot files.

## WP-R0 — Runtime, permission, and baseline attestation

**Complexity:** C
**Owner:** parent orchestrator; read-only confirmation by `architect`
**Owned paths:** planning/traceability documents only if an update is needed
**Forbidden:** application code, migrations, external writes
**Dependencies:** none

**Objective:** record branch/commit/dirty state/toolchain, parent and child model/effort evidence, reviewer filesystem enforcement, baseline diagnostics, and the exact ownership ledger.

**Acceptance:** actual branch `codex/v3-production-completion-orchestrated-20260819` and baseline commit are reconciled; Node `24.19.0` is available for release evidence; existing dirty paths are preserved; runtime/sandbox control is explicit.

**Handoff:** `PROCEED` or `BLOCKED`, with exact evidence. No implementation packet starts on `BLOCKED`.

## WP-A1 — Frontend mechanical decomposition

**Complexity:** B contract by `frontend_lead`; A extraction leaves by `frontend_leaf`
**Branch/worktree:** exactly as instantiated above
**Exclusive owned paths:** `apps/portal/src/lib/PortalShell.svelte`; `apps/portal/src/lib/PortalChrome.svelte`; `apps/portal/src/portal.css`; new `apps/portal/src/lib/portal/portal-data.ts`, `portal-format.ts`, `offline-controller.ts`, `sections/TodaySection.svelte`; new `apps/portal/src/styles/portal/legacy.css`, `foundation.css`, `login.css`, `shell.css`, `surfaces.css`, `dashboards.css`, `forms-management.css`, `details-invoices.css`, `responsive.css`, `polish.css`
**Forbidden:** database, reporting, migrations, `[section]/+page.server.ts`, behavioral redesign beyond parity fixes
**Dependencies:** WP-R0
**Reviewer:** `desktop_qa` plus `mobile_qa`

**Objective:** preserve the current façade, extract portal data/format helpers and offline controller, then section components; split CSS in current source order before consolidating behavior. Continue from existing `PortalChrome` and action extractions.

**Acceptance:** no public route/action behavior change; render/source-order parity; no new monolith; typecheck/build/unit/E2E smoke pass; authenticated screenshots at 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, and 1920×1080 show no extraction regression.

## WP-A2 — Portal server action/loader decomposition

**Complexity:** A after contract freeze
**Owner:** `backend_leaf` or `frontend_leaf`, one writer
**Exclusive owned paths:** `apps/portal/src/routes/app/[section]/+page.server.ts` and new loader/action registries
**Forbidden:** PortalShell/CSS, repository megafiles, action-name or response-shape changes
**Dependencies:** WP-R0; public action inventory frozen; may run beside WP-A1 with disjoint files
**Reviewer:** `security_reviewer`

**Acceptance:** every existing action name, role check, redirect, failure status, and response shape has parity coverage; typecheck, integration, security, and route tests pass.

## WP-B1 — Database façade and domain-boundary contract

**Complexity:** B
**Owner:** `backend_domain`
**Branch/worktree:** exactly as instantiated above
**Exclusive owned paths:** `packages/database/src/repository.ts`; `packages/database/src/v3-repository.ts`; new `packages/database/src/core/transaction.ts`, `busy-retry.ts`, `audit.ts`, `authorization.ts`, `storage-key.ts`, `sequence.ts`
**Forbidden:** finance semantic changes, schema/migration changes until separately assigned, reporting/template files
**Dependencies:** WP-R0
**Reviewer:** `architect` and `security_reviewer`

**Objective:** keep `PortalRepository` and `V3Repository` as compatible façades; define dependency direction and extract transaction/retry, audit, authorization/step-up, storage-key, and sequence utilities, followed by stable domain seams. Preserve duplicate behavior until a semantic packet owns convergence.

**Acceptance:** public export/API inventory unchanged; transaction, authorization, audit, storage, and exact-money invariants remain green; integration/schema-parity/build gates pass.

## WP-A3 — Database extraction leaves

**Complexity:** A
**Owners:** separate `backend_leaf` workers only after WP-B1 assigns non-overlapping module paths
**Owned paths:** one bounded domain module per leaf
**Forbidden:** repository façade hot files unless explicitly released; finance semantics; shared schema/migrations
**Dependencies:** stable WP-B1 contract
**Reviewer:** independent `backend_domain` plus appropriate integrity reviewer

**Candidate leaves:** identity/access; clients/projects/workforce/planning; time/expenses/reports/documents; offline/jobs/outbox. Billing/finance remains under WP-B2.

## WP-A4 — Schema module extraction

**Complexity:** A after schema contract
**Owner:** `migration_worker`
**Exclusive owned paths:** `packages/database/src/schema.ts` and new schema re-export/domain files
**Forbidden:** new product semantics or migration-number changes
**Dependencies:** WP-B1 dependency direction stable
**Reviewer:** `backend_domain`

**Acceptance:** generated/effective schema parity, fresh migration, populated upgrade, foreign keys, integrity, integration, and typecheck all pass.

## WP-T0 — P0 regression-test expansion

**Complexity:** A
**Owner:** `test_worker`
**Branch/worktree:** exactly as instantiated above
**Exclusive owned paths:** `playwright.config.ts`; `tests/e2e/auth.ts`; `tests/e2e/environment.ts`; `tests/e2e/global-setup.ts`; new `tests/e2e/portal-responsive.spec.ts`, `tests/e2e/artifact-lifecycle.spec.ts`, `tests/integration/accounting-pack-artifacts.test.ts`, `tests/offline/cross-user-isolation.test.ts`
**Forbidden:** application behavior changes
**Dependencies:** WP-R0; may start concurrently with WP-A1/WP-B1
**Reviewer:** `desktop_qa`

**Objective:** add failing coverage for per-format artifact failure, queued/running/ready/failed downloads, all required viewports, owner/finance mobile roles, full-label navigation, table/previews, archive/restore, and offline cross-user isolation.

**Acceptance:** tests fail for verified reasons before fixes; no weakened assertions or skipped mandatory flows; the E2E matrix includes 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, and 1920×1080.

## WP-B2 — Finance, billing, and Accounting Pack contract

**Complexity:** B
**Owner:** `finance_reporting` with `backend_domain` consultation
**Owned paths:** contract/design first; implementation paths assigned only after WP-B1 releases them
**Forbidden:** unapproved reinterpretation of historical money; concurrent repository-hot-file edits
**Dependencies:** WP-B1 boundary stable; accountant-approved examples available
**Reviewer:** `finance_integrity_reviewer`

**Objective:** decide exact rounding allocation, daily-minimum rates, net/gross reimbursable cost, timezone, legal entity/currency, credits, partial reimbursement, configuration invalidation, reconciliation source cut, and immutable supersession/version rules.

**Acceptance:** executable examples cover split lines, credits, taxes, stale configuration, mixed currencies, partial reimbursement, and historical ledger reconstruction. Any ambiguity that could alter financial history is escalated.

## WP-B3 — Independent Accounting Pack artifacts

**Complexity:** B core; A endpoints/UI/tests after contract
**Owner:** `finance_reporting`; A leaves to `backend_leaf`, `report_ui_worker`, `test_worker`
**Exclusive owned paths:** Accounting Pack repository/job/reporting modules, API endpoint, and assigned UI/tests; migration file assigned centrally
**Forbidden:** template registry files owned by WP-B4; unrelated repository façade edits
**Dependencies:** WP-B1, WP-B2, WP-T0 failing coverage
**Reviewers:** `finance_integrity_reviewer`, `security_reviewer`, `desktop_qa`

**Objective:** immutable pack revisions and independent per-format rows/jobs with status/error/attempts/hash/size; consistent source cut; safe temp/fsync/atomic writes; semantic filenames; idempotent retry; explicit non-500 pending/failed responses; step-up authorization.

**Acceptance:** forced PDF failure still yields valid XLSX/CSV/JSON; retries cannot duplicate/silently overwrite; old revisions remain retrievable; pack totals reconcile; create→queue→run→download works without ordinary users manually processing jobs.

## WP-B4 — Report catalog and versioned invoice-template registry

**Complexity:** B semantics; A renderers/UI/tests
**Owner:** `finance_reporting`; A leaves to `report_ui_worker`, `frontend_leaf`, `test_worker`
**Exclusive owned paths:** `packages/reporting/**` and `packages/invoice-templates/**` paths named in assignment; registry selector UI after WP-A1 release
**Forbidden:** Accounting Pack job paths owned by WP-B3
**Dependencies:** WP-B2; frontend boundaries stable
**Reviewers:** `spec_auditor`, `finance_integrity_reviewer`

**Acceptance:** required catalog and five genuine versioned templates; no free-text template ID; safe HTML/XML/CSV/XLSX escaping; XLSX columns beyond Z; openability, snapshots, RBAC, and historical-template retention pass.

## WP-A5 — Responsive/design-system remediation

**Complexity:** A
**Owners:** `responsive_worker` and bounded `crud_ui_worker` leaves, never overlapping
**Owned paths:** assigned components/styles only after WP-A1 releases them
**Forbidden:** repository/report semantics
**Dependencies:** WP-A1, WP-T0
**Reviewer:** independent `mobile_qa`

**Objective:** full navigation labels/items, 44px targets, stacked finance/Modify Report/forms, visible field errors/focus, deliberate table/card/scroll behavior, readable invoice preview, and reusable card/form primitives.

**Acceptance:** real authenticated flows pass at every required viewport with keyboard/focus evidence and no clipped, first-letter-only, or accidentally compressed UI.

## WP-B5 — Lifecycle and security hardening

**Complexity:** B policy; A bounded implementation leaves
**Owners:** `backend_domain` defines lifecycle/RBAC contracts; stable leaves to `backend_leaf`, `crud_ui_worker`, `test_worker`
**Owned paths:** exact domain/service/API/UI paths assigned after decomposition
**Forbidden:** finance history reinterpretation, concurrent hot-file ownership
**Dependencies:** WP-B1, WP-T0
**Reviewers:** `security_reviewer`, `spec_auditor`

**Objective:** client/project edit/archive/restore, coherent draft edit/delete, unsaved-change warnings, long-report autosave/draft recovery, assignment-date enforcement, least-privilege PM payloads, user-partitioned offline data, step-up, fail-closed scanning, authorize-before-write/quota, audit redaction, CSRF/rate-limit/cookie/health/service-actor hardening.

**Acceptance:** security/invariant/integration/offline/browser tests cover IDOR, cross-user cache reuse, expired/future assignments, sensitive payload absence, storage failure, scanner outage, immutable finalized history, unsaved-change interception, crash/navigation draft recovery, and user-partitioned recovery after account switching.

## WP-B6 — Industrial operations

**Complexity:** B contracts; A CRUD/UI/migration/test leaves
**Owner:** `industrial_operations`; leaves to `industrial_ui_worker`, `backend_leaf`, `migration_worker`, `fixture_data_worker`, `test_worker`
**Dependencies:** WP-B1, WP-B5, schema/migration lane available
**Reviewers:** `security_reviewer`, `spec_auditor`, `mobile_qa`

**Objective:** rich client metadata; the Draft/Planned/Active/On Hold/Completed/Closed/Archived project state machine; hierarchy; assets; immutable backup versions; technical changes; FAT/SAT/commissioning; punch lists; closeout packages; customer-facing versus internal visibility; Lessons Learned; and evidence. Reuse existing technical-change/closeout/job foundations.

**Acceptance:** normalized links, rich metadata validation, every project transition/guard, customer/internal visibility isolation, Lessons Learned retention, current-production-version rules, safe private artifacts, audit, representative upgrade data, and responsive field flows pass.

## WP-B7 — Business operations

**Complexity:** B for budget/change-order/approval semantics; A for stable CRUD/UI/import/admin leaves
**Owner:** `business_operations`; leaves to `business_ui_worker`, `backend_leaf`, `crud_ui_worker`, `migration_worker`, `fixture_data_worker`, `test_worker`
**Dependencies:** WP-B1, WP-B2, WP-B5; industrial event vocabulary stable where shared
**Reviewers:** `finance_integrity_reviewer`, `spec_auditor`, `mobile_qa`

**Objective:** presets/report blocks, scheduled reports, change orders, budget baseline/forecast, travel, planning, skills/certifications, unified approvals, dashboards/search, integrity/job/artifact/import centers, documents, offline recovery, health/settings.

**Acceptance:** role-based end-to-end scenarios preserve finance/audit/RBAC invariants, imports use preview/validate/commit, and ordinary users do not depend on admin job processing.

## WP-B8 — Point-in-time data readiness

**Complexity:** B temporal/provenance contracts; A exporters/admin UI/fixtures/tests
**Owner:** `data_readiness`; leaves to `data_tooling_worker`, `backend_leaf`, `migration_worker`, `fixture_data_worker`, `test_worker`
**Dependencies:** stable industrial/business event vocabulary and migration lane
**Reviewer:** `data_leakage_reviewer`

**Objective:** immutable business events and snapshots, source cuts, feature availability/versioning, separate targets, dataset manifests, model registry, prediction history, shadow lifecycle, experimental labeling, reproducible safe splits, and a deterministic rules/statistical project-health baseline that precedes any learned model.

**Acceptance:** tests reject future facts, current-state joins, target-derived inputs, overlapping splits, mutable definitions/predictions, and `as_of` violations. Reconstructed history is flagged and excluded by default. The deterministic baseline is versioned, reproducible, explainable, and benchmarked without a model-quality claim.

## WP-B9 — P2 expansion and provider boundaries

**Complexity:** B for multicurrency/tax/payment/API/client-isolation contracts; A for stable UI, adapters, documents, notifications, schedulers, and tests
**Owner:** the relevant Sol-medium domain lead; bounded leaves to `business_ui_worker`, `backend_leaf`, `report_ui_worker`, `data_tooling_worker`, and `test_worker`
**Owned paths:** split into non-overlapping concrete child packets after WP-B6/B7/B8 contracts stabilize; no catch-all assignment is permitted
**Forbidden:** live third-party writes without credentials/contracts; P3 model-quality claims; any hot path still owned by decomposition packets
**Dependencies:** all P0/P1 architecture and domain gates; security/finance/data contracts for the selected item
**Reviewers:** `security_reviewer`, `finance_integrity_reviewer`, `data_leakage_reviewer`, or `spec_auditor` as applicable

**Objective:** complete every P2 backlog item: command palette; industrial attachments/photo evidence/knowledge base; recurring reports; mileage; configurable notifications; document preview/retention; safe undo; feature flags; multicurrency/tax/payment/accounting adapters/API/webhooks/client portal/sign-off/email/KPIs; CPU inference boundary.

**Acceptance:** every P2 ID has its own concrete child packet and evidence; unavailable live providers expose honest disabled/error states while provider contracts, validation, authorization, idempotency, observability, and contract tests remain production-quality.

## WP-A6 — Documentation and traceability reconciliation

**Complexity:** A
**Owner:** `docs_worker`
**Owned paths:** `scripts/audit-spec-coverage.py`, `REQUIREMENTS_TRACEABILITY_MATRIX.md`, and exact docs/runbooks/env examples assigned after behavior is integrated
**Dependencies:** corresponding implementation and reviewer evidence
**Reviewer:** `spec_auditor`

**Acceptance:** no stale “complete” claims; each PASS row links concrete code/tests/browser evidence; the strict audit is Windows UTF-8 safe and parses exactly 207 unique requirement rows (62 core/group rows, 103 backlog rows, and 42 item-level DoD rows), rejecting duplicates, malformed tables, missing authoritative IDs, and every mandatory non-PASS status; operational job, backup/restore, artifact, security, and migration runbooks match reality.

## WP-A7 — Public website, localization, and accessibility completion

**Complexity:** B for public/private boundary, content/locale contract, and base-path routing; A for bounded page/component/content/test leaves
**Owner:** `frontend_lead`; stable leaves to `frontend_leaf`, `responsive_worker`, and `test_worker`
**Owned paths:** `website/app/**`, `website/components/**`, `website/content/**`, `website/lib/**`, `website/public/**`, `website/proxy.ts`, `website/next.config.ts`, `website/package.json`, public-site E2E specs, and portal localization files explicitly released by WP-A1
**Forbidden:** private database/repository access from public browser code; overwriting the pre-existing dirty `website/app/[locale]/solutions/aquarex/page.tsx` change until the parent records its provenance and ownership; portal hot files before WP-A1 release
**Dependencies:** WP-A1, WP-B10 public-form/auth boundary, dirty-file reconciliation
**Reviewers:** `desktop_qa`, `mobile_qa`, `security_reviewer`, `spec_auditor`

**Objective:** complete factual public content/assets, isolated public inquiry/contact/career flows, `/j-aautomation` routing, en/es/pt website and portal locale parity, localized errors/exports where required, keyboard/focus/semantic/contrast compliance, and every authoritative viewport.

**Acceptance:** public forms cannot access private repositories/secrets; locale route/content/error parity passes; Caddy-equivalent base-path browser tests pass; accessibility scan plus keyboard/manual evidence passes at all eight viewports; the dirty Aquarex file is preserved or explicitly integrated by its owner.

## WP-B10 — Identity, authentication, privacy, and PWA completion

**Complexity:** B
**Owner:** `backend_domain`; bounded UI/test leaves to `backend_leaf`, `frontend_leaf`, and `test_worker`
**Owned paths:** `apps/portal/src/lib/server/auth.ts`, `apps/portal/src/lib/server/public-form.ts`, `apps/portal/src/routes/api/public/**`, auth/login/invitation/MFA/recovery routes and components, session/security repository modules after WP-B1 release, service worker/offline storage modules after WP-A1/WP-B5 release, and assigned auth/offline tests
**Forbidden:** concurrent repository or PortalShell/CSS ownership; custom authentication cryptography; public website content owned by WP-A7
**Dependencies:** WP-B1, WP-B5, WP-A1
**Reviewers:** `security_reviewer`, `mobile_qa`, `spec_auditor`

**Objective:** invitation-only identity lifecycle, MFA enrollment/recovery, secure sessions/cookies/step-up, throttling and CSRF, role/offboarding behavior, privacy-safe payloads, installable PWA behavior, user/tenant-partitioned offline cache/queue, conflict/retry state, and truthful synchronization UX.

**Acceptance:** end-to-end invitation→MFA→session→step-up→recovery/offboarding flows; fixation/replay/rate-limit/CSRF/cookie tests; no worker/PM finance leakage; account-switch offline isolation; install/update/offline/reconnect/conflict browser evidence at field viewports.

## WP-B11 — Deployment and operations acceptance

**Complexity:** B
**Owner:** `backend_domain` with `business_operations` for operations-health UI; A test/runbook leaves to `test_worker` and `docs_worker`
**Owned paths:** `deployment/**`, `apps/portal/src/routes/health/**`, `apps/portal/src/routes/app/api/health/+server.ts`, operational test files, and exact release/health configuration files assigned by the parent
**Forbidden:** production deployment or external writes without a separately authorized release turn; destructive migration/down scripts; application-domain hot files
**Dependencies:** WP-B3 durable artifacts, WP-B10 auth/privacy, WP-A7 public/base-path completion, all migrations integrated
**Reviewers:** `security_reviewer`, `finance_integrity_reviewer`, `desktop_qa`, final `integration_reviewer`

**Objective:** validate pinned non-root site/portal containers, Caddy/base path, SQLite/private storage permissions, automatic jobs, readiness/liveness, scanner/PDF/email disabled/failure states, backup/restore drills, release archive integrity, additive upgrade, and verified rollback to prior compatible image/backup.

**Acceptance:** compose/config/build health passes on Node 24.19.0; Caddy-equivalent public/portal/public-form smoke tests pass; realistic-data upgrade and restore reproduce issued documents/snapshots/Accounting Pack sources; job/artifact failure injection is observable; rollback is rehearsed; no production system is touched during testing without explicit authorization.

## WP-T1 — Uninterrupted 42-step Definition-of-Done harness

**Complexity:** A test implementation against stabilized contracts; any newly exposed finance/security ambiguity routes back to its B owner
**Owner:** `test_worker`
**Exclusive owned paths:** new `tests/e2e/definition-of-done.spec.ts`, `tests/e2e/dod-fixtures.ts`, `tests/integration/definition-of-done-reconciliation.test.ts`, and `tests/ops/definition-of-done-restore.test.ts`
**Forbidden:** application implementation, migrations, shared Playwright/auth fixtures without a separately assigned non-overlapping packet
**Dependencies:** WP-B2/B3/B4/B5/B6/B7/B8/B9/B10/B11 and WP-A5/A7 complete; deterministic representative fixtures available
**Reviewers:** `finance_integrity_reviewer`, `security_reviewer`, `desktop_qa`, `mobile_qa`, `spec_auditor`

**Objective:** implement one uninterrupted multi-role executable scenario for all 42 steps in spec section 77, plus narrow reconciliation and restore assertions. It must exercise ordinary product flows without spreadsheet intervention or manual admin job processing.

**Acceptance:** steps 1–42 are individually labeled and evidenced in the test; Worker/PM/Finance/Owner privacy and authorization are asserted; hourly/percentage/overtime/all-in/reimbursable/tax/cadence/partial-payment values reconcile exactly; issued artifacts and Accounting Pack sources survive backup/restore; forced duplicate billing is rejected; the scenario passes at required role viewports without skipped steps.

## WP-C1 — Final release integration

**Complexity:** C
**Owner:** parent orchestrator; final read-only `integration_reviewer`
**Writes:** none during final review
**Dependencies:** every mandatory packet, including WP-T1, integrated and independently reviewed; pinned-toolchain gates green

**Acceptance:** full release command set plus migrations, backup/restore, artifact failure/openability, performance, responsive, security, finance, data-leakage, and strict traceability gates pass. Verdict is `READY` only when every mandatory in-scope row is `PASS`; otherwise `NOT READY` with exact blockers.
