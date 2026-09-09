# Supplier workforce — implementation and release evidence

Requested by the Owner on 2026-09-09: Antonny appoints a supplier representative to record actual
work for 5–10 technicians on specifically authorized installations. The representative can add
technicians. Supplier and external-technician accounts have operational reports without financial
access. An installation uses the existing project boundary; the base application role stays Worker.

## Delivered behavior

- The Owner creates the supplier, assigns an existing login-enabled Worker as coordinator or external
  technician, and grants each coordinator an installation and effective dates. A coordinator cannot
  appoint itself, approve hours or obtain administration/finance authority.
- The coordinator creates personnel records with a name and optional email, assigns its own
  technicians, and creates/edits/submits canonical actual hours. Registration does not create login
  credentials or send an invitation. The Owner configures any existing account that needs login.
- Canonical time preserves the technician and the actual recorder separately, follows existing
  duration/overlap/approval rules and retains correction history. Owner corrections inherit supplier
  provenance from immutable source links, even after an external profile is cleared.
- External technicians see their own operational records only. Restricted accounts have no pay,
  rates, expenses, commercial DTO fields, financial documents or financial downloads. Route and
  repository checks enforce this on the server; time DTOs use an explicit operational allowlist.
- Operational HTML, CSV and browser-generated PDF reports show actual work, state and recorder.
  Rejected, void and superseded records remain in history but do not increase the effective total.
  Delegated draft discard retains the recorder and voids the record.
- Profile changes invalidate sessions. Installation revocation also applies to the coordinator's
  ordinary time/report routes and project selectors, not only supplier endpoints. A shared live-grant
  check requires current authority, active supplier/user/project and valid operation dates. Overlapping
  active grants for the same coordinator/installation are rejected within the write transaction.
- Revoking one coordinator does not remove another coordinator's grant or independently managed
  external-technician membership. The Owner manages those authorizations separately. Historical
  supplier identity cannot be transferred to a different supplier after canonical work exists.

Implementation dependency order was storage/live authorization → canonical delegated time → Owner
and supplier UI → financial projection restrictions → multi-role browser/manual verification. The
backend and portal packets had separate write ownership; material permission changes received an
independent read-only review, with concrete findings returned for correction. The unrelated existing
checklist audit remains outside this change.

## Validation

The broad Vitest run passed 1,388 tests in 203 files. It started before the final generic-route
revocation correction; that final authorization delta is verified separately by the focused suite
and browser evidence. Parent-focused validation covers supplier integration, financial access,
route access and navigation, including ordinary time create/update/submit/list/detail/week after
revocation, report list/detail/submit, selector exclusion, expired grants, inactive suppliers and
independent technician membership. The final focused suite passes 49 tests, including standard-worker expired-membership isolation.
Workspace type checks and ESLint pass.

Authenticated browser journeys passed at 360×800, 390×844, 768×1024 and 1440×900: Owner appointment,
two installations, adding a new technician and an existing external account, 120 Owner-approved
minutes plus 30 own draft minutes, a 150-minute report, CSV and actual PDF generation, Portuguese
locale-cookie persistence, financial DTO/endpoint denials, own-record isolation and live revocation.
A coordinator's personal time detail is accessible before revocation and concealed afterward; its
ordinary time list no longer includes that installation's record. Browser fixtures use real local
credential authentication against a disposable database, without production writes or messages.

English and Portuguese Owner/Worker manuals and EN/ES/PT-BR field guides are regenerated with fresh
source-bound authenticated captures. Supplier figures use readable 1440×900 viewport captures.
Generated PDFs are checked by text extraction and visual rendering. No production data is included.

## Schema-compatible recovery and activation

Migration 0042 is additive. An online SQLite copy of production upgraded from schema 41 to 42 with
integrity `ok`, zero foreign-key errors and unchanged full-row hashes for user, project,
project_member, time_entry, expense, invoice, document and audit_event. The reviewed SQL and contract
manifest hashes remain frozen. The migration ledger rejects startup by schema-41-only code once
schema 42 is installed, so recovery must retain compatible code.

Commit `6480e63` provides the previous application with migration 42 registered and a baseline-only
hook that denies supplier-profile application requests with HTTP 503. This prevents old code from
exposing financial data if it is used for recovery after supplier profiles exist. The baseline image
passed an isolated Docker startup and real synthetic login on a private production copy with network
disabled: standard Worker time and anonymous login return 200, while both supplier profiles receive
503 on operational and financial paths. The full feature image separately permits operational time
and denies financial paths. Production-image manual hashes are compared to the validated PDFs.

Activation is in two stages: install this compatible baseline, then enable the full supplier feature.
Before the initial upgrade, pause ZIP deployment watchers and apply the validated outer Caddy
maintenance gate to block application writes, retaining the original configuration. The deployment
helper backs up the database and private artifacts and stops prior jobs. Keep maintenance active if
that initial upgrade fails; stop writers and restore the verified pre-upgrade backup before starting
schema-41 code. Remove maintenance only after schema-42 baseline health and jobs checks succeed.
The feature rollout can then use the retained schema-42 baseline for ordinary code rollback.

Production activation and the final commit/image/backup identifiers are recorded in the deployment
receipt after the final independent review and runtime checks.
