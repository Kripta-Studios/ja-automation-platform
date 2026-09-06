# Client Essential execution report — 2026-09-06

## Decision and identity

- State: `TECHNICALLY_VERIFIED_AWAITING_OWNER`
- Initial audit SHA: `daaf720f3cdc3ff404b7d3277a780ccd61bedd5a`
- Frozen/deployed application SHA: `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`
- Final repository HEAD: `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`
- Branch: `codex/v3-production-completion-orchestrated-20260819`
- Worktree: `/home/kripta/ja-automation-platform-vps-hotfix`
- Initial worktree: clean. No user work was reset, stashed, discarded or overwritten.
- Final worktree: application commits remain frozen at the deployed SHA; only campaign evidence,
  generated artifacts/manuals and their documentation updates are uncommitted. No unrelated or
  pre-existing user change was staged or included.
- Application commits: `0d5c4d0`, `07b1251`, `5d5010e`, `2ba195f`, `9d87378`, `2058db2`.
- Review verdict: independent read-only reviewer returned `ship` for `2058db2`; no high or critical findings remained.

The application candidate is implemented, fully tested and deployed. The 32-step executable journey
passes 32/32 with production-bound operations evidence. The subsequently authorized authenticated
production smoke also passes for the designated Owner and Worker, including worker confidentiality
and an auditable synthetic workflow/cleanup. `CLIENT_READY_ACCEPTED` is not claimed because verified
tax identity/tax profiles, express DPA/retention approval and formal signer/human acceptance remain
pending. Automated and agent-run evidence is not a customer signature or legal/tax determination.

## Authorized production effects

The Owner/requester separately authorized deployment of the exact candidate, observation of two
automatic cycles, Caddy validation and production smoke testing. The reviewed deployer was run once.
No push, PR, DNS edit, service configuration edit, live account/password/email change, mail-server
access, real invoice send, payment record or real customer signature was performed.

- Release archive: `/home/kripta/jaautomation-release-20260906-2058db2-final.zip`
- Archive SHA-256: `cebad8d9810713fe21ef55b42c8ba87163116afb53babecf0c6325a4f98fa71d`
- Active release: `/opt/jaautomation/releases/ja-automation-cebad8d9810713fe21ef55b42c8ba87163116afb53babecf0c6325a4f98fa71d`
- `RELEASE-BUILD.txt`: commit `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`, `source_snapshot=HEAD`.
- Pre-change online backup: `/var/backups/jaautomation/2026-09-06T131153278Z-7eb5c1fb-799d-44e9-9164-0a1e567f7037`
- Backup database SHA-256: `4e0c9a820ffa4d0d761f4bdf325b08f112d1ce000dbffee62c2cd4ef5f074a89`
- Rollback images retained under tag `rollback-20260906130945-cebad8d98107`.
- Production database after additive migration: schema 39, `integrity_check=ok`, zero foreign-key violations.
- Site and portal containers healthy; jobs container running.

## Packets and exact changes

- WP00: checkout/runtime/authority discovery, AGENTS and lease rules, isolated test storage/database/accounts/mail, dirty-tree ownership and finding reproduction.
- WP01: actual versus billed time; independent worker pay, internal cost and sale; effective multi-worker rates; strict dates; immutable corrections; two-connection approval/update races.
- WP02: typed-money PDF/XLSX/CSV, formula-safe fields, stable empty CSV schemas, required PDF+XLSX pack completeness, independent retry and reader checks.
- WP03: worker-attributed money-free customer reports and acceptance bound to the exact snapshot/hash/PDF version.
- WP04: separate reviewed Labor/Expense invoice streams, immutable issued sources, corrections/credits, collections, reimbursements and reversals.
- WP05: role-specific Owner/Finance/PM/Worker projections, own-pay visibility, commercial confidentiality and responsive navigation.
- WP06: industries-first EN/ES/PT website, invalid contact removal, explicit future issuer identity and 255-route build.
- WP07: optional MFA for every account and operation; active step-up endpoint/helper/UI removed; live-session, RBAC, IDOR, CSRF and private-artifact controls retained.
- WP08: gates, browser matrices, 126 canonical artifacts, reader/visual inspection and three four-page employee PDF manuals generated from the frozen UI.
- Final correction hardening (`2058db2`): canonical A→B→C correction lineage, deterministic rejected-attempt retry IDs, atomic supersession, and transactional draft-only time/expense edits with a real two-connection expense race regression.

