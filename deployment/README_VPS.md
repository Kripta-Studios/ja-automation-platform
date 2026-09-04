# J&A Automation VPS deployment

This directory describes the supported Ubuntu 24.04 + Caddy + Docker Compose deployment for the
V3 product. The public Next.js site listens only on `127.0.0.1:5101`; the private SvelteKit portal
and server APIs listen only on `127.0.0.1:5100`. Caddy is the only Internet-facing proxy.

The deployment does not run a seed, does not use `drizzle-kit push`, and does not enable automatic
invoice issue or send. The scheduled jobs may create drafts, PDFs, reports and Accounting Pack
artifacts, but external delivery is handled only by the configured signed outbox adapter.

The supported deployment uses Better Auth sessions with optional user-managed MFA. The first owner
is provisioned once by the operator; when the live Stalwart integration is enabled, the current mailboxes are idempotently
linked to portal identities as `worker`, except the canonical `antonny.luty@j-aautomation.com`,
which is always the sole `owner_admin`. Invitations remain available for identities without a
mailbox. No seed, shared account or passwordless role switch is enabled. See
[docs/SHOWCASE_ACCESS.md](../docs/SHOWCASE_ACCESS.md) for the portal access runbook and
[docs/DEPLOYMENT_VPS.md](../docs/DEPLOYMENT_VPS.md) for the Stalwart integration contract.

## Files and services

- `compose.production.yml` — site, portal, always-on jobs worker and optional tools.
- `Caddyfile.snippet` — `/j-aautomation` routing, including the portal login entry point.
- `jaautomation.service` — builds and starts site, portal and jobs containers.
- `jaautomation-jobs.service` / `.timer` — watchdog that keeps the always-on jobs worker running.
- `jaautomation-backup.service` / `.timer` — online SQLite backup plus private-file manifest.
- `scripts/install-vps.sh` — explicit host integration; review it before running with `sudo`.
- `scripts/verify-vps.sh` — local/HTTPS liveness, readiness and routing checks.
- `secrets/stalwart_mail_provisioner` in Compose — read-only JMAP API key mounted only in `portal`.

## Host layout

```text
/etc/jaautomation/jaautomation.env       mode 0600, root-owned
/etc/jaautomation/secrets/stalwart-mail-provisioner.token  root:10001, mode 0640 or stricter
/var/lib/jaautomation/data/              SQLite database and WAL
/var/lib/jaautomation/files/             private receipts, reports, invoices and exports
/var/backups/jaautomation/               online backups and manifests
/opt/jaautomation/current/               checked-out release
```

The portal container runs as UID `10001`, has a read-only root filesystem, and receives only the
database/document volume, explicitly configured environment and the read-only Stalwart API-key
secret. The public site and jobs worker have no database, document, finance, auth-secret or
Stalwart-key mount. The complete mail preflight, API-key permissions and smoke/rollback procedure
is in [docs/DEPLOYMENT_VPS.md](../docs/DEPLOYMENT_VPS.md).

## First installation

1. Copy the reviewed repository to `/opt/jaautomation/current` and inspect the deployment files.
2. Confirm Docker Engine/Compose, Caddy, free disk space, DNS and TLS are ready.
3. Run `sudo bash deployment/scripts/install-vps.sh` only after reviewing its Caddy and systemd
   changes.
4. Edit `/etc/jaautomation/jaautomation.env` and replace `JA_AUTH_SECRET` with a random secret.
   Set the production origin, WebAuthn RP/origin, backup destination and outbox adapter. For live
   mail, set `JA_MAIL_AUTH_ENABLED=true`, `JA_IMAP_HOST=mx1.j-aautomation.com`,
   `JA_IMAP_PORT=993`, `JA_IMAP_SERVERNAME=mx1.j-aautomation.com`,
   `JA_IMAP_TLS_REJECT_UNAUTHORIZED=true`, `JA_STALWART_JMAP_URL=https://mx1.j-aautomation.com/jmap`,
   `JA_STALWART_DOMAIN=j-aautomation.com`,
   `JA_STALWART_EXCLUDED_USERNAMES=jaautomation-provisioner` and
   `JA_STALWART_TOKEN_FILE=/run/secrets/stalwart-mail-provisioner.token`.
