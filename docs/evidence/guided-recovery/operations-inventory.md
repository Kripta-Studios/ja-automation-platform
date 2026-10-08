# Operational guided recovery inventory

Inspection date: 2026-10-08. Scope is the operational UI and actions in the existing workspace, preserving role authorization, project/worker filters, draft/history semantics, and all earlier changes. This is a source-grounded inventory, not a claim that every listed action has browser evidence.

## Menu and role coverage

`portal-navigation.ts`, `section-load.ts`, and each route's server repository check remain authority. All UI recovery uses the shared layout dialog; none of these cases authorizes new access or commercial decisions.

| Role/profile                 | Operational menu and destinations                                                       | Recovery boundary                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker/internal employee     | Today, Time, Expenses, Reports; Crew hours, own Pay, Profile                            | Own actual work and effective assignments; delegated crew only. No client billability, tax, markup, rates, margin or other-worker pay fields. |
| Project manager              | Dashboard, Projects, Approvals, Reports; Time, Expenses, Planning, Documents, Profile   | Existing project scope; operational review only. Review reason can be repaired; review/return/reject still requires final normal action.      |
| Supplier external technician | Time, Expenses, Reports; supplier operational report, Profile                           | Current supplier grant plus effective assignment; factual own records. Expired access routes to the owner.                                    |
| Supplier coordinator         | Supplier team plus Time, Expenses, Reports, operational report, Profile                 | Crew access only when delegated; crew receipt is factual allocation. Supplier administration remains another packet.                          |
| Owner                        | Operational sections plus crew delegation and managing existing workers/planning/skills | Existing owner actions only. Owner can choose another assigned worker where the existing form allows it.                                      |
| Finance                      | Existing authorized operational/history visibility and Finance review                   | Financial forms are inventoried by the finance packet; these changes add no Worker/PM financial inputs.                                       |
| Auditor                      | Existing read-only operational/history destinations                                     | No apply operation. Contact an authorized owner/reviewer when access or correction is required.                                               |

## Action/form inventory and required data

Paths below omit the shared `/j-aautomation` prefix. Hidden IDs, versions, snapshot hashes and request identities are **context**, never questions asking the user to invent IDs. Missing/stale context requires reviewing/reopening the current record.

