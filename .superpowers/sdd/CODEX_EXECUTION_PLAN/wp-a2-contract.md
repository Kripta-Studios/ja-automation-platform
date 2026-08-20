# WP-A2 architecture contract — portal section loader/action decomposition

**Status:** READY, subject to the preconditions below  
**Classification:** A / Luna Max, one `backend_leaf` writer  
**Required independent reviewer:** `security_reviewer` (procedurally read-only)  
**Linked requirements:** `SPEC-ARCH-001`, `V31-015`; preservation obligations from `SPEC-AUTH-001`, `SEC-RBAC-001`, `SEC-RBAC-002`, `SEC-STEPUP-001`, `SEC-UPLOAD-001`, `SEC-ART-001`, and `AUDIT-TEST-001`  
**Nature of work:** mechanical extraction only. This packet makes no product, RBAC, lifecycle, upload, durable-job, validation, response, or test change.

## 1. Objective and architectural boundary

Turn `apps/portal/src/routes/app/[section]/+page.server.ts` into a thin SvelteKit route adapter while preserving its complete public contract. Continue the existing modular-monolith direction established by `billing-actions.ts` and `operations-actions.ts`; do not replace those registries or create a parallel generic API.

The intended dependency direction is:

```text
+page.server.ts (generated route types only)
  -> section-load.ts (route-specific orchestration)
  -> section-actions.ts (explicit public action registry)
       -> $lib/server/actions/*-actions.ts (cohesive action handlers)
       -> existing billing-actions.ts / operations-actions.ts
  -> $lib/server/portal-week.ts (pure date/week presentation helpers)

$lib/server/actions/*
  -> @ja/schemas
  -> $lib/server/action-utils.ts
  -> $lib/server/portal-repository.ts
  -> repositories/services (authorization and lifecycle truth remain there)
```

No `$lib/server/**` module may import from `apps/portal/src/routes/**`, `./$types`, a Svelte component, or browser code. Only the route-local adapter modules may import `./$types`. No extracted handler may call another extracted action handler.

## 2. Preconditions and stop conditions

The parent must confirm all of these immediately before assigning the writer:

1. WP-R0 remains `PROCEED` and this route has one exclusive writer.
2. WP-T0 has stopped writing/running shared portal browser infrastructure, or the parent has scheduled validation so its database/browser processes cannot race WP-A2.
3. The baseline hashes still match exactly:

   | File                                                       | Required SHA-256                                                   |
   | ---------------------------------------------------------- | ------------------------------------------------------------------ |
   | `apps/portal/src/routes/app/[section]/+page.server.ts`     | `ADE441A414289DC47065C0FD57FEBD7B48B619BEA618ADF9322A58F32E3EBAE5` |
   | `apps/portal/src/lib/server/actions/billing-actions.ts`    | `A033508EF6402E00EF3469D46AA1FD52FAE6A9484E8F02E51A5CB2A29F3426B8` |
   | `apps/portal/src/lib/server/actions/operations-actions.ts` | `63A4877491EEC69BEE03B3CA6CE66F9F34D3D82646CDF3D72EE6954039EADDF3` |

4. No active writer owns any path in section 3.

Stop and return `BLOCKED` if a hash differs, an action name collides, route behavior has changed since this freeze, another worker owns an exact path, or parity requires changing a repository/API/schema. Do not regenerate the contract by guessing.

This stays A only while it is a literal extraction under this frozen contract. Any attempt to change RBAC policy, step-up rules, upload authorization/scanning, action failures, lifecycle state, Accounting Pack messages/jobs, or response payloads is B and must be assigned separately to a Sol/medium domain owner.

## 3. Exact write ownership

### Owned write paths

The writer may modify/create only these production files:

