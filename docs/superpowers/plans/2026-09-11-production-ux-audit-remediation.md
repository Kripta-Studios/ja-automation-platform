# Production UX Audit and Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining production UX/navigation gaps, prove report authorship and role-safe access, regenerate every manual PDF, and release the verified revision.

**Architecture:** Extend the existing Svelte shared register and progressive-disclosure primitives. UI summaries navigate or filter; destination loaders/actions retain all authorization. No financial or report history becomes mutable, and no external ERP code is imported.

**Tech Stack:** Svelte 5/SvelteKit, TypeScript, Vitest, Playwright, Node 24.19.0, pnpm 11.22.0, SQLite, Docker Compose, Chromium PDF rendering.

**Spec:** `docs/superpowers/specs/2026-09-11-production-ux-audit-remediation-design.md`

## Global Constraints

- Work in the current repository and branch as required by the root `AGENTS.md`.
- Use exact integer/minor-unit money semantics; do not introduce browser money calculations.
- Preserve immutable issued invoices, finalized financial history and traceable artifacts.
- Enforce RBAC, live-session checks and object authorization at the server boundary; links never grant authority.
- Worker/PM DTOs must not expose Finance rates, margin, other-worker pay or private reimbursements.
- Multi-record pages use eight rows per page and usable 360/390/768/1440 layouts.
- Use Node `24.19.0` and pnpm `11.22.0` for every gate.
- Do not use subagents, per the explicit request.

---

### Task 1: Shared operational ordering and composite attention filters

**Files:**
- Modify: `apps/portal/src/lib/portal/sections/operational-register.ts`
- Modify: `apps/portal/src/lib/portal/ui/record-browser.ts`
- Test: `tests/operational-register.test.ts`
- Test: `tests/record-browser.test.ts`

**Interfaces:**
- Produces: `OperationalOrder = 'newest' | 'oldest' | 'name' | 'status'`.
- Produces: `operationalSort<T>(rows, order, dateFields, nameFields, statusFields): T[]`.
- Produces: `operationalStatusMatches(rowStatus, filter, attentionStates): boolean`.
- Extends: `recordState(row)` with an explicit `browser_status` override for context-specific period lists.

- [ ] **Step 1: Write the failing helper tests**

```ts
it('sorts operational rows without mutating the source', () => {
  const rows = [
    { id: 'b', work_date: '2026-09-02', worker_name: 'Zoë', approval_state: 'approved' },
    { id: 'a', work_date: '2026-09-01', worker_name: 'Ana', approval_state: 'submitted' },
  ];
  expect(operationalSort(rows, 'oldest', ['work_date'], ['worker_name'], ['approval_state']).map(row => row.id)).toEqual(['a', 'b']);
  expect(operationalSort(rows, 'name', ['work_date'], ['worker_name'], ['approval_state']).map(row => row.id)).toEqual(['a', 'b']);
  expect(rows.map(row => row.id)).toEqual(['b', 'a']);
});

it('matches a composite attention filter exactly', () => {
  expect(operationalStatusMatches('draft', 'attention', ['draft', 'submitted', 'needs_changes'])).toBe(true);
  expect(operationalStatusMatches('approved', 'attention', ['draft', 'submitted', 'needs_changes'])).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail because the new exports do not exist**

Run: `pnpm vitest run tests/operational-register.test.ts tests/record-browser.test.ts`

- [ ] **Step 3: Implement deterministic, accent-insensitive ordering and composite matching**

```ts
export type OperationalOrder = 'newest' | 'oldest' | 'name' | 'status';

