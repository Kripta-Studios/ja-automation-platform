# Client Essential Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every repository-owned Client Essential gap, synchronize the checklist and UI plan with reproducible evidence, and leave only explicitly external production/UAT prerequisites open.

**Architecture:** Preserve the modular monolith, SQLite source of truth, private filesystem artifacts, durable SQLite jobs, SvelteKit portal, Next.js site, Caddy and the existing lightweight deployment. Fix acceptance-flow integration at existing domain boundaries; do not weaken fail-closed invoice/accounting readiness or create a second finance authority.

**Tech Stack:** Node 24.19.0, pnpm 11, TypeScript, SvelteKit 2, Next.js, SQLite (`node:sqlite`), Zod, Vitest and Playwright.

**Spec:** `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`; acceptance ledger: `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`; UX authority: `UI_PLAN.md`; contractual acceptance: `J_A_Automation_Contrato_Proyecto_EVOCON_ES.html` ANEXO A/D.

## Global Constraints

- Work in `codex/v3-production-completion-orchestrated-20260819`; preserve the dirty candidate and all unrelated user changes.
- Use the pinned Node `24.19.0` runtime for every release claim.
- Exact money remains integer/BigInt based; no binary floating point for money.
- Issued invoices, finalized packs, audit records and traceable artifacts remain immutable and append-only.
- Authorization precedes validation/step-up where disclosure matters; object authorization is rechecked inside multi-write transactions.
- Offline/PWA is out of the active release scope by the J&A decision of 2026-09-01. Preserve existing code and record the decision; do not expand or remove it.
- Never fabricate VPS, Caddy, remote-backup, DNS/email or signed UAT evidence.
- No implementation packet may edit `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md` or `UI_PLAN.md`; only the final evidence packet updates status documents.
- Migrations `0031`–`0034` are frozen. Add a migration only if a demonstrated persistent-data invariant cannot be fixed compatibly in existing code, and escalate first.

---

## Verified Baseline — 2026-09-01

- Branch/HEAD: `codex/v3-production-completion-orchestrated-20260819` at `4db442e466b294eebc001bfd5deba2700f6d4cb1`.
- Dirty candidate: 335 status entries; 246 tracked files differ (`24,741` insertions, `5,906` deletions), 89 untracked paths and one tracked deletion. Preserve them.
- Last full local evidence before the final UI/E2E edits: unit/regression `113 files / 658 tests PASS`; integration `45 / 318 PASS`; security `25 / 150 PASS`; migrations `11 / 84 PASS`; finance/reporting focus `14 / 111 PASS`; format, lint, typecheck and site/portal/jobs builds PASS.
- Responsive evidence is combined rather than frozen: all 20 role/width combinations eventually passed, but there is no single post-fix 20/20 run.
- Current UI focus is not fully green: seven focal suites / 35 tests pass, while `tests/unit/responsive-accessibility.test.ts` has one stale breakpoint failure (26 pass / 1 fail). CSS intentionally keeps cards through 768px and reveals dense tables at `64rem`; older tests/UI_PLAN text still demand tables from `48rem`/above 640px.
- `TableRegion.svelte` still owns English-only scroll/detail helper copy, and timesheet categories are humanized but not localized at runtime. These are real remaining EN→ES gaps.
- Latest 32-step run proves steps 1–22, 25 and 27–29 locally. Primary local failures are step 23 and step 26; step 24 is downstream of step 23. Steps 30–32 are external blockers.
- Step 23 evidence: `POST /app/billing?/issueInvoice` returns `409` with `canonical_legal_entity_revision_required` for the newly created UAT project. The fail-closed production guard is correct; the visible setup journey lacks/does not consume canonical project legal-entity authority.
- Step 26 evidence: a valid-looking `periodStart=2026-08-01`, `periodEnd=2026-08-24`, `reportLocale=en` payload returns `400 action.error.invalid`; the same object parses successfully against `accountingPackPeriodSchema` in a direct Node 24 check. Diagnose the built HTTP/action boundary rather than weakening the schema.
- Current status documents overclaim the candidate: checklist DoD marks invoice issue, payments and monthly export checked although the current integrated journey fails them; UI_PLAN simultaneously contains old failed-matrix counts and later completion claims.

