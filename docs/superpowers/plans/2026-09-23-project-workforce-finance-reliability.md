# Project, workforce and finance reliability — implementation plan

Date: 23 September 2026. Status: implemented through the deployed `zip-d215671b99323d6d8c4ce34b74b4f8e0` release and the 24 September clean-slate cutover; individual journey outcomes and remaining limits are recorded in `docs/evidence/project-finance-20260923/status.md`. This plan remains the original design and acceptance checklist.

**Goal:** Make project setup, worker-specific commercial terms, team time recording, expenses, invoices and reports work consistently, with acceptance evidence from the deployed application.

**Architecture:** Extend the existing SvelteKit modular monolith, SQLite database and exact-money billing/reporting packages. Reuse assignment overrides and commercial rules. Share versioned calculation results across previews, finance, invoices and explanations; preserve historical financial snapshots.

**Authority:** The user's current requirements, including confirmation that expenses need both occurrence timestamps and entry alongside shift hours; repository AGENTS.md; Client Essential specification/checklist; contractual acceptance criteria. This document combines the proposed design, implementation sequence and acceptance criteria.

## 1. Original planning-phase baseline (historical)

The table below records what was known before implementation. Its release and verification limits are superseded by the current deployed evidence ledger linked above.

| Finding | Evidence | Limitation or implication |
|---|---|---|
| Production URL reachable | HTTP request to `/j-aautomation/app/projects` returned 303 to login; Playwright loaded login with HTTP 200 and no captured page errors | Authenticated create/edit/invoice workflows have NOT been verified |
| Running release identified | Portal/jobs image `ja-automation-portal:zip-97502e4a6676a5a7c91435e42522c3b3`; current release directory ends in `97502e4a6676a5a7c91435e42522c3b3fecc10132d0edc4846f2101f6fdfced4` | Recheck before implementation; attach evidence to exact deployed artifact |
| Default E2E suite is local | `playwright.config.ts` targets localhost:4173/4174 with fixture databases and development configuration | A pass cannot certify production sessions, proxy, data, migrations or jobs |
| “Live audit” script is local | `scripts/qa-live-portal-audit.ts` requires local synthetic fixtures; project section opens creation UI without submitting a complete project | Its screenshots do not prove deployed project creation |
| Blank budget contract mismatch | Release form submits blank budget strings; release schema uses digit-only string validation with `.optional()` | Empty strings are not omitted values; a concrete failure path requiring authenticated reproduction |
| Workspace already has unfinished changes | Nine modified files include budget normalization, repository, UI and tests | Preserve and review them; do not claim they are deployed |
| Planned end already optional in source | Form/schema permit blank planned end | Test create, edit, clear and persistence; a label alone is insufficient |
| New time UI forces intervals | `TimeIntervalFields.svelte` exposes duration choice only for legacy duration records; schema accepts minutes-only entries | New entries need a first-class duration mode |
| Worker commercial foundations exist | Worker-specific client rates, project compensation, assignment rule references and assignment overrides exist | Connect and extend them instead of creating competing systems |
| Errors can mask causes | Project detail loader catches all errors as 404; action messages can be generic | Preserve meaningful validation and safe diagnostics |

Source comparison found the inspected creation form, project action and time component match the release tree; the schema differs. A limited scan of 2,968 container log lines found none of the searched exception signatures; this is NOT proof that writes work. A direct import of release source for a schema probe could not resolve its host-side `zod` dependency; do not count it as a passing test or install dependencies into the release to make it run.

No production data, mail configuration or product code was modified in this planning phase. The remaining errors are reported defects, not yet individually diagnosed.

## 2. Recommended delivery strategy

Repair the real browser/action failures first, then extend the existing person-specific configuration and calculations, then deploy and prove the end-to-end workflows. Deliver two coherent increments: reliability, then flexibility. Inventory cleanup early, but apply cleanup only after rehearsal and a stable release.

A form-only patch would leave the requested financial flexibility unresolved. A full rewrite would increase migration risk despite existing rate and assignment capabilities. The recommended approach retains the existing architecture and fixes the complete data flow.

Dependency order:

1. Baseline, backup/restore rehearsal and defect reproduction.
2. Form/action reliability and clear error reporting.
3. Effective commercial terms and additive migrations.
4. People-first project configuration, expertise and budgets.
5. Duration/team time and linked expenses.
6. Shared calculations and Antonny's explanation view.
7. Invoice/report generation and working navigation.
8. Cleanup rehearsal and reviewed production cleanup.
9. Release and deployed acceptance.

