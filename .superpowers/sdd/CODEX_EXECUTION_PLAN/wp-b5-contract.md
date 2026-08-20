# WP-B5 — lifecycle, offline, and security hardening contract

Status: **BLOCKED — fix round 4/5 drafted; independent Security + Spec re-review required**  
Contract owner: Sol/medium policy lead  
Implementation routing: stable leaves are **A → Luna/max**; cross-leaf integration and any
unresolved policy change return to Sol/medium; final integration/security sign-off is independent.

This is an executable contract, not a replacement plan. It binds WP-B5 implementations to the
current repository, the Unified V3 specification, FIX-009/FIX-010/FIX-014,
V31-008/009/010/020/021/022,
V33-016/020/027/029/030, SPEC-SEC, SPEC-OFFLINE, DOD-77-01/02/15/16/19/21/22/40/41, and the inherited
Gate 1 findings. Finance calculation, issuance, payment, accounting, immutable invoice/source
history, and finance migration meaning remain forbidden WP-B2/B3/B4 territory.

## 1. Sources and current evidence

### 1.1 Authoritative requirements

- Unified V3 sections 6–8 require object-scoped roles, opaque authorization IDs, the complete
  client/project model, the project state machine, and date-ranged assignments.
- Sections 10, 34, 35, 36–38, 61–64, and 65 require coherent mutable-to-locked lifecycles,
  versioned offline conflict handling, user-private caches without bearer tokens, private uploads,
  step-up, server-side authorization, redacted append-only audit, safe health responses, and no
  deletion of historical finance.
- FIX-009 requires client/project edit/archive/restore/close with dependency and audit rules.
- FIX-010 requires safe draft edit/delete and correction/void/version behavior after submission or
  finalization.
- The backlog additionally requires a unified destructive-action vocabulary and autosave/recovery
  for long reports.

### 1.2 Implemented foundations to preserve

- `packages/database/src/domains/clients/client-repository.ts` creates and lists clients with
  authorization and transaction/audit seams.
- `packages/database/src/repository.ts` creates projects transactionally, has optimistic versions,
  supports project closeout finalization/reopen, limits report edits when included in a final period
  report, restricts time/expense edits to unlocked draft/needs-changes records, validates storage
  keys, and records audit events.
- `packages/database/src/domains/time/time-entry-repository.ts` checks effective membership when a
  time draft is created and uses optimistic versions.
- `packages/database/src/v3-repository.ts` records offline mutation outcomes idempotently per user,
  rejects version conflicts, quarantines documents when scanning is configured, authorizes private
  downloads, records document access, and validates storage keys.
- `packages/database/src/core/authorization.ts`, `core/audit.ts`, `hooks.server.ts`, and Better Auth
  provide active-account checks, session-bound step-up storage, key-based audit redaction,
  same-origin write checks, authentication rate limiting, secure response headers, and active-user
  session revalidation.
- Existing RED/product evidence is in `tests/e2e/artifact-lifecycle.spec.ts` and
  `tests/offline/cross-user-isolation.test.ts`. Existing security foundations are covered by
  `tests/security/session-step-up.test.ts`, `audit-redaction.test.ts`, `policy.test.ts`, and
  `repository-privacy.test.ts`.

### 1.3 Exact defects this packet must close

| ID     | Concrete evidence                                                                                                                                                                                                                 | Defect                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| B5-D01 | Client repository exports create/list only; project actions export create/schedule/assign only.                                                                                                                                   | No client/project edit/archive/restore action; close is only indirectly available through closeout internals.                                |
| B5-D02 | `client.status` is unconstrained but has no transition history; `project.status` has the required states but no prior-state record.                                                                                               | A safe restore target cannot be reconstructed after archive, especially for previously closed projects.                                      |
| B5-D03 | `deleteReport` permits Owner hard-delete for any non-final-period report and does not require `approval_state='draft'` or absence of approval history.                                                                            | Submitted, approved, or needs-changes history can be erased.                                                                                 |
| B5-D04 | Time and expense support draft edit but expose no safe draft delete; reports permit Owner delete but not creator delete.                                                                                                          | V31-010 is inconsistent across records.                                                                                                      |
| B5-D05 | Approved time/expense/report rows have no explicit correction-link contract.                                                                                                                                                      | A user can neither correct safely nor prove which preserved row a replacement supersedes.                                                    |
| B5-D06 | Report edit pages save only on explicit form submission; no autosave/recovery store or recovery prompt exists.                                                                                                                    | Long-report browser interruption loses entered work.                                                                                         |
| B5-D07 | `principalFor` and `listAssignedProjects` use `status='active'` without `starts_on/ends_on`; report technical membership defaults to today; time work-date edits do not revalidate membership or refresh stored project timezone. | Future/expired assignments grant current scope, and changing a time work date can escape the assignment window or retain the wrong timezone. |
| B5-D08 | `createPlanningAssignment` uses `Date.parse` without rejecting `NaN` and checks only active status, not whether the entire planning interval is inside membership dates.                                                          | Malformed timestamps and out-of-window planning can be accepted.                                                                             |
| B5-D09 | `listActiveWorkers` returns every active user with email/offboarding data to a PM.                                                                                                                                                | PMs can enumerate workforce outside their project scope; the route payload is broader than the operational need.                             |
| B5-D10 | `apps/portal/src/lib/offline.ts` uses one database, `ja-portal-user-cache`, and one assignments store; service worker cache `ja-portal-shell-v4` stores authenticated SSR responses by URL only.                                  | Private cached assignments/reports/time can cross user boundaries in a shared browser; there is no tenant/deployment partition.              |
| B5-D11 | Offline edits call `assertProjectAccess` against a principal set built without effective dates; existing-row sync does not re-check the record work/spent date membership.                                                        | An expired/future assignment can sync or edit records outside its effective period.                                                          |
| B5-D12 | `assertRecentStepUp` returns immediately outside production and for a caller-constructible service-actor boolean.                                                                                                                 | Protected semantics differ by environment and an untrusted flag can bypass fresh authentication.                                             |
| B5-D13 | `recordDocumentScan` accepts Owner/Finance as scanners; the scanner mode commits unscanned documents when scanner env is absent.                                                                                                  | Production scanning is not fail-closed and a human finance principal can assert a clean malware result.                                      |
| B5-D14 | Receipt and offline attachment routes create directories/write bytes before `registerReceipt` performs membership/authorization; no quota reservation exists.                                                                     | Unauthorized uploads can cause filesystem writes; concurrent requests can exceed any intended quota.                                         |
| B5-D15 | `isSafeStorageKey` does not reject drive-qualified keys such as `C:/x`; some route checks differ.                                                                                                                                 | Windows drive-qualified and inconsistent path forms can cross the private-root boundary.                                                     |
| B5-D16 | Audit redaction matches sensitive key names only; values embedded in `reason`, errors, free text, URLs, or authorization headers are retained. Service identity is not a first-class audited provenance.                          | Secrets/PII can leak into immutable audit/log history and service actions cannot be distinguished reliably.                                  |
| B5-D17 | CSRF origin/referer protection exists, but write-route tests do not prove every portal action/API is covered and error shapes vary.                                                                                               | A regression can introduce an unprotected write without a deterministic gate.                                                                |
| B5-D18 | Auth rate limit is IP+endpoint only; uploads/step-up and expensive mutations have no actor quota. Cookie flags/path are configured indirectly and not asserted at runtime.                                                        | Abuse controls and cookie scope are not release-proven.                                                                                      |
| B5-D19 | Public liveness/readiness are minimal, but `/app/api/health` does not check a role in its handler and omits scanner/PDF/job/storage dependency state.                                                                             | An unauthenticated request can receive operational detail; authorized operators cannot see all required health dimensions.                   |
| B5-D20 | `recordAuditEvent` and retryable transactions can capture counters/details closed over outside a retry attempt (inherited B1/P4 finding).                                                                                         | A rolled-back attempt can pollute final audit values even if database writes roll back.                                                      |
| B5-D21 | Operational approval code reads state, then performs an unguarded update inside a transaction.                                                                                                                                    | Concurrent reviewers can both append approval/audit history for one transition.                                                              |
| B5-D22 | `migrate()` executes static SQL with `sqlite.exec`; SQL migration files cannot read `JA_TENANT_ID` directly.                                                                                                                      | The first draft's tenant backfill was not executable and could silently invite a guessed tenant.                                             |
| B5-D23 | `offline_mutation.mutation_id` and `mutation_receipt.mutation_id` are global primary keys.                                                                                                                                        | Tenant+user replay/collision semantics cannot be represented by only adding a tenant column.                                                 |
| B5-D24 | Accounting Pack, invoice, and report download routes each resolve/read storage independently; no ordinary document download route exists.                                                                                         | Authorization, path, integrity, headers, and no-filesystem-touch behavior can drift by artifact family.                                      |
| B5-D25 | MFA routes insert audit rows directly and download routes own filesystem reads.                                                                                                                                                   | Actor provenance/redaction and authorize-before-read cannot be completed only inside repository helpers.                                     |
| B5-D26 | `search()` includes worker/client/project projections with email and broad project-set shortcuts.                                                                                                                                 | Fixing `listActiveWorkers` alone would leave PM search and other payload leakage open.                                                       |
| B5-D27 | `readinessCheck` covers DB/migration/directories/disk but has no typed scanner/PDF/jobs/storage adapter vocabulary.                                                                                                               | Route-level health cannot honestly report mandatory dependency readiness.                                                                    |
| B5-D28 | Lifecycle UI is rendered in both the section shell and project detail route; section action registry has no lifecycle actions.                                                                                                    | The original UI ownership omitted required integration paths and would leave dead/unreachable actions.                                       |
| B5-D29 | No finance-owned, read-only lock/eligibility adapter is frozen for lifecycle and correction callers.                                                                                                                              | B5 could either guess finance history or fail to enforce immutable source locks.                                                             |
| B5-D30 | Existing private cache v4 survives a service-worker code upgrade unless explicitly removed.                                                                                                                                       | Correctly partitioned new stores would not remove already-cached cross-user SSR responses.                                                   |
| B5-D31 | The fix-round-1 interface exported a service-execution identity factory and allowed repository consumers to receive a service-shaped human `Principal`.                                                                           | Any public constructor/result is forgeable at a composition boundary and can turn a durable-job capability into a human-session bypass.      |
| B5-D32 | Service audit provenance allowed capability without an immutable durable-job identifier.                                                                                                                                          | A service write cannot be tied to the one validated job execution that authorized it.                                                        |
| B5-D33 | MFA and bootstrap-owner flows use direct audit inserts/raw failures outside the central audit path.                                                                                                                               | Redaction, actor provenance, correlation, and exactly-once append semantics can diverge.                                                     |
| B5-D34 | Existing `authorizeDocument` performs access audit while the proposed download helper also audits.                                                                                                                                | A successful document download can emit duplicate access events, while a failed integrity check can have ambiguous audit meaning.            |
| B5-D35 | Technical reports have no persistent business `report_date`.                                                                                                                                                                      | Effective membership and historical scope cannot be reconstructed from a server `today()` fallback.                                          |
| B5-D36 | The earlier DAG allowed B5-I after B5-M/L/A/S without a hard B5-F + independent finance approval edge.                                                                                                                            | Integration could guess or bypass invoice/source/final-report locks.                                                                         |
| B5-D37 | PM/privacy prose named surfaces but did not freeze their response keys.                                                                                                                                                           | Broad repository rows can leak email, compensation, finance, offboarding, or unrelated-project fields despite correct query scope.           |
| B5-D38 | Autosave described UI states without an exact server request/version/idempotency/conflict protocol.                                                                                                                               | Retries or two tabs can overwrite a newer draft or falsely clear dirty/recovery state.                                                       |
| B5-D39 | Offline partitioning did not persist and validate a deployment anchor with the tenant anchor.                                                                                                                                     | A copied DB or browser cache can be opened under a different deployment while retaining the same tenant label.                               |
| B5-D40 | The identity envelope was called “signed” without an exact authenticated-session issuance, expiry, anti-replay, or validation contract.                                                                                           | Browser-supplied identity can select a private cache partition or a stale envelope can outlive the session.                                  |
| B5-D41 | Finalize upload accepted a client-selected storage location, filename, MIME, digest, and signature fields.                                                                                                                        | A client can swap reservations, choose an existing key, forge metadata, or race a symlink/path replacement.                                  |
| B5-D42 | Quota rules did not mandate serialized reservation accounting or enumerate all expensive-mutation buckets and trusted address derivation.                                                                                         | Parallel requests can exceed quota/rate policy and forwarded headers can evade client limits.                                                |
| B5-D43 | Legacy offline tables were merely described as read-only and migration acceptance required impossible complete-row equality after intentional audit-column additions.                                                             | Old writers could keep creating unscoped rows and the proof could either fail for the wrong reason or omit meaningful preservation checks.   |
| B5-D44 | Health/jobs/bootstrap/auth/PWA paths overlapped later WP-B10/WP-B11 ownership.                                                                                                                                                    | Two active packets could race on security-critical hot files and produce conflicting contracts.                                              |
| B5-D45 | Per-artifact step-up, technical-report dating, module-level independent reviews, and dedicated browser evidence were not executable gates.                                                                                        | A leaf could self-certify or pass generic tests while a sensitive artifact family remained unproved.                                         |
| B5-D46 | B5-U still claimed access/billing actions and shared registries already owned by B10/B2/B3/B4.                                                                                                                                    | Hot-file races could change Offboard, Void, Accounting Pack or finance job semantics.                                                        |
| B5-D47 | B5-U claimed A5-D's report page while A5 remained BLOCKED.                                                                                                                                                                        | Two UI writers could overwrite accessibility/autosave work without an approved handoff.                                                      |
| B5-D48 | No explicit T1 ownership/status gate prevented an early B5/RTM PASS.                                                                                                                                                              | Code-level evidence could bypass the uninterrupted 42-step DoD.                                                                              |
| B5-D49 | B11 ownership omitted full deployment/email/backup/restore/alerts/outbox/logging and did not depend on B10 approval.                                                                                                              | Operational completion and ordering were ambiguous.                                                                                          |
| B5-D50 | B5 invented finance producer names while the current B2 contract remained BLOCKED and exported none.                                                                                                                              | B5 could bind to an unapproved finance interpretation.                                                                                       |
| B5-D51 | Autosave had no closed report field union or exact action/owner/selector/role route contract.                                                                                                                                     | Unknown fields or an unowned endpoint could overwrite report truth.                                                                          |
| B5-D52 | Expense, private-document and sync-attachment paths still wrote bytes before registration.                                                                                                                                        | The generic upload prose did not assign all three concrete remediations/tests.                                                               |
| B5-D53 | Durable jobs lacked additive tenant/deployment run identity, claim lease, fence, handler mapping and replay-finality semantics.                                                                                                   | Stale or human-triggered runners could duplicate artifacts/actions.                                                                          |
| B5-D54 | Audit storage did not enforce service actor + job + job run + fence/tenant/deployment/capability consistency.                                                                                                                     | Forged/replayed service provenance could enter immutable audit.                                                                              |
| B5-D55 | Reporting/job callers and fixtures had overlapping or unowned files.                                                                                                                                                              | A worker could reintroduce generic principals/manual processing or duplicate finance truth.                                                  |
| B5-D56 | Sensitive download step-up occurred before non-disclosing object-scope authorization.                                                                                                                                             | Response differences or early metadata resolution could disclose artifact existence/details.                                                 |
| B5-D57 | B10 cache activation did not explicitly delete legacy `ja-portal-user-cache` before identity open.                                                                                                                                | Cross-user private IndexedDB data could remain reachable.                                                                                    |
| B5-D58 | Upload/outcome/media/audit/classification registries and eligibility failure shape were not fully closed.                                                                                                                         | Unknown strings/keys or blocker lists could leak or bypass policy.                                                                           |
| B5-D59 | Offline identity endpoint, HMAC source/rotation, exact service-worker scope and env/runbook owners were absent.                                                                                                                   | Key leakage, stale signatures or cross-product worker control remained possible.                                                             |
| B5-D60 | Schema remained prose rather than executable STRICT DDL with exact job/report/audit guards.                                                                                                                                       | Migration and direct-SQL safety could not be independently verified.                                                                         |
| B5-D61 | `job.active_job_run_id` and `job_run` had no executable reciprocal guard across tenant, deployment, fence, state and lease.                                                                                                       | A direct-SQL writer could attach a foreign/stale run or commit a state projection that did not match its run.                                |
| B5-D62 | Claim/dispatch did not explicitly require `contract_version='b5-v1'`, and legacy jobs remained eligible by implication.                                                                                                           | Pre-contract rows could execute without the reviewed tenant/capability/fence invariants.                                                     |
| B5-D63 | Service audit checked a service actor but not the deployment's configured actor plus both snapshotted and current capability membership.                                                                                          | A revoked, replaced or replayed actor/run could append trusted provenance.                                                                   |
| B5-D64 | The B5-only audit union rejected legitimate cross-domain actions and had no versioned owner handoff/static inventory.                                                                                                             | Enforcing it would break existing domains or tempt unreviewed finance action invention.                                                      |
| B5-D65 | Upload state rows allowed stale temp/final keys and SQL `NOT IN` classification checks admitted `NULL`.                                                                                                                           | Released/expired reservations could retain authority and unclassified documents could bypass fail-closed reads.                              |
| B5-D66 | B5 still used the obsolete Accounting Pack job kind and did not pin the live B2-R6.1/A5 dependency hashes and release DAG.                                                                                                        | Cross-packet implementations could bind to stale contract names or start UI work before final A5 QA.                                         |
| B5-D67 | The migration path/version, runner-owned `schema_migration` commit, projected legacy byte encoding and expected digest manifest were not exact.                                                                                   | Two migrations could claim one number or preservation tests could compare implementation-derived, non-normative hashes.                      |
| B5-D68 | Report-date real-calendar/draft-needs-changes rules, durable-job fixture ownership and existing/future report delete/autosave action mappings were incomplete.                                                                    | Invalid business dates, unowned security fixtures or dead/mismatched page actions could pass contract review.                                |

## 2. Binding policy and lifecycle semantics

### 2.1 General rules

1. Every mutation authorizes the authenticated, active principal and object scope before a write,
   including filesystem writes, job creation, notifications, and audit side effects.
2. Browser-supplied IDs are locators only. Current DB ownership, role, effective assignment dates,
   lifecycle, and version are checked in the same transaction as the mutation.
3. Optimistic mutations require `version`; success increments exactly once. A stale version returns
   `409 VERSION_CONFLICT` without any business/audit/notification write.
4. State transitions use a guarded `UPDATE ... WHERE id=? AND version=? AND status/state=?` and
   append exactly one lifecycle/approval/audit event in the same transaction.
5. Final/issued/invoiced/locked records are never hard-deleted or rewritten by WP-B5. Any method
   encountering finance locks returns a conflict and leaves all finance-owned rows untouched.
6. A rollback or retry recomputes all counters/event payloads inside the current attempt. No mutable
   closure state survives a rolled-back attempt.

### 2.1.1 Read-only finance-boundary adapter

B5 never queries finance tables ad hoc. The current authoritative WP-B2 contract is
`BLOCKED — R6 addendum remediation round 1 drafted; re-reviews required`, SHA-256
`3BE6041AB15EA1396CB7AE05AD80DD221DEA3A0FC1B736EC2F8EEB1A29CB6035`, under active independent Finance
and Sol/high migration reviews. The former R6.1 addendum file has been withdrawn while the binding
Sol/high R6.2 shared-sequence handoff is incorporated; B5 does not cite a missing/stale addendum hash.
R6.2 preserves the B5 job handoff
`accounting_pack_artifact_render` → `artifact.accounting_pack.render`; B2 still exports no
approved B5 finance-guard producer name/version. Therefore the round-2 invented producer names remain
withdrawn: B5-F is **hard BLOCKED**, owns no implementation lease, and has no substitute query/API
until R6.2 and the B2 contract receive their named approvals and the B2 owner publishes an exact versioned
producer handoff. The parent records the reviewed verdicts and exact successor hashes; any hash change
invalidates this dependency snapshot and requires B5 contract reconciliation/re-review. The B5
contract is then amended with the literal approved export names, version discriminator, payload types,
B3/B4 extensions and finance-review evidence before B5-F or B5-I can start. Aliasing or locally
recreating a similarly shaped producer is forbidden.

The consumer requirements that the approved B2 handoff must satisfy are frozen without inventing its
names:

```ts
type FinancialGuardCode =
  | 'FINANCE_HISTORY_PRESENT'
  | 'SOURCE_LOCKED'
  | 'FINAL_REPORT_SOURCE'
  | 'PENDING_APPROVALS';
type FinancialRecordType =
  | 'client'
  | 'project'
  | 'time_entry'
  | 'expense'
  | 'daily_report'
  | 'technical_report';
type LifecycleRecordType = 'time_entry' | 'expense' | 'daily_report' | 'technical_report';
type FinancialGuard = Readonly<{
  eligible: boolean;
  blockers: readonly Readonly<{
    code: FinancialGuardCode;
    recordType: FinancialRecordType;
    recordId: string;
  }>[];
  observedAt: string;
}>;
```

The approved B2/B3/B4 producer result must be immutable, version-discriminated, read-only,
same-connection facts containing identifiers and typed lock/finality/provenance states only—no amounts,
rate meaning, mutable projection, invoice-state reinterpretation, or mutation. B5-F will be the only
mapper from that literal approved contract to `FinancialGuard`; generic rows/strings and ad hoc finance
SQL are forbidden. `recordType`, guard names, and blocker codes are closed unions; unknown contract
version or database state fails closed as `FINANCE_HISTORY_PRESENT`. A lifecycle/correction transaction opens
`BEGIN IMMEDIATE`, reads every applicable guard on that same connection/snapshot, performs a guarded
domain update only when **all** guards are `eligible`, appends events/audit, and commits. A blocker maps
to the stable code without exposing the foreign record to an unauthorized caller. B5 must not cache a
guard across transactions. Any missing adapter behavior is an interface escalation to the B2/B3/B4
owner, not a local SQL guess. **B5-I cannot start or receive a façade lease while B2 is BLOCKED, before
the exact versioned producer handoff is incorporated, or until B5-F is implemented, its narrow tests
pass, and an independent `finance_integrity_reviewer` returns `APPROVED`.** The parent records both B2
and B5-F verdicts; file presence or a B5 implementer's assertion does not satisfy either gate.

### 2.2 Client lifecycle

Canonical client states are `active`, `closed`, and `archived`.

- Create remains `active`; client number is immutable.
- `updateClient` may change legal/display name, timezone, billing email, payment terms, and notes.
  Currency cannot change after any project exists; a requested change then returns
  `CLIENT_CURRENCY_IMMUTABLE`. OwnerAdmin and FinanceAdmin may edit; lifecycle transitions require
  OwnerAdmin.
- `closeClient` requires fresh step-up, a non-empty reason, current `active`, and every child project
  to be `closed` or `archived`. It preserves all children/history.
- `archiveClient` requires fresh step-up, a reason, and no child project in
  `draft|planned|active|paused|closing`. It records the exact previous state (`active` or `closed`).
- `restoreClient` means unarchive only. It restores the recorded pre-archive state. A legacy archived
  client with no trustworthy prior state is blocked with `RESTORE_TARGET_REQUIRED`; Owner must choose
  `active` or `closed` explicitly with a reason, producing an auditable resolution event.
- `reopenClient` is distinct from restore: `closed -> active`, fresh step-up and reason required.
- Archived clients are read-only and excluded from create-project selectors by default, but remain
  directly retrievable to authorized roles and discoverable through an “include archived” filter.

### 2.3 Project lifecycle

Canonical states remain exactly `draft`, `planned`, `active`, `paused`, `closing`, `closed`,
`archived`.

- Project number and client ID are immutable after creation. Currency is immutable once any time,
  expense, rate, billing, invoice, payment, or closeout child exists; WP-B5 does not inspect or alter
  the meaning of those financial children.
