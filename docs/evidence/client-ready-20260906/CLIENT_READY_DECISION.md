# Client-ready decision — 2026-09-06

State: `TECHNICALLY_VERIFIED_AWAITING_OWNER`

Exact frozen and deployed application candidate:
`2058db24ca4d5d6b3f66bde11b6230e271a2d06c` on
`codex/v3-production-completion-orchestrated-20260819`.

All implementation, migration, security, finance, reporting, build, browser, accessibility, reader
and manual-generation gates pass. The strict acceptance journey passes 32/32 with fresh evidence
bound to the production tenant/deployment: two automatic successful cycles, local pre-deploy backup,
retained rollback, the Owner's explicit separate-host restoration waiver and the deployed Caddy
boundary. The exact candidate is active and healthy.

The Owner/requester formally resolved the authentication conflict for this delivery: MFA is optional
for every account and operation, and step-up authentication must not exist. Production schema 39 has
`mfa_required=0` for all current accounts. Live-session, role, object-scope, CSRF, IDOR, private-file
and append-only audit controls remain enforced.

Independent read-only review returned `ship` for the exact source candidate. The review's sole pack
caveat—stale artifact/manual candidate identity—was resolved by regenerating and validating the full
129-record manifest against `2058db2`.

The designated production Owner and Worker were then exercised against the deployed application.
Owner protected routes passed without MFA. Worker operational routes passed, no confidential finance
navigation was exposed, five finance/accounting route probes returned 403, and an unassigned-project
probe returned 404. An authorized TEST/SYNTHETIC project-to-report workflow was cleaned through normal
lifecycle transitions: assignments ended, projects/clients archived, drafts removed, and two committed
synthetic receipts retained because immutable evidence must not be deleted. No mail, credential, fiscal
sequence, invoice, payment or real identity was changed or created.

Issuer/currency/rounding/series/remittance/RBAC decisions supplied on 2026-09-06 are recorded in
`OWNER_DECISIONS.md`. EN/ES/PT-BR website and login locale probes pass live, in addition to the full
portal i18n/browser suite and frozen manuals.

Remaining gates are explicit adviser/legal/human inputs, not unimplemented technical defects:

1. Verified EIN/TIN, confirmed tax/legal address, approved labor/expense tax profiles and final
   due-date policy. The observed +1 calendar month is not silently relabelled Net 30.
2. Express approval of DPA wording, actual processors/datacenter/transfers and retention/deletion
   policy. Technical discovery identifies Hetzner/Falkenstein, Germany (EEE), local private storage
   and self-hosted Stalwart, but does not substitute for legal approval or authorized US/BR transfer
   decisions. The supplied decision is explicitly `NO / PENDING`, so conservative archive/legal-hold
   behavior remains and no irreversible deletion schedule is enabled.
3. Formal authorized signer identities and recorded Owner Accounting-output, Worker manual and
   marketing/legal content acceptance.
4. Security-owner decision on whether historical credential exposure warrants controlled rotation.

No client signature or legal/tax approval is inferred. The next action is to obtain the four precise
external approvals above and record them against the unchanged deployed SHA.
