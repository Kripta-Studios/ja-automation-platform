# Browser workflow verification — 2026-10-01

User-requested follow-up for the deployed portal. All functional verification used Chromium UI interactions, including sign-in, forms, uploads, double-clicks, filters and rendered results. No API, repository-method, SQL, unit or integration test was used to simulate a workflow. Static type checks, production compilation, online backup and the existing deployment procedure are separate operational checks.

Credentials came from the private VPS test-account manual and the owner credentials supplied for this session. Passwords are omitted here.

## Environments and records

- Production baseline: https://j-aautomation.com/j-aautomation/app, previous release `zip-b90d33add74cf307045c1a45fea4c781`.
- Candidate: loopback port 5182, online copy of the live database and private files, automatic upgrade through migration 0068. Candidate jobs were not started.
- Synthetic live client: `C-0047`, QA WORKFLOWS 20261001.
- Synthetic live project: `C-0047-P-261001`, project ID `01a0f698-e10e-7677-a76c-9552b26babd7`.
- Supplier check used the existing synthetic `C-0043-P-260926` project. Real customer examples were preserved.
- No synthetic invoice was issued/sent and no payment or reimbursement was recorded. QA records remain clearly named for audit.

## Browser results before activation

| Role / workflow | Observed result |
| --- | --- |
| Owner: create client and project, assign manager and two workers with dated rates | Live client/project and both worker memberships visible. |
| Owner: crew-chief delegation | Worker 1 delegated to register Worker 2 operational records in the synthetic project. |
| Crew chief: 2.50 hours for Worker 2, double-click save and submit | Exactly one submitted time entry. |
| Crew chief: linked meal, USD 11.00 with synthetic receipt, double-click save | Exactly one draft, submitted and approved by the manager. |
| Worker 1: own 1.75 hours, double-click save/submit | Exactly one time entry, approved by manager. |
| Worker 2: privacy | Sees own delegated approved 2.50 hours, does not see Worker 1 actual commissioning entry. |
| Worker 2: daily report, double-click save | One report, submitted and approved by project manager. Report ID `01a0f6ae-74ed-76bb-9d17-64ed6e2c73cf`. |
| Manager: time, expense and report reviews | Submitted records moved out of action queue. Finance route returns a clear 403 access message. |
| Finance administrator: project result | Synthetic project shows 4.25 actual hours and USD 85.00 loaded labor, zero issued/collected revenue. No financial lifecycle changed. |
| Auditor: reports and clients | Report visible, no create/edit controls; Approvals route denies access with a clear message. |
| Supplier coordinator: one technician, 0.50 hours, double-click batch save and submit | One traceable submitted entry, shown to the technician. |
| External technician | Own supplier-recorded entry visible, finance route denied; no financial figures in operational access. |
| Candidate owner: planning two workers with blank end/hours/site, double-click publish | Exactly two assignments, optional values remain blank in editor and start-only events display on calendar. |
| Candidate owner: overlapping batch containing existing worker and manager | Clear overlap error, no partial manager assignment; count remains two. Selection and fields retained after hydration. |
| Candidate owner: incomplete weekly expense row | Field/date error and “No drafts were saved”; both rows remain unsaved and entered amount retained. |
| Candidate owner: corrected weekly batch, USD 12.34 + 5.67, double-click save | Exactly two drafts and USD 18.01 total; Submit this week submitted both. |
| Candidate owner: attach receipt while editing weekly draft | Fake PNG rejected with content/type message, fields retained. Valid receipt saved. |
| Candidate owner: stale week in second tab after receipt edit | Submission rejected with refresh/review message; no draft submitted until reload and review. |
| Candidate worker: ordinary 1.25-hour double-click save | Exactly one own draft. |
| Candidate worker: ordinary USD 6.78 expense with receipt, double-click save | Exactly one own draft; calendar and weekly totals include it. |
| Candidate worker: 390px weekly entry table | Stacked daily fields, readable labels, no document overflow. |
| Candidate owner: client Create client action | Large red 88px-high action opens native client form; 390px form has no document overflow. |

## Navigation and responsive evidence

Published schedule Filter reproduced a jump to zero on the old build. Candidate preserves its scroll position (1896 → 1896) and Filter focus. Reports had an explicit results anchor overriding router no-scroll; same-page GET form anchors now preserve the working position. Reports Apply filters stayed 0 → 0 with button focus. Explicit section anchor links still navigate to their section.

Expense Apply filters preserved position and focus at 360px (3096 → 3096), 768px (2461 → 2461) and 1440px (2385 → 2385). Document widths equal viewport widths. Time Apply filters preserved 4146 → 4146 at 390px. Mobile weekly submit and stale-week recovery also succeeded.

