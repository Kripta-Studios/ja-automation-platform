# J&A Automation V3

This repository contains the production-oriented J&A Automation V3 product: a browser-safe multilingual
Next.js public site and a private SvelteKit PWA portal backed by SQLite, exact-money finance and
durable billing workflows. The revised unified specification is the authority for product behavior.

## Applications

- `website`: public Next.js website in English, Portuguese, and Spanish.
- `apps/portal`: private SvelteKit portal for workers, project managers, finance, and owner/admin.
- `packages/database`: reviewed SQLite migrations, repositories, and the demo seed.
- `packages/money` and `packages/billing-engine`: exact money, tax, and billing-period logic.
- `deployment`: Docker, Compose, Caddy, and systemd files for Ubuntu.

## Local development

Use Node 24.19.0 and pnpm 11.22.0.

```powershell
pnpm install --frozen-lockfile
pnpm demo:seed
$env:JA_DATABASE_PATH="$PWD\packages\database\data\demo.db"
$env:JA_MIGRATIONS_PATH="$PWD\migrations"
$env:JA_DOCUMENT_ROOT="$PWD\data\documents"
$env:JA_DEMO_MODE="true"
pnpm dev:portal
```

The portal opens at `http://127.0.0.1:5174/j-aautomation/app/login`. The public website includes an
Employee Portal login button in the header, mobile menu and footer. Demo role buttons require
`JA_DEMO_MODE=true`; production access is invite-only.

Start the public website in another terminal:

```powershell
pnpm dev:site
```

Open `http://127.0.0.1:5173/j-aautomation/en`.

## Demo data

`pnpm demo:seed` deletes and recreates `packages/database/data/demo.db`. The seed marks synthetic
clients, projects, users, time, expenses, and invoice previews as demo records. Planned time remains
separate from actual time. Labor and expense billing use separate streams.

## Quality gates

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm build
pnpm test:e2e
pnpm ops:backup:test
pnpm ops:restore-test
```

## Deployment

Follow [deployment/README_VPS.md](deployment/README_VPS.md). Caddy proxies the Next.js website to
`127.0.0.1:5101` and the SvelteKit portal to `127.0.0.1:5100`.

Public-site-only releases contain the `website/` source, exact workspace manifests, the site
Dockerfile and a verified standalone build. The site Dockerfile prepares a production dependency
tree with `pnpm deploy --prod --legacy` and copies it into the final image; `@swc/helpers` is direct
and is checked during the Linux container smoke test. Deploying one rebuilds and replaces only the
`site` container. It does not seed the database, migrate the portal or change Caddy.

[J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md](J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md)
for the product authority. Historical demo notes are retained in
[docs/MVP_DEMO_STATUS.md](docs/MVP_DEMO_STATUS.md) and are not an active completion checklist.