- `updateProject` edits descriptive/schedule metadata only when not archived and requires the current
  version. OwnerAdmin may edit any project; a scoped ProjectManager may edit operational metadata
  only, never currency, client, billing model, budgets, PO/contract finance fields, or finance flags.
- Allowed ordinary transitions are `draft -> planned|active`, `planned -> active|paused`,
  `active <-> paused`, and `active|paused -> closing`.
- `closeProject` requires OwnerAdmin or FinanceAdmin, fresh step-up, reason, a finalized closeout, no
  pending operational approvals, and current `closing`. `beginCloseProject` is one `BEGIN IMMEDIATE`
  transaction that guards project `active|paused`, version, finance eligibility, and pending approvals;
  it creates or refreshes exactly one non-final closeout and sets `closing`. `closeProject` takes
  `{projectId, projectVersion, closeoutId, closeoutVersion, reason}` and guards that exact closeout ID,
  same project, `state='final'`, and unchanged versions before setting the project `closed`. It never
  finalizes a closeout itself, accepts a closeout from another project, or combines begin-close and
  close into an ambiguous request. Existing `finalizeProjectCloseout` remains the only finalization
  operation and retains its own authorization/step-up contract.
- `archiveProject` requires OwnerAdmin, fresh step-up, reason, and state `draft|planned|closed`.
  Active/paused/closing projects must be closed first. Archive records the exact previous state.
- `restoreProject` unarchives to the recorded state. A legacy archive with unknown prior state is
  blocked until Owner explicitly chooses `draft`, `planned`, or `closed` with a reason. Restore never
  silently activates a project.
- Reopening a closed project remains the existing authorized closeout reopen workflow with reason and
  audit; lifecycle UI links to it rather than writing `status='active'` directly.
- Archived/closed projects are read-mostly. They remain available to authorized history, document,
  report, and finance views; they are excluded from new time/expense/report/assignment selectors.

### 2.4 Draft edit, delete, and correction

The common eligibility result is:

```ts
type RecordEligibility = Readonly<{
  canEdit: boolean;
  canDeleteDraft: boolean;
  canSubmit: boolean;
  canCreateCorrection: boolean;
  blockers: readonly RecordEligibilityBlocker[];
}>;
type RecordEligibilityBlocker =
  | 'NOT_CREATOR'
  | 'OUTSIDE_EFFECTIVE_ASSIGNMENT'
  | 'INVALID_LIFECYCLE_STATE'
  | 'SUBMISSION_HISTORY_PRESENT'
  | 'DEPENDENCY_PRESENT'
  | FinancialGuardCode;
```

`recordEligibility` first authenticates and authorizes object scope. A missing, foreign-tenant,
foreign-user, or out-of-scope record returns `404 RESOURCE_UNAVAILABLE` with the common external body
and **never** returns a `RecordEligibility` object or blocker list. Blockers are emitted only after the
caller is authorized to know the record and are then limited to the closed union above.

- Creator/owner may edit a row only in `draft` or `needs_changes`, while unlocked/uninvoiced and
  within an effective assignment on the record date. Management reviewers request changes; they do
  not silently rewrite a worker's time/expense.
- Hard deletion is only `Delete Draft`: current state `draft`, no submission/approval event ever
  exists, no invoice/source/period-report/technical-change/document dependency exists, current
  version matches, and the caller is the creator/owner. OwnerAdmin may perform an emergency draft
  deletion only with fresh step-up and a mandatory reason. Creator deletion does not require a reason;
  if supplied it is validated/redacted. The full redacted before snapshot is
  retained in append-only audit.
- `needs_changes`, `submitted`, `approved`, `locked`, `rejected`, included, invoiced, reimbursed, and
  finance-reviewed records cannot be hard-deleted.
- A correction never mutates the preserved approved/locked row. `createCorrectionDraft` creates a new
  draft with a new opaque ID and appends an immutable `record_correction_link` from the original to the
  replacement with reason and actor. If finance/source locks prohibit correction, return
  `CORRECTION_REQUIRES_FINANCE_WORKFLOW`; WP-B5 must not invent a void/adjustment.
- Correction input includes `requestId` (opaque UUID) and the original version. The immutable table has
  unique `(tenant_id,record_type,original_id,request_id)` and unique
  `(tenant_id,record_type,correction_id)`. Identical replay returns the original correction ID/result;
  a reused request ID with different payload hash returns `409 IDEMPOTENCY_CONFLICT`. Dependency
  eligibility is evaluated by record type: time/expense use `recordSourceLockState`; reports use
  `reportFinalSourceDependency`; technical reports also require no technical-change child. The original
  remains byte/field/version identical.
- Report delete additionally requires no final period report source and, for technical reports, no
  technical change. Time/expense delete additionally requires no billing/invoice/reimbursement lock.
- Every destructive UI action uses the exact verbs `Archive`, `Restore`, `Close`, `Reopen`,
  `Delete draft`, or finance-owned `Void`; generic `Delete` is not rendered.

### 2.5 Assignment-date and PM visibility policy

- An effective membership on date `D` is `status='active' AND starts_on<=D AND
(ends_on IS NULL OR ends_on>=D)`. ISO dates are parsed strictly; impossible dates are rejected.
- Current navigation/project scope uses the server's business date in the project timezone where a
  project is known, otherwise UTC date. Record writes always use the record work/spent date.
- Changing a time work date revalidates membership at the new date and writes the project's current
  timezone snapshot in the same guarded update.
- A planning interval must be valid RFC3339 with offsets (or an explicitly project-timezone local
  value normalized server-side), `end > start`, and its complete local-date span must fit an active
  project membership. `NaN`, DST gaps, and ambiguous unqualified timestamps are rejected.
- `principal.projectIds` is a request-time convenience, never sufficient authority for a mutation.
- PM workforce results include only users with an effective membership on at least one project in the
  PM's effective scope. PM DTO is exactly `{id,name,role,status}`; it omits email, offboard dates,
  compensation, internal cost, client rates, margin, and unrelated project IDs. Owner/Finance/Auditor
  retain explicitly authorized DTOs. A PM cannot enumerate candidates outside scope; initial staffing
  is OwnerAdmin responsibility.
- The single record-date oracle is `effectiveRecordDate(type,row,input,projectTimezone)`: time and
  daily report use `work_date`; expense uses `spent_on`; technical report uses persisted `report_date`
  on create/edit/autosave/submit with no runtime `today()` fallback; planning uses every
  local calendar date touched by `[starts_at,ends_at)`; assignment/contact/skill/availability/current
  project/search/review-queue readers use server business date in each referenced project timezone.
  UTC `today()` is not substituted when a project timezone exists.
- The effective-membership predicate is mandatory in every reader/writer that can expose or mutate a
  project-scoped person/record: `principalFor`, `listAssignedProjects`, `listActiveWorkers`,
  `listWorkerSkills`, `setWorkerSkill`, `list/setWorkerAvailability`, `listPlanning`,
  `createPlanningAssignment`, time create/edit/copy/submit/detail/week, expense
  create/edit/submit/detail, daily/technical report create/edit/submit/detail, report notification
  recipients, client contacts/all-client-contacts for PM, project overview worker/time/report/expense/
  planning projections, operational review queues and review decisions, global search and search
  suggestions, offline assignment cache/load/create/edit/sync, and attachment reservation. Finance-only
  projections remain finance-owned but must consume the same object-scope predicate when PM access is
  ever permitted.
- PM `search` and every PM workforce/project projection return only effectively scoped projects and
  people. Search worker results are `{id,type:'worker',label:name,detail:'Workforce member'}`—never
  email. Client/contact search is limited to clients of effective PM projects and omits billing email,
  billing address, payment terms, notes, and finance identifiers. Project search omits budget, PO,
  contract, currency/rate/cost/margin fields unless a separately authorized non-PM DTO is selected.
- Tests use projects in at least two timezones and memberships that are future, expired, boundary-day,
  and crossing midnight/DST. Each enumerated path gets a negative out-of-window assertion or is proven
  to delegate to one tested scoped query service.

The PM/privacy DTO registry is closed and field-by-field:

| Surface                                   | Exact allowed keys for ProjectManager                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `listActiveWorkers`, assignment candidate | `id,name,role,status`                                                                                                                   |
| `timeDetail`                              | worker `{id,name}`; record `{id,projectId,userId,workDate,minutes,description,approvalState,version}`                                   |
| `expenseDetail`                           | worker `{id,name}`; record `{id,projectId,userId,spentOn,category,description,currency,amountMinor,approvalState,receiptState,version}` |
| daily/technical report detail             | `id,projectId,author:{id,name},reportDate,fields:ReportDraftFields,approvalState,version` plus the report type discriminator            |
| project overview                          | worker `{id,name,role,status}`; project `{id,clientId,number,name,status,timezone,projectManagerId,startDate,plannedEndDate}`           |
| contacts                                  | `id,clientId,name,title,phone,email` only when the client belongs to an effectively scoped project                                      |
| skills/availability                       | `userId,name,skills:[{id,name,level}],availability:[{date,state}]` for effectively co-assigned users only                               |
| planning                                  | `id,projectId,user:{id,name},startsAt,endsAt,status,version`                                                                            |
| review queue                              | `id,type,projectId,submittedBy:{id,name},recordDate,submittedAt,approvalState,version`                                                  |
| search result                             | worker `{id,type,label,detail}`; project `{id,type,label,detail,status}`; client `{id,type,label,detail}`                               |

Strict serializers construct these objects explicitly; spreading repository/database rows is forbidden.
Every serializer has negative-key assertions for `email` except scoped contacts, `billingEmail`,
`offboardedAt`, `costRate`, `payRate`, `clientRate`, `margin`, `budget`, `poNumber`, `contractNumber`,
bank/tax fields, audit metadata, storage keys, unrelated project IDs, and raw notes. Unknown keys fail a
development/test assertion and are absent in production output. Owner/Finance/Auditor serializers are
separate named DTOs; they do not widen the PM serializer conditionally.

### 2.6 Long-report autosave and recovery

- Autosave is draft preservation, never submission or approval. It is enabled for daily and technical
  create/edit forms after a field changes, debounced 750–1500 ms, and flushed on visibility change.
- Unsaved/new reports are stored locally. Existing server drafts save locally on every debounce and
  may call an optimistic server autosave using the current version; a server conflict retains both
  versions and prompts comparison, never overwrites.
- Local key is `{deploymentId,tenantId,userId,reportType,reportIdOrClientDraftId}`. The encrypted/auth
  cookie or bearer token is never copied into IndexedDB.
- On form open, recovery is offered only when the matching partition has a newer local timestamp than
  the last known server/local baseline. UI choices are `Recover draft`, `Compare`, and `Discard local
draft`. Recovery never submits automatically.
- Successful explicit save updates the baseline; successful submit removes the local recovery copy.
  Logout/offboard/identity switch closes the database and removes only the departing user's active
  partition from the accessible session. A separately authenticated user's cache is never opened.
- Field validation errors preserve entered values and do not clear recovery data.
- A form is dirty when normalized current fields differ from the last successful local/server save
  baseline. Debounce-in-flight, failed autosave, recovery-not-yet-accepted, and conflict states remain
  dirty. Successful local autosave clears crash-loss risk but not the explicit-submit warning when the
  workflow requires server persistence; successful server save resets the baseline; successful submit
  clears dirty state and recovery data.
- Internal navigation, locale/account navigation, and Cancel while dirty use an accessible confirmation
  dialog with `Stay` and `Leave without saving`. `beforeunload` is installed only while dirty so browser
  close/reload gets the native warning; it is removed after save/submit/discard. Programmatic post-save
  redirect must not warn. This satisfies V31-021 and is owned/tested with autosave rather than by ad hoc
  route code.

The server autosave protocol is executable and closed:

```ts
type DailyReportDraftFields = Readonly<{
  siteShift?: string;
  summary: string;
  tasksCompleted: string;
  problemsFound?: string;
  correctiveActions?: string;
  clientDecisions?: string;
  downtimeMinutes: number;
  standbyReason?: string;
  blockers?: string;
  openItems?: string;
  nextDayPlan?: string;
  safetyRelated: boolean;
  customerContact?: string;
}>;
type TechnicalReportDraftFields = Readonly<{
  systemName: string;
  plantSite?: string;
  areaLine?: string;
  stationMachine?: string;
  systemType?: string;
  plcPlatform?: string;
  controller?: string;
  hmiScada?: string;
  networkProtocol?: string;
  softwareVersion?: string;
  programReference?: string;
  changeSummary: string;
  safetyRelated: boolean;
  productionImpact?: string;
  validation?: string;
  validationResult?: string;
  openRisk?: string;
  rollbackPlan?: string;
}>;
type ReportDraftFields =
  | Readonly<{ kind: 'daily'; value: DailyReportDraftFields }>
  | Readonly<{ kind: 'technical'; value: TechnicalReportDraftFields }>;
type ReportAutosaveInput = Readonly<{
  requestId: string;
  reportType: 'daily' | 'technical';
  reportId: string;
  baseVersion: number;
  clientRevision: number;
  reportDate: string;
  fields: ReportDraftFields;
}>;
type ReportAutosaveResult =
  | Readonly<{
      outcome: 'saved';
      reportId: string;
      version: number;
      clientRevision: number;
      savedAt: string;
    }>
  | Readonly<{
      outcome: 'duplicate';
      reportId: string;
      version: number;
      clientRevision: number;
      savedAt: string;
    }>
  | Readonly<{
      outcome: 'conflict';
      reportId: string;
      authoritativeVersion: number;
      authoritativeSavedAt: string;
      localRetained: true;
    }>;
```

`requestId` is a UUID generated once per debounced payload; `(tenant,user,reportId,requestId)` is unique
with a canonical payload SHA-256. An identical retry returns the stored result; a changed payload under
the same key returns `IDEMPOTENCY_CONFLICT`. The server authorizes ownership/effective membership and
updates only `WHERE id=? AND version=? AND approval_state IN ('draft','needs_changes')`, incrementing
version once. Zero updated rows returns `conflict` and never writes audit/notification. `clientRevision`
is monotonic within a browser draft and lets the client ignore late responses. Only `saved|duplicate`
matching the latest client revision advances the baseline; failures/conflicts retain the exact local
draft. Explicit submit first flushes/awaits the latest autosave, submits against its returned version,
then deletes local recovery only after committed submit. Two-tab and reordered-response tests are
mandatory. Autosave request/result receipts are retention-bounded operational data, not approval truth.

### 2.7 Offline partition and sync

- Production requires stable non-secret `JA_TENANT_ID` **and** `JA_DEPLOYMENT_ID`. Both are validated
  at startup, persisted in the database singleton `deployment_identity`, and must exactly match every
  subsequent open. A missing, malformed, changed, or multi-row anchor aborts before migrations/runtime
  writes with `DEPLOYMENT_IDENTITY_MISMATCH`; neither value is inferred from existing business rows.
  Browser DBs
  and static caches are versioned and partitioned by deployment + tenant + opaque user ID.
- Authenticated SSR HTML is not stored in a URL-only shared CacheStorage. The service worker caches
  immutable static shell assets globally; private recently assigned projects/drafts live only in the
  active identity's IndexedDB partition. Offline route fallback renders the shell and then reads that
  partition.
- Identity partition selection is set only by a same-origin authenticated response containing a
  server-derived signed identity envelope. It contains `{version,deploymentId,tenantId,userId,
sessionIdHash,issuedAt,expiresAt,nonce,kid}` and a server HMAC over canonical bytes; it is issued only for
  an active live session, expires in at most 15 minutes, is bound to the session hash, deployment, tenant
  and intended service-worker origin, and is never persisted with its signature. The service worker
  verifies the HMAC through a same-origin server verification endpoint while online, rejects replayed
  nonces/session switches/expiry, then stores only the verified partition key and expiry in memory.
  Offline reopening may use the last verified non-secret partition descriptor only until its separately
  stored offline lease expiry; it cannot extend the lease, and logout/offboard revokes/deletes it.
  Browser form/query/message values cannot mint or select a partition.
- The exact B10 endpoints are `GET /j-aautomation/app/api/offline/identity` for issuance and
  `POST /j-aautomation/app/api/offline/identity/verify` for same-origin verification. Both require the
  central CSRF/session policy as applicable, `Cache-Control: private, no-store`, an active session and
  exact deployment/tenant. Verification accepts only `{envelope,signature}`, revalidates the live
  session and single-use nonce, and returns only the non-secret verified partition descriptor/lease.
- `JA_OFFLINE_IDENTITY_HMAC_KEYS` is a comma-separated ordered keyring of
  `kid:base64url-encoded-32-or-more-random-bytes`; the first key signs and every listed key may verify.
  Duplicate/malformed/short keys abort startup. Rotation adds the new key first, retains the prior key
  for at least the maximum 15-minute envelope/offline lease, then removes it only after all prior leases
  expire. Keys never enter HTML, logs, CacheStorage, IndexedDB, service-worker source or responses.
- The generated service worker registers and responds only under exact scope
  `/j-aautomation/app/`; it rejects cache/message/fetch handling outside that prefix and never controls
  the public Next.js site or another product. Activation deletes `ja-portal-user-cache` and all legacy
  URL-only caches **before** opening/selecting any identity partition or claiming clients; failure keeps
  the worker non-active/locked rather than exposing legacy data.
- On identity switch, no stale private DOM is retained. Offline access shows only the last synchronized
  data for the active identity; when identity cannot be proven, show a locked offline screen with no
  private data.
- The access oracle is the last authenticated same-origin identity envelope signed by the live server
  session and held in service-worker memory plus that identity's partition key; a cookie alone is never
  read by IndexedDB code. Sequence A -> B closes A's DB, clears private DOM, selects B, and makes A's
  partition inaccessible. B -> unknown closes B, clears private DOM and in-memory identity, and renders
  the locked offline screen. Partition data may remain encrypted/inaccessible for later same-user
  recovery until retention cleanup, but logout/offboard explicitly deletes that user's partition.
  Tests prove no bearer/session/auth token exists in any IndexedDB/CacheStorage record.
- Service-worker activation explicitly deletes legacy IndexedDB `ja-portal-user-cache`,
  `ja-portal-shell-v4`, and every earlier URL-only private cache before identity open or `clients.claim`.
  It also rejects/deletes any cache entry without the current static-cache version and deployment
  namespace. The migration does not inspect legacy private response bodies; any deletion failure leaves
  the client locked and the new worker unclaimed.
- Server `offline_mutation` idempotency remains scoped to user; tenant is also persisted for explicit
  future isolation. Existing rows are backfilled with configured tenant ID during startup migration.
- Create/edit sync rechecks active account, ownership, effective membership on the payload/record date,
  lifecycle, and version in the same transaction. Duplicate mutation ID returns the stored result;
  version mismatch returns `conflict` plus authoritative version; no conflict silently overwrites.
- Attachment upload reservations are bound to user, tenant, project, mutation, expected bytes/type,
  and expiry. A rejected/conflicted mutation releases an unreferenced reservation/document safely.

## 3. Security contracts

### 3.1 Step-up and trusted service actors

- `assertRecentStepUp` enforces the same session-bound 10-minute freshness in every environment when
  a protected method is invoked. Tests may inject a clock; `NODE_ENV` may not disable semantics.
- Protected operations include all Unified V3 section 36.4 actions plus client/project close/archive/
  restore/reopen, emergency draft deletion, user status/role changes, sensitive bulk download, and
  scanner/config changes.
- Missing session, expired session, invalid timestamp, future timestamp beyond 60 seconds clock skew,
  different user/session, or stale step-up returns `403 STEP_UP_REQUIRED` without writes.
- Remove caller-constructible service-actor flag bypass semantics. No service identity object, brand,
  factory, constructor, predicate, callback, capability selector, or service-shaped `Principal` is
  exported. The only external server-composition surface is `runDueConfiguredDurableJobs(limit)`.
  Internally it claims an opaque run and calls private `runConfiguredDurableJob(jobRunId)`. It reads the validated persistent/configured tenant and
  configured service actor, loads the job + active actor on the same server-owned connection, derives
  the required capability and internal handler from the persisted allowlisted job kind, binds the
  persisted correlation ID, requires exact tenant/status/capability, and records completion/failure.
  The only allowlisted capabilities are the nine literal `DurableJobCapability` members in section
  3.1.1; there is no umbrella `durable_jobs.run` capability. Callers cannot select or receive an
  operation, handler, context, tenant, actor, capability, or correlation. Human repository methods
  never accept the private context and therefore retain normal step-up.
- Human Owner/Finance users cannot record a malware decision. Disabled service actors fail closed.
- Runtime trust is not structural typing. The durable-job module keeps its execution brand/context
  private and rechecks live job ID, actor status, tenant, and required capability inside the same
  high-level call before the protected operation. Audit receives immutable provenance directly from
  that private context: `actorKind='service'`, actor ID, exact capability, durable `jobId`, tenant and
  correlation. `Principal` JSON, locals, request bodies, headers, cookies, form fields, exported
  constructors/predicates, or a direct HTTP call cannot create or observe a trusted service context.

### 3.1.1 Durable job claim, fencing, and handler registry

The registry is literal and closed:

```ts
type DurableJobKind =
  | 'invoice_pdf'
  | 'period_close_report'
  | 'auto_draft'
  | 'accounting_pack_artifact_render'
  | 'document_scan'
  | 'outbox_deliver'
  | 'alert_dispatch'
  | 'email_send'
  | 'backup_verify';
type DurableJobCapability =
  | 'artifact.invoice.render'
  | 'artifact.report.render'
  | 'billing.draft.generate'
  | 'artifact.accounting_pack.render'
  | 'document.scan'
  | 'outbox.deliver'
  | 'alert.dispatch'
  | 'email.send'
  | 'backup.verify';
type DurableJobOutcome = Readonly<{
  jobId: string;
  jobRunId: string;
  outcome: 'succeeded' | 'retry_scheduled' | 'failed_terminal' | 'already_final';
  attempts: number;
  errorCode?:
    | 'HANDLER_UNAVAILABLE'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'LEASE_LOST'
    | 'PAYLOAD_INVALID'
    | 'HANDLER_FAILED';
}>;
```

The immutable mapping is one-to-one in the order above and dispatches only to internal named handlers;
no record/header/request/config payload can choose a handler or capability. Job creation canonicalizes
the strict kind-specific payload, stores SHA-256, tenant, deployment, correlation and unique
`(tenant_id,deployment_id,idempotency_key)`. Same key+hash returns the existing job; changed hash is
`IDEMPOTENCY_CONFLICT`. Unknown kind/key/payload field rejects before insert.

`accounting_pack_artifact_render` → `artifact.accounting_pack.render` is the literal current B2-R6.1
handoff. `accounting_pack_artifact_retry_decision` is a B2 decision-table name, never a job kind,
capability or alias; the superseded draft name `accounting_pack_artifact_retry` is accepted nowhere.
No compatibility string is accepted in schemas, service-actor capabilities, job rows, audit, config
or tests unless a later Sol/high architecture decision versions the registry explicitly.

The only external runner API is `runDueConfiguredDurableJobs(limit)` with `limit` integer 1–100. Inside
one `BEGIN IMMEDIATE`, its candidate query and guarded mutation both require
`contract_version='b5-v1'`; it claims an eligible `queued` or retryable lease-expired B5 job by guarded version,
increments `attempts` and `fence_version`, creates one `job_run` with opaque ID and unique fencing token,
copies tenant/deployment/kind/capability/service actor/correlation/payload hash, and commits. The private
`runConfiguredDurableJob(jobRunId)` accepts only that claimed run ID, reloads both rows, validates the
configured persistent tenant/deployment and service actor, exact mapping/hash/live lease/fence, changes
the run `claimed -> running`, then dispatches internally. It accepts no human `Principal`, job ID,
actor, capability, tenant, correlation, payload, callback or handler argument.

Rebuilt legacy `job`/`job_run` rows remain byte-preserved with `contract_version='legacy'`, null B5
authority columns and no global idempotency uniqueness. They are immutable quarantine evidence: the
candidate query excludes them, private dispatch rejects them as `LEGACY_JOB_QUARANTINED`, readiness
reports their count without payload, and no code upgrades/requeues/runs/deletes them. A direct SQL
attempt to change their contract version/state or attach a B5 run aborts. B2/B3 may create a new
idempotent B5 job from authoritative current domain state; they never reinterpret a legacy row.