| Menu/action                                                                  | Existing form/route                                      | Required user-controlled data and recovery                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time: `createTime`                                                           | `/app/time`, log-time sheet                              | Assigned project, date, category, actual minutes/interval, summary 3–5000; owner-selected worker where allowed. Both start/end together, end after start, break within shift. Optional meal uses meal category, actual amount/currency/payer/description and receipt facts only.     |
| Time: `updateTime`                                                           | `/app/time?edit=ID` sheet                                | Same factual fields, current ID/version. Minutes target durationHours or endTime; breakMinutes targets breakHours. Never edit approved/history through ordinary draft edit.                                                                                                          |
| Time: `createTimeBatch`                                                      | `/app/time#time-owner-batch-title`                       | Owner, assigned worker/project, week; every entered day needs hours/category/summary. Invalid JSON-row fields map to hours_N/category_N/summary_N for the calendar day, including skipped days. Blank week prompts first day's hours/summary.                                        |
| Time: `copyTimeLayout`                                                       | `/app/time` week copy form                               | Source and target Monday weeks must differ; preserve assignment checks and do not fabricate actual time.                                                                                                                                                                             |
| Time: `submitTime`, `submitTimeWeek`                                         | Time record row/detail; `/app/time` weekly submission    | Existing draft(s), current version(s), selected worker/week. Receipt-linked meal and time submit together. Stale/locked/state conflict requires current record review, never fabricated fields.                                                                                      |
| Time: `deleteTime`, `deleteDraft`, `withdrawLinkedDrafts`                    | Record row/detail                                        | Existing eligible draft/version; linked withdrawal reason where present. History/receipt/locked records require correction or authorized review.                                                                                                                                     |
| Expense: `createExpense`, `updateExpense`                                    | `/app/expenses` create/edit sheet                        | Assigned project/date, category, actual amount/currency/payer/description; optional vendor, occurrence time, payment method and active matching time entry; receipt when required. File must be reattached when native reload cannot retain it.                                      |
| Expense: `createExpenseWeek`                                                 | Weekly table in `/app/expenses`                          | Worker/week/project/currency/payer, 1–7 distinct days; per-day amount/category/vendor/description. All invalid rows now target amount_N/category_N/vendor_N/description_N; values remain derived from the live row controls.                                                         |
| Expense: `submitExpense`, `submitExpenseWeek`                                | Record row/detail; weekly submission                     | Current drafts/versions/week; required receipt and linked time prerequisites. Receipt absence routes to existing edit/receipt attachment, not a fictitious metadata field.                                                                                                           |
| Expense: `deleteExpense`, `withdrawCrewExpenseDraft`, `withdrawLinkedDrafts` | Record actions and detail                                | Existing permitted draft/version and withdrawal reason where required; shared allocation locks/history require documented correction.                                                                                                                                                |
| Reports: `createDailyReport`                                                 | `/app/reports` Daily sheet                               | Project/date, summary and tasksCompleted; owner/PM choose assigned worker. Optional downtime 0–1440, problems/corrective actions/blockers/open items/next plan/site shift/client contact.                                                                                            |
| Reports: `createTechnicalReport`                                             | `/app/reports` PLC sheet                                 | Project/report date, systemName, problemSymptom, diagnosisRootCause, changePerformed (historical changeSummary accepted by schema); assigned worker for owner/PM. Safety-related records also need validation and rollbackPlan.                                                      |
| Reports: `autosaveReport`, `updateReport`                                    | Existing draft sheet and `/app/reports/ID`               | Same factual fields plus current record/version; autosave failure never approves or submits a report. Preserve entered draft and use current version after conflict.                                                                                                                 |
| Reports: `createTechnicalChange`, `submitTechnicalChange`                    | Existing Reports/technical-change form and submitted row | Project, component, changeMade; technical report belongs to same project. Safety-impacting records require validation and rollbackInformation. Submit is an explicit later action.                                                                                                   |
| Reports: `submitReport`, `deleteDraft`                                       | Reports register/detail                                  | Existing draft/needs-changes record, type and version. Submitted, reviewed, finalized or linked history requires audited correction.                                                                                                                                                 |
| Corrections: `createCorrectionDraft`, `withdrawCorrectionDraft`              | Time/expense/report detail and existing correction forms | Record type/ID/version/request identity retained, reason and explicitly selected corrected factual fields. Owner override remains its existing permission/explicit action; finalized financial dependencies are reviewed by authorized staff.                                        |
| Reports: `generatePeriodReports`                                             | `/app/reports` generator                                 | Project, start/end period, content mode; selected technical report IDs from permitted choices when applicable. Queued/failed artifact states require review/retry, never user-invented paths.                                                                                        |
| Period report: `recordFollowup`                                              | `/app/reports/review`, `/app/reports/period/ID`          | Event, responsible user from existing scope, date/method/reference/signatory/reason/next follow-up as event requires; current snapshot and latest-event identity retained.                                                                                                           |
| Period report: `approve`, `sign`, `invalidateSignoff`, `refresh`             | `/app/reports/period/ID`                                 | Explicit current report review; signing needs signerName, signerIdentity, signatureDate, signatureFile/committed pending document and reason when replacement requires it. Invalidation reason; refresh existing project/period/content/language. No automatic signing/finalization. |
| Approval: `approveRecord`                                                    | `/app/approvals#approval-queue` Time/Expenses            | Existing type/ID/decision/version; reason required when returning/rejecting. PM only operational decision, no commercial treatment fields.                                                                                                                                           |
| Approval: `reviewReport`, `reviewTechnicalChange`, `reviewMilestone`         | `/app/approvals#approval-queue` Reports/milestones       | Existing ID/type/decision; return/reject reason (max 2000). Milestone only approve/reject. Missing safety evidence returns the technical change for correction, not filling source evidence in the review form.                                                                      |
| Planning: `createPlanning`, `updatePlanning`, `cancelPlanning`               | `/app/planning#planning-create-form`, existing row edit  | Project, existing workers, startsAt, optional endsAt, plannedMinutes 0–10080, site/requiredSkill; current row version and cancellation reason where required. Overlap/unavailability asks for a valid window or scoped worker.                                                       |
| Expertise: `createSkill`, `updateSkill`, `deleteSkill`                       | `/app/planning#planning-skills`                          | Existing skill or code 2–80/name 2–160; referenced skill cannot be removed blindly.                                                                                                                                                                                                  |
| Expertise: `setWorkerSkill`, `deleteWorkerSkill`                             | Planning/Profile skills                                  | Existing worker and skill; proficiency 1–5. Scope and ownership checks remain server authoritative.                                                                                                                                                                                  |
| Availability: `setAvailability`                                              | Existing Profile/Planning AvailabilityCalendar form      | Existing worker, startsAt/endsAt (end after start), availability enum and optional note max 1000; ID/version paired for existing record.                                                                                                                                             |
| Crew: `refreshFilter`                                                        | `/app/crew` project/day form                             | Accessible project and real work date; corrected GET context retains pending hours/allocation according to existing unsaved-change guard.                                                                                                                                            |
| Crew: `grant`, `revoke`                                                      | `/app/crew#crew-assign`, delegation list                 | Owner selects chief, distinct assigned worker, starts/optional ends; revoke current existing delegation ID. Chief/worker assignment and date coverage checked server-side.                                                                                                           |
| Crew: `createBatch`, `submit`                                                | `/app/crew#crew-hours`, existing entry row               | Delegated worker checkbox group, shared/individual mode, real hours, category and summary; valid request/date/project context. Invalid individual hours now target hours_WORKER_ID. Submission option remains explicit.                                                              |
| Crew: `allocateReceipt`                                                      | `/app/crew#crew-receipts`                                | Existing eligible receipt, at least two authorized worker/time rows, positive split amounts totaling saved receipt. Invalid amount/total targets amount_TIME_ID; scoped row/receipt issues retain checkbox/select correction.                                                        |
| Crew detail: `update`, `discard`, `correct`, `submit`                        | `/app/crew/time/ID`                                      | Existing draft/version; workDate/category/minutes/summary, correction reason and interval where existing form supports it. Returned-only correction and linked-record/history restrictions remain unchanged.                                                                         |

## Error UX findings and implemented integration

- `action-message.ts` already normalizes the legacy `fields` alias to `fieldErrors`; the apparent review-field alias difference is not a defect.
- Time/Expense/Report create/edit sheets already use `createOperationalSubmit`, localized field errors and retained live forms. The shared guided dialog can consume their existing ProblemNotice. Minute/break/amount field aliases resolve to visible operational controls.
- Weekly Time prechecks previously canceled with a plain string. They now publish structured local problems and direct `requestGuidedRecovery` with the original form, and server batch validation identifies every invalid day. Native reloads also bridge weekly errors into the shared dialog. Hours fields use hours wording, preserving the visible unit.
- Weekly Expense failures previously rendered only a plain string, while row inputs had no names. Stable day names plus direct shared recovery make every invalid row editable. Native row values remain in the existing JSON payload. Changing the context retains the existing explicit unsaved-change behavior.
- Crew invalid individual hours and receipt amount errors previously pointed at selected workers/time rows. They now identify the actual bad named hours/amount inputs; total mismatch identifies the selected split amounts. Direct form context avoids choosing the wrong crew action.
- `withOperationalActionNames` decorates Time/Expense/operations action maps without rebuilding the SvelteKit ActionFailure instance. Native failures retain the source action name for recovery targeting; success results are unchanged.
- Access/session/assignment/delegation/lifecycle/history failures often intentionally have no editable field. Guided recovery must show their existing review/contact/sign-in remedy; a missing permission cannot be repaired by entering finance/configuration data or inventing an ID.
- Unknown server/network outcomes still require checking the current record before retry, preserving idempotency. No new approval, rejection, submission, signature, deletion or allocation occurs without the normal final action.

## Exact action exports inspected

