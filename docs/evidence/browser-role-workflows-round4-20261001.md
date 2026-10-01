# Browser-only role workflows — round 4, 2026-10-01

Requested real-role verification at https://j-aautomation.com/j-aautomation/app. Functional checks used Chromium UI: normal authenticated sessions, links, forms, selections, uploaded synthetic receipts, native dialogs, double-clicks and rendered results. No direct API calls, SQL assertions, repository calls, unit tests or integration tests simulated a workflow. Online snapshot preparation, static checks and deployment are separate operational work.

Credentials came from the VPS role-account manual. Passwords and session state are omitted. The existing owner browser session was used; new sign-ins covered Worker 1 (crew chief), Worker 2, Project Manager, Finance Administrator, Read-only Auditor, unassigned Worker 3, Supplier Coordinator and External Technician. The ordinary login rate limit was respected; an auditor sign-in was delayed and later succeeded without bypassing the limit.

## Synthetic project and recorded workflows

Owner created `C-0047-P-26100104`, QA ROLE WORKFLOWS ROUND4 20261001, project `01a0f76d-8a77-72bb-b57c-a9ebcb3e633e`, under the existing QA client C-0047. Three dated worker assignments use USD 20/hour internal cost and USD 15/hour compensation. The test manager was selected during project creation. All new work in this round belongs to this synthetic project; real customer examples and historical financial documents were preserved.

| Browser workflow | Result |
| --- | --- |
| Owner double-click Create project | One named project; no duplicate project. |
| Owner assign Workers 1, 2 and 4 | All three available in the project's delegation UI. Repeating Worker 2 assignment rejects overlap with actionable guidance. |
| Owner grant Worker 1 authority for Workers 2 and 4 | Both delegated people appear in the chief's entry form, with no compensation fields. |
| Chief double-click shared 1.25-hour save with immediate submission | Exactly two submitted records, one per worker; source IDs `01a0f770-ecc9-7138-bbf6-f1eb6e3f3904` and `01a0f770-eccb-7762-b67c-25bd06a208d5`. |
| Chief double-click USD 12.50 receipt expense for Worker 2 | One draft expense `01a0f771-68dc-77bc-8abf-73ec13abc699`; browser upload used a visibly synthetic receipt. |
| Chief allocate USD 6.00 + 6.00 against USD 12.50 | Specific exact-total error; no allocation saved, fields retained. |
| Chief correct to USD 6.00 + 6.50 and double-click save | One saved allocation, visibly labeled one expense. |
| Chief submit that expense; manager approve | Expense becomes Approved; no reimbursement/payment created. |
| Owner revoke Worker 4 delegation while chief has both workers selected | Stale double-click save rejects entire batch with current-access guidance. No partial Worker 2 save; 0.50 hours and summary retained. |
| Worker 2 view project time | Own delegated record visible; Worker 4's direct time URL returns 403 with generic access guidance and no record facts. |
| Manager return Worker 2 time with a specific reason | Original retains 1.25 hours and displays Needs changes/reason. |
| Worker 2 double-click corrected 1.50-hour draft and submit | One linked correction `01a0f774-1e96-7598-b4e3-0c4aa32c8d68`; original link/reason retained. |
| Manager double-click approvals for corrected Worker 2 and original Worker 4 | Corrected 1.50-hour and Worker 4 1.25-hour records become Approved. |
| Finance view project result | 2.75 actual hours, USD 55.00 loaded labor, zero issued/collected revenue. Original returned time is not added again. Expense commercial treatment is still incomplete, so no final financial expense result is certified. |
| Worker 2 enter 25 hours | Clear greater-than-zero/no-more-than-24 message, summary retained. |
| Worker 2 double-click own 14:00–15:00 draft | One draft on Oct 1. A second distinct Oct 2 draft was also saved during setup because the new form defaulted to that date; it is not counted as an overlap attempt. |
| Worker 2 attempt 14:30–15:30 explicitly on Oct 1 | Specific interval-overlap error; no third interval draft, entered values retained. |
| Worker, manager, Finance and auditor denied routes | Other-worker time, manager commercial finance, Finance owner-only management and auditor Approvals each return 403 with role-appropriate messages. |
| Supplier coordinator and technician sign in at 390px | Existing authorized supplier team and own technician time visible. No rates, pay or company financial figures in these inspected operational views. No new supplier records were written this round. |
| Unassigned Worker 3 sign in | No current/upcoming assignments on Today. Further unassigned-form checks remain covered by the earlier round, not rerun here. |

## Reproduced bug and correction

After a revoked delegation was replaced normally, the chief created two separate 0.25-hour draft fixtures and one USD 3.00 receipt draft `01a0f779-2f61-74ce-a472-c9843c5bac93`. Selecting the receipt, two shifts and USD 1.00 + 2.00, then changing date and choosing Show project produced **zero confirmation dialogs** and silently removed the allocation form. This is a separate bug from the previously fixed hours-entry guard.