1. `apps/portal/src/routes/app/[section]/+page.server.ts`
2. `apps/portal/src/routes/app/[section]/section-load.ts`
3. `apps/portal/src/routes/app/[section]/section-actions.ts`
4. `apps/portal/src/lib/server/portal-week.ts`
5. `apps/portal/src/lib/server/actions/project-actions.ts`
6. `apps/portal/src/lib/server/actions/access-actions.ts`
7. `apps/portal/src/lib/server/actions/time-actions.ts`
8. `apps/portal/src/lib/server/actions/expense-actions.ts`
9. `apps/portal/src/lib/server/actions/document-actions.ts`
10. `apps/portal/src/lib/server/actions/approval-actions.ts`
11. `apps/portal/src/lib/server/actions/finance-actions.ts`
12. `apps/portal/src/lib/server/actions/notification-actions.ts`

The route façade's final responsibility is only:

```ts
import type { Actions, PageServerLoad } from './$types';
import { sectionActions } from './section-actions';
import { sectionLoad } from './section-load';

export const load: PageServerLoad = sectionLoad;
export const actions: Actions = sectionActions;
```

Equivalent import ordering accepted by the formatter is allowed; no additional logic remains in the façade.

### Read-only interfaces

These may be read/imported but must not be edited:

- `apps/portal/src/lib/server/actions/billing-actions.ts`
- `apps/portal/src/lib/server/actions/operations-actions.ts`
- `apps/portal/src/lib/server/action-utils.ts`
- `apps/portal/src/lib/server/portal-repository.ts`
- generated `apps/portal/.svelte-kit/**` and route `./$types`
- `@ja/schemas`, `@ja/database`, repository/service implementations

### Forbidden writes

- all tests, Playwright config/fixtures, snapshots, and WP-T0 files;
- `PortalShell.svelte`, `PortalChrome.svelte`, `portal.css`, and portal style/component extraction paths;
- database repository façades, domain repository modules, schema, migrations, seeds, and fixtures;
- reporting, invoice templates, artifacts/jobs, downloads, service worker/offline code;
- documentation, planning files, RTM, lockfiles, package manifests, Git index, and `HEAD`.

An import problem does not authorize broadening this path list.

## 4. Frozen loader contract

### Admission and cleanup order

Preserve this exact order and status behavior:

1. Read `params.section`.
2. A missing/unknown section calls `error(404, 'Page not found')` before authentication handling.
3. A missing `locals.user` calls `redirect(303, '/j-aautomation/app/login')`.
4. `billing`, `finance`, `ledger`, and `accounting` allow only `owner_admin`, `finance_admin`, or `auditor_read_only`; otherwise `error(403, 'Finance access required')`.
5. `audit` allows only `owner_admin` or `auditor_read_only`; otherwise `error(403, 'Audit access required')`.
6. Call `openPortalRepository(locals)` exactly once after those gates.
7. Compute `common`, dispatch the section synchronously, and close `context.sqlite` exactly once in `finally` for every return/throw after open.

Do not turn the dispatch into parallel `Promise.all` work. Current repository calls and return values are synchronous; preserve ordering and exception propagation.

### Allowed sections, exact order

```text
time
reports
expenses
projects
pay
documents
notifications
profile
planning
approvals
billing
finance
ledger
accounting
audit
```

### Common response shape

Every accepted section includes exactly the current common keys:

| Key                 | Current computation                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `user`              | `locals.user`                                                                              |
| `section`           | validated `params.section`                                                                 |
| `searchQuery`       | trimmed `url.searchParams.get('q')`, default `''`                                          |
| `searchSuggestions` | `repository.searchSuggestions(principal)`                                                  |
| `searchResults`     | `repository.search(principal, searchQuery)` only when length is at least 2; otherwise `[]` |

### Section-specific response keys and conditions

The key inventory below is canonical. Preserve key names, optional/undefined/null values, empty-array role branches, call order, default dates, and data sources.