- Time: `createTimeBatch`, `createTime`, `copyTimeLayout`, `updateTime`, `submitTime`, `submitTimeWeek`, `deleteTime`. Source: `apps/portal/src/lib/server/actions/time-actions.ts`.
- Expense: `submitExpenseWeek`, `createExpenseWeek`, `createExpense`, `updateExpense`, `submitExpense`, `withdrawCrewExpenseDraft`, `deleteExpense`. Source: `apps/portal/src/lib/server/actions/expense-actions.ts`.
- Operational review: `approveRecord`. Source: `apps/portal/src/lib/server/actions/approval-actions.ts`.
- Reports / workforce: `autosaveReport`, `deleteDraft`, `withdrawLinkedDrafts`, `createCorrectionDraft`, `withdrawCorrectionDraft`, `generatePeriodReports`, `createDailyReport`, `createTechnicalReport`, `createTechnicalChange`, `submitReport`, `submitTechnicalChange`, `createPlanning`, `updatePlanning`, `cancelPlanning`, `createSkill`, `setWorkerSkill`, `updateSkill`, `deleteSkill`, `deleteWorkerSkill`, `setAvailability`, `reviewReport`, `reviewTechnicalChange`, `reviewMilestone`. Source: `apps/portal/src/lib/server/actions/operations-actions.ts`.
- Crew: `refreshFilter`, `grant`, `revoke`, `createBatch`, `submit`, `allocateReceipt`. Source: `apps/portal/src/routes/app/crew/+page.server.ts`.
- Crew detail: `update`, `discard`, `correct`, `submit`. Source: `apps/portal/src/routes/app/crew/time/[id]/+page.server.ts`.

## Known repository errors and actionable remedies

The tables below enumerate the named repository error mappings actually inspected. A dash means there is no editable field in that map: resolve through the listed existing remedy and final user action. Schema-validation errors additionally enumerate each actual invalid form field; malformed/hidden IDs and stale versions need record review.

### Time

| Repository condition                                                          | Problem code                          | Field        | Existing remedy          |
| ----------------------------------------------------------------------------- | ------------------------------------- | ------------ | ------------------------ |
| Time save retry has changed                                                   | TIME_SAVE_RETRY_CHANGED               | —            | review_time              |
| Active account required                                                       | TIME_ACCOUNT_INACTIVE                 | —            | contact_owner            |
| Read-only role                                                                | TIME_READ_ONLY_ROLE                   | —            | contact_project_owner    |
| Time entry not found                                                          | TIME_RECORD_UNAVAILABLE               | —            | review_time              |
| Owner administration required                                                 | TIME_OWNER_ENTRY_REQUIRED             | —            | contact_project_owner    |
| Owner administration required to record for another worker                    | TIME_OTHER_WORKER_OWNER_REQUIRED      | —            | contact_project_owner    |
| Only the owner can submit another worker’s week                               | TIME_OTHER_WORKER_WEEK_OWNER_REQUIRED | —            | contact_project_owner    |
| Live authenticated session required                                           | TIME_SESSION_ENDED                    | —            | sign_in_again            |
| Time entry ownership required                                                 | TIME_OWNERSHIP_REQUIRED               | workerId     | contact_project_owner    |
| Correction drafts are immutable and cannot be deleted                         | TIME_CORRECTION_DRAFT_IMMUTABLE       | —            | review_time              |
| Week changed. Refresh and review its drafts before submitting                 | TIME_WEEK_CHANGED                     | —            | review_week              |
| Linked meal no longer matches its time entry                                  | TIME_LINKED_MEAL_CHANGED              | —            | review_week              |
| Time entry changed before submission                                          | TIME_SUBMISSION_CHANGED               | —            | review_time              |
| Time entry is not a draft for submission                                      | TIME_SUBMISSION_NOT_DRAFT             | —            | review_time              |
| Time entry locked before submission                                           | TIME_SUBMISSION_LOCKED                | —            | contact_finance          |
| Time entry changed or cannot be edited                                        | TIME_DRAFT_CHANGED                    | —            | review_time              |
| Only an unlocked never-submitted time draft can change                        | TIME_NOT_EDITABLE_DRAFT               | —            | review_time              |
| Active project assignment required                                            | TIME_ASSIGNMENT_REQUIRED              | workDate     | contact_project_owner    |
| Project assignment access required                                            | TIME_ASSIGNMENT_REQUIRED              | workDate     | contact_project_owner    |
| Operational project access required                                           | TIME_PROJECT_NOT_OPERATIONAL          | projectId    | contact_project_owner    |
| Current supplier project grant required                                       | TIME_SUPPLIER_GRANT_EXPIRED           | —            | contact_owner            |
| Active worker assignment required                                             | TIME_WORKER_ASSIGNMENT_REQUIRED       | workerId     | review_worker_assignment |
| Time intervals cannot overlap for the same worker and date                    | TIME_INTERVAL_OVERLAP                 | startTime    | review_time              |
| Identical time entry already exists                                           | TIME_DUPLICATE_ENTRY                  | summary      | review_time              |
| Time and expense retry has changed                                            | TIME_EXPENSE_RETRY_CHANGED            | —            | review_time              |
| Time and expense request was withdrawn                                        | TIME_EXPENSE_RETRY_WITHDRAWN          | —            | review_time              |
| Linked time and meal drafts must be submitted together                        | LINKED_DRAFT_SUBMIT_TOGETHER          | —            | review_week              |
| Linked time and meal drafts must be withdrawn before editing                  | LINKED_DRAFT_EDIT_TOGETHER            | —            | review_time              |
| A linked correction draft cannot be edited                                    | TIME_CORRECTION_DRAFT_LOCKED          | —            | review_time              |
| Returned, submitted, or approved time requires the reviewed correction path   | TIME_CORRECTION_REQUIRED              | —            | review_time              |
| Locked or invoiced time is immutable and cannot be voided                     | TIME_LOCKED_OR_INVOICED               | —            | contact_finance          |
| This crew time is linked to an allocated receipt and cannot be deleted        | TIME_ALLOCATED_RECEIPT                | —            | review_time              |
| This crew time is linked to an allocated receipt; its work date cannot change | TIME_ALLOCATED_RECEIPT_DATE_LOCKED    | workDate     | review_time              |
| Time entry changed or cannot be deleted                                       | TIME_DELETE_CHANGED                   | —            | review_time              |
| Time entry changed or cannot be discarded                                     | TIME_DELETE_CHANGED                   | —            | review_time              |
| A time batch can contain only one entry per day                               | TIME_BATCH_DUPLICATE_DAY              | entries      | review_week              |
| Week start must be a Monday                                                   | TIME_WEEK_START_INVALID               | weekStart    | review_week              |
| Minutes must be an integer from 0 to 1440                                     | TIME_MINUTES_INVALID                  | minutes      | review_time              |
| A worker cannot enter more than 1440 minutes per day                          | TIME_DAILY_LIMIT                      | workDate     | review_time              |
| Start and end time must be provided together                                  | TIME_INTERVAL_INCOMPLETE              | startTime    | review_time              |
| End time must be later on the same day                                        | TIME_INTERVAL_ORDER_INVALID           | endTime      | review_time              |
| Break minutes must be an integer within the shift                             | TIME_BREAK_INVALID                    | breakMinutes | review_time              |
| Break minutes are invalid                                                     | TIME_BREAK_INVALID                    | breakMinutes | review_time              |
| Minutes must equal elapsed time less break minutes                            | TIME_DURATION_MISMATCH                | minutes      | review_time              |

