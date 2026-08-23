# Operations

Run the five-minute jobs timer and daily backup timer from `deployment/`. Inspect the portal/site
health checks, disk space, SQLite WAL size, job failures, outbox terminal failures, localized PDF
variant failures and backup age. Failed jobs are retryable only when their persisted failure says so,
and retain error/attempt/fence history; an outbox adapter must deduplicate the supplied idempotency
key.

Routine checks:

```bash
systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer
docker compose --env-file /etc/jaautomation/jaautomation.env -f deployment/compose.production.yml ps
df -h /
```

The portal exposes a cheap liveness response at `/health/live` and a fail-closed readiness
response at `/health/ready`. Readiness verifies that SQLite can be opened and queried, the shipped
migrations are current, the private artifact directories are writable, and the document volume has
enough free space. It is short-lived cached and single-flight; the public Caddy listener returns
404 for health paths, while the container/VPS monitor uses the loopback portal listener. `JA_MIN_FREE_BYTES`
is a validated non-negative integer number of bytes and defaults to 1 GiB; set an explicit lower value
only for a disposable development volume. Missing or unreadable storage, an invalid threshold, a
failed disk probe, or stale migrations returns HTTP 503.

Do not run destructive database copies, live deletes, production seed, or `drizzle-kit push`. Use
reviewed migrations, the online backup script and the staged restore procedure. Keep auto-issue and
auto-send disabled unless the specification and an explicit reviewed business change permit them.

The fixture seed is limited to isolated development and automated validation. Never run it against
the production database. Production jobs require an explicitly configured finance-capable
`JA_JOB_ACTOR_ID`, and all portal access uses invitation-only Better Auth sessions.

Localized report PDFs are generated independently for `en-US`, `es-ES` and `pt-BR` through the
`localized_pdf_variant_render` job. Monitor `queued`, `running`, `ready` and `failed` rows rather than
assuming that a request returning `202` has produced a file. A ready download is rechecked against its
private storage path, PDF magic bytes, byte length and SHA-256; an integrity mismatch is blocked and
recorded for the affected locale/attempt. See [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md) for the
authenticated API contract and [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for recovery.
