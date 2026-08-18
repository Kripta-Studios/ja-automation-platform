# V3 implementation progress

> Scope note (2026-08-18): the current delivery target is the polished MVP demo described in
> [MVP_DEMO_STATUS.md](MVP_DEMO_STATUS.md). V3 remains the production roadmap and is not the
> completion checklist for this run. Working V3 foundations have been preserved.

## Environment

- Started: 2026-08-18, Europe/Madrid
- Required runtime: Node 24.19.0, pnpm 11.22.0
- Available runtime at start: Node 25.8.1, pnpm 11.22.0
- Source authority: `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`
- Legacy `website/` retained as a read-only migration reference until parity review.
- The VPS was inspected read-only for deployment compatibility. No remote configuration, service,
  repository, database, or credential was changed.

## Phase log

### Phase 0: safety and provenance

- Added root ignore rules, safe environment template, runtime pins, repository rules, and workspace catalog.
- Inventory of official originals: `docs/ASSET_MANIFEST.sha256`.
- Founding year: 2008, per V3.
- Public copy omits addresses, certifications, vacancies, compensation promises, testimonials, and performance claims.

### Verification

Run on 2026-08-18 with Node 25.8.1 because Node 24.19.0 was unavailable on the host. Repository engines, `.nvmrc`, container images, and CI inputs require 24.19.0.

| Gate                                                  | Result                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install`                                        | Pass; frozen lockfile generated. Host runtime warning recorded.                                   |
| `pnpm format:check`                                   | Pass                                                                                              |
| `pnpm lint`                                           | Pass, zero findings                                                                               |
| `pnpm typecheck`                                      | Pass across both apps and nine packages                                                           |
| Unit, integration, invariant, security, offline tests | Pass; 18 assertions                                                                               |
| `pnpm build`                                          | Pass; static site and Node portal                                                                 |
| Fresh migration, WAL, foreign keys, integrity         | Pass against real SQLite                                                                          |
| Playwright                                            | Pass in Chromium and WebKit; phone and desktop smoke tests plus the eight required viewport sizes |
| Online backup and disposable restore tests            | Pass                                                                                              |
| Production Compose configuration                      | Pass                                                                                              |
| Portal container build                                | Blocked because Docker Desktop's Linux engine was not running; Dockerfile review completed        |

Visual inspection covered the 390×844 and 1440×900 full-page captures. The remaining matrix passed automated overflow checks.

## Delivered baseline

- Static EN, PT-BR, and ES routes for the homepage, capabilities, industries, historical projects, Aquarex, about, careers, contact, privacy, and terms.
- Localized canonicals, hreflang, sitemap, robots, metadata, structured organization data, URL-shareable project filters, reduced motion, keyboard focus, and responsive navigation.
- Durable public contact, support, Aquarex, and career-interest submissions with Zod validation, origin checks, payload limits, honeypot handling, rate limits, SQLite persistence, and outbox events.
- Better Auth server boundary with password login, TOTP, passkeys, cookie integration, and public sign-up denial. Production invitation activation, schema reconciliation, MFA enrollment enforcement, session revocation, and step-up flows need integration tests before use.
- STRICT schema and Drizzle declarations for identity, clients, projects, assignments, planning, time, reports, technical records, expenses, compensation, billing, invoices, finance, documents, approvals, notifications, jobs, outbox, and audit.
- Integer money, cadence, tax, approval, authorization, sync, immutable-invoice, and all-in expense invariants.
- Authenticated portal route shell, worker views, local IndexedDB queue contract, scoped service worker, cache purge, and responsive phone navigation.
- Non-root Node container, Compose, Caddy routing, systemd unit, health endpoint, online-backup proof, and restore proof.

## MVP delivery added after the scope change

- Deterministic synthetic seed with Antonny Nascimento as owner/admin, three clients, four projects,
  six users, assignments, time, daily and PLC reports, expenses, rates, budgets, and invoice drafts.
- Repository-backed worker entry flows for actual time, daily reports, PLC reports, and receipt
  expenses, plus manager project and approval views.
- Coherent project finance showing planned versus actual hours, direct cost, travel/expense cost,
  billable value, Contribution Margin, invoiced amount, and budget consumption.
- Independent labor and expense billing streams with separate tax profiles and professional,
  print-ready invoice previews marked as demonstrations.
- Responsive worker and admin experiences verified at 390×844, 768×1024, and 1440×900.
- Ubuntu deployment bundle for two non-root containers behind native Caddy, bound only to loopback,
  with a systemd unit and explicit installation/verification procedure.

## Remaining V3 work (post-MVP)

The repository now provides a runnable migration baseline, not the complete V3 product. The following work remains before production or removal of `website/`:

- Reconcile and test Better Auth's generated schema against the reviewed migration; implement invitation activation, enforced enrollment, offboarding, and high-risk step-up.
- Replace portal presentation shells with repository-backed CRUD, approval history, technical artifact storage, receipt quarantine/scanning, full conflict resolution, and user-scoped cache records.
- Implement invoice issue transactions, numbering, source locks, payments, PDF retry, period-close jobs, detailed finance reconciliation, and concurrent writer tests.
- Expand the verified project archive after an owner checks every legacy entry; generate AVIF/WebP derivatives and complete Lighthouse/axe/screen-reader review.
- Add SMTP delivery, malware scanning, production legal text, accountant-approved numbering/tax profiles, encrypted offsite replication, deployment rehearsal, and rollback rehearsal.
- Complete the 27-item V3 end-to-end definition of done. No item that depends on the unfinished workflows is marked complete.

## External go-live inputs

Legal/privacy wording, tax profiles, SMTP, production origins, WebAuthn RP configuration, malware scanning, and encrypted offsite backup credentials require owner review. Adapters may remain disabled until operators supply those values.
