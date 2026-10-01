# Role workflow and duplicate feedback follow-up — 2026-10-01

Continuation after release `zip-48b9c4669fd2e5ad3ce6075381d0346c`. Functional verification uses real Chromium browser UI only. Static TypeScript checks, compilation, online backup and deployment are separate operational checks. Passwords, session files and private receipt contents are excluded from source artifacts.

## Environment

Candidate on loopback 5182 uses an online copy of the post-release live database and private files. No candidate jobs runner was started. Mutations use explicitly synthetic QA projects C0047 and C0043, never real customer examples. No synthetic invoice was issued/sent, and no payment or reimbursement was recorded.

## Browser findings and corrections

| Finding | Change and observed verification |
| --- | --- |
| Approved daily reports omitted recorded operational details | Explicit read-only daily and technical fields. Worker 2 and manager see synthetic shift and completed tasks; 390px report has no outer overflow. |
| Generated PDF downloaded with an internal identifier filename | Semantic report filename preserved by both endpoint and Blob download. Actual manager download succeeds after the final exact-revision guard. |
| Expense corrections required vendor although original expense did not, and could not attach a requested receipt | Optional vendor and validated optional correction receipt. Invalid PNG shows content/type error, keeps amount/reason and asks to reattach. Valid receipt plus double-click produces one correction; original remains unchanged. |
| Weekly unsaved entries followed a changed worker without warning | Worker/project/currency/week switches require confirmation. Cancel retains visible and serialized context/rows/request identity; accept clears rows. Payer edits retain entries. Close/navigation also guard unsaved entries. Independent owner browser checks pass at390px. |
| Approved filter appeared empty because completed results were collapsed | Approved results display directly with matching count. Manager browser checks show results and no misleading submitted-queue empty message. |
| Finance navigation lost selected project | Authorized project retained between overview, economic review and commercial configuration. Finance-role desktop and390px browser checks pass. Billing heading/title now match invoice view. |
| Detail pages offered no direct review destination | Submitted time, expense and report details give authorized reviewers a project-scoped approvals link. Manager clicked time link and found the matching submitted row. |
| Manager offered Submit for another worker’s draft; action lost technical tab | Register Submit now follows server owner/worker permission. Manager sees Open and no Submit. Worker1 submitted copied synthetic technical report, retained technical tab, and read-only facts remained visible at360/768 with no outer overflow. |
| Retry messages could appear to create a second record | Distinct EN/ES/PT already-saved/already-published keys for durable individual-expense, weekly-expense and planning replay branches. Independent source review confirms truthful replay flags and translation parameters. Exact replay response text is source-reviewed, not claimed as an independently forced lost-response browser reproduction. |

## Adversarial workflow results

- Worker 1 negative hours: clear0–24 validation, summary retained. Negative linked meal rejected atomically with fields retained; corrected0.50h plus EUR3.25 meal saves one pair and time submits.
- Worker 2 original USD7.89 parking expense, blank vendor: manager returns for USD8.90 plus receipt. Invalid file creates no correction. Valid correction double-click saves exactly one linked draft, submits and manager approves. New record `01a0f6de-20f3-7066-b26e-eddfe1979bb4`; original `01a0f6cf-fd55-76fb-bb60-8bb069accbd5` remains historical7.89. Manager projection exposes operational receipt/facts, no reimbursement/private compensation.
- Receipt-only correction of approved USD1.23: previously claimed receipt bytes reject with **“This receipt file matches existing private content. No new expense was saved. Review expenses you can access or contact the project owner.”** Amount/reason retained. Unique receipt creates exactly one correction; actual authorized popup displays PNG700×420. Withdrawn unsubmitted correction leaves original approved1.23 unchanged.
- Unassigned Worker 3: Today has no assignments; Time and Expenses explain no available project and provide owner-contact guidance. Another worker’s expense denies access; browser navigation to private receipt returns generic unavailable error without content/metadata.
- Crew-chief screen exposes only delegated Worker2 and no compensation details.
- Finance administrator and auditor inspections preserve role-specific navigation. No commercial configuration or financial lifecycle was mutated.
- Owner weekly-entry ES/PT calendars use localized weekday names. Responsive checks cover360/390/768/1440 across this batch and the preceding deployed workflow evidence; each receipt is scoped to the screens actually inspected.

Private UI scripts, screenshots, downloaded synthetic PDFs and logs are retained at `/home/kripta/ja-role-audit-20261001/` (directory0700, auth state0600). Earlier throttle-limited attempts remain in raw evidence; later authenticated Worker3 checks supersede uncertainty. The shared sign-in limiter was respected, never bypassed.

