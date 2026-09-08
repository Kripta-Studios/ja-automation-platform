# Webapp acceptance and configuration register

Date: 2026-09-08. Source: `ASTRA_PLAN.md`. This register separates executable checks from decisions that require J&A or its accountant. Values below are synthetic examples, never production defaults. The original Excel workbook has not been supplied to this implementation session.

## Configuration dictionary

| Business term             | Application meaning                                                        | Decision owner / unresolved detail                                           |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Actual hours              | Factual work/travel duration on the source date                            | Worker, reviewed by PM; never generated from reference/minimum               |
| Reference day             | Effective project workday schedule                                         | Owner/PM supplies dates and weekdays                                         |
| Customer minimum          | Explicit additional billable quantity under configured rule                | Finance: applicability, category/day and percentage-pay eligibility          |
| Hourly including expenses | Hourly labour plus expense classifications that prevent customer rebill    | Owner: actual included/recoverable categories                                |
| Existing `all_in` model   | Fixed engagement branch; not a synonym for included hotel                  | Preserve existing records and opt-in fixed behaviour                         |
| Overtime multiplier       | Total rate multiplier, e.g. 1.6× is 160% of base                           | Owner: threshold/category/weekend policy; existing project/worker/date scope |
| Worker compensation       | Independent hourly/fixed/eligible-percentage amount                        | Owner: eligible basis and approved/invoiced/collected trigger                |
| Loaded direct cost        | Separately configured cost, not worker pay plus the same loaded cost again | Accountant confirms whether loaded cost includes pay                         |
| Worker statement          | Private explanation of own compensation and reimbursement                  | Not a tax invoice or payslip; supplier invoices remain conditional           |
| Every 14 days             | Anchored contiguous fourteen-day windows                                   | Finance supplies anchor                                                      |
| Twice monthly             | 1–15 and 16–month-end under existing cadence                               | Independent choice for labour and expenses                                   |
| Customer acceptance       | Evidence bound to exact safe report version and source coverage            | Named authorized signatory; dispatch is not signature                        |
| Issued invoice            | Immutable historical customer amount and document                          | Corrections use existing credit/void/replacement lifecycle                   |
| Scheduled payment         | Planned date on an unpaid obligation                                       | Finance; not evidence of an executed transfer                                |
| Receivable                | Issued amount less credits and net allocated receipts                      | Exact source and reversal reconciliation                                     |
| Contribution              | Explicit revenue basis less direct costs                                   | Not statutory net profit                                                     |
| Cash calendar             | Expected obligations/movements and separately actual events                | No opening bank balance or FX consolidation assumed                          |
| Final closeout            | Frozen audience-specific handover revision                                 | Owner/Finance; later events require new revision                             |

## Synthetic calculation review sheet

| Example                 | Inputs                                                                                               | Expected result                                                                   | Business approval                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| Minimum (U01)           | 4 actual hours, 12 reference, 8 minimum, sale 100/h, pay 50/h, loaded cost 60/h                      | Actual 4h; sale 800; pay 200; loaded cost 240; contribution 560 USD               | Pending real agreement                  |
| Overtime/travel (U03)   | 12 work + 2 travel hours, 8h threshold, sale 100/h ×1.6 overtime, pay 50/h ×2 overtime + travel 25/h | Sale 1,440; pay 850; actual 14h USD                                               | Pending threshold/category confirmation |
| Included expenses (U04) | 8h ×120 sale, pay 55/h, cost 65/h; hotel 150 + meals 40                                              | Revenue 960; direct cost 710; contribution 250 USD; reimbursement separate        | Pending included categories             |
| Customer-direct (U05)   | Same work; customer paid hotel/meals                                                                 | Revenue 960; direct cost 520; reimbursement 0 USD                                 | Pending real example                    |
| Recovery (U06)          | Same work; worker advanced hotel/meals, both recoverable at cost                                     | Revenue 1,150; direct cost 710; reimbursement obligation 190 USD                  | Pending receipt/recovery policy         |
| Percentage (U07)        | 55% of eligible labour 1,440                                                                         | Pay 792 USD; expenses/taxes excluded; travel addition requires explicit agreement | Pending basis/trigger                   |
| Cadence (U08)           | September 2026, 14-day anchor Sep 1                                                                  | Sep 1–14 / 15–28; semi-monthly Sep 1–15 / 16–30                                   | Pending stream choices                  |
| Independent tax (U14)   | Labour 1,000 at illustrative 0%; expenses 200 at illustrative 10%                                    | Separate invoices 1,000 and 220 USD; example taxes not production policy          | Accountant pending                      |
| Partial receipt (U15)   | Receive 600 against labour 1,000; receive 220 against expenses 220                                   | Outstanding 400 and 0 USD                                                         | Accountant pending                      |
| Forecast (U16)          | Expected outflows 3,000 + 500 before receipt 6,000                                                   | Net planned movements -3,500 then +2,500 USD; no bank-balance claim               | Finance dates pending                   |

