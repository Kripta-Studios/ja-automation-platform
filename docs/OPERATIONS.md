# Operations

This runbook describes the supported production operator checks. It separates implementation evidence
from live proof: source code and local tests establish the mechanisms, while the VPS timer results,
remote restore drill and signed contractual UAT record establish release evidence. The current
operational record (2026-08-28) remains **NOT READY** while the jobs service has an exit-code failure,
two automatic runs are not attached, and encrypted remote continuity has not been restored in an
isolated target.

Run the always-on jobs worker and daily backup timer from `deployment/`. Inspect the portal/site
health checks, disk space, SQLite WAL size, job failures, outbox terminal failures, localized PDF
variant failures and backup age. Failed jobs are retryable only when their persisted failure says so,
and retain error/attempt/fence history; an outbox adapter must deduplicate the supplied idempotency
key. Never print `/etc/jaautomation/jaautomation.env`, Compose-resolved environment, webhook secrets,
SSH keys or encryption keys.

Routine checks:

```bash
sudo systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer --no-pager
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml ps
df -h /
du -sh /var/lib/jaautomation/data /var/lib/jaautomation/files /var/backups/jaautomation
```

The portal exposes cheap liveness and fail-closed readiness responses at
`/j-aautomation/health/live` and `/j-aautomation/health/ready` on the loopback listener. Readiness verifies that SQLite can be opened and queried, the shipped
migrations are current, the private artifact directories are writable, and the document volume has
enough free space. It is short-lived cached and single-flight; the public Caddy listener returns
404 for the scoped `/j-aautomation/health/*` paths, while the container/VPS monitor uses the loopback
portal listener. The public root `/health/live` route is a separate Caddy liveness check and currently
returns HTTP 200. `JA_MIN_FREE_BYTES`
is a validated non-negative integer number of bytes and defaults to 1 GiB; set an explicit lower value
only for a disposable development volume. Missing or unreadable storage, an invalid threshold, a
failed disk probe, or stale migrations returns HTTP 503.

Do not run destructive database copies, live deletes, production seed, or `drizzle-kit push`. Use
reviewed migrations, the online backup script and the staged restore procedure. Keep auto-issue and
auto-send disabled unless the specification and an explicit reviewed business change permit them.

The fixture seed is limited to isolated development and automated validation. Never run it against
the production database. Production jobs require an active deployment singleton service-actor
binding provisioned through the production CLI, and all portal access uses invitation-only Better
Auth sessions.

## Jobs diagnosis and two automatic runs

An `active` timer means only that systemd will restart the jobs container if it is down. It is not a
successful worker cycle. Diagnose the current container and `jobs.cycle` logs before restarting it:

```bash
sudo systemctl status jaautomation-jobs.timer jaautomation-jobs.service --no-pager
sudo systemctl show jaautomation-jobs.timer \
  -p ActiveState -p SubState -p Result -p LastTriggerUSec -p NextElapseUSecRealtime --no-pager
sudo systemctl show jaautomation-jobs.service \
  -p Result -p ExecMainCode -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp --no-pager
sudo journalctl -u jaautomation-jobs.service -n 200 --no-pager -o short-iso
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml ps jobs
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml logs --tail 50 jobs
```

Check deployment identity and endpoint presence without revealing values. Remove the deprecated
`JA_JOB_ACTOR_ID` row during environment maintenance. The current jobs Compose service uses an
explicit allowlist and does not inject that row or unrelated auth/SMTP/backup secrets. The active
actor is resolved from the deployment singleton binding in SQLite:

```bash
sudo awk -F= '/^(JA_TENANT_ID|JA_DEPLOYMENT_ID|JA_DATABASE_PATH|JA_DOCUMENT_ROOT|JA_JOB_ACTOR_ID|JA_OUTBOX_WEBHOOK_URL|JA_OUTBOX_WEBHOOK_SECRET)=/ {
  value=$0; sub(/^[^=]*=/, "", value); print $1 "=" (length(value) ? "set" : "empty")
}' /etc/jaautomation/jaautomation.env
```

If the binding is missing or needs rotation, use the operator-only idempotent command with the real
owner/finance binder ID, then at most one manual service start to validate the correction:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml run --rm --no-deps \
  service-actor provision \
  --actor-id jobs-service-v1 \
  --name 'J&A durable jobs v1' \
  --bound-by-user-id owner-user-id