| Section             | Additional keys                                                                                     | Frozen conditions/source behavior                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time`              | `projects`, `records`, `weekStart`, `weekEnd`, `timesheet`, `weeklyPay`                             | `weekStart=mondayOf(?week)`; list own week before own records; `weeklyPay` is `undefined` unless principal role is exactly `worker`.                                                          |
| `reports`           | `projects`, `records`, `technicalChanges`, `periodReports`                                          | Assigned projects, own reports, V3 technical changes, V3 period reports.                                                                                                                      |
| `expenses`          | `projects`, `records`                                                                               | Assigned projects and own expenses.                                                                                                                                                           |
| `documents`         | `projects`, `documents`                                                                             | Assigned projects and authorized documents.                                                                                                                                                   |
| `pay`               | `periodStart`, `periodEnd`, `pay`, `settlements`                                                    | Start defaults to current UTC month day 01; end defaults to current UTC month end; preserve existing multiple `new Date()` evaluations and V3 call order.                                     |
| `projects`          | `projects`, `clients`, `contacts`, `workers`                                                        | Clients only owner/finance/auditor; contacts empty only for worker; workers empty only for worker. Do not narrow or broaden here during extraction.                                           |
| `approvals`         | `records`, `milestones`, `technicalChanges`                                                         | Technical changes only owner or project manager, otherwise `[]`.                                                                                                                              |
| `planning`          | `records`, `projects`, `skills`, `workers`                                                          | Workers empty only for worker.                                                                                                                                                                |
| `profile`           | `skills`, `availability`                                                                            | Worker-scoped repository calls remain unchanged.                                                                                                                                              |
| `notifications`     | `records`                                                                                           | `listNotifications`.                                                                                                                                                                          |
| `billing`           | `billingRules`, `invoices`, `projects`, `legalEntities`, `taxProfiles`, `contacts`                  | Preserve this exact repository call/key order.                                                                                                                                                |
| `finance`           | `projects`, `workers`, `selectedProjectId`, `finance`, `portfolio`, `settlements`, `reimbursements` | Selected project is `?project`, else first project `id`, else `''`; workers only owner/finance; `finance` is `null` with no selection; settlements/reimbursements are `[]` with no selection. |
| `ledger`            | `ledger`                                                                                            | V3 master ledger.                                                                                                                                                                             |
| `accounting`        | `packs`                                                                                             | V3 Accounting Pack list.                                                                                                                                                                      |
| `audit`             | `audit`                                                                                             | Repository audit events.                                                                                                                                                                      |
| defensive `default` | `records`                                                                                           | Preserve `{ ...common, records: [] }`, even though the allowlist normally makes it unreachable.                                                                                               |

Canonical shape serialization (one LF-terminated line per entry, exactly in the order below) has SHA-256 `29FC0A9812BDB948D3FCED94E367B60BB30DD7061CE57DFB2C87EAE91A217955`:

```text
common:user,section,searchQuery,searchSuggestions,searchResults
time:projects,records,weekStart,weekEnd,timesheet,weeklyPay
reports:projects,records,technicalChanges,periodReports
expenses:projects,records
documents:projects,documents
pay:periodStart,periodEnd,pay,settlements
projects:projects,clients,contacts,workers
approvals:records,milestones,technicalChanges
planning:records,projects,skills,workers
profile:skills,availability
notifications:records
billing:billingRules,invoices,projects,legalEntities,taxProfiles,contacts
finance:projects,workers,selectedProjectId,finance,portfolio,settlements,reimbursements
ledger:ledger
accounting:packs
audit:audit
default:records
```

### Pure helper extraction

Move `isoDatePattern`, `mondayOf`, and `weeklyView` without semantic edits into `portal-week.ts`.

- `mondayOf` retains recursive fallback, UTC midnight parsing, Monday distance calculation, and ISO date slicing.
- `weeklyView` retains seven days, six 600-minute expected weekdays (`index < 6`, including Saturday as currently implemented), zero Sunday expectation, category accumulation, current state precedence, em dash (`—`), Intl English short weekday labels, and returned `weekStart`/`weekEnd`/`days` shape.
- Both `section-load.ts` and `time-actions.ts` import the single `mondayOf`; do not duplicate it.

## 5. Frozen public action registry

### Registry construction

`section-actions.ts` must explicitly map all 53 action properties to their existing handler function identities. Do not wrap handlers. The first 13 reference `reportActions`, the next 15 reference `billingActions`, and the remaining 25 reference the eight new cohesive registries. Explicit properties are required so the public inventory and overwrite precedence cannot change silently if an imported registry later grows.

The exact property order is:

```text
generatePeriodReports
createDailyReport
createTechnicalReport
createTechnicalChange
submitReport
submitTechnicalChange
createPlanning
createSkill
setWorkerSkill
setAvailability
reviewReport
reviewTechnicalChange
reviewMilestone
createBillingRule
createLegalEntity
createInvoiceNumberPolicy
createTaxProfile
createDraft
createInvoiceAdjustment
approveInvoice
issueInvoice
recordPayment
closePeriod
voidInvoice
sendInvoice
createAccountingPack
finalizeAccountingPack
runJobs
createClient
createClientContact
createProject
createMilestone
submitMilestone
updateSchedule
assignWorker
createInvitation
updateUserStatus
createTime
copyTimeLayout
updateTime
submitTime
createExpense
uploadPrivateDocument
submitExpense
approveRecord
financeApprove
createCompensationRule
settleCompensation
recordReimbursement
createClientLaborRate
createInternalCostRule
createAssignmentRateOverride
markNotificationRead
```

The LF-terminated serialization above has SHA-256 `3DD7043A3C214D9E8E4374FDAF4A6FF321E68A605F608FBC60B8AA533ACF8B1B`. There are no current collisions. A collision or count other than 53 is a stop condition.

### Existing operations spread: 13 handlers, read-only source

| Action                  | Allowed section(s)    | Validation/failure and success contract; special ordering                                                                                                                                                                        |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generatePeriodReports` | `reports`             | 404 wrong section; 400 `Check project and reporting period`; refresh reports, enqueue `period_close_report` with the current idempotency key, then synchronously run artifact jobs; dynamic refreshed/processed success message. |
| `createDailyReport`     | `reports`             | Convert `safetyRelated` checkbox; 400 `Check the daily report fields` plus `fields`; success `Daily report draft saved`.                                                                                                         |
| `createTechnicalReport` | `reports`             | Convert `safetyRelated`; 400 `Check the PLC report fields` plus `fields`; success `PLC report draft saved`.                                                                                                                      |
| `createTechnicalChange` | `reports`             | Convert `safetyImpact`; 400 `Check technical change fields` plus `fields`; success `Technical change draft saved`.                                                                                                               |
| `submitReport`          | `reports`             | Accept only type `daily`/`technical` plus versioned record; 400 `Invalid report`; success `Report submitted for review`.                                                                                                         |
| `submitTechnicalChange` | `reports`             | 400 `Invalid technical change`; success `Technical change submitted for review`.                                                                                                                                                 |
| `createPlanning`        | `planning`            | 400 `Check planning fields`; success `Assignment published`.                                                                                                                                                                     |
| `createSkill`           | `planning`            | 400 `Check skill fields` plus `fields`; success `Skill saved`.                                                                                                                                                                   |
| `setWorkerSkill`        | `planning`            | 400 `Check worker skill fields` plus `fields`; success `Worker skill updated`.                                                                                                                                                   |
| `setAvailability`       | `planning`, `profile` | Normalize local start/end before schema validation; 400 `Check availability fields` plus `fields`; success `Availability saved`.                                                                                                 |
| `reviewReport`          | `approvals`           | 400 `Invalid report decision`; success `Report review recorded`.                                                                                                                                                                 |
| `reviewTechnicalChange` | `approvals`           | 400 `Invalid technical change decision`; success `Technical change review recorded`.                                                                                                                                             |
| `reviewMilestone`       | `approvals`           | 400 `Invalid milestone decision`; additionally reject `needs_changes` with 400 `Milestones must be approved or rejected`; success `Milestone review recorded`.                                                                   |