### Expense

| Repository condition                                                          | Problem code                                 | Field       | Existing remedy       |
| ----------------------------------------------------------------------------- | -------------------------------------------- | ----------- | --------------------- |
| Expense receipt type or size invalid                                          | EXPENSE_RECEIPT_TYPE_OR_SIZE                 | receipt     | attach_receipt        |
| Expense receipt content invalid                                               | EXPENSE_RECEIPT_CONTENT_INVALID              | receipt     | attach_receipt        |
| Expense receipt path invalid                                                  | EXPENSE_RECEIPT_PATH_INVALID                 | receipt     | attach_receipt        |
| Project access required                                                       | EXPENSE_RECEIPT_PROJECT_ACCESS_REVOKED       | —           | contact_project_owner |
| Active account required                                                       | EXPENSE_ACCOUNT_INACTIVE                     | —           | contact_owner         |
| Live authenticated session required                                           | EXPENSE_SESSION_ENDED                        | —           | sign_in_again         |
| Read-only role                                                                | EXPENSE_READ_ONLY_ROLE                       | —           | contact_owner         |
| Upload conflicts with existing content                                        | EXPENSE_RECEIPT_DUPLICATE_CONTENT            | —           | review_expenses       |
| Expense not found                                                             | EXPENSE_RECORD_UNAVAILABLE                   | —           | review_expenses       |
| Crew expense request ID required                                              | EXPENSE_CREW_REQUEST_ID_INVALID              | requestId   | review_expense        |
| Money exceeds safe SQLite integer range                                       | EXPENSE_AMOUNT_TOO_LARGE                     | amount      | correct_field         |
| Project assignment access required                                            | EXPENSE_PROJECT_ACCESS_REQUIRED              | —           | contact_project_owner |
| Project manager project scope required                                        | EXPENSE_PROJECT_ACCESS_REQUIRED              | —           | contact_project_owner |
| Owner administration required to record for another worker                    | EXPENSE_OWNER_ENTRY_REQUIRED                 | workerId    | contact_project_owner |
| Active worker assignment required                                             | EXPENSE_ASSIGNMENT_REQUIRED                  | spentOn     | contact_project_owner |
| Expense ownership required                                                    | EXPENSE_OWNERSHIP_REQUIRED                   | —           | contact_project_owner |
| Expense ownership or admin rights required                                    | EXPENSE_OWNERSHIP_REQUIRED                   | —           | contact_project_owner |
| Crew expense access required                                                  | EXPENSE_CREW_ACCESS_REQUIRED                 | —           | contact_project_owner |
| Active project crew delegation required                                       | EXPENSE_CREW_ACCESS_REQUIRED                 | —           | contact_project_owner |
| Valid project timezone required for crew access                               | EXPENSE_PROJECT_TIMEZONE_REQUIRED            | —           | contact_project_owner |
| Crew time record access required                                              | EXPENSE_CREW_TIME_ACCESS_REQUIRED            | timeEntryId | review_time           |
| Crew expense request was withdrawn                                            | EXPENSE_CREW_REQUEST_WITHDRAWN               | —           | review_expenses       |
| Crew expense drafts must be withdrawn with a reason                           | EXPENSE_CREW_DELETE_REQUIRES_WITHDRAWAL      | —           | review_expense        |
| Expense changed before submission                                             | EXPENSE_SUBMISSION_CHANGED                   | —           | review_expense        |
| Expense is not a draft for submission                                         | EXPENSE_SUBMISSION_NOT_DRAFT                 | —           | review_expense        |
| Expense receipt required for submission                                       | EXPENSE_SUBMISSION_RECEIPT_REQUIRED          | —           | review_expenses       |
| Expense locked before submission                                              | EXPENSE_SUBMISSION_LOCKED                    | —           | contact_finance       |
| Only an unlocked editable expense draft can change                            | EXPENSE_NOT_EDITABLE_DRAFT                   | —           | review_expense        |
| Expense changed or cannot be edited                                           | EXPENSE_DRAFT_CHANGED                        | —           | review_expense        |
| A committed receipt is required                                               | EXPENSE_RECEIPT_REQUIRED                     | receipt     | attach_receipt        |
| This receipt is already claimed by a project expense                          | EXPENSE_RECEIPT_ALREADY_CLAIMED              | receipt     | review_expense        |
| Crew expense retry has changed                                                | EXPENSE_RETRY_CHANGED                        | —           | review_expense        |
| Active project assignment required                                            | EXPENSE_ASSIGNMENT_REQUIRED                  | spentOn     | contact_project_owner |
| A matching active time record is required                                     | EXPENSE_TIME_LINK_INVALID                    | timeEntryId | review_time           |
| Expense amount must be positive                                               | EXPENSE_AMOUNT_INVALID                       | amount      | correct_field         |
| Receipt must belong to the expense project                                    | EXPENSE_RECEIPT_PROJECT_MISMATCH             | receipt     | attach_receipt        |
| A linked correction draft cannot be edited                                    | EXPENSE_CORRECTION_DRAFT_LOCKED              | —           | review_expense        |
| Committed owned receipt required                                              | EXPENSE_RECEIPT_NOT_AVAILABLE                | receipt     | attach_receipt        |
| Receipt content is already registered to another record                       | EXPENSE_RECEIPT_ALREADY_REGISTERED           | receipt     | review_expense        |
| Only never-submitted drafts can be deleted                                    | EXPENSE_DELETE_DRAFT_ONLY                    | —           | review_expense        |
| Linked time and meal drafts must be withdrawn together                        | LINKED_DRAFT_DELETE_REQUIRES_PAIR_WITHDRAWAL | —           | review_expense        |
| Linked time and meal drafts must be submitted together                        | LINKED_DRAFT_SUBMIT_TOGETHER                 | —           | review_time           |
| Submit the linked time draft before its meal expense                          | LINKED_MEAL_TIME_DRAFT                       | —           | review_time           |
| Linked time and meal no longer match for submission                           | LINKED_MEAL_TIME_UNAVAILABLE                 | —           | review_time           |
| Linked time and meal drafts must be withdrawn before editing                  | LINKED_DRAFT_EDIT_TOGETHER                   | —           | review_expense        |
| Only never-submitted expense drafts can be deleted; use a reasoned correction | EXPENSE_DELETE_DRAFT_ONLY                    | —           | review_expense        |
| Billed or locked expenses cannot be deleted                                   | EXPENSE_BILLED_OR_LOCKED                     | —           | contact_finance       |
| Expense changed before deletion                                               | EXPENSE_DELETE_CHANGED                       | —           | review_expense        |
| Record changed before deletion                                                | EXPENSE_DELETE_CHANGED                       | —           | review_expense        |

