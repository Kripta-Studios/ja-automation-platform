# J&A Automation VPS deployment

This directory describes the supported Ubuntu 24.04 + Caddy + Docker Compose deployment for the
V3 product. The public Next.js site listens only on `127.0.0.1:5101`; the private SvelteKit portal
and server APIs listen only on `127.0.0.1:5100`. Caddy is the only Internet-facing proxy.

The deployment does not run a seed, does not use `drizzle-kit push`, and does not enable automatic
invoice issue or send. The scheduled jobs may create drafts, PDFs, reports and Accounting Pack
artifacts, but external delivery is handled only by the configured signed outbox adapter.

The supported deployment has one access model: invite-only Better Auth sessions. The first owner is
provisioned once by the operator; no seed, shared account or passwordless role switch is enabled.
See [docs/SHOWCASE_ACCESS.md](../docs/SHOWCASE_ACCESS.md) for the portal access runbook.

## Files and services

- `compose.production.yml` — site, portal, optional one-shot jobs and tools.
- `Caddyfile.snippet` — `/j-aautomation` routing, including the portal login entry point.
- `jaautomation.service` — builds and starts site and portal containers.
- `jaautomation-jobs.service` / `.timer` — runs leased, idempotent jobs every five minutes.
- `jaautomation-backup.service` / `.timer` — online SQLite backup plus private-file manifest.
- `scripts/install-vps.sh` — explicit host integration; review it before running with `sudo`.
- `scripts/verify-vps.sh` — local/HTTPS liveness, readiness and routing checks.

## Host layout

```text
/etc/jaautomation/jaautomation.env       mode 0600, root-owned
/var/lib/jaautomation/data/              SQLite database and WAL
/var/lib/jaautomation/files/             private receipts, reports, invoices and exports
/var/backups/jaautomation/               online backups and manifests
/opt/jaautomation/current/               checked-out release
```

The portal container runs as UID `10001`, has a read-only root filesystem, and receives only the
database/document volume and explicitly configured environment. The public site has no database,
document, finance or auth-secret mount.

## First installation

1. Copy the reviewed repository to `/opt/jaautomation/current` and inspect the deployment files.
2. Confirm Docker Engine/Compose, Caddy, free disk space, DNS and TLS are ready.
3. Run `sudo bash deployment/scripts/install-vps.sh` only after reviewing its Caddy and systemd
   changes.
4. Edit `/etc/jaautomation/jaautomation.env` and replace `JA_AUTH_SECRET` with a random secret.
   Set the production origin, WebAuthn RP/origin, backup destination, job actor and outbox adapter.
5. Apply reviewed SQL migrations with the repository migration command against the intended empty or
   existing database. Never use `drizzle-kit push` in production. Migrations 0019–0024 are additive;
   migration 0024 creates the Accounting Pack snapshot/legacy bridge but deliberately does not infer
   or globally backfill links for historical runs. A legacy run needs an explicit, scoped,
   command- and audit-anchored bridge before it can reference a canonical snapshot.
