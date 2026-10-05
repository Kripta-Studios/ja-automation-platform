# Owner browser verification — 5 October 2026

Isolated loopback training copy of the platform, with a dedicated Playwright context. Production business data, mail recipients, accountant approval, signed documents and bank transfers were not created or changed. Only BBS LAB operational records were added. The existing BBS invoice example was left to the Finance packet.

## Current observed results

| Workflow | Result | Observed evidence |
|---|---|---|
| Local account creation | PASS | Team > Create user > Set email and password > Create user access created a new BBS LAB Worker, Active, zero project assignments. No email was sent. Cropped screenshots 04/05. |
| Account versus assignment | PASS | Projects > Assign Worker selected the new Worker and BBS Owner onboarding lab, assignment start 2 October, project defaults, then Assign. Team shows one assignment, zero actual hours before time entry. Screenshot 07. |
| Owner weekly table | PASS | Enter a week in a table, week of 28 September, selected Worker/project; Friday 8 hours and Saturday 1.5 hours saved as two drafts (480/90 minutes), blank days skipped. Screenshots 08/09. |
| Weekly draft submission | PASS | Submit this week > selected Worker > Submit all week drafts changed both ordinary drafts to Submitted. Screenshot 10 before the action; isolated database state checked after it. |
| Returned 8-hour source | PASS | Approvals > Review actions > Required change > Needs changes; original 8-hour row retained with the specific review reason. Screenshots 12/13. |
| Immutable 8-to-6-hour correction | PASS | Original detail > Create corrected draft, Actual hours 6, Correction reason, Create owner override draft. Linked correction retained the original reference; individual register Submit, operational Approve and Finance Billable > Record Finance review completed. Original remains 480 minutes/Needs changes; correction is 360 minutes/Approved/Billable. Screenshots 14/15/17/29/30. |
| Owner correction detail Submit fix | PASS | Separate Saturday source 1.5 hours returned, Owner correction created for 1 hour. Corrected detail now shows Submit; clicking it changed Draft to Submitted, then Approvals showed the item and operational approval succeeded. Screenshots 27/28/31. Original 90 minutes retained; corrected 60-minute row approved. |
| Duplicate source counting | PASS | Generated customer period for 2 October displays exactly 12.0 hours and two approved 6-hour sources (the previously saved lab technician plus the new Browser onboarding Worker). Superseded 8-hour rows are absent. New Worker's active approved rows total 7 hours across 2–3 October, rather than 16.5 hours including original versions. |
| Owner Daily report lifecycle | PASS | New daily report selected assigned Worker/project/date, summary/tasks/next-day plan; Save daily report > detail Submit for review > Approvals Reports > Approve report. Screenshots 33/36. |
| Customer/internal period generation | PASS | Refresh period reports disclosure > Open period refresh > project/date/language/content > Refresh reports generated separate customer and internal v2 records in review. Screenshot 37. |
| Customer-safe period content | PASS | Actual customer detail contained 12 hours, dates, activity, one approved Daily report and two time sources; no monetary amounts or rates. It displayed Needs report and required separate customer-report approval/PDF readiness. This is an observed browser content check, not a complete privacy penetration test. |
| Customer report approval/PDF readiness | PASS | Built candidate: Approve customer report > Generate report; isolated artifact runner completed canonical and English variant jobs. Exact v2/hash now Ready for signature; native English Download succeeded. PDF text contains 12.0 hours, two 6-hour sources, one Daily report and no money/rates. Screenshots 39/46/48. No customer sign-off was recorded. |
| Genuine signed-copy evidence | NOT RUN | No genuine customer signed PDF was supplied. No signature or signatory event was fabricated. |
| Technical/PLC report lifecycle | PASS | New technical report selected assigned Worker/project/date and required equipment/change/validation fields for a simulated bench. Actual save label: Save PLC report. Detail Submit for review > Approvals Reports > Approve report completed; fresh detail reads Approved. Screenshot 45 before approval; fresh detail status assertion confirmed Approved after it. No live PLC was changed. |
| Ordinary report correction affordance | PASS | Built candidate ordinary Daily draft retains Submit for review and has no Withdraw correction draft action. Technical draft likewise had no correction withdrawal before submission. Screenshot 47. |
| Invitation delivery, role change, offboarding | NOT RUN | Controls inspected; no access message sent and no existing person's access changed. |
| Crew delegation, planning/availability, suppliers | NOT RUN | No fresh lifecycle run in this packet. Existing source/manual evidence is distinct from a browser PASS. |
| Project closure/archive, private documents, Audit/Profile/Help | NOT RUN | No fresh full lifecycle run in this packet. |
| Portfolio/economic oversight, collections, compensation payments, reimbursements, Accounting Pack | SEPARATE PACKET | Finance agent owns the detailed evidence and financial changes. No real transfer or collection was represented by this Owner packet. |

The named account, correction and report procedures are executable observed lessons. The matrix does not claim all Owner functionality has passed an end-to-end onboarding test.

## Execution and diagnostics

Browser command: `/opt/jaautomation/runtime/node-v24.19.0/bin/node docs/evidence/bbs-owner-completion-20261005/owner/browser.mjs`. The script reads an external private cookie jar and records intermediate dumps outside the repository. Final public artifacts are scoped screenshots, this matrix and a screenshot hash manifest. Password values and activation links are not stored in public evidence.

One browser page/context was reused. Two Chromium target crashes accompanied host memory pressure and one Vite process restart; these are recorded as infrastructure interruptions, not application feature failures. After restart, the successful final report/Download verification emitted no page errors, console errors or HTTP errors. A harness navigation omitted the period segment and produced a 404; the correct /reports/period/:id route succeeded. This was a test navigation error. Harness mistakes (a readonly assignment role field, a details control queried as a button, and mixed click/fill ordering) were corrected; they are not reported as product defects.

## Product change and checks

The Owner correction detail Submit shortcut uses the existing authenticated submit command and version. It appears only for an unlocked draft correction authored by the active Owner. It grants no other-worker draft edit/delete permission. Submitted, approved, billed/locked and other-actor cases receive no shortcut.

Twelve focused predicate regression cases were executed by the integration lead. Browser evidence covers creation, Submit and the resulting review queue. Independent review of this shortcut is owned by the Finance agent; this packet independently reviewed the Finance diff in `review-finance.md`.

The ordinary report correction-withdrawal guard now requires an actual correction actor before offering the existing withdrawal action. It preserves draft/actor/Owner checks and command authorization. The existing nine-case worker-reports UI regression suite passed with Node 24, 512 MB heap and a single Vitest worker; stale assertions were updated to current derived status options, view/language-preserving action URLs and explicit Owner/Finance generation permission. No product behavior was broadened.

The approved customer v2 snapshot retains zero Technical records because the Technical example was approved afterward. A later Refresh reports creates a new version; it does not rewrite the approved version. Genuine customer signature capture, outbound dispatch and attachment upload remain NOT RUN.

Executed report regression command: `/opt/jaautomation/runtime/node-v24.19.0/bin/node --max-old-space-size=512 node_modules/vitest/vitest.mjs run tests/regression/worker-reports-ui.test.ts --maxWorkers=1 --no-file-parallelism` — 9 tests passed. Native customer PDF was saved only to the external private training-dump directory and inspected with `pdftotext`; the public capture manifest includes 26 scoped PNG files. Unusable fixed-sheet locator captures were discarded rather than published.
