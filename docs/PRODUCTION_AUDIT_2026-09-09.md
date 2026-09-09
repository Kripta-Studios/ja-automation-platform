# Production audit and remediation — 2026-09-09

Scope: Client Essential CORE-01–17 and the existing customer-period/closeout flows.
This audit uses disposable databases and authenticated local browser fixtures. Production
inspection is read-only. It does not constitute human acceptance, fiscal approval or deployment.

## Confirmed findings

| Finding                                                                         | Impact                                                                    | Correction / evidence                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional assignment expiry stored as empty string                               | Worker assignment appears saved but does not grant effective scope        | Normalize no-expiry to SQL NULL; existing regression retained.                                                                                                                          |
| Hourly/daily compensation form submits a hidden percentage                      | Valid compensation configuration rejected                                 | Render percentage only for percentage rules; existing multiworker browser regression retained.                                                                                          |
| Optional finance scope/expiry/rule references stored as empty strings           | Rules fail to resolve or trigger foreign-key failures                     | Exact empty-string normalization; 4 financial integration cases.                                                                                                                        |
| Assignment editor cannot clear expiry, planned duration or review flag          | Previously granted review permission and obsolete constraints persist     | Explicit form-field presence; empty controls clear values.                                                                                                                              |
| Assignment edits accept empty starts/NaN or surface invalid duration as HTTP500 | Invalid stored scope or unhelpful server failure                          | Validate ISO start date, decimal input syntax and nonnegative safe-integer duration before mutation. Red reproduction: empty date/NaN accepted; negative/fraction/infinity returned500. |
| Contact editor cannot unset billing/primary checkboxes                          | Old contact designation remains after successful save                     | Presence markers distinguish unchecked controls from omitted partial-update fields. Red reproduction and actual-repository action tests.                                                |
| Invalidated customer conformity omitted from report detail DTO                  | User sees ready-for-signature instead of invalid evidence                 | Preserve invalidated record without granting acceptance; existing correction retained.                                                                                                  |
| PM can list and authorize finance-classified project documents                  | Confidential financial evidence exposed to operational role               | Owner/Finance can select restricted finance access in the actual upload form; server role validation, list and generic download authorization enforce it; regression failed before fix. |
| Generic and receipt uploads accept filename/MIME mismatch                       | Executable filename can be distributed as a private attachment            | Reuse existing report-attachment filename, extension and content validation for generic, expense and offline uploads.                                                                   |
| Restore checks foreign_keys flag rather than actual relationships               | A database with orphan rows can replace a valid target and report success | PRAGMA foreign_key_check before any target swap; red/green test also proves existing DB/files remain unchanged on rejection.                                                            |
| Cash calendar and period-review navigation links are 19px high                  | Required mobile controls fail 44px touch-target check                     | Use existing secondary-button primitive; all role/viewport accessibility cases passed.                                                                                                  |
| PT-BR detailed manuals not registered or packaged                               | PDFs exist in Git but are unavailable in Help/production image            | Add locale assets and Docker COPY entries; exact-byte distinction and RBAC tests.                                                                                                       |

Additional security corrections from independent review:

- Finalizing a reserved upload rechecks current project access inside the write transaction.
  Revoked Worker/PM membership leaves the reservation temporary without a finalized audit event.
- Customer closeout selection and generation allow only standard-classified source documents;
  finance, identity, HR, security, confidential and receipt classifications are rejected even
  if their artifact type and sensitivity otherwise resemble customer material.
