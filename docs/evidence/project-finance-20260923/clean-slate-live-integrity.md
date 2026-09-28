# Clean-slate live integrity and mail preservation

Checked: 2026-09-24 12:24 UTC (14:24 CEST). This is an independent, read-only comparison after the production cutover. Source: `/home/kripta/ja-clean-slate-cutover-20260924T122152Z/pre-cutover/original.sqlite`; promoted database: `/var/lib/jaautomation/data/jaautomation.sqlite`. No database or mail writes were made for this check.

| Check | Result |
|---|---|
| Portal and jobs | Both running image `ja-automation-portal:zip-d215671b99323d6d8c4ce34b74b4f8e0`; portal reported healthy. |
| Schema | `MAX(schema_migration.version) = 60` in both databases. |
| SQLite | Live `integrity_check = ok`; `foreign_key_check` returned zero rows. |
| Retained examples | Exactly `client-020-impc` and projects `project-cp020-bbs-mexico`, `project-cp020-dfw`. |
| Operational finance | Live invoice, invoice line/source, payment, daily/period report, time entry, expense and document counts are all zero. |
| Preservation | Exact row digests of `user`, `account`, `mail_identity` and `mailbox_external_command` match the cold original and the cleanup report. |
| Original database | Cold copy, rollback copy and immutable rehearsal archive share SHA-256 `318bbf0afc32eee36ee3d5131a3d6dfa688d57877c5eca5a38f053cf95aac4cf`, matching `applied.json`. |
| Artifacts | All 63 pre-cutover files and all 63 immutable archive files match the cleanup report path/hash manifest. The live artifact root has zero files, exactly matching the reported retained-artifact manifest. |
| Cleanup rerun | `applied.json` reports `applied`; `idempotent.json` reports `already_applied`. Both report zero foreign-key failures and `integrity = ok`. |
| Mail service | `stalwart.service` active, PID 978, started 08:30:28 CEST; `NRestarts=0`. Its start predates the 14:22 CEST cutover. Mail configuration and service were not changed during this verification. |

Identity digest evidence (the digest covers every column of every row, with rows sorted before hashing; no credential values are recorded here):

| Table | Original → live rows | Matching SHA-256 |
|---|---:|---|
| `user` | 118 → 118 | `828839995df3b13e96f8112e870c197d8060e7e1d3c81e9a6b8ec34f00ce357a` |
| `account` | 118 → 118 | `a8980cc59cf00cb8ea72733f9e06a2fb934a8f7eaadfeb74929f71a380f740a0` |
| `mail_identity` | 99 → 99 | `a3186807fe132f0cdfb97675e5f13fd6b7092bc92f7b7f8a33cf845a49a4cd5f` |
| `mailbox_external_command` | 8 → 8 | `58f6c1a2cb9b9e0cc86dd371e586749bc23bfa76fb4c058a031f5ea1bb0c7964` |

The archived business records remain recoverable in the private cutover directory. The cutover report records the main before → after counts as clients 27 → 1, projects 44 → 2, invoices 20 → 0, time entries 128 → 0, expenses 64 → 0 and daily reports 43 → 0. This file verifies database/artifact integrity and mail preservation; authenticated browser acceptance is recorded separately.