sudo systemctl start jaautomation-jobs.service
sudo systemctl status jaautomation-jobs.service --no-pager
sudo journalctl -u jaautomation-jobs.service -n 100 --no-pager -o short-iso
```

Capture state before and after each scheduled run without selecting payloads or secrets:

```bash
sudo /opt/jaautomation/runtime/node/bin/node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/jaautomation/data/jaautomation.sqlite', { readOnly: true });
const jobs = db.prepare(\"SELECT state, COUNT(*) AS count FROM job GROUP BY state ORDER BY state\").all();
const runs = db.prepare(\"SELECT kind,state,outcome,error_code,started_at,finished_at FROM job_run ORDER BY started_at DESC LIMIT 20\").all();
console.log(JSON.stringify({ jobs, recentRuns: runs }));
db.close();
"
```

The acceptance record needs two consecutive **automatic** `jobs.cycle` records from the always-on
container after any manual check, with the jobs container `running`, matching docker logs and durable
state transitions (`queued` → `claimed`/`running` → `succeeded`, or an explicit retryable/terminal
failure). An active timer, a queued row or two manual starts is not CORE-16 evidence. Preserve failed
rows and retry metadata; do not clear the queue manually.

After installing the reviewed service/timer from the active release and reloading systemd, capture
two real timer triggers with the repository verifier. It also reports state-only counts for Customer
PDFs, Accounting Packs and Worker Statements without reading payloads:

```bash
sudo bash /opt/jaautomation/current/deployment/scripts/verify-vps.sh \
  https://j-aautomation.com/j-aautomation --wait-two-automatic-runs \
  | sudo tee /var/log/jaautomation-jobs-two-runs.log
```

Localized report PDFs are generated independently for `en-US`, `es-ES` and `pt-BR` through the
`localized_pdf_variant_render` job. Monitor `queued`, `running`, `ready` and `failed` rows rather than
assuming that a request returning `202` has produced a file. A ready download is rechecked against its
private storage path, PDF magic bytes, byte length and SHA-256; an integrity mismatch is blocked and
recorded for the affected locale/attempt. See [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md) for the
authenticated API contract and [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for recovery.

## Continuity backup and isolated restore

Local backup success is not off-site continuity evidence. The production backup service writes a
consistent SQLite snapshot plus the private-file manifest, then `continuity-backup.mjs` encrypts and
uploads the snapshot and manifest to a separately administered SSH host, verifies remote sizes/hashes,
and writes a completion marker last. Keep the remote host/user/key, namespace, non-root remote root,
retention (minimum 30 days) and 32-byte encryption key in the root-owned `0600` environment file only.
An enabled but incomplete configuration is **BLOCKED**; do not treat it as a local-only success.

Check readiness without displaying values, then run the service:

```bash
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --readiness
'
sudo systemctl start jaautomation-backup.service
sudo systemctl status jaautomation-backup.service --no-pager
sudo journalctl -u jaautomation-backup.service -n 200 --no-pager -o short-iso
```

`READY` confirms configuration/key availability only. The backup result must show a completed
encrypted snapshot, encrypted manifest, matching remote hashes/lengths and completion marker. A
partial transfer, mismatch, conflict or missing marker is a failure.

For the recovery gate, set `JA_BACKUP_RESTORE_ID` (or leave it empty to select the latest completed
marker), `JA_RESTORE_DATABASE_PATH` and `JA_RESTORE_DOCUMENT_ROOT` to dedicated empty paths that do
not overlap live storage. Run the explicit drill with the protected environment loaded:

```bash
sudoedit /etc/jaautomation/jaautomation.env
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --restore-drill
'
```

Record the structured `PASS` result, backup ID, marker/hash checks, schema version, SQLite integrity
and foreign-key results, issued-invoice snapshot equality, at least two private artifact hashes and
RPO/RTO. The drill must run on a separate host or isolated environment without access to live paths.
`ops:backup:test`, `ops:restore-test` and `test:continuity` prove local mechanics only.

## ANEXO D evidence handoff

`ANEXO D.1` still needs dated EN/ES/PT route and responsive checks at 360/390/768/1440, confirmation
that the agreed Home, Capabilities/Services, Industries, Projects, Aquarex, About, Careers, Contact,
Employee Portal and legal sections render with approved content/images, successful
contact/support/career form delivery with non-secret message IDs and J&A/EVOCON acceptance.
`ANEXO D.3` still needs the agreed account/alias checklist, migrated history confirmation, DNS
SPF/DKIM/DMARC output, external send/receive tests and application notification message IDs. The
current Caddy/site checks and Stalwart/SES transition inventory are supporting evidence only; they
do not close D.1 or D.3. Store no credentials, keys or full message contents in the evidence bundle.
See [DEPLOYMENT_VPS.md](DEPLOYMENT_VPS.md) for the exact public checks.