The crew page now treats selected receipts, selected shifts and entered allocation amounts as unsaved work. Date/project changes and navigation warn about unsaved crew hours or receipt allocations. Cancel restores current filter controls and preserves the entire split and retry ID; accept clears both forms and rotates retry IDs. Submitting the allocation itself does not trigger a leave warning. Submitting another form warns before discarding the allocation. EN/ES/PT messages use the existing literal-override catalog.

## Candidate browser regression

Candidate on loopback 5182 uses an online database/private-file copy, a separate auth secret, no jobs runner and disabled mail. Functional tests remained browser-only.

- Cancel date change, project change and Add expense navigation: URL, actual filter context, receipt ID, both selected shifts, 1.00/2.00 amounts and allocation request ID all unchanged.
- Accept same-context refresh: receipt and amounts empty, all shifts unchecked, retry ID changed.
- Invalid 1.00 + 1.00 allocation: exact-total problem; fields and retry ID retained.
- Correct to 1.00 + 2.00 and double-click: zero leave-warning dialogs, one USD 3.00 allocation, visibly one expense.
- At 360/390/768/1440 the document width equals the viewport width. 390/1440 full-page screenshots visually inspected for readable allocation controls.
- Hydrated Spanish and Portuguese warnings rendered correctly and cancellation retained entered hours. Early scripted interactions before hydration were not counted as successful guard checks; stable hydrated rechecks passed.
- Independent read-only review: **SHIP**, no blocking findings in the two-file patch.

Static portal/global TypeScript checks, ESLint, formatting and diff-whitespace checks pass. No functional unit/integration tests were run, respecting the browser-only request.

Private evidence and synthetic receipt files: `/home/kripta/ja-browser-round4-20261001/` (directory 0700). Original stopped attempts remain in browser tool history; only the explicit completed checkpoints above are counted.

## Deployment and limits

Deployment completed through the established ZIP build, online backup and rollback procedure; final facts follow below.

Clearly named synthetic records remain for audit and live regression. No test invoice was issued/sent; no payment, reimbursement, mailbox change or customer signing occurred. This is representative multi-role workflow coverage, not certification of every route, every historic acceptance criterion, offline behavior, scanner quarantine, external email or a full restore drill.

Additional final browser facts: Auditor opened the synthetic project with read-only operational/finance facts; no create/edit project controls were exposed. The two own interval setup drafts were discarded through Worker 2’s normal Delete actions; the reloaded project register retained only the original returned entry, approved correction and separate 0.25-hour allocation fixture. The original script attempt to capture several final role views timed out while loading the auditor project during image building; its later fully loaded view was inspected, and no successful supplier/technician denied-route result is claimed from that interrupted script.


## Final production verification

Activated **2026-10-01 14:57:09 Europe/Madrid**.

- Release: `zip-9d175ee14b8a2825769d0a4d8d8eab52`.
- Archive SHA256: `9d175ee14b8a2825769d0a4d8d8eab52dc5d678875f5172a48b2404ff9d56567`.
- Pre-switch online database/files backup: `/var/backups/jaautomation/2026-10-01T125654059Z-1cb9fd40-2941-4b39-925a-f557d0f942f6`, seven documents, database SHA256 `de8b897e5f94114beb0c80e92300ed86e4e805cecd35385455b05803a8af4c4f`.
- Portal and site healthy; jobs service, jobs timer and backup timer active. Candidate preview stopped. Immediate previous release retained by the established deployment procedure.
- Canonical owner's Profile UI confirms `antonny.luty@j-aautomation.com`.
- Live crew-chief allocation cancellation passes at 360/390/768/1440: actual date restored, receipt/1.00/2.00 amounts/selected rows/request key retained; document width equals viewport. Cancelled Add expense navigation also retains the current allocation.
- Live double-click saves exactly one USD 3.00 allocation with no erroneous leave warning. A second preloaded browser tab with its own request key is rejected with **“This receipt is already allocated. Review the saved split before making another change.”** Attempted amounts remain visible for comparison; reloading the original tab still shows one expense and one saved split.
- Live phone allocation screenshot visually inspected. Full responsive/browser evidence is scoped to these affected screens.

Build dependency retries and memory pressure temporarily caused old-portal health checks to exceed their five-second timeout and a browser role view to load slowly. Finished role contexts were closed and preview stopped; health recovered before activation. Final deployed containers are healthy, with approximately 25 GB free disk. This transient operational limitation is recorded, not treated as a passing browser workflow. No unrelated VPS services were stopped or modified.

Implementation files were unchanged after packaging. Final evidence/checklist amendments remain in the integration checkout and are newer than the packaged report. No remote publication was performed.