### Reports / workforce

| Repository condition                                                             | Problem code                                  | Field             | Existing remedy            |
| -------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- | -------------------------- |
| Correction reason is required                                                    | EXPENSE_CORRECTION_REASON_INVALID             | reason            | enter_reason               |
| Correction reason must contain at least 3 characters                             | EXPENSE_CORRECTION_REASON_INVALID             | reason            | enter_reason               |
| Original record not found                                                        | EXPENSE_CORRECTION_RECORD_UNAVAILABLE         | —                 | review_expenses            |
| Expense not found                                                                | EXPENSE_CORRECTION_RECORD_UNAVAILABLE         | —                 | review_expenses            |
| Correction request payload conflicts with prior replay                           | EXPENSE_CORRECTION_RETRY_CHANGED              | —                 | review_expense             |
| A correction draft already exists for this original record                       | EXPENSE_CORRECTION_ALREADY_EXISTS             | —                 | review_expense             |
| Only approved or reviewer-returned expenses can create a correction draft        | EXPENSE_CORRECTION_STATE_BLOCKED              | —                 | review_expense             |
| Financially finalized records require a finance correction                       | EXPENSE_CORRECTION_FINANCIALLY_FINALIZED      | —                 | contact_finance            |
| Reimbursed expense requires an explicit adjustment                               | EXPENSE_CORRECTION_REIMBURSED                 | —                 | contact_finance            |
| Returned correction changed before retry creation                                | EXPENSE_CORRECTION_CHANGED                    | —                 | review_expense             |
| Change at least one operational field before creating a correction               | EXPENSE_CORRECTION_NO_CHANGES                 | —                 | review_expense_fields      |
| Expense category is invalid                                                      | EXPENSE_CORRECTION_CATEGORY_INVALID           | category          | review_expense_fields      |
| Expense amount is invalid                                                        | EXPENSE_CORRECTION_AMOUNT_INVALID             | amount            | review_expense_fields      |
| Expense occurrence time is invalid                                               | EXPENSE_CORRECTION_OCCURRENCE_TIME_INVALID    | occurredTimeLocal | review_expense_fields      |
| Expense description is too short                                                 | EXPENSE_CORRECTION_DESCRIPTION_INVALID        | description       | review_expense_fields      |
| Related logged hours are invalid                                                 | EXPENSE_CORRECTION_TIME_LINK_INVALID          | timeEntryId       | review_expense_fields      |
| Related logged hours no longer match the corrected expense                       | EXPENSE_CORRECTION_TIME_LINK_INVALID          | timeEntryId       | review_expense_fields      |
| Withdrawal reason is required                                                    | EXPENSE_CORRECTION_WITHDRAW_REASON_INVALID    | reason            | enter_reason               |
| Correction withdrawal is invalid                                                 | EXPENSE_CORRECTION_WITHDRAW_FIELDS_INVALID    | —                 | review_expense             |
| Correction draft changed before withdrawal                                       | EXPENSE_CORRECTION_WITHDRAW_CHANGED           | —                 | review_expense             |
| Only an unreviewed correction draft can be withdrawn                             | EXPENSE_CORRECTION_WITHDRAW_REVIEWED          | —                 | review_expense             |
| Read-only role                                                                   | REPORT_READ_ONLY_ROLE                         | —                 | contact_project_owner      |
| Record not found                                                                 | RECORD_UNAVAILABLE                            | —                 | review_report              |
| Record creator access required                                                   | RECORD_DELETE_CREATOR_REQUIRED                | —                 | contact_project_owner      |
| Financially linked records cannot be deleted                                     | RECORD_LOCKED                                 | —                 | contact_project_owner      |
| Correction drafts are immutable and cannot be deleted                            | RECORD_CORRECTION_DRAFT_IMMUTABLE             | —                 | review_report              |
| Technical reports with changes cannot be deleted                                 | REPORT_TECHNICAL_CHANGES_LINKED               | —                 | review_report              |
| Record approval history cannot be deleted                                        | RECORD_REVIEW_HISTORY_LOCKED                  | —                 | review_report              |
| This time entry is linked to another record and cannot be deleted                | TIME_DELETE_LINKED_RECORD                     | —                 | review_time                |
| Linked time and meal drafts must be withdrawn together                           | LINKED_DRAFT_DELETE_REQUIRES_PAIR_WITHDRAWAL  | —                 | review_expense             |
| Report access required                                                           | REPORT_ACCESS_REQUIRED                        | —                 | contact_project_owner      |
| Report submission access required                                                | REPORT_SUBMISSION_ACCESS_REQUIRED             | —                 | contact_project_owner      |
| Report not found                                                                 | REPORT_NOT_FOUND                              | —                 | review_reports             |
| Sign in required                                                                 | REPORT_SIGN_IN_REQUIRED                       | —                 | sign_in_again              |
| Report edit access required                                                      | REPORT_EDIT_ACCESS_REQUIRED                   | —                 | contact_project_owner      |
| Active account required                                                          | REPORT_ACTIVE_ACCOUNT_REQUIRED                | —                 | contact_project_owner      |
| Project review required                                                          | REPORT_ASSIGNMENT_REQUIRED                    | —                 | contact_project_owner      |
| Technical report date provenance must be native                                  | REPORT_DATE_PROVENANCE_CHANGED                | —                 | review_report              |
| Downtime must be between 0 and 1440 minutes                                      | REPORT_DOWNTIME_INVALID                       | downtimeMinutes   | review_report_fields       |
| Report changed or cannot be edited                                               | REPORT_DRAFT_CHANGED                          | —                 | review_report              |
| Report changed before submission                                                 | REPORT_SUBMISSION_CHANGED                     | —                 | review_report              |
| Report status blocks submission                                                  | REPORT_SUBMISSION_STATE_BLOCKED               | —                 | review_report              |
| Submitted or approved reports require an audited correction draft before editing | REPORT_CORRECTION_REQUIRED                    | —                 | request_report_correction  |
| This report is part of a finalized report and cannot be edited                   | REPORT_FINALIZED                              | —                 | review_report              |
| A linked correction draft cannot be edited                                       | REPORT_CORRECTION_DRAFT_LOCKED                | —                 | review_report              |
| Only never-submitted draft reports can be deleted                                | REPORT_DELETE_DRAFT_ONLY                      | —                 | review_report              |
| Only never-submitted drafts can be deleted                                       | RECORD_DELETE_DRAFT_ONLY                      | —                 | review_report              |
| Report approval history cannot be deleted                                        | REPORT_REVIEW_HISTORY_LOCKED                  | —                 | review_report              |
| Finalized reports cannot be deleted                                              | REPORT_FINALIZED                              | —                 | review_report              |
| Remove linked technical changes before deleting this report                      | REPORT_LINKED_TECHNICAL_CHANGES               | —                 | review_report              |
| Record changed before deletion                                                   | RECORD_DELETE_CHANGED                         | —                 | review_report              |
| Report changed or cannot be deleted                                              | REPORT_DELETE_CHANGED                         | —                 | review_report              |
| Report is not submitted                                                          | REPORT_REVIEW_STATE_CHANGED                   | —                 | review_report              |
| Active project required for report submission                                    | REPORT_PROJECT_NOT_ACTIVE                     | —                 | contact_project_owner      |
| Operational project access required                                              | REPORT_PROJECT_NOT_ACTIVE                     | —                 | contact_project_owner      |
| Project assignment access required                                               | REPORT_ASSIGNMENT_REQUIRED                    | —                 | contact_project_owner      |
| Effective project assignment required for submission                             | REPORT_ASSIGNMENT_REQUIRED                    | —                 | contact_project_owner      |
| Active project assignment required                                               | REPORT_ASSIGNMENT_REQUIRED                    | —                 | contact_project_owner      |
| Safety-related changes require validation and rollback details                   | REPORT_SAFETY_DETAILS_REQUIRED                | validation        | review_report              |
| Project access required                                                          | TECHNICAL_CHANGE_PROJECT_ACCESS_REQUIRED      | —                 | contact_project_owner      |
| Technical change submission access required                                      | TECHNICAL_CHANGE_SUBMISSION_ACCESS_REQUIRED   | —                 | contact_project_owner      |
| Active project required for technical change submission                          | TECHNICAL_CHANGE_PROJECT_NOT_ACTIVE           | —                 | contact_project_owner      |
| Effective project assignment required for technical change submission            | TECHNICAL_CHANGE_ASSIGNMENT_REQUIRED          | —                 | contact_project_owner      |
| Technical change changed or cannot be submitted                                  | TECHNICAL_CHANGE_SUBMISSION_CHANGED           | —                 | review_reports             |
| Technical report does not belong to the project                                  | TECHNICAL_CHANGE_REPORT_MISMATCH              | technicalReportId | review_report_fields       |
| Safety-impacting changes require validation and rollback information             | TECHNICAL_CHANGE_SAFETY_DETAILS_REQUIRED      | validation        | review_report_fields       |
| A correction draft already exists for this original record                       | TIME_CORRECTION_ALREADY_EXISTS                | —                 | review_time                |
| Correction request payload conflicts with prior replay                           | TIME_CORRECTION_RETRY_CHANGED                 | —                 | review_time                |
| Only approved or reviewer-returned time can create a correction draft            | TIME_CORRECTION_STATE_BLOCKED                 | —                 | review_time                |
| Financially finalized records require a finance correction                       | TIME_CORRECTION_FINANCIALLY_FINALIZED         | —                 | contact_finance            |
| Settled compensation time requires an explicit adjustment                        | TIME_CORRECTION_SETTLED_COMPENSATION          | —                 | contact_finance            |
| Returned correction changed before retry creation                                | TIME_CORRECTION_RETURNED_CHANGED              | —                 | review_time                |
| Correction reason is required                                                    | TIME_CORRECTION_REASON_INVALID                | reason            | enter_reason               |
| Correction reason must contain at least 3 characters                             | TIME_CORRECTION_REASON_INVALID                | reason            | enter_reason               |
| Time entry not found                                                             | TIME_CORRECTION_RECORD_UNAVAILABLE            | —                 | review_week                |
| Original record not found                                                        | TIME_CORRECTION_RECORD_UNAVAILABLE            | —                 | review_week                |
| Correction draft changed before withdrawal                                       | TIME_CORRECTION_WITHDRAW_CHANGED              | —                 | review_time                |
| Only an unreviewed correction draft can be withdrawn                             | TIME_CORRECTION_WITHDRAW_REVIEWED             | —                 | review_time                |
| Correction withdrawal access required                                            | TIME_CORRECTION_WITHDRAW_ACCESS_REQUIRED      | —                 | contact_project_owner      |
| Delegated correction withdrawal requires crew authorization                      | TIME_CORRECTION_WITHDRAW_CREW_ACCESS_REQUIRED | —                 | contact_project_owner      |
| Live authenticated session required                                              | TIME_CORRECTION_WITHDRAW_SESSION_EXPIRED      | —                 | sign_in_again              |
| Withdrawal reason is required                                                    | TIME_CORRECTION_WITHDRAW_REASON_INVALID       | reason            | enter_reason               |
| Correction withdrawal is invalid                                                 | TIME_CORRECTION_WITHDRAW_REQUEST_INVALID      | —                 | review_time                |
| Worker must have an effective project assignment for the planning window         | PLANNING_WORKER_NOT_ASSIGNED                  | startsAt          | review_worker_assignments  |
| Skill code already exists                                                        | SKILL_CODE_EXISTS                             | code              | review_skills              |
| Skill not found                                                                  | SKILL_NOT_FOUND                               | skillId           | review_skills              |
| Active worker not found                                                          | WORKFORCE_WORKER_UNAVAILABLE                  | workerId          | review_workers             |
| Skill administration required                                                    | SKILL_ADMIN_ACCESS_REQUIRED                   | —                 | contact_owner              |
| Worker skill ownership required                                                  | WORKER_SKILL_OWNERSHIP_REQUIRED               | —                 | review_own_skills          |
| Worker is outside the project scope                                              | WORKER_SKILL_SCOPE_CHANGED                    | —                 | contact_project_owner      |
| Worker is not in your active projects                                            | WORKER_SKILL_SCOPE_CHANGED                    | —                 | contact_project_owner      |
| Worker availability ownership required                                           | AVAILABILITY_OWNERSHIP_REQUIRED               | —                 | review_availability        |
| Worker availability is outside the project scope                                 | AVAILABILITY_SCOPE_CHANGED                    | —                 | contact_project_owner      |
| Availability changed before update                                               | AVAILABILITY_CHANGED                          | —                 | review_availability        |
| Availability id and version are required together                                | AVAILABILITY_BINDING_INVALID                  | version           | review_availability        |
| Availability dates must be valid                                                 | AVAILABILITY_DATES_INVALID                    | startsAt          | review_availability_fields |
| Availability end must follow start                                               | AVAILABILITY_WINDOW_INVALID                   | endsAt            | review_availability_fields |
| report:A reason is required                                                      | APPROVAL_REVIEW_REASON_REQUIRED               | reason            | enter_reason               |
| report:Report not found                                                          | APPROVAL_REPORT_UNAVAILABLE                   | —                 | review_approval_queue      |
| report:Report is not submitted                                                   | APPROVAL_REPORT_NOT_SUBMITTED                 | —                 | review_updated_record      |
| technical_change:A review reason is required                                     | APPROVAL_REVIEW_REASON_REQUIRED               | reason            | enter_reason               |
| technical_change:Technical change not found                                      | APPROVAL_TECHNICAL_CHANGE_UNAVAILABLE         | —                 | review_approval_queue      |
| technical_change:Technical change is not submitted                               | APPROVAL_TECHNICAL_CHANGE_NOT_SUBMITTED       | —                 | review_approval_queue      |
| milestone:A rejection reason is required                                         | APPROVAL_REVIEW_REASON_REQUIRED               | reason            | enter_reason               |
| milestone:Milestone not found                                                    | APPROVAL_MILESTONE_UNAVAILABLE                | —                 | review_approval_queue      |
| milestone:Submitted milestone required                                           | APPROVAL_MILESTONE_NOT_SUBMITTED              | —                 | review_approval_queue      |

