# WP-B2 / WP-B3 Finance, Billing, and Accounting Pack Semantic Contract

Status: **BLOCKED — R6.3 drafted; fresh Finance + Migration reviews required**

Revision precedence: `wp-b2-r6-architectural-addendum.md` R6.3 fully replaces R6.2 and every
conflicting R5/R6.0/R6.1/B5-r4 finance, migration, durable-job, descriptor and shared-schema
statement. Those older revisions remain historical evidence only. No implementation lease opens
until fresh Finance Integrity and Migration Safety reviewers approve identical recorded R6.3 bytes.
The V3 spec, remediation plan, mandatory backlog and repository `AGENTS.md` remain authoritative.

Date: 2026-08-20

Contract owner: WP-B2 finance/reporting lead (complexity B, Sol medium)

Downstream packets: WP-B3 independent Accounting Pack artifacts; WP-B4 invoice templates/report
catalog; WP-A5 responsive finance UI; WP-T1 Definition-of-Done evidence

### Revision history and precedence

| Revision                      | Date       | State                                              | Summary                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.2 full superseding contract | 2026-08-20 | Blocked pending fresh finance/migration re-reviews | Replaces all conflicting R5/R6.0/R6.1 and named B5-r4 migration/runner semantics with one binding DAG, file-backed runner/CANON contract, prospective finance-v2 truth, typed command/evidence chains, honest fixtures, and explicit proof gates.                                                                                                                                                                                  |
| 6.1 architectural remediation | 2026-08-20 | Blocked pending fresh finance/migration re-reviews | Replaces named R5/R6 runner, metadata, hashing, command, authority, retry, provenance, allocation, direct-cost, period-report, adjustment, responsibility, currency, immutability and fixture semantics.                                                                                                                                                                                                                           |
| 5                             | 2026-08-20 | Ready for independent re-review                    | Closes the finance-integrity round-4 blockers with executable SQLite types, transactional supersession ordering, immutable legacy-report guards, provenance/finality blockers, prospective cutover guards, typed direct-cost origins, persisted step-up/subject/change-event evidence, exact temporal boundaries and stale projection, complete section-66 report mappings, and frozen percentage/minimum/expense-payer semantics. |

| Reviewer finding                                                                                                          | Contract closure                                                                                                                                                                                                                               | Required independent proof                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| SQLite `STRICT` nullability/boolean ambiguity                                                                             | Sections 10, 11, and 14.1 now type every lifecycle flag as `INTEGER NOT NULL CHECK IN (0,1)` and state-dependent evidence as nullable columns guarded by exhaustive state checks.                                                              | Blank/populated migration plus direct-SQL state matrix.                    |
| Classification/principal and pack/settlement supersession could violate partial indexes or briefly select the wrong truth | Sections 5, 8, 10, and 14.1 freeze draft-tail insertion, predecessor-first retirement, successor activation, and postcondition ordering under one `BEGIN IMMEDIATE`; failed/draft tails never replace the one authoritative current/final row. | Concurrent/stale/direct-SQL predecessor, branch, tail, and rollback tests. |
| Finalized `period_report` / `report_source` history mutable                                                               | Section 14 adds finalized-row payload/source/link/delete triggers and immutable correction-only semantics.                                                                                                                                     | Direct update/delete/cascade tests on populated legacy history.            |
| Ambiguous legacy provenance could enter an authoritative pack                                                             | Sections 9, 12, 14, and 15 persist projection authority and exception hashes and make `CLEAN` plus zero blockers mandatory for finality.                                                                                                       | Legacy ambiguity fixtures remain visible but cannot finalize.              |
| Post-cutover evidence remained nullable                                                                                   | Section 14 gives `payment`, `invoice_source`, and `invoice_adjustment` explicit contract-version markers and v2 non-null guards.                                                                                                               | Direct-SQL v2 null rejection and legacy preservation tests.                |
| Direct-cost origin was untyped/non-versioned                                                                              | Sections 4.4 and 14.1 require immutable typed origin event/version/hash, uniqueness, authoritative selection, and explicit unknown legacy actor provenance.                                                                                    | Duplicate/mismatched origin and ambiguous-selection tests.                 |
| Step-up evidence was not reconstructible                                                                                  | Sections 7, 8, 10–12, and 14.1 persist canonical authorization evidence for finalize/regenerate/retry/void/over-credit.                                                                                                                        | Hash mismatch, stale evidence, wrong operation/target and retry tests.     |
| Invoice subject/event integrity incomplete                                                                                | Sections 7 and 14 define immutable invoice subject hash and chained event hashes.                                                                                                                                                              | Event-chain, typed-subject and issued-snapshot mutation tests.             |
| Change-event versions not monotonic                                                                                       | Sections 9 and 14.1 require per-entity contiguous versions and transactional sequence allocation.                                                                                                                                              | Gap/duplicate/out-of-order/direct-SQL and concurrency tests.               |
| Period boundary/reversal semantics incomplete                                                                             | Sections 6 and 9.1 freeze half-open business-date/instant intervals and reversal inclusion by its own effective instant.                                                                                                                       | Month-edge, timezone, DST and late-reversal tests.                         |
| Stale behavior undefined at API/UI                                                                                        | Sections 9.1 and 12 define derived stale reasons/watermark, read projection and regeneration-only action.                                                                                                                                      | Repository/API/browser stale-state tests.                                  |
| Section 66 catalog incomplete                                                                                             | Section 13 maps every mandatory subreport to a stable family/subreport ID.                                                                                                                                                                     | Registry exhaustiveness and authorization/format tests.                    |
| Percentage basis, minimum specificity/entity/currency, and `third_party` payer ambiguous                                  | Sections 4.3, 4.4, 5, and 14.1 freeze the persisted enums, equality checks, tie blocking, and explicit legacy decision path.                                                                                                                   | Exact validation and adversarial tie/mismatch/payer tests.                 |

## 1. Objective and requirements

Provide one executable financial contract for exact billing, payment, reimbursement, ledger, and
Accounting Pack behavior. The contract preserves issued/finalized history and gives bounded Luna
leaves stable interfaces.

Requirement IDs:

- `SPEC-MIG-001`, `SPEC-FIN-001`, `SPEC-HISTORY-001`, `SPEC-REPORT-001`,
  `SPEC-INVOICE-001`
- `AUDIT-ART-001` through `AUDIT-ART-007`, `SEC-STEPUP-001`, `SEC-ART-001`
- `V31-001` through `V31-007`, `V31-017` through `V31-019`
- `DOD-77-04` through `DOD-77-14`, `DOD-77-23` through `DOD-77-27`, and
  `DOD-77-34` through `DOD-77-41`

Authoritative sources: V3 sections 9–24, 67–70, and 77; the completion remediation plan; the
execution plan; the product backlog; the RTM; root/database/reporting `AGENTS.md`; and the
`finance-integrity` skill.

## 2. Current implementation inventory

### Financial domain and façades

- `packages/money/src/index.ts`: integer minor units, `divideRounded` (half away from zero), exact
  ratios/basis points.
- `packages/billing-engine/src/index.ts`: cadence periods, daily-minimum helper, labor/tax/overtime
  calculations, rate specificity.
- `packages/database/src/repository.ts`: billing rules, invoice drafts/issues/adjustments, payments,
  project finance, worker pay, source locks.
- `packages/database/src/v3-repository.ts`: rate resolution, compensation settlements,
  reimbursements, project finance, master ledger, period reports, Accounting Pack snapshot/export,
  durable job execution.
- `packages/database/src/schema.ts`: finance, invoice, payment, job, report, and Accounting Pack
  Drizzle declarations.
- `migrations/0004_v3_completion.sql`, `0005_v3_hardening.sql`,
  `0006_artifact_metadata.sql`, `0007_finance_event_hardening.sql`,
  `0009_draft_source_integrity.sql`, `0010_commercial_schedule_controls.sql`, and
  `0014_commercial_billing_controls.sql`: current persisted finance semantics.

Exact legacy façade seams affected are `repository.ts:createInvoiceDraft`, `issueInvoice`,
`createInvoiceAdjustment`, `recordPayment`, and `voidInvoice`; and
`v3-repository.ts:settleCompensation`, `listCompensationSettlements`, `recordPayment`,
`recordReimbursement`, `voidInvoice`, `createAccountingPack`, `markAccountingPackFinal`,
`accountingPackSnapshot`, `recordAccountingPackExport`, and `accountingPackExport`. They become thin
sequential adapters to the owned domain modules in section 16; their current mutable SQL is not
copied into new modules. `schema.ts` gains parity declarations for the exact 20 additive tables and
existing-table columns/triggers in section 14, while the assigned migration is the SQL authority.

### Reporting, templates, API, and portal

- `packages/reporting/src/artifact-jobs.ts`: shared durable handlers and direct `wx` artifact write.
- `packages/reporting/src/exports.ts`: PDF/XLSX/CSV/JSON renderers.
- `packages/reporting/src/index.ts`: reporting public surface.
- `packages/invoice-templates/src/index.ts`: current single generic HTML renderer.
- `packages/schemas/src/index.ts`: free-text billing `templateId` and Accounting Pack period input.
- `apps/portal/src/lib/server/artifact-jobs.ts`: reporting adapter re-export.
- `apps/portal/src/lib/server/actions/billing-actions.ts`: pack create/finalize/manual-process actions.
- `apps/portal/src/routes/app/[section]/section-load.ts` and
  `apps/portal/src/routes/app/[section]/+page.server.ts`: finance/accounting load wiring.
- `apps/portal/src/lib/PortalShell.svelte`: current finance/accounting/template controls and download
  links; it must not receive new catch-all logic.
- `apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server.ts`: current download endpoint.
- `apps/portal/src/routes/app/billing/invoices/[id]/**`: invoice detail UI.

### Existing tests that must remain strong

- `tests/billing-engine.test.ts`, `tests/billing.test.ts`, `tests/invariants/invoice.test.ts`
- `tests/integration/commercial-billing.test.ts`, `invoice-lifecycle.test.ts`, `v3-finance.test.ts`
- `tests/artifact-jobs.test.ts`, `tests/reporting-artifacts.test.ts`
- `tests/integration/accounting-pack-artifacts.test.ts` and
  `tests/e2e/artifact-lifecycle.spec.ts` (WP-T0 intentional RED contract)

## 3. Non-negotiable domain vocabulary

1. Money is `{ currency, minorUnits: bigint }` in application code and a checked SQLite integer at
   persistence boundaries. Financial totals never use JS `number` arithmetic.
2. A business date is `YYYY-MM-DD` in the named business timezone. An instant is ISO-8601 with
   `Z` or an explicit offset. Offset-free date-times are rejected for new finance writes.
3. `net` excludes captured recoverable tax; `tax` is the captured tax component; `gross = net +
tax`. “Amount” alone is not a valid new persisted accounting semantic.
4. `reimbursement` is money owed/paid to a worker and is independent of customer billing.
5. `client bill amount` is the contractual customer amount and may differ from net cost, gross
   cost, and reimbursement.
6. `contribution` means invoice net revenue less direct project cost. It is never labeled statutory
   net profit.
7. Issued invoices, finalized packs, their snapshots, source manifests, and ready artifacts are
   immutable. Corrections are new credit/debit/replacement documents or new pack revisions. A
   lifecycle marker may supersede a final pack only through the audited transition defined in
   section 10; it never alters the final payload or its artifacts.

## 4. Exact calculation and allocation contract

### 4.1 Rounding boundary

All ratios use integer division rounded half away from zero. However, independently rounding every
split source line is not allowed to change a document total. The authoritative boundary is a
homogeneous calculation bucket:

```text
bucket key = document/revision ID + legal entity ID + project ID + billing stream ID
           + calculation kind + policy scope/key + currency
           + effective rule revision + tax treatment + sign partition
bucket exact numerator = sum(source quantity numerator × effective rate minor)
bucket denominator = common quantity denominator (60 for minutes/hour)
bucket rounded total = divideRounded(exact numerator, denominator)
```

Allocate the rounded bucket total to source lines by largest remainder:

1. Partition positive and negative source numerators into different buckets. A bucket therefore has
   one sign; positive charges and negative credits never cancel before rounding.
2. Work on absolute numerators; remember the bucket sign.
3. Give each source the floor of its exact share.
4. Distribute residual minor units by descending fractional remainder.
5. Break equal remainders by immutable source key `(sourceType, sourceId)` ascending.
6. Restore the bucket sign. Assert allocated line sum equals that signed bucket total and document
   subtotal equals the sum of its signed bucket totals.

No later renderer may recalculate money.

Deterministic split example:

```text
USD rate: 10,000 minor/hour ($100.00)
Three source rows: 1 minute each
Exact bucket: 30,000 / 60 = 500 minor
Per-row floors: 166, 166, 166; residual: 2
Lexicographically first two source IDs receive +1
Final lines: 167, 167, 166; document labor subtotal: 500
```

The current independent `hourlyRateForMinutes` result `167 + 167 + 167 = 501` is not acceptable
for an invoice assembled from those three rows.

### 4.2 Tax and adjustments

- Tax components execute in stored `calculation_order` against the exact configured basis.
- Each component total is rounded once from its document/bucket basis; compounding adds the prior
  component to the next basis only when explicitly configured.
- Allocate component totals to taxable lines using the same largest-remainder rule.
- A credit uses signed negative net/tax/gross and the same symmetric rounding rule.
- `subtotal + sum(tax components) + authorized signed adjustments = total` must hold exactly.
- A cap allocation uses stable source order and must retain original and allocated amounts in each
  line snapshot; it may not overwrite the meaning of `unit_price_minor`.

Tax example:

```text
Net subtotal: 10,005 minor
Tax: 825 bps
Exact: 10,005 × 825 / 10,000 = 825.4125 minor
Tax total: 825 minor
Gross: 10,830 minor
```

### 4.3 Daily minimum and rate selection

Client minimum and worker guarantee remain separate policies and separate calculations.

Every new client-minimum policy must explicitly store:

```text
scope: PER_WORKER_PROJECT_LOCAL_DAY
minimum_minutes
eligible_weekday_mask
eligible_time_categories
top_up_rate_policy: EXPLICIT_RATE | EFFECTIVE_REGULAR_RATE
explicit_rate_minor nullable
currency
effective_from / effective_to
revision / policy hash
```

The only P0 scope is `PER_WORKER_PROJECT_LOCAL_DAY`. `PER_PROJECT_LOCAL_DAY` is rejected at schema,
service, and UI validation until a separately accountant-approved contract defines worker/rate
allocation; it is not accepted and interpreted ad hoc. For each assigned worker and project local
business date, sum eligible approved billable minutes, then add one auditable top-up source for
`max(0, minimum - eligible minutes)`. `EFFECTIVE_REGULAR_RATE` resolves the same assignment /
worker / category specificity for category `regular` on that date. If zero or multiple equally
specific rates remain, readiness is blocked; never select the maximum rate as a hidden fallback.

Rate specificity is a frozen lexicographic rank, not query order: exact worker assignment beats
project-role, which beats project-default; exact `regular` category beats an explicitly declared
all-category rule; within the winning scope the greatest `effective_from <= business_date` wins.
Archived or `effective_to <= business_date` revisions are ineligible. More than one candidate at the
same complete rank is `MINIMUM_RATE_AMBIGUOUS`, and zero is `MINIMUM_RATE_MISSING`. The selected rate,
minimum policy, billing stream, project assignment and source must all reference the same legal
entity revision/hash and identical currency. `client_minimum_policy_revision` and every top-up row
persist that assignment/entity/revision/hash; service and insert triggers reject a mismatch before
money is calculated.

The top-up source is a persisted `billing_minimum_adjustment` row with unique key
`(project_id, worker_id, business_date, billing_stream_id, minimum_policy_revision_id)`. Draft
creation runs in `BEGIN IMMEDIATE`, inserts-or-loads that row, and reserves it through the same
authoritative `invoice_source` uniqueness/source-lock mechanism as time and expenses. The row
snapshots eligible source IDs/versions, actual/minimum/top-up minutes, selected rate revision and
amount. Concurrent/retried draft creation therefore either returns the same idempotent draft or
fails `source_already_reserved`; it cannot create two top-ups.

Example:

```text
Project timezone: America/Chicago; Monday; minimum: 600 min
Worker A actual eligible: 240 min; effective regular client rate: 8,000 minor/hour
Top-up: 360 min × 8,000 / 60 = 48,000 minor
Worker A customer labor: 32,000 actual + 48,000 top-up = 80,000 minor

Worker B actual eligible: 480 min; effective regular client rate: 9,500 minor/hour
Top-up: 120 min × 9,500 / 60 = 19,000 minor
```

Worker compensation uses only its independently configured guarantee. A 10-hour client minimum
does not imply a 10-hour worker guarantee, and vice versa.

### 4.4 Percentage compensation

Eligible labor is the sum of lines attributable to that worker and explicitly marked eligible,
excluding tax, expense, markup, other workers, unrelated fixed fees, and unrelated credits.
Calculate the percentage once per settlement bucket, not independently per time row, then allocate
back to source rows with largest remainder.

```text
Regular: 8h × 8,000 = 64,000
Overtime: 2h × 12,000 = 24,000
Eligible labor: 88,000
55.00% (5,500 bps): 48,400 worker compensation minor
```

The settlement snapshot records `percentage_basis`, percentage basis points, eligible line IDs,
client rate revision IDs, compensation revision ID, trigger, and calculation hash. P0 accepts exactly
`ELIGIBLE_CLIENT_LABOR_NET`; it means signed client labor net before customer tax and excluding
expense, markup, fixed fees, minimums not marked compensation-eligible, unrelated credits and other
workers. The persisted basis must equal the immutable compensation-configuration payload and the
calculation JSON/hash; a missing, unknown or mismatched basis blocks approval/settlement and pack
finality. Estimate/final state follows the configured trigger; changing a current rule never changes
an existing settlement.

Every calculation belongs to an immutable `compensation_settlement_series` scoped by worker,
project, entity, currency and period. Its `compensation_settlement_revision` records the sorted
eligible source-line IDs/versions/hashes, client-rate and compensation configuration revision IDs/
hashes, trigger, eligible amount, percentage basis points, exact allocated amount, entity revision/
hash/timezone, currency, period, as-of/source watermark, calculation algorithm/JSON/hash, actors and
lifecycle.
Approval/settlement freezes the payload. A correction is revision `n+1`; it can supersede an earlier
approved/settled revision only in one audited transaction, never by rewriting it. A settled revision
may not be cancelled or deleted. Pack manifests pin the exact settlement revision/hash.
The correction stores both the immediate `predecessor_revision_id` (the current highest series tail)
and `supersedes_revision_id` (the one currently authoritative approved/settled truth it intends to
replace). A unique non-null predecessor constraint permits one successor per tail, so failed/
cancelled intermediate attempts extend one linear chain without branching. Activation revalidates
that `supersedes_revision_id` is still the authoritative row under `BEGIN IMMEDIATE`; concurrency
cannot replace a stale truth.
Allowed lifecycle transitions are `estimated -> approved -> settled`, `estimated/approved ->
cancelled`, and `approved/settled -> superseded` only while approving/settling a higher correction
revision in the same series. Supersession changes only lifecycle linkage/actor/time; calculation and
approval/settlement evidence remain byte-for-byte unchanged.
An authoritative row may move `approved -> settled` in place only when it has no successor tail;
that transition adds settlement evidence without changing its frozen calculation/approval payload.
Once a successor exists, the older authoritative row cannot advance or cancel; resolve the linear
tail and activate the correction instead.

The existing mutable `compensation_settlement` upsert table becomes a legacy read-only adapter:
database triggers reject update/delete after migration and new writes use the revision tables.
Mechanically provable legacy rows can be preserved as `legacy_observed`; because they lack the exact
eligible-line manifest, rate/configuration revisions and calculation hash, they cannot support a
clean accountant-final pack until an explicit correcting revision supplies those facts.

Internal direct-cost snapshots enumerate source types `time`, `minimum_top_up`, `expense`,
`manual_direct_cost`, and `correction`. Generic unexplained `adjustment`/`other` is forbidden.
`manual_direct_cost` and `correction` require an immutable typed originating event
`(origin_event_type, origin_event_id, origin_event_version, origin_event_hash)`, reason, actor,
entity/currency/configuration snapshot and exact calculation hash. The origin type is exactly
`manual_direct_cost_event` or `direct_cost_correction_event` and must match the source type. One
origin version may identify exactly one internal-cost snapshot; a source ID/version may have only
one authoritative snapshot hash. Native rows require a non-null actor. A mechanically observed
legacy origin may have a null actor only with `provenance='legacy_observed'`,
`origin_actor_provenance='unknown_legacy'`, a mechanically reproduced event/hash, and an explicit
pack exception; it cannot support clean finality until superseded by a native correcting event.
Authoritative selection is by the manifest's exact source ID/version/origin version/hash, never
`MAX(created_at)`, latest row, or current configuration. Compensation is reconciled
from settlement revisions separately and is never silently substituted for internal direct cost.
Their `allocated_amount_minor` is signed: a manual cost addition is positive and a correcting
reduction is negative. Each snapshot also pins project/timezone, effective project-entity assignment,
legal-entity revision/hash/timezone, currency, business date, provenance (`native` or mechanically
provable `legacy_observed`), configuration revision/hash, source payload/hash and calculation hash.
Pack source manifests list these rows as their own `manual_direct_cost` and `correction` categories,
show signed amount, reason and actor/provenance columns, and raise an explicit exception for missing/
ambiguous evidence. They are never hidden in labor or expense totals.

```text
Labor direct cost:                         80,000
Expense direct cost:                       12,000
Signed manual equipment cost:              +5,000
Signed correction of duplicated freight:  -2,000
Total direct cost: 80,000 + 12,000 + 5,000 - 2,000 = 95,000
```

## 5. Expense net/gross, billing, and reimbursement

New expense classification must persist or snapshot:

```text
transaction_currency
project_timezone + legal_entity revision/hash/timezone snapshot
gross_amount_minor
captured_tax_minor
recoverable_tax_minor
payer_treatment: worker_paid | company_paid | client_direct
classified_cost_basis_minor = gross - recoverable_tax
net_direct_cost_minor = classified_cost_basis for worker/company; 0 for client_direct
project_currency (must equal transaction_currency in P0)
customer_invoice_currency (must equal transaction_currency in P0)
customer_billing_basis: GROSS_COST | NET_COST | FIXED_ALLOWANCE | NOT_BILLABLE
markup_bps
fixed_allowance_minor nullable
customer_billing_basis_minor
customer_markup_minor
customer_tax_configuration_revision_id nullable for NOT_BILLABLE only
customer_invoice_net_minor
customer_tax_components_json/hash
customer_tax_minor
customer_invoice_gross_minor
reimbursable_principal_minor
classification revision/hash + approver/approved_at
```

Rules:

- A worker-paid expense reimbursement principal is the approved gross cash outlay (or an explicit
  approved lower eligible principal), never the customer markup.
- Enforce `0 <= captured_tax <= gross`, `0 <= recoverable_tax <= captured_tax`,
  `classified_cost_basis = gross - recoverable_tax`, and non-negative persisted cost/billing
  principals. `worker_paid` sets J&A direct cost to the classified basis and permits reimbursement
  `0..gross`; `company_paid` sets the same J&A direct cost and requires reimbursement principal zero;
  `client_direct` requires J&A direct cost, reimbursement principal and customer invoice amounts all
  zero with basis `NOT_BILLABLE` because the client paid the supplier directly. Payer treatment is
  required and snapshotted; nullable/unknown/defaulted legacy values remain `BLOCKED-FIN-002`.
  The legacy/API value `third_party` is not a fourth financial treatment and is rejected for every
  prospective v2 classification. It is never silently mapped to `client_direct`: Finance must record
  an explicit prospective classification decision identifying whether the third party was the
  client (`client_direct`), J&A (`company_paid`), or the worker (`worker_paid`), with actor/reason and
  immutable evidence. Until then it remains `legacy_unspecified` with
  `EXPENSE_PAYER_AMBIGUOUS_THIRD_PARTY` and blocks authoritative pack finality.
  Currency codes must be supported ISO-4217 codes with the configured exponent; values are checked
  integer minor units within SQLite safe range.
- Direct project cost is gross less recoverable tax; if tax is not recoverable, net direct cost is
  gross.
- `NET_COST` means `gross_amount_minor - recoverable_tax_minor`, not receipt subtotal before all
  tax. Therefore, when captured tax is wholly nonrecoverable, `recoverable_tax_minor=0` and
  `NET_COST` equals gross. Partially recoverable tax reduces the basis only by the recoverable part.
- “Reimbursable at cost” still requires an explicit customer basis. It does not silently decide
  whether the contract reimburses net or gross.
- Markup applies once to the selected customer basis and is rounded once. It does not change direct
  cost or worker reimbursement.
- `FIXED_ALLOWANCE` requires `fixed_allowance_minor`, ignores cost as its customer calculation
  basis, and still snapshots actual cost independently. Other bases reject that field.
- Customer invoice calculation order is fixed: (1) choose receipt-cost basis `NET_COST` or
  `GROSS_COST` (or the fixed allowance), (2) calculate/round contractual markup once on that basis,
  (3) add markup to form customer invoice net/subtotal, then (4) calculate customer tax components
  on that subtotal under the billing stream's tax revision. Captured supplier/receipt tax is cost
  classification evidence and is never reused as customer output tax. Tax is not marked up again.
- Every billable basis (`NET_COST`, `GROSS_COST`, `FIXED_ALLOWANCE`) requires a valid immutable
  customer-tax configuration revision, including an explicit zero-tax profile when tax is zero.
  Only `NOT_BILLABLE` may have a null customer-tax configuration.
- P0 rejects cross-currency expense approval, reimbursement, customer billing and pack inclusion:
  transaction currency, project currency, customer invoice currency and pack currency must match.
  No current/global/default FX, reciprocal inference or manual decimal rate is accepted. Historical
  FX snapshots/conversion direction (transaction amount × quote/base ratio), currency exponents and
  conversion rounding belong to `V33-034`/WP-B9 and require a later additive contract; B2 creates no
  FX table or converted amount fields.
- All-in/internal expenses affect direct cost but never enter a customer invoice.
- Client-direct expenses affect neither J&A cost nor reimbursement unless an explicit adjustment
  says otherwise. Such an adjustment is a separate signed `manual_direct_cost`/`correction` event;
  it never reclassifies or mutates the client-direct expense.

Examples:

```text
Hotel receipt gross: 12,345; captured/recoverable tax: 2,345
Direct cost: 10,000; worker reimbursement principal: 12,345
Contract customer basis GROSS_COST, no markup: customer bill 12,345

Rental gross/net: 10,000; customer basis GROSS_COST; markup 1,000 bps
Markup: 1,000; customer bill: 11,000; direct cost/reimbursement: 10,000

Adversarial GROSS basis: receipt net 10,000 + supplier tax 2,345 = gross basis 12,345
Markup 1,000 bps: 1,235; customer invoice net: 13,580
Customer tax 825 bps: 1,120; customer invoice gross: 14,700

Adversarial NET basis: receipt net basis 10,000; markup 1,000 bps: 1,000
Customer invoice net: 11,000; customer tax 825 bps: 908; invoice gross: 11,908

All-in flight gross 50,000 with no recoverable tax
Direct cost: 50,000; customer bill: 0; contribution decreases by 50,000
```

### Authoritative classification revision

An expense has one classification series and exactly one authoritative `current` approved revision
once any approval exists. A correction is first inserted as immutable-payload `draft` revision
`n+1` with `predecessor_classification_id` naming the immediate linear tail and
`supersedes_classification_id` naming the current truth it intends to replace; `draft`/`failed` tail rows are not authoritative and do not
participate in the partial unique current index. Approval runs under `BEGIN IMMEDIATE`, checks expense
version/approval state, entity/currency, tax config and classification request idempotency/hash. In
this exact order it (1) proves the proposed row is the highest single-successor tail and valid draft,
(2) inserts immutable approval/change/idempotency evidence, and (3) executes the single activation
statement `UPDATE successor SET lifecycle='current', ... WHERE lifecycle='draft'`. A `BEFORE UPDATE`
activation trigger validates the evidence and updates the linked predecessor `current -> superseded`
with successor/actor/reason/time before SQLite applies `current` to the successor; an `AFTER UPDATE`
trigger asserts exactly one current row. Both trigger work and the outer update are one atomic SQLite
statement, so the partial unique current index never sees two current rows and rollback restores the
predecessor if activation fails. The partial index prevents two authoritative rows; the unique
predecessor index prevents branching. Direct SQL cannot activate a successor without the coordinated
predecessor linkage/event/request evidence. Approved payload/hash never changes.
For the first approval, both predecessor and supersedes links are null and the activation trigger
requires that the series contain no current row or older tail; it then activates without a retirement
write. Every later activation requires both links and the checks above.
The correction's immediate predecessor must be the highest revision tail under `BEGIN IMMEDIATE`,
and its supersedes target must still be the current authoritative revision at activation. A unique
non-null immediate-predecessor constraint permits one successor only. Concurrent or stale-base approvals
cannot both win or create branches. Issued invoice, pack, reimbursement-principal and direct-cost
snapshots retain the exact classification revision/hash they used. If reimbursement/payment history
would be invalidated, classification approval is blocked until the explicit immutable correction/
reversal workflow resolves it; no history is moved to the new revision.

### Partial reimbursement

Approval first creates an immutable reimbursement-principal revision. Reimbursements are immutable
events pinned to that revision, never an overwrite on `expense`:

```text
expense_reimbursement_principal_revision(
  id, expense_id, principal_revision, lifecycle,
  expense_version, classification_id/hash,
  principal_amount_minor, currency,
  project_legal_entity_assignment_id, legal_entity_revision_id/hash/timezone,
  payer_provenance, principal_snapshot_json/hash,
  approved_by/at, predecessor_principal_revision_id,
  supersedes_principal_revision_id, superseded_by/at,
  idempotency_key UNIQUE, request_hash, created_at
)

expense_reimbursement_event(
  id, expense_id, principal_revision_id, principal_revision_number,
  principal_snapshot_hash, principal_amount_minor, amount_minor, currency, paid_at, reference,
  idempotency_key UNIQUE, request_hash, actor_id, created_at,
  reversal_of_event_id nullable UNIQUE, reason nullable
)
```

There is exactly one `current` approved principal per expense once a principal approval exists.
Creation runs under `BEGIN IMMEDIATE`, pins the authoritative approved classification revision/hash,
expense version, payer provenance, legal-entity assignment/revision/hash/timezone, amount/currency
and a canonical snapshot hash, and wins a partial unique current constraint. A correction is inserted
as a non-authoritative `draft` tail. After proving currency unchanged and new principal is not below
signed paid-to-date, the same transaction uses the classification activation statement/trigger
ordering above: validate the single-successor highest tail, persist evidence, and activate the
successor; its trigger retires the predecessor before the partial current index is checked. A rejected
attempt may be marked `failed` with immutable failure evidence but remains the tail until an audited
successor is created; it never displaces the current principal. Earlier events remain pinned to
their original principal. Concurrent approvals cannot both become current.
Principal payload, approvals and hashes are immutable; only the audited one-way lifecycle projection
`current -> superseded` may change.
The immediate predecessor must be the highest principal revision tail under `BEGIN IMMEDIATE`; the
separate supersedes target must still be the current authoritative principal at activation. A unique
non-null immediate-predecessor constraint rejects a second successor or correction from an older
tail while allowing an immutable failed attempt to be followed by one new draft.

The event request hash covers expense, principal revision ID/hash, signed amount, currency, paid
instant, reference, and reversal target. Reusing a key with a different hash is a conflict. Insert
triggers verify that the principal exists, belongs to the expense, its copied version/hash/amount
match exactly, and currency equals its immutable approved currency. Derived paid is the signed sum
of all immutable payment and linked reversal events across that expense's pinned principal history:
`pending` when paid=0, `partially_reimbursed` when `0 < paid < current principal`, and `reimbursed`
when paid=current principal. Negative or excessive derived paid is rejected. A reversal must exactly
negate one unreversed event, use the same principal revision/currency, link it once, require step-up
and a non-empty reason, and cannot itself be reversed (a new correcting payment is used). Events are
never updated/deleted. The expense row may cache derived state/paid amount only under
transactionally maintained triggers/service writes; events remain authoritative.

