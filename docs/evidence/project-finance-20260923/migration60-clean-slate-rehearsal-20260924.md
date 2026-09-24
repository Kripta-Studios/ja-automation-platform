# Migration 55 → 60 and clean-slate rehearsal, 2026-09-24

Status: **passed on an isolated online production copy; production unchanged**.

The live database was backed up online to the private workspace
`/home/kripta/ja-migration60-rehearsal-20260924/`. The source copy was at
migration 55, passed `integrity_check`, and had zero foreign-key violations.
Its SHA-256 is
`e837dd42b33c24702e34f1cdc8967218bf29846b546f27287dfdb292539583c6`.
The pinned Node v24.19.0 migration runner upgraded a separate copy to version
60. `db:check` reported WAL mode, enabled foreign keys and integrity OK. The
migrated copy had 430 triggers and zero foreign-key violations. Exact logical
row digests for all 118 users, 118 accounts and 99 mail identities matched the
source copy. No mail process or configuration was changed.

The clean-slate script then ran on a second migration-60 copy and a copied
artifact tree. It archived the unmodified migrated database with SHA-256
`8c8633cac33a70ddd3c731631027f757a7afef9cc04512ba03bc568ed2283ef5`
and all 62 copied artifacts. Its second invocation returned
`already_applied`, with the same protected-table digests and post-clean
manifest hash. The isolated result was:

| Record | Before | Active after |
|---|---:|---:|
| Clients | 27 | 1 (IMPC) |
| Projects | 27 | 2 (BBS Mexico and Junkers DFW) |
| Users/accounts | 118 / 118 | 118 / 118 |
| Mail identities | 99 | 99 |
| Invoices | 17 | 0 |
| Daily reports | 43 | 0 |
| Payments | 6 | 0 |
| Suppliers | 2 | 0 |
| Active artifacts | 62 | 0 |

The copied active database passed `integrity_check` with zero foreign-key
violations. Its post-clean logical manifest SHA-256 is
`9c43173c6156c04712d1cb685c06a4d4a63f4d2ac0d2ffcedbe07f17c93c74be`.
Focused clean-slate tests passed 15/15. The private JSON evidence includes
exact protected row digests, archived financial counts and artifact hashes.

This rehearsal does **not** establish a restored-app browser pass or authorize
claiming the production cleanup complete. The reviewed release must first pass
deployed browser acceptance. The cutover still requires a fresh cold backup,
writer quiescence, paired database/artifact switch, public browser verification
and read-only mail-identity comparison under the cutover runbook.