### Crew

| Repository condition                                            | Problem code                       | Field        | Existing remedy       |
| --------------------------------------------------------------- | ---------------------------------- | ------------ | --------------------- |
| Crew chief access required                                      | CREW_CHIEF_ROLE_REQUIRED           | —            | contact_project_owner |
| Owner administration required                                   | CREW_OWNER_ROLE_REQUIRED           | —            | contact_project_owner |
| Active account required                                         | CREW_ACCOUNT_INACTIVE              | —            | contact_project_owner |
| Live authenticated session required                             | CREW_SESSION_EXPIRED               | —            | sign_in_again         |
| Crew time entry access required                                 | CREW_TIME_ACCESS_REQUIRED          | —            | review_crew_day       |
| Crew time entry delegation changed                              | CREW_DELEGATION_CHANGED            | —            | contact_project_owner |
| Valid project timezone required for crew access                 | CREW_PROJECT_TIMEZONE_REQUIRED     | —            | contact_project_owner |
| Choose shared or individual hours                               | CREW_HOUR_MODE_REQUIRED            | mode         | review_crew_day       |
| Batch request is too short                                      | CREW_BATCH_REQUEST_INVALID         | —            | review_crew_day       |
| Batch request is required                                       | CREW_BATCH_REQUEST_REQUIRED        | —            | review_crew_day       |
| Crew duration entries cannot include an inferred clock interval | CREW_INTERVAL_NOT_ALLOWED          | —            | review_crew_day       |
| Shared receipt request ID is invalid                            | CREW_RECEIPT_REQUEST_INVALID       | —            | review_receipts       |
| Receipt access required                                         | CREW_RECEIPT_ACCESS_REQUIRED       | —            | review_receipts       |
| Shared receipt needs one worker or company payer                | CREW_RECEIPT_PAYER_INVALID         | expenseId    | review_receipts       |
| Receipt amount is invalid                                       | CREW_RECEIPT_AMOUNT_INVALID        | expenseId    | review_receipts       |
| Enter each receipt allocation as an amount such as 6.50         | CREW_RECEIPT_AMOUNT_FORMAT_INVALID | timeEntryIds | review_receipts       |
| Each receipt allocation must be positive                        | CREW_RECEIPT_AMOUNT_FORMAT_INVALID | timeEntryIds | review_receipts       |
| Active crew delegation already exists                           | CREW_DELEGATION_EXISTS             | —            | review_delegations    |
| Both people must be assigned to the project on the start date   | CREW_ASSIGNMENT_REQUIRED           | startsOn     | contact_project_owner |
| Active project crew delegation required                         | CREW_DELEGATION_NOT_ACTIVE         | workDate     | contact_project_owner |
| Active worker accounts required                                 | CREW_WORKER_INACTIVE               | —            | contact_project_owner |
| Chief and worker must be different people                       | CREW_SAME_PERSON                   | workerUserId | review_delegations    |
| End date must follow start date                                 | CREW_DATE_ORDER_INVALID            | endsOn       | review_delegations    |
| Start date must be a date                                       | CREW_GRANT_START_DATE_INVALID      | startsOn     | review_delegations    |
| Start date must be a real date                                  | CREW_GRANT_START_DATE_INVALID      | startsOn     | review_delegations    |
| End date must be a date                                         | CREW_GRANT_END_DATE_INVALID        | endsOn       | review_delegations    |
| End date must be a real date                                    | CREW_GRANT_END_DATE_INVALID        | endsOn       | review_delegations    |
| Active crew delegation not found                                | CREW_DELEGATION_RECORD_CHANGED     | —            | review_delegations    |
| Batch request was used with different values                    | CREW_BATCH_RETRY_CHANGED           | —            | review_crew_day       |
| Select 1 to 100 crew members                                    | CREW_MEMBERS_REQUIRED              | workerIds    | review_crew_day       |
| Enter valid shared minutes                                      | CREW_SHARED_HOURS_INVALID          | sharedHours  | review_crew_day       |
| Enter valid minutes for each crew member                        | CREW_INDIVIDUAL_HOURS_INVALID      | workerIds    | review_crew_day       |
| Time entry changed or cannot be submitted                       | CREW_TIME_SUBMISSION_CHANGED       | —            | review_crew_day       |
| Shared receipt retry has changed                                | CREW_RECEIPT_RETRY_CHANGED         | —            | review_receipts       |
| Choose 2 to 100 crew time rows                                  | CREW_RECEIPT_ROWS_REQUIRED         | timeEntryIds | review_receipts       |
| Each selected crew time row needs a distinct positive amount    | CREW_RECEIPT_AMOUNTS_INVALID       | timeEntryIds | review_receipts       |
| Unallocated chief-entered receipt required                      | CREW_RECEIPT_UNAVAILABLE           | expenseId    | review_receipts       |
| Crew time and receipt project/date must match                   | CREW_RECEIPT_SCOPE_MISMATCH        | timeEntryIds | review_receipts       |
| Crew allocations must equal the receipt amount exactly          | CREW_RECEIPT_TOTAL_MISMATCH        | timeEntryIds | review_receipts       |
| Allocate the shared receipt to at least two different workers   | CREW_RECEIPT_WORKERS_REQUIRED      | timeEntryIds | review_receipts       |
| Include the receipt payer/attribution worker in the allocation  | CREW_RECEIPT_PAYER_REQUIRED        | timeEntryIds | review_receipts       |
| Include the time row already linked to this receipt             | CREW_RECEIPT_LINKED_TIME_REQUIRED  | timeEntryIds | review_receipts       |