Completion is a guarded transaction matching job ID, active job-run ID, fence version, fencing token,
`job.state='claimed'` and `job_run.state='running'`. Success sets job `succeeded` and run `succeeded`
once. Retryable failure sets run `failed`, clears active run, computes bounded backoff and returns job to
`queued`; exhausted/non-retryable failure sets job `dead_letter`. An expired lease may be reclaimed only
into a new run/fence; the prior run becomes `lease_expired` and can never publish/complete. Replaying a
final run returns `already_final` without invoking a handler or appending audit. Every handler uses its
job/run idempotency key so a crash between an external/local side effect and completion cannot duplicate
an artifact, outbox delivery or alert.

Generated artifacts first reserve/register their queued artifact row and reservation/temp key in the
same transaction as the job claim. A handler renders to the server-owned temp path, computes integrity,
then a fence-guarded transaction marks the format ready and authorizes a no-overwrite publish rename.
Failure leaves an explicit failed format and cleanup target; it never publishes unregistered bytes.
Direct use of a human/generic principal, `JA_JOB_ACTOR_ID`, or any portal `runArtifactJobs` action is
forbidden and removed. `recordAuditEvent` receives the private claimed context and the database trigger
requires exact service actor + job + job run + tenant + deployment + capability consistency; replayed/
stale fences cannot append another service event.
Claim audit is appended after the claimed run is active. Start/terminal audit is appended while that
same fenced run is `running`, immediately before the corresponding state change in the same
transaction. Expiry audit is appended while the expiring run is still the active `claimed`/`running`
run, before it becomes `lease_expired` and before a replacement run is linked. The unique action/run
guards make each phase exactly once; rollback removes both the audit and state change.
Claim requires the singleton `deployment_service_actor_binding`; `job_run` snapshots its binding
version plus the configured actor ID/version/exact capability JSON. Dispatch and every service audit
recheck that the binding still names that actor, the actor remains active at the same version, the
current capability JSON equals the snapshot, and the required capability is a current member. Actor
replacement, disablement, removal of the required capability, version drift or snapshot tampering
fails closed before handler/metadata/filesystem access and cannot append trusted service audit. Tests
cover revoke/replace before claim, after claim, after start and on replay.

Job-path ownership is exact and sequential:

- B3 exclusively owns `packages/reporting/src/artifact-jobs.ts` and
  `apps/portal/src/lib/server/artifact-jobs.ts`. It replaces `ArtifactJobContext<TPrincipal>` and the
  exported generic `runArtifactJobs` with named, non-public render handlers invoked only by the closed
  private registry. Those handlers accept strict kind-specific payload/reservation IDs, never a
  principal, claimed-run context, actor/capability/tenant/correlation selector or callback; the B5
  composition layer alone authorizes, fences, reserves/registers before publish and returns typed
  outcomes. B2 supplies released invoice/
  billing snapshots; B3 supplies Accounting Pack/report artifact lifecycle; B4 supplies final report/
  invoice renderer metadata. None may manufacture a human/service principal.
- B2 exclusively owns `apps/portal/src/lib/server/actions/billing-actions.ts`: it removes `runJobs` and
  every synchronous/manual artifact execution, and finance actions enqueue idempotently then show
  truthful queued/running/ready/failed state. B3/B4 release the called artifact interfaces first.
- B3 receives the first sequential `operations-actions.ts` lease solely to remove direct job execution
  and make period generation enqueue/status-based, then releases the file to B5-U for the named report/
  review/autosave actions. B5-U may not edit handler modules or reintroduce job execution.
- `section-actions.ts` releases sequentially: B2 removes finance `runJobs`/updates finance mappings; B3
  updates its period/artifact mappings; B10 updates access/auth mappings; only then B5-U receives the
  closed registry lease listed in section 6.
- B11 exclusively owns `deployment/**`, including the runner, email/outbox/alert executors, leases,
  logging and operational alerts. Portal actions can enqueue only; no browser/admin action processes a
  job. B11 never imports a generic/human principal adapter.

### 3.2 Upload authorization, quota, storage, and scanning

Upload is a two-phase protocol:

1. `reserveUpload(principal, metadata)` validates active user, effective project/ownership scope,
   entity lifecycle, exact purpose/MIME allowlist, declared size, normalized filename, tenant, and
   quota in `BEGIN IMMEDIATE`.
2. Only after a reservation is returned may the route create a reservation-scoped temporary file with
   `wx` beneath a server-resolved private root. The server derives both temporary and final keys from
   `{tenantId,reservationId,documentId}`; neither is accepted from the browser. Finalization rechecks
   reservation owner/expiry, streams bytes to derive actual size/SHA-256/signature, verifies the parent
   and opened file are not symlinks/reparse escapes, atomically renames with no-overwrite semantics,
   then registers a quarantined document and scan job in one transaction.

Binding limits: receipt file 10,000,000 bytes; other private file 50,000,000 bytes; default active
per-user reserved+stored quota 250,000,000 bytes and per-project quota 2,000,000,000 bytes, configurable
downward/upward by validated positive integer environment values. Reservation TTL is 15 minutes.
Concurrent pending reservations plus stored non-rejected documents count toward quota. Reservation,
finalization, release and expiry accounting use `BEGIN IMMEDIATE` and an atomic conditional update/read;
parallel attempts cannot each observe spare quota. Expired reservations are releasable by a durable cleanup
job. Size failure is `413 UPLOAD_TOO_LARGE`; quota is `429 UPLOAD_QUOTA_EXCEEDED` with no filesystem
write; invalid/unauthorized scope is `403 UPLOAD_NOT_AUTHORIZED` without revealing object existence.

Exact transport schemas are:

```ts
type AllowedUploadMediaType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'application/zip'
  | 'text/plain';
type ReserveUploadInput = Readonly<{
  requestId: string;
  projectId?: string;
  mutationId?: string;
  purpose: 'receipt' | 'private_document';
  originalFilename: string;
  mediaType: AllowedUploadMediaType;
  expectedBytes: number;
}>;
type ReserveUploadResult = Readonly<{
  reservationId: string;
  tenantId: string;
  ownerUserId: string;
  projectId: string | null;
  mutationId: string | null;
  purpose: 'receipt' | 'private_document';
  mediaType: AllowedUploadMediaType;
  expectedBytes: number;
  expiresAt: string;
  state: 'pending';
}>;
type FinalizeUploadInput = Readonly<{
  reservationId: string;
  requestId: string;
}>;
type FinalizeUploadResult = Readonly<{
  reservationId: string;
  documentId: string;
  state: 'quarantined';
  scanStatus: 'pending';
  created: boolean;
}>;
type ServerOwnedUploadStream = Readonly<{
  reservationId: string;
  requestId: string;
  body: ReadableStream<Uint8Array>; // constructed inside the server action/route; never deserialized
}>;
```

Every object is strict: unknown keys, a `kind`/`reportType` mismatch, non-integer/out-of-range downtime,
or fields outside the matching closed set return `400 VALIDATION_FAILED` with zero writes. Length and
conditional safety-validation rules are exactly the canonical report schemas; `projectId`, author,
approval state, tenant and timestamps are server-owned and are never autosave fields.

The exact CSRF-protected transport is the named SvelteKit action
`POST /j-aautomation/app/reports?/autosaveReport`. B5-U exclusively owns
`reportActions.autosaveReport` in `apps/portal/src/lib/server/actions/operations-actions.ts` and, only
after B2/B3/B4/B10 release the registry, one sequential addition
`autosaveReport: reportActions.autosaveReport` in `[section]/section-actions.ts`. The action requires
`params.section==='reports'`, the central same-origin CSRF gate, an active Worker/PM/Owner principal,
creator or explicit project-manager object scope, effective membership on `reportDate`, and the closed
schema above before calling the B5-I server autosave method. Finance/Auditor are read-only and get
`RESOURCE_UNAVAILABLE`; foreign/out-of-scope IDs have the same result and timing class.

The released A5-D report page consumes the frozen interface through B10's client helper. Stable
selectors are `[data-report-autosave-form][data-report-type][data-report-id]`,
`[data-autosave-status][aria-live='polite']`, `[data-recovery-dialog]`,
`[data-recover-draft]`, `[data-compare-draft]`, and `[data-discard-draft]`. Unit/action/Playwright tests
cover Worker creator, scoped PM, Owner, foreign Worker, unscoped PM, Finance, Auditor, CSRF failure,
unknown keys, stale version, duplicate request, changed replay, two tabs, reordered responses, keyboard
recovery and submit cleanup.

Tenant ID is server-derived and absent from browser input. Reservation authority is exactly its
active human owner (and same effective project/mutation scope) until finalization; cleanup service may
only expire/release. Reserve idempotency is unique `(tenant,user,requestId)`: identical payload returns
the reservation, different payload returns `IDEMPOTENCY_CONFLICT`. Finalize is unique per reservation:
identical replay returns the stored document result, while an expired/released/finalized-to-other-result
returns `UPLOAD_RESERVATION_CONFLICT`. Actual bytes must equal expected bytes; server-computed
hash/signature/key are authoritative and the repository never trusts browser claims. The route streams
to a reservation-scoped temporary file only
after reserve, enforces the bound as it reads, then atomically moves/finalizes; failure deletes only that
verified temporary path and releases the reservation.

Filename validation requires the browser value to already equal its Unicode-NFC, surrounding-
whitespace-trimmed form and requires 1–200 Unicode characters. It takes a basename only and rejects
`/`, `\\`, `:`, NUL/C0/C1 controls, CR/LF, bidi overrides, dot-only names, Windows reserved device
basenames, trailing dot/space, and any normalization change that creates a forbidden component.
Purpose allowlists are exact: `receipt` accepts PDF, JPEG, PNG, WebP, HEIC, and HEIF;
`private_document` accepts those plus ZIP and UTF-8 plain text. Signature/extension/MIME triples are
exact: PDF `application/pdf` + `.pdf` + `%PDF-`; JPEG `image/jpeg` + `.jpg|.jpeg` + `FF D8 FF`; PNG
`image/png` + `.png` + the eight-byte PNG signature; WebP `image/webp` + `.webp` + `RIFF....WEBP`;
HEIC/HEIF `image/heic|image/heif` + matching `.heic|.heif` + ISO-BMFF `ftyp` with an allowlisted
HEIC/HEIF major/compatible brand; ZIP `application/zip` + `.zip` + a valid non-encrypted central
directory and local header wholly within the byte limit; text `text/plain` + `.txt` + canonical UTF-8
without NUL, invalid sequence, or control content other than TAB/CR/LF. ZIP entry paths undergo the
canonical path rules; nested archives/executables reject, and bounded entry/count/expanded-size limits
prevent bombs. Declared MIME, normalized extension, and server-detected signature must all agree.
Polyglots, executable/scriptable HTML/SVG, macro-enabled Office, mismatches, and unknown media fail
before final rename/DB/job writes.

All three observed write-before-register paths use one exact server-owned sequence:

| Entry point / owner                                                     | Purpose and scope                                                    | Mandatory call order                                                                                                                                                                                                                 | Dedicated proof                                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `expenseActions.createExpense` in `expense-actions.ts` / B5-U           | `receipt`, parsed project + expense request                          | authorize action → `reserveUpload` → stream the server `File.stream()` through `ServerOwnedUploadStream` → `finalizeUpload({reservationId,requestId})` → create expense referencing returned document in the coordinated transaction | unauthorized/invalid expense/over-quota/signature failure causes zero FS/document/job/expense writes; success links exactly one receipt |
| `documentActions.uploadPrivateDocument` in `document-actions.ts` / B5-U | `private_document`, server-validated project/artifact/classification | authorize action → reserve → stream → finalize IDs only → return committed quarantine metadata                                                                                                                                       | all media triples, unknown form keys, scope/step-up, reservation swap, symlink/no-overwrite and exactly-one scan job                    |
| `POST /j-aautomation/app/api/sync/attachment` / B5-U                    | `receipt`, active offline mutation + project + attachment IDs        | central CSRF/auth → validate mutation ownership/effective date → reserve bound to mutation → stream request file → finalize IDs only → atomically attach result to mutation receipt                                                  | foreign/replayed/conflicted/expired mutation, malformed multipart and over-limit cases leave zero bytes/rows/jobs                       |

The action/route never creates a directory, hashes bytes, selects a key, or opens a file directly.
`ServerOwnedUploadStream` is accepted only by the server upload service on the same request; it streams
with an enforced byte ceiling to the reservation temp path and persists server-observed length, hash,
signature and detected media before finalize. `FinalizeUploadInput` remains exactly the two opaque IDs;
no HTTP schema contains a byte stream, tenant, path, filename, MIME, length, digest or signature.

- Canonical storage keys are POSIX relative components only. Reject empty, absolute, backslash,
  `.`/`..`, NUL/control, URI scheme, colon/drive-qualified, percent-encoded traversal, and values whose
  `resolve(root,key)`/`relative(root,target)` escapes root. Routes and repositories share one helper.
- Production private uploads always enter `state='quarantined', scan_status='pending'`. Scanner
  absence/unreachability/timeout leaves the document unavailable and readiness degraded; it never
  commits as `not_scanned`. A rejected result sets `state='rejected'`. Only a clean result from the
  `document.scan` service capability commits it.
- Development may use an explicit deterministic test scanner adapter; production startup rejects a
  disabled/test adapter. `JA_MALWARE_SCANNER_RESULT` is test-only and cannot be a production trust
  source.
- Every download authorizes before resolving/reading bytes, verifies stored hash/length, uses private
  no-store headers and a normalized semantic filename, and audits sensitive access.

### 3.3 Audit and logging

Audit uses one versioned, cross-domain registry; B5 does not redefine the platform-wide action union
and does not invent B2 actions. The public append input names a registered version/action pair:

```ts
type B5AuditAction =
  | 'lifecycle.transition'
  | 'record.delete_draft'
  | 'correction.create'
  | 'upload.reserve'
  | 'upload.finalize'
  | 'artifact.access'
  | 'service_job.claim'
  | 'service_job.start'
  | 'service_job.succeed'
  | 'service_job.fail'
  | 'service_job.expire';
type AuditEntityType =
  | 'client'
  | 'project'
  | 'time_entry'
  | 'expense'
  | 'daily_report'
  | 'technical_report'
  | 'document'
  | 'invoice'
  | 'period_report'
  | 'accounting_pack'
  | 'job'
  | 'job_run'
  | 'upload_reservation'
  | 'user';
type B5AuditActionRef = Readonly<{ contractVersion: 'B5-R4'; action: B5AuditAction }>;
declare const registeredAuditActionBrand: unique symbol;
type RegisteredExternalAuditActionRef = Readonly<{
  contractVersion: string;
  action: string;
  [registeredAuditActionBrand]: true; // returned only by the central DB-backed registry resolver
}>;
type AuditActionRef = B5AuditActionRef | RegisteredExternalAuditActionRef;
type ArtifactClassification =
  | 'standard'
  | 'receipt'
  | 'finance'
  | 'identity'
  | 'hr'
  | 'security'
  | 'confidential';
type AuthorizedPrivateArtifactMediaType =
  | AllowedUploadMediaType
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'text/csv'
  | 'application/json';
```

The B5-R4 rows are exact: lifecycle transition → user + client/project; draft delete and correction →
user + time_entry/expense/daily_report/technical_report; upload reserve/finalize → user +
upload_reservation; artifact access → user + document/invoice/period_report/accounting_pack; each
service-job phase → service + job_run. B10 alone versions/registers MFA enroll/disable and bootstrap
owner after its independent review. `packages/database/src/core/audit-registry.ts` (B5-S) contains this literal table and a
mechanically observed `legacy-v1` action/entity/actor-kind inventory of every current append call.
`migrations/0019_lifecycle_security.sql` contains byte-equivalent literal rows; an AST/source inventory
test rejects missing, dynamic/unbounded, duplicate or extra legacy rows. Legacy inventory records
existing strings only and confers no new semantic approval.

B2/B3/B4/B10 each publish their own exact versioned rows, owner, action/entity/actor matrix and
SHA-256 handoff in their reviewed migration; B5 consumes those rows only after the named owner review.
In particular B5 never guesses a B2 finance action from current source text. Unknown version/action,
entity or actor-kind combinations and unknown input keys reject. Adding/changing a row requires its
owner's versioned contract, migration, central-registry handoff and tests; free-form fallback is
forbidden.

- Audit remains append-only. Redaction recursively handles sensitive key names and credential-shaped
  values: bearer/basic authorization, session/JWT/API tokens, recovery codes, passwords, private keys,
  signed query credentials, and bank secrets. It applies before serializing `details`, `before`,
  `after`, `reason`, metadata, and error text.
- Ordinary business notes are not broadly erased. Values are redacted by recognizable credential
  syntax; email/phone/receipt metadata is minimized per event rather than blindly copied.
- Audit contracts include `actorKind` (`user|service|system`), exactly one actor identity when known,
  action, entity, optional project, redacted before/after/reason, occurredAt, correlation ID, and
  service capability/job ID where applicable.
- `recordAuditEvent` is the sole production append path for lifecycle, MFA, bootstrap-owner, download,
  service job, and security events. MFA/bootstrap code passes typed event data and sanitized error codes;
  it never inserts `audit_event` directly or logs raw exceptions/credentials. Retryable transactions
  construct the final event entirely inside the successful attempt.
- Persisted `audit_event` columns include registered `audit_contract_version`, `actor_kind`, `actor_id` (human user),
  `service_actor_id`, `service_capability`, `job_id`, `tenant_id`, and existing correlation/project/
  before/after/reason/metadata fields. Insert guards require: user => actor_id only; service => active
  service_actor_id plus capability and no actor_id; system => neither identity and a registered system
  action. Service events include the executing job ID. Tenant is mandatory for B5-R4 actions.
  UPDATE and DELETE triggers abort for every audit row. Existing rows backfill `user` when actor_id is
  present and `system` otherwise with provenance `legacy_observed`; no legacy service identity is
  invented.
- Service and system actions never impersonate `finance-service` through a user ID. Unknown or disabled
  service provenance rejects the operation.
- HTTP logs never include request bodies, cookies, authorization values, query secrets, raw storage
  paths, or stack traces in production responses. Stable error codes are logged with correlation ID.

Authorization methods, including `authorizeDocument`, are side-effect-free metadata decisions. The
private-download helper alone records exactly one `artifact.access` event after authorization for each
terminal result (`served`, `integrity_failed`, `storage_unavailable`); unauthorized/not-found requests
perform zero filesystem calls and emit no resource-specific audit. This removes duplicate audit paths.

### 3.4 CSRF, rate limits, cookies, and errors

- Every state-changing portal form/API remains same-origin protected centrally. Accept a matching
  `Origin`; if absent, require an exactly parsed same-origin `Referer`. Reject cross-origin and missing
  evidence with `403 CSRF_FAILED`. Better Auth correlation callbacks remain delegated to Better Auth.
- Tests enumerate all non-GET portal endpoints and prove the central hook executes before handlers.
  JSON, multipart, form actions, sync, upload, step-up, and MFA management are included.
- Auth remains 10 failed/mutating attempts per 15 minutes per hashed client+endpoint. Step-up is
  `5/15m` per user+session and `20/15m` per client address; upload reserve/finalize is `30/15m` per user
  and `60/15m` per client; bulk download is `10/15m` per user; report autosave is `120/15m` per user;
  sync batch is `60/15m` per user; lifecycle/destructive actions are `30/15m` per user. Each bucket is
  independently configurable only to validated positive integers. Limit state updates are atomic;
  malformed stored timestamps reset
  safely rather than disabling the limit. `429 RATE_LIMITED` includes `Retry-After` and no secrets.
- Production auth cookies are `Secure`, `HttpOnly`, host-only, `SameSite=Lax`, and scoped to the exact
  portal path `/j-aautomation/app` (or configured portal base). No auth token enters URL or web storage.
  Runtime integration tests inspect actual `Set-Cookie`; configuration intent alone is insufficient.
- Stable action/API failures use `{success:false, code, message, fields?, correlationId?}` or sync's
  existing `{outcome, reason/code, authoritativeVersion?}`. Authorization failures do not distinguish
  “not found” from “outside scope”.

Client address is derived from the immediate socket peer. `Forwarded`/`X-Forwarded-For` is ignored
unless that peer is in the exact configured trusted-proxy CIDR set; then the proxy removes trusted hops
right-to-left and selects the first untrusted syntactically valid IP. Missing/malformed/multiple header
families fall back to the peer and emit a sanitized diagnostic code, never a raw header value.

### 3.5 Health

- `/health/live` is unauthenticated and minimal: process live status only, `no-store`; no time, path,
  versions, counts, or dependency details are required.
- `/health/ready` is for localhost/container probes and returns only `ok|degraded` plus HTTP 200/503.
  It checks DB open/query, migration compatibility, required writable private directories, minimum
  disk, durable-job lease readiness, scanner adapter, PDF renderer, email delivery and verified backup
  freshness/restore-drill evidence when configured as required.
- `/app/api/health` requires an active OwnerAdmin or AuditorReadOnly principal. It may return named
  dependency states and current/expected migration version, but never DB/storage paths, keys, customer/
  user/invoice counts, document names, credentials, or provider secret configuration.
- Scanner/PDF/job/storage/email/backup failures are visible as `degraded` with stable non-secret codes.
- `DatabaseReadiness` composes route-independent adapters:
  `database`, `migration`, `write_lock`, `storage_root`, `disk`, `durable_jobs`, `scanner`,
  `pdf_renderer`, `email_delivery`, and `backup_restore`, each
  `{status:'ok'|'degraded'|'unavailable', required:boolean, code}`. Allowed codes
  are `DB_QUERY_FAILED`, `MIGRATION_MISMATCH`, `WRITE_LOCK_UNAVAILABLE`, `STORAGE_UNWRITABLE`,
  `DISK_BELOW_MINIMUM`, `JOB_LEASE_UNAVAILABLE`, `SCANNER_UNCONFIGURED|SCANNER_UNREACHABLE`, and
  `PDF_RENDERER_UNCONFIGURED|PDF_RENDERER_UNREACHABLE`,
  `EMAIL_UNCONFIGURED|EMAIL_UNREACHABLE|EMAIL_BACKLOG`, and
  `BACKUP_STALE|BACKUP_UNVERIFIED|RESTORE_DRILL_STALE`. Required adapters make readiness 503; optional
  adapters remain reported only to authorized operations health.
- Host policy is exact: `/health/live` and `/health/ready` accept loopback (`127.0.0.1`, `::1`) or the
  configured trusted probe CIDR/host supplied by the deployment proxy; an external untrusted host gets
  404 with the same minimal body. Forwarded addresses are trusted only when the immediate peer is the
  configured proxy. `/app/api/health` is session/role authorized regardless of host. Adapter probes
  have bounded timeouts and never log credential-bearing URLs.

## 4. Stable public interfaces

### 4.1 Repository/API methods

The façade retains all existing signatures and adds these stable methods through extracted domain
repositories. Exact input schemas live in `@ja/schemas`; opaque IDs and positive integer versions are
mandatory.

```ts
updateClient(principal, { id, version, legalName?, displayName?, timezone?, billingEmail?,
  paymentTermsDays?, notes?, currency? }) -> { id, version }
transitionClient(principal, { id, version, transition:
  'close'|'reopen'|'archive'|'restore', reason, restoreTarget? }) -> { id, status, version }
updateProject(principal, { id, version, ...allowedFields }) -> { id, version }
transitionProject(principal, { id, version, transition:
  'plan'|'activate'|'pause'|'resume'|'begin_close'|'close'|'archive'|'restore',
  reason, restoreTarget?, closeoutId?, closeoutVersion? }) -> { id, status, version }
recordEligibility(principal, type: LifecycleRecordType, id) -> RecordEligibility
deleteDraft(principal, { type: LifecycleRecordType, id, version, reason? }) -> { id, deleted: true }
createCorrectionDraft(principal, { requestId, type: LifecycleRecordType, originalId, version, reason })
  -> { originalId, correctionId, version: 1 }
reserveUpload(principal, input: ReserveUploadInput) -> ReserveUploadResult
finalizeUpload(principal, input: FinalizeUploadInput) -> FinalizeUploadResult
runDueConfiguredDurableJobs(limit: 1..100) -> Promise<readonly DurableJobOutcome[]>
  // deployment composition root only; private run ID + tenant/actor/kind/capability/correlation/handler are internally derived
```

