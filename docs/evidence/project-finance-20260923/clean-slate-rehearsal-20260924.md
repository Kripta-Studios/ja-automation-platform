# Clean-slate rehearsal, 2026-09-24

Status: **migration-58 isolated rehearsal passed; production unchanged**. This
supersedes the earlier v1–v5 cleanup rehearsals. A fresh SQLite online backup
for the v5 result was captured at
`2026-09-24T09:26:17Z` into `/home/kripta/ja-clean-slate-rehearsal-20260924-v5/`.
The copied database and artifact root were separate from production storage.

The original copied database SHA-256 was
`4954a111332e379e3e9d8d382df8ce5dfd0b4212dafe3a5f03bbdd79c81fdd6d`.
Its immutable archive contains the complete original database, including issued
invoice/payment history, and 62 hashed artifact files. The expected post-clean
logical manifest SHA-256 was
`0b102cf08603f5a43d98542313207f5aa223cfccb93b58ae8ca2c6206255d90f`.
Full private evidence: `result.json`, `idempotent.json` and
`original.rehearsal-archive/` under the v5 directory. The rehearsal required
exact working database and artifact hashes to match that archive before mutation.

| Table | Before | Active copied DB after |
|---|---:|---:|
| Clients | 27 | 1: `client-020-impc` |
| Projects | 27 | 2: `project-cp020-bbs-mexico`, `project-cp020-dfw` |
| Users / accounts / mailbox identities | 118 / 118 / 99 | 118 / 118 / 99 |
| Invoices / payments / daily reports | 17 / 6 / 43 | 0 / 0 / 0 |
| Period reports / expenses / time entries | Nonzero | 0 / 0 / 0 |
| Legal entities / tax profiles / tax components | 2 / 4 / 4 | 0 / 0 / 0 |
| Invoice-number policy | 1 demo | 0 |
| Expertise catalog / worker expertise | 6 / 7 | 0 / 0 |
| Suppliers / supplier-user profiles / profile periods | 2 / 2 / 2 | 0 / 0 / 0 |
| Number sequences | 11 | 1 global client counter |

Both legal entities were explicit DEMO/QA records; all four tax profiles and the
invoice-number policy were demo/test configurations. They were removed from the
active copy and remain in the archive. All existing expertise assignments were
attached to demo or QA users; none was attached to a mailbox-backed worker, so
the active copy has no expertise. The script retains non-test expertise assigned
to mailbox-backed workers if such rows exist in a later cutover backup.

Both test suppliers and their supplier profiles/periods were removed from the
active copy. `supplier-test@j-aautomation.com` and
`technician-test@j-aautomation.com` remain preserved as portal user/account
records; supplier-specific access is unconfigured until an owner creates a new
supplier and reassigns them during testing from zero. A new real legal entity
and tax configuration must be entered before testing invoice issue on the clean
app. The active number-sequence table retains only the global client counter
(`next_value=33`); the stale DEMO issuer invoice scope and deleted-client project
scopes remain only in the archive, avoiding number reuse or dangling visible
configuration. Old issued history stays in the archive.

Protected-table content digests before/after matched. The cleanup transaction
verified `PRAGMA integrity_check=ok` and zero `foreign_key_check` rows before
commit. An independent read-only check verified the same result in both active
copy and original archive. The rerun reported `already_applied`, compared every
active table to the exact persisted post-clean manifest, verified the remaining
artifact hash subset, and found no pending artifact deletion. Trigger DDL was
restored exactly.

At v5 capture, `tests/operations/clean-slate-rehearsal.test.ts` passed **14/14**. Coverage
includes removal of demo finance/expertise/supplier data while preserving every
portal account, and real mailbox-worker expertise; changed client/project/BBS
record detection; injected post-deletion/pre-commit failure with row and trigger
rollback; original post-commit error preservation and artifact recovery; legacy
journal refusal; valid versus stale number-sequence scopes; hash and path safety.
Targeted TypeScript checking passed. The v5 source schema is at migration 55.

The next independent review found that a rerun could accept a missing retained
artifact because the old subset check examined only present files. The current
source now persists an exact survivor artifact path/hash manifest in the journal,
requires every survivor before recovery, and verifies the exact active file set
after candidate deletion. An isolated fixture that deletes retained `bbs.pdf`
must fail. Focused tests now pass **15/15** and targeted TypeScript checking
passes. The current source has since passed the migration-58 rehearsal below.

## Migration-58 rehearsal on copied production data

A separate read-only online production copy with SHA-256
`9e7b1416d27f9b8fb70aee6149a04b29a01a9e1a85dd835c2b3df35ffec80913`
was upgraded from migration 55 to **58**, then copied into the isolated cleanup
workspace at `/home/kripta/ja-migration58-rehearsal-20260924/`. The copied
artifact tree contained 62 files. Portal/jobs were still running, so this is a
compatibility rehearsal, not a quiesced cutover snapshot. The cleanup archive's
original migrated-database SHA-256 is
`36f4dc5d974d1bf8f009f7c22c6c10d7401bd3892c6a279a32c7e2656d3db077`.

The revised script reported `applied` and then `already_applied`; its exact
post-clean table-manifest SHA-256 is
`8196b0d7ce262862a113cc791e6b78af84d449344f5e05f9e3d4173527794cad`.
Active copied data contains exactly `client-020-impc`,
`project-cp020-bbs-mexico`, and `project-cp020-dfw`; users/accounts remain
118/118 and mail identities 99. Invoices, daily reports and suppliers are zero.
All 62 copied artifacts were archived and removed from the active copy; the
survivor manifest is empty for this snapshot. Database integrity is OK,
foreign-key failures are zero, and all **418** migration-58 triggers remain.
Full private results are `clean-slate-result.json`, `clean-slate-idempotent.json`
and `original.rehearsal-archive/` under that workspace. Focused script tests
passed **15/15**, including a retained-file deletion regression on a fixture.

This is not a production cleanup or browser acceptance result. Cutover still
requires independent finance/mail review, a fresh cutover backup and archive,
quiesced writes with an atomic database/artifact switch, restored-app browser and
mailbox checks, and a data-preserving recovery plan.