### Crew detail

| Repository condition                                       | Problem code                    | Field         | Existing remedy       |
| ---------------------------------------------------------- | ------------------------------- | ------------- | --------------------- |
| Active account required                                    | CREW_ACCOUNT_INACTIVE           | —             | contact_project_owner |
| Live authenticated session required                        | CREW_SESSION_EXPIRED            | —             | sign_in_again         |
| Valid project timezone required for crew access            | CREW_PROJECT_TIMEZONE_REQUIRED  | —             | contact_project_owner |
| Work date must be a date                                   | CREW_WORK_DATE_INVALID          | workDate      | review_time           |
| Work date must be a real date                              | CREW_WORK_DATE_INVALID          | workDate      | review_time           |
| Work performed is required                                 | CREW_SUMMARY_REQUIRED           | summary       | review_time           |
| Correction reason is required                              | CREW_CORRECTION_REASON_REQUIRED | reason        | review_time           |
| A valid draft version is required                          | CREW_DRAFT_VERSION_INVALID      | —             | review_time           |
| Crew time entry access required                            | CREW_TIME_ACCESS_REQUIRED       | —             | contact_project_owner |
| Crew chief access required                                 | CREW_CHIEF_ROLE_REQUIRED        | —             | contact_project_owner |
| Time intervals cannot overlap for the same worker and date | CREW_TIME_INTERVAL_OVERLAP      | workDate      | review_time           |
| A worker cannot enter more than 1440 minutes per day       | CREW_TIME_DAILY_LIMIT           | workDate      | review_time           |
| This crew draft changed. Reload it before saving.          | CREW_DRAFT_CHANGED              | —             | review_time           |
| This crew draft changed. Reload it before discarding.      | CREW_DRAFT_CHANGED              | —             | review_time           |
| Only a never-submitted crew draft can change               | CREW_DRAFT_NOT_EDITABLE         | —             | review_time           |
| This crew time changed. Reload it before correcting.       | CREW_CORRECTION_STALE           | —             | review_time           |
| Only reviewer-returned crew time can be corrected here     | CREW_CORRECTION_STATE_BLOCKED   | —             | review_time           |
| Crew time entry delegation changed                         | CREW_DELEGATION_CHANGED         | —             | contact_project_owner |
| Active project crew delegation required                    | CREW_DELEGATION_NOT_ACTIVE      | workDate      | contact_project_owner |
| Choose a valid time category                               | CREW_CATEGORY_INVALID           | category      | review_time           |
| Enter 1 to 1440 minutes                                    | CREW_DURATION_INVALID           | durationHours | review_time           |
| Time entry changed or cannot be submitted                  | CREW_TIME_SUBMISSION_CHANGED    | —             | review_time           |

