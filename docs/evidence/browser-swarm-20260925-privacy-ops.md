# Production browser privacy and Owner pay access — 2026-09-25

## Scope and method

Read-only Chromium UI audit at `https://j-aautomation.com/j-aautomation/app`, approximately 12:20–12:34 UTC. The release supplied by the deploy lead was archive SHA-256 `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755`; the page does not show a build ID. Existing authorized test sessions were used for Owner, Project Manager and Worker 1–3. Worker 4–8 were approached with one normal login attempt per account; no limiter reset, retries or credential output. Visible controls, list content and DOM option text were checked, plus browser URL entry for known synthetic QA object IDs. Document preview URLs were GET navigation only. There were no business writes.

Synthetic scope: `C-0040-P-001 QA BROWSER AUDIT 20260924` (`01a0d473-7f31-75cf-98e8-7aaec0a8b8fe`) and `C-0041-P-001 QA Browser Matrix Project 20260924` (`01a0d52d-dbde-7359-a52b-459a2dc20f4c`). No real customer document contents were opened. Screenshots are private under `/home/kripta/production-browser-audit-20260924/` and contain no account passwords.

## Finding: Owner cannot inspect the current worker pay statement by person

**Priority: high for requested global Owner access; an access/UI gap, not a leak to lower roles.**

- **Worker 1 own view:** `/pay` returns 200 and shows approved compensation **€72.92** for 175 approved minutes, plus reviewed settlement **€68.75** still unpaid and own reimbursement status. Screenshot: `privacy-worker1-my-pay-390.png`.
- **Worker 2 own view:** `/pay` returns 200 and shows **€12.50** estimated compensation awaiting approval for their QA draft, with no approved settlement. Screenshot: `privacy-worker2-my-pay-390.png`.
- **Owner:** direct `/pay` returns **403**. From visible Team → QA Worker 1 → Profile, Owner can see expertise and availability, with no pay statement link or values. From Economic Review → QA project → Worker economics, Owner sees Worker 1 loaded labor cost **€87.50** and approved hours, but Worker 2 does not appear because that view projects approved source economics. From Settlements, Owner sees Worker 1’s historical **€68.75** reviewed settlement and the reimbursement queue. These are useful administrative data, but they are different measures and do not expose the current **€72.92** personal approved-compensation total or Worker 2’s **€12.50** pending estimate. Screenshots: `privacy-owner-my-pay-403-1440.png`, `privacy-owner-worker-economics-1440.png`, `privacy-owner-settlements-1440.png`.
- **Lower roles:** Project Manager `/pay` shows only its own zero statement; Worker 2’s `/pay` stays at their own values even with `?worker=<Worker1 QA ID>` or `?workerId=<Worker1 QA ID>` typed into the browser URL. `/finance?view=economic` is 403 for both. Neither displayed Worker 1’s €72.92. Screenshot: `privacy-manager-my-pay-390.png`.

**Expected:** Owner can reach an administrative, per-person pay statement with the same current approved, pending, settled and reimbursed figures as the worker’s personal view, with its own audit-safe Owner navigation. Reusing `/pay` without a worker context is not necessarily required; the gap is the absence of an equivalent visible Owner path. Do not equate loaded labor cost, historical settlement and current worker compensation.

## Role and object authorization matrix

Browser statuses and rendered list/DOM were checked. A `200` list route alone is not called a pass unless its content was also scoped.

| Identity and relationship | Lists, filters and object route outcome | Financial and personnel outcome |
| --- | --- | --- |
| Worker 1; assigned QA project | `/projects` shows QA Browser Audit and their other assigned Test 1, not QA Matrix or BBS. QA project 200; QA Matrix 403. Own Time `01a0d82d-02e8-756b-b5db-2ab799f22109` 200; Worker 3’s crew Time `01a0d830-645d-77ab-a1e2-b36a271bde28` 403; Worker 2’s Expense correction `01a0d87c-acba-741b-b56c-24ab2a7da341` 403 and Daily report `01a0d54d-ccf7-76a8-b4b5-e783f9c8cadc` 404. `/documents` lists two own QA artifacts. Project Team tab shows Worker 1 only, own 3.1 h and one scoped assignment, while PM sees eight people and 7.0 h. | `/team` directory 200 with 0 people; own `/pay` 200. `/finance`, `/billing`, `/ledger`, `/accounting`, `/manage`, `/audit` 403. Typing `?tab=billing` or `?tab=economic` on QA project leaves only Overview/Team/Reports & Files; no commercial content or rates. |
| Worker 2; assigned QA project and active Crew Chief | Own QA project 200, QA Matrix 403. Worker 1’s Time detail 403; own Expense correction and Daily report 200. `/documents` lists only the QA shared crew receipt. QA project Team tab shows Worker 2 only and own 0.5 h. Crew Chief delegation permits its separate Crew interface, but the generic `/time/{Worker1 or Worker3 record}` route did not expose their detailed records. | `/team` directory 0; own `/pay` 200. Finance/commercial routes 403. No Worker 1 compensation was shown in `/pay` even with guessed worker query parameters. |
| Worker 3; assigned QA project | QA project and own delegated Crew Time `01a0d830-645d-77ab-a1e2-b36a271bde28` 200; QA Matrix, Worker 1 Time and Worker 2 Expense 403; Worker 2 Daily report 404. Project Team tab shows Worker 3 only. | `/team` directory 0; finance/commercial routes 403. Own `/pay` 200; exact figures were not compared. |
| Worker 4, 5, 6; no QA assignment | Each logged in once through `/login`. `/projects`, `/time`, `/expenses`, `/reports`, `/documents`, `/team`, `/pay` returned 200, but no QA/BBS/Worker 1 text was present. Documents showed `0 files`, Team `0–0 / 0`; QA project object 403. Global QA search gave no recommendation. | `/finance` 403 for each. Own pay page rendered without QA records; exact zero values not independently copied. |
| Worker 7 | One normal login reached `Too many sign-in attempts`; testing stopped without retry. | No route result in this privacy pass. In the earlier post-deploy operations pass, a normal login and QA project/Finance 403 were recorded; this is prior evidence, not a fresh check here. |
| Worker 8 | Not retried after Worker 7’s limiter response. | Earlier post-deploy operations pass recorded own routes 200 and QA project/Finance 403. No fresh privacy list/DOM check here. |
| Project Manager; assigned QA Browser Audit and Matrix | Both QA project objects, QA Time/Expense/Report details 200; project Team shows all eight QA assignments; `/team` directory contains seven scoped specialists. **Assign worker** form listed only the six eligible QA test workers and had no pay/rate fields. `/documents` listed six QA files. | Own `/pay` 200 with zero, no other worker compensation; commercial, economic, cash, ledger, billing, accounting, management and audit routes 403. QA project has only Overview/Team/Reports & Files tabs. |
| Owner; global administrative role | Both QA project objects and QA Time/Expense/Report details 200; project Team shows eight QA assignments; directory shows 114 specialists; documents list all six QA files. | Finance overview/economic/commercial, cash, ledger, billing, accounting, management and audit 200; project includes Commercial/Billing tabs and contribution. Personal `/pay` 403; administrative current worker statement gap described above. |