## Scenario evidence routing

| Scenarios         | Existing regression anchor / required extension                                                           | Acceptance class                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| U01–U03, U09, U29 | commercial-policy-consumption, worker-compensation-essential, time-commercial-slices; preview integration | Automated plus actual-agreement review                    |
| U04–U06           | expense-commercial-classification, commercial-policy-consumption                                          | Automated plus receipt example                            |
| U07               | worker-compensation-essential                                                                             | Automated plus compensation agreement                     |
| U08               | client-essential-identifiers-dates and cadence tests                                                      | Automated                                                 |
| U10               | billing-engine cap/regression and commercial preview                                                      | Automated plus cap semantics                              |
| U11–U13, U21–U22  | customer-conformity-billing-gate, essential-http-boundaries; follow-up/closeout privacy                   | Automated/browser; named-signatory and publication policy |
| U14–U15, U18      | finance-truth-reversal, identifiers-dates, reporting artifacts                                            | Automated and accountant sample approval                  |
| U16               | settlement/reimbursement planning tests; cash calendar                                                    | Automated/browser                                         |
| U17               | Combined transfer allocation is conditional; preserve separate existing settlement/reimbursement facts    | Conditional extension                                     |
| U19               | Frozen accounting-pack revision tests                                                                     | Automated plus accountant cutoff approval                 |
| U20, U24          | period-report-automatic-jobs and localized artifact tests                                                 | Automated/artifact inspection                             |
| U23               | ASTRA notification integration regression                                                                 | New automated/browser evidence                            |
| U25               | ASTRA Aquarex form tests and durable public-intake tests                                                  | New automated/browser evidence                            |
| U26               | ASTRA closeout revision, authorization and artifact tests                                                 | New automated/browser evidence                            |
| U27–U28           | Supplier bill and advance accounting examples not supplied                                                | Conditional ERP extensions                                |
| U30               | ASTRA Help/manual download tests and PDF inspection                                                       | Automated/browser plus employee walkthrough               |

An anchor identifies the relevant suite; it does not assert every scenario already passes. Exact command/outcome evidence belongs in `ASTRA_IMPLEMENTATION_PROGRESS.md` and the final candidate report.

## Monthly accounting mapping to approve

Retain the existing frozen pack and PDF/XLSX/CSV outputs. Map the supplied workbook, when available, to invoice number, client/project/cost centre, service period, issuer/currency, issue/due/expected/actual collection dates, invoice subtotal/tax/total, credits, net collections, outstanding, direct labour sources, expenses, worker obligations/payment dates and source identifiers. Reconcile by entity and currency. Identify workbook formulas and cutoff rules explicitly before claiming compatibility. Late receipts/payments/corrections require the existing revision or adjustment lifecycle, never modification of the original frozen pack.

## Human decisions and release identity

- Owner: anonymized agreements, signatory authority, public claims/image rights, employee walkthrough and formal UAT.
- Accountant: actual invoice tax/identity details, compensation/cost interpretation, month-pack mapping and late-event rules.
- Operations: current rollout/rollback/restore evidence and deployed revision after a separately authorized deployment.
- Preserved decisions: MFA optional/no step-up (2026-09-06), offline deferred (2026-09-01), separate-host continuity waiver (2026-09-04). Local backup/restore remains required.

Plan commit `a2604fc` is pushed; application implementation evidence must identify its own subsequent candidate. Historical handbacks at `2058db2` and deployed baseline `6ec7b8a` do not prove this new candidate.
