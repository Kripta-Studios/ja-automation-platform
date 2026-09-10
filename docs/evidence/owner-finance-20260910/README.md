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

## Production delivery

Activated on **2026-09-10 at 13:12 UTC** from code commit `8724c9f5e26099721efe93f6e05cd7db78999c84`, pushed to `codex/v3-production-completion-orchestrated-20260819`.

- Release archive SHA-256: `01a4a5f14e46ff06c5f91d164e343b8b84863beb89b5b71ee71228e4a8ee6772`.
- Deployed through the reviewed `jaautomation-zip-deploy` helper. Pre-cutover online backup: `/var/backups/jaautomation/2026-09-10T131200927Z-1ce21b9d-04a3-445f-8844-f0430213a9b5`, including 29 private documents. Previous images retained as `rollback-20260910130913-01a4a5f14e46`.
- `verify-vps.sh https://j-aautomation.com/j-aautomation --wait-two-automatic-runs` passed. Web and portal healthy; jobs running with two successful automatic cycles. Public Owner landing redirects to authentication; Manage rejects unauthenticated access.
- Database integrity `ok`; zero foreign-key violations. Before/after counts unchanged for users, projects, invoices, payments, expenses, time entries and compensation settlements. No test fixtures loaded into production.
- Docker build-cache cleanup completed after container health checks became healthy. Docker reported **6.834 GB reclaimed**; filesystem free space increased by 6,189,264,896 bytes. Final build cache **0 B**. Active containers, private data, backups and rollback images retained; Navidrome remains running.
- Authenticated UI scenarios ran locally against disposable databases and production builds. Production evidence covers deployed source, routing, health, jobs and database integrity.
- Operational logs and state snapshots: `/var/lib/jaautomation-zip-deploy/manual/` (`deploy-8724c9f.log`, `verify-8724c9f.log`, `before-8724c9f.json`, `after-8724c9f.json`, `cleanup-8724c9f.json`).