## Finding dispositions

| Finding | Final disposition                    | Evidence                                                                                                                                                         |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JA-01   | FIXED                                | 19 XLSX files, 112 sheets, 2,966 numeric and 558 date cells, zero formulas; opened with openpyxl 3.1.5.                                                          |
| JA-02   | FIXED                                | Acceptance binds the exact report snapshot, hash and PDF; stale/tampered/wrong-scope evidence is rejected.                                                       |
| JA-03   | FIXED                                | Customer reports retain worker attribution; all 10 samples pass the zero-money scan.                                                                             |
| JA-04   | FIXED                                | Draft deletion remains; reviewed time uses append-only, reasoned corrections.                                                                                    |
| JA-05   | FIXED                                | State/version/access are rechecked in immediate transactions; distinct SQLite connections reject stale approval/update.                                          |
| JA-06   | FIXED                                | Strict round-trip ISO calendar dates cover time, billing, invoice and payment boundaries.                                                                        |
| JA-07   | FIXED                                | CSV formula protection is type-driven while legitimate signed numbers remain numeric.                                                                            |
| JA-08   | FIXED                                | PDF and XLSX are mandatory pack outputs; every format has independent state/retry.                                                                               |
| JA-09   | FIXED FOR NEW OUTPUT                 | Invalid phone/speculative defaults removed; supplied issuer/billing/currency/series rules recorded without inventing missing tax identity or tax-address status. |
| JA-10   | TECHNICALLY VERIFIED                 | EN/ES/PT site and portal locale probes pass live; 360/390/768/1440 UI checks pass; human marketing/legal acceptance remains open.                                |
| JA-11   | RESOLVED FOR DELIVERY                | Owner formally selected optional MFA/no step-up and waived separate-host restoration; local backup/rollback remain verified.                                     |
| JA-12   | FIXED                                | Manuals and manifests are generated from and bound to `2058db2`.                                                                                                 |
| JA-13   | RESOLVED                             | New calculations use exact minutes and typed money; supplied per-line two-decimal rounding and sum-of-lines total policy is recorded; history is immutable.      |
| JA-14   | FIXED IN TREE; OWNER ASSESSMENT OPEN | Tracked credential literals removed and scans pass; any live rotation is a separately controlled owner action.                                                   |

## Exact verification results

All repository tests used Node 24.19.0, pnpm 11.22.0, disposable SQLite/private storage,
synthetic identities and safe mail isolation. Chromium used one worker.