## Verification

Full Svelte diagnostics additionally reported 102 errors/11 warnings in inherited or concurrently owned files; this is not recorded as a passing Svelte gate. The two owned inherited Expense/Report type diagnostics were repaired; shared-modal and other packet validation remains with root.

- Portal TypeScript check passed after operational changes: `pnpm --filter @ja/portal typecheck`.
- Focused unit/handler regressions: `tests/unit/guided-operations-recovery.test.ts`, `time-operations-known-problems.test.ts`, `expense-domain-fallback-problems.test.ts`, `pm-approvals-ui.test.ts`: 53 tests passed, before the additional weekly-category regression.
- The new tests call actual weekly action handlers to prove all bad days resolve to visible fields and preserve full table values; crew failure tests prove worker/time selection is retained while bad amount/hour fields are targeted; framework failure instance identity is preserved.
- Additional existing filter/assigned-worker/published-assignment regressions passed: 8 files, 69 tests (before the final added malformed-category case).
- Browser validation of the shared popup remains with the root integration packet; the existing time project/worker filter fixture was repaired to use the authenticated owner browser session before recording seeded time, without weakening session validation.

- Broader existing lifecycle suites: `crew-shared-expense-allocation.test.ts` passed; `crew-leader-time.test.ts` had two failures and `time-week-batch.test.ts` had two failures, all `Project assignment access required` during fixture `createTimeEntry` at repository.ts:2207 before the modified handler/UI ran. Historical August assignment fixtures no longer cover current October access; server authorization was preserved. Aggregate of that run: 15 passed, 4 failed, before the final hours-wording update.
