# Production finance privacy and authorization audit — 2026-09-25

**Release:** `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755` · **Origin:** `https://j-aautomation.com/j-aautomation/app`. Five isolated, previously authorized Chromium contexts: Owner, Finance Administrator, read-only Auditor, Project Manager and Worker 1. No login retry, business write, email or API mutation was performed. Access checks used visible navigation or the browser address bar; GET artifact URLs came from visible Owner/Finance links.

## Result

No client rate, loaded cost, other-worker pay, invoice or accounting-artifact leak was found in the tested role/object combinations. The audit proves the listed UI and browser GET boundaries only; it is not a certificate for every record, state, guessed endpoint or mutation method.

## Objects and relationships used

| Object | Test relationship |
|---|---|
| `C-0040-P-001 · QA BROWSER AUDIT 20260924` (`01a0d473-7f31-75cf-98e8-7aaec0a8b8fe`) | Synthetic QA project; assigned to the tested Project Manager and Worker 1. |
| `CP020 · BBS Mexico` (`project-cp020-bbs-mexico`) | Outside the tested Project Manager and Worker 1's project scope; Owner/Finance/Auditor global reference. Read only; no BBS history was changed. |
| QA credit invoice `QA-20260924--2026-000003` (`01a0d4f0-58f6-7291-87d0-611adb0a337b`) | Issued synthetic `-€1.00` financial history and PDF. |
| Accounting Pack `01a0d776-f082-77da-b012-ecfa96b0bd6c` | Existing final QA-period pack and JSON artifact. |
| QA expense `01a0d476-8d1d-732b-9a24-7abf3004067a` | Worker 1's approved €12.34 expense and private receipt `01a0d476-8d0f-71ef-afc1-1f97f472be92`. |
| QA expense `01a0d4bb-ee9b-76eb-852e-7ef80a3c3aa8` | Another technician's approved €1.23 expense and private receipt `01a0d4bb-ee65-7358-b968-db8465d832d7`. |

## Role and route matrix

`/app` in this table means `/j-aautomation/app`. Each result came from a browser page load, not an internal test client.

| Route/object | Owner | Finance | Auditor | Project Manager | Worker 1 |
|---|---:|---:|---:|---:|---:|
| `/app/finance?view=overview` | 200 | 200 | 200 | **403** | **403** |
| `/app/finance?view=economic`, with both QA and BBS project IDs | 200 | 200 | 200 | **403** | **403** |
| `/app/finance?view=commercial` | 200 | 200 | 200 read-only | **403** | **403** |
| `/app/finance/cash` | 200 | 200 | **403** | **403** | **403** |
| `/app/billing` | 200 | 200 | 200 read-only | **403** | **403** |
| `/app/ledger` | 200 | 200 | 200 read-only | **403** | **403** |
| `/app/accounting` | 200 | 200 | 200 read-only | **403** | **403** |
| `/app/billing/invoices/<QA credit ID>` | 200 | 200 | 200 preview | **404** | **404** |
| `/app/projects/<QA project ID>` | 200 | 200 | 200 | 200 scoped operations | 200 own operations |
| `/app/projects/<BBS project ID>` | 200 | 200 | 200 | **403** | **403** |
| `/app/projects/<QA project ID>/calculation?periodStart=2026-09-01&periodEnd=2026-09-25` | 200 | 200 | 200 | **403** | **403** |

The Project Manager's Projects list contained three assigned QA projects; Owner listed seven, including BBS. Finance and Auditor Billing project filters each listed seven project choices, including BBS and the QA project. Ledger's current invoice filters listed only the QA client/project and EUR because only those issued invoices existed. The Auditor's Billing Stage filter still offered WIP/Ready, Drafts, Outstanding, Overdue, Credit balances and Paid as read-only filters. These options did not expose hidden write controls.

## Financial amounts, compensation and DOM review

