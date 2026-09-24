# Clean-slate rehearsal evidence template

This file is a review template, not an approval to mutate production. Keep database
archives, artifact copies, credentials, raw rows and private business data outside Git.

## Intended retained records

- Client: `client-020-impc` (IMPC)
- Projects: `project-cp020-bbs-mexico` (BBS Mexico), `project-cp020-dfw` (Junkers DFW)
- Every user, account, mailbox identity and user authentication record
- Global invoice numbering continuity and deployment configuration. Explicit
  demo/QA legal entities, tax settings and invoice-number policy are archived,
  then removed from the active copy.
- Preserve all portal user/account rows but remove test suppliers and supplier
  profile/period rows; supplier-specific access is unconfigured until a new
  supplier is created and users are assigned during clean-app testing.
- Real expertise of mailbox workers remains; positively identified QA/demo
  expertise is removed.

## Rehearsal inputs

- Timestamp and operator:
- Online SQLite backup path (must end `.rehearsal.sqlite`):
- Copied artifact directory (must end `.rehearsal-artifacts`):
- Separate archive directory (must end `.rehearsal-archive`):
- Live release checksum and migration version:
- Original database SHA-256:
- Archive database SHA-256:
- Expected post-clean logical manifest SHA-256:
- Archived artifact count/hash manifest:

Run the rehearsal only with `scripts/rehearse-clean-slate.ts --rehearsal
--database <copy.rehearsal.sqlite> --artifacts <copy.rehearsal-artifacts>
--archive <original.rehearsal-archive>`. Keep its full JSON result in a private
evidence location. A failure leaves the copied database transaction unchanged;
record its exact blocker without bypassing it.

## Review gates

| Check | Expected | Result/evidence |
|---|---|---|
| Archive original DB and artifacts | Verified SHA-256 and readable issued DEMO invoice/PDF/payment/settlement rows, including approved-invoice supersession history if present | |
| Pre-mutation equality | Working DB byte hash and full artifact path/hash manifest match archive exactly | |
| Protected users and mail | Before/after row counts and content digests equal | |
| Clean business configuration | Demo/QA legal/tax/invoice policy and all test supplier/profile rows gone; portal users/accounts intact | |
| Numbering scopes | Global counter retained; deleted-client/project and DEMO issuer invoice scopes gone | |
| Expertise | Non-test mailbox-worker assignments retained; QA/demo entries gone | |
| Example roots | Exactly one client and two named projects remain | |
| Other business records | Candidate count and deletion count reconcile by table; active invoice supersession/manifest counts reach zero while the archived copy retains them | |
| Active copied artifacts | Only referenced retained artifacts remain | |
| Database integrity | `PRAGMA integrity_check=ok`, zero `foreign_key_check` rows before commit and on rerun | |
| Idempotency and recovery | Complete candidate journal; same archive/copy rerun reports `already_applied`; restored candidate artifact is deleted while retained artifact survives | |
| Exact post-clean state | Persisted per-table count/content digest matches rerun; new client/project or edited BBS row blocks recovery | |
| Artifact subset | Rerun rejects added or changed working files against archived hashes | |
| Exact retained artifacts | Journal stores the expected survivor path/hash manifest; rerun fails if any retained file is missing, then verifies the exact set after candidate cleanup | |
| Rollback | Failed blocker leaves copied DB unchanged | |
| Browser on restored rehearsal | BBS/IMPC examples, users/mailboxes and fresh create/assign/time/report/invoice flows | |
| Independent review | Finance/history, identity/mail and backup/restore reviewers sign off | |

The production execution path is deliberately absent from this script. A separate
release procedure must verify the latest live data backup and archive, switch an
already validated clean database into service atomically, and prove browser and
mailbox behavior before the cleanup can be called complete.