The `404` on another worker’s report and some document objects hides existence; `403` on other scoped objects denies access explicitly. No test asserts that those different denial codes must be uniform.

## Search and dropdown content

- Worker 1–3 typed `QA Browser Matrix` into the visible global search: no autocomplete recommendation, and Enter showed `0 matches` in authorized scope. Project Manager and Owner received the QA Matrix project and client in autocomplete and search results. Workers 4–6 searching `QA BROWSER AUDIT` likewise received no recommendation.
- Worker 1–3 typed `QA Worker 2`: no specialist suggestion. Project Manager saw the scoped QA Worker 2 specialist; no worker compensation appeared. Broad `QA` autocomplete for Worker 1/2 showed only their own QA project/reports/expenses; Worker 3 saw its QA project. The query `invoice` showed no recommendation for workers or Project Manager.
- `/time`, `/expenses` and `/reports` project filters were inspected in the assigned sessions; Worker 1/2/3 options matched their accessible QA projects, while Project Manager included QA Matrix. No BBS project or unassigned QA Matrix appeared in worker dropdown text. Owner’s wider options included BBS. The Worker 4–6 empty project state was checked in rendered lists, but their filter option arrays were not separately captured before the limiter intervened.
- Project Team tab at `/projects/01a0d473-7f31-75cf-98e8-7aaec0a8b8fe`: each Worker 1–3 saw only self, whereas PM and Owner saw eight team members. No rates were present in lower-role rendered text. The generic sentence about setting rates in Billing is still shown to workers who cannot open Billing; this is a minor misleading instruction, not a rate disclosure. Screenshots: `privacy-{worker1,worker2,manager}-qa-team-390.png`.

## Private document authorization and contextual Crew receipt

Owner’s `/documents` listed six QA files. Worker 1’s list showed only `qa-synthetic-receipt.png` and `qa-synthetic-plc-evidence.txt`; Worker 2’s list showed only `qa-crew-allocation-receipt.png`; Project Manager saw all six. Screenshots: `privacy-{worker1,worker2,manager}-documents-390.png`. Visible **Download** clicks succeeded with the expected filenames for Worker 1’s own receipt, Worker 2’s own Crew receipt and PM’s QA customer acknowledgment PDF; browser download failure was null.

Entering the Owner-visible QA preview URLs in each role’s browser gave:

| QA document object | Worker 1 | Worker 2 | Worker 3 | PM | Owner |
| --- | --- | --- | --- | --- | --- |
| Worker 1 receipt `01a0d476-8d0f-71ef-afc1-1f97f472be92` | 200 | 404 | 404 | 200 | 200 |
| Worker 1 PLC evidence `01a0d479-f0de-7337-adde-5aed08748790` | 200 | 404 | 404 | 200 | 200 |
| Shared Crew receipt `01a0d521-c254-705b-976b-a2906a639312` | 200 | 200 | 404 | 200 | 200 |
| Customer-private QA acknowledgment `01a0d54d-2a91-73bf-94d7-ae28f8b0ea14` | 404 | 404 | 404 | visible Download succeeded | visible Download available |

Worker 1’s 200 for the shared Crew receipt is **contextual access, not a confirmed leak**: `/expenses/01a0d521-c263-72e5-ba57-49eb350fa247` is visible to Worker 1 as an approved shared expense with their own €2 pending reimbursement and contains an explicit **Open private receipt** link to that object. Worker 2 can also view the same expense/receipt. Worker 3 cannot view it. The receipt’s absence from Worker 1’s general Documents list makes the distinction less obvious, but the business link is visible and authorized. No real private file was tested.

## Limitations

No project assignment was removed in this read-only pass, so post-removal session invalidation and historical access remain untested; Workers 4–6 provide only the unassigned-state comparison. Worker 7–8 could not be independently rechecked here after the login limiter response. Project Manager’s and Owner’s full 114-person directory was not exported; only visible scoped counts and QA entries were reviewed. Compensation figures were compared only for synthetic QA Workers 1/2. Browser checks cannot certify every object ID, API route or permission/state combination. No new security leak was confirmed in the tested sample; the Owner administrative pay gap is a confirmed functional access issue.
