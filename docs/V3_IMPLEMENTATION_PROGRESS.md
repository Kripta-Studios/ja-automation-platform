# V3 implementation progress

Last verified: 2026-08-19 (Europe/Madrid). The revised
`J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md` is authoritative. All commands below
were run from the repository root in `node:24.19.0-bookworm-slim` with pnpm `11.22.0`; host Node
version was not used for the acceptance gates.

## Phase 0 — preservation and baseline

Status: complete.

- Branch: `codex/v3-completion-20260819`.
- Recoverable preservation checkpoint: `e75c83a chore: checkpoint current V3 implementation`.
- The complete pre-existing V3 diff and legitimate untracked migrations/tests/deployment work were
  preserved. No reset, clean, discard, push, or production-host access was performed.
- Untracked presentation/contract/budget artifacts (`Presentacion_Proyecto_JA_Automation.html`,
  `J_A_Automation_Contrato_Proyecto_EVOCON_ES.html`, `J_A_Automation_Presupuesto_Proyecto_EVOCON_ES.html`,
  the EVOCON image and PDF) remain outside the implementation checkpoint and are excluded from
  staging. No database, upload, build output, `.env` credential, or secret is staged.
- Baseline and final gates use the required Docker Node runtime. `git diff --check` reports only
  Git's CRLF conversion warnings and no whitespace errors.

## Phase 1 — financial invariants and migration safety

Status: complete.

Reused and extended `packages/billing-engine`, `packages/database/src/repository.ts`,
`packages/database/src/v3-repository.ts`, and the existing source-lock/invoice engine. Capped T&M,
fixed-price/all-in allocation, hybrid included-minute/overage billing, custom cutoffs, daily
minimum top-ups, separate labor/expense taxes, percentage compensation, overtime, settlements,
partial payments, negative adjustments, immutable snapshots, source locks, and transaction-scoped
numbering are implemented.

Reviewed migrations remain contiguous and unsquashed: `0001`–`0011` plus `0012_session_step_up`,
`0013_audit_detail_fields`, `0014_commercial_billing_controls`,
`0015_user_lifecycle_mfa_policy`, `0016_better_auth_two_factor_fields`, and
`0017_better_auth_account_issuer`. `packages/database/src/schema.ts` declares the migrated
Better Auth, commercial, reporting, finance, document, job, and offline tables and columns.

Evidence: `tests/billing-engine.test.ts`, `tests/billing.test.ts`,
`tests/integration/commercial-billing.test.ts`, `tests/integration/invoice-lifecycle.test.ts`,
`tests/integration/v3-finance.test.ts`,
`tests/integration/database.test.ts`, and `tests/invariants/invoice.test.ts`. The integration suite
includes concurrent period close and concurrent issue attempts, plus declared-schema to migrated-
SQLite column parity; populated upgrade starts with a
pre-V3 business dataset and verifies its rows survive through migration 17.

## Phase 2 — identity, authorization, documents, and audit

Status: complete.

`apps/portal/src/lib/server/auth.ts`, `apps/portal/src/hooks.server.ts`, the security routes,
`packages/database/src/repository.ts`, and `packages/database/src/v3-repository.ts` provide
invite-only Better Auth sessions, active/suspended/offboarded/archived lifecycle checks, TOTP
enrollment/verification/recovery codes, passkey registration/revocation, session-bound step-up,
origin/rate-limit checks, role/project/ownership authorization, redacted audit detail, correlation
IDs, and explicit service actors. User-wide `last_step_up_at` is no longer consulted for protected
operations; the authoritative state is `session.step_up_at`.

Private document upload/download/scan routes validate MIME, filename, size, SHA-256, safe storage
keys, sensitivity, quota and scan state. Receipts, reports, PLC artifacts, invoice PDFs and
Accounting Pack exports are authorization-checked and emit download audit events. The actual
response CSP is nonce/hash based and contains no `unsafe-inline` or `unsafe-eval`; response header
checks were run against the production-like portal image.

Evidence: `tests/security/session-step-up.test.ts`, `tests/security/repository-privacy.test.ts`,
`tests/security/audit-redaction.test.ts`, the authorization branches in both repositories, and the
Docker Better Auth rehearsal (invitation acceptance → sign-in → TOTP setup → generated-code verify,
with migration version 17 and `two_factor.verified=1`).

## Phase 3 — worker operations and economics

Status: complete.