Validation/authorization matrix:

- Client update fields are exactly `legalName`, `displayName`, `timezone`, `billingEmail`,
  `paymentTermsDays`, `notes`, and `currency`. OwnerAdmin and FinanceAdmin may change the first six.
  Currency is OwnerAdmin/FinanceAdmin only and is accepted only when
  `projectFinancialMutationEligibility` is eligible **and no project row exists**; otherwise
  `CLIENT_CURRENCY_IMMUTABLE`. Empty patch is `VALIDATION_FAILED`.
- OwnerAdmin project update fields are exactly `name`, `description`, `projectAlias`, `siteName`,
  `country`, `timezone`, `currency`, `projectManagerId`, `startDate`, `plannedEndDate`, `poNumber`,
  `contractNumber`, `billingModel`, `budgetType`, `revenueBudgetMinor`, `poCapMinor`,
  `fixedPriceMinor`, `laborBudgetMinutes`, `travelBudgetMinor`, `otherCostBudgetMinor`,
  `expectedMinutesPerDay`, `clientDailyMinimumMinutes`, `weeklyCloseEnabled`,
  `dailyReportRequired`, `technicalReportingRequired`, and `notes`.
- FinanceAdmin project update fields are `currency`, `poNumber`, `contractNumber`, `billingModel`,
  `budgetType`, the six budget/cap fields, and `clientDailyMinimumMinutes`; currency additionally obeys
  the no-child/no-finance rule. FinanceAdmin cannot change lifecycle or operational ownership.
- A scoped effective ProjectManager may update only `description`, `siteName`, `country`, `timezone`,
  `startDate`, `plannedEndDate`, `expectedMinutesPerDay`, `dailyReportRequired`,
  `technicalReportingRequired`, and `notes`. PM cannot change name/alias/client/currency/manager,
  billing, budget, PO/contract, close/archive state, or client minimum.
- `id`, client ID, project/client number, status, version, created/updated timestamps, actual end date,
  financial source/lock IDs, and closeout linkage are never patch fields. Unknown keys are stripped by
  form parsing and rejected by strict API schemas.
- Every transition (`plan`, `activate`, `pause`, `resume`, `begin_close`, `close`, `archive`, `restore`,
  `reopen`) requires a trimmed reason of 3–2000 characters. Restore with unknown legacy origin also
  requires the enumerated restore target. Delete-draft reason is optional for creator, mandatory for
  Owner emergency deletion as specified in section 2.4.

`listActiveWorkers(principal, {asOf?, projectId?})` remains source-compatible for omitted options but
returns a role-specific bounded DTO. `principalFor` signature remains source-compatible; its project
set becomes effective-date-correct. Existing report/time/expense APIs delegate to the common
eligibility policy without exposing finance-owned fields.

Complete shared error registry:

| HTTP | Code                                                                                                                                                                                                                                                                                                                                                                                 | Meaning / write guarantee                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`, `INVALID_DATE`, `INVALID_TRANSITION`, `RESTORE_TARGET_REQUIRED`                                                                                                                                                                                                                                                                                                 | Invalid input; zero writes.                                                      |
| 401  | `AUTHENTICATION_REQUIRED`                                                                                                                                                                                                                                                                                                                                                            | No active authenticated session; zero writes.                                    |
| 403  | `ACCESS_DENIED`, `OBJECT_SCOPE_REQUIRED`, `STEP_UP_REQUIRED`, `CSRF_FAILED`, `UPLOAD_NOT_AUTHORIZED`, `SERVICE_CAPABILITY_REQUIRED`                                                                                                                                                                                                                                                  | Non-disclosing authorization failure; zero writes/FS access.                     |
| 404  | `RESOURCE_UNAVAILABLE`                                                                                                                                                                                                                                                                                                                                                               | Read/download resource absent or unauthorized; same external shape/timing class. |
| 409  | `VERSION_CONFLICT`, `INVALID_LIFECYCLE_STATE`, `LIFECYCLE_DEPENDENCY_CONFLICT`, `DRAFT_NOT_DELETABLE`, `CORRECTION_REQUIRES_FINANCE_WORKFLOW`, `FINANCE_HISTORY_PRESENT`, `SOURCE_LOCKED`, `FINAL_REPORT_SOURCE`, `PENDING_APPROVALS`, `CLIENT_CURRENCY_IMMUTABLE`, `PROJECT_CURRENCY_IMMUTABLE`, `IDEMPOTENCY_CONFLICT`, `UPLOAD_RESERVATION_CONFLICT`, `ARTIFACT_INTEGRITY_FAILED` | Conflict; transaction rolled back and no audit/notification side effects.        |
| 413  | `UPLOAD_TOO_LARGE`                                                                                                                                                                                                                                                                                                                                                                   | Body aborted/temp removed/reservation released.                                  |
| 429  | `RATE_LIMITED`, `UPLOAD_QUOTA_EXCEEDED`                                                                                                                                                                                                                                                                                                                                              | No business/FS write; includes `Retry-After`.                                    |
| 503  | `DEPENDENCY_UNAVAILABLE`                                                                                                                                                                                                                                                                                                                                                             | Required local adapter unavailable; no false-ready state.                        |

Database error classes carry `code` and safe message. `actionFailure` is the sole form-action mapper;
API helpers use the same registry and correlation ID. Unknown exceptions remain generic 500 externally
and preserve the correlation ID only.

### 4.2 UI/action state

- Lifecycle forms have `data-lifecycle-entity`, `data-entity-id`, and `data-lifecycle-action` values
  used by existing UUID-bound E2E tests. Buttons render only when eligibility permits, but server
  authorization is authoritative.
- Lists offer `Active`, `Closed`, and `Archived` filters where applicable; archived rows remain
  reachable after action. Success is displayed only after committed transition; conflicts preserve
  form values and announce the error.
- Danger actions require an explicit modal/dialog, entity business code/name, consequence text,
  reason where required, Cancel first, visible focus, keyboard trap/return, and no color-only meaning.
- Report forms expose autosave states `Saving draft`, `Draft saved locally`, `Draft saved to server`,
  `Recovery available`, and `Conflict — compare changes`. None implies submission.
- Offline UI states remain `Synced`, `Saving`, `Offline — saved on this device`, queued count,
  conflict, and retry. It never displays another partition while switching identities.

### 4.3 Private download contract

All four families call one server-only helper with a two-stage side-effect-free authorization contract:

```ts
type PrivateArtifactFamily = 'accounting_pack'|'invoice'|'period_report'|'document';
type AuthorizedArtifactScope = Readonly<{
  authorizationTicket: string; // opaque, request-local, server-created
  classification: ArtifactClassification;
}>;
servePrivateDownload(locals, family: PrivateArtifactFamily, opaqueId: string) -> Promise<Response>;
type AuthorizedPrivateArtifact = Readonly<{
  storageKey: string; sha256: string; byteLength: number;
  mediaType: AuthorizedPrivateArtifactMediaType;
  classification: ArtifactClassification;
  filename: string; audit: Readonly<{
    action:'artifact.access';
    entityType:'accounting_pack'|'invoice'|'period_report'|'document';
    entityId:string; sensitive:true
  }>;
}>;
```

The route validates only the opaque route shape. The helper authenticates an active principal, calls
`authorizeArtifactScope(principal,family,opaqueId)` to prove object/role scope without returning
filename, media type, length, hash, key or existence detail, and maps absent/unauthorized objects to the
same `404 RESOURCE_UNAVAILABLE` shape/timing class. Only after a green scope ticket does it require
session-bound step-up for sensitive families/classifications. It then calls
`resolveAuthorizedArtifact(ticket)` for `AuthorizedPrivateArtifact`; only the matching request-local
ticket can resolve it. Scope and step-up complete before root resolution, `stat`, `readFile`, or stream
open. The helper applies
the one canonical storage-key validator, resolves beneath the private root, opens without following an
unsafe symlink/reparse escape where supported, verifies exact length and SHA-256 before response,
normalizes an RFC 5987-safe semantic filename, rejects an unknown/extension-mismatched metadata MIME,
sets the literal registry `Content-Type`, `Content-Length`, `Content-Disposition: attachment`,
`Cache-Control: private, no-store`, `Pragma: no-cache`, `Expires: 0`,
`X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, and
`Content-Security-Policy: sandbox`,
and audits the authorized attempt/result. Integrity failure is non-downloadable
`409 ARTIFACT_INTEGRITY_FAILED` and creates an integrity audit event without disclosing paths.

Both authorization stages are side-effect-free; only `servePrivateDownload` appends the one terminal
access event. Step-up is checked **after non-disclosing object-scope authorization but before sensitive
metadata** for Accounting Pack, invoice PDF, final period report PDF, any bulk/multi-artifact download,
and documents classified `finance`, `identity`, `hr`,
`security`, or `confidential`. Ordinary receipts/project documents require the active role/object scope
but not step-up unless their stored classification is sensitive. Classification is server-owned and a
closed enum; missing/unknown classification fails closed as `confidential`. Tests cover stale/missing/
other-session step-up separately for every family and prove zero metadata/FS/audit access on failure.

Routes are exactly:

- Accounting Pack: `apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server.ts`, leased only
  after WP-B3 releases its artifact lifecycle/metadata contract.
- Invoice PDF: `apps/portal/src/routes/app/api/invoices/[id]/pdf/+server.ts`, after WP-B2/B4 release
  invoice metadata/filename semantics.
- Period report PDF: `apps/portal/src/routes/app/api/reports/[id]/pdf/+server.ts`, after WP-B4 releases
  final report metadata semantics.
- Document: `apps/portal/src/routes/app/api/documents/[id]/+server.ts` (new), using
  `authorizeDocument`; no storage key is accepted from query/form input.

Family media is closed: invoice and period-report routes permit only `application/pdf`; Accounting Pack
route `[type]` is exactly `pdf -> application/pdf`, `xlsx ->
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `invoice_csv|expense_csv ->
text/csv`, and `json -> application/json`; document routes permit only the stored
`AuthorizedPrivateArtifactMediaType`. Unknown type/media/metadata keys return
`RESOURCE_UNAVAILABLE`/`ARTIFACT_INTEGRITY_FAILED` before filesystem access. `Content-Disposition`
always uses a server semantic basename plus RFC5987 `filename*`; CR/LF/control/quote/path characters are
removed and the ASCII fallback is non-empty. Inline rendering and caller-selected headers are forbidden.

Required all-family IDOR tests cover unauthenticated, Worker owner, other Worker, scoped/unscoped PM,
Finance, Owner, and Auditor, with fresh/stale/missing/other-session step-up for every sensitive family.
Spies prove unauthorized/missing/step-up-failed requests resolve no sensitive metadata, make zero
filesystem calls and append no download audit. Path tests cover drive-qualified, URI scheme,
percent-encoded traversal, slash/backslash, `.`/`..`, NUL/control, symlink/reparse escape; integrity,
Unicode/quote/CRLF filenames, headers, no-store, and exactly one sensitive access audit on success.

## 5. Migration and migration-context contract

Only one migration writer may work while every active migration/schema lease is released. The binding
Sol/high R6.2 order is: R6.2 approval → B2-MH runner/CANON/descriptors/lock → B5-M
`0019_lifecycle_security.sql` → B2-MF `0020_finance_v2.sql` → B2-MC/Core → B3-M
`0021_accounting_pack_artifacts.sql` → B4-M `0022_report_registry.sql` → B5-F/B5-I integrations.
B5-M is hard-blocked until R6.2 and B2-MH are independently approved/released. B2-MH is sole writer of
`packages/database/src/index.ts`; B5 never takes that path. B5 alone owns prerequisite lifecycle,
service-actor and job/run DDL/transitions, and has no B2/B3/B4 migration dependency. Ownership is exact:

- migration worker, only after approved R6.2+B2-MH and with every listed path exclusively leased:
  `migrations/0019_lifecycle_security.sql`,
  `migrations/contracts/0019_lifecycle_security.manifest.json` (new reviewed descriptor and expected
  projection digests),
  `packages/database/src/schema/lifecycle-security.ts` (new),
  `packages/database/src/schema/offline.ts`, `packages/database/src/schema/audit.ts`,
  `packages/database/src/schema/jobs.ts`, `packages/database/src/schema/documents.ts`,
  `packages/database/src/schema/technical.ts`, and
  `tests/fixtures/b5-migration-legacy-fixture.sql` (new deterministic populated 0018 fixture),
  `tests/integration/lifecycle-security-migration.test.ts` (new);
- B5-MC export-only lease in `packages/database/src/schema.ts`, after B5-M; it releases before the
  sequential B2-MC → B3-MC → B4-MC export leases. B2-MH alone implements the 0019 TEMP
  context/descriptor and later additive `index.ts` exports from released B5 interfaces.

No other B5 leaf edits these paths or any migration test. This removes the earlier contradiction where
B5-M both owned and did not own unspecified tests.

### 5.1 Validated tenant/deployment migration context

The R6.2-approved B2-MH dedicated migration wrapper remains the only production migration entry point.
Before executing **any** unapplied file,
it scans the migration set; if the B5 migration is present and unapplied, it calls
`resolveRequiredDeploymentIdentity(process.env.JA_TENANT_ID, process.env.JA_DEPLOYMENT_ID)`. Each value
must be already trimmed and match `^[a-z0-9][a-z0-9_-]{2,63}$`; missing, whitespace-normalized,
malformed, or multiple/ambiguous observed identity values abort before any persistent migration write.
There is no default or inferred identity.

On the same SQLite connection, the context owner creates:

```sql
CREATE TEMP TABLE ja_migration_context(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  tenant_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL
);
CREATE TEMP TABLE technical_report_date_backfill(
  report_id TEXT PRIMARY KEY NOT NULL,
  report_date TEXT NOT NULL
) WITHOUT ROWID;
CREATE TEMP TABLE legacy_offline_hash_backfill(
  source_table TEXT NOT NULL CHECK(source_table IN ('offline_mutation','mutation_receipt')),
  mutation_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
  PRIMARY KEY(source_table,mutation_id)
) WITHOUT ROWID;
CREATE TEMP TABLE legacy_audit_registry_backfill(
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','service','system')),
  source_location_sha256 TEXT NOT NULL CHECK(length(source_location_sha256)=64),
  PRIMARY KEY(action,entity_type,actor_kind)
) WITHOUT ROWID;
```

It inserts exactly `(1, ?, ?)` with a prepared/bound statement. The static SQL migration reads only
the singleton tenant/deployment values. Direct `sqlite.exec` without the
context fails before backfill. The SQL file contains no transaction statement and no
`schema_migration` insert. The wrapper opens `BEGIN IMMEDIATE`, supplies the TEMP context, executes the
reviewed SQL, runs structural/data/hash postflight, inserts immutable `migration_contract_metadata`
for version `19`, name `0019_lifecycle_security` and contract version `B5-R3+`, inserts
`schema_migration(19,applied_at)` with the identical timestamp, performs final postflight, and only
then commits. Any missing/duplicate/malformed context, DDL/backfill/metadata/schema-migration/
postflight or COMMIT error rolls the whole transaction back. `migrate()` drops the TEMP
table in `finally`. On retry it preflights `deployment_identity` and existing tenant-bearing B5 tables;
any different tenant/deployment is `DEPLOYMENT_IDENTITY_MISMATCH` before writes. Runtime
`createDatabase` also requires the same exact pair after the migration is applied.

Before executing the static file, `migrate()` reads every legacy technical report's `id`, `created_at`
and project IANA timezone, rejects missing/invalid/ambiguous values, converts the persisted instant to
that timezone with the pinned Node 24 `Intl.DateTimeFormat('en-CA',{timeZone,...})`, validates exact
`YYYY-MM-DD`, and inserts one bound `(report_id,report_date)` row. It verifies count and ID equality with
`technical_report`; zero guessed UTC fallback is allowed. In the same preflight it parses each legacy
offline payload/result as JSON, canonicalizes with the released JSON canonicalizer, hashes the exact
canonical UTF-8 bytes with SHA-256, and inserts one bound hash row per source row. A legacy
`mutation_receipt` uses the matching same-user `offline_mutation` payload hash when present; otherwise
its payload hash is the canonical sentinel
`{"legacyMutationId":<mutation_id>,"provenance":"payload_unavailable"}`, which deliberately makes any
later payload-bearing replay conflict rather than guessing old intent. Source/hash row counts and IDs
must match exactly before static SQL starts. The wrapper also AST-scans every current audit append,
expands each closed template-literal union, rejects non-finite action/entity values, verifies the exact
reviewed `legacy-v1` inventory and source-location hashes in the 0019 manifest, and binds those rows
into `legacy_audit_registry_backfill`. Every distinct historical
`audit_event(action,entity_type,derived actor_kind)` must already be a literal reviewed manifest row;
an unknown historical value aborts rather than being auto-registered. The SQL reads only these TEMP
tables.

### 5.2 Exact schema

The migration SQL below is binding, not illustrative. IDs, hashes and timestamps are non-empty text;
application schemas additionally enforce UUID/SHA-256/RFC3339 syntax. Every FK uses the existing exact
table/ID and default `ON UPDATE RESTRICT ON DELETE RESTRICT`. New tables are SQLite `STRICT`; nullable
columns are written explicitly. Trigger names are globally unique and created in the same transaction.

```sql
CREATE TABLE deployment_identity(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  anchored_at TEXT NOT NULL CHECK(length(anchored_at)>0)
) STRICT;
INSERT INTO deployment_identity(singleton,tenant_id,deployment_id,anchored_at)
SELECT 1,tenant_id,deployment_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM temp.ja_migration_context WHERE singleton=1;
CREATE TRIGGER deployment_identity_no_insert BEFORE INSERT ON deployment_identity
WHEN EXISTS(SELECT 1 FROM deployment_identity) BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TRIGGER deployment_identity_no_update BEFORE UPDATE ON deployment_identity BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;
CREATE TRIGGER deployment_identity_no_delete BEFORE DELETE ON deployment_identity BEGIN SELECT RAISE(ABORT,'deployment identity immutable'); END;

CREATE TABLE entity_lifecycle_event(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('client','project')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  from_state TEXT NULL CHECK(from_state IS NULL OR from_state IN ('active','closed','archived','draft','planned','paused','closing')),
  to_state TEXT NOT NULL CHECK(to_state IN ('active','closed','archived','draft','planned','paused','closing')),
  actor_user_id TEXT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NULL CHECK(reason IS NULL OR length(reason) BETWEEN 3 AND 2000),
  version_before INTEGER NOT NULL CHECK(version_before>=0),
  version_after INTEGER NOT NULL CHECK(version_after=version_before+1),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at)>0),
  correlation_id TEXT NOT NULL CHECK(length(correlation_id)>0),
  provenance TEXT NOT NULL CHECK(provenance IN ('native','migration_observed')),
  CHECK((provenance='native' AND actor_user_id IS NOT NULL) OR (provenance='migration_observed' AND actor_user_id IS NULL)),
  CHECK((entity_type='client' AND (from_state IS NULL OR from_state IN ('active','closed','archived')) AND to_state IN ('active','closed','archived')) OR
        (entity_type='project' AND (from_state IS NULL OR from_state IN ('draft','planned','active','paused','closing','closed','archived')) AND to_state IN ('draft','planned','active','paused','closing','closed','archived')))
) STRICT;
CREATE UNIQUE INDEX entity_lifecycle_version_uq ON entity_lifecycle_event(tenant_id,entity_type,entity_id,version_after);
CREATE INDEX entity_lifecycle_history_idx ON entity_lifecycle_event(tenant_id,entity_type,entity_id,occurred_at,id);
CREATE TRIGGER entity_lifecycle_no_update BEFORE UPDATE ON entity_lifecycle_event BEGIN SELECT RAISE(ABORT,'lifecycle immutable'); END;
CREATE TRIGGER entity_lifecycle_no_delete BEFORE DELETE ON entity_lifecycle_event BEGIN SELECT RAISE(ABORT,'lifecycle immutable'); END;
CREATE TRIGGER entity_lifecycle_subject_guard BEFORE INSERT ON entity_lifecycle_event WHEN
  (NEW.entity_type='client' AND NOT EXISTS(SELECT 1 FROM client WHERE id=NEW.entity_id)) OR
  (NEW.entity_type='project' AND NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.entity_id)) OR
  (NEW.provenance='migration_observed' AND (NEW.from_state IS NOT NULL OR NEW.to_state<>'archived')) OR
  (NEW.provenance='native' AND NOT (
    (NEW.entity_type='client' AND ((NEW.from_state='active' AND NEW.to_state IN ('closed','archived')) OR (NEW.from_state='closed' AND NEW.to_state IN ('active','archived')) OR (NEW.from_state='archived' AND NEW.to_state IN ('active','closed')))) OR
    (NEW.entity_type='project' AND ((NEW.from_state='draft' AND NEW.to_state IN ('planned','active','archived')) OR (NEW.from_state='planned' AND NEW.to_state IN ('active','paused','archived')) OR (NEW.from_state='active' AND NEW.to_state IN ('paused','closing')) OR (NEW.from_state='paused' AND NEW.to_state IN ('active','closing')) OR (NEW.from_state='closing' AND NEW.to_state='closed') OR (NEW.from_state='closed' AND NEW.to_state='archived') OR (NEW.from_state='archived' AND NEW.to_state IN ('draft','planned','closed')))))) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid lifecycle subject'); END;

CREATE TABLE record_correction_link(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  record_type TEXT NOT NULL CHECK(record_type IN ('time_entry','expense','daily_report','technical_report')),
  original_id TEXT NOT NULL CHECK(length(original_id)>0),
  correction_id TEXT NOT NULL CHECK(length(correction_id)>0 AND correction_id<>original_id),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  request_payload_sha256 TEXT NOT NULL CHECK(length(request_payload_sha256)=64),
  actor_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  correlation_id TEXT NOT NULL CHECK(length(correlation_id)>0),
  UNIQUE(tenant_id,record_type,original_id,request_id),
  UNIQUE(tenant_id,record_type,correction_id)
) STRICT;
CREATE TRIGGER correction_link_no_update BEFORE UPDATE ON record_correction_link BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TRIGGER correction_link_no_delete BEFORE DELETE ON record_correction_link BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TRIGGER correction_link_subject_guard BEFORE INSERT ON record_correction_link WHEN
  (NEW.record_type='time_entry' AND (NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM time_entry WHERE id=NEW.correction_id))) OR
  (NEW.record_type='expense' AND (NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM expense WHERE id=NEW.correction_id))) OR
  (NEW.record_type='daily_report' AND (NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.correction_id))) OR
  (NEW.record_type='technical_report' AND (NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.original_id) OR NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.correction_id))) OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid correction subject'); END;