Every entry above first returns 404 `{ success:false, message:'Wrong section' }` on a section mismatch and otherwise retains current schema, repository/V3 method, `actionFailure`, and `finally close` behavior.

### Existing billing spread: 15 handlers, read-only source

| Action                      | Allowed section(s)      | Validation/failure and success contract; special ordering                                                                                                                                                                             |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBillingRule`         | `billing`               | Convert `autoGenerateDraft`; 400 `Invalid billing stream` plus `fields`; success `Billing stream saved`.                                                                                                                              |
| `createLegalEntity`         | `billing`               | 400 `Check legal entity fields` plus `fields`; success `Legal entity saved`.                                                                                                                                                          |
| `createInvoiceNumberPolicy` | `billing`               | Normalize `accountantApprovedAt`; 400 `Check invoice-number policy fields` plus `fields`; success `Invoice-number policy saved`.                                                                                                      |
| `createTaxProfile`          | `billing`               | Convert `componentCompound`; preserve current one-component mapping; 400 `Check tax profile fields` plus `fields`; success `Tax profile saved`.                                                                                       |
| `createDraft`               | `billing`               | 400 `Invalid billing period`; dynamic `Invoice draft created` / `Existing draft returned`.                                                                                                                                            |
| `createInvoiceAdjustment`   | `billing`               | 400 `Invalid invoice adjustment`; success `Adjustment draft created`.                                                                                                                                                                 |
| `approveInvoice`            | `billing`               | 400 `Invalid invoice`; success `Invoice approved`.                                                                                                                                                                                    |
| `issueInvoice`              | `billing`               | 400 `Invalid invoice`; preserve locale argument; dynamic `Issued {invoiceNumber}`.                                                                                                                                                    |
| `recordPayment`             | `billing`               | Decimal-to-minor conversion and noon-UTC `receivedAt`; 400 `Invalid payment` plus `fields`; success `Payment recorded`.                                                                                                               |
| `closePeriod`               | `billing`               | 400 `Invalid billing period`; when not closed return 409 `{ success:false, message:'Period is incomplete', reasons }`; success `Billing period closed and sources locked`.                                                            |
| `voidInvoice`               | `billing`               | 400 `Invalid void request`; preserve reason/idempotency key; success `Invoice voided with audit trail`.                                                                                                                               |
| `sendInvoice`               | `billing`               | 400 `Invalid send request`; dynamic sent/already-sent success message.                                                                                                                                                                |
| `createAccountingPack`      | `accounting`            | 400 `Invalid accounting period`; preserve synchronous call and current dynamic `Accounting Pack {8-char id} is ready` message even though `AUDIT-ART-002` separately marks it defective. WP-A2 must not fix it.                       |
| `finalizeAccountingPack`    | `accounting`            | Preserve current unvalidated string fallback for `packId`; success `Accounting Pack marked final`.                                                                                                                                    |
| `runJobs`                   | `accounting`, `billing` | After open, explicitly require owner/finance or return 403 `Finance role required`; call `scheduleCoreJobs()` then synchronously `runArtifactJobs`; dynamic processed count. Do not turn into queue-only or background behavior here. |

All billing handlers preserve the initial 404 wrong-section response, repository/V3 authorization, `actionFailure`, and close semantics exactly.

### Extracted inline handlers: 25 handlers

Move handler bodies without normalization or cleanup into these exact registries:

| Registry                                           | Exact handlers, in source order                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectActions` in `project-actions.ts`           | `createClient`, `createClientContact`, `createProject`, `createMilestone`, `submitMilestone`, `updateSchedule`, `assignWorker`                           |
| `accessActions` in `access-actions.ts`             | `createInvitation`, `updateUserStatus`                                                                                                                   |
| `timeActions` in `time-actions.ts`                 | `createTime`, `copyTimeLayout`, `updateTime`, `submitTime`                                                                                               |
| `expenseActions` in `expense-actions.ts`           | `createExpense`, `submitExpense`                                                                                                                         |
| `documentActions` in `document-actions.ts`         | `uploadPrivateDocument`                                                                                                                                  |
| `approvalActions` in `approval-actions.ts`         | `approveRecord`, `financeApprove`                                                                                                                        |
| `financeActions` in `finance-actions.ts`           | `createCompensationRule`, `settleCompensation`, `recordReimbursement`, `createClientLaborRate`, `createInternalCostRule`, `createAssignmentRateOverride` |
| `notificationActions` in `notification-actions.ts` | `markNotificationRead`                                                                                                                                   |