## Dependency DAG

```text
WP-01 reproduce/capture HTTP failures
  ├── WP-02 canonical legal-entity setup and invoice issue (CORE-02/03/10/11/15)
  └── WP-03 Accounting Pack HTTP creation boundary (CORE-13/15)

WP-02 ─► WP-04 payment/ledger continuation (CORE-12)
WP-02 + WP-03 + WP-04 ─► WP-05 local 1–29 acceptance rerun

WP-06 single-run UI/a11y matrix (CORE-14) ──────────────┐
WP-07 focused finance/security/artifact reviews ────────┼─► WP-08 frozen local release gate
WP-05 ──────────────────────────────────────────────────┘

WP-08 ─► WP-09 checklist/UI_PLAN evidence reconciliation
WP-09 ─► WP-10 VPS/backup/Caddy/UAT external acceptance
```

## Work Packets

### WP-01 — Make the remaining acceptance failures diagnostic

**Class/owner:** A → Luna Max test worker. Read-only production behavior.

**Requirements:** SPEC §8 steps 23, 24 and 26; §9.3.

**Files:**

- Modify: `tests/e2e/client-essential-32-step.spec.ts`
- Read only: `apps/portal/src/lib/server/actions/billing-actions.ts`
- Read only: `apps/portal/src/lib/server/actions/action-message.ts`
- Test evidence: `test-results/**/trace.zip`

**Interfaces:**

- Consumes: SvelteKit enhanced/native form response and existing `runStep` failure collection.
- Produces: helper that records HTTP status plus visible action error/reasons without treating an error toast as success.

- [ ] Add a helper around the issue-invoice and Accounting Pack submits that waits for their specific `POST` response and returns `{ status, url }`.
- [ ] On non-2xx, attach the visible `[role="alert"]`, assertive toast text and readiness reason codes to the step failure message.
- [ ] Run the journey on Node 24 and confirm the red evidence still reports invoice `409 canonical_legal_entity_revision_required` and Accounting Pack `400`, without changing product assertions.

Run:

```powershell
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop --reporter=line
```

**Acceptance:** The failure explains the server contract and source reason; no timeout-only failure remains.

**Forbidden writes:** all production code, fixtures, authority documents and deployment files.

### WP-02 — Expose and consume canonical project legal-entity authority

**Class/owner:** B → Sol Medium finance/domain lead; delegate bounded UI/test leaves to Luna Max after fixing the contract.

**Requirements:** CORE-02 project configuration, CORE-03 currency/tax authority, CORE-10 explicit Finance issue, CORE-11 issuing entity/snapshot, CORE-15 step-up/audit; acceptance steps 3, 7, 10 and 23.

**Files:**

- Modify as required: `packages/schemas/src/index.ts`
- Modify as required: `packages/database/src/domains/finance/canonical-project-legal-entity-repository.ts`
- Modify as required: `packages/database/src/v3-repository.ts`
- Modify as required: `apps/portal/src/lib/server/actions/finance-actions.ts`
- Modify as required: `apps/portal/src/routes/app/[section]/section-actions.ts`
- Modify as required: `apps/portal/src/routes/app/[section]/section-load.ts`
- Modify as required: `apps/portal/src/lib/portal/portal-data.ts`
- Modify as required: `apps/portal/src/lib/portal/sections/FinanceConfigurationSection.svelte`
- Test: `tests/integration/canonical-project-legal-entity.test.ts`
- Test: `tests/integration/client-essential-legal-entity-bridge.test.ts`
- Test: `tests/security/wp-security-remediation.test.ts` or a new narrowly named security test
- Test: `tests/e2e/client-essential-32-step.spec.ts`

**Interfaces:**

- Consumes: existing canonical revision and `project_legal_entity_assignment` transaction/audit contract.
- Produces: one visible Finance/Owner action that binds a project to a canonical legal-entity revision over explicit effective dates with reason, idempotency and step-up.
- The legacy `billing_rule.legal_entity_id` remains a compatibility reference; it must not become a second authority.

