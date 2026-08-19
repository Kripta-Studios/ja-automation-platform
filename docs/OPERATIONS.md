# Operations

Run the five-minute jobs timer and daily backup timer from `deployment/`. Inspect the portal/site
health checks, disk space, SQLite WAL size, job failures, outbox terminal failures, invoice PDF
failures and backup age. Failed jobs are retryable and retain error/attempt history; an outbox
adapter must deduplicate the supplied idempotency key.

Routine checks:

```bash
systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer
docker compose --env-file /etc/jaautomation/jaautomation.env -f deployment/compose.production.yml ps
df -h /
```

Do not run destructive database copies, live deletes, production seed, or `drizzle-kit push`. Use
reviewed migrations, the online backup script and the staged restore procedure. Keep auto-issue and
auto-send disabled unless the specification and an explicit reviewed business change permit them.