Actual minutes remain independent from planned/expected/minimum/guaranteed minutes. Regular,
commissioning, standby, travel, overtime, training and other configured categories are kept in the
time stream. Assignment-specific compensation, internal loaded cost and client bill rate resolve
through worker/category/activity overrides. Worker Pay, settlement triggers/bases and project
progress are privacy-filtered at the repository boundary.

Worker responses contain no client rate, internal cost, margin, revenue, or another worker's pay;
privacy tests assert this structurally and by serialized response inspection. Portal forms preserve
copy-layout behavior without copying time values, support exceptions and approval states, and keep
finance time-economics traceable from actual → approved → billable → contractual adjustment → worker
compensation → internal cost → revenue candidate → invoice state.

## Phase 4 — reports, invoices, and Accounting Pack artifacts

Status: complete.

`packages/reporting/src/exports.ts` is the single Playwright/Chromium HTML/CSS renderer used by
interactive and scheduled paths. The former handcrafted `simplePdf` path is retired. Versioned
template `2026.08.19.2` output is generated from immutable snapshots, persisted under stable
idempotent keys, SHA-256 hashed, byte-counted, and traceable to the source/template version.
Labor detailed/summary, expense, fixed/milestone, credit/adjustment, daily/period, technical/PLC,
customer/internal, closeout, and Accounting Pack artifacts use the shared service. Report snapshots
carry the selected English, Brazilian Portuguese, or Spanish locale; Finance chooses it when closing
periods, issuing invoices, or creating an Accounting Pack, while structured domain values remain
language-neutral. Reporting tests verify long multipage invoices, overflow-safe descriptions,
tax/currency rendering, locale selection, and repeat generation. Accounting exports include
reconciled PDF/XLSX/CSV registers.

## Phase 5 — portal architecture, responsive UX, localization

Status: complete for behavior and acceptance; incremental maintainability extraction recorded.

`apps/portal/src/lib/portal-navigation.ts` owns primary/secondary/admin/security navigation and
`portal-i18n.ts` owns EN/PT-BR/ES dictionary/DOM translation. Existing behavior in
`PortalShell.svelte` was preserved while the chrome moved to `PortalChrome.svelte`. Server actions
are now split by domain: `action-utils.ts`, `actions/operations-actions.ts`, and
`actions/billing-actions.ts`; the route action module retains the operational/project/time/expense
and finance-economics surface without a parallel implementation. Navigation, offline, security,
artifact and localization concerns were extracted incrementally; no portal rewrite or duplicate
domain data model was introduced. Worker navigation is Today/Time/Reports/Expenses/Projects with
Documents secondary. Admin exposes the specified dashboard, project/client/team/planning/time/report/
PLC/expense/approval/billing/invoice/finance/document/notification/settings/audit surfaces without
duplicate Billing/Finance groups.

The frontend-design and stop-slop reviews were applied to the existing visual system. Automated Axe
WCAG 2.2 AA checks pass on public and worker surfaces at phone and desktop. Playwright target
viewport checks cover 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900 and
1920×1080; representative worker phone, admin desktop, invoice, and public screenshots were
visually inspected. Responsive tables, focus restoration, keyboard controls, reduced motion and
200% zoom styles remain in the portal CSS.

## Phase 6 — public website

Status: complete.

The existing Next.js site retains its approved design/assets and now includes technology ecosystem,
delivery process, remote support, team capability, Aquarex, Careers, URL-shareable project filters,
localized EN/PT/ES routes, legal pages, structured metadata, sitemap/robots, accessible forms and
the employee portal entry. No unverified client, certification, metric or company claim was added.
The standalone image has no database/private/auth mount.

## Phase 7 — offline and automation

Status: complete.

The service worker scope is exactly `/j-aautomation/app/`; only worker-safe shell routes and static
assets are cacheable. IndexedDB stores time, daily report, technical report and expense mutations,
assigned-project metadata and receipt bytes. Sync is idempotent, attachment uploads are hash/private,
conflicts never overwrite server changes, and logout purges the user cache. The browser E2E now
proves time, daily, technical and expense/receipt offline drafts, reconnect sync, and zero remaining
mutation/attachment records.

Leased jobs/outbox use bounded retries, idempotency, failure visibility, explicit finance service
actor selection, stable artifact keys, reminders, period close, draft generation, PDF work and
Accounting Pack work. Auto-issue and auto-send remain disabled.

## Phase 8 — observability, deployment, and acceptance

Status: complete in local/test topology; real VPS deliberately untouched.

