# Business-data cleanup inventory and rehearsal gate

Updated: 2026-09-24. Status: **dry run only; no production rows deleted or archived**.

The read-only inventory used the deployed SQLite database at `/var/lib/jaautomation/data/jaautomation.sqlite`. The [2026-09-24 dry-run review](cleanup-review-20260924.json) records 27 clients, 27 projects and 118 users after the owner created eight non-mailbox QA workers; 99 identities are mailbox-backed. All user identities, including the QA workers, are excluded from cleanup. Eighteen client/project roots are protected; 36 are unclassified. No row has positively attested fixture provenance or is eligible for deletion. All 27 projects and 25 clients have linked records; the other two clients are archived. Nine roots are finalized or archived. Thirty composite or implicit foreign-key relationships require separate review; any one of them now blocks rehearsal deletion globally.

| Stable root ID                         | Classification                 | Dependency closure observed                                                                           | Decision              |
| -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------- |
| `client-020-impc`                      | Protected IMPC client          | 2 projects, 2 contacts, 2 schedules                                                                   | Retain full closure   |
| `project-cp020-bbs-mexico`             | Protected BBS project          | Schedule and audit reference                                                                          | Retain full closure   |
| `01a0cf9b-bec4-72cd-a97d-8de393f89dd5` | Verified QA client, protected  | QA project, contact, assignment, time, expense, report, rate, billing, invoice, source and audit rows | Retain for acceptance |
| `01a0cfae-9005-76a9-871a-8cf4edf877dd` | Verified QA project, protected | Assignment, time, expense, report, rate, billing, invoice, source and audit rows                      | Retain for acceptance |

The QA IDs are backed by the browser evidence in this directory and remain in use for acceptance. “Demo,” “test,” or similar text in a name is only a clue, never proof that a row may be deleted. All users, mailbox mappings, and projects with worker assignments remain protected. The inventory walks foreign-key references and direct project/client IDs, plus polymorphic audit references, using stable IDs; it emits table counts and dependency digests without worker names, email addresses, credentials or financial values. Its current scan does not certify that every historical soft reference is discoverable. Any dependency or ambiguous provenance blocks the rehearsal deletion. The review JSON has kind `business_data_cleanup_dry_run`; it is deliberately missing the reviewer and provenance fields needed by the applier, so it cannot itself authorize deletion.

To repeat the read-only summary with the pinned runtime:

```sh
PATH=/opt/jaautomation/runtime/node/bin:$PATH node --experimental-strip-types scripts/audit-business-data-cleanup.ts --database /var/lib/jaautomation/data/jaautomation.sqlite --summary
PATH=/opt/jaautomation/runtime/node/bin:$PATH node --experimental-strip-types scripts/audit-business-data-cleanup.ts --database /var/lib/jaautomation/data/jaautomation.sqlite --review
```

The separate `apply-business-data-cleanup.ts` command accepts only an isolated file ending `.rehearsal.sqlite`, rejects production/release paths and production inode aliases, and requires a reviewed manifest with exact IDs, row/dependency digests and `fixture-ledger:` provenance evidence. It refuses protected, unclassified, dependent, stale or finalized rows and any database with unresolved relationships. It transactionally deletes only dependency-free fixtures and records a rehearsal journal for idempotent reruns; a missing row without that journal is an error. The reviewed provenance must be independently tied to the exact production row and its complete dependency closure before a candidate is placed into a rehearsal manifest. No such manifest or production deletion procedure exists yet.

An online backup of the live SQLite database was created in a temporary isolated directory, opened read-only, checked, and removed. Its size was 334,819,328 bytes; `PRAGMA integrity_check` returned `ok`, `PRAGMA foreign_key_check` found zero violations, and the copy contained the same 54 client/project roots with zero verified fixtures. No deletion was attempted on the copy because every root is blocked. This checks database-copy integrity only; private artifact restore and a classified cleanup rehearsal remain open.

Focused validation: pinned-Node `pnpm exec vitest run tests/operations/business-data-cleanup.test.ts` passed 6 tests covering protected closure, typed row fingerprints, non-applicable dry-run review, ambiguous/finalized refusal, stale multi-row rollback, idempotency and unresolved composite relationships. A targeted TypeScript check with Node types, ESLint, Prettier and `git diff --check` passed for the cleanup files. The production summary and review were obtained through a read-only SQLite connection. No mail service, mailbox mapping or production business data was changed.