5. Create the dedicated `jaautomation-provisioner@j-aautomation.com` non-human User account with
   Tenant `None`, built-in role `User`, account permissions set to **Merge** plus the seven
   domain/account management permissions documented in the main runbook, and an API key set to
   **Inherit**. Install that key interactively at
   `/etc/jaautomation/secrets/stalwart-mail-provisioner.token`, owned by `root:10001` and mode
   `0640` or stricter. Never place the key or an administrator password in the environment, CLI,
   release archive or repository. See the detailed preflight and permission list in
   [docs/DEPLOYMENT_VPS.md](../docs/DEPLOYMENT_VPS.md).
6. Apply reviewed SQL migrations with the repository migration command against the intended empty or
   existing database. Never use `drizzle-kit push` in production. Migrations 0019–0024 are additive;
   migration 0024 creates the Accounting Pack snapshot/legacy bridge but deliberately does not infer
   or globally backfill links for historical runs. The mail integration migration
   `0035_stalwart_mail_integration.sql` is additive and creates the portal link, durable external-command ledger and Owner guards;
   it never imports Stalwart hashes. It fails closed if an existing `owner_admin` is not
   `antonny.luty@j-aautomation.com`; remediate that identity through an explicit audited operation
   before retrying. A legacy run needs an explicit, scoped, command- and audit-anchored bridge before
   it can reference a canonical snapshot.
