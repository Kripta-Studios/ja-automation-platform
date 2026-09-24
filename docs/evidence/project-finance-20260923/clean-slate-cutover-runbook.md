# Clean-slate production cutover runbook (draft, NOT EXECUTED)

This runbook applies only after the final portal/jobs release and migrations 0056–0060
have passed authenticated production acceptance. It is not authorization to bypass
the isolated rehearsal. Retain the IMPC client, BBS Mexico and Junkers DFW
projects, every portal user/account and every mailbox identity. Archive all other
business records and artifacts as an immutable, hash-verified pre-cutover copy.
Do not change Stalwart, mail credentials, mailbox mappings, DNS or mail services.

## Go/no-go gates

1. Record the deployed source checksum, portal/jobs image IDs, exact migration
   version, active DB path, artifact-root path, `df -h`, and current
   `integrity_check`/foreign-key status. Migrations must end at 60 or the actual
   final reviewed version, with the cleanup script tested against that version.
2. Run the final cleanup script on a **fresh online production copy**, including
   a copied artifact root, and require an `applied` then `already_applied`
   result. Independently compare the original archive hashes, exact retained
   client/project IDs, all user/account/mail digests, expected survivor artifact
   manifest, trigger DDL, integrity and foreign keys. Preserve this evidence.
3. Rehearse an app start and owner browser read of the transformed copy in an
   isolated environment with outbound integrations disabled. Rehearse restoring
   its pre-clean database and artifacts. Any fixture or legacy reference error
   blocks production cutover.
4. Prepare a private, root-owned cutover directory on the same filesystem with
   enough free space for the original database, all artifacts, transformed copy
   and a second safety margin. Verify the archive is readable before switching.

## Controlled switch

1. Hold the deployment lock and stop the portal and jobs containers, the jobs
   timer/service and backup timer. Keep the mail service running. Confirm no
   portal/jobs process can write SQLite or the document root. The public portal
   remains unavailable during this short maintenance window.
2. Checkpoint the stopped SQLite WAL with `PRAGMA wal_checkpoint(TRUNCATE)` and
   verify no portal/jobs process holds the database open. Copy the cold database,
   **both SQLite sidecars (`-wal`, `-shm`) if present**, and full artifact tree
   to a private pre-cutover directory; record numeric ownership/modes, database
   SHA-256 and the complete artifact path/hash manifest. The backup must be
   restorable, and the live source must still match its recorded hash before
   promotion. The staged clean database must have no WAL/SHM sidecars.
3. Run `scripts/rehearse-clean-slate.ts --rehearsal` on **copies** named with
   its required `.rehearsal.sqlite`, `.rehearsal-artifacts` and
   `.rehearsal-archive` suffixes. The script must continue refusing production
   paths. Require the same protected digests, exact survivor manifest,
   `integrity_check=ok`, zero foreign-key failures, exact trigger restoration
   and a successful idempotent rerun.
4. Stage the transformed database and survivor artifacts beside the live paths
   with the live numeric UID/GID and modes. With writers still stopped, rename
   the original database, **both SQLite sidecars**, and artifact directory into
   the private rollback location, then rename both staged paths into their live
   names. No service may observe the intermediate state. Keep the original
   archive and rollback pair separate and read-only. Never let an old WAL attach
   to the promoted clean database.
5. Check the promoted database integrity, foreign keys, migration version,
   retained row digests and exact survivor artifact hashes **before** restarting
   any writer. On mismatch, restore the rollback pair while writers remain
   stopped and record the failure.

## Restart, browser verification and recovery

1. Start the same reviewed portal/jobs release and timers. Require local and
   public health, job liveness, and the same deployed image IDs. Do not start
   a demo seed or fixture reset.
2. In authenticated owner browsers at 360/390/768/1440 widths, verify one IMPC
   client, exactly the two BBS projects, empty operational invoices/reports,
   and successful create/reload/delete of a temporary client and project.
   Verify a worker login and finance/owner permission boundaries. Inspect
   sanitized action responses and persistence, not screenshots alone.
3. Compare all portal user/account/mail-identity digests with the cold backup;
   check mailbox mappings and `stalwart.service` health read-only. Do not send
   a test email. Verify no mail service was restarted or changed.
4. Keep the original database and artifact archive plus cutover manifest for
   audited recovery. If a failure occurs **before** writers restart, restore
   the original pair while they remain stopped. If writes occurred after
   restart, preserve the failed active state first and reconcile those writes
   before any restore; never blindly replace it with an older database.

Every gate records timestamp, operator, release checksum, command/result,
before/after IDs and hashes, and PASS/FAIL/BLOCKED. The cutover is complete only
when the restored app browser and mailbox checks pass on the promoted database.
