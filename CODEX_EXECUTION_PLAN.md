# J&A V3 Production Completion — Execution Plan

## Operating principle

Fix correctness and architecture foundations before layering major new domains on top. Use parallelism only across truly independent ownership boundaries. Every phase has a gate; later phases may begin in parallel only when their prerequisites are stable.

## Phase 0 — Baseline, inventory, safety

1. Record branch, commit, dirty state, Node/pnpm versions and configured test environment.
2. Read authoritative spec and this pack.
3. Run baseline format/lint/typecheck/unit/integration/invariant/security/reporting/offline/build tests; record failures without “fixing the test” first.
4. Run targeted E2E to reproduce known bugs.
5. Populate the traceability matrix with exact current evidence.
6. Identify current migration/data compatibility constraints.
7. Create worktrees/branches per write stream if multiple agents will write concurrently.

**Gate 0:** baseline and known failures are recorded; no unrelated user changes lost.

## Phase 1 — Architecture decomposition prerequisites

Goal: make parallel work safe without a rewrite.

### 1A Frontend decomposition

- Split `PortalShell.svelte` into domain sections/components.
- Extract shared design-system primitives.
- Consolidate responsive breakpoints and remove contradictory mobile rules.
- Split monolithic CSS into tokens/shared primitives/domain styles or scoped component styles.

### 1B Database/repository decomposition

- Incrementally extract cohesive domain repositories/services from `repository.ts` / `v3-repository.ts`.
- Keep external interfaces compatible during migration.
- Preserve transactions, RBAC, audit and exact-money behavior.

**Gate 1:** typecheck/tests green for mechanical extraction; no behavior regression; ownership boundaries are clear enough for parallel Phase 2.

## Phase 2 — P0 correctness: current known defects

Parallelize where ownership is disjoint.

### 2A Accounting/report artifact pipeline

- truthful queued/running/ready/failed state;
- automatic job processing path for normal operation;
- independent per-format generation;
- PDF dependency failures scoped to PDF;
- safe pending/failed HTTP semantics;
- retry/idempotency;
- stale pack refresh/version behavior;
- semantic filenames;
- end-to-end create→generate→download tests including forced PDF failure.

### 2B Responsive/design-system defects

- remove first-letter mobile navigation hack;
- full drawer labels;
- finance config vertical stacking at phone widths;
- consistent card padding/borders;
- clear edit-report sections/labels;
- apply primitives to other affected forms;
- required viewports and accessibility checks.

### 2C Reports and invoice templates

- implement full required report catalog;
- real versioned 5-template invoice registry;
- replace free-text template ID with registry selector;
- export tests/openability/escaping/injection protection.

### 2D CRUD and lifecycle coherence

- client/project edit/archive/restore;
- consistent draft edit/delete eligibility for time/expenses/reports and other operational objects;
- never hard-delete issued/finalized financial history;
- audit state transitions.

**Gate 2:** every confirmed defect has a regression test and independent reviewer verification.

## Phase 3 — V3.2 Industrial Operations

Implement normalized, linked domain capabilities:

1. Client/project richer metadata and closure lifecycle.
2. Plant → Area → Line → Machine/Station hierarchy.
3. PLC/HMI/SCADA/robot/drive/safety asset registry.
4. Versioned backups/artifacts with current-production-version semantics.
5. Technical change management: problem, diagnosis, root cause, before/after evidence/backups, validation, rollback, approvals.
6. FAT/SAT/commissioning checklist templates and executions.
7. Punch list/open issues.
8. Project closeout checklist/package.
9. Report/issue attachments and before/after evidence.
10. Optional QR identifier support at the data/UI level without making it a deployment blocker.

**Gate 3:** industrial records are linked, versioned, permissioned and covered by lifecycle tests.

## Phase 4 — V3.3 Business Operations

1. Reusable project/work/report/expense/schedule presets.
2. Report builder based on bounded versioned blocks/templates, not arbitrary unsafe HTML.
3. Scheduled/recurring report generation through durable jobs.
4. Scope/change-order workflow.
5. Original budget baseline + versioned forecast + actual/committed/EAC views.
6. Project health/forecast dashboards with deterministic calculations first.
7. Travel/assignment management and cost treatment (reimbursable, client-direct, all-in, internal).
8. Mileage and improved expense UX; OCR remains optional/provider-pluggable.
9. Timesheet calendar, copy/repeat templates, missing/overlap detection.
10. Planning conflict detection, skills matrix and certification expiry.
11. Unified approval center, safe bulk operations and notifications.
12. Role-specific dashboards, global search and optional command palette.
13. Integrity/anomaly center based initially on deterministic rules/statistics.
14. Job Center and Artifact Center.
15. Import Center with preview/validate/commit and export/data portability.
16. Document preview/tagging/retention and human-readable audit viewer.
17. Autosave/draft recovery/PWA-offline improvements.
18. Operations health, backups/restore drill visibility, admin business settings and feature flags.

**Gate 4:** business operations are usable without parallel spreadsheets for the implemented workflows and preserve audit/finance invariants.

## Phase 5 — Data Readiness / Project Intelligence foundation

1. Point-in-time `project_state_snapshot` schema and scheduled generation.
2. Immutable business-event history for material actions.
3. Explicit `as_of` semantics and schema versions.
4. Reproducible feature definitions and training exports to Parquet/CSV where appropriate.
5. Dataset/export manifest with source ranges, feature schema and hashes.
6. Model registry: name/version/status/training window/features/metrics/artifact hash.
7. Prediction history: model version, project/entity, prediction time, as-of time, feature snapshot/hash, output.
8. Shadow mode, activation/rollback/disable and “experimental” UI semantics.
9. Rules/statistical baselines for project health and anomaly/integrity center.
10. Adapter boundary for future CatBoost/ONNX inference on CPU.
11. Optional experimental temporal/JEPA adapter behind feature flag only; no production claim.
12. Leakage tests and project/time-safe evaluation scaffolding.

**Gate 5:** a future training run can be reproduced without look-ahead leakage from platform data; no unvalidated model is presented as trusted.

## Phase 6 — Optional expansion / integrations

Implement only with valid external prerequisites or as clean provider interfaces when credentials/contracts are absent:

- client portal and customer sign-off;
- email delivery/history/templates;
- accounting-system adapters;
- bank statement/payment import/reconciliation;
- API/webhooks;
- enhanced multicurrency/tax profiles;
- local OCR provider.

External credentials are a blocker only for live third-party calls, not for provider interfaces, validation, configuration, mocks/contract tests or graceful disabled states.

## Phase 7 — Hardening and release

1. Full test suite and E2E viewports.
2. Security/RBAC audit.
3. Finance/integrity audit.
4. Spec audit.
5. Data-leakage audit for data-readiness components.
6. Upgrade migration + fresh migration tests.
7. Backup/restore operational test.
8. Performance sanity for large lists/reports/artifacts.
9. Documentation/runbook/env/config reconciliation.
10. Remove dead routes/styles/components created by refactor.
11. Final Sol/high integration review.
12. Generate completion report.

**Gate 7:** release verdict `READY`; mandatory traceability has no FAIL/PARTIAL/OPEN.

## Do not do

- Do not rewrite from scratch.
- Do not switch DB/architecture without requirement evidence.
- Do not ship placeholders as completed features.
- Do not fake AI/ML predictions.
- Do not convert safe lifecycle requirements into hard delete.
- Do not make a single giant PR impossible to review if incremental integration is possible.
- Do not leave docs behind.
