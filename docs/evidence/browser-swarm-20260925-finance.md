# Finance and Auditor browser audit — 2026-09-25

## Method and scope

- Production origin: `https://j-aautomation.com/j-aautomation/app`.
- Independent Chromium contexts for the recommended Finance Administrator account and a previously authorized Auditor session. All interactions used rendered controls or the browser address bar. The new Auditor login was rate-limited by shared production traffic, so its existing authorized browser state was used; no further login retry was made.
- Finance: Billing wizard, existing synthetic invoice/credit history, Ledger, Accounting. Auditor: Billing, invoice detail, Ledger, Accounting and artifact download. Desktop 1440×900 and phone 390×844.
- No records were created or changed, no payment was recorded and no email was sent. Source fixture: `C-0040-P-001 · QA BROWSER AUDIT 20260924`, QA Browser Audit client, Expense manual stream and historical QA invoices. The earlier instruction in the account manual to preserve real clients was observed.
- Screenshots are under `/home/kripta/production-browser-audit-20260925/`. They contain no credentials.

## Confirmed new findings

### FIN-UX-01 · P1 · Invoice wizard is clipped and consumes the phone viewport

**URL/role/device:** `/j-aautomation/app/billing`, Finance Administrator, 390×844.

**Reproduction:** Open **Create invoice** from Billing after a full page load. Inspect the numbered steps and try to read step 1 and reach **Next**. Repeat after visiting another step and returning to step 1.

**Expected:** All step labels and the current form are readable at 390 px; the current decision and action are visible without navigating past the entire progress list.

**Actual:** The wizard's numbered `<ol>` and each item measure **736 px wide** inside a **390 px sheet**, and the sheet clips their right halves. Labels such as “Client / project”, “Billing stream” and “Save / issue” are cut off in the phone screenshot. The 12-item list is **598 px high**; step 1 content begins around viewport y=743 and **Next** around y=905, below the 844 px viewport. No document-level horizontal overflow was detected (`documentElement.scrollWidth = 390`), so an ordinary width smoke check would miss the clipping. The issue reproduced after a fresh Billing load and reopening the wizard. No write or reload persistence applies.

**Evidence:** [`finance-wizard-mobile-stable.png`](/home/kripta/production-browser-audit-20260925/finance-wizard-mobile-stable.png). Observed DOM rectangles: step list x=16, width=736, bottom=727; sheet width=390. Likely UI surface: Billing wizard progress layout and responsive sheet body.

**UX consequence:** The finance user cannot scan the workflow or see the immediate form action on opening the sheet. A concise progress indicator with the current step visible would better support the task; keep the full labels available through an accessible expanded list.

### FIN-UX-02 · P2 · Empty invoice period is simultaneously “Ready” and blocked

**URL/role/device:** `/j-aautomation/app/billing`, Finance Administrator, 390×844 and 1440×900.

**Reproduction:** Open **Create invoice**. Select `C-0040 · QA Browser Audit — C-0040-P-001 · Expense · manual · EUR`. Select period **2026-09-25 → 2026-09-25**, click **Check selected period**, then visit **Included records** (step 5) and **Save / issue** (step 12).

**Expected:** With zero eligible expense records, the final step explains that there is nothing to invoice, names the selected period and stream, and directs the user to another period or the pending source work. The readiness label should agree with whether Save is permitted.

**Actual:** Step 5 reports `Included source records 0`, `Period readiness Ready`, then `No approved, unbilled expenses are available in this period. Choose another period or approve the expenses first.` Step 12 says only `Resolve the period readiness issues before saving an invoice draft` and **Save invoice draft** is disabled. The specific empty-record explanation disappears at the action point. This reproduced twice, including after a fresh Billing load. The selected dates stayed in the wizard during step changes; no record was saved, so reload persistence is inapplicable.

**Evidence:** [`finance-empty-readiness-mobile.png`](/home/kripta/production-browser-audit-20260925/finance-empty-readiness-mobile.png) and [`finance-empty-save-mobile.png`](/home/kripta/production-browser-audit-20260925/finance-empty-save-mobile.png). The visible **Check selected period** gesture returned HTTP 200. Likely UI surface: Billing wizard readiness summary and final-step disabled reason.

**UX consequence:** The final action tells the user a different problem from the one the earlier step showed. Use a distinct “No billable records” state or carry the actual reason through to Save; keep the server's eligibility decision authoritative.

## Other direct browser observations

| Area and gesture | Observed result | Assessment |
|---|---|---|
| Finance Billing > **Credit balances** > QA `-€1.00` invoice > **Manage** | Mobile card opens the invoice sheet. It shows `Credit balance: €1.00`, explains that this is owed to the customer, and links to Ledger; there is no customer payment form in the credit sheet. | Correct separation of credits and collections. |
| Finance invoice sheet > **Collections** / **Lifecycle** tabs | Selected tab state changes, but the same full sheet text remains visible. The controls have tab role but no `aria-controls`; body scroll stayed at zero after selecting Lifecycle. | Possible P2 navigation/accessibility issue; needs design intent check before calling it a defect. |
| Finance credit invoice > **Review credit in ledger** | Ledger opens with the QA client, three historical invoices and a separate `-€1.00` credit balance; receivable is `€0.00`. | Correct visible financial treatment. |
| Finance Accounting register | Four historical packs show five artifacts each labelled Ready, while summary tile `Ready 0` counts only packs currently in ready lifecycle state. | P3 wording ambiguity: tile and artifact labels use “Ready” for different entities. |
| Auditor Accounting > final pack **JSON · Ready** | Clicking the last final version's JSON link returned HTTP 200 from the artifact URL and kept the Accounting page open. | Artifact access works for this auditor session and artifact. |
| Auditor Billing and QA credit **Manage** | Billing is explicitly `Read-only review`. The invoice sheet exposes Preview/Open PDF/Download PDF and `Issued history is immutable`; it has no Save, issue, send, payment or adjustment control. | Correct read-only affordances in the tested state. |
| Auditor browser navigation to `/app/finance?view=commercial` and `/app/ledger` | Both pages load HTTP 200 as review surfaces; no export or write control was visible in Ledger. | Access is read-only in the inspected views. |
| 390 px Accounting, Billing, Ledger route loads | `documentElement.scrollWidth` stayed 390 px in inspected views. Billing register uses mobile cards with **Manage** links. | No page-wide overflow in these views; the wizard has internal clipping as above. |

## Coverage limits and remaining journey

This pass does **not** certify every role, permission combination or financial state. No fresh bill source was approved in this bounded Finance session, so it did not create a draft, approve or issue an invoice, send it, register payment/reversal, allocate/refund a credit, or generate/finalize a new Accounting Pack. Those transitions require a new synthetic source chain and should be checked by the full multi-role journey. The Auditor session had no mutating controls in the sampled screens; server-side denial of direct forged mutations was not tested from browser controls. Tablet 768 px and all export formats were not covered here. Existing paid invoices and the credit note are historical synthetic fixtures, not new outcomes of this pass.
