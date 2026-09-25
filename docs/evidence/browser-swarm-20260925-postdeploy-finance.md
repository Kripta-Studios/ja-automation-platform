# Finance post-deploy browser verification — 2026-09-25

**Release tested:** `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755` at `https://j-aautomation.com/j-aautomation/app`. Independent Chromium contexts loaded previously authorized Finance Administrator and Auditor browser states. All business actions used visible UI controls; browser navigation to observed routes was used for role checks. No records were created, issued, paid or emailed.

## Verdict

| Check | Result |
|---|---|
| FIN-UX-01 wizard progress/current step/Next | **PARTIAL / FAIL.** The new collapsed progress indicator and Next are visible at 360 and 390 px, and expanded step labels fit. Step 1 description and project/stream selector still overflow the sheet internally and are cut off at both phone widths. The same intrinsic-width issue remains inside the 768 and 1440 side sheet, although its short description happens to fit there. |
| FIN-UX-02 empty QA expense period | **PASS.** Step 5 says `No billable records`; step 12 repeats the exact no-expenses reason, links to Period and keeps Save disabled. No contradictory `Ready`/generic error. |
| Invoice Overview/Collections/Lifecycle jump | **PASS.** Clicking each visible control scrolls and focuses the intended panel/heading in the QA credit invoice sheet. |
| Auditor accounting artifact and read-only surfaces | **PASS for sampled state.** Auditor JSON artifact returned HTTP 200; Billing/Accounting/Ledger/Commercial Configuration show no visible business write controls in the sampled views. |
| Full finance lifecycle | **NOT COVERED.** No synthetic source was approved and no draft, issue, payment, credit allocation/refund or pack generation was performed in this verification. |

## Residual defect FIN-UX-01R · P1 mobile form clipping

**Role, URL and gesture:** Finance Administrator, `/j-aautomation/app/billing`, **Create invoice**. Open the sheet at 360 or 390 px, read **Client / project**, inspect the **Project and billing stream** field, then click **Next** and **Previous**. The result reproduced after a fresh Billing load. The new summary `Invoice steps · 1/12 · Client / project` is visible, **Next** is at y=356, and Next advances to **Billing stream**. Expanding the summary reveals readable step labels in its own scroll area.

**Remaining actual result:** The step 1 `h3`, paragraph, label and select each retain an intrinsic width of **736 px** on 360/390 screens while the section is only **328/358 px** wide. The description and selected option run off the right of the sheet, with no horizontal scrollbar exposed to the user. At 390 px the sheet body has `scrollWidth=752`, `clientWidth=390`. `documentElement.scrollWidth=390`, so checking only page width reports a false clean result. On 768/1440, the section is 420/503 px but its children remain 651 px wide; body `scrollWidth=671`, `clientWidth=460/543`. The clipped option can make two QA streams with the same project prefix hard to distinguish.

**Expected:** Text wraps within the current panel, and the selected project/stream stays identifiable at every representative width. The form should have no hidden horizontal content.

**Screenshots:** [360 px](/home/kripta/production-browser-audit-20260925/post-finance-wizard-360.png), [390 px](/home/kripta/production-browser-audit-20260925/post-finance-wizard-390.png), [expanded 390 px progress](/home/kripta/production-browser-audit-20260925/post-finance-progress-expanded-390.png), [768 px](/home/kripta/production-browser-audit-20260925/post-finance-wizard-768.png), [1440 px](/home/kripta/production-browser-audit-20260925/post-finance-wizard-1440.png). The 390 screenshot visibly cuts the explanatory sentence and select text. Likely surface: Billing wizard section children/select intrinsic sizing inside the responsive sheet. There was no save, so record persistence is inapplicable; fresh page reload reproduced it.

## Empty-period and stream checks

**Finance Administrator, `C-0040 · QA Browser Audit — C-0040-P-001 · Expense · manual · EUR`, period 2026-09-25 → 2026-09-25:** In the visible wizard, **Check selected period** returned a result. **Included records** showed `0` and `Period readiness No billable records`, with `No approved, unbilled expenses are available in this period. Choose another period or approve the expenses first.` Advancing to **Save / issue** preserved that exact message, offered **Period →**, and disabled **Save invoice draft**. Screenshots: [included records](/home/kripta/production-browser-audit-20260925/post-finance-empty-included-390.png), [final action](/home/kripta/production-browser-audit-20260925/post-finance-empty-save-390.png).

**Labor hourly/manual comparison:** The QA Labor manual stream exists. For the same date, it showed 0 included records and `incomplete` because four time entries were pending; **Excluded / pending** repeated the actionable approval instruction. This is a blocked approval case, not a clean empty-hourly case. Only Labor and Expense streams were selectable in the wizard; no QA fixed-fee stream was available, so a positive fixed-fee draft was not attempted. No invoice draft was saved.

## Invoice detail navigation and role boundaries

| Role and visible action | Result |
|---|---|
| Finance > Invoices > QA `-€1.00` credit > **Manage** > **Overview** | Body scrollTop 105; focus moves to overview DIV at y≈145. |
| Same sheet > **Collections** | Body scrollTop 606; focus moves to Collections H3 at y≈145. The separate €1.00 customer credit remains described without a payment form. |
| Same sheet > **Lifecycle** | Body scrollTop 209; focus moves to lifecycle OL at y≈145. |
| Finance Billing/Ledger/Accounting | All HTTP 200. Billing displays **Create invoice**; Ledger displays **Export CSV/XLSX**; Accounting displays historical **Generate new version** controls. No action was submitted. |
| Auditor Accounting > latest final pack **JSON · Ready** | Visible link click returned HTTP 200 for `/j-aautomation/app/api/accounting-pack/01a0d776-f082-77da-b012-ecfa96b0bd6c/json`. The page stayed in Accounting. No generate control was visible. |
| Auditor Billing > QA credit > **Manage** | `Read-only review`; sheet offers Preview/Open PDF/Download PDF and `Issued history is immutable`, with no send, issue, collection or adjustment control. |
| Auditor Ledger and Commercial Configuration | Both rendered HTTP 200 for review. No Create/Save/Generate/Export button was visible in these sampled views. At 390 px, the three sampled Auditor routes had no page-wide overflow. |

The Auditor context used an authorized stored session; no new login was attempted. These controls establish visible role boundaries in the sampled UI, not server denial of crafted writes. The positive and negative role checks did not change production business state.
