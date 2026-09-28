# Post-deploy browser audit: operations — 2026-09-25

## Release and method

- Release under test: archive SHA-256 `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755` (release ID supplied by deploy lead; the portal does not expose a build identifier). Runs completed by approximately 12:20 UTC, before a subsequent correction release was announced.
- Origin: `https://j-aautomation.com/j-aautomation/app`; Playwright Chromium controlled the visible interface. Independent contexts with authorized saved test sessions for Owner, Project Manager, Worker 1/2; Worker 3–8 used one normal login attempt each where noted. No direct business SQL/API writes.
- Viewports: 390 × 844 and 1440 × 900 on the related expense flow; operational mutation checks at 390 × 844. New business data was confined to `C-0040-P-001 QA BROWSER AUDIT 20260924`, with `QA SYNTHETIC` labels. No real invoice, payment, email or customer record changed.
- Selected successful workflows were monitored for browser console errors, page exceptions and HTTP 4xx/5xx; none occurred in Time validation/draft/edit/delete and the related expense flow. Expected authorization responses in the separate role sweep are listed below. This is not a complete network or accessibility audit.

## Recheck of UX-04…08

| ID | UI gesture, role, state and persistence | Verdict on this release |
| --- | --- | --- |
| UX-04 | Worker 1, `/time`, **Log time → Save draft** empty at 390 px. Summary now names `Assigned project`, `Actual hours`, `Activity summary`; focus moves to project. Screenshot: `/home/kripta/production-browser-audit-20260924/postdeploy-ops-time-validation-390.png`. | **PASS** |
| UX-05 | Worker 1 created QA 3 min own Draft `01a0d878-44e9-72da-b1f4-71fc2f74f9a3`; its `/time/{id}` detail displayed **Edit draft**, **Submit**, **Delete draft**. **Edit draft** opened the populated sheet, summary edit persisted on reload. **Delete draft** requested browser confirmation; after acceptance it disappeared from `/time` and stayed absent after reload. Screenshot: `postdeploy-ops-time-draft-detail-390.png`. | **PASS for own Draft**. A linked correction Draft is intentionally a separate restricted state, and its workflow is blocked as described below. |
| UX-06 | Worker 1, approved QA time `01a0d82d-02e8-756b-b5db-2ab799f22109`, **Add related expense** at 390 and 1440 px. Filter chip now says `Worker: QA Worker 1` rather than UUID; persisted after reload. Screenshots: `postdeploy-ops-related-expense-{390,1440}.png`. | **PASS** |
| UX-07 | Same approved time detail after reload shows `SUBMITTED 25 Sept 2026, 12:47 CEST` and `APPROVED 25 Sept 2026, 12:48 CEST`, consistent with the displayed `Europe/Madrid` project timezone. | **PASS** |
| UX-08 | Same related expense form preselected QA project, `2026-09-25`, linked 10 min time record and `EUR`; `USD` and `BRL` remained available. EUR and named worker persisted after reload. Body scroll width equalled viewport width at both 390 and 1440 px. | **PASS** |

The linked-hours selector initially displayed `Loading linked hours…` during page load and resolved to the named 10 min entry after waiting; this was not counted as a failure. No expense was saved through this form.

## New critical correction workflow defect

### Time returned for changes — correction cannot address review request

1. Worker 1 created and submitted `01a0d879-2213-704b-b006-f8be95924c85`, six synthetic minutes on QA project, summary `QA SYNTHETIC correction workflow postdeploy 20260925`.
2. Project Manager used `/approvals` → **Review actions → Needs changes** with reason `QA synthetic correction test: clarify activity detail`.
3. Worker 1 opened the returned detail, followed **Open the Time register to create a corrected draft**, entered only `Correction reason` and clicked **Create corrected draft**.
4. Correction `01a0d879-d330-756d-b987-cab1f486d125` copied the same six minutes and unchanged activity summary. Its `/time/{id}` detail and list card display **Submit** but no **Edit** or **Delete**. Original links to it as **Open existing correction**. All states survived reload.

**Expected:** the worker can change the activity requested by the manager before the corrected record becomes a fixed linked version, or can withdraw and recreate an incorrect correction draft through an audited UI action. **Actual:** the only available next action submits unchanged content for another review. Severity: **high**, blocks correction. Screenshot: `/home/kripta/production-browser-audit-20260924/postdeploy-ops-linked-correction-draft-390.png`. This draft was left unsubmitted as evidence.

### Expense returned for changes — same blocker

