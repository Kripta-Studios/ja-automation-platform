# Architecture

J&A Automation is a TypeScript monorepo with two runtime boundaries:

```text
Internet -> Caddy /j-aautomation/*
              ├─ website (Next.js, 127.0.0.1:5101, browser-safe)
              └─ portal (SvelteKit, 127.0.0.1:5100, auth + domain + SQLite)
                               ├─ SQLite WAL database
                               ├─ private document root
                               └─ leased jobs/outbox runner
```

`website/` contains only public content, localized routes, SEO and JSON form clients. It does not
import SQLite, filesystem code, auth secrets, financial repositories or server invoice templates.
`apps/portal/` owns sessions, authorization, server actions, PWA behavior and protected APIs.

`packages/database` contains the reviewed migrations and repositories. The legacy repository remains
for compatible existing flows; `V3Repository` owns the V3 finance, compensation, reports, ledger,
Accounting Pack, documents and durable-job operations. `packages/money` uses bigint minor units;
JSON/server boundaries emit decimal strings. Time is integer minutes and percentages are basis points.

Billing has independent labor and expense streams. Invoice issue allocates a number inside a write
transaction, rechecks source versions, writes an immutable snapshot/hash and locks sources. PDFs and
exports are content-addressed artifacts recorded in the database.

Period reports are calculated snapshots, not hard-coded mock totals. A refresh reads actual approved
time, effective client labor rates, internal cost and compensation rules, daily minimum adjustments,
approved reimbursable expenses/markups, eligible milestones, invoice totals, payments, WIP, budgets
and forecast inputs. Customer snapshots omit internal cost/rate/margin data; internal snapshots keep
the detailed economics. Refreshing a report invalidates its previous PDF metadata and regenerates the
artifact from the new snapshot. Draft invoices are previews and may be rebuilt when new approved
source rows arrive; approved/issued invoices remain immutable.

Lifecycle dates are explicit: projects have a start date, optional planned end date and actual close
date; project assignments have a required start and optional end; worker accounts use creation as the
start marker and `offboarded_at` as an optional employment end marker. Planned time never becomes
actual time.

The service worker is scoped to `/j-aautomation/app/`, caches only safe portal shell assets, and
never stores bearer tokens or finance/audit/other-worker compensation data offline. Offline mutations
are submitted with a base version; the server returns explicit accepted/conflict/rejected outcomes.

## Fixture topology

Disposable fixture data uses the same two runtime boundaries and reviewed migrations as a real
deployment, but is limited to automated/local validation. `packages/database/src/demo-seed.ts`
creates synthetic records; it does not create a portal bypass or a shared passwordless session, and
no SQLite file or private upload is shipped in the release archive.

Browser tests add disposable Better Auth credential hashes to their isolated database and exercise
the same session, MFA and authorization boundaries as production users.