Worker1 technical report `01a0ef32-6818-7338-8c44-aa78492c72ce` submitted through the register, nowv2. Its detail-page Submit initially remained Draft silently. Browser tracing on a new synthetic draft (`01a0f6f7-38d1-711b-804d-59713e65a155`) confirmed nested `requestSubmit` ran during the original submit dispatch, so Chromium suppressed it; shared capture cleanup also checked cancellation too early. The report replays submission in the next browser task and shared cleanup waits until event dispatch completes. The same synthetic draft now emits exactly one POST and becomes Submittedv2 with its original operational fields read-only. GET focus/scroll rules and durable server idempotency remain intact.

Independent owner browser duplicate-receipt check passed at1440/390: visible specific rejection, USD4.56/date/project/worker/description retained, reattach instruction, register count27 before/after reload and attempted description absent. Final weekly context regression after the lint-only adjustment passed all worker/project/currency/week cancel/accept, payer retention, close and locale checks (`week-guards-final.log`).

## Limits

These are representative normal and adversarial flows, not a claim that every app action is defect-free. Lost-response server replay was independently reviewed but not forced through direct API calls. This batch does not exercise real invoice issuance, payments, email delivery, scanner quarantine, offline synchronization or a full restoration drill. The prior deployed weekly expense/multiworker planning/client CTA/navigation evidence remains in `browser-workflows-20261001.md`.

## Release verification

Final repository TypeScript check, global ESLint, production portal/site/jobs compilation and `git diff --check` passed. Independent low-agent source reviews accepted receipt corrections/privacy, report fields/download revision checks, weekly safeguards, finance scope navigation, replay localization, report register permissions and submit timing. All functional checks remained browser-only.

Activated **2026-10-01 12:39:02 Europe/Madrid** through the existing ZIP deployment procedure:

- Release: `zip-366bef47558b2fe5e79263f810b3688f`.
- ZIP SHA256: `366bef47558b2fe5e79263f810b3688fbe78580ebed927747c1b314dae683c88`.
- Active source: `/opt/jaautomation/releases/ja-automation-366bef47558b2fe5e79263f810b3688fbe78580ebed927747c1b314dae683c88`.
- Pre-switch online database/files backup: `/var/backups/jaautomation/2026-10-01T103845989Z-01bb05ba-656c-4637-b7b4-f861e7dcfd7d`, five private documents.
- Portal/site healthy; jobs running; jobs, backup and deployment watchers/timers active. Dependency download retries delayed image building; the prior release remained serving until successful activation.

| Live browser check | Result |
| --- | --- |
| Owner duplicate receipt, desktop/390 | Specific no-new-expense error;4.56/description retained. Reload still23 records, attempted description absent,390px no outer overflow. |
| Owner unsaved weekly worker switch,390 | Cancel keeps visible/hidden Worker2 and3.21; accept changes both to Worker1 and clears amount. Closed without saving. |
| Manager technical draft permissions,390/1440 | Worker1 synthetic fixture shows Open and no Submit. No outer overflow. |
| Manager approved filter | Four approved rows display under Completed review follow-up. |
| Manager submitted report detail review link | Navigates to correct project-scoped reports queue without mutation. |
| Owner technical detail submission | Existing synthetic QA-SWARM-R2 fixture submitted once through detail (one observed POST), Draftv1→Submittedv2; operational fields preserved/read-only. Viewport scroll was0→0, so this does not establish nonzero native POST scroll restoration. |
| Owner approved daily report | Recorded shift/tasks visible; actual PDF downloads with semantic report filename and no failure. |
| Owner Published schedule Filter | Scroll1911→1911; focus remains Filter. |
| Owner related finance navigation | Chosen C0047 retained Overview→Economic; Billing document title matches Billing. No financial action taken. |

After image building temporarily reduced disk headroom, pruning only unused Docker build cache recovered6.967GB; production/rollback images, containers, data and private files were retained. Free space approximately11GB. The earlier pre-build prune recovered6.963GB. No image/volume/container prune was run. The candidate server exited137 and one candidate Chromium tab crashed during resource-heavy Docker building; candidate workflow receipts were completed before image building. Neither process remains needed for verification, and final production checks used successfully loaded live pages. Source implementation files were not changed after packaging; post-activation evidence updates remain in this checkout. No remote push was performed.