## 3. Intended product behavior

### 3.1 Projects, defaults and optional fields

- Minimum project: client, name, cost-center code, currency and timezone. Currency/timezone inherit visible client/company defaults; cost-center code is required, as explicitly confirmed by the user on 23 September 2026.
- Alias, budget, PO reference, manager, site, description, start/planned-end dates and optional reporting settings do not block legitimate saves. A specific commercial feature can require its own inputs: for example, an enabled hard cap requires an amount.
- Empty means unconfigured; zero means explicitly zero; an omitted field in a partial update means unchanged. Clearing an optional field persists null where appropriate.
- Money is entered in normal currency units and effort in hours. Parse supported locale decimal separators consistently; reject ambiguous input visibly. Internal amounts remain exact minor units and durations integral minutes.
- Keep planning targets separate from billing caps. Allow independent planned hours, labor cost, labor revenue, expenses, other costs, revenue target and PO cap. No budget is valid.
- Project tabs: Overview, People, Time, Expenses, Reports, Finance, Invoices, Settings. Preserve project/date/person filters across links. Search by number, name, alias and cost center.
- Preserve existing fixed/milestone/hybrid/internal models where supported, while making Time & expenses the clear normal hourly option. Included expenses never imply a fixed labor price.
- Time & expenses defaults to one customer invoice with separate labor and expense sections and totals. Project settings and reusable templates can instead select two separate labor and expense invoices, with their own drafts and applicable cadence/tax settings. Mode changes preserve historical invoices and prevent double billing.

### 3.2 Create and manage projects around people

Guided setup: Basics → People → Commercial terms → Review. Allow an incomplete draft and distinguish operational readiness from billing readiness.

Select individuals or a saved team; filter by Expertise, active status and availability. Each project-person row shows assignment dates, role, customer charge, worker compensation and expense policies. Bulk-apply defaults, then make visible individual overrides.

Seven workers can charge the customer 55/hour and an eighth 70/hour. Their compensation is independently configured and can use different pay models. The same person can have different terms on different projects.

Use “Expertise” consistently in the UI. Preserve existing skill identifiers/history where those records already represent expertise; add project expertise requirements and filtering without creating a duplicate taxonomy or destructive renaming.

### 3.3 Commercial rules

Keep five distinct concepts: customer labor charge, worker pay, internal cost, worker reimbursement and customer expense recovery.

- Reuse hourly, daily, fixed-period/project and eligible-labor percentage compensation models. State the percentage basis explicitly; expenses do not silently enter that basis.
- Assignment expense policy states eligible categories, limits, payer, worker reimbursement and customer recovery independently. Support existing at-cost, markup, included, non-billable, client-paid and allowance treatments.
- Proposed precedence: applicable assignment category/activity override → person/project terms → explicit project default. Worker-global pay fallback is allowed only when enabled and identified. Customer rate never falls back to worker pay.
- Resolve on work/expense date, not today's configuration. Record rule IDs/versions and inputs. Reject ambiguous same-priority overlaps; preserve existing historical selections.
- Missing rate means “configuration required,” not zero. Operational drafts can be recorded; financial finalization gives a blocker linked to the missing setting.
- Actual hours, payable basis and customer billable hours remain separate. Daily minimum is applied once per worker/project/day across entries and never fabricates actual time or worker pay.
- Show the impact of rate edits on open records/drafts. Recalculation is explicit and audited. Issued invoices and finalized settlements remain immutable; corrections use existing adjustment lifecycles.

### 3.4 Time, supervisors and expenses

Default new entry: date + amount of hours. Also offer timestamp interval mode. A single timestamp cannot determine hours; duration must be entered or derived from an actual interval. Preserve entry mode and never invent start/end times for duration records.

Accept clear hours/minutes or decimal hours, showing `7.5 hours = 7 h 30 min`. Handle overnight intervals with explicit dates, project timezone and daylight-saving ambiguity. Validate missing/negative/excessive values and overlaps; allow incomplete drafts only where clearly labeled.

