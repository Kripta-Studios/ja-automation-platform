# Live manual browser coverage

## Run identity

| Item             | Value                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Captured         | 2026-09-06T18:22:00.000Z (aggregated evidence; retained sanitized phone/Profile addenda)                                                                                                   |
| Target           | `https://j-aautomation.com/j-aautomation`                                                                                                                                                  |
| Deployed SHA     | `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`                                                                                                                                                 |
| Method           | Aggregated sequential authenticated Chromium evidence with retained sanitized phone/Profile addenda; final correction was offline only                                                     |
| Desktop viewport | 1440 × 900                                                                                                                                                                                 |
| Phone viewport   | 390 × 844 (Worker time)                                                                                                                                                                    |
| Evidence detail  | `RUN.json` contains route outcome, status, final URL, observed headings/controls, screenshot path and SHA-256. It intentionally excludes credentials, cookies, tokens and response values. |

## Owner journey

| Route / view                            | Outcome                                  | Screenshot                                                                                |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Today `/app`                            | reachable, 200                           | `owner/live-today.png`                                                                    |
| Clients `/app/clients`                  | redirected to Projects Clients view, 200 | `owner/live-clients.png`                                                                  |
| Projects, Time, Approvals, Reports      | reachable, 200                           | `owner/live-projects.png`, `live-time.png`, `live-approvals.png`, `live-reports.png`      |
| Expenses, Billing, Finance, Collections | reachable, 200                           | `owner/live-expenses.png`, `live-billing.png`, `live-finance.png`, `live-collections.png` |
| Accounting, Audit, Profile              | reachable, 200                           | `owner/live-accounting.png`, `live-audit.png`, `live-profile.png`                         |

One later bounded Owner capture succeeded after login readiness returned HTTP 200 and a deterministic 10-second wait. It added fresh screenshots and sanitized detailed control inventories for Team, Planning, Documents, Economic Review and Commercial Configuration. No account reset, server configuration, or application deployment was performed.

## Worker journey and privacy check

| Route / check                                                        | Outcome                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Today, Projects, Time, Reports, Expenses, My Pay, Documents, Profile | reachable, 200; a sanitized screenshot was captured at each view               |
| Time (phone)                                                         | reachable, 200 at 390 × 844; `worker/live-time-phone.png`                      |
| Clients / Team                                                       | redirected to role-scoped project subviews, 200                                |
| Planning                                                             | reachable, 200 as published schedule                                           |
| Finance, Billing, Ledger, Accounting, Audit                          | authorization error, 403; no protected page rendered                           |
| Economic Review / Commercial Configuration                           | 404; no protected page rendered                                                |
| Approvals                                                            | 500 error page; no protected content rendered. This is a deployed-app finding. |

The source correction in this workspace adds a pre-repository 403 gate for Worker and Auditor Approvals loads and is covered by `tests/regression/section-load-authorization.test.ts`. It was not deployed during this validation, so the live SHA result above remains recorded as observed.

The Worker network capture recorded same-origin JSON responses without values. Its DTO-key inspection found no keys matching customer billing rate, revenue budget, PO cap, internal cost/margin, or other-worker compensation. Along with the direct authorization checks above, this is the sanitized server-response evidence for Worker confidentiality; it is not inferred solely from hidden navigation.

## Authentication observations

Both roles reached Profile and security and exposed **Register passkey** and **Enable MFA** controls. MFA was optional in the inspected flow: no sign-in or authorized navigation required it, and no mid-session reauthentication prompt was observed. During the earlier interactive run, automation attempted Enable MFA and the server returned a visible failure. The subsequent read-only Profile check observed **Not enabled** for both roles; no enrollment completion, password, language, or other account-setting change was observed.

## Screenshot integrity and sanitization

