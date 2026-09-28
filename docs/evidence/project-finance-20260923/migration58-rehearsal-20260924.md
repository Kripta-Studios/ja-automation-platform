# Migration 55 → 58 rehearsal, 2026-09-24

Status: **passed on a read-only online copy; production unchanged**.

An online SQLite backup of the current production database was captured at
`/home/kripta/ja-migration58-rehearsal-20260924/production-source.sqlite`.
Its SHA-256 is
`9e7b1416d27f9b8fb70aee6149a04b29a01a9e1a85dd835c2b3df35ffec80913`.
The source was at migration 55 and `PRAGMA integrity_check=ok`. A separate copy
was migrated with the pinned Node v24.19.0 runtime and the candidate source
migrations through 58. `db:check` reported WAL journal, foreign keys enabled,
and integrity OK.

Read-only post-migration verification found migration version **58**, **418**
triggers, `integrity_check=ok`, and **0** foreign-key failures. Protected rows
were byte-equivalent at the logical row level before and after migration:

| Table | Before | After | Row digest |
|---|---:|---:|---|
| user | 118 | 118 | equal |
| account | 118 | 118 | equal |
| mail_identity | 99 | 99 | equal |

The original online-copy SHA-256 remained unchanged after the rehearsal. This
verifies migration compatibility with representative stored data; it does not
certify the new application build or the cleanup script on migration 58.
Both still need their separate acceptance gates before deployment/cutover.
