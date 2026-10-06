# Owner planning and expected-hours browser evidence · 6 October 2026

## Scope and environment

Actual Playwright Chromium browser sessions against the built application in an isolated clone of the saved BBS training database, initially at `http://127.0.0.1:5180/j-aautomation/app`. Project `C-0050-P-20261005` is fictional. Mutations used native visible forms/buttons; SQL was read-only validation. Production users, assignments, hours, money and data were not changed by this exercise.

Owner controls were exercised in the real Owner account context. Worker and Project Manager observations used separate role sessions. Cookies, credentials, raw page dumps and private browser helpers stay outside Git.

## Scenarios

| Scenario                                 | Actual browser action and saved result                                                                                                                                                                                                                                             | Result                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Multi-worker publication                 | Owner selected Chief, Technician 1 and Technician 2, October 20 08:00–16:00 UTC, eight planned hours. Three separate rows persisted as published with 480 minutes each.                                                                                                            | PASS                           |
| Planning does not fabricate actual time  | Immediately after publication, the scoped October 20 actual-time count was zero. The later 6 / 7 / 8 hours were separately entered by Worker/Chief, submitted and reviewed in the connected crew exercise.                                                                         | PASS                           |
| Dated expected working schedule          | Native Projects → Expected Working Schedule save effective October 19, weekday 480 / weekend 0 minutes. Existing America/New_York timezone was retained.                                                                                                                           | PASS                           |
| Actual versus expected                   | Separate Worker views after PM approval showed 6/8/−2 Needs note; 7/8/−1 Needs note; Chief 8 / 8 / 0 Approved. Underlying actual sources remained Approved.                                                                                                                        | PASS (connected crew evidence) |
| Planned versus expected                  | PM edited Worker 1 October 21 plan to three hours. The Worker agenda showed Planned 3 h; the same day's weekly target stayed 8 h with Actual 0.                                                                                                                                    | PASS                           |
| Membership is not today's published plan | Worker Today showed no published assignment for the current October 6 day, one assigned project and the future October 20 plan.                                                                                                                                                    | PASS                           |
| Expired planning eligibility             | Selecting November 1 in the Owner publish form left four covering internal/PM workers; the three supplier-personnel profiles whose membership ends October 31 were absent. No invalid publication was submitted.                                                                   | PASS                           |
| Missing expectation before membership    | Worker 1's September 28–30 weekly cells showed Expected / Difference — before the October 1 assignment; later days showed effective expectations.                                                                                                                                  | PASS                           |
| External plan publication                | Existing fictional External Technician was eligible on October 22; Owner published08:00–10:00 UTC/120 minutes. Restricted-profile interaction is covered by the external/supplier agent.                                                                                           | PASS publication               |
| Multiple-project target ambiguity        | Native Owner guard returned 409 and rolled back. With two explicitly authorized synthetic one-day rules and membership on October 23, the final Worker view showed Expected / Difference — for that day, while current project visibility and October 20 actuals stayed unchanged. | PASS                           |
| Generic worker goals                     | There is no generic Accept/Reject/Mark completed goal workflow. Documentation distinguishes published plans, expected hours, actual work/reports and project milestones. No nonexistent feature was fabricated.                                                                    | Capability boundary            |

## Fictional records

- Schedule: `01a110b8-7b2d-75aa-a217-a374bc4c52d7`.
- Chief October 20 plan: `01a110b7-cfb3-721d-953e-3d65ba033611`.
- Technician1 October 20 plan: `01a110b7-cfb5-77f3-bfd4-db97f1b9af86`.
- Technician2 October 20 plan: `01a110b7-cfb6-770e-93fb-a05151f4ebfe`.
- External Technician October 22 plan: `01a110b9-9c39-74eb-8673-632e9894e83a`.

The three main plan sites were corrected through their native Owner Save assignment controls and persisted as the fictional crew bench. Their saved plan minutes and UTC intervals stayed unchanged.

## Verification provenance and detected defect

A reproducible UI defect cleared Site and Required expertise when the operator entered them before checking a worker. Separate before/after browser dumps confirmed the clear without any POST. Selecting workers first and entering optional text last retained values; existing published record edits retained the corrected sites. Root implemented the form-state fix; post-fix browser outcomes are added below after the final runtime restart.

An initial post-build retest encountered HTTP 500 because a parallel E2E build replaced compiled server chunks beneath the active isolated server. No POST was made during that interruption. This is retained as harness provenance, not evidence that production or the planning feature failed. The subsequent clean final runtime retest is recorded separately.

## Privacy and screenshots

Screenshots are native browser crops with fictional BBS people and records. Weekly tables are cropped to exclude personal compensation estimates before reuse in the Project Manager guide. Owner or Project Manager form fields expose no client price, loaded cost, contribution or another worker's pay. Raw private page text is never evidence.

The updated Owner introduction preserves the existing detailed financial course. New chapters are inserted before the financial introduction and teach the connected planning cycle, date-effective expectation, UTC interpretation, goals boundary and troubleshooting. See `manifest.json` for screenshot hashes and final post-fix results.

## Final native recheck after the form fix

PASS. Owner at 1440 desktop and Project Manager at 390 phone entered Site and Required expertise before checking workers. Both fields, dates and 120 planned minutes remained after check / uncheck / recheck. The deliberate invalid end-before-start submission returned the expected HTTP400; correcting the end and publishing saved exact optional fields. Clean subsequent 1440 / 768 / 390 pages had zero page errors, zero console errors and zero unexpected HTTP errors; document width equalled viewport width.

Native saved Owner October 24 IDs: `01a110ca-3865-76a1-a608-2b46d2d111c6`, `01a110ca-3866-736e-8d05-2d7eaca844ec`. PM October 25 ID: `01a110cb-8ec5-763a-a2d0-050f04e2aadf`. All three are published 120-minute plans with exact fictional Site and Required expertise. Read-only validation found zero actual-time sources on October 24–25.

The final PM phone agenda was centred through native browser scrolling so all three October 20 worker cards are visible above the fixed navigation. Owner weekly-table figure06 was recaptured by the crew agent with full day/date labels before the PDF build; its manifest hash describes that final image.

## Later authorized multiple-project fixture and discovered scope issue

The initial source-only check was followed by a newly authorized native browser exercise. An existing-finance-only assignment attempt returned the expected HTTP 409 and rolled back completely. The Owner then saved exactly two explicitly synthetic USD 1/hour rules, scoped only to the existing fictional onboarding project and October 23, plus a one-day Worker 1 membership. Original BBS and global terms were preserved; no second-project actual work or financial lifecycle event was created.

The actual Worker October 19 weekly screen still showed October 23 Expected8 rather than unknown, because future-only membership was not counted outside current project access. Root fixed the aggregate ambiguity count without exposing hidden project schedules or widening actual/project access. The final native browser retest after the stable restart returned 200, showed October 23Actual 0 h / Expected — / Difference —, and retained October 20Actual 6 h / Expected 8 h / Difference −2 h. The current Worker project selector still contained only BBS. Zero page errors, console errors or HTTP errors occurred; document width equalled 1440 viewport pixels. See the manifest for exact fixture IDs and scoped minor-unit values.

Final figure chronology: earlier weekly tables are the stage before the added October 23-only second assignment and legitimately show Friday eight expected hours / weekly forty hours. Later figure09 shows that Friday’s unknown target. It contains only operational hours; no prices, costs or compensation.
