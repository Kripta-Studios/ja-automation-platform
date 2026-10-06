# Project Manager planning browser evidence · 6 October 2026

## Scope

A genuine fictional Project Manager account used native browser controls in the isolated BBS app. It retained its existing dated project membership and operational review grant. No production project, account, time or money was changed. Credentials and raw page dumps are private outside Git.

## Executed scenarios

| Scenario                           | Result and verification                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized BBS planning visibility | PASS. PM calendar showed the Owner's three October 20 crew assignments.                                                                                                                                                                     |
| Native publication                 | PASS. Worker 1 October 21 08:00–10:00 UTC,120 minutes, fictional site persisted.                                                                                                                                                            |
| Edit and reopen                    | PASS. Save assignment changed the same record to 09:00–12:00UTC,180 minutes, updated site, version 2. The Worker agenda reflected the changed three-hour plan.                                                                              |
| Planned hours versus target        | PASS. Worker 1 October 21 Actual 0h/Expected 8 h remained independent of its three-hour plan.                                                                                                                                               |
| Cancel and retain history          | PASS. A separate Worker 2 October 22 12:00–14:00 UTC/120 minutes plan was cancelled. Calendar and Worker agenda omitted it; its database record retained cancelled status/version 2.                                                        |
| No fabricated actuals              | PASS. Read-only scoped counts stayed zero for Worker 1 October 21 and Worker 2 October 22 after their plan edit/cancel.                                                                                                                     |
| Connected operational review       | PASS in the crew agent's separate native PM session. The three October 20 actual sources (6/7/8h) were approved; Worker timesheets showed−2/−1/0 differences.                                                                               |
| Responsive planning                | Desktop1440, tablet 768 and phone 390 browser views were exercised. Tablet calendar and phone selected-day agenda screenshots are included.                                                                                                 |
| Worker missing expectation         | PASS in the separate Worker session. September 28–30 preceded assignment coverage and showed Expected / Difference —. The operational-only table is cross-referenced.                                                                       |
| Multiple-project ambiguity         | PASS. Native one-day second membership with two explicitly authorized synthetic scoped rules yielded October 23 Expected / Difference — after the narrow ambiguity fix. Current project visibility and October 20 actuals stayed unchanged. |

## Fictional records

- Edited Worker 1 October 21 plan: `01a110ba-9ea3-75ad-ad49-f01ce41eeb49`.
- Cancelled Worker 2 October 22 plan: `01a110bc-0896-76d5-a9fe-854b99064137`.

## Privacy and capability boundary

The Project Manager figures contain operational facts only. Cross-role Worker screenshots exclude compensation estimates; no client billing rate, company cost, margin or colleague pay is disclosed. The guide explains that published assignment changes do not change effective expected schedules or actual sources. It makes no claim that a generic goal acceptance/completion feature exists. Restricted External Technician navigation is explicitly distinguished from internal Worker agendas.

Optional Site/Required expertise were found to clear when a worker checkbox changed after typing; root's fix and final native PM recheck are recorded in the manifest. A temporary HTTP 500 while compiled files were replaced under the isolated server is retained as harness provenance and is not a production failure claim.

Two procedural chapters are placed beside the existing PM planning/update chapters, rather than appended after the financial or account instructions. See `manifest.json` for screenshot hashes, final diagnostics and post-fix outcomes.

## Final native recheck after the form fix

PASS. Owner at 1440 desktop and Project Manager at 390 phone entered Site and Required expertise before checking workers. Both fields, dates and 120 planned minutes remained after check / uncheck / recheck. The deliberate invalid end-before-start submission returned the expected HTTP400; correcting the end and publishing saved exact optional fields. Clean subsequent 1440 / 768 / 390 pages had zero page errors, zero console errors and zero unexpected HTTP errors; document width equalled viewport width.

Native saved Owner October 24 IDs: `01a110ca-3865-76a1-a608-2b46d2d111c6`, `01a110ca-3866-736e-8d05-2d7eaca844ec`. PM October 25 ID: `01a110cb-8ec5-763a-a2d0-050f04e2aadf`. All three are published 120-minute plans with exact fictional Site and Required expertise. Read-only validation found zero actual-time sources on October 24–25.

The final PM phone agenda was centred through native browser scrolling so all three October 20 worker cards are visible above the fixed navigation. Owner weekly-table figure06 was recaptured by the crew agent with full day/date labels before the PDF build; its manifest hash describes that final image.

## Later authorized multiple-project fixture and discovered scope issue

The initial source-only check was followed by a newly authorized native browser exercise. An existing-finance-only assignment attempt returned the expected HTTP 409 and rolled back completely. The Owner then saved exactly two explicitly synthetic USD 1/hour rules, scoped only to the existing fictional onboarding project and October 23, plus a one-day Worker 1 membership. Original BBS and global terms were preserved; no second-project actual work or financial lifecycle event was created.

The actual Worker October 19 weekly screen still showed October 23 Expected8 rather than unknown, because future-only membership was not counted outside current project access. Root fixed the aggregate ambiguity count without exposing hidden project schedules or widening actual/project access. The final native browser retest after the stable restart returned 200, showed October 23Actual 0 h / Expected — / Difference —, and retained October 20Actual 6 h / Expected 8 h / Difference −2 h. The current Worker project selector still contained only BBS. Zero page errors, console errors or HTTP errors occurred; document width equalled 1440 viewport pixels. See the manifest for exact fixture IDs and scoped minor-unit values.

Final figure chronology: earlier weekly tables are the stage before the added October 23-only second assignment and legitimately show Friday eight expected hours / weekly forty hours. Later figure09 shows that Friday’s unknown target. It contains only operational hours; no prices, costs or compensation.