- [ ] Write an integration test proving a newly created project without an assignment remains fail-closed at invoice issue.
- [ ] Write action/security tests proving Worker/PM/Auditor cannot enumerate sensitive revision data or create the assignment; Finance/Owner require fresh step-up and a reason.
- [ ] Implement the smallest schema/action projection over the existing canonical repository command. Revalidate project, revision, tenant/deployment and interval inside the transaction.
- [ ] Add a Finance configuration control with visible labels, current/historical assignment state and no raw canonical IDs in user-facing copy.
- [ ] Extend acceptance step 7 or 10 to configure the authority through the visible UI before creating/issuing the billing stream.
- [ ] Run focused canonical, billing readiness, invoice lifecycle and security suites; then rerun steps 1–24.

Run:

```powershell
pnpm exec vitest run tests/integration/canonical-project-legal-entity.test.ts tests/integration/client-essential-legal-entity-bridge.test.ts tests/integration/customer-conformity-billing-gate.test.ts tests/integration/invoice-lifecycle.test.ts tests/security/wp-security-remediation.test.ts
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop --reporter=line
```

**Acceptance:** The visible normal flow configures canonical authority, issue succeeds, the invoice stores the canonical revision, and the missing/ambiguous/wrong-scope cases still fail with zero partial writes.

**Forbidden writes:** migrations `0031`–`0034`, Accounting Pack calculations, UI_PLAN/checklist and deployment.

### WP-03 — Repair the Accounting Pack form/action runtime boundary

**Class/owner:** B → Sol Medium because step-up ordering and finance snapshot side effects are security/finance invariants; the likely parser/UI fix can be delegated after diagnosis.

**Requirements:** CORE-13 monthly export; CORE-15 step-up/audit; acceptance steps 26–27.

**Files:**

- Modify as required: `apps/portal/src/lib/server/actions/billing-actions.ts`
- Modify as required: `apps/portal/src/lib/portal/sections/AccountingSection.svelte`
- Modify only if evidence proves a schema defect: `packages/schemas/src/index.ts`
- Test: `tests/integration/accounting-pack-artifacts.test.ts`
- Test: `tests/integration/accounting-pack-revision-service.test.ts`
- Test: `tests/security/session-step-up.test.ts`
- Test: add `tests/integration/accounting-pack-action.test.ts` if no real action-boundary test exists
- Test: `tests/e2e/client-essential-32-step.spec.ts`

**Interfaces:**

- Consumes: `accountingPackPeriodSchema`, `createAccountingPack`, centralized step-up and per-format durable artifact states.
- Produces: a tested HTTP form contract accepting ISO dates and locale exactly once, authorizing before step-up and creating no snapshot/job/audit on any failure.

- [ ] Add a server-action test using real `FormData` with the exact trace payload and prove it currently returns 400.
- [ ] Compare the runtime schema instance/build input with the direct Node parse; inspect duplicated fields, action routing and step-up navigation state.
- [ ] Apply the minimal correction at the actual boundary. Preserve arbitrary valid periods unless the SPEC explicitly requires calendar-month-only input.
- [ ] Add negative tests for invalid dates, reversed period, stale/absent step-up and unauthorized role; assert zero pack/job/success audit.
- [ ] Rerun Accounting Pack revision/artifact, localized artifact and security tests, then the browser step.

Run:

```powershell
pnpm exec vitest run tests/integration/accounting-pack-action.test.ts tests/integration/accounting-pack-artifacts.test.ts tests/integration/accounting-pack-revision-service.test.ts tests/integration/localized-pdf-variants.test.ts tests/security/session-step-up.test.ts
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop --reporter=line
```

**Acceptance:** The exact browser payload creates/returns the intended pack with truthful per-format state; invalid/unauthorized requests cause no writes.

**Forbidden writes:** invoice issue calculations, canonical entity repository semantics, migrations, deployment and status documents.

### WP-04 — Complete payment and ledger continuation after real issue