A leader manages an explicitly delegated team and logs a row per person: project, date, duration/interval, category, activity and notes. Shared defaults can be copied, then adjusted. Record actual worker separately from submitted-by user and batch ID. Membership, assignment dates and authorization are checked for every row. Team entry does not grant access to coworkers' pay or automatically permit self-approval.

Save a submitted batch transactionally, with row errors and retained input if validation fails. Use idempotency for retries. Later approval/correction is per record.

Add expenses alongside shift hours with inherited person/project/date, optional occurrence time, amount, category, payer, receipt and notes. Store the expense separately and link it to shift/batch. A shared receipt is one expense or explicit allocations summing to its total, never duplicated once per team member. Expense-only entry remains supported. These features cover BOTH expense requests confirmed by the user.

### 3.5 Explain calculations to Antonny

Provide “How this project is calculated” before activation and “What will be billed and paid” for a selected period.

Show each person's actual/approved hours, billable quantity, customer rate and source, pay method/basis, expense reimbursement, customer recovery and effective dates. Distinguish forecast, pending approval, approved candidate, invoiced and paid amounts.

Each total expands to source records, selected rules, formulas, rounding, tax/FX and exclusions. Missing inputs show blockers, not plausible estimates. The explanation and invoice must consume the same calculation result. Explain which open records a change affects and which historical records remain unchanged.

Owner/Finance see authorized commercial details. Workers see their own pay only; leaders/PMs do not gain other-worker pay access. Customer reports contain approved operational hours and activity, not confidential money.

## 4. Technical boundaries and interfaces

Retain `packages/database`, `packages/billing-engine`, `packages/money` and `packages/reporting` responsibilities. Add narrow commercial modules rather than expanding repository monoliths or rewriting unrelated modules.

Proposed shared calculation contract (new):

```ts
type CalculationLine = Readonly<{
  kind: 'client_labor' | 'worker_pay' | 'internal_cost' |
        'client_expense' | 'worker_reimbursement';
  sourceIds: readonly string[];
  ruleVersionIds: readonly string[];
  currency: string;
  amountMinor: string;
  quantityMinutes?: number;
  rateMinor?: string;
  explanationKey: string;
}>;
type ProjectCalculation = Readonly<{
  projectId: string;
  periodStart: string;
  periodEnd: string;
  sourceFingerprint: string;
  engineVersion: string;
  lines: readonly CalculationLine[];
  issues: readonly {
    code: string; sourceId?: string; field?: string; configurationPath?: string;
  }[];
}>;
```

Use bigint/exact-money operations internally and decimal strings in JSON. Preserve current documented rounding, FX and tax rules in calculation trace details. Filter DTOs server-side before delivery to each role.

Reuse `client_labor_rate`, `compensation_rule`, `project_member` and `assignment_rate_override`. Add only missing effective assignment expense policy, scoped team/leader membership, batch actor metadata, expense occurrence time/shift links and calculation provenance. Choose migration numbers against the actual branch. Do not backfill guessed terms or reinterpret old columns.

## 5. Implementation work packages

Each package starts with a meaningful failing regression for confirmed defects, implements the behavior, runs focused checks and records evidence. Preserve the nine existing modified files and reconcile their changes before building upon them.

### A. Baseline and root-cause investigation

Existing paths: `playwright.config.ts`, `tests/e2e/environment.ts`, `scripts/qa-live-portal-audit.ts`, `deployment/`, release evidence.
New artifact: `docs/evidence/project-finance-20260923/baseline.md`.

- [ ] Record revision/tree, existing diff, release checksum, portal/jobs images, migration version and pinned runtime versions.
- [ ] Read full Client Essential specification/checklist and contractual acceptance sections before implementation.
- [ ] Take a consistent SQLite online backup plus private artifacts; restore into an isolated environment with outbound integrations disabled.
- [ ] Reproduce create/edit project, log time, submit expense, generate invoice and broken project links with ordinary authenticated roles.
- [ ] Capture sanitized payload/response, field errors, correlation ID, matching server event and persisted outcome. Keep credentials and private values out of shared evidence.
- [ ] Investigate live-data differences: legacy identifiers, absent rules/legal-entity configuration, expired assignments, date ranges, CSRF/origin/proxy, permissions, migrations, jobs and serialization. Treat these as hypotheses until proven.
- [ ] Maintain defect ledger with steps, expected/actual, release, role, confirmed cause, regression and live retest status.

Exit: every reported blocker reproduced or explicitly unverified with a reason. Do not infer success from healthy containers.