A new positive reimbursement must reference the current principal revision. A reversal remains
pinned to the original payment's principal even if that principal was later superseded; this is the
only new event allowed against a superseded principal.

Every reimbursement event currency must exactly equal the immutable approved source principal
currency. Cross-currency reimbursement is rejected; it requires a separately approved FX/cash
event contract and cannot infer or reuse any current/project reporting rate implicitly.

For period inclusion, convert `paid_at` to a business date using the IANA legal-entity timezone
pinned on the referenced principal revision. Never use the expense/project/current entity/global
timezone for a reimbursement event.

```text
Principal: 12,345
Event A: 5,000 => partially_reimbursed; outstanding 7,345
Retry A with same key/payload => same event, no duplicate
Event B: 7,345 => reimbursed; outstanding 0
Event C: 1 => rejected as overpayment
```

## 6. Legal entity, currency, timezone, and period boundaries

### 6.1 Legal entity and currency

- Every new invoice and pack revision has exactly one legal entity and one currency.
- A pack never converts or sums currencies. Generate separate series/revisions per currency.
- Invoice/payment/credit rows join through immutable invoice fields and snapshot: legal entity ID,
  legal name/address/tax identifiers, entity currency, invoice transaction currency, timezone IANA
  name, issue-time UTC offset, numbering policy revision, billing stream/config revision, tax
  revision, template revision/hash, client/project billing snapshots, source manifest/hash, and
  calculation/hash. These values are persisted at issue and protected by the issued-invoice
  immutability trigger; ledger reconstruction never joins mutable current entity/config rows.
- Direct costs join through an effective-dated `project_legal_entity_assignment` with inclusive
  `effective_from`, exclusive `effective_to`, revision/hash, actor and reason. A database trigger
  rejects overlapping ranges for a project. The source snapshots assignment ID/hash and project
  timezone. If invoice legal entity, billing-stream legal entity, source assignment legal entity,
  or currency disagree, readiness/issue/finalization fails with a typed integrity exception.
- If a project has no unambiguous effective legal entity for a source date, the row is an integrity
  exception and finalization is blocked. Do not infer from “any current billing rule.”
- Invoice and payment currency mismatch is rejected. FX requires a later explicit historical FX
  snapshot contract; current P0 does not invent a rate.

### 6.2 Calendar ownership

- Accounting month boundaries are calendar dates in the explicit IANA timezone of the selected
  immutable legal-entity revision. Missing/invalid timezone blocks configuration and pack creation;
  there is no global/default/browser/UTC fallback.
- Invoice inclusion uses `issued_at` instant converted to that legal-entity timezone.
- Payment inclusion uses `received_at` instant converted to that legal-entity timezone.
- Time uses stored `work_date` in the source's snapshotted project timezone.
- Expense uses stored `spent_on`/`expense_date` in the source's snapshotted project timezone.
- A date-only operational source is not shifted across dates after capture.

All period contracts are half-open. A date period stores `period_start` inclusive and `period_end`
exclusive; a monthly September period is `[2026-09-01, 2026-10-01)`. An instant cut is
`occurred_at <= source_cut_at` for the frozen transaction watermark, while membership in the period
is `period_start <= business_date < period_end` after conversion in the explicitly pinned timezone.
No API accepts an ambiguous inclusive `to` date: a human inclusive end date is normalized once to
the next exclusive calendar date and that normalized pair is hashed. Reversal events take effect at
their own reversal instant/business date; they do not rewrite the target payment's receipt period.

Boundary example:

```text
Legal entity timezone: Europe/Madrid
Invoice issued: 2026-08-31T22:30:00Z = 2026-09-01 00:30 local
Accounting month: September, not August

Project timezone: America/Los_Angeles
Time work_date: 2026-08-31
Operational cost month: August; the date-only business record is not UTC-shifted
```

Reject DST-invalid local date-times for new records. Repeated-hour instants require an explicit
offset. The stored snapshot includes timezone name and offset used.

## 7. Payments, credits, AR, and ledger reconstruction

- Payment writes remain positive immutable events with a unique idempotency key, canonical request
  hash, received instant, currency, reference, recorded actor and created instant. Reusing the key
  with different invoice/amount/currency/received/reference is a conflict. Record under
  `BEGIN IMMEDIATE`; recompute signed invoice balance in-transaction and reject a payment greater
  than positive outstanding balance. Partial payments update derived invoice state only.
- A payment correction is a full immutable `invoice_payment_reversal_event`, never an update or a
  negative `payment`. In one `BEGIN IMMEDIATE` transaction the service locks the invoice/payment,
  verifies the target is an unreversed positive payment, and inserts exactly its negation with the
  same invoice, legal-entity revision/hash and currency. It requires Owner step-up, non-empty reason,
  actor, instant, unique idempotency key and canonical request hash. Unique target-payment ownership
  permits one reversal; the target FK points only to `payment`, so reversal-of-reversal and partial
  reversal are impossible. Same key/same hash returns the existing reversal; a different hash or
  second target claim conflicts. The transaction appends linked invoice/finance-change events and
  recomputes the active balance/state. It never deletes or modifies the payment.
  The canonical request hash covers target payment ID, invoice ID, legal-entity revision ID/hash,
  exact signed amount, currency, reversal instant, reason, acting user and step-up instant.
- Credit/debit/correction documents are new invoices linked to the original. They inherit legal
  entity/currency, snapshot their own signed lines/tax, reason, approving actor, original document
  identity/hash, and receive their own issued artifact. Credit/debit creation and issue have unique
  idempotency keys/request hashes; source/link uniqueness prevents duplicate adjustments.
- Credits appear as signed negative net/tax/gross in invoice register and Revenue. They never mutate
  the original invoice.
- A credit may exceed the original's current positive balance only through an explicitly authorized
  customer-credit/refund workflow with Owner step-up and reason. Otherwise reject it. A credit is
  never represented as a negative payment.
- A credit issued against a prior-period invoice is a signed document in its own issue-period
  register and, from its issue instant, reduces the linked original's active AR. Apply it first to
  that original's positive outstanding balance. Any separately authorized excess becomes a labeled
  client credit balance; P0 never silently reallocates it to another invoice. Later payments against
  the original cannot exceed the remaining positive balance. Reversing a payment restores that
  payment amount to the original's active AR as of the reversal instant.
- Voiding is allowed only for an unpaid eligible issued invoice. If payments or applied credits
  exist, require their immutable reversal/correction workflow first. Void is an immutable event
  with idempotency request hash, Owner step-up, actor, reason and instant; it preserves the issued
  snapshot/artifact and contributes zero active AR/revenue only according to the explicit ledger
  event projection. A void cannot silently unlock/rebill sources.

Every step-up-gated finance command (`accounting_pack_finalize`, `accounting_pack_regenerate`,
`artifact_retry`, `invoice_void`, `payment_reversal`, `reimbursement_reversal`, and
`over_credit_authorize`) persists the same canonical authorization-evidence shape in the
`finance_idempotency_record` and hashes that evidence into the command request:

```text
authorization_evidence_version = finance-step-up-v1
principal_id, tenant_id, role_at_decision
authentication_session_id_hash, step_up_method
authenticated_at, verified_at, expires_at
policy_revision_id, policy_hash
operation, target_type, target_id, requested_amount_minor/currency nullable
authorization_evidence_hash
```

Raw session/token/credential material is never stored. The verified principal/tenant/operation/
target must equal the command and `verified_at <= command_at < expires_at`; evidence reuse for a
different operation, target or amount conflicts. The target event/revision/artifact transition links
the idempotency key and evidence hash. Same key/same request/evidence returns the same result; changed
evidence or payload conflicts. A database trigger rejects a gated transition without the matching
immutable evidence record, so direct SQL cannot bypass step-up.

- AR for a scope is `sum(active-ledger signed issued gross) - sum(active applied payments)`. The
  active-ledger projection is reconstructed from immutable issue/credit/debit/void/payment/reversal
  events as of the source cut: an unpaid voided invoice contributes zero gross and zero AR after its
  void instant while its original issued snapshot remains in the audit register; non-void issued
  documents contribute signed gross; reversed payments do not remain applied. Do not use a raw sum
  of all issued rows and do not delete voided rows. Do not clamp below zero; a negative result is a
  customer credit balance and must be labeled.
- Month-end AR is an independent as-of dataset, not the month's invoice register. At
  `source_cut_at`, include every non-void active invoice issued on or before the cut for the selected
  entity/currency, including prior-period open invoices, and project every payment, payment reversal,
  credit/debit application and void visible by that cut. The period invoice register remains limited
  to documents issued in the selected period. The AR schedule records invoice-level opening gross,
  each visible signed ledger event and resulting balance; it therefore exposes prior-period payment
  and credit history without moving those events into the current-period register.
- Contribution uses signed invoice net, never gross/tax.

Example:

```text
Original issued gross: 100,000
Partial payment: 40,000
Issued credit gross: -25,000
Net AR: 100,000 - 25,000 - 40,000 = 35,000

Unpaid invoice issued gross 60,000; payments 0; later valid void event
Active-ledger gross after void: 0; active payments: 0; AR: 0
Audit invoice register still shows the 60,000 issued document and its void event/status

Paid invoice gross 60,000; payment 60,000 => AR 0
Exact reversal -60,000 => active payment 0; AR restored to 60,000
Void remains rejected until that reversal is committed; after reversal, eligible void => AR 0
```

Historical ledger reconstruction reads immutable invoice/payment/credit snapshots and source
manifests. Internal labor/direct cost reconstruction reads snapshotted effective internal-cost rule
revision, rate/method/currency, source minutes/date/project assignment, exact allocated amount and
calculation hash captured at approval/settlement or source cut. It never re-resolves today's
rate/tax/template/entity/internal-cost configuration.

### Invoice draft/issue idempotency and locks

- Draft request idempotency key is
  `invoice-draft:{billingStreamId}:{periodStart}:{periodEnd}:{policyRevision}:{selectionHash}`.
  Store its canonical request hash. Same key/same hash returns the same draft; different hash is a
  conflict.
- Draft creation and all authoritative `invoice_source` reservations occur in one
  `BEGIN IMMEDIATE` transaction. Unique `(source_type, source_id)` plus persisted source version,
  lock owner and lock instant prevent concurrent or retry duplication.
- Issue request has its own unique idempotency key/request hash. In one transaction it rechecks
  source ownership/version/status, configuration manifest, legal entity/currency, reconciliation,
  allocates the final number once, writes immutable invoice/config/source/calculation snapshots,
  changes state, and enqueues artifact/outbox records. A retry returns that issued invoice and never
  allocates another number.
- Before issue, compute `invoice_subject_hash = SHA256(canonical(invoice identity, legal-entity and
customer/project snapshots, signed line/source/configuration manifests, calculation hash,
template revision/content hash, currency and period))`. It excludes mutable lifecycle projection
  fields. Every v2 invoice event stores that subject hash, `previous_event_hash` (the prior event hash
  or 64 zeroes for the first event), and
  `event_hash = SHA256(canonical(invoice_id, event_contract_version, event_type, typed subject ID,
amount/currency, actor, occurred_at, request_hash, invoice_subject_hash, previous_event_hash))`.
  Event sequence is allocated under the same invoice `BEGIN IMMEDIATE`; a unique
  `(invoice_id,event_sequence)` and predecessor/hash trigger reject gaps, forks, wrong subjects or
  subject mutation. Issued invoice subject hash and all event-chain columns are immutable.
- Abandoned draft locks release only through an audited explicit draft cancel/archive transition
  after dependency checks. Issued/credited/voided source locks remain historical and are never
  released for rebilling; correction documents are used.

## 8. Configuration versioning and invalidation

1. Rate, compensation, internal cost, tax, daily-minimum, billing-stream, invoice-number,
   legal-entity, and template configuration changes create a new effective-dated revision. A
   revision referenced by an invoice, settlement, finalized report, or pack cannot be updated or
   deleted. The sole payload-adjacent update exception is an audited `effective_to: null -> bound`
   close performed in the same `BEGIN IMMEDIATE` transaction that inserts its non-overlapping
   successor, after proving no referenced source falls on/after the bound. The trigger permits only
   that field and one transition; it cannot change a referenced calculation or historical lookup.
2. Draft invoices store a configuration manifest/hash. Issue rechecks source versions and resolves
   the same effective revisions. A mismatch marks the draft `stale`/`needs_recalculation`; it is not
   silently refreshed during issue.
3. Pack revisions store a configuration manifest/hash. A later configuration/source correction
   marks the prior result stale and creates a replacement revision; only finalizing that replacement
   transitions the older final revision to `superseded` under section 10, without altering it.
4. Issued invoice snapshots remain authoritative even if the underlying configuration is archived.
5. A final pack cannot be refreshed. “Regenerate” always creates revision `n+1`.

Initial pack creation and regeneration are distinct idempotent commands:

- initial key: `accounting-pack-create:{legalEntityId}:{currency}:{periodStart}:{periodEnd}:{callerKey}`;
- regeneration key:
  `accounting-pack-regenerate:{seriesId}:{predecessorRevisionId}:{callerKey}`.

Each command persists a canonical request hash. Initial hash includes financial scope plus requested
presentation locale; same key/same hash returns the same initial revision, while a different hash is
a conflict. The financial-series unique constraint and `BEGIN IMMEDIATE` guarantee one series and
one revision number 1. If that series already has its initial revision, a different initial-create
key returns `PACK_SERIES_EXISTS_USE_REGENERATE`; it never returns or creates a silently refreshed
snapshot. Regeneration requires the predecessor, locks the series, allocates the next
number exactly once, and stores `creation_kind='regenerate'`; same regeneration key/hash returns the
same successor. An initial-create key can never be accepted as a regeneration key or vice versa.
Changing presentation locale after creation is a new revision/render request, not a second financial
series.

Regeneration is permitted only from the current series tail: under `BEGIN IMMEDIATE`,
`predecessor_revision_id` must be the highest revision number and have no successor, while
`supersedes_revision_id` separately identifies the current final truth intended for replacement (or
is null when none exists). A unique non-null predecessor constraint
allows at most one successor. Same idempotency key/hash returns that successor; a concurrent or later
different request receives `PACK_PREDECESSOR_NOT_CURRENT` and cannot branch from an older revision.
Failed/draft successors remain the tail and must be completed or explicitly superseded by their own
single successor; callers cannot bypass them by branching from their predecessor.

Every issued invoice snapshot must concretely embed the legal-entity/numbering/timezone fields from
section 6, billing stream/cadence/grouping/PO/payment terms, template ID/version/content hash,
client/project/bill-to snapshots, every tax component revision/basis/order/rate, every labor/minimum/
expense/fixed/adjustment line's source ID/version and effective rate/classification revision, signed
allocated net/tax/gross totals, calculation algorithm version/hash, issue actor/instant, and source
lock manifest/hash. A configuration manifest made only of mutable foreign keys is insufficient.

## 9. Consistent reconciliation source cut

Create each pack revision in one `BEGIN IMMEDIATE` transaction:

1. Validate actor, recent step-up, legal entity, currency, calendar period, and explicit project
   entity assignments.
