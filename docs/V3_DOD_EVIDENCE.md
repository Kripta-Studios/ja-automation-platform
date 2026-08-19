# V3 Definition-of-Done evidence

Verified 2026-08-19 against
`J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`. The table is an evidence index, not a
substitute for the specification.

| Steps                                                          | Executable evidence                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4 client/project numbering, schedule and hourly compensation | `PortalRepository` client/project/assignment APIs; `V3Repository` compensation/rate APIs; `tests/integration/v3-finance.test.ts`; populated migration test       |
| 5–8 percentage compensation, overtime and rate matrix          | `packages/billing-engine/src/index.ts`; `V3Repository.workerPay`; `tests/billing-engine.test.ts`; `tests/integration/v3-finance.test.ts`                         |
| 9–14 expense treatments, independent taxes and cadences        | expense repository state machine; labor/expense billing rules; `tests/billing.test.ts`; `tests/integration/v3-finance.test.ts`                                   |
| 15–21 worker time, My Pay, reports, PLC and receipts           | worker portal forms/actions; private document routes; offline IndexedDB flow; full Playwright worker/receipt and offline E2E                                     |
| 22–24 operational/finance approvals                            | versioned approval actions and audit events in `repository.ts`/`v3-repository.ts`; role/project authorization tests                                              |
| 25–27 project cost/revenue and independent expense stream      | `V3Repository.projectFinance`, `masterLedger`, source-linked expense economics; commercial integration tests                                                     |
| 28–32 period close, drafts, review and tax-separated issue     | `closeBillingPeriod`, readiness checks, draft builder, issue transaction, labor/expense tax profiles; concurrent close/issue integration test                    |
| 33 immutable PDFs and traceability                             | `packages/reporting/src/exports.ts`, stable artifact jobs, invoice PDF route; `tests/reporting-artifacts.test.ts`, `tests/integration/invoice-lifecycle.test.ts` |
| 34 partial payment/received date                               | `V3Repository.recordPayment`, ledger payment projection; `tests/integration/v3-finance.test.ts`                                                                  |
| 35–36 ledger and project reconciliation                        | `masterLedger`, `projectFinance`, Accounting Pack reconciliation; finance integration test                                                                       |
| 37–39 Accounting Pack and exports                              | `createAccountingPack`, PDF/XLSX/CSV export routes, source reconciliation; reporting artifact test                                                               |
| 40–41 worker privacy and duplicate-billing invariants          | `tests/security/repository-privacy.test.ts`, `tests/security/audit-redaction.test.ts`, source-lock/idempotency and concurrency tests                             |
| 42 backup/restore                                              | `deployment/scripts/backup.mjs`, `restore.mjs`, `pnpm ops:backup:test`, `pnpm ops:restore-test`                                                                  |

## Gates

- Typecheck, Prettier, ESLint, unit (9 files/22 tests), integration (5/9), invariant (1/1), security
  (4/8), offline (1/2), reporting (1/2 with Chromium), production builds, migration/integrity,
  backup/restore, full E2E (16 total: 13 pass, 3 scope skips), and Axe (4/4) all pass under Node
  24.19.0.
- The service-worker E2E covers time, daily report, PLC/technical report, expense and receipt queue
  behavior; after each reconnect, IndexedDB has zero pending mutations/attachments.
- No test skip suppresses required behavior; skips only prevent running the same role/viewport flow
  in an inapplicable project.

## External configuration boundary

Accountant approval of tax/legal/numbering/retention rows, production secrets and endpoints, DNS,
SMTP/scanner/outbox/alert configuration, and authorized VPS release are intentionally external. The
software mechanisms are implemented and exercised with synthetic/test values; no production host or
production records were accessed.