| Command                                                             | Result                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`; `pnpm lint`; `pnpm typecheck`                  | PASS; formatting/lint clean, 10/10 typed projects.                                                                                                                                                                                    |
| `pnpm test:unit`                                                    | PASS; 128 files / 848 tests.                                                                                                                                                                                                          |
| `pnpm test:security`                                                | PASS; 32 files / 189 tests.                                                                                                                                                                                                           |
| `pnpm test:integration`                                             | PASS; 52 files / 390 tests.                                                                                                                                                                                                           |
| `pnpm test:reporting`                                               | PASS; 1 file / 7 tests.                                                                                                                                                                                                               |
| `pnpm exec vitest run tests/migrations --no-file-parallelism`       | PASS; 11 files / 85 tests.                                                                                                                                                                                                            |
| `pnpm test:invariants`; `pnpm test:offline`; `pnpm test:continuity` | PASS; 1/1, 3/8 and 1/16.                                                                                                                                                                                                              |
| Isolated website, portal and jobs builds                            | PASS; 255 website routes; jobs bundle 1,460,130 bytes.                                                                                                                                                                                |
| Cross-role Playwright, phone-390 + desktop                          | PASS; 10 tests, 4 intentional viewport/role skips.                                                                                                                                                                                    |
| Accessibility/responsive Playwright, 360/390/768/1440               | PASS; 24/24.                                                                                                                                                                                                                          |
| Manual capture Playwright                                           | PASS; 1/1, 23 screenshots.                                                                                                                                                                                                            |
| Final 32-step Playwright with production evidence and Caddy origin  | PASS; 32/32 in 1.6 minutes, aggregate 1/1 in 2.0 minutes.                                                                                                                                                                             |
| `verify-vps.sh ... --wait-two-automatic-runs`                       | PASS; automatic cycles `13:15:33.747Z` and `13:15:38.783Z`, each `failed=0`.                                                                                                                                                          |
| `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`  | PASS; valid configuration (format-only warning at line 220).                                                                                                                                                                          |
| Public HTTPS probes                                                 | PASS: EN/ES/PT/login 200; compatibility `/app` 303 to login; scoped public health/readiness 404; TLS verify result 0.                                                                                                                 |
| Authenticated production Owner smoke                                | PASS: login without MFA; dashboard, projects, approvals, reports, planning, documents, finance, billing, ledger, accounting, audit and profile all 200; zero page/server errors.                                                      |
| Authenticated production Worker confidentiality smoke               | PASS: worker routes 200; zero forbidden finance navigation; finance/billing/ledger/accounting/audit all 403; unassigned-project probe 404.                                                                                            |
| Authorized synthetic production workflow and cleanup                | PASS: two client/project/assignment flows, 60-minute drafts, USD 1.00 expenses/private receipts and daily reports exercised; drafts removed, assignments ended, projects/clients archived, two immutable synthetic receipts retained. |
| Complete live Worker expected-payment / Owner budget path           | PASS: project → time → expense/private receipt → daily report → Worker expected-payment surface → Owner canonical planned/budget metrics; confidential budget/rate/cost keys absent from Worker serialization.                        |
| Live locale probes                                                  | PASS: website and login return correct `html lang` and localized titles for EN, ES and PT-BR.                                                                                                                                         |

Earlier red runs were retained, diagnosed and superseded: a reviewed-source mutability regression,
headerless empty Accounting CSVs, a manual capture callback error, a missing synthetic tenant build
guard, missing external evidence in the first 32-step run, and one incorrectly path-qualified Caddy
origin. The final corresponding runs pass. Three dead-letter jobs and four failed localized PDFs found
in production are historical (created 23–31 August, finalized 3–4 September), not failures of the
post-deploy cycles; they remain visible rather than being silently rewritten.

## Operations, artifacts and reader evidence

- Operations envelope: `operations/PRODUCTION_OPERATIONS_EVIDENCE.json`; internal canonical digest `c5a3368dd0a99b705113017c10667a42baca0084b402ab5713e657bc6fbc7952`; contract parser accepted it in the passing 32-step run.
- Artifact manifest: 129 records (126 renderer outputs plus three manuals), SHA-256 `ac525382e8375cce4dd2589e8fc13f62a4b9dc438609d3d46a1fb304cb259760`.
- Generation index: 126 completed records, SHA-256 `4306596fb900b7dd64a973e3df814f8e00cbeff95c5cefe0067f0503604ae76d`.
- Reader matrix: 70 PDFs / 490 pages rendered and inspected; 19 XLSX / 112 sheets; 28 CSV / 469 rows; 9 JSON.
- Five all-page PDF contact sheets were visually inspected with no blank, clipped or overlapping output.
- Employee manuals: EN `2eb970c633fe32829488796ccaf8537a02fc24bd4e3da56df3cf401f3851c383`; ES `d699be982b577c2e7f85e247244a42897fa9fc31b41c6755e76e1a463781356f`; PT-BR `813f687bfcddf56b682f71f05b0c1a09f1adc53869888cdf4b7a54c2916ab932`.
- Completion audit: `COMPLETION_AUDIT.md`; 14/14 findings (13 supplied plus campaign-added JA-14), 27/27 handoff scope IDs,
  24/24 targeted regressions, 17/17 Client Essential CORE IDs and 7/7 contractual handback files
  are explicitly dispositioned.

Sanitation excludes `.env`, tokens, cookies, password hashes, mailbox bodies, production DB/files,
real pay/bank data, private keys, node_modules and caches. Samples use synthetic identities and
`example.invalid`. The operations envelope contains deployment identity but no authentication secret.

## Authenticated production and synthetic lifecycle evidence

- The supplied production credentials were used only through non-echoed process input and are not
  stored in the repository or evidence. Both accounts were already active and verified, with MFA
  optional/off; no account, email, password, mailbox or mail-server setting was read or changed.
- Owner route smoke passed 13 protected areas, including all finance and audit views, with zero page
  or server errors. Worker route smoke passed normal worker pages while all five confidential
  finance/accounting areas returned 403, the navigation exposed none of those links, and an
  unassigned-project object-scope probe returned 404.
- The authorized TEST/SYNTHETIC workflows created no real identity, email, customer invoice, payment,
  fiscal number or outbound mail. They exercised project assignment, actual time, expense/private
  receipt, daily report, Worker expected-payment and Owner planned/budget behavior. Worker responses
  contained no confidential budget/rate/cost keys. Cleanup used product lifecycle transitions: drafts
  deleted, assignments ended, two projects/clients archived. Two committed synthetic receipts remain
  intentionally immutable and identified for audit; direct deletion is rejected by the product as
  designed. Final read-only counts are two archived projects, zero active assignments/time/expenses/
  daily reports and two immutable receipts.
- The accounting-output human approver is the Owner. All automated XLSX/PDF/CSV reader and visual
  gates pass, but the Owner's human approval is not fabricated here.

## Independent review

The configured read-only reviewer inspected SHA `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`
and returned `ship`. It explicitly verified canonical correction lineage/retry behavior, atomic
draft-only updates, the two-connection race regression, migration-contract hashes, optional MFA and
absence of active step-up. Its only pack caveat was that artifacts/manuals still referenced the prior
SHA; all of those were regenerated and hash-validated against `2058db2` before this report.

The same reviewer performed a final read-only handback consistency pass after production smoke and
the Owner decision update. It first identified two stale checklist sentences that still called Caddy
and Owner smoke pending; those sentences were corrected without changing application code. The
reviewer then returned `ship` and confirmed that only DNS/mail operator verification and the stated
human/fiscal/DPA gates remain open.

A further read-only review of the production hosting/processor/DNS inventory also returned `ship`:
it confirmed that the evidence is framed as technical discovery, retains `NO / PENDING` legal status,
does not claim DKIM/external delivery, and contains no embedded credentials or secret assignments.

## Recorded fiscal/privacy decisions and remaining gates

- Recorded: issuer J&A Automation LLC; default USD with per-client/project/contract override;
  supplied billing address not yet asserted as verified tax/legal address; configurable client/project
  series; Owner/authorized Accounting approval and issue authority; Worker exclusion; typed-decimal
  per-line two-decimal rounding; secure, non-hard-coded remittance values; separate labor and expense
  tax categories; fail-closed definitive issue when required tax configuration/identity is missing.
- Still pending adviser/Accounting: verified EIN/TIN, legal/tax-address confirmation, actual labor and
  expense tax profiles, and confirmation of due-date policy. The observed examples support +1
  calendar month only, not an inferred Net 30 rule.
- Recorded DPA basis: controller J&A Automation LLC; only actual processors in the inventory;
  production metadata identifies Hetzner Online GmbH in Falkenstein, Germany (EEE); database,
  private storage and backups are local, with remote backup disabled. SMTP/IMAP/JMAP resolve to the
  same VPS and the listener is self-hosted Stalwart, so it is recorded as an internal component.
  No external analytics, monitoring, object-storage, payment or transactional-mail SDK was found in
  shipped source. US/BR access and any off-code provider still require authorized confirmation. The
  authorized owner explicitly answered `NO / PENDING` to DPA/retention approval, so no destructive
  retention automation was enabled and the proposed 7-year/24-month/12-month periods remain
  proposals under legal hold/archive.
- Public DNS read-only checks: MX points to the self-hosted mail hostname, application and MX resolve
  to the same VPS, PTR points back to that hostname, SPF is published and DMARC policy is `p=none`.
  No mailbox/message/private mail configuration was accessed. DKIM selector and external delivery
  remain a separate authorized-operator check if required.
- Still pending human/formal: authorized signer identities, Owner Accounting-output approval, Worker
  manual walkthrough and marketing/legal content acceptance. The statement that documents are
  signed is recorded without inventing signer names or signatures.
- Security owner may separately decide whether historical credential exposure warrants controlled
  rotation. No credential or mail-system mutation is authorized or performed by this campaign.

## Exact next action

Obtain adviser confirmation for EIN/TIN, tax/legal address, tax profiles and due-date policy; obtain
express legal/privacy approval of the real processor/region/transfer inventory and retention periods;
then record the Owner/Worker/Accounting/content/signatory human acceptance against the unchanged
deployed application SHA. Until those approvals exist, the truthful state is
`TECHNICALLY_VERIFIED_AWAITING_OWNER`.