Structured JSON request/job logs include correlation and actor context. Health checks cover migration
version, SQLite integrity/WAL/foreign keys, write readiness, required private directories and disk
free space. Upload quotas, backup/restore validation, job/PDF/email failure logging and signed alert
hooks are implemented. `deployment/` contains Caddy, Compose, non-root read-only site/portal images,
systemd service/timers, installer, verification and rollback runbooks.

Validation evidence:

- `docker compose -f deployment/compose.production.yml config --quiet`: pass.
- Caddy snippet adapted and validated with the Caddy 2 container: `Valid configuration`.
- Site image rehearsal: `/j-aautomation/en` HTTP 200.
- Portal image rehearsal after installer-equivalent UID 10001 directory provisioning: live 200,
  detailed API health 200, migration 17/17, writable directories true, write-ready true.
- Disposable staged-release rehearsal passed with `ja-automation-site:audit-final3` /
  `ja-automation-portal:audit-final3`, then rollback to the prior `audit-final2` images on the same
  fresh named volume: both site HTTP 200 and portal readiness passed in each stage; all containers
  and the test volume were removed afterward.
- Seeded jobs image rehearsal with explicit finance actor and synthetic HTTPS outbox receiver:
  6 jobs completed, 6 deliveries processed, 0 final failures.
- `pnpm ops:backup:test`: pass; `pnpm ops:restore-test`: pass.

## Acceptance command results

All commands were run under Node 24.19.0/pnpm 11.22.0 unless noted.

| Gate                                                               | Result                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                   | Pass; Node 24.19.0/pnpm 11.22.0, lockfile policy verified      |
| `pnpm typecheck`                                                   | Pass; 10 workspace projects checked                            |
| `pnpm format:check`                                                | Pass                                                           |
| `pnpm lint`                                                        | Pass; zero findings                                            |
| `pnpm test:unit`                                                   | Pass; 9 files, 22 tests                                        |
| `pnpm test:integration`                                            | Pass; 5 files, 9 tests                                         |
| `pnpm test:invariants`                                             | Pass; 1 file, 1 test                                           |
| `pnpm test:security`                                               | Pass; 4 files, 8 tests                                         |
| `pnpm test:offline`                                                | Pass; 1 file, 2 tests                                          |
| `pnpm test:reporting` with `JA_CHROMIUM_PATH=/usr/bin/chromium`    | Pass; 1 file, 3 tests (EN/PT-BR/ES locale coverage)            |
| `pnpm build`                                                       | Pass; Next.js 219 generated routes and portal production build |
| `pnpm jobs:build`                                                  | Pass; durable runner bundle                                    |
| `pnpm db:migrate:fresh && pnpm db:integrity && pnpm db:check`      | Pass; WAL, FK, integrity and migration 17                      |
| populated migration upgrade (`tests/integration/database.test.ts`) | Pass; business rows preserved through 17                       |
| full Playwright E2E with Chromium                                  | Pass; 16 tests, 13 passed, 3 intentional scope skips           |
| Axe accessibility E2E                                              | Pass; 4 tests (phone/desktop public + portal)                  |
| backup/restore drills                                              | Pass                                                           |
| staged deploy/rollback rehearsal                                   | Pass; final3 release and final2 rollback both healthy          |

The three E2E skips are intentional viewport/role scope guards (desktop-only offline flow,
phone-only worker mutation flow, and desktop-only public viewport matrix); no required behavior is
hidden behind a skip.

## Schema, legacy, and external prerequisites

- Declared Drizzle schema, repositories, documentation and reviewed SQL migrations agree through
  migration 17. No migration was squashed or renumbered.
- Report language selection is persisted in immutable invoice, period-report, and Accounting Pack
  snapshots, so no schema migration is needed for this language-neutral structured-data extension.
- `simplePdf` and the duplicate portal/job artifact implementation were retired/consolidated.
- `docs/MVP_DEMO_STATUS.md` remains historical only. Obsolete .NET/PostgreSQL code was not
  exhaustively traversed because the revised specification does not require it.
- Software-verifiable requirements have no known implementation blocker. External configuration still
  required before a real release is customer-specific: production `JA_AUTH_SECRET`, WebAuthn/DNS,
  SMTP/outbox/alert/malware-scanner endpoints, encrypted off-site backup target, accountant-approved
  legal entity/tax/numbering/retention values, final recipients and explicit VPS authorization.
  Synthetic/test configuration proves each mechanism; no real VPS or production data was touched.

## Definition-of-done evidence

The 42-step normative scenario is mapped in `docs/V3_DOD_EVIDENCE.md`; repository integration,
security, artifact, offline and E2E tests provide the executable evidence. Remaining external items
are configuration approvals only, not code-implementable TODOs.