1. Worker 2 submitted existing QA €0.04 expense `01a0d54d-c5a6-7033-9af4-dec17581f648` from `/expenses`.
2. Project Manager used `/approvals` → Expenses → **Review actions → Needs changes** with reason `QA synthetic correction test: clarify vendor`.
3. Worker 2 used **Create corrected draft**; the form captured only a correction reason.
4. Correction `01a0d87c-acba-741b-b56c-24ab2a7da341` copied the same vendor, amount and description. The list offers only **Submit**; its `/expenses/{id}` detail offers no Edit or Submit action. The original links to the new draft. The €0.04 QA correction remained Draft.

**Expected:** vendor can be corrected before linking the replacement, or a linked Draft can be safely withdrawn and recreated. **Actual:** the requested vendor clarification cannot be entered through the UI. Severity: **high**. Screenshot: `/home/kripta/production-browser-audit-20260924/postdeploy-ops-linked-expense-correction-390.png`.

After this test, the related expense form’s **Related logged hours** list showed two visually identical six-minute options for the returned Time original and linked Draft. They have different internal IDs but no state/version label, so a worker cannot distinguish them before linking a receipt. Severity: **medium** UX/data association risk.

## Daily report return workflow and secondary UX

Worker 2 submitted QA Daily report `01a0d54d-ccf7-76a8-b4b5-e783f9c8cadc`; Project Manager returned it via `/approvals` → Reports → **Review actions → Return**, with reason `QA synthetic correction test: clarify daily work summary`. The report detail at `/reports/{id}` showed an editable versioned **Modify report** form rather than a **Create corrected draft** action. Worker 2 changed Shift summary, clicked **Save changes and notify reviewers**, and version 4 content persisted on reload. Worker 2 then explicitly clicked **Submit** in `/reports`; state became Submitted after reload. Project Manager approved it; detail displayed Approved. This report correction path completed.

Two UX issues appeared during that valid flow:

- After **Save changes and notify reviewers**, state still read `Needs changes` because a separate Submit was required, but the success toast said `Report submitted for review.` Expected wording should state that changes were saved and identify the remaining Submit action. Severity: **medium**.
- After the successful v4 save and reload, the detail still offered a `Local recovery draft` captured at version 3 with Recover/Compare/Discard. It is stale relative to the persisted content and could invite an unintended rollback. Severity: **medium**. The VERSION area also showed raw ISO UTC and the change history displayed raw JSON; readability issue, low severity. Screenshot: `/home/kripta/production-browser-audit-20260924/postdeploy-ops-returned-report-390.png`.

## Role and object permission checks

Browser route navigation after login, no object mutation for this matrix. The QA project is `01a0d473-7f31-75cf-98e8-7aaec0a8b8fe`; Worker 1’s approved Time is `01a0d82d-02e8-756b-b5db-2ab799f22109`; Worker 2’s Expense correction and Daily report IDs appear above.

| Identity | Own/cross-object read results | Finance and project scope |
| --- | --- | --- |
| Worker 1 | Own Time 200; Worker 2 Expense 403, Worker 2 Daily report 404 | QA project 200; `/finance` 403 |
| Worker 2, Crew Chief | Worker 1’s Time 403; own Expense correction and Daily report 200 | QA project 200; `/finance` 403 |
| Project Manager | QA Time, Expense, Daily report, Project all 200 | `/finance` 403 |
| Owner test session | QA Time, Expense, Daily report, Project all 200 | `/finance` 200 |
| Worker 6, 7 and 8 | Each logged in through `/login` once; `/projects`, `/time`, `/expenses`, `/reports`, `/pay` returned 200 with no QA project visible | QA project object 403; `/finance` 403 for each |
| Worker 3, 4 and 5 | Each logged in through `/login` once; no route/object navigation was repeated in this pass | Further scope not tested this pass |

Worker 3–5 had been stopped by rate limiting in the preceding audit, but each normal login succeeded during this post-deploy pass. No retries or limiter changes were used. The 403/404 responses above are expected access outcomes, not transport errors. Role permutations outside this matrix remain untested.

## Other coverage and limits

At 390 px, Project Manager opened `/projects` → **Project calendar** and selected 24 September; three QA project events were visible, including `C-0040-P-001`. No day-action destination was followed in this pass, so the earlier navigation evidence remains the only proof of those links. No project, shift, receipt or customer invoice was created here. Two linked correction Drafts were deliberately left in place for remediation testing. A physical mobile device, keyboard-only session and full accessibility sweep were not performed.