**Class/owner:** A → Luna Max test/UI worker against stable payment contracts; Finance reviewer remains independent.

**Requirements:** CORE-12; acceptance steps 24–25.

**Files:**

- Modify only if a current defect is reproduced: `apps/portal/src/lib/server/actions/billing-actions.ts`
- Modify only if a current defect is reproduced: `apps/portal/src/lib/portal/sections/BillingSection.svelte`
- Test: `tests/e2e/client-essential-32-step.spec.ts`
- Test: `tests/integration/payment-ui-actions.test.ts`
- Test: `tests/integration/finance-truth-reversal.test.ts`

**Interfaces:**

- Consumes: the issued invoice identity from WP-02 and exact append-only payment/reversal services.
- Produces: browser evidence for partial payment, outstanding balance and ledger reconciliation on the same invoice.

- [ ] Rerun the journey after WP-02 without changing step 24; confirm whether it passes naturally.
- [ ] If red, write the narrow failing payment/action test before changing production code.
- [ ] Assert exact `collected + outstanding = issued total`, causal received date/reference and visible payment state.
- [ ] Keep full payment and reversal coverage in focused integration tests even if the 32-step journey uses a partial payment.

**Acceptance:** Steps 23–25 pass in sequence and reconcile exact minor units; no change is made if the former failure was only cascading.

**Forbidden writes:** invoice snapshot rules, Accounting Pack, authorization policy, migrations and docs.

### WP-05 — Freeze local acceptance steps 1–29

**Class/owner:** A → Luna Max E2E worker.

**Requirements:** SPEC §8 steps 1–29 and §9.2.

**Files:**

- Modify only for demonstrated stale selectors/diagnostics: `tests/e2e/client-essential-32-step.spec.ts`
- Preserve: `tests/fixtures/client-essential-32-step-fixture.ts`
- Evidence: `artifacts/quality-gates/<timestamp>/client-essential-32-step/**`

- [ ] Run the journey against a new disposable database and document every step result.
- [ ] Require steps 1–29 to pass; retain strict failures for 30–32 when external evidence variables are absent.
- [ ] Copy only report/trace/JSON evidence, never disposable SQLite files, tokens or secrets.
- [ ] Open the generated invoice/report/Worker Statement/Accounting Pack artifacts and validate media type, semantic filename, byte length, SHA-256 and private storage/download authorization.

**Acceptance:** No local product RED remains in steps 1–29. The overall test may remain red solely with explicit external prerequisite codes for steps 30–32.

### WP-06 — Produce one final responsive/accessibility/i18n run

**Class/owner:** A → Luna Max frontend/test worker; independent mobile/desktop QA reviews the output.

**Requirements:** CORE-14 and UI_PLAN phases 1–4.

**Files:**

- Modify only for reproduced defects: `apps/portal/src/lib/portal/**`
- Modify only for reproduced defects: `apps/portal/src/styles/portal/**`
- Modify only for reproduced defects: `apps/portal/src/lib/i18n/**`
- Modify: `apps/portal/src/lib/portal/ui/TableRegion.svelte`
- Modify: `apps/portal/src/lib/portal/portal-format.ts`
- Modify: `apps/portal/src/lib/portal/sections/TimesheetPanel.svelte`
- Modify: `apps/portal/src/styles/portal/primitives.css`
- Test: `tests/e2e/ui-multirole-accessibility-matrix.spec.ts`
- Test: `tests/e2e/ui-plan-client-ready.spec.ts`
- Test: `tests/e2e/report-signoff-navigation.spec.ts`
- Test: `tests/unit/responsive-accessibility.test.ts`
- Test: `tests/regression/ui-plan-*.test.ts`
- Test: `tests/regression/client-team-directory-ui.test.ts`

**Interfaces:** Existing Field/TableRegion/Toast primitives and translated controlled-value catalog.