CREATE TABLE upload_reservation(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  project_id TEXT NULL REFERENCES project(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NULL CHECK(mutation_id IS NULL OR length(mutation_id)>0),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  request_payload_sha256 TEXT NOT NULL CHECK(length(request_payload_sha256)=64),
  purpose TEXT NOT NULL CHECK(purpose IN ('receipt','private_document')),
  classification TEXT NOT NULL CHECK(classification IN ('standard','receipt','finance','identity','hr','security','confidential')),
  original_filename TEXT NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 200),
  declared_media_type TEXT NOT NULL CHECK(declared_media_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/zip','text/plain')),
  detected_media_type TEXT NULL CHECK(detected_media_type IS NULL OR detected_media_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/zip','text/plain')),
  expected_bytes INTEGER NOT NULL CHECK(expected_bytes BETWEEN 1 AND 50000000),
  observed_bytes INTEGER NULL CHECK(observed_bytes IS NULL OR observed_bytes BETWEEN 1 AND 50000000),
  observed_sha256 TEXT NULL CHECK(observed_sha256 IS NULL OR length(observed_sha256)=64),
  temp_storage_key TEXT NULL CHECK(temp_storage_key IS NULL OR length(temp_storage_key)>0),
  final_storage_key TEXT NULL CHECK(final_storage_key IS NULL OR length(final_storage_key)>0),
  state TEXT NOT NULL CHECK(state IN ('pending','streamed','finalized','released','expired')),
  expires_at TEXT NOT NULL CHECK(length(expires_at)>0),
  document_id TEXT NULL REFERENCES document(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  finalized_at TEXT NULL CHECK(finalized_at IS NULL OR length(finalized_at)>0),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,user_id,request_id),
  UNIQUE(final_storage_key),
  CHECK((state='pending' AND detected_media_type IS NULL AND observed_bytes IS NULL AND observed_sha256 IS NULL AND temp_storage_key IS NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL) OR
        (state='streamed' AND detected_media_type=declared_media_type AND observed_bytes=expected_bytes AND observed_sha256 IS NOT NULL AND temp_storage_key IS NOT NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL) OR
        (state='finalized' AND detected_media_type=declared_media_type AND observed_bytes=expected_bytes AND observed_sha256 IS NOT NULL AND temp_storage_key IS NULL AND final_storage_key IS NOT NULL AND document_id IS NOT NULL AND finalized_at IS NOT NULL) OR
        (state IN ('released','expired') AND temp_storage_key IS NULL AND final_storage_key IS NULL AND document_id IS NULL AND finalized_at IS NULL))
) STRICT;
CREATE INDEX upload_pending_user_idx ON upload_reservation(tenant_id,deployment_id,user_id,state,expires_at);
CREATE INDEX upload_pending_project_idx ON upload_reservation(tenant_id,deployment_id,project_id,state,expires_at);
CREATE TRIGGER upload_reservation_insert_guard BEFORE INSERT ON upload_reservation WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  (NEW.purpose='receipt' AND NEW.classification<>'receipt') OR
  (NEW.purpose='receipt' AND NEW.declared_media_type IN ('application/zip','text/plain')) OR
  (NEW.purpose='receipt' AND NEW.expected_bytes>10000000)
BEGIN SELECT RAISE(ABORT,'invalid upload reservation'); END;
CREATE TRIGGER upload_reservation_update_guard BEFORE UPDATE ON upload_reservation WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.user_id<>OLD.user_id OR
  NEW.project_id IS NOT OLD.project_id OR NEW.mutation_id IS NOT OLD.mutation_id OR NEW.request_id<>OLD.request_id OR
  NEW.request_payload_sha256<>OLD.request_payload_sha256 OR NEW.purpose<>OLD.purpose OR NEW.classification<>OLD.classification OR
  NEW.original_filename<>OLD.original_filename OR NEW.declared_media_type<>OLD.declared_media_type OR NEW.expected_bytes<>OLD.expected_bytes OR
  NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR length(NEW.updated_at)=0 OR NEW.updated_at=OLD.updated_at OR
  NOT ((OLD.state='pending' AND NEW.state IN ('streamed','released','expired')) OR
       (OLD.state='streamed' AND NEW.state IN ('finalized','released'))) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid upload transition'); END;

CREATE TABLE service_actor(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json) AND json_type(capabilities_json)='array'),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,name)
) STRICT;
CREATE TRIGGER service_actor_capability_insert_guard BEFORE INSERT ON service_actor WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json))
BEGIN SELECT RAISE(ABORT,'invalid service actor capabilities'); END;
CREATE TRIGGER service_actor_capability_update_guard BEFORE UPDATE ON service_actor WHEN
  NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.name<>OLD.name OR
  EXISTS(SELECT 1 FROM json_each(NEW.capabilities_json) c WHERE c.type<>'text' OR c.value NOT IN ('artifact.invoice.render','artifact.report.render','billing.draft.generate','artifact.accounting_pack.render','document.scan','outbox.deliver','alert.dispatch','email.send','backup.verify')) OR
  (SELECT count(*) FROM json_each(NEW.capabilities_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.capabilities_json)) OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'invalid service actor update'); END;

CREATE TABLE deployment_service_actor_binding(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  service_actor_id TEXT NOT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  bound_at TEXT NOT NULL CHECK(length(bound_at)>0),
  bound_by_user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>=1),
  UNIQUE(tenant_id,deployment_id,service_actor_id)
) STRICT;
CREATE TRIGGER deployment_service_actor_binding_insert_guard BEFORE INSERT ON deployment_service_actor_binding WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1 AND d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active')
BEGIN SELECT RAISE(ABORT,'invalid configured service actor'); END;
CREATE TRIGGER deployment_service_actor_binding_update_guard BEFORE UPDATE ON deployment_service_actor_binding WHEN
  NEW.singleton<>OLD.singleton OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.service_actor_id=OLD.service_actor_id OR NEW.bound_at=OLD.bound_at OR NEW.bound_by_user_id=OLD.bound_by_user_id OR NEW.version<>OLD.version+1 OR
  NOT EXISTS(SELECT 1 FROM service_actor s WHERE s.id=NEW.service_actor_id AND s.tenant_id=NEW.tenant_id AND s.deployment_id=NEW.deployment_id AND s.status='active')
BEGIN SELECT RAISE(ABORT,'invalid configured service actor replacement'); END;
CREATE TRIGGER deployment_service_actor_binding_no_delete BEFORE DELETE ON deployment_service_actor_binding
BEGIN SELECT RAISE(ABORT,'configured service actor binding retained'); END;

CREATE TABLE offline_mutation_scoped(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NOT NULL CHECK(length(mutation_id)>0),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('time_entry','expense','daily_report','technical_report','document')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  base_version INTEGER NOT NULL CHECK(base_version>=0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  attachment_ids_json TEXT NOT NULL CHECK(json_valid(attachment_ids_json) AND json_type(attachment_ids_json)='array'),
  state TEXT NOT NULL CHECK(state IN ('accepted','conflict','rejected')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  processed_at TEXT NOT NULL CHECK(length(processed_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,mutation_id)
) STRICT;
CREATE INDEX offline_scoped_user_idx ON offline_mutation_scoped(tenant_id,deployment_id,user_id,created_at,state);
CREATE TRIGGER offline_scoped_insert_guard BEFORE INSERT ON offline_mutation_scoped WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'offline deployment mismatch'); END;
CREATE TRIGGER offline_scoped_no_update BEFORE UPDATE ON offline_mutation_scoped BEGIN SELECT RAISE(ABORT,'offline outcome immutable'); END;
CREATE TRIGGER offline_scoped_no_delete BEFORE DELETE ON offline_mutation_scoped BEGIN SELECT RAISE(ABORT,'offline outcome immutable'); END;

CREATE TABLE mutation_receipt_scoped(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mutation_id TEXT NOT NULL CHECK(length(mutation_id)>0),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('time_entry','expense','daily_report','technical_report','document')),
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,mutation_id)
) STRICT;
CREATE TRIGGER mutation_receipt_scoped_insert_guard BEFORE INSERT ON mutation_receipt_scoped WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id)
BEGIN SELECT RAISE(ABORT,'receipt deployment mismatch'); END;
CREATE TRIGGER mutation_receipt_scoped_no_update BEFORE UPDATE ON mutation_receipt_scoped BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;
CREATE TRIGGER mutation_receipt_scoped_no_delete BEFORE DELETE ON mutation_receipt_scoped BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;

INSERT INTO offline_mutation_scoped(
  id,tenant_id,deployment_id,user_id,mutation_id,entity_type,entity_id,base_version,payload_json,
  payload_sha256,attachment_ids_json,state,result_json,result_sha256,created_at,processed_at
)
SELECT o.mutation_id,d.tenant_id,d.deployment_id,o.user_id,o.mutation_id,o.entity_type,o.entity_id,
  o.base_version,o.payload_json,h.payload_sha256,o.attachment_ids_json,o.state,o.result_json,
  h.result_sha256,o.created_at,o.processed_at
FROM offline_mutation o
JOIN temp.legacy_offline_hash_backfill h
  ON h.source_table='offline_mutation' AND h.mutation_id=o.mutation_id
CROSS JOIN deployment_identity d
WHERE d.singleton=1;
INSERT INTO mutation_receipt_scoped(
  id,tenant_id,deployment_id,user_id,mutation_id,entity_type,entity_id,payload_sha256,result_json,
  result_sha256,created_at
)
SELECT r.mutation_id,d.tenant_id,d.deployment_id,r.user_id,r.mutation_id,r.entity_type,r.entity_id,
  h.payload_sha256,r.result_json,h.result_sha256,r.created_at
FROM mutation_receipt r
JOIN temp.legacy_offline_hash_backfill h
  ON h.source_table='mutation_receipt' AND h.mutation_id=r.mutation_id
CROSS JOIN deployment_identity d
WHERE d.singleton=1;
CREATE TEMP TABLE b5_legacy_copy_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO b5_legacy_copy_guard(ok)
SELECT CASE WHEN
  (SELECT count(*) FROM offline_mutation_scoped)=(SELECT count(*) FROM offline_mutation) AND
  (SELECT count(*) FROM mutation_receipt_scoped)=(SELECT count(*) FROM mutation_receipt)
THEN 1 ELSE 0 END;
DROP TABLE b5_legacy_copy_guard;

CREATE TABLE report_autosave_receipt(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NOT NULL CHECK(length(deployment_id) BETWEEN 3 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily','technical')),
  report_id TEXT NOT NULL CHECK(length(report_id)>0),
  request_id TEXT NOT NULL CHECK(length(request_id)>0),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  base_version INTEGER NOT NULL CHECK(base_version>=1),
  client_revision INTEGER NOT NULL CHECK(client_revision>=1),
  outcome_json TEXT NOT NULL CHECK(json_valid(outcome_json)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  UNIQUE(tenant_id,deployment_id,user_id,report_id,request_id)
) STRICT;
CREATE INDEX report_autosave_retention_idx ON report_autosave_receipt(tenant_id,deployment_id,created_at);
CREATE TRIGGER report_autosave_subject_guard BEFORE INSERT ON report_autosave_receipt WHEN
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  (NEW.report_type='daily' AND NOT EXISTS(SELECT 1 FROM daily_report WHERE id=NEW.report_id)) OR
  (NEW.report_type='technical' AND NOT EXISTS(SELECT 1 FROM technical_report WHERE id=NEW.report_id))
BEGIN SELECT RAISE(ABORT,'invalid autosave subject'); END;
CREATE TRIGGER report_autosave_no_update BEFORE UPDATE ON report_autosave_receipt BEGIN SELECT RAISE(ABORT,'autosave receipt immutable'); END;
CREATE TRIGGER report_autosave_retention_delete_guard BEFORE DELETE ON report_autosave_receipt WHEN
  julianday(OLD.created_at)>=julianday('now','-30 days')
BEGIN SELECT RAISE(ABORT,'autosave receipt retention active'); END;
CREATE TRIGGER upload_reservation_no_delete BEFORE DELETE ON upload_reservation BEGIN SELECT RAISE(ABORT,'upload reservation retained'); END;
```

The same migration exactly rebuilds `job`/`job_run` to remove the legacy global idempotency UNIQUE and
add reciprocal B5 authority while preserving every original projection byte/count; it then additively
extends `audit_event`, `document`, and `technical_report`. Nullable legacy columns plus immutable
`contract_version='legacy'` quarantine preserve old job history; only complete `b5-v1` rows may execute:

```sql
ALTER TABLE job RENAME TO job_legacy_b5;
ALTER TABLE job_run RENAME TO job_run_legacy_b5;
CREATE TABLE job(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  kind TEXT NOT NULL CHECK(length(kind)>0),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key)>0),
  state TEXT NOT NULL CHECK(length(state)>0),
  run_after TEXT NOT NULL CHECK(length(run_after)>0),
  lease_until TEXT NULL CHECK(lease_until IS NULL OR length(lease_until)>0),
  attempts INTEGER NOT NULL CHECK(attempts>=0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0),
  updated_at TEXT NOT NULL CHECK(length(updated_at)>0),
  version INTEGER NOT NULL CHECK(version>=1),
  tenant_id TEXT NULL CHECK(tenant_id IS NULL OR length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NULL CHECK(deployment_id IS NULL OR length(deployment_id) BETWEEN 3 AND 64),
  contract_version TEXT NOT NULL CHECK(contract_version IN ('legacy','b5-v1')),
  payload_sha256 TEXT NULL CHECK(payload_sha256 IS NULL OR length(payload_sha256)=64),
  correlation_id TEXT NULL CHECK(correlation_id IS NULL OR length(correlation_id)>0),
  required_capability TEXT NULL,
  active_job_run_id TEXT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  fence_version INTEGER NOT NULL CHECK(fence_version>=0),
  max_attempts INTEGER NOT NULL CHECK(max_attempts>=1),
  last_error_code TEXT NULL,
  CHECK((contract_version='legacy' AND tenant_id IS NULL AND deployment_id IS NULL AND payload_sha256 IS NULL AND correlation_id IS NULL AND required_capability IS NULL AND active_job_run_id IS NULL AND fence_version=0) OR contract_version='b5-v1')
) STRICT;
CREATE TABLE job_run(
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  job_id TEXT NOT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  started_at TEXT NOT NULL CHECK(length(started_at)>0),
  finished_at TEXT NULL CHECK(finished_at IS NULL OR length(finished_at)>0),
  outcome TEXT NULL CHECK(outcome IS NULL OR outcome IN ('succeeded','retry_scheduled','failed_terminal')),
  error_code TEXT NULL CHECK(error_code IS NULL OR error_code IN ('HANDLER_UNAVAILABLE','DEPENDENCY_UNAVAILABLE','LEASE_LOST','PAYLOAD_INVALID','HANDLER_FAILED')),
  tenant_id TEXT NULL CHECK(tenant_id IS NULL OR length(tenant_id) BETWEEN 3 AND 64),
  deployment_id TEXT NULL CHECK(deployment_id IS NULL OR length(deployment_id) BETWEEN 3 AND 64),
  contract_version TEXT NOT NULL CHECK(contract_version IN ('legacy','b5-v1')),
  kind TEXT NULL,
  required_capability TEXT NULL,
  service_actor_id TEXT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  service_actor_version INTEGER NULL CHECK(service_actor_version IS NULL OR service_actor_version>=1),
  service_actor_capabilities_json TEXT NULL CHECK(service_actor_capabilities_json IS NULL OR (json_valid(service_actor_capabilities_json) AND json_type(service_actor_capabilities_json)='array')),
  configured_binding_version INTEGER NULL CHECK(configured_binding_version IS NULL OR configured_binding_version>=1),
  correlation_id TEXT NULL CHECK(correlation_id IS NULL OR length(correlation_id)>0),
  payload_sha256 TEXT NULL CHECK(payload_sha256 IS NULL OR length(payload_sha256)=64),
  state TEXT NULL CHECK(state IS NULL OR state IN ('claimed','running','succeeded','failed','lease_expired')),
  fence_version INTEGER NULL CHECK(fence_version IS NULL OR fence_version>=1),
  fencing_token TEXT NULL CHECK(fencing_token IS NULL OR length(fencing_token)>0),
  lease_until TEXT NULL CHECK(lease_until IS NULL OR length(lease_until)>0),
  retry_run_after TEXT NULL CHECK(retry_run_after IS NULL OR length(retry_run_after)>0),
  CHECK((contract_version='legacy' AND tenant_id IS NULL AND deployment_id IS NULL AND kind IS NULL AND required_capability IS NULL AND service_actor_id IS NULL AND service_actor_version IS NULL AND service_actor_capabilities_json IS NULL AND configured_binding_version IS NULL AND correlation_id IS NULL AND payload_sha256 IS NULL AND state IS NULL AND fence_version IS NULL AND fencing_token IS NULL AND lease_until IS NULL AND retry_run_after IS NULL) OR contract_version='b5-v1')
) STRICT;
INSERT INTO job(id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,required_capability,active_job_run_id,fence_version,max_attempts,last_error_code)
SELECT id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version,NULL,NULL,'legacy',NULL,NULL,NULL,NULL,0,5,NULL FROM job_legacy_b5;
INSERT INTO job_run(id,job_id,started_at,finished_at,outcome,error_code,tenant_id,deployment_id,contract_version,kind,required_capability,service_actor_id,service_actor_version,service_actor_capabilities_json,configured_binding_version,correlation_id,payload_sha256,state,fence_version,fencing_token,lease_until,retry_run_after)
SELECT id,job_id,started_at,finished_at,outcome,error_code,NULL,NULL,'legacy',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM job_run_legacy_b5;
DROP TABLE job_run_legacy_b5;
DROP TABLE job_legacy_b5;
CREATE UNIQUE INDEX job_scoped_idempotency_uq ON job(tenant_id,deployment_id,idempotency_key) WHERE contract_version='b5-v1';
CREATE UNIQUE INDEX job_run_fencing_uq ON job_run(fencing_token) WHERE contract_version='b5-v1';
CREATE UNIQUE INDEX job_run_job_fence_uq ON job_run(job_id,fence_version) WHERE contract_version='b5-v1';
CREATE TRIGGER job_b5_insert_guard BEFORE INSERT ON job WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR
  NOT EXISTS(SELECT 1 FROM deployment_identity d WHERE d.tenant_id=NEW.tenant_id AND d.deployment_id=NEW.deployment_id) OR
  NEW.kind NOT IN ('invoice_pdf','period_close_report','auto_draft','accounting_pack_artifact_render','document_scan','outbox_deliver','alert_dispatch','email_send','backup_verify') OR
  NEW.state<>'queued' OR NEW.lease_until IS NOT NULL OR NEW.payload_sha256 IS NULL OR NEW.correlation_id IS NULL OR NEW.required_capability IS NULL OR
  NEW.attempts<>0 OR NEW.fence_version<>0 OR NEW.active_job_run_id IS NOT NULL OR NEW.last_error_code IS NOT NULL OR
  NOT ((NEW.kind='invoice_pdf' AND NEW.required_capability='artifact.invoice.render') OR
       (NEW.kind='period_close_report' AND NEW.required_capability='artifact.report.render') OR
       (NEW.kind='auto_draft' AND NEW.required_capability='billing.draft.generate') OR
       (NEW.kind='accounting_pack_artifact_render' AND NEW.required_capability='artifact.accounting_pack.render') OR
       (NEW.kind='document_scan' AND NEW.required_capability='document.scan') OR
       (NEW.kind='outbox_deliver' AND NEW.required_capability='outbox.deliver') OR
       (NEW.kind='alert_dispatch' AND NEW.required_capability='alert.dispatch') OR
       (NEW.kind='email_send' AND NEW.required_capability='email.send') OR
       (NEW.kind='backup_verify' AND NEW.required_capability='backup.verify'))
BEGIN SELECT RAISE(ABORT,'invalid b5 job'); END;
CREATE TRIGGER job_b5_update_guard BEFORE UPDATE ON job WHEN OLD.contract_version='b5-v1' AND (
  NEW.id<>OLD.id OR NEW.contract_version<>OLD.contract_version OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR NEW.kind<>OLD.kind OR
  NEW.idempotency_key<>OLD.idempotency_key OR NEW.payload_json<>OLD.payload_json OR NEW.payload_sha256<>OLD.payload_sha256 OR NEW.correlation_id<>OLD.correlation_id OR
  NEW.required_capability<>OLD.required_capability OR NEW.max_attempts<>OLD.max_attempts OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR
  NOT ((OLD.state='queued' AND NEW.state='claimed' AND NEW.active_job_run_id IS NOT NULL AND NEW.lease_until IS NOT NULL AND NEW.attempts=OLD.attempts+1 AND NEW.fence_version=OLD.fence_version+1) OR
       (OLD.state='claimed' AND NEW.state='claimed' AND NEW.active_job_run_id<>OLD.active_job_run_id AND NEW.lease_until IS NOT NULL AND NEW.attempts=OLD.attempts+1 AND NEW.fence_version=OLD.fence_version+1 AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='lease_expired' AND r.fence_version=OLD.fence_version)) OR
       (OLD.state='claimed' AND NEW.state='queued' AND NEW.active_job_run_id IS NULL AND NEW.lease_until IS NULL AND NEW.attempts=OLD.attempts AND NEW.fence_version=OLD.fence_version AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state IN ('failed','lease_expired') AND r.outcome='retry_scheduled')) OR
       (OLD.state='claimed' AND NEW.state='succeeded' AND NEW.active_job_run_id=OLD.active_job_run_id AND NEW.lease_until IS NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='succeeded' AND r.outcome='succeeded')) OR
       (OLD.state='claimed' AND NEW.state='dead_letter' AND NEW.active_job_run_id=OLD.active_job_run_id AND NEW.lease_until IS NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=OLD.active_job_run_id AND r.state='failed' AND r.outcome='failed_terminal'))) OR
  (NEW.active_job_run_id IS NOT NULL AND EXISTS(SELECT 1 FROM job_run r WHERE r.id=NEW.active_job_run_id AND (r.job_id<>NEW.id OR r.tenant_id<>NEW.tenant_id OR r.deployment_id<>NEW.deployment_id OR r.fence_version<>NEW.fence_version OR r.kind<>NEW.kind OR r.required_capability<>NEW.required_capability OR r.payload_sha256<>NEW.payload_sha256 OR r.correlation_id<>NEW.correlation_id OR (NEW.state='claimed' AND r.lease_until IS NOT NEW.lease_until)))))
BEGIN SELECT RAISE(ABORT,'invalid b5 job update'); END;
CREATE TRIGGER job_legacy_immutable BEFORE UPDATE ON job WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job quarantined'); END;
CREATE TRIGGER job_legacy_no_delete BEFORE DELETE ON job WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job retained'); END;
CREATE TRIGGER job_run_b5_insert_guard BEFORE INSERT ON job_run WHEN
  NEW.contract_version<>'b5-v1' OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR NEW.kind IS NULL OR NEW.required_capability IS NULL OR
  NEW.service_actor_id IS NULL OR NEW.service_actor_version IS NULL OR NEW.service_actor_capabilities_json IS NULL OR NEW.configured_binding_version IS NULL OR
  NEW.correlation_id IS NULL OR NEW.payload_sha256 IS NULL OR NEW.state<>'claimed' OR NEW.finished_at IS NOT NULL OR NEW.outcome IS NOT NULL OR NEW.error_code IS NOT NULL OR
  NEW.fence_version IS NULL OR NEW.fencing_token IS NULL OR NEW.lease_until IS NULL OR NEW.retry_run_after IS NOT NULL OR julianday(NEW.lease_until)<=julianday(NEW.started_at) OR
  NOT EXISTS(SELECT 1 FROM job j WHERE j.id=NEW.job_id AND j.contract_version='b5-v1' AND j.state='claimed' AND j.active_job_run_id=NEW.id AND j.tenant_id=NEW.tenant_id AND j.deployment_id=NEW.deployment_id AND j.kind=NEW.kind AND j.required_capability=NEW.required_capability AND j.payload_sha256=NEW.payload_sha256 AND j.correlation_id=NEW.correlation_id AND j.fence_version=NEW.fence_version AND j.lease_until=NEW.lease_until) OR
  NOT EXISTS(SELECT 1 FROM deployment_service_actor_binding b JOIN service_actor s ON s.id=b.service_actor_id WHERE b.singleton=1 AND b.tenant_id=NEW.tenant_id AND b.deployment_id=NEW.deployment_id AND b.service_actor_id=NEW.service_actor_id AND b.version=NEW.configured_binding_version AND s.status='active' AND s.version=NEW.service_actor_version AND s.capabilities_json=NEW.service_actor_capabilities_json AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=NEW.required_capability))