`section-actions.ts` must place `uploadPrivateDocument` between `createExpense` and `submitExpense`, as shown in the canonical 53-name list; do not rely on whole-object spreads for this ordering.

| Action                         | Allowed section | Frozen validation/failure and success contract                                                                                                                                                                                                                |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createClient`                 | `projects`      | 400 `Check client fields` plus `fields`; dynamic `Created {clientNumber}`.                                                                                                                                                                                    |
| `createClientContact`          | `projects`      | Convert `isBillingContact` and `isPrimary`; 400 `Check contact fields` plus `fields`; success `Client contact saved`.                                                                                                                                         |
| `createProject`                | `projects`      | 400 `Check project fields` plus `fields`; dynamic `Created {projectNumber}`.                                                                                                                                                                                  |
| `createMilestone`              | `projects`      | 400 `Check milestone fields` plus `fields`; success `Milestone draft saved`.                                                                                                                                                                                  |
| `submitMilestone`              | `projects`      | 400 `Invalid milestone record`; success `Milestone submitted for review`.                                                                                                                                                                                     |
| `updateSchedule`               | `projects`      | 400 `Check schedule fields` plus `fields`; success `Expected schedule saved`.                                                                                                                                                                                 |
| `assignWorker`                 | `projects`      | 400 `Check assignment fields` plus `fields`; success `Assignment created`.                                                                                                                                                                                    |
| `createInvitation`             | `projects`      | 400 `Invalid invitation` plus `fields`; preserve `JA_PUBLIC_BASE_PATH ?? '/j-aautomation'` and token-bearing success message. Do not log it or alter disclosure here.                                                                                         |
| `updateUserStatus`             | `projects`      | UUID and exact `active/suspended/offboarded/archived` allowlist; 400 `Invalid account status change`; dynamic marked-status success.                                                                                                                          |
| `createTime`                   | `time`          | 400 `Check time fields` plus `fields`; success `Time draft saved`.                                                                                                                                                                                            |
| `copyTimeLayout`               | `time`          | Preserve `mondayOf` normalization, 400 same-week `Choose a different source week`, repository argument order, and dynamic created-count message including `minutes remain 0.`                                                                                 |
| `updateTime`                   | `time`          | Preserve schema intersection and exact projected update object; 400 `Check time fields` plus `fields`; success `Time draft updated`.                                                                                                                          |
| `submitTime`                   | `time`          | 400 `Invalid time record`; success `Time submitted`.                                                                                                                                                                                                          |
| `createExpense`                | `expenses`      | Preserve every checkbox/decimal/empty-string transformation, receipt preflight, MIME/size/signature checks, content-addressed key, `wx` write, registration, deduplication, cleanup order, exact messages, and final re-parse; success `Expense draft saved`. |
| `uploadPrivateDocument`        | `documents`     | Preserve current field checks, sensitivity allowlist, MIME/size/signature checks, folder selection, content-addressed key, `wx` write, registration/deduplication, cleanup, exact messages; success `Private document uploaded and hash-registered`.          |
| `submitExpense`                | `expenses`      | 400 `Invalid expense record`; success `Expense submitted`.                                                                                                                                                                                                    |
| `approveRecord`                | `approvals`     | 400 `Invalid approval decision`; preserve time/expense dispatch and success `Decision recorded`.                                                                                                                                                              |
| `financeApprove`               | `approvals`     | 400 `Invalid finance decision`; preserve time billable conversion / expense dispatch; success `Finance review recorded`.                                                                                                                                      |
| `createCompensationRule`       | `finance`       | 400 `Invalid compensation rule` plus `fields`; success `Worker compensation rule saved`.                                                                                                                                                                      |
| `settleCompensation`           | `finance`       | 400 `Invalid settlement period`; dynamic settled-count success.                                                                                                                                                                                               |
| `recordReimbursement`          | `finance`       | Preserve string/undefined normalization and `BigInt` conversion after schema validation; 400 `Invalid reimbursement`; dynamic amount success.                                                                                                                 |
| `createClientLaborRate`        | `finance`       | Convert `eligibleForPercentage`; 400 `Invalid client rate` plus `fields`; success `Client labor rate saved`.                                                                                                                                                  |
| `createInternalCostRule`       | `finance`       | 400 `Invalid internal cost rule` plus `fields`; success `Internal cost rule saved`.                                                                                                                                                                           |
| `createAssignmentRateOverride` | `finance`       | 400 `Invalid assignment override` plus `fields`; success `Assignment rate override saved`.                                                                                                                                                                    |
| `markNotificationRead`         | `notifications` | Require non-empty string ID; 400 `Notification is required`; success `Notification marked as read`.                                                                                                                                                           |

Every inline handler retains the exact 404 wrong-section response, schema, repository/V3 method, argument order, `try/catch/finally`, and returned object. There are no action redirects.

## 6. Security and failure invariants

Mechanical parity includes preserving behavior that later packets are required to improve. The writer must not silently repair or weaken it.

1. `openPortalRepository(locals)` remains the authentication boundary for actions and is called at the same point relative to validation/file reads as today.
2. Repository/V3 methods remain the permission, project-scope, ownership, financial-visibility, and lifecycle authority. No handler substitutes client-supplied IDs for repository authorization.
3. Load role gates remain server-side and exact. UI hiding is not treated as authorization.
4. Every action's section gate remains before form parsing/opening the repository.
5. `actionFailure` behavior remains exact: access 403; conflict 409; validation 400; readiness 409 with `reasons`; unknown errors rethrow. Do not add a broad catch that converts unknown defects into fake success or 400.
6. Repository contexts close once in `finally`; upload cleanup remains inside the current catch before `actionFailure`.
7. File allowlists, sizes, magic-signature checks, SHA-256, path confinement checks, `wx`, deduplication, and conditional unlink behavior remain byte-for-byte equivalent in meaning.
8. Do not extract a generic upload helper in WP-A2: the two cleanup/state machines differ, and merging them without new tests would be a semantic refactor.
9. Do not add scanning, quota, step-up, authorize-before-write changes, Windows path hardening, or audit changes here. Those are known P0 security work (`SEC-UPLOAD-001`, `SEC-STEPUP-001`, `SEC-ART-001`) and require a separate B contract plus security tests.
10. Do not change the synchronous artifact processing in `generatePeriodReports`/`runJobs`, the misleading Accounting Pack message, job lifecycle, or independent-format semantics. Those belong to the finance/artifact B packet (`AUDIT-ART-001`–`007`).
11. Do not add logging of request bodies, invitation tokens, filenames, hashes, finance values, or upload bytes.
12. Do not add module-global mutable state, cached principals, repositories, SQLite handles, URLs, or date values.

## 7. Mechanical extraction order

One writer performs these steps sequentially:

1. Recheck all three hashes and record the dirty status of the 12 owned paths.
2. Copy `isoDatePattern`, `mondayOf`, and `weeklyView` to `portal-week.ts`; import the helpers back into the still-monolithic route. Run portal typecheck.
3. Extract the 25 inline handlers by contiguous domain group into the eight exact action files. After each file, import its registry and replace only those original property values in the route; do not rename or wrap. Run portal typecheck after the upload pair and after the finance group.
4. Create `section-actions.ts` with the explicit 53-property mapping in the canonical order. Switch the route to `sectionActions`; verify the count/order/hash before deleting the old inline bodies.
5. Move the full load admission/common/switch/finally body into route-local `section-load.ts`. Switch the route to `sectionLoad`.
6. Reduce `+page.server.ts` to the four-line responsibility shown in section 3 (plus formatter-approved whitespace/import order).
7. Run the validations below. Do not format unrelated files.
8. Return the handoff; do not stage or commit.

If an intermediate extraction cannot typecheck without changing a read-only interface, restore only the writer's own in-progress edits and report `BLOCKED` to the parent. Do not edit generated `$types`.

## 8. Validation commands and evidence

Use the parent-provided pinned Node 24.19.0 PATH procedure before the evidence run. Confirm:

```powershell
node --version
pnpm --version
```

Required commands, narrowest first:

```powershell
pnpm --filter @ja/portal typecheck
pnpm exec eslint "apps/portal/src/routes/app/[section]/+page.server.ts" "apps/portal/src/routes/app/[section]/section-load.ts" "apps/portal/src/routes/app/[section]/section-actions.ts" "apps/portal/src/lib/server/portal-week.ts" "apps/portal/src/lib/server/actions/project-actions.ts" "apps/portal/src/lib/server/actions/access-actions.ts" "apps/portal/src/lib/server/actions/time-actions.ts" "apps/portal/src/lib/server/actions/expense-actions.ts" "apps/portal/src/lib/server/actions/document-actions.ts" "apps/portal/src/lib/server/actions/approval-actions.ts" "apps/portal/src/lib/server/actions/finance-actions.ts" "apps/portal/src/lib/server/actions/notification-actions.ts"
pnpm test:integration
pnpm test:security
pnpm typecheck
pnpm build
git diff --check -- "apps/portal/src/routes/app/[section]/+page.server.ts" "apps/portal/src/routes/app/[section]/section-load.ts" "apps/portal/src/routes/app/[section]/section-actions.ts" "apps/portal/src/lib/server/portal-week.ts" "apps/portal/src/lib/server/actions"
```

Do not run or edit WP-T0 intentional RED specs as if WP-A2 were expected to fix product behavior. If the parent has released a green route/browser parity selection, run only that parent-specified selection after the test owner confirms no shared-runtime conflict.

Inventory verification is mandatory. A PowerShell reviewer may extract the explicit property assignments from `section-actions.ts`, serialize the 53 names with LF plus a final LF, and compare SHA-256 to `3DD7043A3C214D9E8E4374FDAF4A6FF321E68A605F608FBC60B8AA533ACF8B1B`. The reviewer must also confirm the two existing registry hashes are unchanged and compare the moved load/action bodies with `git diff --color-moved=dimmed-zebra` or equivalent.

Because WP-A2 owns no tests, green commands are necessary but not sufficient. The independent security reviewer must manually verify every row in sections 4–6 against the diff.

## 9. Acceptance, review, and rollback

WP-A2 is accepted only when:

- only the 12 owned production paths changed;
- the final façade contains no business/load/action logic;
- the two existing registry files retain their pinned hashes;
- `sectionActions` has exactly the 53 canonical names, order, and handler identities;
- all 15 section admissions and all loader key shapes/role branches are unchanged;
- every action retains section, validation, repository call, authorization source, status, message, response keys, cleanup, close, and synchronous/async behavior;
- no circular dependency or route-to-library reverse import exists;
- required commands pass under Node 24.19.0;
- the independent `security_reviewer` returns `APPROVED` with no Critical/Important parity defect;
- the parent records `SPEC-ARCH-001`/`V31-015` evidence as an additional mechanical tranche, without marking known product/security rows PASS.

Rollback is file-level and non-data-bearing: revert only the 12 WP-A2 paths to the pre-packet snapshot. WP-A2 creates no migration, database/data change, artifact, or external write. Never use a destructive worktree-wide reset because unrelated user/agent changes coexist.

## 10. Required handoff

Return:

1. `READY FOR REVIEW` or `BLOCKED`;
2. exact changed files;
3. before/final route line counts and all three precondition hashes;
4. the final 53-action count, ordered-inventory SHA-256, and unchanged existing-registry hashes;
5. loader admission/shape parity confirmation;
6. commands run with exact pass/fail counts and Node/pnpm versions;
7. migrations/data/external writes (`none` expected);
8. browser/manual verification (`none` unless explicitly assigned by the parent);
9. unresolved risks, including any current semantic defect deliberately preserved;
10. requirement IDs believed advanced (`SPEC-ARCH-001`, `V31-015` only);
11. whether any interface/path change is required from another agent (`no` expected).

The implementer does not self-certify completion. The parent routes the handoff and diff to an independent `security_reviewer`; concrete findings return to the same writer, followed by retest and RTM evidence update.