- [ ] First preserve the deliberate responsive contract in a failing test: card representation at 360/390/768 and semantic table from 1024px (`64rem`). Update the stale `48rem` unit/E2E expectation; do not move the CSS breakpoint back and reintroduce tablet overflow.
- [ ] Route `TableRegion` scroll instructions and `Open details` copy through its translation interface (or translated props supplied by every caller), with an EN→ES runtime assertion.
- [ ] Replace generic `humanizePortalValue` output for timesheet categories with the controlled localized formatter and test `travel_time`, `standby`, regular work and overtime after live locale rerender.
- [ ] Run the complete Worker/PM/Finance/Owner/Auditor matrix at 360, 390, 768 and 1440 in one invocation after all UI changes.
- [ ] Require axe, keyboard/focus, reduced motion, 44px touch targets, deliberate cards/tables, drawer containment and no unintended horizontal overflow.
- [ ] Exercise EN→ES runtime rerender plus Clients/Team search/filter, roles and availability; reject snake_case/mechanical values.
- [ ] Exercise real success/error actions for Toast variant, live region, dismiss, deduplication and inline fallback.
- [ ] Run sign-off card→detail→PDF navigation and Finance configuration/accounting forms.

Run:

```powershell
pnpm exec playwright test tests/e2e/ui-multirole-accessibility-matrix.spec.ts --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop --reporter=line
pnpm exec playwright test tests/e2e/ui-plan-client-ready.spec.ts tests/e2e/report-signoff-navigation.spec.ts --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop --reporter=line
pnpm exec vitest run tests/regression/ui-plan-contrast-i18n.test.ts tests/regression/ui-plan-foundations.test.ts tests/regression/ui-plan-shell-integration.test.ts tests/regression/client-team-directory-ui.test.ts
```

**Acceptance:** One post-fix evidence set covers all 20 role/width combinations and focal journeys with zero unexpected axe/console/overflow failure.

**Forbidden writes:** repositories, finance rules, auth/RBAC, deployment and authority documents.

### WP-07 — Independent finance, security and operations review

**Class/owner:** Review-only Luna Max lanes (`finance_integrity_reviewer`, `security_reviewer`, `mobile_qa`/`desktop_qa`).

**Requirements:** CORE-09–17 and all material cross-cutting invariants.

**Files:** read-only entire candidate; no writes.

- [ ] Finance reviewer verifies exact money, canonical authority, invoice issue/snapshot, payment/ledger, Accounting Pack source cut and artifact lifecycle.
- [ ] Security reviewer verifies auth-before-step-up, object scope, service actor fencing, private artifact download/storage, invitation token redaction and transactional assignment revalidation.
- [ ] Browser reviewers inspect the single-run matrix and representative screenshots/traces rather than relying on implementer summaries.
- [ ] Route each concrete rejection back to WP-02, WP-03, WP-04 or WP-06 and rerun the focused plus dependent gates.

**Acceptance:** Independent reports return PASS or enumerate a reproducible blocker; no implementer self-approves.

### WP-08 — Frozen local release gate

**Class/owner:** C → Sol High integration/sign-off.

**Requirements:** SPEC §9.1–9.3 and local portions of CORE-01–17.

**Files:**

- Modify only for a proven gate defect: `scripts/run-quality-gates.ps1`
- Evidence: `artifacts/quality-gates/<frozen-candidate-id>/**`

- [ ] Record candidate identifier, branch, HEAD and a SHA-256 manifest of the dirty diff/untracked implementation paths without treating the manifest as product completion.
- [ ] Run `format:check`, `lint`, `typecheck`, full unit/regression, integration, security, migrations, reporting, invariants, continuity/operations and SQLite integrity/FK checks on Node 24.19.0.
- [ ] Run site, portal and jobs production builds with release-equivalent environment values.
- [ ] Run artifact lifecycle, Worker Statement, sign-off, invoice/payment/Accounting Pack and the final UI matrix.
- [ ] Run the PowerShell quality-gate self-test and ensure a failing child command cannot be reported as PASS.