- Patched Next.js and eslint-config-next to 16.3.3, sharp to 0.35.4, and narrowly overridden
  vulnerable transitive cookie, esbuild and js-yaml versions. References:
  [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
  [sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
  [js-yaml advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh).

## Validation record

- Independent-review follow-up: upload, closeout and strict form parsing: 3 files, 41 tests passed.
- Form/assignment/finance focused verification: 3 files, 30 tests passed.
- Private-document/scanner/upload focused verification: 4 files, 26 tests passed.
- Additional generic/offline filename checks: 4 passed.
- Backup/restore and encrypted continuity regression: 2 files, 20 tests passed.
- Manual catalog and role-protected downloads: 2 files, 10 tests passed.
- Workspace TypeScript: passed after final application edits.
- ESLint: passed. Svelte checking: zero errors; seven pre-existing unused-CSS warnings.
- Website, portal and jobs production builds: passed with patched dependencies.
- Independent final review: no unresolved blocking finding; reviewed corrections approved; production release boundary remains below.
- Actual classified uploads (Owner/Finance accepted, PM/Worker denied), filename boundary and i18n: 3 files, 21 tests passed.
- Dependency audit including development dependencies: zero known vulnerabilities (729 dependencies).
- Full Vitest final-source coverage: 199 files / 1,351 unique cases verified across the complete run
  and focused rerun. The second complete run passed 1,350; its offline form-opening case failed
  while four workers and a production build competed. Both offline cases then passed unchanged
  in the dedicated run (50.95s). The financial concurrency correction passed in that full run.
  This is aggregate evidence, not a claim that the complete command exited zero.
- Role/viewport matrix: 71 passed, one multiworker fixture-date failure, 12 existing viewport skips;
  the corrected multiworker journey subsequently passed all four viewports. All 72 selected
  executable role/viewport cases are covered without removing an assertion.
- Additional acceptance pass: 17 passed / 30 existing viewport-specific skips, covering finance
  document upload/privacy on all four viewports, public-site behavior/accessibility and current
  authenticated manual capture. The separate 32-step journey is recorded below.
- All seven manuals regenerated; final catalog/private-download tests: 10 passed.

The first browser pass also exposed stale test assumptions: exactly one lifecycle control
regardless of fixture count, selecting the first report URL (now the period-review link), and
case-mismatched assignment launcher text. Tests now select the actual lifecycle controls and
create a unique draft before asserting draft deletion. No security assertion or viewport is removed.

The complete first final Vitest run passed 1,350 of 1,351 cases. Its one failure was the
concurrency harness announcing readiness before its first committed competing write. The
handshake now waits for that commit with a bounded timeout; the writer remains active during
settlement and coherent-money assertions remain unchanged. Independent review approved the repair.
The browser matrix passed 71, failed one and intentionally skipped 12. Its remaining multiworker
case reused one work date across four viewports, correctly triggering the real daily 24-hour
limit. Each viewport now has a distinct August date, consistent across assignments, rates and
time; exact six-hour compensation and privacy assertions remain unchanged. The four-viewport multiworker rerun passed; the added finance-upload browser test initially used an exact label that included the Required marker, then passed all four viewports using the real accessible control roles.

## Client Essential acceptance journey

The final desktop journey completed steps 1–29 and 32 successfully. Steps 30 and 31 fail only
with `OPERATIONS_EVIDENCE_MISSING`: this candidate has no supplied identity-bound operator
record for automatic jobs and continuity. The strict test therefore exits nonzero and reports
`NOT_READY`; these gates were not skipped or converted to passes. See the unaltered
[32-step result attachment](evidence/production-audit-20260909/acceptance-32-step-results.json).
The final finance-upload desktop rerun also passed after tightening its effective-assignment
precondition. The journey repair asserts the fixed Worker role, selects the assigned worker
for both finance rules, and checks action HTTP success before navigation. Its prior cascading
failures came from outdated test inputs; no production invariant was relaxed.

Detailed EN/PT-BR and field EN/ES/PT-BR manuals were regenerated from 45 authenticated synthetic
captures sharing source digest `a64b6893d204f33ff345933dd4c2af7fe591d3d37c10f98441fbc24da26b06c6`.

## Read-only production observations

Independent inspection found local readiness OK, SQLite quick_check OK, zero foreign-key
violations, migration41, active jobs/backup timers and successful last service results.
The last observed backup timer trigger was September8, 02:30 CEST. These checks describe the
currently deployed application, not the remediation candidate in this worktree.
A final read-only document inventory found 13 committed receipt documents and zero committed
rows in any other classification; no standard-classified committed rows matched the finance,
payroll, invoice or compensation type tokens. No historical reclassification was performed.

## Remaining release boundary

After technical verification, this candidate still requires deployment and verification of the
exact deployed revision. Existing owner/adviser inputs in the September6 client-ready decision
remain external: tax identity/profiles/due-date policy, privacy/retention decisions and recorded
human acceptance. MFA remains optional by the Owner's explicit decision; separate-host recovery
remains waived. No invoice issuance, real payment, signature, mail delivery or legal approval
has been simulated as a production fact.