7. Start the service and timers:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://j-aautomation.com/j-aautomation
```

The portal container healthcheck and local VPS verifier use `/j-aautomation/health/ready` directly
on the loopback portal listener. Caddy accepts `/j-aautomation/health/*` only from loopback and
returns 404 to external clients. Readiness fails closed when
SQLite cannot be opened or queried, migrations are stale, required private artifact directories are
not writable, or the document volume is below `JA_MIN_FREE_BYTES`. That setting is a validated
non-negative integer byte count and defaults to 1 GiB in the production environment examples.
The deployment examples intentionally keep malware scanning disabled for go-live: leave
`JA_MALWARE_SCANNER_RESULT` and `JA_MALWARE_SCANNER_PROVIDER` empty so uploaded documents remain
`not_scanned`, never a fabricated `clean` result.

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
  -e JA_BOOTSTRAP_EMAIL=antonny.luty@j-aautomation.com \
  -e JA_BOOTSTRAP_NAME='Antonny Luty' \
  bootstrap-owner
sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://j-aautomation.com/j-aautomation
```

The owner signs in through `/j-aautomation/app/login`, enrolls MFA, then invites the rest of the
team from Projects → Team. With the live mail integration enabled, use Projects → Team → Buzones
de correo → **Seleccionar todos los disponibles no propietarios**, choose `Worker`, and run the idempotent
reconciliation. It must link every current Stalwart mailbox as an active, email-verified portal
worker except `antonny.luty@j-aautomation.com`, which remains the sole `owner_admin`. A later Owner
role change is preserved by refresh; no other account may become `owner_admin`. Do not run the
fixture seed against a production database, copy a local SQLite file, or expose ports 5100/5101
directly. The live source is JMAP `/jmap`; do not substitute newer `/api` examples or a static
NDJSON/JSON inventory.

The Owner is the only actor allowed to create/update/destroy mailboxes, change Webmail passwords,
change portal roles or offboard identities. These actions require server-side Owner authorization,
recent step-up confirmation, durable idempotency, exact target confirmation and audit. Portal offboarding and Stalwart mailbox destroy
are separate operations; the canonical Owner cannot be deleted, demoted or replaced. For the
complete root preflight, live login smoke and disposable-mailbox update/delete precautions, see
[docs/DEPLOYMENT_VPS.md](../docs/DEPLOYMENT_VPS.md).

## Durable jobs service actor

The jobs process executes only through the active singleton service-actor binding stored in the
deployment database. Provision it after the first owner exists; the binder may be an active
`owner_admin` or `finance_admin`. The command validates the deployment identity, capability
allowlist and binding atomically, and repeating the exact command is a no-op.

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml build service-actor
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps \
  service-actor provision \
  --actor-id jobs-service-v1 \
  --name 'J&A durable jobs v1' \
  --bound-by-user-id owner-user-id
```

Rotate with a new actor id and name after confirming no job run is actively claimed by the old
actor. Rotation keeps the previous actor as disabled history and advances the binding version;
rerunning the same rotation command is also a no-op.

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps \
  service-actor rotate \
  --actor-id jobs-service-v2 \
  --name 'J&A durable jobs v2' \
  --bound-by-user-id finance-user-id
```

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
sudo bash deployment/scripts/verify-vps.sh https://j-aautomation.com/j-aautomation
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

The supported single-VPS Client Essential deployment includes that adapter at
`https://j-aautomation.com/j-aautomation/app/api/internal/outbox-delivery`. It verifies the exact
request body with the same `JA_OUTBOX_WEBHOOK_SECRET`, matches the signed identifiers to the
persisted outbox row, rejects non-corporate recipients, and acknowledges the row durably after
Stalwart accepts the message. Configure the portal-side delivery settings as follows (the secret
must be generated directly on the host and must never be committed or printed):

```dotenv
JA_OUTBOX_WEBHOOK_URL=https://j-aautomation.com/j-aautomation/app/api/internal/outbox-delivery
JA_OUTBOX_WEBHOOK_SECRET=<at-least-32-random-bytes>
JA_OUTBOX_CUTOVER_AT=<exact-current-UTC-ISO-timestamp>
JA_SMTP_URL=smtp://mx1.j-aautomation.com:25
JA_SMTP_FROM=no-reply@j-aautomation.com
JA_FORM_RECIPIENT=antonny.luty@j-aautomation.com
```

The SMTP hop is restricted in code to the local Stalwart service on port 25, requires STARTTLS with
certificate validation, and permits only `@j-aautomation.com` envelope addresses. It does not use,
read or modify Stalwart administrator credentials. Before enabling a previously disconnected
outbox, set `JA_OUTBOX_CUTOVER_AT` to the approved enablement instant. The ZIP deployer first creates
and verifies its normal application backup, then runs `quarantine-outbox-backlog.mjs`: it reports
aggregate counts by topic, marks every still-pending pre-cutover row with
`PRE_CUTOVER_QUARANTINED`, rejects unsupported post-cutover topics and verifies that no old pending
row remains before Docker starts the candidate jobs service. It never reads or prints an event
payload. A real post-cutover contact/career/support submission and receipt in the agreed mailbox
remain required acceptance evidence.

The same worker renders localized PDFs through the `localized_pdf_variant_render` job and
`artifact.localized_pdf.render` capability. It supports `en-US`, `es-ES` and `pt-BR` variants for
invoice, period-report, Accounting Pack, Daily Field Report and PLC / Technical Report sources. Each
locale has an independent `queued`, `running`, `ready` or `failed` lifecycle, fenced attempts and
retry metadata. Only a verified ready artifact is downloadable. The jobs container must resolve
the active deployment singleton service-actor binding; the
worker also verifies private-root containment, no-symlink parents, PDF magic bytes, byte length and
SHA-256 before publication. A missing, disabled, drifted or capability-incomplete binding fails
closed before queued work is claimed.

The jobs service deliberately does **not** import the complete portal environment. Compose passes an
explicit allowlist containing deployment identity, private storage, renderer, outbox/alert and
report-policy values. This prevents auth, SMTP, backup credentials and the retired
`JA_JOB_ACTOR_ID` setting from reaching the worker. The actor ID is resolved only from the
deployment-scoped SQLite binding.

The reporting worker-statement pair (`worker_statement_artifact_render` /
`artifact.worker_statement.render`) is available after reviewed migration `0032`; each requested
format retains independent queued/running/ready/failed state and retry history.

For a local worker build and run:

```bash
pnpm jobs:build
node deployment/jobs-build/jobs-run.mjs --loop
```

The production Compose `jobs` service is part of the default stack (`restart: unless-stopped`) and
runs that looping command. `jaautomation.service` starts it with site and portal. The five-minute
timer is a watchdog (`compose up -d --no-deps jobs`), not a one-shot processor. A queued request is
not a ready artifact: the portal reports `202` with `Location`/`Retry-After` until the worker actually
publishes the PDF, and pending/missing/integrity-failed downloads use explicit non-500 responses.

### Jobs diagnosis and automatic-run evidence

The timer being `active` is not evidence that a jobs invocation succeeded. Diagnose the service as an
authorized operator before restarting or changing it; do not add a human `JA_JOB_ACTOR_ID` to the
environment. The runner resolves the active deployment-scoped service-actor binding from SQLite and
fails closed when the binding, deployment identity, capability set or private storage is invalid.

```bash
sudo systemctl status jaautomation-jobs.timer jaautomation-jobs.service --no-pager
sudo systemctl show jaautomation-jobs.timer \
  -p ActiveState -p SubState -p Result -p LastTriggerUSec -p NextElapseUSecRealtime --no-pager
sudo systemctl show jaautomation-jobs.service \
  -p Result -p ExecMainCode -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp --no-pager
sudo journalctl -u jaautomation-jobs.service -n 200 --no-pager -o short-iso
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml ps jobs
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml logs --tail 50 jobs
```

Inspect only redacted deployment settings when checking an environment mismatch. This prints names
and `set`/`empty`, never values or key material:

```bash
sudo awk -F= '/^(JA_TENANT_ID|JA_DEPLOYMENT_ID|JA_DATABASE_PATH|JA_DOCUMENT_ROOT|JA_JOB_ACTOR_ID|JA_OUTBOX_WEBHOOK_URL|JA_OUTBOX_WEBHOOK_SECRET)=/ {
  value=$0; sub(/^[^=]*=/, "", value); print $1 "=" (length(value) ? "set" : "empty")
}' /etc/jaautomation/jaautomation.env
```

Remove the deprecated `JA_JOB_ACTOR_ID` row during environment maintenance. The allowlisted jobs
service does not inject it even when an older rollback environment still contains the row. Confirm
the service-actor binding against the intended database with the operator-only CLI (the command is
idempotent when the same binding already exists), then run one manual invocation only to validate a
fix:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps \
  service-actor provision \
  --actor-id jobs-service-v1 \
  --name 'J&A durable jobs v1' \
  --bound-by-user-id owner-user-id
sudo systemctl start jaautomation-jobs.service
sudo systemctl status jaautomation-jobs.service --no-pager
sudo journalctl -u jaautomation-jobs.service -n 100 --no-pager -o short-iso
```

Release ZIP deployment changes `/opt/jaautomation/current`, but an already installed systemd unit is
not updated merely because that symlink changed. Install the reviewed service/timer from the active
release and reload systemd before taking final jobs evidence:

```bash
sudo install -o root -g root -m 0644 \
  /opt/jaautomation/current/deployment/jaautomation-jobs.service \
  /etc/systemd/system/jaautomation-jobs.service
sudo install -o root -g root -m 0644 \
  /opt/jaautomation/current/deployment/jaautomation-jobs.timer \
  /etc/systemd/system/jaautomation-jobs.timer
sudo systemctl daemon-reload
sudo systemctl reset-failed jaautomation-jobs.service
sudo systemctl enable --now jaautomation-jobs.timer
```

After the manual check, evidence for CORE-16 requires two later **automatic** `jobs.cycle` records
from the always-on container, not two one-shot service exits. Record that the jobs container is
`running` and the corresponding docker `jobs.cycle` lines. Before and after each cycle, capture
read-only job/run state without payloads or secrets (the exact SQL columns are intentionally limited):

```bash
sudo /opt/jaautomation/runtime/node/bin/node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/jaautomation/data/jaautomation.sqlite', { readOnly: true });
const rows = db.prepare(\"SELECT state, COUNT(*) AS count FROM job GROUP BY state ORDER BY state\").all();
const runs = db.prepare(\"SELECT kind,state,outcome,error_code,started_at,finished_at FROM job_run ORDER BY started_at DESC LIMIT 20\").all();
console.log(JSON.stringify({ jobs: rows, recentRuns: runs }));
db.close();
"
```

Wait for two `jobs.cycle` records from the running container; do not treat an `active` timer, a queued
row, or a single successful manual start as the acceptance result. The required evidence is two
consecutive automatic cycles, durable state transitions and no leaked secrets in the docker logs.
Keep any `failed` rows and retry metadata; do not clear the queue manually.

The repository verifier checks the pinned runtime, environment allowlist, always-on container
state, structured `jobs.cycle` log and read-only state counts for Customer PDFs, Accounting Packs and
Worker Statements. Its second mode waits for two later cycles, so neither can be substituted with a
manual service start:

```bash
sudo bash /opt/jaautomation/current/deployment/scripts/verify-vps.sh \
  https://j-aautomation.com/j-aautomation --current-jobs
sudo bash /opt/jaautomation/current/deployment/scripts/verify-vps.sh \
  https://j-aautomation.com/j-aautomation --wait-two-automatic-runs \
  | sudo tee /var/log/jaautomation-jobs-two-runs.log
```

For retry evidence, use the authorized application retry action on one real failed output format;
do not update `job` or artifact rows directly. The next automatic cycle must retain the failed
attempt/error, create an independent retry attempt, and finish the requested format as `ready` with
verified byte length and SHA-256. Re-run the two-trigger verifier and retain its state-only output.

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

### Encrypted continuity copy and remote restore drill

The local backup and the encrypted separate-host copy are distinct gates. Configure the remote host,
least-privilege SSH user/key, namespace, non-root remote directory, retention (at least 30 days) and
32-byte encryption key in the root-owned `0600` environment file. Keep these values out of Git and
out of command history/logs. `JA_BACKUP_REMOTE_ENABLED=true` with any missing or invalid value is a
blocked fail-closed configuration; use `false` only while explicitly recording off-site recovery as
pending.

Check configuration without attempting a transfer:

```bash
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --readiness
'
```

The command loads the protected environment without printing it. A `READY` response still checks
configuration/key availability, not a completed remote restore.

Run the scheduled backup service and inspect the structured result:

```bash
sudo systemctl start jaautomation-backup.service
sudo systemctl status jaautomation-backup.service --no-pager
sudo journalctl -u jaautomation-backup.service -n 100 --no-pager -o short-iso
```

The service must report a completed encrypted bundle with a completion marker and matching hashes.
An incomplete transfer, hash mismatch or remote conflict is a failure; do not call the local backup
successful continuity evidence. The restore drill is always isolated from `/var/lib/jaautomation/data` and
`/var/lib/jaautomation/files`; set `JA_BACKUP_RESTORE_ID`, `JA_RESTORE_DATABASE_PATH` and
`JA_RESTORE_DOCUMENT_ROOT` in the protected environment file to dedicated, empty drill targets (the
example defaults are under `/var/lib/jaautomation/restore-drill/`). Then run:

```bash
sudoedit /etc/jaautomation/jaautomation.env
# Set the recorded backup ID and isolated restore paths in the protected file, then:
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --restore-drill
'
```

The explicit `--restore-drill` command prints a structured result; record its `PASS` status and
backup ID with the drill evidence. It must be run only after loading the same protected environment
in an operator shell; a separate `sudo node` command does not inherit systemd's `EnvironmentFile`.
The acceptance record
must include the remote backup ID, completion-marker/hash verification, schema version, restored
database integrity/FK result, issued-invoice snapshot check, at least two private artifact hashes,
and RPO/RTO timings. The drill must be performed on a separate host or isolated environment without
access to live storage; a local fixture test or a successful upload alone is not sufficient.

## ANEXO D acceptance evidence

The local code and focused tests are implementation evidence only. The contractual acceptance blocks
are recorded separately against the local contract's `ANEXO D`; do not mark a block accepted from a
source inspection or a transition summary.

### D.1 Web corporativa

Run the public checks from an operator workstation without credentials or state changes:

```bash
BASE_URL=https://j-aautomation.com
curl --fail --silent --show-error "$BASE_URL/health/live" >/dev/null
for locale in en es pt; do
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale" >/dev/null
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale/contact" >/dev/null
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale/careers" >/dev/null
done
curl --fail --silent --show-error "$BASE_URL/j-aautomation/app/login" >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/j-aautomation/health/ready")" = 404
```

These checks prove reachability and the Caddy boundary only. D.1 still needs dated responsive
evidence at 360/390/768/1440, confirmation that the agreed Home, Capabilities/Services, Industries,
Projects, Aquarex, About, Careers, Contact, Employee Portal and legal sections are present in the
approved EN/ES/PT content, successful contact/support/career form delivery with non-secret message
identifiers, and J&A/EVOCON acceptance. The portal login being HTTP 200 does not prove an
authenticated UAT flow.

### D.3 Migración de correo

D.3 requires provider-side proof that the agreed accounts and aliases exist, technically migrable
history was synchronized, SPF/DKIM/DMARC are active, external send and receive both work, and the
application notification path reaches the agreed mailbox. The current Stalwart/SES inventory is a
transition report, not D.3 acceptance. Store only a redacted account checklist, DNS query output,
timestamps and message IDs; never store passwords, API keys, private keys or full message contents.

The D.1/D.3 handoff is complete only when the evidence record contains the URLs/statuses, responsive
screenshots, form/message IDs, provider account checklist, DNS results, external send/receive results,
notification message IDs and signatures from the responsible J&A/EVOCON approvers. Until then the
contractual blocks remain **PENDING** even though public routing and the mail service inventory are
verified.

## Production configuration still required

The repository provides the mechanism but cannot supply the customer's real values: auth secret,
SMTP/form recipient, signed outbox/CRM adapter, malware scanner, encrypted off-site backup target,
accountant-approved tax/legal/numbering configuration, disk-alert destination, and final client
recipient/currency data. These are deployment inputs, not code placeholders.
