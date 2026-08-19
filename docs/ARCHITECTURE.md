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

The service worker is scoped to `/j-aautomation/app/`, caches only safe portal shell assets, and
never stores bearer tokens or finance/audit/other-worker compensation data offline. Offline mutations
are submitted with a base version; the server returns explicit accepted/conflict/rejected outcomes.

## Showcase topology

The showcase uses the same two runtime boundaries and reviewed migrations as a real deployment. The
only intentional difference is `JA_DEMO_MODE=true`: the portal exposes signed, expiring role buttons
that select seeded users. `packages/database/src/demo-seed.ts` creates the synthetic workspace on the
VPS after the image is built; no SQLite file or private upload is shipped in the release archive.

Antonny Nascimento (`antonny.luty@j-aautomation.com`) is the seeded `owner_admin`. Finance, project
manager and worker identities use synthetic `.local` addresses. Their role-scoped repository reads
and writes still pass through the same authorization checks as production sessions.