Screenshots and operational logs are retained privately on this VPS at `/home/kripta/ja-workflow-browser-20261001/`, including `expense-week-stale.png`, `expense-week-mobile.png`, `expense-table-worker-mobile.png` and `client-create-mobile.png`. Screenshots are evidence of the stated step only.

## Changes and checks

- Expenses: weekly overview, day calendar, atomic daily table entry, version-checked weekly submission, receipt attachment on draft edit and durable retry protection.
- Planning: atomic multi-worker publish with retry protection; optional end/planned minutes/site. Nullable consumers in project calendar, access and forecasts preserve unknown versus explicit zero.
- Time: durable retry protection for ordinary time drafts as well as existing linked-meal/crew flows.
- Navigation: shared same-page filter/GET navigation retains scroll and focus; native same-page saves restore working scroll after reload.
- Clients: role-authorized large red create action.
- New messages and labels have EN/ES/PT coverage.
- Final portal TypeScript check and production build passed. Database/schema checks passed during implementation. `git diff --check` passed. Existing broader Svelte-check diagnostics remain outside this patch; no full clean Svelte suite is claimed.
- Independent read-only reviews found no remaining concrete blocker after nullable-consumer corrections and final navigation/style review.

This is representative workflow evidence for the requested changes, not proof of every possible route or the entire historic contractual acceptance suite. Offline synchronization, mail delivery, financial issuance/payment/reimbursement, scanner-enabled quarantine and full backup restoration were not exercised as browser workflows in this session.

## Activation

The source release is packaged and deployed through the existing VPS ZIP procedure, which builds images before switching, takes an online database/files backup, retains rollback images, and installs the existing jobs/backup timers. Activation completed at **2026-10-01 11:14:59 Europe/Madrid**.

- Release: `zip-48b9c4669fd2e5ad3ce6075381d0346c`.
- ZIP SHA-256: `48b9c4669fd2e5ad3ce6075381d0346ca75fc7531ae859be6873ba1098880814`.
- Active source: `/opt/jaautomation/releases/ja-automation-48b9c4669fd2e5ad3ce6075381d0346ca75fc7531ae859be6873ba1098880814`.
- Pre-switch online backup: `/var/backups/jaautomation/2026-10-01T091443186Z-831e2b2e-33db-4741-af9e-cbd6b3c32513` (database plus five private documents, including the generated synthetic report).
- Site and portal containers healthy; jobs container running; jobs and backup timers active. Deployment procedure's own health checks succeeded.

Live browser rechecks on the new release:

| Check | Result |
| --- | --- |
| Owner client CTA, 1440/390 | Red, 88px high; 320px wide at desktop; 390px document has no overflow. |
| Published schedule Filter | 1694 → 1694, focus remains Filter. |
| Owner publishes Worker 1 + Worker 2 for Oct 2 with blank optional fields, double-click | Exactly two assignments: `01a0f6bf-9040-71a3-a70f-df537852cac5`, `01a0f6bf-9042-7196-a40c-6ac51d0b4bdf`; optional fields remain blank. |
| Finance overview after publication | Actual hours remain 4.25, loaded labor USD 85.00, no detailed plan or fabricated planned duration. |
| Worker 2 planning privacy | Only their one assignment is visible, no publishing/editor controls. |
| Worker 2 weekly table, double-click | Exactly two drafts dated Sep 29/Sep 30, USD 1.23 + 2.34 = 3.57. Expense IDs `01a0f6c0-5c33-7793-9d00-5a8036e314f5`, `01a0f6c0-5c36-75ba-85aa-cc86a5bab384`. |
| Worker 2 weekly submit, 390px | Both submitted together, draft count zero, calendar day shows matching record; no document overflow. |
| Manager approvals | Both weekly expenses approved, one after double-click, no remaining synthetic submitted expenses. |
| Manager Approval filter | 282 → 282, focus remains Apply filters. |
| Worker 2 reopens expenses | One row per daily expense, both Approved; week includes earlier approved USD 11.00 crew meal for USD 14.57 total. |
| Report generation/download | Approved daily report went Queued → Ready; browser download succeeded. Artifact ID `01a0f6b8-497f-724d-8587-fc3582ce8769`, PDF retained in QA evidence directory. |
| EN/ES/PT weekly expense controls | Titles, explanations and actions render in the selected language; common existing calendar weekday abbreviations remain English. |

Additional screenshots: `live-expense-week-mobile.png`, `live-client-create-mobile.png`.
The isolated dev server was stopped after verification. Source edits and this final evidence update remain in the integration checkout; no remote push was performed.