### B. Forms and reliable error handling

Modify: `packages/schemas/src/index.ts`; `apps/portal/src/lib/PortalShell.svelte`; project action module; `actions/action-message.ts`; project detail route server/UI; `portal/ui/form-validation.ts`.
Tests: extend `tests/integration/project-edit-form-boundaries.test.ts`, `tests/integration/client-project-essential.test.ts`; new `tests/e2e/project-form-roundtrip.spec.ts`.

- [ ] Test actual rendered form payloads with all optional fields empty, explicit zero, omitted updates and cleared values.
- [ ] Review/complete existing blank-budget normalization; align creation and both edit paths while preserving allowlists, versions and permissions.
- [ ] Retain input and show field-local errors plus a useful summary. Surface schema-wide errors and safe support references for unexpected failures.
- [ ] Distinguish not-found, forbidden, stale update, invalid configuration and server failure; stop masking every detail-load error as 404.
- [ ] Test create → reload → edit → clear → reload; stale edits; invalid dates/currency; native and enhanced forms where supported.

Focused command: `pnpm exec vitest run tests/integration/project-edit-form-boundaries.test.ts tests/integration/client-project-essential.test.ts`, then the new browser test using the pinned runtime.
Exit: no-budget/no-end-date project and subsequent edits save and persist through the browser.

### C. Effective person-specific terms and migrations

Modify: commercial/workforce/expense schemas; schemas package; `v3-repository.ts`; existing commercial and expense domain repositories; additive migrations.
New: `packages/database/src/domains/commercial/assignment-commercial-terms.ts` and `project-calculation.ts`.
Tests: new `tests/integration/assignment-commercial-terms.test.ts`, `tests/migrations/assignment-commercial-terms.test.ts`; extend commercial billing, worker compensation and expense-classification suites.

- [ ] Pin seven-at-55/one-at-70 behavior with independent worker pay and expense policies.
- [ ] Implement explicit precedence, overlap rejection, provenance, missing-rule blockers and authorization through existing foundations.
- [ ] Add missing storage and migrate both fresh and representative pre-upgrade databases without fabricated defaults.
- [ ] Test effective boundaries, two projects/person, zero versus missing, category/activity overrides, currency mismatch, legacy configuration and concurrent edits.
- [ ] Test server DTOs exclude unauthorized customer rates, costs and coworkers' pay.

Exit: deterministic terms can be explained for every covered worker/date/category without changing historical financial results.

### D. Project people, expertise and budgets

Modify: `PortalShell.svelte`, `ProjectSection.svelte`, project detail, `FinanceConfigurationSection.svelte`, project/finance actions, workforce schema and i18n.
New components: `ProjectPeopleEditor.svelte`, `ProjectCalculationSummary.svelte` under portal sections.
Tests: new `tests/e2e/project-people-configuration.spec.ts`; extend team directory and project permission tests.

- [ ] Build guided setup and editable draft readiness; reuse existing UI primitives.
- [ ] Add individual/team assignment, Expertise filters and project requirements with preserved catalog IDs.
- [ ] Add per-person rates/pay/expenses, bulk defaults and visible overrides with transactional/versioned writes.
- [ ] Add optional independent budgets. Estimate from each person's planned hours/rate plus expenses; unknown inputs remain unknown.
- [ ] Test localized money input, save/reload/clear, multi-person edits, keyboard use and phone/tablet/desktop presentation.

Exit: configure the eight-person example and differing pay/expenses within the project workspace.

### E. Duration time, team submission and expenses

Modify: `TimeIntervalFields.svelte`, `TimeSection.svelte`, `TimesheetPanel.svelte`, `ExpenseSection.svelte`, time/expense actions/detail, time repository, time/expense/workforce schemas and report interval formatting.
New: scoped team-time repository/action and `TeamTimeEntry.svelte`.
Tests: new `tests/integration/team-time-entry.test.ts`, `tests/e2e/team-time-expense.spec.ts`; extend time schema, time validation and form-resilience suites.

