# Client Essential WP00 baseline — 2026-09-06

This is the historical WP00 snapshot, not the final decision. Its authority blockers and production
state were superseded later on 2026-09-06 by the Owner's explicit optional-MFA/no-step-up decision,
separate-host waiver and authorized exact-candidate deployment. See `RUN_REPORT.md`.

## Candidate and isolation

- Checkout: `/home/kripta/ja-automation-platform-vps-hotfix`
- Branch: `codex/v3-production-completion-orchestrated-20260819`
- Initial HEAD: `daaf720f3cdc3ff404b7d3277a780ccd61bedd5a`
- Audit-pin match: yes
- Initial worktree: clean; no pre-existing changes
- Required runtime: Node `24.19.0`, Corepack pnpm `11.22.0`
- Runtime used: `/opt/jaautomation/runtime/node-v24.19.0/bin`
- Inherited application environment: no `JA_*`, mail, database, or `NODE_ENV` variables
- Test isolation: temporary SQLite databases and document roots, synthetic identities, no SMTP/IMAP configuration, Playwright `workers: 1`

The handoff preflight was run against this checkout and wrote only
`/home/kripta/JA_CLIENT_READY_HANDOFF_2026-09-06/verification/vps-baseline`.

The active VPS application is not a Git checkout. Caddy routes the public site to loopback `5101`
and the portal/API to `5100`. Docker Compose identifies the immutable active release as
`/opt/jaautomation/releases/ja-automation-63c13b1d28ef9c29166e2a16dee592e639e374084a14ddebcb8d5dae6e9431a7`,
built from executable commit `8d02bd5e32032e26895d3f5a5260620e3935ba6d`. The current HEAD differs
from that executable commit only in three documentation/evidence files; no functional source differs.

No production database, private files, environment-file contents, mailbox bodies, or protected
evidence payloads were read. No service, deployment, DNS, account, mail, migration, or production
state was changed.

## Authority reconciliation

The supplied principal contract prevails over internal repository instructions when they conflict.
The following cannot be waived by the 2026-09-04 internal checklist/UAT record alone:

- production MFA is contractually required;
- a DPA is required before introducing real personal data into production;
- local snapshots require at least 30 days of retention and continuity must be separate from the
  principal infrastructure.

The repository's recorded Owner waiver and optional-MFA UAT instruction are retained as evidence of
an unresolved authority conflict, not treated as a signed contractual modification. This blocks a
contract-compliance/client-ready claim, but not synthetic local implementation and verification.

## Finding dispositions at WP00

| Finding | WP00 disposition                | Current evidence / next gate                                                                                                                                                                                                                   |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JA-01   | REPRODUCED                      | XLSX `worksheet()` emits every value as `inlineStr`; add reader/type/date/formula regression and typed cells.                                                                                                                                  |
| JA-02   | REPRODUCED                      | Conformity records typed signer metadata but always stores `signature_document_id=NULL`; add exact-version signed-copy or approved verifiable-written-evidence path.                                                                           |
| JA-03   | REPRODUCED                      | Query contains worker name, but the customer projection/PDF allowlist drops it; add safe per-worker display attribution and two-worker regression.                                                                                             |
| JA-04   | REPRODUCED                      | Worker UI offers Void for approved/unlocked time; repository voids without reason. Preserve draft deletion and require the audited correction path after approval.                                                                             |
| JA-05   | RUNTIME TEST REQUIRED           | Approval reads state/authorization before `BEGIN IMMEDIATE`, updates only by ID, and records the stale prior state. Add a real two-connection interleaving regression before changing it.                                                      |
| JA-06   | REPRODUCED                      | Authoritative repository/billing helpers accept normalized dates such as `2026-02-30`; some HTTP boundaries are already strict. Add shared strict round-trip validation.                                                                       |
| JA-07   | REPRODUCED                      | CSV exempts any `-` followed by a digit, including `-1+2`; add typed-column safety.                                                                                                                                                            |
| JA-08   | REPRODUCED                      | Accounting Pack PDF is required only by an environment flag; contract requires PDF and XLSX while per-format downloads remain independent.                                                                                                     |
| JA-09   | REPRODUCED                      | Unverified telephone and hard-coded future invoice defaults remain in public/portal/template source. Omit invalid phone and require explicit future issuer configuration without rewriting issued history.                                     |
| JA-10   | PRESERVE / RUNTIME CHECK        | Industries-first ordering is already implemented. Verify content and mobile rendering; do not duplicate it.                                                                                                                                    |
| JA-11   | BLOCKED BY AUTHORITY            | MFA/DPA/continuity conflict requires a signed authorized resolution or implementation of the contract.                                                                                                                                         |
| JA-12   | RECONCILED                      | Active release is bound to `8d02bd5`; current functional code is identical and later commits are evidence-only. New candidate evidence must bind the final SHA.                                                                                |
| JA-13   | TECHNICALLY RESOLVED / D06 OPEN | Historical decimal quantity is preserved rationally; new operational billing uses minutes. Owner must approve the future grouping/rounding convention.                                                                                         |
| JA-14   | REPRODUCED SECURITY BLOCKER     | A tracked manual screenshot script embeds apparent plaintext credentials, including the canonical Owner identity. Replace with required synthetic environment inputs, add a secret-regression test, and require Owner-led rotation assessment. |

## Baseline test results

All commands used the pinned runtime and unset database/document/mail variables.

1. Money, billing, time, XLSX, Accounting Pack, and conformity selection: `9` files / `82` tests
   passed in `80.22s`.
2. Initial security/backup selection: `3` files failed to collect because the generated
   `apps/portal/.svelte-kit/tsconfig.json` was absent; the other `3` files / `20` tests passed.
3. `svelte-kit sync` generated ignored framework metadata only.
4. Exact security/backup rerun: `6` files / `37` tests passed in `20.47s`.
5. Independent WP00 report/conformity selections: `46` tests passed.

The collection failure is retained as environment evidence and is not classified as a product failure
or a pass. Full gates and browser/artifact reader checks remain for the integrated candidate.

## Dependency DAG after WP00

1. Security hygiene: remove credential literals and add regression; no dependency.
2. Time/date integrity: JA-04, the real JA-05 contention regression/fix, and JA-06 strict dates.
3. Report/export integrity: JA-01 and JA-07 typed spreadsheets; JA-08 contractual Accounting Pack completeness.
4. Customer evidence: JA-03 safe worker attribution; JA-02 exact-version evidence capture, dependent on the existing immutable report contract but independent of invoice issuance internals.
5. Website/future issuer defaults: JA-09, preserving historical issued snapshots.
6. Integrated finance/security/browser/build/backup gates and artifact visual/reader checks.
7. Final manuals generated only from the frozen tested UI, then independent release review.
8. Human/external closure: D01-D15 as applicable, MFA/DPA/continuity authority, DKIM/PTR/external mail,
   localized content approval, Owner smoke, and authorized signatures.
