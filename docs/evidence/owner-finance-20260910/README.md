# Owner financial dashboard and Manage UI — 2026-09-10

The Owner landing page now shows exact, currency-separated customer collections, outstanding invoices, expected payments and recorded worker reimbursements. Six monthly cash-in/cash-out bars use actual dated transactions. Donuts separate overdue/not-overdue receivables and recorded/expected/unconfirmed worker payments. Tiles, bars, segments and legends open the cash calendar with matching currency, movement type and month filters, with links onward to original records. Existing invoice, expense and economic review workspaces remain directly reachable.

Collections include receipt reversals; cash out includes recorded reimbursements and receipt reversals. Undated actual movements are included in all-history cards but excluded from dated monthly bars and their drill-through. Finalized compensation without transfer evidence remains unconfirmed. This is recorded cash/obligations, not a bank balance, statutory income statement or complete supplier-bill register. No currency conversions, source mutations, schema changes or new payment assertions are introduced. Projects without cash movements retain a zero-value view in their original currencies.

The Owner-only server projection reuses the cash calendar's persisted-role/live-session authorization and consistent read snapshot. Worker/PM receive no Owner summary. English, Spanish and Portuguese copy and locale-aware exact-money formatting are included. SVG presentation attributes render correctly under the existing strict CSP; no policy relaxation or chart dependencies were added.

Manage has explicit primary/secondary/destructive buttons, active area navigation, focus styles, bordered forms and record cards, readable heading hierarchy and full clickable management-domain cards. Existing lifecycle actions, confirmation and correction requirements are preserved.

## Verification

- Financial summary and cash-calendar integration: **8 tests passed**. Covers exact large integers, currencies, reversals, partial receipts, overdue boundaries, undated sources, empty state and six-month/year boundaries.
- Security and invariants: **235 tests across 38 files validated**. The broad run passed 234/235; the root-loader projection mock needed the new cash dependency. Its complete eight-test suite then passed, with explicit assertions that PM never invokes/receives the Owner projection. No production authorization or test assertions were weakened.
- Final browser run: **20/20 passed** in 360/390/768/1440 widths. Covers visible nonzero SVG bars with recent disposable payment fixtures, mouse navigation on a painted donut segment, cards, period/currency/filter persistence, Worker denial, ES/PT copy, management navigation and milestone/technical-change creation/edit/deletion with button appearance assertions.
- Workspace typecheck passed. Final Svelte check: **0 errors**, 7 existing BillingSection unused-selector warnings. Focused ESLint and formatting checks passed.
- Production portal/site builds exercised by Playwright. Independent read-only review completed after the SVG/CSP correction.
- Screenshots contain disposable fixtures only. Existing historical screenshots are preserved; this directory contains the updated dashboard and Manage captures.

Production activation and Docker cache cleanup are recorded below after deployment.