Run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm exec vitest run tests/migrations
pnpm test:reporting
pnpm test:invariants
pnpm test:continuity
pnpm --filter @ja/portal build
pnpm --filter @ja/site build
pnpm jobs:build
pwsh -File scripts/run-quality-gates.test.ps1
pwsh -File scripts/run-quality-gates.ps1
```

**Acceptance:** Every repository-owned gate is green from the same frozen candidate. Offline tests are retained as non-blocking regression evidence only.

### WP-09 — Reconcile checklist and UI_PLAN with the frozen evidence

**Class/owner:** A → Luna Max documentation worker; Sol lead owns final classifications.

**Requirements:** CORE-01–17, DoD, UI_PLAN and current offline decision.

**Files:**

- Modify: `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`
- Modify: `UI_PLAN.md`
- Modify: `CODEX_EXECUTION_PLAN.md`
- Modify only for historical trace links, not verdict: `REQUIREMENTS_TRACEABILITY_MATRIX.md`

- [ ] Replace contradictory historical snapshots/counts with one dated candidate section; move useful older evidence under clearly labeled history.
- [ ] Downgrade any checkbox contradicted by current execution until its frozen evidence is green, especially invoice issue/payment/monthly export.
- [ ] Mark Offline/PWA `OUT OF ACTIVE SCOPE — J&A decision 2026-09-01`, retaining the post-go-live note.
- [ ] Replace UI_PLAN's old `93 pass / 9 fail`, `8/8 owner-only` and `[~]` claims with the single final multi-role result.
- [ ] Link exact commands, test files, artifact paths and reviewer verdicts near each CORE/DoD claim.
- [ ] Keep CORE-16/17 and steps 30–32 blocked until real external evidence exists.

**Acceptance:** No `PASS`/checked item conflicts with the frozen candidate; no deferred roadmap row controls Client Essential readiness.

### WP-10 — Production, recovery and contractual acceptance

**Class/owner:** C → Sol lead/operator with authorized VPS/provider access. No delegation of secrets.

**Requirements:** CORE-16, CORE-17, acceptance steps 30–32 and ANEXO D D.1/D.2/D.3.

**Files/evidence:** operator evidence JSON consumed by `preflightClientEssentialOperationsEvidence`; production logs, backup manifests and signed UAT stored in the approved private evidence location, not committed with secrets.

- [ ] Deploy the frozen candidate and verify its exact SHA/manifest behind Caddy.
- [ ] Provision/verify the deployment-scoped service actor; enqueue through the normal user flow and capture two consecutive automatic `jobs.cycle` runs with real queue transitions and no manual processing.
- [ ] Observe one natural scheduled backup timer run.
- [ ] Restart the stack and verify site, portal, jobs, Caddy, health and deployed candidate identity auto-start correctly.
- [ ] Create an encrypted copy on a genuinely separate destination and perform an isolated restore of SQLite, one issued invoice and at least two private artifacts; verify hashes, integrity and foreign keys.
- [ ] Capture real DNS/email/form-delivery evidence and execute/sign ANEXO D D.1/D.2/D.3 UAT.
- [ ] Supply the validated operations evidence and `JA_E2E_CADDY_BASE_URL`, then rerun steps 30–32.

**Acceptance:** All 32 steps pass from the frozen deployed candidate. Only then may the verdict change from `BLOCKED BY EXTERNAL PREREQUISITE` to `CLIENT READY`.

## Packet Handoff Contract

Every implementer/reviewer returns:

- behavior implemented or reviewed;
- exact changed files;
- migrations/data changes (normally none);
- commands and exact outcomes;
- browser/manual evidence;
- unresolved risks/blockers;
- CORE/acceptance IDs believed satisfied;
- any required interface change outside owned paths.

## Final Self-Review

- CORE-01–08 are covered by the frozen regression/security/journey gates, not reopened without a reproduced defect.
- CORE-09–13 are covered by WP-02–05 and finance review.
- CORE-14 is covered by WP-06 and independent browser review.
- CORE-15 is covered in each sensitive packet plus the full security review.
- CORE-16/17 are covered locally by WP-08 and externally by WP-10.
- All 32 acceptance steps map to WP-05 (1–29) or WP-10 (30–32).
- Offline/PWA and V3.1–V3.4 expansion are explicitly non-blocking/deferred.
- No placeholders or production-evidence substitutions are authorized.