2. Capture `source_cut_at` (the transaction's UTC instant) and `source_watermark =
COALESCE(MAX(finance_change_event.sequence),0)` visible inside the transaction. Every in-scope source/config/
   payment/reimbursement/invoice/artifact-integrity writer appends one immutable event in its write
   transaction with entity type/ID/version, occurred instant and payload hash; `sequence` is an
   SQLite `INTEGER PRIMARY KEY` monotonic commit-visible watermark. A writer holds `BEGIN IMMEDIATE`,
   reads `next_entity_version = COALESCE(MAX(entity_version),0)+1` for its exact
   `(entity_type,entity_id)`, inserts that version and lets SQLite allocate the positive rowid
   sequence. Insert triggers reject any entity-version gap, duplicate or regression and require the
   referenced source/config row to expose the same immutable version/hash. Application-supplied
   sequence values are forbidden. Thus committed sequences are strictly increasing database-wide
   and entity versions are contiguous from 1; a rolled-back allocation creates neither event nor
   visible version. Both cut values are stored.
   Watermark `0` is valid only when the transaction sees no finance-change rows and the selected
   scope has no manifested or excluded finance source/configuration versions. Any non-empty scope at
   watermark 0, or any manifested/excluded version without exactly one covered event at or below the
   watermark, blocks authoritative creation rather than falling back to unrelated `updated_at` maxima.
   Baseline migration emits exactly one event for each mechanically provable legacy
   `(entity_type,entity_id,entity_version)` with `provenance='legacy_observed'`, its observed payload
   hash and null actor where unknown. A unique constraint prevents duplicate version events.
   Ambiguous rows receive no invented clean event: an integrity exception identifies the row and
   blocks accountant-final status until an immutable prospective decision/correction produces a
   native event. Source-cut coverage requires every manifested version to have exactly one native or
   mechanically provable legacy-observed event at or below the watermark.
3. Select the complete source set inside that same transaction using the inclusion rules below.
4. Build a canonical, sorted source manifest containing source type, ID, version, authoritative
   business date/instant, pinned project timezone, currency, legal entity, signed amount(s), and
   source snapshot hash. Sources without a project dimension use an explicit null project/timezone,
   never a fallback.
5. Capture referenced configuration revision IDs/hashes and issued-invoice PDF ID/hash.
6. Calculate snapshot and reconciliation exclusively from the manifest.
7. Persist manifest JSON/hash, configuration manifest/hash, snapshot/hash, reconciliation JSON/hash,
   and five queued artifact rows atomically; enqueue five format jobs atomically.

Canonical JSON uses UTF-8, sorted object keys, stable array sort keys, decimal strings for integer
money, and no locale-dependent formatting. Hash is SHA-256 of canonical bytes.

Required reconciliation checks by currency:

```text
invoice register signed net/tax/gross == manifested issued invoice snapshots
payments == manifested immutable payment rows
active AR == active-ledger post-void signed gross - active applied payments
worker compensation == manifested settlement/source calculation snapshots
expense direct costs == manifested approved expense financial classifications
manual/correction direct costs == manifested signed immutable direct-cost snapshots
direct cost == labor direct cost + expense direct cost + signed manual/correction direct costs
contribution == signed invoice net - direct cost
all referenced issued invoice PDFs exist and match stored hash/size
```

Every revision persists `authority_state` (`CLEAN` or `BLOCKED`),
`integrity_exceptions_json/hash`, and `integrity_exception_count`. Each exception has a closed code,
source type/ID/version, provenance (`native`, `legacy_observed`, or `legacy_unspecified`), affected
projection(s), expected/observed hashes when known, and remediation. The source manifest includes
the same exception IDs/hashes. Any mismatch or ambiguous provenance creates a draft revision with
`authority_state='BLOCKED'`; a finalization trigger requires `CLEAN`, count zero, reconciliation PASS,
and exact manifest/exception-hash agreement. A renderer may show blocked figures explicitly but no
API, export or UI may label them authoritative/accountant-final.

The P0 integrity-exception code set is closed:

```text
LEGACY_DAILY_MINIMUM_SEMANTICS_UNKNOWN
LEGACY_EXPENSE_AMOUNT_BASIS_UNKNOWN
LEGACY_EXPENSE_TAX_RECOVERY_UNKNOWN
LEGACY_EXPENSE_BILLING_TREATMENT_UNKNOWN
EXPENSE_PAYER_AMBIGUOUS_THIRD_PARTY
LEGACY_FX_PROVENANCE_UNKNOWN
LEGACY_COMPENSATION_ELIGIBLE_MANIFEST_MISSING
DIRECT_COST_ORIGIN_ACTOR_UNKNOWN_LEGACY
CONFIGURATION_REVISION_OR_HASH_MISSING
SOURCE_VERSION_OR_HASH_MISSING
FINANCE_CHANGE_EVENT_MISSING
FINANCE_CHANGE_EVENT_HASH_MISMATCH
PERIOD_REPORT_FINALITY_OR_SOURCE_HASH_UNKNOWN
LEGAL_ENTITY_OR_CURRENCY_SCOPE_MISMATCH
RECONCILIATION_MISMATCH
REQUIRED_ISSUED_PDF_MISSING_OR_INVALID
```

Unknown exception strings are rejected; adding a code is a versioned contract/migration change.

### 9.1 Precise source inclusion and staleness

For the selected legal entity, currency, and legal-entity-local calendar month:

- Invoice register/Revenue: issued, sent, partially paid, paid, overdue, credited/adjustment
  documents whose immutable `issued_at` local date is in the month. Voids are included as separate
  status/event evidence and projected from the void instant: an eligible unpaid void contributes
  zero to active revenue/AR thereafter but retains its original signed issue amount in the audit
  register; it is not deleted. Draft/approved-unissued invoices are excluded from issued revenue
  and separately listed as WIP exceptions when relevant.
- Collections: immutable positive payment events whose `received_at` local date is in the month and
  whose invoice snapshot matches entity/currency. A payment reversal belongs to the collection period
  containing its own `reversed_at` local business date and contributes its exact negative amount from
  that instant; it never removes the original payment from its historical receipt period.
  Total-collected-to-date uses all payment and reversal events visible at the source cut, never
  events committed later. Period membership always uses the half-open boundaries in section 6.2.
- AR schedule: independently includes all active invoices issued on/before `source_cut_at`, even
  when issued before the selected month, plus all linked payments, payment reversals, credit/debit
  applications and voids visible at that cut. Period-issued register membership never limits AR.
- Labor/direct costs: approved/locked time whose project-local `work_date` is in the month, with an
  unambiguous effective entity assignment and snapshotted internal-cost/compensation calculation.
- Other direct project costs: signed immutable `manual_direct_cost` and `correction` snapshots whose
  business date in their pinned project timezone is in the month. Each requires the exact originating
  event/version, reason, actor or mechanically provable provenance, entity/configuration/source/
  calculation hashes and currency. Missing evidence is an exception that blocks finalization;
  unexplained `adjustment`/`other` rows are never included.
- Expenses: approved/locked expense whose project-local business date is in the month and whose
  explicit financial classification/entity/currency snapshot is authoritative. Customer billing,
  direct cost and reimbursement are separate columns/projections.
- Reimbursements: immutable reimbursement events whose paid instant, converted in the IANA timezone
  pinned by their principal revision's legal-entity snapshot, is in the month; expense principal/
  outstanding comes from the source-cut event projection. Do not use the expense date, project
  timezone, current entity timezone or a global fallback as reimbursement payment date.
- Credits/debits: included by their own issued instant and signed document amounts; their original
  invoice may belong to an earlier month.

The revision source manifest stores all included IDs/versions/hashes and explicitly records each
excluded integrity exception. Staleness is a read projection computed against the current
`finance_change_event` watermark, never a revision-state mutation:

```ts
type PackFreshness =
  | { state: 'current'; revisionWatermark: bigint; currentWatermark: bigint }
  | {
      state: 'stale';
      revisionWatermark: bigint;
      currentWatermark: bigint;
      reasonCodes: Array<
        | 'SOURCE_CHANGED'
        | 'CONFIG_CHANGED'
        | 'LEDGER_EVENT_ADDED'
        | 'INTEGRITY_INCIDENT_OPENED'
        | 'PROVENANCE_DECISION_ADDED'
      >;
      changedEntityCount: number;
      regenerateAllowed: boolean;
    };
```

The repository derives reasons only from change/integrity events after the revision watermark that
match its frozen scope/manifest dependencies. API responses expose this object for every revision;
list/detail UI shows `Current` or `Stale since watermark …`, reason labels, and an authorized
Regenerate action. It never changes immutable payload/artifacts, disables historical downloads, or
calls a stale final pack current. Regenerate creates a new revision. When that newer revision is
finalized, the prior revision may transition `final -> superseded` under section 10 while retaining
its immutable finalization evidence, payload and artifacts.

## 10. Immutable Accounting Pack revision schema contract

Use additive tables; do not rebuild or repurpose existing `accounting_pack_run` /
`accounting_pack_export` in place:

```text
accounting_pack_series
  id, period_start, period_end,
  legal_entity_id, legal_entity_revision_id/hash,
  legal_entity_code, legal_entity_currency, legal_entity_timezone,
  currency, created_at,
  UNIQUE(period_start, period_end, legal_entity_id, currency)

accounting_pack_revision
  id, series_id, revision_number, state, presentation_locale,
  legal_entity_id, legal_entity_revision_id/hash,
  legal_entity_code, legal_entity_currency, legal_entity_timezone, currency,
  period_start, period_end, creation_kind, creation_idempotency_key, request_hash,
  predecessor_revision_id, supersedes_revision_id, superseded_by_revision_id,
  source_cut_at, source_watermark,
  source_manifest_json/hash, configuration_manifest_json/hash,
  snapshot_json/hash, reconciliation_json/hash,
  authority_state, integrity_exceptions_json/hash, integrity_exception_count,
  generated_by, created_at, reviewed_by/at, finalized_by/at, superseded_by/at,
  UNIQUE(series_id, revision_number)

accounting_pack_revision_event
  id, revision_id, from_state, to_state, actor_id, reason,
  related_revision_id, occurred_at, idempotency_key UNIQUE, request_hash

accounting_pack_artifact
  id, revision_id, format, state, generation_version,
  attempts, max_attempts, retryable, active_attempt_id, row_version,
  retry_at, error_code, error_message,
  storage_key, semantic_filename, sha256, byte_length,
  queued_at, started_at, ready_at, failed_at, updated_at,
  UNIQUE(revision_id, format)

accounting_pack_artifact_attempt
  id, artifact_id, attempt_number, durable_job_id, job_run_id,
  fencing_token UNIQUE, state, lease_until, started_at, finished_at,
  outcome, error_code, sanitized_error_message,
  UNIQUE(artifact_id, attempt_number), UNIQUE(job_run_id)

accounting_pack_integrity_incident
  id, artifact_id, detected_at, detected_by, expected_sha256/byte_length,
  observed_sha256/byte_length, state, resolution, resolved_at/by

invoice_payment_reversal_event
  id, payment_id UNIQUE, invoice_id, legal_entity_revision_id/hash,
  amount_minor, currency, reversed_at, reason, step_up_at, actor_id,
  idempotency_key UNIQUE, request_hash, event_hash, created_at

compensation_settlement_series / compensation_settlement_revision
  immutable worker/project/entity/currency/period series and versioned eligible-line,
  configuration, trigger, calculation, approval/settlement/supersession snapshots

expense_reimbursement_principal_revision / expense_reimbursement_event
  immutable approved classification/principal versions and payments/reversals pinned to them

finance_change_event
  sequence INTEGER PRIMARY KEY, entity_type, entity_id, entity_version UNIQUE PER ENTITY,
  occurred_at, payload_hash, provenance, actor_id, correlation_id
```

Financial-series identity excludes locale: period + legal entity ID + transaction currency define
the series, while its mandatory initial legal-entity revision snapshot freezes the entity semantics
used by that series. `presentation_locale` is required on each revision and snapshotted by
its artifacts. On both series and revision, `legal_entity_id`, `legal_entity_revision_id`,
`legal_entity_revision_hash`, code, entity currency, IANA timezone, transaction currency, period
bounds, and hashes are non-null. A revision insert/update trigger requires every repeated scope value
to equal its parent series and requires the referenced legal-entity revision ID/hash. Null/global
legal-entity scope is forbidden for authoritative revisions.

States:

```text
revision: draft -> review -> final; draft/review -> superseded; final -> superseded
artifact: queued -> running -> ready
artifact: queued/running -> failed -> queued (explicit retry)
```

There is at most one authoritative `final` row per series, enforced by a partial unique index on
`state='final'`. A regeneration first inserts a non-authoritative `draft` successor tail; draft or
artifact-failed tails never displace the older final truth. `final -> superseded` is allowed only in
the same `BEGIN IMMEDIATE` transaction that finalizes that newer revision. In executable order the
service (1) validates the successor is the highest single-successor tail, `review`, `CLEAN`, fully
reconciled and all-ready, (2) persists finalization/step-up/event evidence, and (3) executes one
`UPDATE successor SET state='final', ... WHERE state='review'`. Its `BEFORE UPDATE` activation trigger
validates the evidence and changes the linked older final to `superseded` before SQLite applies the
successor state; its `AFTER UPDATE` trigger asserts exactly one final. The outer update plus trigger
writes are one atomic statement, so the partial final index never conflicts and any failure restores
both rows. Direct SQL cannot leave a superseded predecessor with a non-final successor because direct
predecessor final-to-superseded updates are rejected; only the successor activation trigger may make
that lifecycle-only write. The old transition sets only
`state='superseded'`, `superseded_by_revision_id`, and audited actor/instant. The old finalized
payload, finalizer/timestamp,
manifests/hashes, reconciliation, and all artifact rows/bytes remain unchanged and downloadable.
Superseding a draft/review revision is separately audited and cannot claim it was final.

Settlement uses the same tail/finality pattern and successor-activation trigger: an `estimated`
correction tail may coexist with one authoritative `approved` or `settled` revision. The single
successor activation statement atomically retires the prior approved/settled row before applying the
new authoritative state, then asserts one authoritative row. `cancelled`/failed/estimated tails never
become pack truth.
The partial unique authoritative-settlement index covers states `approved|settled`; lifecycle checks
and unique predecessor links prevent branches. Classification and reimbursement-principal ordering
is the exact section-5 pattern. All four workflows are tested by direct SQL as well as service calls.
Initial settlement and pack finalization use null predecessor/supersedes links only for revision 1
when no authoritative row or older tail exists; later revisions cannot use the initial path.

`final` and `superseded` revisions remain retrievable. No cascade delete from series/revision to
financial history. Database triggers reject updates to finalized/superseded payload/hash/scope/source
cut/finalization evidence and ready artifact storage/hash/size/name. Direct delete triggers reject
deletion of series, revisions, artifacts, attempts, source/config manifests, issued invoice/
line/source snapshots, invoice/adjustment/payment/payment-reversal/void/reimbursement events,
reimbursement principal/classification and compensation settlement revisions, and configuration
revisions once referenced. Status metadata may only follow the declared transition.

Existing pack rows are exposed as `legacy` revisions through a compatibility read adapter. They are
not mutated or claimed to have a source cut they never captured. A user may regenerate them into a
new authoritative series revision after resolving scope/classification exceptions.

## 11. Per-format jobs, retry, and atomic artifacts

Formats are exactly `pdf`, `xlsx`, `invoice_csv`, `expense_csv`, and `json`. Each gets a separate
durable job and attempt history.

```text
idempotency key = accounting-pack-format:{revisionId}:{format}:{generationVersion}
```

Persisted retry policy is closed and format-specific. `max_attempts` is set when queued (P0 default
5), `retry_ceiling` is initialized to `max_attempts`, `attempts` is bounded
`0..retry_ceiling<=max_attempts`, and `retryable` is a stored boolean derived only from this error
taxonomy:

```text
PDF_RENDERER_UNAVAILABLE       retryable
PDF_ASSET_LOAD_FAILED         retryable
STORAGE_TEMP_WRITE_FAILED     retryable
STORAGE_FSYNC_FAILED          retryable
STORAGE_ATOMIC_RENAME_FAILED  retryable
WORKER_LEASE_LOST             retryable (expired attempt is fenced; next claim allowed)
UNKNOWN_TRANSIENT             retryable, max_attempts capped at 3

STORAGE_CONFLICT              terminal
ARTIFACT_HASH_MISMATCH        terminal / integrity incident
RENDER_VALIDATION_FAILED      terminal
SOURCE_SNAPSHOT_INVALID       terminal / new revision required
CONFIGURATION_INVALID         terminal / new revision required
AUTHORIZATION_REVOKED         terminal
UNSUPPORTED_FORMAT            terminal
```

No arbitrary error string may become `error_code`; unexpected exceptions map to sanitized
`UNKNOWN_TRANSIENT`. Retry scheduling uses bounded deterministic exponential delays with configured
caps and jitter derived from artifact ID (test reproducible). On every failure, atomically set
`retry_ceiling=min(previous retry_ceiling, taxonomy cap, max_attempts)`; the cap is 3 for
`UNKNOWN_TRANSIENT`, 5 for every other retryable code, and the current attempt count for terminal
codes. Thus a later mixed error can only lower, never reset or raise, the effective limit, and total
attempts never reset across error-code changes. A failed artifact can transition to queued only when
`retryable=1`, `attempts < retry_ceiling`, no open integrity incident, and an audited
retry command/automatic scheduler wins the row-version CAS. Otherwise it remains terminal failed;
UI/API exposes attempts, configured max, effective retry ceiling, retryability and retry time.
Increasing configured max requires an audited admin policy action, cannot exceed the repository
constant, and never increases an already-lowered retry ceiling.

- Claim transitions only one artifact `queued -> running` using a compare-and-swap on artifact
  `row_version`, increments attempts, creates the linked attempt row and fresh unguessable fencing
  token, links the durable job/job-run, and stores `active_attempt_id`/lease in one transaction.
- Render formats independently. PDF logo/Chromium failure affects only PDF.
- Write to a random temp file in the final directory using exclusive creation; write all bytes,
  fsync file, close, then atomically rename to a never-before-used attempt-specific candidate key
  containing the attempt ID/fencing-token digest. Fsync the containing directory where supported.
  A candidate is not downloadable/published until the fenced conditional DB completion stores that
  exact key on the artifact row.
- On Windows, if that attempt-specific candidate already exists (same attempt recovery), hash/size
  must equal expected before reuse. Never trust or overwrite an arbitrary partial/candidate file.
- Register `ready` metadata only with a conditional transaction:
  `WHERE artifact.state='running' AND active_attempt_id=? AND row_version=?` plus matching live
  attempt/fencing token and unexpired lease. It links the exact job run, validates final file
  SHA-256/size, completes the attempt, and sets ready metadata atomically. Zero changed rows means a
  stale worker lost the fence; it must not modify artifact state/metadata or publish its candidate.
- Failure completion uses the identical attempt ID/fencing token/expected row-version predicate,
  finishes that job run/attempt, stores sanitized failure, and conditionally moves only that format
  to failed/queued-for-retry. A stale/expired worker changes zero rows and may remove only the temp
  file named by its own attempt; it may never remove/rename a final key.
- A crash after candidate rename but before DB commit leaves an unreferenced attempt candidate. A
  retry uses a new attempt/fence and candidate key; maintenance may delete the orphan only after a
  DB reference/active-attempt check and retention delay. Same-attempt recovery may hash-validate its
  own candidate. A conflicting file yields scoped failure, never overwrite.
- Store sanitized diagnostics. No paths, secrets, or customer document contents in user-visible
  error text.
- Manual “Run due jobs” remains admin diagnostics. The deployed timer/worker is the normal path.

One failed format may retry without regenerating or modifying ready sibling formats. Retrying a
ready format is rejected. If ready metadata's bytes later disappear or fail hash/size validation,
create an immutable integrity incident and suppress download; never change the ready row back to
queued/failed and never overwrite its final key. Recovery is exactly one of:

1. restore the exact bytes from a verified backup whose hash/size match the immutable metadata,
   audit the restore, revalidate, and resolve the incident without changing artifact metadata; or
2. create a new Accounting Pack revision and new artifact. If exact bytes cannot be restored, the
   old artifact remains an auditable integrity failure and is not regenerated in place.

### Semantic filenames

Use ASCII-safe legal-entity code and calendar period, with revision number:

```text
Accounting_Monthly_{ENTITY}_{YYYY-MM}_R{NN}.pdf
Accounting_Monthly_{ENTITY}_{YYYY-MM}_R{NN}.xlsx
Invoice_Register_{ENTITY}_{YYYY-MM}_R{NN}.csv
Expense_Register_{ENTITY}_{YYYY-MM}_R{NN}.csv
Accounting_Export_{ENTITY}_{YYYY-MM}_R{NN}.json
```

The storage key may contain UUIDs for confinement/uniqueness, but the download filename may not be
UUID-only.

## 12. Download and UI truth contract

The repository returns a discriminated lifecycle result, not “export not found” for all cases:

```ts
type ArtifactAvailability =
  | { state: 'queued' | 'running'; retryAfterSeconds: number }
  | {
      state: 'failed';
      retryable: boolean;
      attempts: number;
      maxAttempts: number;
      retryCeiling: number;
      retryAt: string | null;
      errorCode: ArtifactErrorCode;
    }
  | { state: 'integrity_failed'; incidentId: string; recovery: 'restore_exact_or_new_revision' }
  | {
      state: 'ready';
      storageKey: string;
      filename: string;
      sha256: string;
      byteLength: number;
      mediaType: string;
    }
  | { state: 'missing' };
```

Pack list/detail responses return immutable `revision.state` and the independent `freshness:
PackFreshness` projection from section 9.1. HTTP does not map stale to an error: authorized
historical detail/download keeps its normal lifecycle status, while mutation capabilities expose
`canRegenerate` and never `canRefresh`. UI badges and accessible status text must distinguish
`Final · stale` from `Final · current` and from `Superseded`; no stale projection overwrites the
persisted revision state.

`maxAttempts` is the configured immutable-at-queue policy cap; `retryCeiling` is the effective
monotonically non-increasing cap from section 11. Retry UI is enabled only when `retryable` and
`attempts < retryCeiling`; it never compares only with `maxAttempts`.

HTTP behavior:

- unknown revision/format or unauthorized scope: `404` without enumeration detail;
- known queued/running: `409` problem JSON `artifact_not_ready` plus `Retry-After`;
- known failed: `409` problem JSON `artifact_failed` with retryability/error code;
- ready and integrity-valid: `200`, private/no-store headers, safe `Content-Disposition`;
- ready metadata but missing/hash-mismatched bytes: create/reuse the immutable incident and return
  audited `503 artifact_integrity_failure`; recovery is exact-byte restore or a new revision as
  defined in section 11, never same-row retry and never an accidental 500.

All reads require finance/auditor authorization; downloads and retry/finalize/regenerate require the
approved recent-step-up policy. The UI renders one status/action per format. “Pack ready” is allowed
only when all required artifacts are ready **and no required artifact has an open integrity
incident**; partial/integrity-failed readiness is displayed explicitly. Finalization requires
reconciliation PASS, all five required formats ready, a fresh file hash/size verification, and zero
open integrity incidents. An incident opened after finalization suppresses the all-ready projection
and download immediately but preserves final/superseded history; exact-byte restore resolves it or a
new revision supersedes it.

## 13. Invoice template and report catalog contracts (WP-B4 leaves)

### Versioned invoice registry

Registry IDs are enums, never free text:

```text
labor-detailed@1
labor-summary@1
expenses-detailed@1
fixed-milestone@1
credit-adjustment@1
```

Each registry entry declares family, version, supported stream/source types, required snapshot
blocks, columns/grouping, totals rules, locale support, renderer version, and schema validator.
Selectors submit a registered ID. Draft creation rejects unknown/incompatible IDs. Issued snapshot
stores the full ID and renderer/content hash.

Material differences:

- Labor Detailed: worker/role/day/category/quantity/rate/amount lines and optional minimum top-up.
- Labor Summary: grouped service-period quantity/amount; worker names only when policy allows.
- Expenses Detailed: date/category/reference/vendor-safe description/net/tax/gross or contractual
  amount; no internal notes.
- Fixed/Milestone: milestone/deliverable/schedule/amount blocks; no fabricated hourly quantity.
- Credit/Adjustment: original invoice reference, reason, signed negative/positive lines and totals.

### Required report catalog

Stable IDs:

```text
project-profitability, worker-statement, labor-cost, client-labor, expense,
technical, missing-activity, billing-run, invoice-register, accounts-receivable,
revenue, accounting-pack
```

Those 12 IDs are catalog families, not a reduction of spec section 66. Every mandatory report is
addressed by the following stable `{family}/{subreport}` ID; a family request without a subreport is
valid only where `default` is listed. Registry validation fails startup if any row is absent or if a
descriptor silently aliases two semantically different queries.

| Section 66 report                                | Stable catalog ID                              |
| ------------------------------------------------ | ---------------------------------------------- |
| Weekly/period time statement                     | `worker-statement/time`                        |
| Own compensation estimate                        | `worker-statement/compensation-estimate`       |
| Own reimbursement statement                      | `worker-statement/reimbursement`               |
| Daily operations                                 | `client-labor/daily`                           |
| Weekly operations                                | `client-labor/weekly`                          |
| Custom-period operations                         | `client-labor/custom-period`                   |
| Consolidated multi-worker                        | `client-labor/consolidated-workers`            |
| Staffing/assignment                              | `client-labor/staffing-assignments`            |
| PLC/automation change                            | `technical/plc-change`                         |
| Technical period summary                         | `technical/period-summary`                     |
| Backup register                                  | `technical/backup-register`                    |
| Unresolved issues                                | `technical/unresolved-issues`                  |
| Project P&L-style contribution                   | `project-profitability/contribution`           |
| Client profitability                             | `project-profitability/client`                 |
| Worker profitability                             | `project-profitability/worker`                 |
| Budget vs actual                                 | `project-profitability/budget-vs-actual`       |
| Travel leakage                                   | `project-profitability/travel-leakage`         |
| Unbilled WIP                                     | `billing-run/unbilled-wip`                     |
| Invoice aging                                    | `accounts-receivable/aging`                    |
| Collections                                      | `accounts-receivable/collections`              |
| Forecast at completion                           | `project-profitability/forecast-at-completion` |
| Labor invoice draft/final                        | `billing-run/labor-invoice`                    |
| Expense invoice draft/final                      | `billing-run/expense-invoice`                  |
| Fixed/milestone invoice                          | `billing-run/fixed-milestone-invoice`          |
| Adjustment/credit document                       | `billing-run/adjustment-credit`                |
| Internal invoice reconciliation                  | `billing-run/internal-reconciliation`          |
| Master Invoice / Cost / Collection Ledger        | `accounting-pack/master-ledger`                |
| Monthly Accounting Pack                          | `accounting-pack/default`                      |
| Monthly invoice register                         | `invoice-register/monthly`                     |
| Monthly collection/payment                       | `accounts-receivable/monthly-collections`      |
| Monthly worker/direct-cost                       | `labor-cost/monthly-worker-direct-cost`        |
| Monthly expense register with receipt references | `expense/monthly-register`                     |
| Monthly contribution summary                     | `revenue/monthly-contribution`                 |
| Outstanding accounts receivable                  | `accounts-receivable/outstanding`              |
| Source reconciliation                            | `accounting-pack/source-reconciliation`        |

`missing-activity/default` remains a mandatory operational control from the completion backlog and
is additive to section 66. Each subreport freezes its own authorization, filters, query version,
column schema, formats, filename token and snapshot/query mode; family authorization alone is not
sufficient for a more sensitive subreport.

Each descriptor declares authorization policy, filters, source query version, columns, supported
formats, semantic filename policy, and whether output is immutable snapshot or point-in-time query.
Financial reports use the exact ledger/source-cut calculation service; renderers do not run their
own SQL or recompute totals. Worker Statement excludes client rate/internal cost/margin. Technical
customer reports exclude internal notes/artifact secrets.

## 14. Migration semantics

The migration number is assigned centrally. The migration worker owns only the centrally assigned
SQL plus schema parity changes after this contract is accepted.

Additive sequence:

1. Add series/revision/artifact/attempt/integrity-incident/revision-event, payment-reversal,
   reimbursement-principal/event and compensation-series/revision tables, indexes, state checks,
   FKs, fencing constraints, and immutability/delete triggers.
2. Add non-overlapping effective project legal-entity assignment; immutable legal-entity timezone,
   finance configuration, internal-cost snapshot, expense classification, and explicit prospective
   minimum-policy/top-up-source revision tables. P0 adds no FX persistence.
3. Add compatibility views/adapters for existing packs and reimbursements. Do not delete or rewrite
   legacy pack/export rows.
4. Backfill only mechanically provable facts, tagged `migration_provenance='legacy_observed'`, and
   emit one uniquely keyed finance-change event per provable entity version. Do not synthesize actor,
   configuration, source-manifest or calculation evidence.
5. A legacy reimbursement principal/event is provable only when expense version, approved
   classification/basis, amount/currency, payer and treatment provenance, paid amount, paid instant,
   reference and approval/audit trail all agree mechanically. Otherwise create no invented principal
   or event: retain the legacy projection as `legacy_unspecified`, surface an integrity exception and
   block authoritative finalization until a prospective decision/correction is recorded.
6. Legacy compensation rows are copied only as compatibility observations. Missing eligible-line,
   rate/configuration revision, trigger or calculation-hash evidence blocks a clean pack; the
   migration never fabricates a finalized settlement revision.

Existing `period_report` and `report_source` are historical financial inputs and receive guards
before any v2 reader is enabled. A `period_report` in its repository-defined finalized/issued state
rejects update of scope, period, status regression, payload/snapshot/hash, totals, actor/timestamps,
configuration or artifact linkage and rejects delete. Every `report_source` linked to such a report
rejects insert, update, relink and delete; the parent finalized report also rejects cascade deletion.
If the legacy schema has no reliable finalized marker, all pre-migration rows are conservatively
read-only and corrections use a new versioned report/source set. State-only finalization is allowed
once, in the same transaction that freezes a canonical payload hash and source-manifest hash; no
refresh-in-place exists. Populated migration tests attempt every protected column, source relink,
direct delete and parent cascade and require SQLite abort without changing row counts or hashes.

Legacy projection is exact rather than optimistic. The compatibility adapter returns recorded
amounts/fields unchanged plus `authority_state='BLOCKED'`, closed exception codes and provenance for
each unresolved basis, payer, tax, FX, actor, configuration, event or calculation dimension. It never
fills an authoritative v2 DTO field from a default. A pack source row must persist the legacy row ID,
version or mechanical content hash, projection hash, exception IDs/hash and whether it is included
only as a displayed legacy observation. `accounting_pack_revision.authority_state='CLEAN'` is
impossible if any selected or excluded in-scope row is `legacy_unspecified`, has unresolved exception
evidence, lacks a unique change event, or lacks an authoritative source/configuration hash.

### 14.1 Frozen additive 20-table contract

The migration leaf implements these columns and constraints exactly. All new tables are SQLite
`STRICT` tables and migration/runtime tests require `PRAGMA foreign_keys=ON`. All IDs/timestamps/hashes/
enums named below are `TEXT NOT NULL` unless explicitly nullable; timestamps are UTC ISO instants
except business-date fields (`YYYY-MM-DD`). There is no SQLite `BOOLEAN` storage class in this
contract: every boolean is declared `INTEGER NOT NULL CHECK(value IN (0,1))`. Every lifecycle-
dependent actor/time/link/error/storage field explicitly named nullable is declared `TEXT NULL` or
`INTEGER NULL` as appropriate and is governed by an exhaustive table `CHECK` plus transition
triggers; it is not accidentally made non-null by the shorthand rule. Every new FK is
`ON UPDATE RESTRICT ON DELETE RESTRICT`;
there is no cascade. Hash columns check `length=64`; currency checks three uppercase ASCII letters;
JSON columns are `json_valid(...)`; nullable JSON/hash pairs require both null or both valid/non-null.
Immutable tables have
`BEFORE UPDATE` and `BEFORE DELETE` abort triggers except for the exact lifecycle columns stated and
the one audited effective-range close rule in section 8. That exception permits only
`effective_to: null -> later bound` in the same successor transaction after the no-later-reference
proof; every other field and every second close attempt aborts.

1. `legal_entity_revision`: `id` PK; `legal_entity_id` FK `legal_entity`; `revision_number INTEGER
CHECK >=1`; `code`, `legal_name`, `billing_address`, `company_identifiers_json`, `currency`,
   `timezone`, `effective_from`, nullable `effective_to`, `snapshot_json`, `snapshot_hash`,
   `created_by` FK `user`, `created_at`. Unique `(legal_entity_id, revision_number)` and
   `(legal_entity_id, effective_from)`; check `effective_to > effective_from`; insert trigger rejects
   overlapping effective ranges and service validation rejects unknown IANA timezone. Payload is
   immutable/non-deletable; `effective_to` may change once from null to a later bound only in an
   audited successor transaction after proving no referenced source occurs on/after that bound.
2. `project_legal_entity_assignment`: `id` PK; `project_id` FK `project`;
   `legal_entity_revision_id` FK `legal_entity_revision`; `revision_number INTEGER CHECK >=1`,
   `effective_from`, nullable `effective_to`, `reason`, `created_by` FK `user`, `created_at`,
   `assignment_hash`. Unique `(project_id, revision_number)` and `(project_id, effective_from)`;
   range check and insert/update trigger reject overlap. Payload is immutable/non-deletable;
   `effective_to` may change once from null to a later bound only in the transaction inserting its
   successor and only when no referenced source occurs on/after that bound.
3. `finance_configuration_revision`: `id` PK; `configuration_type` CHECK IN
   (`billing_stream`,`client_rate`,`compensation`,`internal_cost`,`tax`,`daily_minimum`,
   `invoice_number`,`expense_policy`,`template`); `subject_id`, `revision_number INTEGER CHECK >=1`,
   nullable `currency`, `effective_from`, nullable `effective_to`, `status` CHECK IN
   (`active`,`retired`), `payload_json`, `payload_hash`, `created_by` FK `user`, `created_at`.
   Unique `(configuration_type, subject_id, revision_number)`; effective-range check; trigger rejects
   overlapping active ranges for the same type/subject where the type is effective-dated. Payload,
   identity/effective start are immutable. `effective_to` may close once in the audited successor
   transaction after the same no-later-reference proof; retirement is an audited one-way lifecycle
   update.
4. `expense_financial_classification`: `id` PK; `expense_id` FK `expense`;
   `expense_version INTEGER CHECK >= 1`; `classification_revision INTEGER CHECK >= 1`;
   `lifecycle` CHECK IN (`draft`,`current`,`superseded`,`failed`); nullable
   `failure_code`, `failed_at`, `failed_by` FK user; nullable `predecessor_classification_id`,
   nullable `supersedes_classification_id` and
   `superseded_by_classification_id` self-FKs; `project_legal_entity_assignment_id` FK assignment;
   `legal_entity_id` FK legal entity; `legal_entity_revision_id` FK revision;
   `legal_entity_revision_hash`; `legal_entity_timezone`; `project_timezone`; `transaction_currency`;
   `project_currency`; `customer_invoice_currency`; `gross_amount_minor INTEGER CHECK >= 0`;
   `captured_tax_minor INTEGER CHECK >= 0`; `recoverable_tax_minor INTEGER CHECK >= 0`;
   `classified_cost_basis_minor INTEGER CHECK >= 0`; `net_direct_cost_minor INTEGER CHECK >= 0`;
   `payer_treatment` CHECK IN (`worker_paid`,`company_paid`,`client_direct`);
   `customer_billing_basis` CHECK IN
   (`GROSS_COST`,`NET_COST`,`FIXED_ALLOWANCE`,`NOT_BILLABLE`); `markup_bps` INTEGER;
   nullable `fixed_allowance_minor INTEGER CHECK >= 0`;
   `customer_billing_basis_minor INTEGER CHECK >= 0`; `customer_markup_minor INTEGER CHECK >= 0`;
   nullable `customer_tax_configuration_revision_id` FK finance configuration;
   `customer_invoice_net_minor INTEGER CHECK >= 0`; `customer_tax_components_json`;
   `customer_tax_components_hash`; `customer_tax_minor INTEGER CHECK >= 0`;
   `customer_invoice_gross_minor INTEGER CHECK >= 0`; `reimbursable_principal_minor` INTEGER;
   `payer_provenance`; `classification_json`;
   `classification_hash`; `creation_idempotency_key UNIQUE`; `creation_request_hash`; nullable
   `approval_idempotency_key UNIQUE`, nullable `approval_request_hash`, nullable `approved_by` FK user,
   nullable `approved_at`; nullable `superseded_by` FK user; nullable `superseded_at`; `created_at`. Unique
   `(expense_id,classification_revision)` and partial unique `(expense_id) WHERE lifecycle='current'`.
   Unique partial index on non-null `predecessor_classification_id` permits one successor per
   immediate tail. Insert trigger requires that predecessor be the current highest revision with no
   successor; activation requires the separate supersedes target still be current.
   `markup_bps` is between 0 and 100000 inclusive. `reimbursable_principal_minor` is between zero and
   `gross_amount_minor` inclusive. Checks also require transaction currency = project currency =
   customer invoice currency, captured tax <= gross, recoverable tax <= captured tax, classified
   cost basis = gross - recoverable tax, and direct cost = classified basis for worker/company or
   zero for client-direct. Company-paid requires reimbursement zero. Client-direct also requires
   reimbursement/customer amounts zero and `NOT_BILLABLE`. Fixed allowance is valid only for its
   basis; invoice net = basis + markup and invoice gross = invoice net + customer tax. Billable rows
   require a tax revision (explicit zero profile allowed); `NOT_BILLABLE` alone requires null tax
   revision and zero customer amounts. Insert trigger
   requires entity/assignment/revision/hash/timezone equality, an explicit valid project timezone,
   and all three currencies to equal the referenced legal-entity revision currency.
   State checks require draft evidence fields null; current approval evidence non-null and failure/
   supersession fields null; failed failure evidence non-null and approval/supersession fields null;
   superseded approval plus supersession evidence non-null and failure fields null. Activation
   triggers enforce the single-statement section-5 ordering; direct predecessor updates abort.
   Payload is immutable in every state; no delete.
5. `finance_internal_cost_snapshot`: `id` PK; `source_type` CHECK IN (`time`,`minimum_top_up`,
   `expense`,`manual_direct_cost`,`correction`), `source_id`, `source_version INTEGER CHECK >=1`,
   nullable `origin_event_type` CHECK IN (`manual_direct_cost_event`,
   `direct_cost_correction_event`), nullable `originating_event_id`, nullable
   `originating_event_version INTEGER CHECK >=1`, nullable `originating_event_hash`, nullable
   `origin_actor_provenance` CHECK IN (`known`,`unknown_legacy`), nullable `reason`, nullable
   `actor_id` FK user; `project_id` FK
   `project`, nullable `worker_id` FK `user`, `business_date`, `project_timezone`,
   `project_legal_entity_assignment_id` FK assignment, `legal_entity_revision_id` FK revision,
   `legal_entity_revision_hash`, nullable `configuration_revision_id` FK finance configuration,
   nullable `configuration_hash`, `provenance` CHECK IN (`native`,`legacy_observed`),
   `source_payload_json`, `source_payload_hash`, nullable `expense_classification_id` FK expense
   classification, `source_snapshot_hash`, `currency`,
   `minutes INTEGER CHECK >=0`, `effective_rate_minor INTEGER CHECK >=0`,
   `allocated_amount_minor INTEGER`, `algorithm_version`, `calculation_json`, `calculation_hash`,
   `created_at`. Unique `(source_type,source_id,source_version,source_snapshot_hash)` and partial
   unique `(origin_event_type,originating_event_id,originating_event_version)` where origin is
   non-null. A second partial unique `(source_type,source_id,source_version)` applies to native rows,
   making authoritative snapshot selection singular. Trigger
   validates project timezone against the immutable source/project snapshot; requires
   typed event/version/hash, reason, known actor and configuration ID/hash for native manual/
   correction; mechanically observed legacy permits null actor only with
   `origin_actor_provenance='unknown_legacy'` and creates a blocking exception; requires configuration and
   null expense classification for time/minimum; requires the exact approved expense classification
   and null generic configuration for expense; forbids unexplained fields for ordinary sources.
   Immutable/non-deletable.
6. `client_minimum_policy_revision`: `id` PK; `project_id` FK `project`, `billing_stream_id` FK
   `billing_rule`, `configuration_revision_id` FK finance configuration,
   `project_legal_entity_assignment_id` FK assignment, `legal_entity_revision_id` FK revision,
   `legal_entity_revision_hash`, `scope` CHECK exactly
   `PER_WORKER_PROJECT_LOCAL_DAY`, `minimum_minutes INTEGER CHECK BETWEEN 0 AND 1440`,
   `project_timezone`, `eligible_weekday_mask`, `eligible_time_categories_json`,
   `top_up_rate_policy` CHECK IN
   (`EXPLICIT_RATE`,`EFFECTIVE_REGULAR_RATE`), nullable `explicit_rate_minor INTEGER CHECK >=0`,
   `currency`, `effective_from`, nullable `effective_to`, `policy_hash`, `created_by` FK `user`,
   `created_at`. Unique `(project_id,billing_stream_id,configuration_revision_id)`; explicit rate is
   required only for `EXPLICIT_RATE`; effective range cannot overlap for project/stream. Trigger
   validates project/billing-stream/assignment/entity-revision/hash/currency equality and the
   project timezone snapshot and permits only the common audited one-time
   `effective_to` close exception; payload/timezone/start are immutable and deletion aborts.
7. `billing_minimum_adjustment`: `id` PK; `project_id` FK `project`, `worker_id` FK `user`,
   `business_date`, `project_timezone`, `billing_stream_id` FK `billing_rule`,
   `minimum_policy_revision_id` FK policy,
   `project_legal_entity_assignment_id` FK assignment, `legal_entity_revision_id` FK revision,
   `legal_entity_revision_hash`, `currency`, `actual_minutes INTEGER CHECK >=0`,
   `minimum_minutes INTEGER CHECK >=0`,
   `top_up_minutes INTEGER CHECK >=0`, `rate_configuration_revision_id` FK finance configuration,
   `rate_minor INTEGER CHECK >=0`, `amount_minor INTEGER CHECK >=0`, `eligible_sources_json`,
   `calculation_hash`, `created_at`.
   `UNIQUE(project_id,worker_id,business_date,billing_stream_id,minimum_policy_revision_id)`.
   Check top-up = `max(0,minimum-actual)` is enforced by trigger/service. Trigger requires the
   adjustment project timezone, assignment, entity revision/hash and currency to equal the immutable
   policy, billing stream, selected rate revision and project snapshots. Rate-selection evidence
   persists scope/category/effective-date rank; tied winning ranks abort.
   Immutable/non-deletable and reserved through `invoice_source`.
8. `compensation_settlement_series`: `id` PK; `worker_id` FK `user`, `project_id` FK `project`,
   `period_start`, `period_end`, `legal_entity_id` FK legal entity,
   `legal_entity_revision_id` FK revision, `legal_entity_revision_hash`, `legal_entity_timezone`,
   `project_timezone`, `currency`, `trigger` CHECK IN
   (`ON_APPROVED_BILLABLE_LABOR`,`ON_INVOICE_ISSUE`,`ON_CLIENT_PAYMENT`), `created_at`. Check
   end >= start; unique
   `(worker_id,project_id,period_start,period_end,legal_entity_revision_id,currency,trigger)`.
   Insert trigger validates entity/revision/hash/entity timezone/project timezone/currency equality.
   Immutable/non-deletable.
9. `compensation_settlement_revision`: `id` PK; `series_id` FK settlement series;
   `revision_number INTEGER CHECK >=1`; `state` CHECK IN
   (`estimated`,`approved`,`settled`,`superseded`,`cancelled`); nullable
   `predecessor_revision_id`, nullable `supersedes_revision_id` and
   `superseded_by_revision_id` self-FKs; repeated `worker_id` FK user, `project_id` FK project,
   `period_start`, `period_end`, `legal_entity_id` FK legal entity, `legal_entity_revision_id` FK
   revision, `legal_entity_revision_hash`, `legal_entity_timezone`, `project_timezone`, `currency`,
   `trigger`; `as_of`, `source_watermark INTEGER CHECK >=0`;
   `eligible_source_manifest_json`, `eligible_source_manifest_hash`,
   `rate_configuration_manifest_json`, `rate_configuration_manifest_hash`,
   `compensation_configuration_revision_id` FK finance configuration;
   `compensation_configuration_hash`; `percentage_basis` CHECK exactly
   `ELIGIBLE_CLIENT_LABOR_NET`; `eligible_amount_minor INTEGER`;
   `percentage_bps INTEGER CHECK BETWEEN 0 AND 10000`, `settlement_amount_minor INTEGER`,
   `algorithm_version`, `calculation_json`, `calculation_hash`; `creation_idempotency_key UNIQUE`,
   `request_hash`, `created_by` FK user, `created_at`; nullable paired `approved_by` FK user and
   `approved_at`; nullable paired `settled_by` FK user and `settled_at`; nullable paired
   `superseded_by` FK user and `superseded_at`; `reason`. Unique
   `(series_id,revision_number)` and partial unique `(series_id) WHERE state IN
('approved','settled')`. Unique partial index on non-null `predecessor_revision_id` permits one
   successor per immediate tail, and trigger requires that predecessor be the current highest series
   revision/tail while activation revalidates the separate authoritative supersedes target.
   Trigger enforces repeated series scope including entity/revision/hash/entity timezone,
   project timezone and currency, persisted percentage basis equality with configuration and
   calculation JSON/hash, canonical JSON/hash, exact lifecycle and immutable
   approved/settled/superseded payload;
   corrections insert a higher estimated tail and activate through the single-statement trigger
   ordering in section 10; direct predecessor supersession aborts.
   No update/delete of finalized truth.
10. `expense_reimbursement_principal_revision`: `id` PK; `expense_id` FK expense;
    `principal_revision INTEGER CHECK >=1`; `lifecycle` CHECK IN
    (`draft`,`current`,`superseded`,`failed`); nullable `failure_code`, `failed_at`, `failed_by` FK user;
    `expense_version INTEGER CHECK >=1`; `classification_id` FK expense classification,
    `classification_revision INTEGER CHECK >=1`, `classification_hash`;
    `principal_amount_minor INTEGER CHECK >=0`, `currency`;
    `project_legal_entity_assignment_id` FK assignment, `legal_entity_id` FK legal entity,
    `legal_entity_revision_id` FK revision, `legal_entity_revision_hash`, `legal_entity_timezone`,
    `payer_provenance`, `principal_snapshot_json`, `principal_snapshot_hash`; nullable
    `predecessor_principal_revision_id`, `supersedes_principal_revision_id` and
    `superseded_by_principal_revision_id` self-FKs;
    `creation_idempotency_key UNIQUE`, `creation_request_hash`; nullable
    `approval_idempotency_key UNIQUE`, nullable `approval_request_hash`, nullable `approved_by` FK
    user, nullable `approved_at`; nullable
    paired `superseded_by` FK user and `superseded_at`; `created_at`. Unique
    `(expense_id,principal_revision)` and partial unique
    `(expense_id) WHERE lifecycle='current'`. Unique partial index on non-null
    `predecessor_principal_revision_id` permits one successor per immediate tail. Trigger requires the
    predecessor be the current highest tail, the supersedes target still current,
    classification/expense/scope/hash/amount equality and
    the single-statement activation ordering from section 5; correction currency cannot change and principal
    cannot fall below signed paid-to-date. Exhaustive state checks require only current/superseded
    rows to carry approval evidence, only superseded rows to carry supersession evidence, and only
    failed rows to carry failure evidence. Direct predecessor update aborts. Payload immutable; no
    delete.
11. `expense_reimbursement_event`: `id` PK; `expense_id` FK expense;
    `principal_revision_id` FK principal revision; `principal_revision_number INTEGER CHECK >=1`,
    `principal_snapshot_hash`, `principal_amount_minor INTEGER CHECK >=0`;
    `amount_minor INTEGER CHECK <>0`, `currency`, `paid_at`, `reference`, `idempotency_key UNIQUE`,
    `request_hash`, `actor_id` FK user, `created_at`, nullable `reversal_of_event_id` self-FK UNIQUE,
    nullable `reason`, nullable `step_up_at`. Insert trigger enforces copied principal fields/currency,
    positive normal payments,
    current-principal status for positive writes, exact negative same-principal reversal (allowed
    against its superseded historical principal), one reversal per target, no reversal-of-reversal,
    step-up/reason for reversal, and expense-wide derived total `0..current principal`.
    Immutable/no delete.
12. `invoice_payment_reversal_event`: `id` PK; `payment_id` FK `payment` UNIQUE; `invoice_id` FK
    `invoice`; `legal_entity_revision_id` FK revision, `legal_entity_revision_hash`;
    `amount_minor INTEGER CHECK <0`, `currency`, `reversed_at`, `reason`, `step_up_at`, `actor_id` FK
    user, `idempotency_key UNIQUE`, `request_hash`, `event_hash`, `created_at`. Insert trigger requires
    the target payment, invoice/entity/currency equality, `amount_minor=-payment.amount_minor`, no
    existing reversal, non-empty reason and step-up; because target is `payment`, reversal-of-reversal
    is impossible. Immutable/non-deletable.
13. `finance_idempotency_record`: `idempotency_key` PK; `operation` CHECK IN
    (`invoice_draft`,`invoice_issue`,`payment`,`payment_reversal`,`credit`,`debit`,`void`,
    `expense_classification`,`reimbursement_principal`,`reimbursement`,`compensation_settlement`,
    `accounting_pack_create`,`accounting_pack_regenerate`,`accounting_pack_finalize`,
    `artifact_retry`,`over_credit_authorize`), `request_hash`,
    `entity_type`, `entity_id`, `actor_id` FK `user`, `created_at`; nullable
    `authorization_evidence_version` CHECK exactly `finance-step-up-v1`, nullable `principal_id` FK
    user, nullable `tenant_id`, nullable `role_at_decision`, nullable
    `authentication_session_id_hash`, nullable `step_up_method`, nullable `authenticated_at`,
    nullable `verified_at`, nullable `expires_at`, nullable `policy_revision_id`, nullable
    `policy_hash`, nullable `target_type`, nullable `target_id`, nullable
    `requested_amount_minor INTEGER`, nullable `requested_currency`, nullable
    `authorization_evidence_json`, nullable `authorization_evidence_hash`. Gated operations require
    every authorization field non-null, canonical JSON/hash agreement, actor=principal, operation/
    target/amount/currency agreement and valid time order; ungated operations require every
    authorization field null. Same-key same-hash/evidence readers return
    the entity; differing hash is conflict. Immutable/non-deletable.
14. `accounting_pack_series`: `id` PK; `period_start`, `period_end`, `legal_entity_id` FK
    `legal_entity`, `legal_entity_revision_id` FK revision, `legal_entity_revision_hash`,
    `legal_entity_code`, `legal_entity_currency`, `legal_entity_timezone`, `currency`, `created_at`;
    period check end>=start; unique `(period_start,period_end,legal_entity_id,currency)`.
    All scope fields non-null; immutable/non-deletable.
15. `accounting_pack_revision`: `id` PK; `series_id` FK series; `revision_number INTEGER CHECK >=1`;
    `state` CHECK IN (`draft`,`review`,`final`,`superseded`); `presentation_locale` CHECK IN
    (`en`,`es`,`pt`); repeated non-null `legal_entity_id` FK entity,
    `legal_entity_revision_id` FK revision, `legal_entity_revision_hash`, `legal_entity_code`,
    `legal_entity_currency`, `legal_entity_timezone`, `currency`, `period_start`, `period_end`;
    `creation_kind` CHECK IN (`initial`,`regenerate`), `creation_idempotency_key UNIQUE`,
    `request_hash`; nullable `creation_authorization_evidence_hash`; nullable self-FKs
    `predecessor_revision_id`, `supersedes_revision_id`, `superseded_by_revision_id`;
    `source_cut_at`, `source_watermark INTEGER CHECK >=0`; `source_manifest_json/hash`,
    `configuration_manifest_json/hash`, `snapshot_json/hash`, `reconciliation_json/hash`;
    `authority_state` CHECK IN (`CLEAN`,`BLOCKED`), `integrity_exceptions_json`,
    `integrity_exceptions_hash`, `integrity_exception_count INTEGER CHECK >=0`;
    `generated_by` FK `user`, `created_at`; nullable paired `reviewed_by` FK user/`reviewed_at`,
    `finalized_by` FK user/`finalized_at`, `finalization_idempotency_key` FK finance idempotency,
    `finalization_authorization_evidence_hash`, `superseded_by` FK user/`superseded_at`. Unique
    `(series_id,revision_number)`, partial unique initial revision per series, and partial unique
    `(series_id) WHERE state='final'`. Every JSON/hash and
    period check applies. Unique partial index on non-null `predecessor_revision_id` permits one
    successor per immediate tail. Trigger enforces regeneration predecessor = current highest tail
    with no successor and activation supersedes target = current final truth under
    `BEGIN IMMEDIATE`, repeated scope equality, paired lifecycle actor/times,
    initial revision=1/no predecessor/null creation authorization; regenerate requires predecessor
    same series/lower number and matching persisted step-up evidence, and exact
    lifecycle and single activation-trigger ordering in section 10. Direct final-to-superseded
    updates abort; only the successor activation trigger may perform the lifecycle projection.
    Final requires `authority_state='CLEAN'`, exception count zero, canonical empty exception array/
    hash, reconciliation PASS, all artifacts ready/integrity-valid and matching persisted step-up
    evidence. State checks require review/finalization/supersession evidence only in their applicable
    states. Payload/scope immutable after insert; no delete.
16. `accounting_pack_revision_event`: `id` PK; `revision_id` FK revision; `from_state`, `to_state`
    each CHECK revision states; `actor_id` FK `user`; `reason`; nullable `related_revision_id` FK
    revision; `occurred_at`; `idempotency_key UNIQUE`; `request_hash`. Immutable/non-deletable.
17. `accounting_pack_artifact`: `id` PK; `revision_id` FK revision; `format` CHECK IN
    (`pdf`,`xlsx`,`invoice_csv`,`expense_csv`,`json`); `state` CHECK IN
    (`queued`,`running`,`ready`,`failed`); `generation_version`; `attempts INTEGER CHECK >=0`;
    `max_attempts INTEGER CHECK BETWEEN 1 AND 5`; `retry_ceiling INTEGER CHECK BETWEEN 1 AND 5`;
    `retryable INTEGER NOT NULL CHECK(retryable IN (0,1))`; nullable
    `active_attempt_id` FK attempt `DEFERRABLE INITIALLY DEFERRED`; `row_version INTEGER CHECK >=1`;
    nullable `retry_at`, `error_code` CHECK closed section-11 taxonomy, `error_message`, `storage_key`,
    `semantic_filename`, `sha256`, `byte_length INTEGER CHECK >0`, `started_at`, `ready_at`,
    `failed_at`; non-null `queued_at`, `updated_at`. Unique `(revision_id,format)`. Checks require
    attempts<=retry_ceiling<=max; ready requires storage/name/hash/size/ready_at, null retry/error and null active
    attempt; failed requires error/failed_at, null storage metadata and null active attempt;
    queued requires null active attempt/storage/error; running requires active attempt/started_at and
    null storage/error. `queued` also requires `retryable=1`, null started/ready/failed; `running`
    requires null ready/failed/retry; `ready` requires `retryable=0`, null failed; `failed` requires
    `retryable` equal taxonomy and null ready/started. Every timestamp/error/storage column in these
    state clauses is declared nullable; `queued_at`/`updated_at` remain non-null. Lifecycle-only
    updates use CAS; ready metadata immutable; no delete.
18. `accounting_pack_artifact_attempt`: `id` PK; `artifact_id` FK artifact;
    `attempt_number INTEGER CHECK >=1`; `durable_job_id` FK `job`; `job_run_id` FK `job_run`;
    nullable `retry_idempotency_key` FK finance idempotency, nullable
    `retry_authorization_evidence_hash`;
    `fencing_token UNIQUE`; `state` CHECK IN (`running`,`succeeded`,`failed`,`lease_lost`);
    `lease_until`, `started_at`; nullable `finished_at`, nullable `outcome` CHECK IN
    (`success`,`failure`,`lease_lost`), nullable `error_code` CHECK closed taxonomy, nullable
    `sanitized_error_message`. Unique `(artifact_id,attempt_number)` and `(job_run_id)`. Running
    requires null finish/outcome/error; succeeded requires finish/success/no error; failed requires
    finish/failure/error; lease_lost requires finish/lease_lost/`WORKER_LEASE_LOST`. Completed
    attempts immutable/non-deletable. Attempt 1 requires both retry fields null; attempts >1 require
    both non-null and exact matching `artifact_retry` evidence for this artifact.
19. `accounting_pack_integrity_incident`: `id` PK; `artifact_id` FK artifact; `detected_at`;
    nullable `detected_by` FK `user`; `expected_sha256`; `expected_byte_length INTEGER CHECK >0`;
    nullable `observed_sha256`, `observed_byte_length INTEGER CHECK >=0`; `state` CHECK IN
    (`open`,`resolved`); nullable `resolution` CHECK exactly `EXACT_BYTES_RESTORED`,
    `resolved_at`, `resolved_by` FK user. Partial unique one open incident per artifact. Open requires
    null resolution fields; resolved requires all resolution fields and verified matching bytes.
    Replacement revision does not resolve the old incident. No delete.
20. `finance_change_event`: `sequence INTEGER PRIMARY KEY`; `entity_type`, `entity_id`;
    `entity_version INTEGER CHECK >=1`; `occurred_at`; `payload_hash`; `provenance` CHECK IN
    (`native`,`legacy_observed`); nullable `actor_id` FK `user`; `correlation_id`. Unique
    `(entity_type,entity_id,entity_version)`. Only mechanically provable legacy versions receive a
    `legacy_observed` row; ambiguous rows remain explicit integrity exceptions. Immutable/no delete.
    Native insert runs under `BEGIN IMMEDIATE`; callers omit `sequence`, and a trigger requires
    `entity_version=COALESCE(MAX(entity_version for exact entity),0)+1` plus referenced entity hash/
    version equality. Legacy baseline events are inserted in deterministic entity/type/ID/version
    order and must also be contiguous for each emitted entity. Explicit sequence, gaps, regression,
    duplicate versions or an event version without matching immutable subject version abort.

Add exact columns to `invoice` for new contract rows: `snapshot_contract_version TEXT NOT NULL
DEFAULT 'legacy' CHECK(snapshot_contract_version IN ('legacy','v2'))`; non-null-on-v2-issue
`legal_entity_revision_id/hash`, entity code/currency/timezone, `issue_idempotency_key`,
`configuration_snapshot_json/hash`, `source_manifest_json/hash`, `calculation_algorithm_version`,
`calculation_hash`, and `invoice_subject_hash`. Existing rows backfill/default to `legacy`; the application explicitly sets
`v2` when constructing a new contract draft. The issue trigger rejects new issues unless version is
`v2` and every v2 snapshot/hash field is non-null/valid. It never upgrades a legacy issue implicitly.
Issued update guards make version and all snapshot fields immutable. Extend `invoice_source` with
non-null-on-new-write source snapshot hash and lock owner/instant; preserve its authoritative unique
`(source_type,source_id)` index and issued no-update/no-delete triggers.

Existing-table changes are equally frozen:

- `payment`: add non-null-on-new-write `legal_entity_revision_id` FK revision,
  `legal_entity_revision_hash`, `request_hash` and `recorded_by` FK user, plus
  `payment_contract_version TEXT NOT NULL DEFAULT 'legacy' CHECK IN ('legacy','v2')`. Preserve its positive
  amount check/idempotency unique; add unconditional update/delete guards. A trigger validates its
  invoice/entity/currency and outstanding balance. A cutover guard rejects every newly inserted row
  unless version `v2` and all evidence is non-null; `legacy` is accepted only for rows copied by the
  migration and cannot be inserted after the persisted cutover marker.
- `invoice_event`: add nullable `payment_id` FK payment and `payment_reversal_event_id` FK reversal;
  add `event_contract_version TEXT NOT NULL DEFAULT 'legacy' CHECK IN ('legacy','v2')`; expand
  `event_type` to include `payment_reversal`. Partial unique indexes on non-null `payment_id` and
  non-null `payment_reversal_event_id` prevent duplicate linked events. For v2, triggers require
  exactly one typed subject: `payment` requires only `payment_id`; `payment_reversal` requires only
  `payment_reversal_event_id`; every other event requires both null. The subject must belong to the
  same invoice and its amount/hash must match. V2 also adds `event_sequence INTEGER CHECK >=1`,
  `invoice_subject_hash`, `previous_event_hash`, and `event_hash`; unique invoice sequence and hash-
  chain triggers enforce section 7. Add nullable `authorization_idempotency_key` FK finance
  idempotency and `authorization_evidence_hash`; void, payment-reversal and over-credit authorization
  events require both and exact operation/target/hash agreement, while ungated event types require
  both null. Legacy events remain version `legacy` without guessed
  subject IDs. Event payload, actor/instant/version and subject FKs are immutable/non-deletable.
  Payment reversal creation inserts its linked v2 event in the same transaction.
- `invoice_adjustment`: add `adjustment_contract_version TEXT NOT NULL DEFAULT 'legacy' CHECK IN
('legacy','v2')` and non-null-on-v2-write `issue_idempotency_key`, `request_hash`,
  `source_link_hash`, legal-entity revision/hash and signed calculation hash; unique source/link and
  update/delete guards prevent duplicate or mutable credits/debits. The cutover guard rejects new
  legacy rows and any v2 null evidence.
- Legacy `compensation_settlement`: add unconditional update/delete abort triggers. No new service
  writes target it after cutover; the revision tables are authoritative.
- `expense`: add a prospective contract-version marker and guard direct changes to financial
  classification, reimbursement-paid amount/state/reference/date and payer/treatment fields once a
  principal/event exists. New flows derive those projections from immutable revisions/events.

`invoice_source` and `invoice_event` require constrained SQLite table rebuilds because their existing
`CHECK` clauses cannot be altered additively. The B2 migration leaf owns both rebuilds and performs:

1. Preflight `PRAGMA foreign_key_check`, capture row counts and a canonical ordered SHA-256 over every
   old column, and assert the expected `sqlite_master` index/trigger allowlist. Abort on unknown
   inbound FK, index or trigger rather than dropping it.
2. Under one `BEGIN IMMEDIATE`, create `invoice_source_v2 STRICT` with the original columns/FK/PK plus
   `source_contract_version TEXT NOT NULL DEFAULT 'legacy' CHECK IN ('legacy','v2')` and
   nullable-for-legacy `source_snapshot_hash`, `lock_owner_id` FK user and `lock_instant`; its exact
   source check is `time|expense|milestone|adjustment|minimum_top_up`. Copy old rows column-for-column,
   leaving new evidence null. V2 insert trigger rejects generic `adjustment`, requires
   `minimum_top_up` to reference an immutable `billing_minimum_adjustment` with identical version/hash,
   and requires snapshot hash/lock owner/instant for every new v2 reservation. Existing legacy
   adjustment rows remain readable but cannot be newly created or relabeled. After copy, insert one
   immutable database cutover marker `finance_contract_v2_write_cutover` in the existing migration
   metadata store. Insert triggers on `invoice_source`, `payment`, and `invoice_adjustment` reject
   `contract_version='legacy'` whenever that marker exists and require every v2 evidence column
   non-null/valid. Migration-copy SQL is completed before the marker and normal runtime cannot remove
   or update it.
3. Rebuild `invoice_event_v2 STRICT` with original columns plus the version/subject FKs and expanded
   event check above; copy old rows as `legacy`; install the typed-subject, unique-subject,
   immutability and delete constraints above.
4. Before either swap, assert copied count and canonical old-column SHA-256 equal preflight. Drop old,
   rename v2, and recreate `invoice_source_authoritative_unique`, `locked_invoice_source_unique`,
   `invoice_source_invoice_idx`, `invoice_event_invoice_idx`, `issued_invoice_source_no_update`,
   `issued_invoice_source_no_delete`, `draft_invoice_time_source_no_update/delete`, and
   `draft_invoice_expense_source_no_update/delete` with prior behavior plus new columns/types.
5. Before commit, repeat count/hash equality, index/trigger presence/SQL checks,
   `PRAGMA foreign_key_check`, `PRAGMA integrity_check`, and source uniqueness checks. Any mismatch
   rolls back the entire transaction. The migration never disables foreign keys, never maps a
   minimum top-up to `adjustment`, and never changes an old source/event semantic.
6. State-migration tests cover every lifecycle row shape for classification, principal, settlement,
   pack, artifact, attempt and integrity incident, including all legal nullable combinations and
   rejection of every illegal null/boolean/state combination. They inspect `PRAGMA table_xinfo` to
   prove INTEGER booleans and execute direct SQL before/after the cutover marker to prove preserved
   legacy rows coexist with mandatory non-null v2 writes.

Paid void requires active applied payments to equal zero after all payment reversals and requires no
unresolved applied credit/refund state. The service and trigger reject void otherwise. No trigger
rewrites payment, issue, credit, reversal or event history.

Before enabling new readers, add unconditional `BEFORE DELETE` abort triggers on legacy
`accounting_pack_run` and `accounting_pack_export`, and payload/storage-metadata no-update triggers.
This neutralizes the existing export `ON DELETE CASCADE`: neither a direct export delete nor a run
delete that would cascade can remove legacy history. Existing bytes remain referenced/read-only.

Migration verification runs against a blank DB and representative populated pre-migration DB and
asserts row counts, FKs, integrity, invoice snapshots/hashes, payments, reimbursements, existing
artifact bytes, and pre-existing ledger outputs are unchanged.

Rollback is application rollback with additive tables retained but unused. No down migration drops
financial data. A failed migration transaction rolls back entirely.

## 15. History-preservation blockers

These are true retroactive semantic ambiguities and must be reported as **BLOCKED**, not guessed:

1. `BLOCKED-FIN-001 — legacy daily minimum`: existing `project.client_daily_minimum_minutes` does
   not state per-worker versus per-project scope, eligible weekday/category/minute basis, project
   timezone revision, top-up rate selection, currency, split/rounding policy, or whether multiple
   workers share one minimum. Current code groups by day and uses the maximum encountered rate. Do
   not backfill any of those meanings or recalculate an issued invoice. Preserve issued snapshots;
   require Finance to create a prospective effective-dated policy. Unissued legacy drafts become
   stale/review-required. A historical correction is a new signed adjustment with documented
   accountant decision, never a rewrite of time/top-up/source rows.
2. `BLOCKED-FIN-002 — legacy expense amount basis`: existing rows do not prove whether
   `amount_minor` is net or receipt gross when `tax_amount_minor` is present, whether tax is
   inclusive/exclusive/recoverable, whether project-currency values came from an authoritative FX
   rate, whether reimbursement principal is gross/net/approved-partial, or whether customer
   billing uses net/gross/fixed allowance and markup before/after tax. It also does not reliably
   prove payer provenance when `who_paid` is null/unknown/legacy-defaulted, nor whether
   `client_treatment`/`billing_treatment` was explicitly selected, mechanically backfilled, or
   inherited from an obsolete default. Approval/audit provenance may be insufficient to distinguish
   those cases. Current pack code adds amount and tax to produce gross. Do not infer payer, J&A cash
   cost, worker obligation, client-direct treatment, billability, markup, or tax from nullable/
   defaulted fields; do not relabel/recalculate historical direct cost, reimbursement, customer
   billing, FX, or tax. Preserve recorded legacy figures with `legacy_unspecified` and explicit
   provenance flags, expose each dimension as an exception, and use a versioned prospective
   classification or signed correcting document/event. Never overwrite the legacy expense.

These blockers do not block the additive implementation, new prospective policy, legacy read-only
compatibility, or generation for clean explicitly classified data. They block only silent
historical reinterpretation and any claim that an ambiguous legacy revision is accountant-final.

## 16. Ownership DAG and bounded work packets

No two writers may edit `repository.ts`, `v3-repository.ts`, `schema.ts`, the same migration, or the
same portal route/component concurrently.

### B2-Core — exact finance semantics (complexity B, Sol medium)

Objective: implement calculation/allocation, legal-entity/timezone/config revision, expense,
reimbursement, credit/payment/ledger, and source-cut services.

Owned paths (assigned exclusively when started):

- new `packages/database/src/domains/finance/contracts.ts`
- new `packages/database/src/domains/finance/calculation.ts`
- new `packages/database/src/domains/finance/allocation.ts`
- new `packages/database/src/domains/finance/billing.ts`
- new `packages/database/src/domains/finance/expenses.ts`
- new `packages/database/src/domains/finance/reimbursements.ts`
- new `packages/database/src/domains/finance/payments.ts`
- new `packages/database/src/domains/finance/compensation.ts`
- new `packages/database/src/domains/finance/ledger.ts`
- new `packages/database/src/domains/finance/source-cut.ts`
- exact façade methods in `repository.ts` / `v3-repository.ts`, sequentially owned
- `packages/money/src/**` and `packages/billing-engine/src/**` only for accepted exact primitives
- focused finance unit/integration tests assigned to this packet

Forbidden: reporting renderers, invoice-template package, portal UI/API, schema/migration unless the
parent separately assigns them.

Acceptance: examples in sections 4–9 pass; concrete invoice/entity/timezone/config/internal-cost/
expense snapshots reconstruct historical ledger without current joins; source locks and draft/
issue/payment/reimbursement/credit/void idempotency pass; existing reconciliation assertions remain;
no issued history mutation; no floating money.

### B2-Migration — additive persistence leaf (complexity A, Luna max)

Dependency: B2-Core schema DDL contract frozen and migration number assigned.

Owned: one migration file, corresponding extracted Drizzle finance schema module, migration tests.

Forbidden: repository façades, renderers, UI, other migrations.

Acceptance: fresh/populated/schema-parity/foreign-key/integrity/row-count and rollback tests pass;
ambiguous legacy data remains tagged, not rewritten.

### B3-Core — revision/lifecycle repository (complexity B, Sol medium)

Dependency: B2 source-cut/reconciliation service and B2 migration integrated.

Owned: only new `packages/database/src/domains/accounting-packs/contracts.ts`,
`repository.ts`, `lifecycle.ts`, `artifacts.ts`, and `queries.ts`, plus exact sequential façade
adapters after B2 releases those façade files. B3 does not edit `domains/finance/**`; B2 does not edit
`domains/accounting-packs/**`. No shared `domains/accounting/**` catch-all path exists.

Forbidden: rendering, portal UI, invoice templates.

Acceptance: immutable revision and per-format state machine, audited final-to-superseded transition,
attempt/job-run fencing, exact restore/new-revision integrity recovery, authorization/step-up,
idempotency, direct-delete protection, and reconciliation-finalization guards pass.

### B3-Artifact — independent format runner (complexity A, Luna max)

Dependency: B3-Core interface frozen.

Owned: `packages/reporting/src/artifact-jobs.ts`, new `packages/reporting/src/accounting-pack/**`,
assigned reporting tests.

Forbidden: database files/migrations, portal, invoice templates.

Acceptance: forced PDF failure leaves XLSX/both CSV/JSON ready; each retry is isolated/idempotent;
atomic failure injection and hash/openability tests pass.

### B3-API/UI — lifecycle surface (complexity A, Luna max)

Dependency: B3-Core and B3-Artifact integrated; frontend hot files released.

Owned: accounting action/load/API route plus new extracted Accounting Pack component(s); never add
new catch-all logic to `PortalShell.svelte`.

Forbidden: database/reporting/migrations and unrelated portal sections.

Acceptance: queued/running/failed/ready/partial UI and 404/409/503/200 API semantics; retry,
regenerate, superseded revision access, responsive role evidence.

### B4-Templates — registry/renderers (complexity A, Luna max)

Owned: `packages/invoice-templates/**`, assigned template tests; schema enum/action/UI only in a
separately scheduled integration leaf.

Forbidden: Accounting Pack paths and financial repository calculations.

Acceptance: five materially distinct versioned families, validators, locale/snapshot/hash tests,
unknown/incompatible selector rejection, immutable issued rendering.

### B4-Reports — catalog/export leaves (complexity A with B financial query dependency)

Owned: new reporting catalog/descriptors/renderers and assigned query adapters/tests. Financial
query service remains B2-Core owned; non-financial technical/missing-activity adapters may be
separate backend leaves.

Forbidden: Accounting Pack job paths while B3 owns them; repository façades without sequential
assignment.

Acceptance: all 12 catalog IDs reachable/filterable/authorized and required formats open safely;
semantic filenames and privacy tests pass.

### Independent review

- `finance_integrity_reviewer`: exact examples, reconciliation, history, idempotency, artifacts.
- `security_reviewer`: finance read/write/step-up, IDOR, private artifacts, safe filenames.
- `spec_auditor`: requirement reconciliation after each tranche.
- `mobile_qa` / `desktop_qa`: B3/B4 UI at required roles/viewports.

Reviewer failures return to the responsible implementer; reviewer instances do not write.

## 17. Required test matrix

### Unit

- positive/negative half-away rounding; split invariance; largest-remainder ties; tax allocation;
  sign-partitioned/document/entity/project/stream/scope buckets, caps and signed credits
- tax arithmetic explicitly asserts `10,005 × 825 bps = 825`, gross `10,830`
- daily-minimum independent client/worker policies, DST-local dates, unique transactional top-up,
  concurrent retry/source reservation, frozen worker/role/default specificity, tied-rank ambiguity,
  policy/rate/stream/assignment entity/hash/currency mismatch, and `PER_PROJECT_LOCAL_DAY` rejection
- net/tax/gross/recoverable-tax/markup/fixed-allowance bounds; all-in/client-direct behavior;
  transaction/project/invoice/pack currency mismatch rejection and proof that P0 never resolves FX
- GROSS/NET receipt-basis adversarial order proves markup precedes customer tax and supplier tax is
  never reused as output tax (`14,700` and `11,908` examples)
- percentage compensation eligible/excluded categories and one-bucket rounding; immutable eligible
  manifest/config/calculation hash and persisted `ELIGIBLE_CLIENT_LABOR_NET` basis; unknown/mismatched
  basis rejection; settled correction creates n+1 without mutating n; generic
  adjustment/other direct-cost source types rejected
- semantic filename sanitization; CSV formula injection; XLSX Unicode/wide columns/openability
- template registry validation and all five material render contracts
- every section-66 mapping plus `missing-activity/default` resolves to a distinct authorized query/
  schema/format/filename descriptor; registry startup fails for a missing or duplicate semantic map

### Integration/invariants

- retryable duplicate invoice draft/issue/payment/reimbursement/credit/void/artifact events create one
  result; same idempotency key with different request hash conflicts
- partial reimbursement 5,000 + 7,345; overpayment/retry/exact single reversal; cached state equals
  event projection; event pins classification/principal version/hash; concurrent principal approval,
  lower-principal correction and reimbursement/source-principal currency mismatch rejection;
  legal-entity-timezone paid-date boundary
- exact invoice payment reversal negates target, preserves payment, restores AR and permits otherwise
  eligible void; partial/cross-invoice/entity/currency/reversal-of-reversal/second-target reversal
  rejected; same-key mismatch conflicts; concurrent reversals produce one row
- partial payment + credit AR example; active-ledger unpaid void yields AR zero while audit history
  remains; unpaid void test; prior-period open invoice appears in independent as-of AR but not current
  register; current credit applies to original AR, excess remains labeled/unallocated; over-credit
  gate; paid-invoice void rejection before reversal; historical
  reconstruction after entity/timezone/tax/template/internal-cost/expense configuration changes
- legal entity/currency isolation; non-overlapping effective assignment; source/entity mismatch;
  mixed currency never summed; unassigned project/missing legal-entity timezone blocks final
- source inclusion boundary cases for invoice issue, payment receipt, project-local time/expense,
  reimbursement paid date and later-month credit; source cut remains consistent under concurrent
  source/config writes and a missing monotonic watermark blocks authoritative creation
- regenerate creates revision n+1 and leaves n byte-for-byte unchanged/retrievable; finalizing n+1
  atomically/auditably marks final n superseded without changing n payload/artifacts
- direct-SQL classification/principal/settlement/pack tests prove draft/failed tails do not displace
  current/final truth, direct predecessor supersession aborts, activation-trigger ordering satisfies
  partial unique indexes, stale/branched predecessors fail, and an injected activation failure rolls
  back both rows with exactly one authoritative truth
- finalization rejects reconciliation mismatch, missing issued PDF, or non-ready required artifact
- initial create and regenerate keys/hashes are distinct and conflict on payload mismatch; locale
  change creates a revision in the same financial series, never a duplicate series
- series/revision reject null/global scope and mismatched legal-entity revision/hash/code/currency/
  timezone snapshots
- ready artifact metadata/file immutability; exact-byte backup restore versus new-revision recovery;
  any open incident blocks all-ready/finalization; retry taxonomy/max/monotonic effective-ceiling
  checks are exhaustive, including retryable->UNKNOWN and UNKNOWN->retryable mixed sequences;
  terminal errors cannot requeue
- compensation legacy upsert update/delete guards; finalized settlement revision supersession;
  ambiguous legacy settlement cannot become clean final; expense/reimbursement/principal direct
  mutation/delete guards
- mechanically provable baseline event gets exactly one unique entity/version event; ambiguous
  finance rows receive no guessed event and block clean-pack finality
- change-event gap/regression/explicit-sequence/hash-version mismatch and concurrent next-version
  insertion reject; committed database sequence and per-entity versions are strictly monotonic
- finalized legacy `period_report`/`report_source` protected-column/source-relink/direct-delete/cascade
  mutations reject while versioned corrections remain possible
- v2 payment/invoice-source/invoice-adjustment null-evidence and post-cutover legacy inserts reject;
  pre-cutover legacy rows remain byte-for-byte preserved; `PRAGMA table_xinfo` proves INTEGER booleans
  and every lifecycle nullable/state shape
- manual/correction direct-cost origin type/version/hash mismatch, duplicate origin, duplicate native
  authoritative snapshot and unknown native actor reject; unknown legacy actor remains a blocker
- finalize/regenerate/retry/void/reversal/over-credit step-up evidence must match principal/tenant/
  operation/target/amount/time/policy/hash; replay to another target or changed evidence conflicts
- invoice subject hash and chained typed-event sequence reject gaps, forks, wrong subjects and mutation
- half-open month boundaries and each payment reversal's own effective period pass across timezones/DST
- stale projection reports matching reason/watermarks without mutating history and only regenerate can
  produce a current replacement
- direct/cascade deletion of new and legacy financial history rejected, including payments,
  payment reversals, classifications, reimbursement principals/events, compensation revisions and
  the legacy pack/run cascade path
- realistic migration asserts every section 14.1 column/check/unique/FK/RESTRICT/non-null/trigger,
  preserves counts/snapshots/ledger, asserts all 20 additive tables, and tags nullable/unknown
  payer/treatment provenance and legacy compensation calculation ambiguity

### Artifact failure injection

- missing Chromium/logo: only PDF failed
- CSV renderer failure: other four independent
- crash before temp fsync, after fsync/before rename, after rename/before DB commit
- conflicting pre-existing final path; hash mismatch; storage full; expired lease; retry exhaustion;
  stale attempt/fencing-token completion changes zero rows and cannot publish bytes/metadata
- pending/failed/missing/integrity API maps to 409/409/404/503, never 500

### Browser

- normal user creates revision and automatic worker progresses statuses without manual admin action
- partial failure offers ready sibling downloads and scoped retry
- revision regenerate/superseded navigation and semantic download names
- five registered template selectors and required report catalog
- Finance/Owner at 360×800, 390×844, 430×932, 768×1024, and 1440×900+; keyboard/focus,
  one-column finance forms, deliberate mobile report/table representation

### Broader gates

Run focused tests first, then `test:unit`, `test:reporting`, `test:integration`, `test:invariants`,
`test:security`, `db:check`, `db:integrity`, `typecheck`, `build`, affected E2E, and final release
commands under Node 24.19.0. Reconciliation assertions may not be weakened.

## 18. Acceptance, rollback, and handoff

The tranche is accepted only when:

1. every deterministic example above passes in production services and tests;
2. independent finance and security reviewers approve;
3. forced PDF failure produces four ready sibling formats;
4. no queued/pending/failed supported download produces an accidental 500;
5. source cut/reconciliation/finalization and history invariants pass on fresh and populated DBs;
6. five templates and full report catalog are real, registered, authorized, and exportable;
7. the exact 20-table migration plus existing-table guards passes populated-history verification,
   including immutable reversal/principal/settlement histories and mechanical change-event coverage;
8. ambiguous legacy expense/compensation rows remain explicit non-final exceptions, never guessed;
9. RTM evidence is updated without promoting rows beyond verified implementation.

Rollback: stop new workers, drain/expire active artifact leases, revert application readers/writers
to the old read-only compatibility path, and retain all additive tables/files and new columns.
Because legacy compensation/reimbursement mutation is guarded after cutover, rollback must not
re-enable historical upserts; unresolved commands remain queued for forward recovery. Never delete
revisions, events, or artifacts. A format job may be requeued only through its declared transition
and idempotency key.

Required implementer handoff:

- behavior summary and exact changed files;
- migration number, DDL/backfill/provenance, and populated-DB results;
- calculation/config/source-cut interface changes;
- commands/results including forced failures and browser matrix;
- artifact/revision IDs plus hashes used as evidence;
- unresolved blockers/legacy exceptions;
- requirement IDs believed satisfied;
- any interface another owner must change.