- Finance and Owner Commercial Configuration for the QA project visibly showed customer hourly charges, worker pay and internal cost for multiple workers; for example Worker 1 `€55.00` customer charge, `€25.00` pay, `€30.00` internal cost. Auditor saw those figures for read-only audit but lacked **Configure this person**, issuing-authority Save and expense classification controls. Finance and Owner had the relevant controls.
- The Project Manager's QA project detail showed time, team and operational expenses but no contribution card, Commercial/Billing tab, customer rate, worker pay or loaded cost. Worker 1 saw only own team/time/expense subset. Forcing `?tab=commercial` or `?tab=billing` in the browser kept both roles on the permitted Overview; the finance calculation route returned 403.
- Full rendered page DOM on the QA Team tab was checked for known QA amounts (`€55.00`, `€70.00`, `€25.00`, `€30.00`, `€35.00`) and finance field names. They were absent for Project Manager and Worker 1. Finance/Auditor have finance-specific DOM content by design. On Worker 1's own expense detail, commercial `CLIENT TREATMENT`, `BILLING TREATMENT` and `Reimbursable at cost` were absent from both rendered text and DOM; Owner saw them. The Project Manager saw only operational expense facts and receipt access for the assigned project.
- Finance Economic Review on the QA project exposed **Finalize compensation**, **Register actual payment** and **Mark reimbursed** controls. Auditor saw reviewed settlement and reimbursement amounts but none of those controls. Project Manager and Worker 1 were denied the entire Economic Review route.
- `/app/pay` showed Worker 1's own approved compensation/reimbursement and Project Manager's own zero-activity statement. It offered dates but no worker selector. Browser-address queries `?workerId=<Worker 2 ID>` and `?userId=<Worker 2 ID>` left each account on its own unchanged statement; no Worker 2 name or pay appeared. Owner/Finance/Auditor received 403 on the personal My Pay route, using their finance workspaces instead.

## Artifacts, receipts and exports

| Browser GET or visible gesture | Owner | Finance | Auditor | Project Manager | Worker 1 |
|---|---:|---:|---:|---:|---:|
| QA invoice PDF `/app/api/invoices/<QA credit ID>/pdf` | 200/download | 200/download | 200/download | **404** | **404** |
| Final Accounting Pack JSON `/app/api/accounting-pack/<pack ID>/json` | 200/download | 200/download | 200/download | **404** | **404** |
| Worker 1 private receipt `/app/api/documents/<receipt ID>?view=1` | 200 | 200 | 200 | 200, assigned project | 200, own receipt |
| Other technician private receipt, same URL shape | 200 | 200 | 200 | 200, assigned project | **404** |
| Ledger **Export CSV** visible click / direct URL `/app/api/invoice-collection-ledger/csv?` | 200/download | 200/download | **403** | **403** | **403** |

The Finance Ledger CSV was clicked through its visible **Export CSV** link; its response was 200. Owner's browser-address GET of the same observed URL also started a 200 download. Auditor, Project Manager and Worker 1 received 403. The invoice/pack download responses were captured in Chromium even when Playwright reported “Download is starting”; no private artifact contents were printed. Finance/Owner can export Ledger; Auditor can read Ledger and download its allowed pack/invoice artifacts but the Ledger export control is absent and its direct CSV URL is denied.

Project Manager access to receipts **within an assigned project** is visible in the expense review flow; this is operational evidence, not access to accounting packs or other-worker pay. Worker 1 could open only the own receipt in the two-record check. An unrelated-project receipt for the Project Manager was unavailable in this fixture, so that specific receipt relationship remains unverified despite BBS project 403.

## Screenshots and limits

Private screenshots: [Finance QA rates](/home/kripta/production-browser-audit-20260925/privacy-finance-rates.png), [Auditor Billing](/home/kripta/production-browser-audit-20260925/privacy-auditor-billing.png), [Manager BBS 403](/home/kripta/production-browser-audit-20260925/privacy-manager-unrelated-403.png), [Worker other expense 403](/home/kripta/production-browser-audit-20260925/privacy-worker-other-expense-403.png), [Worker own My Pay](/home/kripta/production-browser-audit-20260925/privacy-worker-own-pay.png). Screenshots and browser states remain outside the repository; no credentials are included here.

No mutation endpoint was submitted, and no arbitrary record-ID enumeration, shared-link propagation, revoked-session replay, cross-tenant database inspection or every exported format was attempted. Authorization verdicts above apply to the named QA objects, BBS project and five identities at this release only.

**Secondary UX observations for follow-up:** In Finance's expense treatment cards, the sentence `Auditor view is read-only; Finance/Admin changes require authorized access` also appears while signed in as Finance and **Classify** is available. The Project Manager/Worker QA Team tab says to set rates and pay in the project's Billing setup even though that tab is unavailable to those roles. Finance's QA settlement worker selector offered about 110 users despite eight team assignments; no invalid settlement was submitted, so this is a choice-list usability risk, not a confirmed authorization defect.