- [ ] Enable new duration entries, explicit interval dates/timezone and truthful legacy handling.
- [ ] Repair project preselection and eligible-worker lookup; changing project refreshes dependent context without losing unrelated values.
- [ ] Implement team delegation, one row per worker, actor/batch audit and idempotent transactional save.
- [ ] Add expense occurrence time and shift links with receipt authorization and shared-receipt allocation.
- [ ] Test 7.5 hours, empty/negative/too-large input, draft/submission rules, overnight/DST, overlap, inactive assignments, unauthorized member, batch rollback, retry and concurrency.
- [ ] Combined time/expense submit must not report success after partial failure. Stage receipt uploads safely; expose precisely what is saved.
- [ ] If offline time is enabled, extend its schema/roundtrip coverage for new entry modes.

Exit: leader records different hours and linked expenses for team members without duplicates, fabricated intervals or private pay exposure.

### F. Shared calculation and explanations

Modify: new calculation module from C; billing engine/money utilities where necessary; relevant V3 finance paths; `lib/server/commercial-preview.ts`; finance overview and project summary UI.
Tests: new `tests/integration/project-calculation-reconciliation.test.ts`; extend commercial-policy consumption, preview and privacy tests.

- [ ] Produce exact-money lines, rule/source versions and input fingerprint; separate actual, billable and payable bases.
- [ ] Apply daily minima once per person/day, independent pay rules, caps, expense recovery and reimbursement without double counting.
- [ ] Render explanations from calculation lines, not separate UI arithmetic.
- [ ] Detect stale previews/drafts; require audited recalculation and recheck versions at finalization.
- [ ] Reconcile source rows to totals; test rounding, FX/tax, split entries, missing terms, changed terms and explicit internal-cost uplifts.

Exit: overview, compensation, preview and invoice candidates agree and show their derivation.

### G. Invoices, reports and working project links

Modify: `lib/server/invoice-draft.ts`, billing actions/detail, repository invoice paths, reporting/template packages, time/report navigation and exports.
Tests: existing invoice lifecycle/invariants/artifact/XLSX suites; new `tests/e2e/project-to-invoice-journey.spec.ts`, `tests/e2e/project-report-navigation.spec.ts`.

- [ ] Draft from approved eligible unbilled sources, capturing source/rule snapshots. Group mixed rates without accidental blending; keep configured labor/expense streams separate.
- [ ] Show precise readiness blockers and links. Preserve sign-off policy: draft preparation may be allowed while issuance remains blocked.
- [ ] Enforce idempotency and transactional source reservation against concurrent/double generation.
- [ ] Generate/open actual PDF/CSV/XLSX through normal automatic jobs; independent format failures/retries and truthful statuses.
- [ ] Fix Project → Hours → time detail → report and Project → Reports/Finance/Invoices. Preserve filters, deep links, refresh/back behavior and permissions.
- [ ] Customer reports expose operational data; worker statements expose own pay; finance exports expose authorized reconciliation.

Exit: downloadable invoice/report artifacts match the scenario and issued history remains unchanged after rate edits.

### H. Safe mock/test data cleanup

Updated owner decision on 2026-09-24: after acceptance, make the operational app a clean slate with only the IMPC client and its BBS/IMPC example projects visible; preserve every user and mailbox identity. The current production database also contains numbered DEMO invoices with payments and settled compensation, so preserve an immutable, verified database-and-artifact archive before removing their records from an active clean-slate copy. The prior row-by-row fixture-provenance decision is superseded for nonexample business data.

New: `scripts/audit-business-data-cleanup.ts`, `scripts/apply-business-data-cleanup.ts`, `tests/operations/business-data-cleanup.test.ts`. Use current backup utilities. Mail/provisioning modules are outside write scope.

- [ ] Identify BBS and IMPC by stable IDs and preserve their complete dependency closure: projects, assignments, rates, time, expenses, invoices, payments, reports, artifacts and audit references.
- [ ] Protect **all** users, identity/authentication rows and mailbox mappings, as the owner clarified. Retain the exact BBS/IMPC example roots and their dependencies.
- [ ] Produce an exact dry-run manifest of all other client/project roots and dependency closure, including finalized invoice/payment/settlement artifacts and audit references. The owner has authorized their removal from the active operational copy, but the original history must remain verifiable in the immutable archive.
- [ ] Rehearse a clean active copy from a restored database-and-artifact backup. Remove nonexample business records in dependency order only if all references and protected hashes reconcile; keep the original archive intact and separately readable.
- [ ] Verify rollback, idempotent rerun, foreign keys, protected record hashes/counts, artifacts and restore. Review exact IDs/counts before destructive execution.
- [ ] Switch to the tested active copy only after the exact manifest and rollback evidence pass. Prevent demo seeding in production; keep isolated test fixtures available for tests.
- [ ] Read-only compare mail account mappings/service status before and after. No mailbox deletion/provisioning, password change, DNS/config change, restart or outbound test message.

