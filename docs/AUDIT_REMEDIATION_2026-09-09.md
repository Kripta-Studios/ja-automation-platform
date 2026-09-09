# Audit remediation — 2026-09-09

This work addresses the audit of 57dfb95 against the Client Essential SPEC and contractual PDF.
The starting production feature is c6a6179 (supplier workforce), with documentation through
49b9e62. The historical audit remains unchanged; a newer release does not erase its findings.

## Work and dependencies

| Audit item                     | Implementation / evidence required                                                                                                                                | Current status                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 repeated receipts          | Controlled conflict, authorization, original preservation, failed-byte cleanup; action and browser regression                                                     | Implemented; action/repository regressions and real Worker browser flow pass at 360/390/768/1440 px; release verification pending            |
| H02 mail adapter               | Authoritative recipients/payloads; external verified-user notifications; encrypted usable invitations; explicit invoice attachment queue and SMTP acknowledgement | Implemented; real local SMTP protocol tests and Finance browser queue flow pass at four widths; no real external test mail sent              |
| H03 30-day backups             | Timestamp-safe retention, latest snapshot integrity, measured daily coverage                                                                                      | Implemented retention floor and timestamp checks; five retained snapshots cover only one of thirty days; deleted history cannot be recreated |
| H04 offsite continuity         | Authorized distinct destination, encrypted transfer, retrieval and restore evidence                                                                               | Destination required; prior go-live waiver is not offsite implementation                                                                     |
| H05 MFA wording                | Reconcile SPEC with recorded Owner decision; preserve original PDF and disclose divergence                                                                        | SPEC reconciled with 2026-09-06 D13; no new signature or contractual amendment asserted                                                      |
| H06 fiscal configuration       | Verified issuer identity/address/tax identifiers; real Labor/Expenses profiles, due-date/cadence/compensation rules; Accounting validation                        | Real inputs and approval required; do not replace with test values                                                                           |
| H07 mailbox delivery/migration | Historical/alias inventory, DKIM evidence, external roundtrip, actual Stalwart restore, Careers delivery                                                          | Evidence gathering; external test recipient and approved mail test required                                                                  |
| H08 monitoring/verification    | Real backup verifier, alert channel and independently observable failure/recovery                                                                                 | Actual streaming backup verification implemented and tested; host activation pending; external alert destination required                    |
| H09 DPA/content/UAT            | Current version-bound acceptance evidence, controller approval, retention instructions, authorized signatures                                                     | Human approvals required; no fabricated signatures                                                                                           |
| H10 integrated proof           | Repeat full 32-step journey with current operational evidence after implementation freezes                                                                        | Application steps 1–29 pass; steps 30–32 still require bound operational/continuity/Caddy evidence                                           |

Dependency order: upload and recipient integrity → mail queue/acknowledgement and backup verifier →
focused security/lifecycle tests → real multi-role browser journey → independent review → release
and production verification. Backups and external communications are not modified or sent as a
side effect of synthetic tests. MFA remains optional as already instructed.

## Information still needed from the responsible people

- Operations/Owner: separately administered backup host/service and access provision; alert channel;
  owned external mailbox for explicitly authorized delivery/roundtrip tests. Do not put passwords
  in this document or chat.
- Accounting/Owner: verified legal/fiscal identity and address; per-stream taxes, payment terms,
  compensation/cost interpretation and approval of representative reconciled outputs.
- Mail administrator: agreed mailbox and alias inventory, original historical source, and permission
  to compare message counts/dates and perform a non-destructive isolated recovery.
- Authorized signatories: final DPA/retention instructions, content/image approval, worker walkthrough
  and acceptance tied to the final released revision. Existing drafts stay drafts until approved.

Thirty days of future retention cannot restore deleted past backups. Record the coverage gap and
observe real daily snapshots accumulating; never backdate copies or count multiple same-day copies
as separate days. Preserve current complete backups throughout this remediation.

## Verification and release limits

The complete automated run exercised 206 files: 202 files / 1,403 tests passed. Four files
reported eight failures while their dependencies were being edited; cached earlier modules and
newer tests were mixed in that run. It is not recorded as a passing final suite. All four files,
plus the related security, durability, retention and UI regressions, passed a final rerun of
78 tests in 11 files. The subsequent recipient-case normalization correction passed its focused
lifecycle replay test and ESLint. Workspace typecheck and ESLint passed before that bounded delta.

Authenticated browser checks passed at 360, 390, 768 and 1440 px for both renamed duplicate
receipts and explicit invoice email queueing. They use disposable users, databases and private
files. The invoice PDF is generated by the real artifact worker; queueing leaves invoice state
and sent_at unchanged. Local SMTP tests exercise attachments, server acceptance, explicit DATA
rejection, lost responses, acknowledgement failure and crash recovery. They do not prove real
external mailbox delivery.

The operational backup verifier streams document hashes in place and copies only SQLite into
a private temporary directory for integrity/foreign-key checks. This avoids duplicating the
artifact corpus in the jobs container's RAM-backed /tmp. Retained originals are not opened
with SQLite. A dedicated read-only backup group and mount are required for jobs; the previous
backup creator preserves private source modes, so the release procedure must apply the new
permission setup immediately after its pre-cutover backup and before starting new jobs.

SMTP acceptance followed by an acknowledgement error, a lost final reply or a stale durable
claim results in terminal **Delivery uncertain**, without automatic resend. A complete negative
SMTP DATA reply is a definitive rejection and remains eligible for the bounded retry policy.
Neither SMTP acceptance nor a manual sending declaration proves inbox delivery.

Recipient addresses are normalized consistently before queue idempotency is calculated; changing
only letter case returns the same event instead of creating a second delivery to the same mailbox.

## Language correction included in this release

English is the default when no valid language preference exists, regardless of the browser's
Accept-Language header. The portal and login now share the same English/Spanish/Portuguese
preference, with one-year cookies and synchronized current/legacy browser-storage keys. Existing
users whose old portal selector stored English while the login retained Spanish receive a
one-time preference migration. Reload, navigation, logout and the next login preserve the choice
in that browser; this does not assert cross-device account synchronization.

The review also corrected untranslated form/accessibility labels, supplier operational states and
CSV labels, closeout outcomes, financial save feedback and malformed English action messages.
Business names, identifiers, original uploaded content and immutable snapshots are not translated.
The final focused run passed 110 tests in 12 files, workspace typecheck, portal ESLint and formatting.
Browser and regenerated manual evidence are bound to the final source digest in
`docs/manuals/validation/current-capture.json`; the production receipt records activation separately.

The first combined browser run exposed two test-maintenance problems: the supplier test still
expected lowercase technical states instead of the new user-facing labels, and left shared
Worker fixtures with supplier privileges. Assertions now require the actual localized English
labels, and cleanup restores ordinary test-account capabilities while retaining historical
supplier records. That interrupted run is not counted as passing evidence.

The requester prohibited further agents after the existing workers completed. Final integration,
review of the last translation corrections, testing and release are performed by the lead alone.
