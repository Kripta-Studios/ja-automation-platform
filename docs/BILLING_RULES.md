# Billing rules

## Commercial separation

Worker compensation, internal loaded cost and client bill rate are separate effective-dated rules.
The resolver applies assignment override, project/worker/category/activity specificity, explicit
priority, effective date and stable ID tie-breaks. Overtime methods are resolved independently for
each stream.

Supported client cadences are Weekly, Every 14 Days (anchored 14-day periods), Semi-Monthly (the
configured 1–15/16–end split), Monthly, Custom, Milestone and Manual. Every 14 Days is never treated
as Semi-Monthly.

## Labor and expenses

Labor and expense invoices have independent billing rules, currencies, tax profiles, templates,
recipients, grouping, payment terms, PO references and draft cadence. Auto-issue and auto-send are
hard-disabled in the database and application. Auto-draft is explicit and idempotent.

Approved billable time is the only source for labor lines. A client daily minimum creates a derived
adjustment linked to the actual source time IDs; it never creates a time entry. Approved reimbursable
expenses are the only expense-stream candidates. All-in, client-direct and informational expenses
remain out of expense invoice lines while approved direct cost still affects internal contribution
views according to who paid and treatment.

## Taxes and invoices

Tax components are applied in configured order with additive/compound behavior using exact minor-unit
arithmetic. Draft readiness checks pending approvals, missing rates, tax/legal configuration and
duplicate source locks. Issue rechecks source versions inside the issue transaction, allocates the
number from the accountant-approved policy, stores a hash and freezes the snapshot. Corrections use
credit/debit adjustment invoices; issued snapshots are not edited.

## Compensation

Hourly, daily, fixed-period, fixed-project, approved-adjustment and
`PercentageOfEligibleClientLabor` rules are supported. Percentage basis and settlement trigger are
stored explicitly. Percentage settlement excludes non-billable and ineligible client labor and uses
the money package's basis-point rounding. Worker-facing responses contain only the worker's own
time, reimbursement and estimate; they never contain client rates, internal costs or margin.