export function operationalStatusMatches(
  rowStatus: unknown,
  filter: string,
  attentionStates: readonly string[],
): boolean {
  if (!filter) return true;
  const state = String(rowStatus ?? '');
  return filter === 'attention' ? attentionStates.includes(state) : state === filter;
}
```

`operationalSort` must copy before sorting, use the requested fields in order, normalize names with `operationalSearchText`, and use ID as the final stable tie-breaker.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `pnpm vitest run tests/operational-register.test.ts tests/record-browser.test.ts`

- [ ] **Step 5: Commit the helper contract**

```bash
git add apps/portal/src/lib/portal/sections/operational-register.ts apps/portal/src/lib/portal/ui/record-browser.ts tests/operational-register.test.ts tests/record-browser.test.ts
git commit -m "feat(portal): standardize operational register ordering"
```

### Task 2: Truthful Time, Expense, Report and Approval register controls

**Files:**
- Modify: `apps/portal/src/lib/portal/sections/TimeSection.svelte`
- Modify: `apps/portal/src/lib/portal/sections/ExpenseSection.svelte`
- Modify: `apps/portal/src/lib/portal/sections/ReportSection.svelte`
- Modify: `apps/portal/src/lib/portal/sections/ApprovalSection.svelte`
- Modify: `apps/portal/src/lib/i18n/catalog-coverage.ts`
- Modify: `apps/portal/src/lib/i18n/coverage-literal-overrides.ts`
- Modify: `apps/portal/src/lib/i18n/coverage-translations.ts`
- Test: `tests/regression/worker-time-ui.test.ts`
- Test: `tests/regression/worker-expense-ui.test.ts`
- Test: `tests/regression/worker-reports-ui.test.ts`
- Test: `tests/e2e/ux-review-20260911.spec.ts`

**Interfaces:**
- Consumes: `operationalSort` and `operationalStatusMatches` from Task 1.
- Produces: URL filter `status=attention` for combined draft/submitted/needs_changes counts.
- Produces: URL filter `reimbursement=pending` for pending/scheduled reimbursements.
- Produces: explicit `order` selector on each custom operational register.

- [ ] **Step 1: Add failing UI regression assertions**

Each source regression asserts a bound `order` select, composite attention matching, state persistence including `order`, and no hard-coded single-state link for a multi-state count. The browser case clicks Time/Expense attention cards and checks all matching statuses remain visible while approved rows do not.

- [ ] **Step 2: Run the four focused regression files and confirm red**

Run: `pnpm vitest run tests/regression/worker-time-ui.test.ts tests/regression/worker-expense-ui.test.ts tests/regression/worker-reports-ui.test.ts tests/regression/requested-portal-ui.test.ts`

- [ ] **Step 3: Add state, selectors and exact filtering to each section**

```svelte
<label>
  <span>{translate('Sort by')}</span>
  <select bind:value={order} onchange={() => (registerPage = 1)}>
    <option value="newest">{translate('Newest first')}</option>
    <option value="oldest">{translate('Oldest first')}</option>
    <option value="name">{translate('Name')}</option>
    <option value="status">{translate('Status')}</option>
  </select>
