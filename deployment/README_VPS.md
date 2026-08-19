# J&A Automation VPS deployment

This directory describes the supported Ubuntu 24.04 + Caddy + Docker Compose deployment for the
V3 product. The public Next.js site listens only on `127.0.0.1:5101`; the private SvelteKit portal
and server APIs listen only on `127.0.0.1:5100`. Caddy is the only Internet-facing proxy.

The deployment does not run a seed, does not use `drizzle-kit push`, and does not enable automatic
invoice issue or send. The scheduled jobs may create drafts, PDFs, reports and Accounting Pack
artifacts, but external delivery is handled only by the configured signed outbox adapter.

The separate showcase procedure intentionally runs the reviewed synthetic seed and sets
`JA_DEMO_MODE=true`. It is documented in [docs/SHOWCASE_ACCESS.md](../docs/SHOWCASE_ACCESS.md) and
must not be used as a production/customer-data procedure.

## Files and services

- `compose.production.yml` — site, portal, optional one-shot jobs and tools.
- `Caddyfile.snippet` — `/j-aautomation` routing, including the portal login entry point.
- `jaautomation.service` — builds and starts site and portal containers.
- `jaautomation-jobs.service` / `.timer` — runs leased, idempotent jobs every five minutes.
- `jaautomation-backup.service` / `.timer` — online SQLite backup plus private-file manifest.
- `scripts/install-vps.sh` — explicit host integration; review it before running with `sudo`.
- `scripts/verify-vps.sh` — local/HTTPS health checks.

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
   existing database. Never use `drizzle-kit push` in production.
6. Start the service and timers:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://example.invalid/j-aautomation
```

The first real environment still needs accountant-approved legal entity, tax profile and invoice
number policy rows before an invoice can be issued.

## Showcase installation with mock data

Use this section only for the public walkthrough. It assumes the release has been extracted to
`/opt/jaautomation/current` and that the host has been prepared by the installer. The commands below
replace the showcase database on that host; take an online backup first if the volume contains data.

```bash
sudo install -o root -g root -m 0600 deployment/jaautomation.showcase.env.example \
  /etc/jaautomation/jaautomation.env
sudo sed -i "s|^JA_AUTH_SECRET=.*|JA_AUTH_SECRET=$(openssl rand -hex 32)|" \
  /etc/jaautomation/jaautomation.env
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml config --quiet
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml build site portal demo-seed
OWNER_ID=$(sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps demo-seed \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["demoUserIds"]["admin"])')
test -n "$OWNER_ID" && test "$OWNER_ID" != "null"
sudo sed -i "s|^JA_JOB_ACTOR_ID=.*|JA_JOB_ACTOR_ID=$OWNER_ID|" \
  /etc/jaautomation/jaautomation.env
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://gex-dashboard.hopto.org/j-aautomation
```

The seed output also lists the owner email, every demo user ID, project IDs and invoice draft IDs.
The owner ID is used only as the active finance-capable service actor for leased jobs. The public
login still uses the role button, not that ID. Confirm `JA_DEMO_MODE=true` before the walkthrough;
set it to `false`, rotate `JA_AUTH_SECRET`, and use invite-only Better Auth before any real use.

Do not use `drizzle-kit push`, copy a local SQLite file, commit a database, or expose ports 5100/5101
directly. Caddy remains the only Internet-facing proxy and the portal service worker remains scoped
to `/j-aautomation/app/`.

For a copy/paste operator message to the VPS coding agent, use
[VPS_CODING_AGENT_HANDOFF.md](VPS_CODING_AGENT_HANDOFF.md). It includes the archive name, checksum
verification, extraction boundary, showcase seed, owner service actor configuration, service start,
health checks and the explicit instruction not to touch the authority specification.

## Release and rollback

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

## Jobs and outbox

The jobs container claims each job/event with a lease and idempotency key. Failed deliveries retain
attempts, last error and terminal-failure state. Configure both
`JA_OUTBOX_WEBHOOK_URL` and `JA_OUTBOX_WEBHOOK_SECRET`; production URLs must be HTTPS. The adapter
must deduplicate `x-ja-idempotency-key` and verify `x-ja-signature` (`sha256=<HMAC-SHA256>`). If the
adapter is absent or rejects a request, the event is not marked delivered.

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
staged operation that checks integrity, foreign keys, document hashes and safe manifest paths before
renaming into the target. See `docs/BACKUP_RESTORE.md` for the runbook.

## Production configuration still required

The repository provides the mechanism but cannot supply the customer's real values: auth secret,
SMTP/form recipient, signed outbox/CRM adapter, malware scanner, encrypted off-site backup target,
accountant-approved tax/legal/numbering configuration, disk-alert destination, and final client
recipient/currency data. These are deployment inputs, not code placeholders.