Every live screenshot is 1440 × 900 except the Worker phone capture. Sanitization is field-aware: structural evidence fields (route, URL, screenshot filename, viewport, status and SHA-256) remain exact, while human-derived values, record metrics, financial amounts, percentages, hours, identifiers and response values are withheld. The signed-in account context and directory/contact records are precisely masked; static navigation, headings and ordinary option vocabulary remain visible. `RUN.json` is the canonical per-screenshot SHA-256 ledger. Screenshots were rendered inside the PDFs and every generated A4 page was visually inspected as a contact sheet.

## Interactive target disposition matrix

All entries below were reached in one bounded session per role. `opened` means a tab, disclosure, safe detail link, or form launch was activated without entering values. `inspected` means the form/filter was already visible. `not_present` and `prohibited_mutation` are deliberate, auditable outcomes.

| Role   | Route / target                                                     | Disposition                                                       | Viewport              |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------- |
| Owner  | Phone navigation drawer                                            | opened                                                            | 390 × 844             |
| Owner  | Clients: Add contact; Edit contact                                 | opened; opened                                                    | 1440 × 900            |
| Owner  | Projects: New Client; New Project; Assign Worker                   | opened; opened; prohibited_mutation                               | 1440 × 900            |
| Owner  | Projects: Update assignment; close disclosure                      | not_present; inspected                                            | 1440 × 900            |
| Owner  | Team: Create user access; Edit team member                         | opened; not_present                                               | 1440 × 900            |
| Owner  | Planning: Publish assignment; New Skill; Update Skill              | inspected; opened; opened                                         | 1440 × 900            |
| Owner  | Documents; Time; Expenses                                          | inspected; opened; opened                                         | 1440 × 900            |
| Owner  | Approvals: Project tab; Finance tab; Review detail                 | not_present; not_present; opened                                  | 1440 × 900            |
| Owner  | Reports: Technical/new; Client Sign-off; New daily                 | not_present; prohibited_mutation; opened                          | 1440 × 900            |
| Owner  | Billing: streams; configuration; invoice filters                   | opened; opened; opened                                            | 1440 × 900            |
| Owner  | Finance economic tab; Commercial form; Commercial phone form       | opened; inspected; inspected                                      | 1440 × 900; 390 × 844 |
| Owner  | Ledger filters; Accounting Pack inputs; Audit filters              | inspected; inspected; inspected                                   | 1440 × 900            |
| Owner  | Profile: Passkey; optional MFA; read-only MFA status               | prohibited_mutation; prohibited_mutation; inspected (Not enabled) | 1440 × 900            |
| Worker | Project detail link                                                | not_present                                                       | 1440 × 900            |
| Worker | Time: Log time; Reports: Technical/new; Client Sign-off; New daily | opened; not_present; opened; opened                               | 1440 × 900            |
| Worker | Expenses; My Pay controls; Documents register                      | opened; inspected; inspected                                      | 1440 × 900            |
| Worker | Profile: Passkey; optional MFA; read-only MFA status               | prohibited_mutation; prohibited_mutation; inspected (Not enabled) | 1440 × 900            |

The per-target screenshot filename, DOM inventory, visible option labels and exact status are retained in `RUN.json`; the manuals incorporate the corresponding de-duplicated field and option tables. The earlier MFA activation attempt is retained as an incident in `RUN.json`; it returned a failure and did not complete enrollment. No field value was entered in the final read-only Profile check, and no approval, issue, send, export generation, payment, signature, passkey or MFA enrollment completion was activated.

## Synthetic-data creation and cleanup ledger

| Action                                                            | Result                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| Create synthetic client/project/time/report/expense/receipt/draft | Not performed                                        |
| Modify/approve/reject/correct existing business history           | Not performed                                        |
| Issue invoice / consume number / send e-mail                      | Not performed                                        |
| Record payment, collection or reconciliation                      | Not performed                                        |
| Customer acceptance/signature                                     | Not performed                                        |
| Cleanup                                                           | Not applicable: no records or artifacts were created |

## Explicitly prohibited actions respected

The run did not change passwords, e-mail addresses, mail configuration, server configuration, deployments, databases outside normal read-only page loads, or application source. The failed MFA activation attempt and subsequent observed Not enabled status are documented above. No external effect was triggered.