Exit: nonexample business data is absent from the active operational app, BBS/IMPC and all users/mailboxes remain intact, and the original finalized financial history remains retrievable in a verified archive. The active clean-slate copy must pass database integrity, foreign-key, identity-hash and browser checks before switch-over; no mail-system changes.

### I. Deploy and prove the real workflows

New: separate `playwright.production-acceptance.config.ts`, `tests/production/project-finance.acceptance.ts` and release evidence. Update Client Essential checklist with actual evidence.

- [ ] Run focused suites, then relevant typecheck/build/integration/security/invariants/reporting/migration/restore gates using pinned Node/pnpm. Obtain independent review for financial, authorization, migration and material browser changes.
- [ ] Rehearse the exact release artifact against representative restored data with outbound integrations disabled; check web/jobs compatibility.
- [ ] Record backup, checksum and rollback procedure. Deploy only required app components; leave mail services alone.
- [ ] Verify public origin, image/release identity, migrations and job liveness, then run authenticated acceptance on the actual domain with ordinary roles.
- [ ] Use allowlisted reversible verification records or designated existing drafts. Never run local fixture-reset setup against production.
- [ ] Generate draft/test invoice artifacts in production without sending, issuing official numbers or recording payments. Full issue/credit/payment lifecycle runs in isolated production-like rehearsal unless live business issuance is separately authorized.
- [ ] Assert visible outcomes, persistence after reload and downloaded artifact contents. Missing expected controls/actions fail the test; do not conditionally skip and report success.
- [ ] Recheck logs/jobs after acceptance; report PASS, FAIL, BLOCKED and NOT RUN separately. Retest affected live flows after any release change.

Exit: mandatory deployed scenarios pass on the identified artifact. Until then report “local verification passed; production acceptance incomplete,” not “fixed.”

### J. Put billing setup inside the project and reuse configurations

The owner clarified that a separate “Billing streams” window is too technical for ordinary project setup. Keep stream records as internal invoice-engine inputs, but present one guided **Project → Billing setup** workflow.

- [ ] Choose the commercial model (time and expenses, hourly with selected expenses included, capped time and expenses, fixed/milestone where applicable). Explain which approved hours and expenses become invoice candidates.
- [ ] For time and expenses, default to **one customer invoice** with distinct labor and expense sections and subtotals. Also support an explicit **separate labor and expense invoices** option per project/template, as the owner clarified on 2026-09-24. Keep one source reservation per time/expense row and prevent an overlapping rule from double-billing it.
- [ ] Configure issuer, tax, currency, invoice grouping/layout, cadence, contact/payment terms and explicit cap where applicable. Show missing prerequisites beside the relevant field.
- [ ] Show each assigned person's customer rate, pay and expense-treatment summary with links to fix missing terms. Keep pay private to Finance/owner. A template may prefill defaults but cannot silently override a person's agreement.
- [ ] Review source-based labor and expense preview, exclusions, tax and cadence, then save. Create/update underlying rules transactionally; retries cannot duplicate labor or expense streams.
- [ ] Save a named, versioned reusable billing-configuration template and apply it to another project with explicit review. A new template version affects only later explicit applications; issued invoices remain historical.
- [ ] Move ordinary billing setup entry points and help to the project. Keep the Billing area for invoice lifecycle and advanced finance inspection.
- [ ] Test new/edit/reapply, missing prerequisites, combined and separate T&E choices, included expenses, stale update, double-billing prevention, role privacy, EN/ES/PT and 360/390/768/1440 browser journeys. After deployment configure a QA project from its own page, save/apply a template to another QA project, and generate/download drafts in both modes.

Exit: a project can be configured for invoicing from its own settings without understanding streams, and templates reproduce defaults with visible review.

## 6. Numerical acceptance scenario

Synthetic isolated fixture, EUR, no tax/FX/minimum/overtime in this basic case. Worker pay figures below are test assumptions, not real agreements.

