# V3 definition-of-done evidence

Updated: 2026-08-19. The revised V3 Definition of Done is implemented in the repository-backed
application path. The table maps each normative scenario to its implementation/evidence location.

| V3 scenario                                                 | Evidence                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1–4. Client/project, schedules, compensation setup          | `PortalRepository`, `V3Repository`, reviewed migrations, project/worker forms, exact-money tests                             |
| 5–8. Percentage compensation and independent rate economics | `V3Repository.workerPay`, rate-matrix precedence tests, basis-point percentage tests, finance time-economics view            |
| 9–14. Expense treatments, tax profiles, and cadences        | Expense repository/workflow, independent billing-rule forms, billing engine tests, cadence controls                          |
| 15–21. Worker time, My Pay, reports, PLC, receipts          | Worker portal forms, server actions, `workerPay`, report/PLC workflows, private receipt endpoint, offline browser flow       |
| 22–24. Operational and finance approvals                    | Versioned approval actions, finance billability decisions, role/project authorization checks, audit events                   |
| 25–27. Project contribution and independent expense billing | `projectFinance`, source-linked expense economics, labor/expense candidate queries and source locks                          |
| 28–32. Close, draft, review, tax-separated issue            | Period-close readiness, leased jobs, draft generation, invoice approval/issue transaction, labor/expense tax profiles        |
| 33. Immutable PDFs and traceability                         | Immutable invoice snapshot/source locks, hash-registered PDF metadata, authorized PDF route, idempotency test                |
| 34. Partial payment and received date                       | Payment repository state machine and integration coverage                                                                    |
| 35–36. Ledger and project reconciliation                    | `masterLedger`, project finance drill-down, exact contribution/revenue/cost/payment reconciliation                           |
| 37–39. Monthly Accounting Pack and exports                  | `createAccountingPack`, exact source reconciliation, PDF/XLSX/invoice CSV/expense CSV export routes and tests                |
| 40–41. Privacy and duplicate-billing invariants             | Repository privacy/search tests, role/project checks, worker API shape, source locks, idempotency keys                       |
| 42. Backup/restore                                          | Online SQLite backup, private-file manifest/hash validation, staged restore, `pnpm ops:backup:test`, `pnpm ops:restore-test` |

## Quality gates

- `pnpm typecheck`: pass.
- `pnpm format:check`: pass.
- `pnpm lint`: pass with zero findings.
- Unit, integration, invariant, security, and offline suites: pass.
- `pnpm build`: pass for the public Next.js site and SvelteKit portal.
- `pnpm jobs:build`: pass for the bundled durable runner.
- Configured durable-job smoke: 3 jobs and 6 outbox deliveries, zero failures.
- Fresh migration/WAL/foreign-key/integrity checks: pass.
- Playwright: 7 passed, 3 intentional scope skips (offline desktop-only, normal worker phone-only,
  viewport matrix desktop-only); public site and portal critical surfaces were checked on phone and
  desktop, including the worker offline queue/sync flow.
- Backup and restore proof: pass.

## Explicit non-claims

The product does not claim statutory accounting, customer-specific tax/legal correctness, SMTP
delivery, malware-scanner availability, encrypted off-site replication, or a completed real VPS
release until the customer supplies and applies those production inputs. The configurable mechanisms
and deployment runbooks are included.