6. Start the service and timers:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://example.invalid/j-aautomation
```

The portal container healthcheck and local VPS verifier use `/j-aautomation/health/ready` directly
on the loopback portal listener. Caddy accepts `/j-aautomation/health/*` only from loopback and
returns 404 to external clients. Readiness fails closed when
SQLite cannot be opened or queried, migrations are stale, required private artifact directories are
not writable, or the document volume is below `JA_MIN_FREE_BYTES`. That setting is a validated
non-negative integer byte count and defaults to 1 GiB in the production environment examples.

The first real environment still needs accountant-approved legal entity, tax profile and invoice
number policy rows before an invoice can be issued.

## First-owner provisioning

After migrations have been applied to the intended database, build the tools target and provision
the first owner. The command prompts for the password without echoing it; it requires 12–128
characters and marks the account for MFA enrollment.

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml build portal bootstrap-owner
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps \
  -e JA_BOOTSTRAP_EMAIL=owner@example.com \
  -e JA_BOOTSTRAP_NAME='J&A Owner' \
  bootstrap-owner
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://example.invalid/j-aautomation
```

The owner signs in through `/j-aautomation/app/login`, enrolls MFA, then invites the rest of the
team from Projects → Team. Do not run the fixture seed against a production database, copy a local
SQLite file, or expose ports 5100/5101 directly.

Do not use `drizzle-kit push`, copy a local SQLite file, commit a database, or expose ports 5100/5101
directly. Caddy remains the only Internet-facing proxy and the portal service worker remains scoped
to `/j-aautomation/app/`.

For a copy/paste operator message to the VPS coding agent, use
[VPS_CODING_AGENT_HANDOFF.md](VPS_CODING_AGENT_HANDOFF.md). It includes checksum verification,
extraction boundaries, first-owner provisioning, service start, health checks and the explicit
instruction not to touch the authority specification.

## Release and rollback

For the reviewed ZIP build, upload, watcher installation and one-command deployment workflow, see
[`docs/RELEASE_ZIP_DEPLOY.md`](../docs/RELEASE_ZIP_DEPLOY.md). The repository provides
`scripts/build-release-and-upload.ps1`, `deployment/scripts/jaautomation-zip-deploy` and
`deployment/scripts/install-jaautomation-zip-deploy.sh` for this VPS layout.

Build from a reviewed commit, record the release tag and SHA-256, then run:

```bash
sudo env JA_RELEASE_TAG=2026.08.19 docker compose \
  --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml up -d --build --remove-orphans
sudo bash deployment/scripts/verify-vps.sh https://example.invalid/j-aautomation
```

Before replacing an image, tag the active site and portal images as rollback images. If the health
checks fail, restore the previous tag with `up -d --no-build` and leave the database/files volume
untouched. Do not use `docker compose down` during a routine release. Keep at least one tested
rollback image and one recent verified backup.

For the current operator handoff, the release ZIP is copied to `/home/kripta/` on the VPS before
deployment. Verify its SHA-256 there, extract only into `/opt/jaautomation/releases/`, and point
`/opt/jaautomation/current` at the extracted release directory. The archive contains the public
`website/`, the private `apps/portal/`, reviewed packages/migrations and the disposable
`packages/database/src/demo-seed.ts` source for isolated validation; it does not contain a SQLite
database, private uploads, generated reports/build output or production secrets. Never run the demo
seed against the production database.

## Jobs and outbox

The jobs container claims each job/event with a lease and idempotency key. Failed deliveries retain
attempts, last error and terminal-failure state. Configure both
`JA_OUTBOX_WEBHOOK_URL` and `JA_OUTBOX_WEBHOOK_SECRET`; production URLs must be HTTPS. The adapter
must deduplicate `x-ja-idempotency-key` and verify `x-ja-signature` (`sha256=<HMAC-SHA256>`). If the
adapter is absent or rejects a request, the event is not marked delivered.

The same worker renders localized PDFs through the `localized_pdf_variant_render` job and
`artifact.localized_pdf.render` capability. It supports `en-US`, `es-ES` and `pt-BR` variants for
invoice, period-report, Accounting Pack, Daily Field Report and PLC / Technical Report sources. Each
locale has an independent `queued`, `running`, `ready` or `failed` lifecycle, fenced attempts and
retry metadata. Only a verified ready artifact is downloadable. `JA_JOB_ACTOR_ID` is mandatory for
the jobs container and must identify an active `owner_admin` or `finance_admin` service actor; the
worker also verifies private-root containment, no-symlink parents, PDF magic bytes, byte length and
SHA-256 before publication.

For a local worker build and run:

```bash
pnpm jobs:build
node deployment/jobs-build/jobs-run.mjs
```

The systemd timer invokes the equivalent container command every five minutes. A queued request is
not a ready artifact: the portal reports `202` with `Location`/`Retry-After` until the worker actually
publishes the PDF, and pending/missing/integrity-failed downloads use explicit non-500 responses.

## Operations

The jobs and backup timers emit structured JSON. Set `JA_ALERT_WEBHOOK_URL` and
`JA_ALERT_WEBHOOK_SECRET` to receive signed (`sha256=<HMAC-SHA256>`) failure alerts. Production
alert URLs must use HTTPS. Missing alert configuration is visible in logs and remains a valid
local/test configuration.

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml ps
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml logs --tail=200 portal site
sudo systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer --no-pager
df -h /
```

Backups use Node's online SQLite backup API so WAL contents are included consistently. Restore is a
staged operation that rejects symlink roots/entries, checks integrity, foreign keys, document hashes
and safe manifest paths before an atomic database/document swap. An overwrite failure rolls back to
the original roots. See `docs/BACKUP_RESTORE.md` for the runbook.

## Production configuration still required

The repository provides the mechanism but cannot supply the customer's real values: auth secret,
SMTP/form recipient, signed outbox/CRM adapter, malware scanner, encrypted off-site backup target,
accountant-approved tax/legal/numbering configuration, disk-alert destination, and final client
recipient/currency data. These are deployment inputs, not code placeholders.