BEGIN SELECT RAISE(ABORT,'invalid b5 job run'); END;
CREATE TRIGGER job_run_b5_update_guard BEFORE UPDATE ON job_run WHEN OLD.contract_version='b5-v1' AND (
  NEW.id<>OLD.id OR NEW.contract_version<>OLD.contract_version OR NEW.job_id<>OLD.job_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.deployment_id<>OLD.deployment_id OR
  NEW.kind<>OLD.kind OR NEW.required_capability<>OLD.required_capability OR NEW.service_actor_id<>OLD.service_actor_id OR NEW.service_actor_version<>OLD.service_actor_version OR
  NEW.service_actor_capabilities_json<>OLD.service_actor_capabilities_json OR NEW.configured_binding_version<>OLD.configured_binding_version OR NEW.correlation_id<>OLD.correlation_id OR
  NEW.payload_sha256<>OLD.payload_sha256 OR NEW.fence_version<>OLD.fence_version OR NEW.fencing_token<>OLD.fencing_token OR NEW.started_at<>OLD.started_at OR NEW.lease_until<>OLD.lease_until OR
  NOT EXISTS(SELECT 1 FROM job j WHERE j.id=OLD.job_id AND j.contract_version='b5-v1' AND j.state='claimed' AND j.active_job_run_id=OLD.id AND j.fence_version=OLD.fence_version AND j.tenant_id=OLD.tenant_id AND j.deployment_id=OLD.deployment_id) OR
  NOT ((OLD.state='claimed' AND NEW.state='running' AND NEW.finished_at IS NULL AND NEW.outcome IS NULL AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
       (OLD.state IN ('claimed','running') AND NEW.state='lease_expired' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code='LEASE_LOST' AND NEW.retry_run_after IS NOT NULL) OR
       (OLD.state='running' AND NEW.state='succeeded' AND NEW.finished_at IS NOT NULL AND NEW.outcome='succeeded' AND NEW.error_code IS NULL AND NEW.retry_run_after IS NULL) OR
       (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='retry_scheduled' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NOT NULL) OR
       (OLD.state='running' AND NEW.state='failed' AND NEW.finished_at IS NOT NULL AND NEW.outcome='failed_terminal' AND NEW.error_code IS NOT NULL AND NEW.retry_run_after IS NULL)))
BEGIN SELECT RAISE(ABORT,'invalid b5 job run update'); END;
CREATE TRIGGER job_run_project_terminal AFTER UPDATE OF state ON job_run WHEN OLD.contract_version='b5-v1' AND NEW.state IN ('succeeded','failed','lease_expired')
BEGIN
  UPDATE job SET
    state=CASE WHEN NEW.outcome='succeeded' THEN 'succeeded' WHEN NEW.outcome='retry_scheduled' THEN 'queued' ELSE 'dead_letter' END,
    run_after=CASE WHEN NEW.outcome='retry_scheduled' THEN NEW.retry_run_after ELSE run_after END,
    lease_until=NULL,
    active_job_run_id=CASE WHEN NEW.outcome='retry_scheduled' THEN NULL ELSE active_job_run_id END,
    last_error_code=NEW.error_code,
    updated_at=NEW.finished_at,
    version=version+1
  WHERE id=NEW.job_id AND contract_version='b5-v1' AND state='claimed' AND active_job_run_id=NEW.id AND fence_version=NEW.fence_version;
  SELECT CASE WHEN changes()=1 THEN 1 ELSE RAISE(ABORT,'job/run reciprocal terminal projection failed') END;
END;
CREATE TRIGGER job_run_legacy_immutable BEFORE UPDATE ON job_run WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job run quarantined'); END;
CREATE TRIGGER job_run_legacy_no_delete BEFORE DELETE ON job_run WHEN OLD.contract_version='legacy'
BEGIN SELECT RAISE(ABORT,'legacy job run retained'); END;

CREATE TABLE audit_action_registry(
  contract_version TEXT NOT NULL CHECK(length(contract_version)>0),
  action TEXT NOT NULL CHECK(length(action)>0),
  entity_type TEXT NOT NULL CHECK(length(entity_type)>0),
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','service','system')),
  owner_packet TEXT NOT NULL CHECK(length(owner_packet)>0),
  data_classification TEXT NOT NULL CHECK(data_classification IN ('internal','confidential','restricted')),
  source_location_sha256 TEXT NULL CHECK(source_location_sha256 IS NULL OR length(source_location_sha256)=64),
  PRIMARY KEY(contract_version,action,entity_type,actor_kind)
) WITHOUT ROWID, STRICT;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification,source_location_sha256)
SELECT 'legacy-v1',action,entity_type,actor_kind,'legacy-inventory','internal',source_location_sha256
FROM temp.legacy_audit_registry_backfill;
INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES
  ('B5-R4','lifecycle.transition','client','user','WP-B5','confidential'),
  ('B5-R4','lifecycle.transition','project','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','time_entry','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','expense','user','WP-B5','restricted'),
  ('B5-R4','record.delete_draft','daily_report','user','WP-B5','confidential'),
  ('B5-R4','record.delete_draft','technical_report','user','WP-B5','confidential'),
  ('B5-R4','correction.create','time_entry','user','WP-B5','confidential'),
  ('B5-R4','correction.create','expense','user','WP-B5','restricted'),
  ('B5-R4','correction.create','daily_report','user','WP-B5','confidential'),
  ('B5-R4','correction.create','technical_report','user','WP-B5','confidential'),
  ('B5-R4','upload.reserve','upload_reservation','user','WP-B5','restricted'),
  ('B5-R4','upload.finalize','upload_reservation','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','document','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','invoice','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','period_report','user','WP-B5','restricted'),
  ('B5-R4','artifact.access','accounting_pack','user','WP-B5','restricted'),
  ('B5-R4','service_job.claim','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.start','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.succeed','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.fail','job_run','service','WP-B5','restricted'),
  ('B5-R4','service_job.expire','job_run','service','WP-B5','restricted');
CREATE TRIGGER audit_action_registry_no_update BEFORE UPDATE ON audit_action_registry BEGIN SELECT RAISE(ABORT,'audit registry immutable'); END;
CREATE TRIGGER audit_action_registry_no_delete BEFORE DELETE ON audit_action_registry BEGIN SELECT RAISE(ABORT,'audit registry immutable'); END;

ALTER TABLE audit_event ADD COLUMN audit_contract_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE audit_event ADD COLUMN actor_kind TEXT NULL;
ALTER TABLE audit_event ADD COLUMN service_actor_id TEXT NULL REFERENCES service_actor(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN service_capability TEXT NULL;
ALTER TABLE audit_event ADD COLUMN job_id TEXT NULL REFERENCES job(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN job_run_id TEXT NULL REFERENCES job_run(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE audit_event ADD COLUMN tenant_id TEXT NULL;
ALTER TABLE audit_event ADD COLUMN deployment_id TEXT NULL;
ALTER TABLE audit_event ADD COLUMN provenance TEXT NULL;
UPDATE audit_event SET actor_kind=CASE WHEN actor_id IS NULL THEN 'system' ELSE 'user' END, provenance='legacy_observed' WHERE audit_contract_version='legacy-v1';
CREATE TRIGGER audit_registered_insert_guard BEFORE INSERT ON audit_event WHEN
  NEW.audit_contract_version='legacy-v1' OR NEW.actor_kind NOT IN ('user','service','system') OR NEW.tenant_id IS NULL OR NEW.deployment_id IS NULL OR NEW.correlation_id IS NULL OR NEW.provenance<>'native' OR
  NOT EXISTS(SELECT 1 FROM audit_action_registry r WHERE r.contract_version=NEW.audit_contract_version AND r.action=NEW.action AND r.entity_type=NEW.entity_type AND r.actor_kind=NEW.actor_kind) OR
  (NEW.actor_kind='user' AND (NEW.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.actor_id) OR NEW.service_actor_id IS NOT NULL OR NEW.job_id IS NOT NULL OR NEW.job_run_id IS NOT NULL OR NEW.service_capability IS NOT NULL)) OR
  (NEW.actor_kind='system' AND (NEW.actor_id IS NOT NULL OR NEW.service_actor_id IS NOT NULL OR NEW.job_id IS NOT NULL OR NEW.job_run_id IS NOT NULL OR NEW.service_capability IS NOT NULL)) OR
  (NEW.actor_kind='service' AND (NEW.actor_id IS NOT NULL OR NEW.service_actor_id IS NULL OR NEW.job_id IS NULL OR NEW.job_run_id IS NULL OR NEW.service_capability IS NULL OR
    NEW.entity_type<>'job_run' OR NEW.entity_id<>NEW.job_run_id OR
    NOT EXISTS(SELECT 1 FROM job_run r JOIN job j ON j.id=r.job_id JOIN service_actor s ON s.id=r.service_actor_id JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id WHERE r.id=NEW.job_run_id AND r.job_id=NEW.job_id AND r.service_actor_id=NEW.service_actor_id AND r.required_capability=NEW.service_capability AND r.tenant_id=NEW.tenant_id AND r.deployment_id=NEW.deployment_id AND r.correlation_id=NEW.correlation_id AND r.contract_version='b5-v1' AND j.contract_version='b5-v1' AND b.tenant_id=r.tenant_id AND b.deployment_id=r.deployment_id AND b.version=r.configured_binding_version AND s.status='active' AND s.version=r.service_actor_version AND s.capabilities_json=r.service_actor_capabilities_json AND EXISTS(SELECT 1 FROM json_each(s.capabilities_json) c WHERE c.type='text' AND c.value=r.required_capability) AND ((NEW.action='service_job.claim' AND r.state='claimed') OR (NEW.action IN ('service_job.start','service_job.succeed','service_job.fail') AND r.state='running') OR (NEW.action='service_job.expire' AND r.state IN ('claimed','running'))) AND j.active_job_run_id=r.id AND j.fence_version=r.fence_version)))
BEGIN SELECT RAISE(ABORT,'invalid registered audit actor'); END;
CREATE UNIQUE INDEX audit_service_terminal_uq ON audit_event(job_run_id,action) WHERE actor_kind='service';
CREATE TRIGGER audit_service_terminal_guard BEFORE INSERT ON audit_event WHEN
  NEW.actor_kind='service' AND NEW.action IN ('service_job.succeed','service_job.fail') AND
  EXISTS(SELECT 1 FROM audit_event e WHERE e.job_run_id=NEW.job_run_id AND e.action IN ('service_job.succeed','service_job.fail'))
BEGIN SELECT RAISE(ABORT,'service job terminal audit already exists'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_event BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_event BEGIN SELECT RAISE(ABORT,'audit immutable'); END;

ALTER TABLE document ADD COLUMN artifact_classification TEXT NULL;
ALTER TABLE document ADD COLUMN classification_provenance TEXT NULL;
UPDATE document SET
  artifact_classification=CASE
    WHEN lower(COALESCE(artifact_type,'')) LIKE '%receipt%' THEN 'receipt'
    WHEN sensitive=1 OR sensitivity IN ('sensitive','customer_private') THEN 'confidential'
    ELSE 'standard' END,
  classification_provenance='migration_derived'
WHERE artifact_classification IS NULL;
CREATE TRIGGER document_classification_insert_guard BEFORE INSERT ON document WHEN
  NEW.artifact_classification IS NULL OR NEW.classification_provenance IS NULL OR
  NEW.artifact_classification NOT IN ('standard','receipt','finance','identity','hr','security','confidential') OR NEW.classification_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'document classification required'); END;
CREATE TRIGGER document_classification_update_guard BEFORE UPDATE OF artifact_classification,classification_provenance ON document WHEN
  OLD.state<>'temporary' OR NEW.version<>OLD.version+1 OR
  NEW.artifact_classification IS NULL OR NEW.classification_provenance IS NULL OR
  NEW.artifact_classification NOT IN ('standard','receipt','finance','identity','hr','security','confidential') OR NEW.classification_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'document classification immutable'); END;

ALTER TABLE technical_report ADD COLUMN report_date TEXT NULL;
ALTER TABLE technical_report ADD COLUMN report_date_provenance TEXT NULL;
UPDATE technical_report SET
  report_date=(SELECT b.report_date FROM temp.technical_report_date_backfill b WHERE b.report_id=technical_report.id),
  report_date_provenance='migration_derived'
WHERE report_date IS NULL;
CREATE TRIGGER technical_report_date_insert_guard BEFORE INSERT ON technical_report WHEN
  NEW.report_date IS NULL OR NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
  date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR NEW.report_date_provenance<>'native'
BEGIN SELECT RAISE(ABORT,'technical report date required'); END;
CREATE TRIGGER technical_report_date_update_guard BEFORE UPDATE OF report_date,report_date_provenance ON technical_report WHEN
  OLD.approval_state NOT IN ('draft','needs_changes') OR NEW.version<>OLD.version+1 OR NEW.report_date IS NULL OR
  NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR
  NOT ((NEW.report_date=OLD.report_date AND NEW.report_date_provenance=OLD.report_date_provenance) OR NEW.report_date_provenance='native')
BEGIN SELECT RAISE(ABORT,'technical report date immutable'); END;
CREATE TRIGGER technical_report_date_submit_guard BEFORE UPDATE OF approval_state ON technical_report WHEN
  NEW.approval_state NOT IN ('draft','needs_changes') AND
  (NEW.report_date IS NULL OR NEW.report_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.report_date) IS NULL OR date(NEW.report_date)<>NEW.report_date OR NEW.report_date<>OLD.report_date)
BEGIN SELECT RAISE(ABORT,'technical report date invalid at submit'); END;