</label>
```

Time and Expense attention counts and links must both cover `draft`, `submitted`, and `needs_changes`. Expense reimbursement filtering must cover `pending` and `scheduled`. Report attention is computed for the selected field-report tab. Approval keeps unresolved and completed groups separate while applying the requested order within each group.

- [ ] **Step 4: Add EN/ES/PT copy for the new labels and run i18n coverage**

Run: `pnpm vitest run tests/regression/portal-i18n-coverage.test.ts tests/regression/portal-visible-locale.test.ts`

- [ ] **Step 5: Run the focused component regressions and authenticated browser journey**

Run: `pnpm vitest run tests/regression/worker-time-ui.test.ts tests/regression/worker-expense-ui.test.ts tests/regression/worker-reports-ui.test.ts`

Run: `pnpm playwright test tests/e2e/ux-review-20260911.spec.ts --project=desktop --project=phone-360`

- [ ] **Step 6: Commit operational list remediation**

```bash
git add apps/portal/src/lib/portal/sections apps/portal/src/lib/i18n tests/regression tests/e2e/ux-review-20260911.spec.ts
git commit -m "feat(portal): finish operational list filters and ordering"
```

### Task 3: Bound and filter Client Sign-off and generated period files

**Files:**
- Modify: `apps/portal/src/lib/portal/sections/ReportSection.svelte`
- Modify: `apps/portal/src/lib/portal/ui/record-browser.ts`
- Test: `tests/regression/worker-reports-ui.test.ts`
- Test: `tests/e2e/ux-review-20260911.spec.ts`

**Interfaces:**
- Consumes: `RecordBrowser` with `browser_status` and `contextKey`.
- Produces: `signoffPage` and `periodReportPage`, each limited to eight rows.
- Preserves: `hasPeriodSnapshot` and `hasReadyPeriodPdf` as navigation/download gates.

- [ ] **Step 1: Add failing tests for both period-list browsers**

The regression requires distinct `RecordBrowser` contexts for `Client sign-off register` and `Generated period report register`. The E2E fixture creates more than eight customer-period rows, asserts one page contains at most eight, and moves Next without exposing an unverified PDF action.

- [ ] **Step 2: Run the report regressions and verify red**

Run: `pnpm vitest run tests/regression/worker-reports-ui.test.ts tests/record-browser.test.ts`

- [ ] **Step 3: Decorate authorized rows with context-specific browser state and render paged arrays**

```ts
const signoffRows = $derived(
  customerPeriodReports.map(report => ({ ...report, browser_status: signoffState(report) })),
);
const generatedRows = $derived(
  periodReports.map(report => ({ ...report, browser_status: String(report.state ?? '') })),
);
```

Apply the project query before either browser. Keep queued rows disabled and ready PDF checks unchanged.

- [ ] **Step 4: Run focused Vitest and Playwright checks**

Run: `pnpm vitest run tests/regression/worker-reports-ui.test.ts tests/record-browser.test.ts`

Run: `pnpm playwright test tests/e2e/ux-review-20260911.spec.ts --project=desktop`

- [ ] **Step 5: Commit period register remediation**

```bash
git add apps/portal/src/lib/portal/sections/ReportSection.svelte apps/portal/src/lib/portal/ui/record-browser.ts tests/regression/worker-reports-ui.test.ts tests/e2e/ux-review-20260911.spec.ts
git commit -m "feat(portal): paginate period report workflows"
```

### Task 4: Finance and Collections drill-through

**Files:**
- Modify: `apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte`
- Modify: `apps/portal/src/lib/portal/sections/CollectionsLedgerSection.svelte`
- Test: `tests/regression/finance-v3-review-remediation.test.ts`
- Test: `tests/regression/requested-portal-ui.test.ts`
- Test: `tests/e2e/ux-review-20260911.spec.ts`

**Interfaces:**
- Produces: project-scoped hrefs for portfolio, settlements, reimbursements, billing invoices, expense/time source rows and alerts.
- Produces: ledger summary buttons that update `statusFilter`.
- Produces: invoice detail href `/app/billing/invoices/:id` from every ledger row/card.

- [ ] **Step 1: Add failing source and browser assertions**

Assert all four Finance attention cards are anchors/buttons, each actual metric has an authorized drill-through, the planned/expected section contains no standalone `>` text node, Collections summaries are buttons, and a ledger invoice opens the detail route.

- [ ] **Step 2: Run focused tests and confirm red**

Run: `pnpm vitest run tests/regression/finance-v3-review-remediation.test.ts tests/regression/requested-portal-ui.test.ts`

- [ ] **Step 3: Implement links without changing finance calculations**

```ts
function financeHref(view: 'economic' | 'commercial', source?: string, hash = ''): string {
  const query = new URLSearchParams({ view });
  if (data.selectedProjectId) query.set('project', data.selectedProjectId);
  if (source) query.set('source', source);
  return `${base}/app/finance?${query.toString()}${hash}`;
}
```

Use links to Billing for invoiced, Time for hours, Expense source/reimbursement for direct cost and reimbursement, and settlement source for settlement review. Add stable target IDs. Convert ledger counters to filter buttons and add invoice detail links. Remove the stray text node only.

- [ ] **Step 4: Run focused tests and the Owner/Finance browser route checks**

Run: `pnpm vitest run tests/regression/finance-v3-review-remediation.test.ts tests/regression/requested-portal-ui.test.ts`

Run: `pnpm playwright test tests/e2e/ux-review-20260911.spec.ts --project=desktop`

- [ ] **Step 5: Commit finance navigation**

```bash
git add apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte apps/portal/src/lib/portal/sections/CollectionsLedgerSection.svelte tests/regression tests/e2e/ux-review-20260911.spec.ts
git commit -m "feat(portal): connect finance summaries to source workflows"
```

### Task 5: Progressive Billing setup actions

**Files:**
- Modify: `apps/portal/src/lib/portal/sections/BillingSection.svelte`
- Modify: `apps/portal/src/styles/portal/primitives.css`
- Test: `tests/regression/requested-portal-ui.test.ts`
- Test: `tests/e2e/ux-review-20260911.spec.ts`

**Interfaces:**
- Produces: `BillingSetupAction = 'stream' | 'entity' | 'tax' | 'numbering'`.
- Produces: keyboard-usable setup action controls that render exactly one setup form.
- Preserves: existing form action names and server validation.

- [ ] **Step 1: Add a failing browser test**

Open Configure billing, assert the New billing stream form is initially visible, select New tax profile, assert only that form is visible, then switch to Invoice numbering policy. Keep Legal entities and Tax profiles directories visible.

- [ ] **Step 2: Run the focused E2E case and verify red**

Run: `pnpm playwright test tests/e2e/ux-review-20260911.spec.ts --project=desktop`

- [ ] **Step 3: Add setup action state and conditional form rendering**

```svelte
<nav class="billing-section__setup-actions" aria-label={translate('Billing setup actions')}>
  {#each setupActions as action}
    <button type="button" aria-pressed={setupAction === action.id} onclick={() => (setupAction = action.id)}>
      {translate(action.label)}
    </button>
  {/each}
</nav>
```

Wrap each existing form with the matching condition; do not rename inputs/actions or combine transactional operations.

- [ ] **Step 4: Run Svelte typechecking and Billing E2E**

Run: `pnpm --filter @ja/portal typecheck`

Run: `pnpm playwright test tests/e2e/ux-review-20260911.spec.ts --project=desktop --project=phone-360`

- [ ] **Step 5: Commit progressive disclosure**

```bash
git add apps/portal/src/lib/portal/sections/BillingSection.svelte apps/portal/src/styles/portal/primitives.css tests/regression/requested-portal-ui.test.ts tests/e2e/ux-review-20260911.spec.ts
git commit -m "feat(portal): streamline billing setup actions"
```

### Task 6: Prove creator identity in Daily and PLC/Technical PDFs

**Files:**
- Modify only if the test exposes a gap: `packages/reporting/src/exports.ts`
- Modify only if the test exposes a gap: `packages/database/src/domains/localized-artifacts/localized-pdf-repository.ts`
- Test: `tests/reporting-i18n.test.ts`
- Test: `tests/integration/localized-pdf-variants.test.ts`

**Interfaces:**
- Preserves: author identity derives from stored `worker_id`/`author_id` and the joined `user` row.
- Requires: PDF contains author name and available author email in EN, ES and PT-BR.

- [ ] **Step 1: Add report snapshots with a creator and assertions for name/email**

```ts
const technicalText = expectPdf(technicalReportPdf({
  ...technicalSnapshot(locale),
  worker_name: 'Alex Rivera',
  worker_email: 'alex.rivera@example.test',
}));
expect(containsPdfCopy(technicalText, 'Alex Rivera')).toBe(true);
expect(containsPdfCopy(technicalText, 'alex.rivera@example.test')).toBe(true);
```

The integration case queues a localized artifact from a real technical report and asserts the immutable snapshot was enriched from its persisted author, not client payload.

- [ ] **Step 2: Run reporting and localized-artifact tests**

Run: `JA_CHROMIUM_PATH=/usr/bin/chromium pnpm vitest run tests/reporting-i18n.test.ts tests/integration/localized-pdf-variants.test.ts --no-file-parallelism`

- [ ] **Step 3: If red, correct only the failing snapshot join/render boundary and rerun**

The allowed fix is to add `author_name`/`author_email` from the persisted source user to the immutable snapshot or render its existing values. Do not accept browser identity fields as authority.

- [ ] **Step 4: Commit report evidence or the bounded correction**

```bash
git add packages/reporting/src/exports.ts packages/database/src/domains/localized-artifacts/localized-pdf-repository.ts tests/reporting-i18n.test.ts tests/integration/localized-pdf-variants.test.ts
git commit -m "test(reporting): prove report creator identity in PDFs"
```

### Task 7: Cross-role security and complete quality gates

**Files:**
- Modify only for confirmed defects: `apps/portal/src/lib/server/**`
- Modify only for confirmed defects: `packages/database/src/**`
- Test: `tests/security`
- Evidence: `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`

**Interfaces:**
- Verifies: Worker/PM/supplier/technician/Finance/Owner/Auditor loaders, actions and private downloads.
- Verifies: guessed cross-project IDs fail without disclosing another object's data.

- [ ] **Step 1: Run focused RBAC/IDOR and projection suites**

Run: `pnpm vitest run tests/security/repository-privacy.test.ts tests/security/portal-pm-projection.test.ts tests/security/supplier-route-access.test.ts tests/security/private-download.test.ts tests/security/astra-manual-download.test.ts --no-file-parallelism`

- [ ] **Step 2: Run complete unit, integration, security, reporting and invariant gates**

```bash
pnpm test:unit
pnpm test:integration
pnpm test:security
JA_CHROMIUM_PATH=/usr/bin/chromium pnpm test:reporting
pnpm test:invariants
pnpm test:offline
pnpm test:continuity
pnpm typecheck
pnpm lint
pnpm format:check
pnpm db:integrity
```

- [ ] **Step 3: Run production builds and representative browser suites**

```bash
pnpm build
pnpm jobs:build
pnpm playwright test tests/e2e/ux-review-20260911.spec.ts tests/e2e/ux-workflows-20260910.spec.ts tests/e2e/client-essential-32-step.spec.ts tests/e2e/supplier-workforce.spec.ts
```

- [ ] **Step 4: Record exact commands, counts and any external acceptance boundary in the Essential checklist**

Do not convert missing human fiscal/legal approval or operator evidence into a technical pass.

### Task 8: Regenerate manuals, push, deploy and verify exact revision

**Files:**
- Modify: `docs/manuals/*.md`
- Regenerate: `docs/manuals/*.pdf`
- Regenerate: `docs/manuals/manual-build*.json`
- Regenerate: `docs/manuals/screenshots/current/**`
- Create: `docs/PRODUCTION_DEPLOYMENT_2026-09-11-UX-FINAL.md`

**Interfaces:**
- Consumes: final tested source revision from Tasks 1–7.
- Produces: role-aware Help artifacts packaged in the portal image.
- Produces: pushed Git revision and verified production release with rollback retained.

- [ ] **Step 1: Update manual source copy for the final controls and role boundaries**

Document composite attention filters, ordering, period pagination, Finance/Ledger drill-through and Billing setup actions in EN/ES/PT-BR sources that exist in the current catalog.

- [ ] **Step 2: Run the repository manual capture/build workflow**

```bash
pnpm playwright test tests/e2e/manual-current-capture.spec.ts --project=desktop
node --experimental-strip-types scripts/generate-user-manuals.ts
node --experimental-strip-types scripts/generate-user-manuals.ts --locale=pt-BR
node --experimental-strip-types scripts/generate-client-ready-manuals.ts
```

Then verify every catalogued PDF begins with `%PDF-`, is non-empty, and is served by its authenticated role route.

- [ ] **Step 3: Re-run manual catalog, PDF and final source gates**

Run: `pnpm vitest run tests/unit/astra-manual-catalog.test.ts tests/security/astra-manual-download.test.ts tests/reporting-i18n.test.ts`

Run: `pnpm typecheck && pnpm lint && pnpm format:check`

- [ ] **Step 4: Commit the final source/manual evidence and push**

```bash
git add J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md docs/manuals docs/PRODUCTION_DEPLOYMENT_2026-09-11-UX-FINAL.md
git commit -m "docs: publish final role workflows and release evidence"
git push origin codex/v3-production-completion-orchestrated-20260819
```

- [ ] **Step 5: Build and deploy through the reviewed production release path**

Create the production archive from the pushed commit, verify its SHA-256, run the existing deployment tool that performs backup/rollback tagging/migrations/Compose replacement, and never run the demo seed or `docker compose down`.

- [ ] **Step 6: Verify the exact deployed revision and live behavior**

Run HTTPS/site/login/readiness checks, confirm portal/site/jobs containers are healthy, inspect database integrity and migrations, and execute authenticated smoke cases for Client creation, expense default, Technical PDF author, queue filtering, invoice detail/PDF, manual PDF and cross-role denial.

- [ ] **Step 7: Clean Docker builder cache safely**

Run `docker builder prune -af` only after the release and rollback images are confirmed present. Do not prune volumes or active/rollback images. Record remaining builder cache size.