| People | Hours each | Customer hourly rate | Worker hourly pay | Customer labor total | Worker pay total |
|---|---:|---:|---:|---:|---:|
| A–G, seven workers | 8 | €55 | €30 | €3,080 | €1,680 |
| H, one worker | 8 | €70 | €45 | €560 | €360 |
| Total | 64 actual hours | mixed | mixed | €3,640 | €2,040 |

Expenses:

1. A pays €40, reimbursed and billed at cost: worker payable +40, customer expense +40, company expense cost +40.
2. H pays €25 under included/no-reimbursement terms: no worker payable, customer bill or company expense cost in this scenario; informational record retained. A configured allowance would be a separate pay/cost line.
3. Company pays €60 included accommodation: expense cost +60, no worker reimbursement/customer expense line.

Expected invoice candidate €3,680; worker payable €2,080; direct cost €2,140; contribution €1,540, assuming no extra internal-cost uplift. Do not count reimbursement twice as an expense cost. Separate cases cover overhead, allowances and other internal-cost rules.

The explanation UI, invoice preview/PDF, project export and worker statements must reconcile to these figures with role-appropriate visibility.

Further required cases: different hours/person; two projects/person; rate changes mid-period; split entries with daily minimum; mixed pay methods; missing rates; unapproved/already-billed source exclusion; tax/FX/rounding; hard cap; reimbursement independent of recovery; stale draft; concurrent generation; immutable issued history; PDF failure with CSV/XLSX still succeeding.

## 7. Deployed acceptance matrix

| Journey | Required evidence |
|---|---|
| Create without budget/planned end | Real form submit, success, new detail and nulls retained after reload |
| Modify alias/cost center/settings | Save/reload, unrelated values unchanged; invalid inputs retained with explanations |
| Configure mixed worker terms | Save/reload person-specific rates/pay/expense policies and effective-date summary |
| Log duration and interval | Correct person/project and persisted minutes; no invented interval |
| Leader logs team | Different hours/member, actor attribution, membership enforcement, retry without duplicates |
| Add timestamped shift expense | Correct person/project/time/receipt and separate reimbursement/billing treatment |
| Review calculation | Correct source inclusion/exclusion, formulas and configuration blockers |
| Create test draft invoice | Expected sources/rates/totals; repeated action does not double-bill |
| Download artifacts | Normal jobs reach ready; real PDF/export opens and reconciles |
| Follow project/time/report links | Correct scoped route after click, refresh and back; authorized downloads |
| Check roles | Worker/leader/PM restrictions verified in network payloads as well as visible UI |
| Verify cleanup | Protected records/artifacts remain; disposable data absent; mail mappings unchanged |

Run full core desktop journey and representative owner/leader/worker flows at 360/390 phone and 768 tablet. Check labels, errors, keyboard focus, touch targets and dialogs, not only screenshots/overflow. Cover EN/ES/PT changed money/time forms.

Evidence per scenario: timestamp, role, URL, deployed checksum, sanitized request/correlation ID, before/after record references, expected/actual, screenshot/trace, artifact checksum where applicable. Screenshots alone are insufficient.

## 8. Review focus, rollback and decisions

Highest risks and owning tests: blank/omitted/zero (B/D); effective historical rules (C/F/G); partial batch writes/retries (E/G); assignment scope/private pay (C/E); cleanup dependency closure/mail identities (H).

Rollback: retain previous artifact and compatible additive schema. Stop rollout on incorrect money, write failures or privacy regressions. If new live writes occurred, do not blindly restore an old database and lose them: isolate the affected operation and use reviewed forward repair or data-preserving recovery. Complete restore rehearsal before release.

Proposed assumptions for review:

- Confirmed by the user on 23 September 2026: cost-center code is required. Alias, budget and planned end remain optional.
- Duration is the default time-entry mode; actual timestamps are optional.
- Leaders submit only for explicitly delegated project members; approval follows existing separation of duties.
- Planning budgets warn; billing stops only for an explicitly configured hard cap.
- No-reimbursement and no-customer-recovery are separate policies.
- Both expense timestamp and expense entry alongside time are confirmed requirements.

During implementation, resolve exact protected BBS/IMPC IDs and obtain an ordinary authenticated session without exposing credentials in chat. Resolve ambiguous cleanup records through the manifest, not broad deletion rules. These do not block completing this plan.

Completion requires working deployed workflows with evidence. Local tests, healthy containers, page rendering and code presence are supporting checks, not substitutes.