CREATE TRIGGER offline_mutation_legacy_no_insert BEFORE INSERT ON offline_mutation BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER offline_mutation_legacy_no_update BEFORE UPDATE ON offline_mutation BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER offline_mutation_legacy_no_delete BEFORE DELETE ON offline_mutation BEGIN SELECT RAISE(ABORT,'legacy offline read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_insert BEFORE INSERT ON mutation_receipt BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_update BEFORE UPDATE ON mutation_receipt BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;
CREATE TRIGGER mutation_receipt_legacy_no_delete BEFORE DELETE ON mutation_receipt BEGIN SELECT RAISE(ABORT,'legacy receipt read only'); END;

```

Application create/edit/autosave/submit entrypoints owned by B5-I/B5-U use one strict Gregorian
`YYYY-MM-DD` parser (four-digit year, real month/day including leap-year rules, byte-for-byte round trip)
and always write/revalidate `technical_report.report_date`. It may change only while the persisted
approval state is `draft|needs_changes`; submit revalidates and freezes the unchanged date in the same
guarded transaction. SQL's `date(value)=value` check independently rejects impossible calendar dates.
The TEMP backfill count/date/timezone proof is part of the executable migration acceptance. No date is
inferred or guessed at runtime.

The legacy global-key `offline_mutation` and `mutation_receipt` tables are retained, never dropped or
repurposed. Static SQL copies each legacy row into the scoped table using the one TEMP tenant and a
deterministic new row ID derived without changing the legacy mutation ID. Duplicate legacy
`(user,mutation)` rows are impossible under the old PK; copied counts must match exactly. Runtime reads
scoped first. For a copied legacy request, it returns the stored result only for the same tenant+user;
another tenant/user with the same mutation ID is independent and receives no existence disclosure.
Same-scope identical replay returns stored result; same key with a different canonical payload hash is
`IDEMPOTENCY_CONFLICT` with zero mutation. New writes use scoped tables only. Exact
`BEFORE INSERT/UPDATE/DELETE` triggers abort writes to each legacy offline table after migration, and
runtime repositories contain no legacy write statement. Legacy tables remain compatibility evidence,
not a collision oracle. Every scoped runtime open preflights the persistent deployment identity.

Existing archived clients/projects receive a `migration_observed` lifecycle event with null
`from_state`; no prior state is invented. No record is labeled a correction and no service actor is
created. Audit backfill does not invent service provenance.

### 5.3 Migration acceptance and rollback

`tests/integration/lifecycle-security-migration.test.ts` exclusively proves: fresh DB; populated 0018+
copy; valid tenant; missing tenant; leading/trailing whitespace; malformed tenant; ambiguous preexisting
tenant; direct static SQL without TEMP context; injected failure before BEGIN, after context, mid-SQL,
after postflight, after metadata, after `schema_migration(19,applied_at)`, during COMMIT and during
rollback; every failure leaves no 0019 metadata/schema row or partial DDL/data; exact copied legacy
counts and canonical payload/result hashes; zero null tenant/deployment in new scoped tables; singleton
identity anchor and mismatch refusal; technical-report date derivation/provenance; composite uniqueness;
same mutation ID across tenants/users; same-scope replay and collision; append-only lifecycle/
correction/audit/legacy-offline guards; actor insert guards; foreign keys/integrity; and unchanged row
counts plus **column-projected canonical hashes** over the original ordered columns of every client,
project, time, expense, report, document, invoice, payment and audit table. Tables receiving additive
columns are never compared by an impossible complete-row digest. Copied legacy payload/result blobs are
hashed canonically and compared row-by-row.

It also executes direct-SQL positive/negative matrices for every `STRICT` type, explicit nullability,
closed CHECK/trigger registry, FK/RESTRICT, unique key, append-only/retention transition and tenant/
deployment anchor above. Job evidence covers kind→capability mapping, canonical payload collision,
`b5-v1`-only candidate/dispatch, legacy quarantine, removal of global job-idempotency uniqueness,
tenant/deployment-scoped collision, reciprocal active-run tenant/deployment/job/fence/state/lease,
missing deferred run at commit, mismatched existing run, claim/lease/fence/reclaim, stale completion,
one-shot handler/audit, configured-actor replacement, capability snapshot/current membership,
disable/revoke-after-claim, terminal replay and no human principal. Every case executes direct SQL and
the repository surface using `tests/fixtures/b5-durable-job-fixture.ts`. Technical-report evidence covers populated timezone backfill and
all B5-I/B5-U create/edit/autosave/submit entrypoints. Any SQL statement in section 5.2 that does not run
unchanged on fresh and copied 0018+ fixtures blocks contract approval.

Rollback is application rollback with new tables/columns and legacy tables retained. No down migration
drops lifecycle, correction, reservation, actor, audit, offline, document, or finance history. Failed
migration/context validation leaves `schema_migration` and every persistent table unchanged. The test
compares the copied database file before/after failure, excluding SQLite journal/WAL mechanics.

Legacy projection preservation uses the R6.2-approved B2-MH CANON-V1 encoder verbatim: NULL tag `00`;
INTEGER tag `01` plus signed int64 big-endian; TEXT tag `02` plus u64 big-endian byte length and strict
round-tripping UTF-8; BLOB tag `03` plus u64 length and raw bytes; no REAL/coercion/normalization. Each
table is a CANON-V1 sequence ordered by `id COLLATE BINARY` and records fields in the exact 0018
`PRAGMA table_xinfo.cid` order below (payment/audit/job IDs are their same TEXT primary keys):

| Table              | Frozen original projection columns, in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`           | `id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at,version,billing_email,payment_terms_days,notes`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `project`          | `id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at,version,description,site_name,country,project_manager_id,expected_minutes_per_day,client_daily_minimum_minutes,revenue_budget_minor,po_cap_minor,labor_budget_minutes,travel_budget_minor,po_number,daily_report_required,technical_reporting_required,budget_minor,planned_minutes,project_alias,start_date,planned_end_date,actual_end_date,contract_number,budget_type,other_cost_budget_minor,weekly_close_enabled,notes,expected_schedule_id,fixed_price_minor` |
| `time_entry`       | `id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,invoice_id,created_at,updated_at,version,project_timezone,activity_summary,submitted_at,approved_by,approved_at,finance_approved_by,finance_approved_at,start_time,end_time,activity_code,break_minutes,site,billable_minutes,client_rate_minor,compensation_amount_minor,internal_cost_minor,billing_status,locked_at,locked_by,billing_lock_id`                                                                                                                              |
| `expense`          | `id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,approval_state,invoice_id,created_at,updated_at,version,vendor,description,who_paid,receipt_document_id,receipt_required,reimbursement_state,submitted_at,approved_by,approved_at,finance_approved_by,finance_approved_at,tax_amount_minor,payment_method,markup_bps,project_currency_amount_minor,billing_treatment,billing_state,billing_amount_minor,billing_lock_id,reimbursement_amount_minor,reimbursed_at,reimbursement_reference,fx_rate_bps`                             |
| `daily_report`     | `id,project_id,worker_id,work_date,summary,safety_notes,approval_state,created_at,updated_at,version,site_shift,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,reviewed_by,reviewed_at`                                                                                                                                                                                                                                                       |
| `technical_report` | `id,project_id,author_id,system_name,controller,change_summary,safety_related,validation,rollback_plan,approval_state,created_at,updated_at,version,plant_site,area_line,station_machine,system_type,plc_platform,hmi_scada,robot_platform,drive_motion,network_protocol,software_version,program_reference,production_impact,validation_result,open_risk,reviewed_by,reviewed_at`                                                                                                                                                                                  |
| `document`         | `id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,created_at,updated_at,version,original_filename,description,sensitive,artifact_type,software_version,supersedes_id,approved_at,approved_by,sensitivity,safe_filename,scan_status,scanned_at,scan_provider,artifact_metadata_json`                                                                                                                                                                                                                                                           |
| `invoice`          | `id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,issued_at,snapshot_json,created_at,updated_at,version,billing_rule_id,period_start,period_end,due_at,calculation_hash,sent_at,pdf_status,pdf_storage_key,pdf_sha256,pdf_generated_at,source_lock_at,voided_at,pdf_byte_length`                                                                                                                                                                                                                                        |
| `payment`          | `id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `audit_event`      | `id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,before_json,after_json,reason,correlation_id,metadata_json`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `job`              | `id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `job_run`          | `id,job_id,started_at,finished_at,outcome,error_code`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

`tests/fixtures/b5-migration-legacy-fixture.sql` must contain at least one non-null and one nullable
case for every SQLite storage class used by each projection. Before the migration SQL may be written,
B5-M records that fixture's literal SHA-256, expected row count and literal lowercase 64-hex CANON-V1
digest for all twelve tables in the reviewed migration descriptor. The parent records the descriptor
file SHA-256. Runtime regeneration, implementation-derived expected values, placeholders, formulas in
place of hex, or updating an expectation after seeing the migration output are forbidden. An
independent migration reviewer recomputes every digest with a second encoder; preflight and postflight
must equal the same checked-in values and the live copied-DB before/after projections.

## 6. Dependency DAG and ownership

```text
B5-T-RED
   |
   +--> R6.2 APPROVED -> B2-MH runner/index/CANON release -> B5-M 0019 -> B5-MC schema export
   |                                                                  |
   |                  B2-MF 0020 -> B2-MC/Core -> B3-M 0021 -> B4-M 0022
   |                                                                  |
   +------------------------------------------> B5-L + B5-A + B5-S    |
   |                                                                  |
   +--> literal approved B2/B3/B4 producer handoff ---> B5-F -> finance review APPROVED
                                                                        |
   B5-M/L/A/S + B2/B3/B4 reviews APPROVED ------------------------------+--> B5-I
   |                                                |
   +--> wait B3/B4 artifact metadata release ----> B5-D (private downloads)
   +--> A5-N + A5-P verdict/hash releases
   |             +--> A5-S after N+P
   |             +--> A5-D after P
   |                    +--> final A5-T + mobile/desktop approvals -> B5-U
   |                                                |
   +--> B10 handoff: auth/MFA/bootstrap/offline/SW/autosave/dirty client helpers -> B10 APPROVED
                                                                                         |
                                                                                         +--> B11 full deployment/health/jobs -> B11 APPROVED
                                                     |
                                                B5-T-GREEN
                                                    |
                          independent Security + Spec reviewers
                                                     |
                                  fixes -> retest -> B5 candidate complete
                                                     |
                       all mandatory packets complete/reviewed -> T1 steps 1-42 + five reviews
                                                     |
                                  only then DoD-dependent RTM PASS by parent
```

No implementer self-certifies. No two writers edit `repository.ts`, `v3-repository.ts`, `schema.ts`,
`PortalShell.svelte`, `hooks.server.ts`, a migration, or an existing test at the same time. Paths are
exclusive and disjoint by the table below; a lease is released only after implementer handoff, narrow
tests, independent named module review, remediation, and retest.

| Lease          | Exclusive path set                                                                                                 | Sequential release / forbidden overlap                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| B5-T-RED/GREEN | only files enumerated in those subsections                                                                         | test writer never owns production/migration/RTM; RED releases before product; GREEN opens after all product/external handoffs |
| B5-M           | 0019 SQL+descriptor+legacy fixture, five existing schema modules, new lifecycle schema and migration test          | after approved R6.2+B2-MH; prerequisite to B2-MF/B3-M/B4-M; B5 alone owns job/run transitions                                 |
| B5-MC          | export-only `packages/database/src/schema.ts`                                                                      | after B5-M; releases to sequential B2-MC→B3-MC→B4-MC; never owns `index.ts`                                                   |
| B5-L           | four lifecycle modules listed below                                                                                | no façade; releases modules after lifecycle review                                                                            |
| B5-A           | four workforce/planning/time modules listed below                                                                  | no façade/report/expense; releases after temporal/privacy review                                                              |
| B5-S           | six security/upload/job-execution/registry modules listed below                                                    | no route/hook/public runner export; releases after security review                                                            |
| B5-F           | no lease while B2 BLOCKED; later only `financial-mutation-guard.ts`                                                | literal approved versioned B2/B3/B4 handoff first; independent finance approval before B5-I                                   |
| B5-I-1..4      | exactly one numbered façade/domain/schema lease at a time                                                          | each lease handoff/review/retest before the next; never edits a released leaf module or B2-MH `index.ts`                      |
| B5-U           | exact actions/load/detail/upload/components in its subsection; final registry lease limited to named B5 keys       | final A5-T mobile/desktop + B2/B3/B4/B10 releases; no access/billing/report-page ownership; PortalShell last                  |
| B5-D           | helper plus four released artifact routes                                                                          | B3/B4 release each route separately; never edits repository/reporting/finance                                                 |
| B10 external   | auth, MFA, bootstrap-owner, step-up, hooks, portal offline/sync, service worker, autosave and dirty client helpers | owns none of the B5 paths above; consumes B5-I/B5-S interfaces only                                                           |
| B11 external   | all `deployment/**`, readiness export/module, three health routes, operations-health pages, manifest route         | begins only after B10 approval; consumes high-level runner; full ops/security/finance/desktop/mobile/integration reviews      |
| T1 external    | four exact Definition-of-Done files in its subsection                                                              | after every mandatory packet; B5 never writes them; DoD-dependent PASS waits for five independent approvals                   |

If a discovered fix crosses a row, the current writer stops and returns an exact interface request. The
parent releases the current lease before assigning the target row; no informal “small edit” exception
exists for hot files.

### B5-T-RED — regression evidence (A → Luna/max test worker)

Owned paths only:

- `tests/integration/lifecycle-security.test.ts` (new)
- `tests/security/upload-boundary.test.ts` (new)
- `tests/security/http-hardening.test.ts` (new)
- `tests/offline/user-tenant-partition.test.ts` (new)
- `apps/portal/src/lib/portal/report-autosave.test.ts` (new)
- `apps/portal/src/lib/portal/dirty-form-guard.test.ts` (new)
- `tests/security/private-download.test.ts` (new)
- `tests/security/audit-immutability.test.ts` (new)
- `tests/integration/effective-membership.test.ts` (new)
- `tests/e2e/lifecycle-security-b5.spec.ts` (new)
- `tests/e2e/offline-autosave-b5.spec.ts` (new)
- `tests/fixtures/b5-lifecycle-security-fixture.ts` (new; B5-only lifecycle/upload/audit helper)
- `tests/fixtures/b5-durable-job-fixture.ts` (new; B5-T-RED exclusive owner for configured
  `service_actor`, binding, `job`, `job_run`, lease/fence/snapshot rows and no finance entities)
- `tests/security/b5-route-boundaries.test.ts` (new)
- `tests/integration/durable-job-security.test.ts` (new)

Forbidden: all production code, migrations, existing tests, RTM. Write behavioral RED tests first;
prove failures are the listed defects rather than fixture/selector failures.

The B5 fixture contains only non-financial tenant/users/projects/drafts/uploads/audit expectations and
cannot construct an invoice/source lock. After B2 publishes and releases its approved versioned
producer interface, **B2 alone** owns new `tests/fixtures/invoice-lifecycle-fixture.ts` and its finance
truth; B5 tests may import its released public builder but never edit, reinterpret or duplicate it.

### B5-M — schema/migration (A → Luna/max migration worker)

Dependency: binding Sol/high R6.2 and B2-MH runner/CANON/descriptors/lock are independently approved
and released. B5-M precedes and is a prerequisite of B2-MF/B3-M/B4-M; it does not wait for their
migrations or claim their finance/reporting schema. Owned paths are exactly section 5: 0019 and its descriptor manifest,
`tests/fixtures/b5-migration-legacy-fixture.sql` (new deterministic populated 0018 fixture),
`lifecycle-security.ts`, `offline.ts`, `audit.ts`, `jobs.ts`, `documents.ts`, `technical.ts`, and the one migration test. Forbidden: repositories, portal, finance
schema, other migrations. Implement only the frozen DDL/Drizzle declarations, backfill, append-only
triggers, and fresh/representative migration tests; release all six schema paths before B5-MC.

### B5-MC — migration context/export integration (B → Sol/medium, sequential)

Dependency: B2-MH runner/index work and B5-M SQL/Drizzle are independently reviewed. Owned only one
export-only `packages/database/src/schema.ts` lease, then release it to B2-MC → B3-MC → B4-MC.
Forbidden: `packages/database/src/index.ts` (sole B2-MH ownership), migration SQL, other schema modules,
repositories, portal and tests. B2-MH consumes the released B5 descriptor/TEMP-context contract and
later adds only reviewed B5/B11 public exports; B5 never edits the runner.

### B5-L — lifecycle and record policy modules (A → Luna/max backend leaf)

Owned:

- `packages/database/src/domains/clients/client-repository.ts`
- `packages/database/src/domains/projects/project-repository.ts` (new)
- `packages/database/src/domains/lifecycle/lifecycle-policy.ts` (new)
- `packages/database/src/domains/records/record-lifecycle-repository.ts` (new)

Forbidden: façade files, schema/migrations, finance/billing/invoice/accounting domains, portal, tests.
Implement section 2.1–2.4 against injected DB/audit/transaction dependencies. Do not wire façades.
On completion B5-L releases `record-lifecycle-repository.ts`; B5-I may import/wire it but may not edit
it. A concrete integration defect returns an exact fix request and lease to B5-L before B5-I resumes.

### B5-A — effective assignment and approval concurrency (A → Luna/max backend leaf)

Owned:

- `packages/database/src/domains/workforce/workforce-repository.ts`
- `packages/database/src/domains/planning/planning-repository.ts`
- `packages/database/src/domains/time/time-entry-repository.ts`
- `packages/database/src/domains/workforce/effective-membership.ts` (new)

Forbidden: façades, schema/migrations, finance fields/meaning, portal, tests. Implement strict date/time
parsing, effective scopes, PM DTO, work-date timezone revalidation, guarded approvals, and retry-local
event payloads. Any required expense/report façade change is handed to B5-I, not edited here.

Approval concurrency is frozen without a public API change: operational approval methods retain their
existing signatures. They run in the repository's server-side `BEGIN IMMEDIATE` transaction, read the
submitted row, authorize effective project review, then use a guarded
`UPDATE ... WHERE id=? AND approval_state='submitted'` before one approval/audit/notification event.
The second concurrent caller observes/updates zero rows, returns `409 INVALID_LIFECYCLE_STATE`, and
writes no events. Finance approval semantics/methods are excluded and remain B2-owned.

### B5-S — security primitives and upload reservation (A → Luna/max backend leaf)

Owned:

- `packages/database/src/core/authorization.ts`
- `packages/database/src/core/audit.ts`
- `packages/database/src/core/audit-registry.ts` (new; versioned shared registry and reviewed legacy inventory)
- `packages/database/src/core/storage-key.ts`
- `packages/database/src/domains/documents/upload-repository.ts` (new)
- `packages/database/src/domains/jobs/authorized-job-execution.ts` (new; high-level composition only)

Forbidden: repository façades, schema/migrations, portal routes/hooks, reporting/finance, tests. Implement
clock-injected session step-up, explicit service capabilities, canonical storage keys, reservation/
finalization, scanner transition, and recursive key/value redaction.

### B5-F — finance-boundary read adapter (B → Sol/medium finance owner)

Current state: **no lease** because B2 is BLOCKED and has no approved producer export/version. Only after
B2 approval, literal producer handoff incorporation/re-review, and B3/B4 final-report/approval extensions
may the parent grant this sole path:

- `packages/database/src/domains/finance-boundary/financial-mutation-guard.ts` (new)

Forbidden: direct finance SQL, aliases for an unapproved producer, mutations, finance calculations/state
transitions, façades, schema/migrations, portal, tests. Implement only the approved version adapter on
the caller's transaction connection. B5-I wires it after independent finance-integrity approval.

### B5-I — backend integration, strictly sequential leases (B → Sol/medium backend domain)

Dependency: B2 approved/released; B5-M/L/A/S each independently approved; and B5-F independently
finance-approved. The parent records all six verdicts before granting these leases one at a time:

1. `packages/database/src/repository.ts` plus extraction of remaining report/expense lifecycle code to
   `packages/database/src/domains/records/record-lifecycle-repository.ts`.
2. `packages/database/src/v3-repository.ts` plus new
   `packages/database/src/domains/offline/offline-repository.ts`.
3. `packages/domain/src/index.ts` only for additive lifecycle/offline value types; no service-identity
   type, predicate, factory, or structural discriminator is exported.
4. `packages/schemas/src/index.ts` for exact lifecycle/upload/offline schemas.

`packages/database/src/index.ts` is never a B5-I lease. After B5-S/I interfaces are independently
approved, the sole B2-MH owner adds only the frozen public `runDueConfiguredDurableJobs(limit)` and
domain/autosave re-exports. It never exports the private claimed-run executor, readiness context,
service factory/context, handler/callback, actor/capability selector, tenant or correlation override.

Forbidden throughout: finance semantic changes, schema/migrations, portal UI/routes, tests. Preserve
the public API inventory except the explicitly additive methods; produce before/after signatures and
route all unexpected differences back to the parent. Repository writes must be transactionally atomic.

### B10 handoff — auth/offline/client security integration (external blocking dependency)

B5 owns only the database/domain high-level operation in B5-S/I. The following are exclusively B10
paths and are never leased by B5:

- `apps/portal/src/hooks.server.ts`
- `apps/portal/src/lib/server/auth.ts`
- `apps/portal/src/lib/server/actions/access-actions.ts`
- `apps/portal/src/cli/bootstrap-owner.ts`
- `apps/portal/src/routes/app/api/step-up/+server.ts`
- `apps/portal/src/routes/app/api/security/mfa/+server.ts`
- `apps/portal/src/lib/offline.ts`
- `apps/portal/src/lib/portal/offline-controller.ts`
- `apps/portal/src/routes/app/api/sync/+server.ts`
- `apps/portal/src/routes/app/api/offline/identity/+server.ts` (new)
- `apps/portal/src/routes/app/api/offline/identity/verify/+server.ts` (new)
- `apps/portal/src/routes/app/service-worker.js/+server.ts`
- `apps/portal/src/lib/portal/report-autosave.ts` (new)
- `apps/portal/src/lib/portal/dirty-form-guard.ts` (new)
- `apps/portal/src/lib/portal/offline-controller.test.ts` (existing; B10-permitted test)
- root `.env.example`, limited to B10 auth/offline keyring/scope entries

The parent opens B10 only after B5-S/I interfaces are reviewed. B10 implements central audit usage,
identity-envelope issuance/verification, partition/cache activation, autosave/dirty UI helpers, auth/
MFA/bootstrap and step-up without receiving a service execution context. It gets its own independent
Security plus offline/privacy review. B5-T-GREEN cannot pass those contract rows until the B10 evidence
is integrated.

### B5-U — authenticated server/API and lifecycle UI (A → Luna/max CRUD/UI worker)

Dependencies: B5-I integrated and the parent has recorded exact verdict+file SHA-256 for each formal
A5 release against current A5 contract SHA-256
`F114C70F8A66F9334B6938C1FBF17AAC210E56BB9ABAB085B461C4E34C3C2A99`: A5-N and A5-P first; A5-S only
after both; A5-D only after A5-P; then final A5-T only after A5-S+A5-D, followed by independent
`mobile_qa` and `desktop_qa` approvals. **No B5-T product-dependent completion, B5-U, PortalShell,
report-page/server or selector integration lease opens before that final A5-T/QA release.** Current A5
is only contract-READY and has no such parent verdict/hash releases, so B5-U is not open. A5-D retains exclusive
ownership of `apps/portal/src/routes/app/reports/[id]/+page.svelte` and implements the frozen autosave/
dirty/recovery selectors and action target from section 2.6 during its own lease; B5-U never claims or
edits that page. After those gates, B5-U owns exactly:

- `apps/portal/src/lib/server/actions/project-actions.ts`
- `apps/portal/src/lib/server/actions/time-actions.ts`
- `apps/portal/src/lib/server/actions/expense-actions.ts`
- `apps/portal/src/lib/server/actions/document-actions.ts`
- `apps/portal/src/lib/server/actions/approval-actions.ts`
- `apps/portal/src/lib/server/actions/operations-actions.ts`, only after B3's first sequential lease
  removes every direct job runner and releases the file
- `apps/portal/src/lib/server/portal-repository.ts`
- `apps/portal/src/routes/app/[section]/section-load.ts`
- `apps/portal/src/routes/app/projects/[id]/+page.server.ts`
- `apps/portal/src/routes/app/projects/[id]/+page.svelte`
- `apps/portal/src/routes/app/reports/[id]/+page.server.ts`
- `apps/portal/src/routes/app/time/[id]/+page.server.ts`
- `apps/portal/src/routes/app/time/[id]/+page.svelte`
- `apps/portal/src/routes/app/expenses/[id]/+page.server.ts`
- `apps/portal/src/routes/app/expenses/[id]/+page.svelte`
- `apps/portal/src/routes/app/api/sync/attachment/+server.ts`
- `apps/portal/src/lib/components/LifecycleActions.svelte` (new)
- `apps/portal/src/lib/components/DraftDangerZone.svelte` (new)
- one final parent-scheduled `apps/portal/src/lib/PortalShell.svelte` integration lease only after
  A5-S release, limited to importing/rendering the two components with no inline form/CSS growth

`apps/portal/src/lib/server/actions/access-actions.ts` is exclusively B10-owned for Offboard/auth;
`billing-actions.ts` is exclusively B2/B3/B4-owned for Void, Accounting Pack and every finance/job
caller. B5-U may not edit either file. B3 first owns `operations-actions.ts` only to replace direct
`runArtifactJobs`/period refresh execution with enqueue/status behavior, then independently reviews and
releases it; B5-U subsequently owns report lifecycle/autosave/operational-review actions but cannot
reintroduce job execution.

`apps/portal/src/routes/app/[section]/section-actions.ts` is not blanket B5 ownership. After B2/B3/B4/
B10 have independently reviewed and released their registry keys, the parent may grant B5-U one final
sequential registry-only lease limited to these exact mappings: `createDailyReport`,
`createTechnicalReport`, `autosaveReport`, `submitReport`, `reviewReport`, `createTime`, `updateTime`,
`submitTime`, `createExpense`, `submitExpense`, `uploadPrivateDocument`, `approveRecord`,
`updateClient`, `transitionClient`, `updateProject`, `transitionProject`, `deleteDraft`, and
`createCorrectionDraft`. No import or mapping owned by another packet changes in that lease.

Report action compatibility is exact. A5-D retains the existing report-page form action
`?/deleteReport` in `reports/[id]/+page.svelte` and adds
`[data-draft-danger-zone][data-record-type][data-record-id]` plus hidden strict `id,type,version,requestId`;
B5-U owns the existing `deleteReport` action in that page's `+page.server.ts`, maps
`type='daily'|'technical'` to `recordType='daily_report'|'technical_report'`, and calls only B5-I
`deleteDraft`. It no longer calls legacy repository `deleteReport`. The future section-list control is
`[data-action='deleteDraft'][data-record-type][data-record-id]` and posts to the final registry key
`deleteDraft`; both entrypoints share the same strict schema, policy, result/error shape and dedicated
tests. No `deleteReport` registry alias is added. Autosave remains the absolute CSRF-protected
`POST /j-aautomation/app/reports?/autosaveReport` mapping to
`reportActions.autosaveReport` in `operations-actions.ts`; the A5-D page uses only the six frozen
`data-report-autosave-form`/status/recovery selectors from section 2.6 and does not create a page-local
autosave action.

Forbidden: DB/schema/migrations, offline/service-worker/auth/access/billing files, A5-D report page,
period-report/finance UI, CSS hot files, and direct/manual durable-job execution. Implement exact action
contracts, authorize/reserve before bytes, report-date create/edit/submit wiring, danger actions,
accessibility, and UUID-bound lifecycle/autosave/upload selectors.

### B11 handoff — readiness/health/PWA/jobs (external blocking dependency)

WP-B11 is hard-blocked until WP-B10 is integrated, independently Security/offline/privacy APPROVED and
its auth/PWA interfaces released; it also retains the initial-plan dependencies on B3 durable artifacts,
A7 public/base-path completion and all migrations. B11 owns the entire `deployment/**` tree, without
carving out
jobs, email, backup/restore, alert, outbox or logging helpers to another packet. Its exact additional
application paths are:

- `packages/database/src/readiness.ts`; its final additive export is an exact handoff request to the
  sole B2-MH `packages/database/src/index.ts` owner, never a B11 lease
- `apps/portal/src/routes/health/live/+server.ts`
- `apps/portal/src/routes/health/ready/+server.ts`
- `apps/portal/src/routes/app/api/health/+server.ts`
- `deployment/scripts/jobs-run.mjs`
- `apps/portal/src/routes/app/manifest.webmanifest/+server.ts`
- `apps/portal/src/routes/app/operations/health/+page.server.ts` (new)
- `apps/portal/src/routes/app/operations/health/+page.svelte` (new)

This includes every existing/future `deployment/scripts/**` executor for job claim/run, email delivery,
backup, restore, alerts, outbox delivery and sanitized operational logging; service/timer/container/Caddy
configuration; `deployment/*env.example`; backup/restore drills; and `deployment/README_VPS.md` plus
`deployment/VPS_CODING_AGENT_HANDOFF.md` runbook sections. B10 owns the service-worker route and root
`.env.example` offline-HMAC documentation; B11 owns deployment key injection/rotation, file permissions,
health/alert/log redaction and restore operations. A6 later audits consolidated documentation.

B11 consumes sections 3.1.1 and 3.4–3.5 and calls only `runDueConfiguredDurableJobs(limit)` after
B5-S/B5-I release their database interfaces and B2-MH publishes the exact re-export; it cannot supply tenant/actor/capability/correlation/
handler or reopen migration identity/repository semantics. The operations-health page is session- and
role-protected to Owner/Auditor, keyboard/readable at all eight viewports, and renders all ten dimensions
including email and backup without secrets/paths. B11 requires independent `security_reviewer`,
`finance_integrity_reviewer`, `desktop_qa`, `mobile_qa`, and final `integration_reviewer` evidence for
jobs/readiness/email/backup/restore/alerts/outbox/logging. B5 acceptance remains blocked until attached.

### T1 handoff — uninterrupted Definition-of-Done evidence (external blocking dependency)

WP-T1 starts only after B2/B3/B4/B5/B6/B7/B8/B9/B10/B11 and A5/A7 are implemented, independently
reviewed and released. T1 exclusively owns exactly:

- `tests/e2e/definition-of-done.spec.ts`
- `tests/e2e/dod-fixtures.ts`
- `tests/integration/definition-of-done-reconciliation.test.ts`
- `tests/ops/definition-of-done-restore.test.ts`

B5 and its reviewers never edit those paths. T1 consumes released B5 selectors/interfaces/fixtures and
proves section-77 steps 1–42 uninterrupted with ordinary automatic job processing, Worker/PM/Finance/
Owner privacy, exact finance reconciliation, duplicate rejection, artifacts and backup/restore. It is
independently reviewed by Finance, Security, desktop QA, mobile QA and Spec. No B5 requirement or RTM
row that depends on an end-to-end DoD step may become `PASS`, and no production-completion claim may be
made, before T1 is green and all five reviewers approve.

### B5-D — private download integration (A → Luna/max backend leaf)

Dependencies: B5-S/I; B3 releases Accounting Pack metadata/route; B4 releases invoice/report metadata.
Owned:

- `apps/portal/src/lib/server/private-download.ts` (new)
- `apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server.ts`
- `apps/portal/src/routes/app/api/invoices/[id]/pdf/+server.ts`
- `apps/portal/src/routes/app/api/reports/[id]/pdf/+server.ts`
- `apps/portal/src/routes/app/api/documents/[id]/+server.ts` (new)

Forbidden: repositories/reporting/finance/schema/migrations, other routes, tests. Implement section 4.3
only. If B3/B4 still own a route, B5-D remains blocked; it never races or copies the route elsewhere.

### B5-T-GREEN — test completion (A → original or new Luna/max test worker)

After production leaves paths and B10/B11 return required integration evidence, the test worker may
edit only the fourteen B5-T-RED files plus:

- `tests/e2e/artifact-lifecycle.spec.ts`
- `tests/offline/cross-user-isolation.test.ts`
- `tests/security/session-step-up.test.ts`
- `tests/security/audit-redaction.test.ts`
- `tests/integration/lifecycle-security-migration.test.ts` remains B5-M-owned and is explicitly
  forbidden to B5-T-GREEN.

It may not weaken intentional product assertions or touch production. Convert RED evidence to exact
green lifecycle/security/offline/autosave behavior and add concurrency/negative-path coverage.

## 7. RED-first test matrix and acceptance commands

### 7.1 Mandatory tests

Lifecycle:

- edit client/project with correct version; stale version has zero side effects;
- archive/restore returns exact prior state; legacy unknown restore target blocks;
- restore/reopen are distinct and guarded; close client blocks on any non-closed child; begin-close
  creates/refreshes the exact closeout, wrong-project/wrong-ID/non-final/stale closeout rejects, and
  close succeeds only with the exact finalized closeout;
- client currency changes only with zero projects; project currency changes only with no child/
  financial history and a green finance guard; conditional fields/roles reject all forbidden patches;
- archived/closed entities reject new operational children but remain readable to authorized history;
- creator deletes only never-submitted draft; submitted/needs-changes/approved/linked/locked/invoiced
  rows reject; audit retains redacted before state;
- correction creates a new draft/link and preserves original bytes/fields/version;
- identical correction request replay returns one draft/link; payload-changing replay conflicts;
- each finance-boundary adapter blocker prevents the lifecycle/correction mutation without exposing
  amounts or changing the finance row;
- two concurrent approvals/transitions yield one event and one conflict.

Assignments/privacy:

- future/expired membership absent from principal/current lists and cannot create/edit/sync;
- time date edit outside membership rejects and timezone changes with valid new date;
- malformed/ambiguous planning timestamps reject; complete planning interval must fit membership;
- PM list contains only effectively co-assigned workers and never email/pay/cost/rate/margin fields.
- PM search, contacts, skills, availability, project overview and review queue obey the same effective
  scope and exact DTO registry with every forbidden key negative-tested; daily/technical report and
  expense date boundaries are negative-tested; technical `report_date` backfill/edit/submit immutability
  is proven across two project timezones.

Offline/autosave:

- Manager and Worker in one browser each recover only their own assigned-project/report/time data;
- tenant/deployment mismatch cannot open another partition; unknown identity renders no private data;
- duplicate mutation is idempotent per tenant/user; expired membership rejects existing-row sync;
- server version conflict retains local draft and exposes compare; no silent overwrite;
- report autosave debounce/reload/recover/discard/submit cleanup and validation-error preservation.
- activation purges v4/older URL-only private caches; A -> B -> unknown clears stale DOM, makes old
  partitions inaccessible, and stores no auth token; dirty internal navigation, Cancel, browser close,
  autosave baseline, save, submit, discard and post-save redirect obey section 2.6.

Security:

- step-up enforcement is identical in test/development/production and bound to user+live session+clock;
- arbitrary service flags/JSON, human principals, wrong-tenant/disabled actors, missing job
  IDs, and direct HTTP calls cannot bypass; only the high-level active job/capability operation scans;
- missing scanner, timeout, and test adapter in production remain quarantined/degraded;
- unauthorized/over-quota/bad type/bad signature/bad storage key cause zero filesystem/DB/job writes;
- expense receipt, private-document and sync-attachment route/action tests each prove the exact
  authorize→reserve→stream→finalize IDs-only order, central CSRF, server-derived metadata/key and zero
  write-before-reserve behavior;
- parallel reservations cannot exceed quota; expired reservation cleanup is idempotent;
- filename/MIME/extension/signature mismatch, polyglot, reservation swap, existing target and symlink/
  reparse replacement reject; server derives key/hash/length/signature;
- drive paths, URI/encoded traversal, backslashes, `..`, controls, and root escape reject;
- all four private download families pass the role/IDOR, zero-FS-touch, traversal, hash/length,
  Unicode/CRLF filename, private-header, no-existence-disclosure, and exactly-once audit matrix;
- key- and value-shaped secrets are absent from audit/HTTP logs; business fields remain useful;
- every non-GET portal endpoint rejects cross-origin/missing evidence before handler;
- rate limit atomic boundary/retry-after; actual production cookies carry exact required attributes;
- B11 evidence proves public health is minimal; unauthenticated/Finance/Worker operational health
  denies; Owner/Auditor sees non-secret dependency status and 503 degradation;
- audit UPDATE/DELETE triggers abort; user/service/system identity combinations, tenant, capability,
  job and correlation persistence are exact; disabled/wrong-tenant/forged service actors fail;
- job kind/payload registry, scoped idempotency/hash collision, claim lease/fence, expired reclaim, stale
  completion, terminal replay, one-shot handler/audit, reserve/register-before-publish and removal of every
  portal/manual/human-principal runner pass direct-SQL, integration and static import scans;
- actor/session/IP rate limits are atomic and independent; shared action/API error codes are identical.

### 7.2 Narrow-to-broad commands

Run under Node `24.19.0`/pnpm `11.22.0`, narrow first:

```powershell
pnpm exec vitest run tests/integration/lifecycle-security.test.ts
pnpm exec vitest run tests/integration/lifecycle-security-migration.test.ts tests/integration/effective-membership.test.ts tests/integration/durable-job-security.test.ts
pnpm exec vitest run tests/security/upload-boundary.test.ts tests/security/private-download.test.ts tests/security/http-hardening.test.ts tests/security/session-step-up.test.ts tests/security/audit-redaction.test.ts tests/security/audit-immutability.test.ts tests/security/b5-route-boundaries.test.ts
pnpm exec vitest run tests/offline/contracts.test.ts tests/offline/user-tenant-partition.test.ts tests/offline/cross-user-isolation.test.ts
pnpm exec vitest run apps/portal/src/lib/portal/report-autosave.test.ts apps/portal/src/lib/portal/dirty-form-guard.test.ts apps/portal/src/lib/portal/offline-controller.test.ts
pnpm db:check
pnpm db:integrity
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright test tests/e2e/artifact-lifecycle.spec.ts --workers=1
pnpm exec playwright test tests/e2e/lifecycle-security-b5.spec.ts --workers=1
pnpm exec playwright test tests/e2e/offline-autosave-b5.spec.ts --workers=1
pnpm prettier --check .superpowers/sdd/CODEX_EXECUTION_PLAN/wp-b5-contract.md
git diff --check -- .superpowers/sdd/CODEX_EXECUTION_PLAN/wp-b5-contract.md
```

Migration acceptance additionally runs the repository's fresh DB flow and a copied populated 0018+
fixture, verifies FK/integrity, additive schema parity, tenant/deployment anchor, technical report date,
append-only/read-only triggers, and unchanged counts/original-column projection hashes for pre-existing
client/project/time/expense/report/invoice/payment rows.

Browser lifecycle/offline evidence must cover Owner, PM, and Worker as applicable at all eight
execution-plan projects: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, and
1920×1080. Browser invocations are serialized. `cross-user-isolation.test.ts` is run by Vitest, not
Playwright. The test must assert
readable controls, keyboard dialogs, explicit state, and private-data isolation—not only no overflow.

### 7.3 Executable evidence matrix

| Contract area               | Required automated proof                                                                             | Required independent proof                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| lifecycle/delete/correction | `lifecycle-security.test.ts`, migration invariant, B5 browser lifecycle spec                         | B5-L review, then integrated Spec review                        |
| finance guards              | literal approved B2-version producer/guard tests for every closed blocker; no substitute             | B2 APPROVED, then independent B5-F Finance approval before B5-I |
| effective scope/privacy     | `effective-membership.test.ts` plus forbidden-key assertions for every section 2.5 DTO               | B5-A privacy/temporal review                                    |
| autosave V31-021            | unit tests for debounce/idempotency/version/reordered responses/two tabs; B5 offline browser spec    | B10 offline/privacy review and Spec review                      |
| offline identity            | partition test, persistent anchor migration, signed-envelope expiry/replay/session-switch tests      | B10 offline/privacy plus Security review                        |
| upload/scanning             | all three route/action order tests, concurrency, exact format/path/symlink/swap, fail-closed scan    | B5-S and B5-U Security reviews                                  |
| service provenance/jobs     | kind/hash/claim/lease/fence/replay/publish/audit plus no principal/manual runner static tests        | B5-S, B3 artifact and B11 operations/security reviews           |
| private artifacts           | per-family IDOR/step-up/zero-FS/integrity/exactly-once matrix                                        | B5-D dedicated Security review                                  |
| HTTP/health/PWA             | route enumeration, rate/proxy/cookie/CSRF plus B11 ten-dimension health, deployment/restore evidence | approved B10, then full B11 five-review gate                    |
| migration/data preservation | fresh + populated copy, rollback, legacy guards, projected hashes, DB integrity                      | B5-M migration review                                           |

Evidence records the exact command, exit code, assertion count, fixture identity, Node/pnpm versions,
browser role/viewports and reviewed diff. A generic suite pass cannot replace a named row.

| Module/handoff | Mandatory independent reviewer(s)                         | Browser matrix                                                                                  | T1 relationship                                              |
| -------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| B5-M/MC        | migration-safety reviewer + Security                      | N/A; fresh/copied DB                                                                            | releases only invariant fixtures, never T1 files             |
| B5-L           | lifecycle invariant reviewer                              | N/A                                                                                             | releases lifecycle API/fixture to T1                         |
| B5-A           | temporal/privacy reviewer                                 | N/A                                                                                             | releases effective-scope DTOs to T1                          |
| B5-S           | Security reviewer                                         | N/A                                                                                             | releases upload/job/audit interfaces to B10/B11/T1           |
| B5-F           | Finance Integrity reviewer after B2 APPROVED              | N/A                                                                                             | releases finance blockers without finance truth duplication  |
| B5-I           | backend-domain reviewer + Security + Finance              | N/A                                                                                             | façade/interface handoff only after all prerequisite reviews |
| A5-D → B5-U    | A5 mobile+desktop QA, then B5 CRUD/UI reviewer + Security | Owner/PM/Worker at 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080 | exact lifecycle/autosave/upload selectors become T1 inputs   |
| B5-D           | dedicated Security reviewer                               | route/browser download flow at all eight sizes for applicable Owner/PM/Worker roles             | releases all-family artifact IDOR/download contract          |
| B10            | Security + offline/privacy + mobile/desktop QA            | all eight sizes, identity A→B→unknown                                                           | must be APPROVED before B11 and T1                           |
| B11            | Security + Finance + desktop QA + mobile QA + Integration | operations-health Owner/Auditor at all eight sizes; headless ops drills                         | must be APPROVED before T1                                   |
| T1             | Finance + Security + desktop QA + mobile QA + Spec        | uninterrupted steps 1–42 at all eight sizes/required roles                                      | only green five-review T1 permits DoD-dependent PASS         |

## 8. Review gates

1. **Contract review (independent Security Luna/max):** verify every sensitive read/write, IDOR,
   step-up, service actor, upload path/quota/scanner, audit, CSRF/cookie/rate/health decision. BLOCK on
   any authorize-after-write or caller-created bypass.
2. **Contract review (independent Spec Luna/max):** reconcile FIX-009/010 and all cited V31/V33/DoD
   rows; ensure finance history remains a forbidden boundary.
3. **Module reviews (independent named instances):** `migration_worker` output → migration-safety
   reviewer for B5-M; `backend_leaf` output → lifecycle reviewer for B5-L; temporal/privacy reviewer for
   B5-A; `security_reviewer` for B5-S; `finance_integrity_reviewer` for B5-F; CRUD/UI reviewer for B5-U;
   and a dedicated `security_reviewer` for B5-D. External B10/B11 outputs require independent Security,
   offline/privacy, and operations review
   before evidence returns. Implementers fix findings and rerun narrow tests before integration.
4. **Integrated security review (fresh Luna/max instance):** inspect final diff and run security/offline
   negative tests. Reviewer must not be an implementer.
5. **Integrated spec review (fresh Luna/max instance):** return PASS/PARTIAL/FAIL with exact evidence.
6. Parent may record B5 `APPROVED_FOR_T1` only after green commands and both integrated reviews. No B5
   row becomes `PASS` from code presence or this intermediate state; browser/migration/negative evidence
   and green independently reviewed T1 are mandatory before final PASS.

## 9. Acceptance and handoff

WP-B5 reaches intermediate `APPROVED_FOR_T1` only when:

- B5-D01–D68 have regression evidence and no open critical/high security/spec finding;
- lifecycle operations preserve all history and finance boundaries;
- private upload bytes are never written before authorization/reservation;
- scanning is fail-closed in production;
- assignment scope and PM payload are effective-date/object correct;
- offline/autosave data cannot cross tenant/user/deployment identity;
- step-up/service provenance/audit/CSRF/cookie/rate/health contracts pass;
- fresh and representative migrations pass with no pre-existing data loss;
- required browser flows pass at all viewports;
- independent Security and Spec reviewers approve; and
- the parent records exact files, migration, commands, results, unresolved risks, and RTM evidence.

`APPROVED_FOR_T1` satisfies T1's dependency without claiming production completion. WP-B5 becomes final
`PASS` only after T1 steps 1–42 pass uninterrupted and Finance, Security, desktop QA, mobile QA and Spec
all approve T1. Until then every DoD-dependent B5/RTM row remains `PARTIAL` or `FAIL` with exact blocker.

Each implementation handoff reports summary, exact changed files, migration/backfill result, commands
and output counts, browser viewports/roles, unresolved risks, requirement IDs, and any interface request.
No leaf may silently broaden ownership.

## 10. Fix-round-4 cumulative closure ledger

This cumulative ledger includes both round-2 and both round-3 BLOCKED verdicts; each row remains `PENDING RE-REVIEW`
until the named independent
reviewer verifies the section and proof. It is not an implementation or approval claim.

| Reviewer finding                                       | Contract closure                                                                                                                                 | Required proof at implementation                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Security CRITICAL — public/forgeable service actor     | 3.1.1 exports only bounded batch run; private executor accepts claimed `jobRunId` and derives every authority/handler                            | forged JSON/flag/human/direct-HTTP/callback negatives and export static test |
| Security HIGH — service audit lacks run/fence identity | 3.1.1/5.2 bind actor+job+run+tenant+deployment+capability+correlation+fence with DB triggers                                                     | missing/wrong/stale/replayed run and terminal audit negatives                |
| Security HIGH — MFA/bootstrap bypass central audit     | 3.3 plus B10 exclusive ownership require the sole audit API and sanitized failures                                                               | no direct audit SQL/static test; redaction/provenance integration            |
| Security HIGH — duplicate document download audit      | 3.3 and 4.3 make all authorizers side-effect-free and helper terminal audit exactly once                                                         | success/integrity/unavailable counts; unauthorized zero FS/audit             |
| Security HIGH — technical report lacks business date   | 2.5 and 5.2 add/backfill persistent `report_date` with provenance and immutability                                                               | two-timezone migration and effective-membership tests                        |
| Security HIGH — B5-I could precede finance guard       | 2.1.1 and DAG add hard B5-F + independent Finance `APPROVED` edge                                                                                | typed producer/guard tests and recorded reviewer verdict                     |
| Security HIGH — missing module reviews                 | sections 6 and 8 name independent reviews for every B5 module and external B10/B11 handoff                                                       | implementer handoff → reviewer → remediation → retest evidence               |
| Security HIGH — client-selected upload key             | 3.2 removes key/hash/length/signature/tenant from finalize input and derives them server-side                                                    | reservation swap/existing/symlink/path race negatives                        |
| Security HIGH — upload format schema not exact         | 3.2 freezes filename normalization, MIME/extension/signature allowlists and exclusions                                                           | exact format/polyglot/macro/archive/control/CRLF cases                       |
| Security HIGH — quota race                             | 3.2 requires `BEGIN IMMEDIATE`, pending+stored accounting and atomic state changes                                                               | parallel reservation/finalize/release/expiry invariant                       |
| Security HIGH — legacy offline tables writable         | 5.2 adds INSERT/UPDATE/DELETE abort guards and removes runtime legacy writers                                                                    | DDL trigger and repository static/integration tests                          |
| Security HIGH — PM/privacy payloads broad              | 2.5 freezes every DTO key and forbidden-key matrix                                                                                               | negative output assertions on every listed reader                            |
| Security additional — per-artifact step-up unclear     | 4.3 closes artifact families/classifications and fail-closed unknown class                                                                       | family × role × step-up matrix before metadata/FS                            |
| Security additional — forwarded address trust unclear  | 3.4 freezes peer/trusted-proxy parsing and safe fallback                                                                                         | spoofed/malformed/mixed-header/rate-bucket tests                             |
| Security additional — expensive mutation quotas open   | 3.4 enumerates exact step-up/upload/bulk/autosave/sync/lifecycle buckets                                                                         | atomic boundary and independent-bucket tests                                 |
| Security additional — unbounded audit/domain strings   | 2.1.1, 2.5, 3.3 and 4.3 use closed unions/DTO/classification registries                                                                          | schema rejection for unknown record/blocker/action/classification            |
| Security additional — action ownership omissions       | section 6 assigns Offboard to B10, billing/Accounting Pack to B2/B3/B4, B3 job refactor then exact B5 operations/registry lease                  | route/action import and sequential release evidence                          |
| Security additional — retry-local audit/log sanitation | 2.1 and 3.3 require attempt-local event construction and sanitized codes                                                                         | forced retry plus raw-secret/exception absence tests                         |
| Spec — V31-021 absent/informal                         | source list and 2.6 bind dirty navigation/browser-close to autosave baseline                                                                     | dedicated unit and `offline-autosave-b5.spec.ts` evidence                    |
| Spec — autosave not executable                         | 2.6 freezes version, idempotency, monotonic client revision, conflict and submit order                                                           | duplicate/change-key/two-tab/reordered-response tests                        |
| Spec — tenant/deployment identity not persistent       | 2.7, 5.1 and 5.2 add required env pair and immutable singleton anchor                                                                            | fresh/populated/mismatch/missing/changed anchor tests                        |
| Spec — signed offline envelope underspecified          | 2.7 freezes fields, HMAC validation, session binding, expiry, nonce and offline lease                                                            | replay/session-switch/expiry/unknown identity/no-token tests                 |
| Spec — migration preservation proof impossible         | 5.3 uses original-column projection plus canonical copied-blob digests                                                                           | populated-copy hashes/counts and rollback evidence                           |
| Spec — overlapping later packets                       | DAG/ownership moves auth/access/offline/SW/helpers to B10; all deployment/health/jobs/manifest/ops UI to B11 after B10                           | zero overlapping write paths and reviewed interface handoffs                 |
| Spec — evidence/review gates generic                   | 7.3 and 8 add executable matrix, dedicated B5 Playwright paths and named reviewers                                                               | exact commands/counts/viewports/roles/diffs attached                         |
| Round-2 Spec — B5-U still overlapped access/billing    | B5-U subsection forbids both; B10 and B2/B3/B4 own them respectively                                                                             | path/import scan and handoff sequence                                        |
| Round-2 Spec — operations/load/registry ownership open | B5-U owns `operations-actions.ts` after B3 and `section-load.ts`; registry is one exact final key-only lease                                     | before/after action registry snapshot                                        |
| Round-2 Spec — A5-D collision                          | B5-U waits for formal A5 N+P→S, P→D, S+D→final T plus mobile/desktop approvals; A5-D alone owns the report page                                  | all A5 verdict/hash releases plus unchanged A5-D page in B5 diff             |
| Round-2 Spec — no T1 gate                              | DAG, section 6 and acceptance add exact T1 files/five reviews and `APPROVED_FOR_T1` intermediate state                                           | uninterrupted labeled steps 1–42; no earlier PASS                            |
| Round-2 Spec — B11 narrowed/ordered incorrectly        | B11 waits for approved B10 and owns all `deployment/**`, ten health dimensions, ops UI, email/backup/restore/alerts/outbox/logging               | full-path diff, failure drills and five reviews                              |
| Round-2 Spec — B2 producer/capability/index diverged   | 2.1.1/3.1.1/5/6 withdraw invented producers, require canonical `artifact.accounting_pack.render`, and wait for reviewed B2-MH `index.ts` release | approved B2 export/version/capability diff, B2-MH release, Finance verdict   |
| Round-2 Spec — autosave fields/transport open          | 2.6 freezes both field unions, strict action URL/owner/roles/selectors and registry lease                                                        | strict schema/action/unit/browser matrix                                     |
| Round-2 Security — three uploads write before register | 3.2 freezes expense/document/sync owner and authorize→reserve→stream→finalize IDs-only matrix                                                    | three route/action zero-write/order suites                                   |
| Round-2 Security — durable job not fenced              | 3.1.1 + 5.2 freeze kind mapping, hash, claim/lease/fence/run/finality/publish and exact owners                                                   | concurrency/crash/replay/static-manual-run tests                             |
| Round-2 Security — service audit DDL incomplete        | 5.2 adds actor/job/run/tenant/deployment/capability/correlation triggers and terminal replay guard                                               | direct-SQL consistency/replay matrix                                         |
| Round-2 Security — fixture ownership ambiguous         | B5 owns one non-finance helper; B2 alone owns invoice lifecycle fixture after interface release                                                  | path ownership scan and no duplicated finance truth                          |
| Round-2 Security — download order disclosed metadata   | 4.3 scope-authorizes without metadata, then step-up, then resolves sensitive metadata/key/FS                                                     | all-family IDOR + step-up + zero-metadata/FS spies                           |
| Round-2 Security — legacy IDB can open first           | 2.7 requires deleting `ja-portal-user-cache`/legacy caches before identity open or client claim                                                  | activation failure/A→B→unknown browser proof                                 |
| Round-2 Security — registries/free strings             | 3.1.1/3.2/3.3/4.3 freeze upload media, outcomes, artifact media/classification and audit registries                                              | unknown key/value/header rejection                                           |
| Round-2 Security — eligibility leaks blockers          | 2.4 returns `RESOURCE_UNAVAILABLE` and no blocker object for foreign/out-of-scope IDs                                                            | same-shape/timing negative tests                                             |
| Round-2 Security — PWA key/scope/runbook open          | 2.7/B10/B11 freeze endpoints, HMAC keyring rotation, exact `/j-aautomation/app/` scope and env/runbook owners                                    | key rotation/scope/cache/log/config tests                                    |
| Round-2 Security — schema prose not executable         | 5.1–5.3 provide exact STRICT DDL, nulls/checks/FKs/uniques/triggers and populated projection-hash proof                                          | fresh/copied direct-SQL matrix unchanged                                     |
| Round-3 Security — reciprocal run guard incomplete     | 3.1.1/5.2 rebuild job/run with deferred reciprocal FK plus tenant/deployment/fence/state/lease guards and terminal projection                    | direct-SQL missing/mismatched/stale/terminal/reclaim matrix                  |
| Round-3 Security — legacy jobs dispatchable            | 3.1.1/5.2 require `b5-v1` in candidate+dispatch and retain immutable `legacy` quarantine rows                                                    | legacy claim/upgrade/delete/dispatch negatives and readiness count           |
| Round-3 Security — actor not configured/current        | 3.1.1/5.2 add deployment binding plus actor/binding/capability snapshots and current revalidation                                                | replace/disable/revoke/snapshot-tamper/replay tests                          |
| Round-3 Security — B5-only audit union incompatible    | 3.3/5.1/5.2 use owner-versioned shared registry, reviewed legacy inventory and owner-specific handoffs                                           | AST inventory hash, migration rows, unknown version/entity/actor negatives   |
| Round-3 Security — upload/classification key/NULL gaps | 5.2 closes each reservation key/NULL state, terminal immutability and explicit classification NULL rejection                                     | direct-SQL state/key swap/terminal/NULL matrix                               |
| Round-3 Security — finance gate remains hard           | 2.1.1/B5-F/B5-I retain no lease until exact approved B2 producer and independent Finance verdict                                                 | recorded B2 successor hashes/verdict plus B5-F Finance approval              |
| Round-3 Spec — B2-R6.1 retry handoff stale             | 2.1.1/3.1.1 consume `accounting_pack_artifact_render` → `artifact.accounting_pack.render`; retry decision is never a capability                  | successor hash/verdict and static schema/job string scan                     |
| Round-3 Spec — A5 releases informal                    | DAG/B5-U pin A5 hash and require N+P→S, P→D, S+D→final T plus independent mobile/desktop verdict hashes                                          | parent releases; no early A5-owned path in B5 diff                           |
| Round-3 Spec — migration number/runner conflict        | section 5/DAG consume R6.2: B2-MH sole runner/index → B5 0019 → B2 0020 → B3 0021 → B4 0022; schema exports are sequential                       | R6.2/B2-MH approvals, exact filenames and wrapper failure-injection proof    |
| Round-3 Spec — legacy projections/digests vague        | 5.3 freezes twelve ordered projections, CANON-V1 bytes and deterministic fixture/manifest paths                                                  | checked-in literal manifest hash plus independent recomputation              |
| Round-3 Spec — report date lifecycle incomplete        | 5.2 allows only draft/needs_changes, validates real Gregorian dates and revalidates/freezes submit                                               | impossible/leap/create/edit/autosave/submit tests                            |
| Round-3 Spec — durable fixture unowned                 | B5-T-RED exclusively owns `tests/fixtures/b5-durable-job-fixture.ts` without finance truth                                                       | fixture ownership scan and run/actor/fence tests                             |
| Round-3 Spec — delete/autosave mappings incomplete     | B5-U freezes `?/deleteReport`→`deleteDraft`, future registry selector/key, absolute autosave action and selectors                                | page/section action/selector/import tests; no alias/dead action              |

## 11. Escalation conditions

Escalate to the parent/Sol-high rather than guessing if:

- a client/project transition would require changing issued/finalized finance history or interpreting
  finance readiness not already exposed by a stable WP-B2 contract;
- legacy archived state cannot be restored without an explicit Owner decision;
- assignment timezone/date semantics conflict with a stored immutable finance/source snapshot;
- a migration would rebuild/drop/repurpose historical data rather than add/backfill safely;
- scanner/provider credentials or an external service contract are unavailable (documents remain
  quarantined; do not fake clean);
- tenant/deployment identity is missing, malformed, conflicts with the persistent anchor, or would need
  to be inferred from historical business data;
- Better Auth requires a cookie/callback exception that conflicts with the specified path/SameSite;
- an active agent owns any listed hot path or migration/schema façade lease;
- two authoritative requirements conflict; or
- a reviewer identifies a concrete critical/high failure after the permitted fix loop.

This contract intentionally remains **BLOCKED** until Sol/high R6.2 and B2-MH receive their named
independent approvals and both independent B5 contract reviewers approve fix round 4. No product,
migration, façade, B10, or B11 lease is authorized by this draft alone. Any
remaining ambiguity is a stop condition; finance history is preserved and excluded, never reinterpreted.
