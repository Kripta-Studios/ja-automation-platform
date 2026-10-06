# Finance and Auditor readiness evidence

These are native Playwright actions in isolated training portfolios on 6 October 2026. Nothing here establishes production sales, accountant approval, customer signing, email delivery, bank transfer or refund. The original BBS numbered masters and October 1–5 USD 4,672 example were preserved. The new normal USD 600 invoice, USD 1 credit and USD 1 cash receipt/reversal are separate synthetic exercises.

The main cloned BBS portfolio and the separate all-synthetic demo Accounting portfolio are different databases. The latter provides a successful Finance finalization and Auditor download exercise; it does not repair BBS historical blockers. Browser downloads and raw dumps remain private. [manifest.json](manifest.json) records native artifact hashes/bytes, source reconciliation, event IDs and screenshot hashes without credentials, bank details or signed copies.

“Native” means an actual authenticated browser action/read/download. “Source checked” means the named control/guard was inspected in repository source, with no claim that the financial event was posted. The short source references below use repository paths and function/component names so a reviewer can locate the implemented boundary. Manuals: `scripts/bbs-role-manuals/content/finance.json` and `auditor.json`.

## FN01

**Native complete.** Owner created/submitted/approved the authorized one-hour on-behalf October 26 source. Finance used Commercial treatment → Billable → **Record Finance review**. Reloaded source retains Actual 1 h / Billable. Operational review and Finance billability are separate. Supplier TIME remains an Owner handoff; a Chief grant alone is not ordinary operational-review authority.

Manual: `finance-review`. Evidence: [before review](finance/screenshots/02-finance-fresh-review-before.png), [saved source](finance/screenshots/04-finance-time-billable-after.png). Source: Time entry actions/operational reviewer authorization, Finance review action.

## FN02

**Native complete; alternatives source checked.** Finance saved Manual Labor stream `01a1117b-f753-77d9-8e1f-19bb4315fc58` effective October 26. Previous Weekly stream ended October 25. Filled Project/Stream/Cadence/Effective from/issuer/tax/template/contact/terms/PO controls are shown. Existing approved synthetic numbering fixture was reused; no real approval was entered.

The attempted October 31 person terms were rejected for overlap with a finalized October settlement. A distinct November 1 change to USD 610/day saved rule `01a11194-52ce-74bf-bd38-e64c0243799f` and override `01a11194-52d8-72ff-91e5-2c7d43400f0b`; October USD 600/day invoice history remained unchanged. Merely saving unchanged existing overrides does not manufacture a new rate date.

Manuals: `finance-commercial`, `finance-streams`. Evidence: [stream inputs](finance/screenshots/08-finance-new-stream-filled.png), [saved stream](finance/screenshots/25-finance-saved-manual-stream.png), [future terms input](finance/screenshots/33-finance-future-november-terms-input.png), [saved terms](finance/screenshots/35-finance-future-terms-saved.png). Source: `ProjectBillingSetup.svelte`, `project-billing-setup-repository.ts::savePersonTerms`, `BillingSection.svelte` stream form.

## FN03

**Native complete.** Finance used the normal source wizard, checked October 26–26, saved draft `01a1117c-ec5d-750b-be30-47caa07cb3db`, approved and issued JA-DEMO--2026-000005 USD 600. Native final PDF became Ready and downloaded successfully. It stays private because inherited issuer contact/bank data are confidential. The complete source line remains public: one actual hour; one full-day unit × USD 600. The earlier USD 1 debit is a separate amount-only exercise.

Manuals: `finance-draft`, `finance-issue`. Evidence: [Included records](finance/screenshots/09-finance-wizard-included-source.png), [Preview](finance/screenshots/10-finance-wizard-preview.png), [full source table](finance/screenshots/12-finance-normal-draft-source-table.png), [Issued and native PDF Ready](finance/screenshots/15-finance-normal-issued-ready.png). Source: invoice wizard and `PortalRepository` draft/approve/issue/source manifest functions. Native PDF hash/bytes are in the manifest.

## FN04

**Generation and receiving PM handoff native complete; signature/invalidation source checked.** Finance generated customer-safe October 13–19 using Hours and activity summary. Canonical PDF Ready. PM approved exact v2/hash `85ba28d58be5c1f0c582266794df84fc491344508b23c63a33659b0ce98d6042`. Finance reloaded CUSTOMER PRIVATE · APPROVED / Ready for signature: 3.8 h, one Daily, three Time sources, zero Technical records in this content mode. No signature/follow-up/dispatch was posted.

Manual: `finance-customer-report`. Evidence: [period input](finance/screenshots/05-finance-report-input.png), [safe generated report](finance/screenshots/06-finance-customer-period-ready.png), [receiving approved exact version](finance/screenshots/30-finance-pm-approved-customer-report.png). Source: `reports/period/[id]` load/actions/page; `customer-conformity-repository.ts` exact-version/hash/canonical PDF/signed-copy verification and append-only invalidation. Actual controls: Signed PDF copy, Signer name, Signer identity, Customer signature date, Record verified signed-copy evidence; Invalidate sign-off → Reason for invalidation → Confirm invalidation. Printed signature lines and operational follow-up are not signed evidence.

A separate authorized October 13–18 cut selected the approved October 16 Technical report explicitly. Finance approved customer report `01a111a4-577e-7293-a86c-6b749091a51b`, v2/hash `2ea5f6feee4556c71252ddd17af892ad04389b633584e2a2d397b9091624ae27`. Its canonical native PDF was opened through the browser (authenticated GET 200, 330032 bytes, SHA-256 `4ed23e4f911973a30585cc39b67d1e91a04b9c6d1d01c9fc1940c684742f9608`). The generated two-page PDF contains human-readable Technical problem/diagnosis/change Detail. Its synthetic customer-safe bytes are published unchanged as [native customer period PDF](native-customer-period-20261013-18-v2.pdf), with [page 1 rendered from that exact PDF](finance/screenshots/39-native-customer-period-pdf-page1.png) and [native input selection](finance/screenshots/36-finance-selected-technical-period-input.png). Original October 13–19 v2 remains unchanged; no signed-copy evidence was fabricated. This output is also the Owner OW08 positive detail reference.

## FN05

**Credit and cash chain native complete; Debit/Correction semantics source checked and prior Debit preserved.** Credit 000006 is −USD 1 linked to normal 000005 USD 600. The original face/master stays USD 600. Receipt USD 1 produced outstanding USD 599; full reversal restored gross 1 / reversal 1 / net 0 / outstanding 600. The credit remains separate. No native credit allocation/refund was invented.

Manuals: `finance-adjustment`, `finance-collections`. Evidence: [Credit input](finance/screenshots/18-finance-credit-input.png), [receipt input](finance/screenshots/21-finance-normal-receipt-input.png), [receipt saved](finance/screenshots/22-finance-normal-receipt-saved.png), [immutable reversal history](finance/screenshots/24-finance-normal-reversed-history.png). Source: `repository.ts::createInvoiceAdjustment`: Credit negative absolute, Debit positive absolute, Correction input sign; current positive-only form makes a positive Correction an increase, not replacement. `v3-repository.ts` payment/reversal functions retain append-only cash history.

## FN06

**Boundary complete, with actual overlap rejection and existing native finalized-payment/reversal evidence.** The existing USD 720 finalized October obligation remains USD 720 after cash reversal; no ordinary unlock or finalized-obligation replacement was claimed. Custom approved adjustment is supported as a **new dated compensation rule**, not an automatic amendment of the frozen settlement. No invented approval was posted.

Manual: `finance-obligation-correction`; existing `finance-settlements` and `finance-worker-payments` retain their separate snapshot/payment exercises. Source: `FinanceConfigurationSection.svelte` Rule type → Custom approved adjustment / Approved adjustment amount / Save compensation rule; settlement/source mismatch guard; `project-billing-setup-repository.ts` overlap guard. Receiving handoff requires settlement/source IDs, frozen/current amounts/terms, reason, legitimate approval and the exact native error. No SQL surgery instructions.

## FN07

**Previously native full reimbursement preserved; current UI and limits source checked.** Existing separate USD 12 synthetic reimbursement exercise retains its native input/saved timestamp captures. Mark reimbursed submits the full reviewed amount and reference; server records the actual timestamp. No editable actual date, partial reimbursement or ordinary expense reimbursement reversal exists in that form. `recordReimbursement` rejects partial amount and conflicting repeated final truth. Expected date is planning.

Manual: `finance-reimbursement`. Existing evidence: `docs/evidence/bbs-role-manuals-20261006/finance/screenshots/22-finance-reimbursement-input-desktop.png`, `25-finance-reimbursement-saved.png`. Source: `FinanceOverviewSection.svelte` reimbursement form; `v3-repository.ts::recordReimbursement`; `finance-actions.ts::recordReimbursement`. Compensation-payment reversal is a different ledger operation and cannot be substituted.

## FN08

**Native project export complete; controls/defaults source checked.** The actual Download finance export produced the October 26–26 XLSX; its native suggested filename contains this exact cut. Ordinary Project Billing has no general date picker. Error-only date correction controls differ from always-visible Period start / Period end / Review period on the calculation page; its return link does not carry the selected cut into export. Documented the supported dated project link and filename check without inventing a picker.

Manual: `finance-economics`. Evidence: [actual export control](finance/screenshots/19-finance-export-control.png); private native workbook hash in manifest. Source: `projects/[id]/+page.server.ts`, project export URL/control; `iso-date.ts::defaultLookbackPeriod` previous UTC month start through today; Accounting separately uses `previousCompleteMonth`. Source work dates and invoice issue dates remain different cut rules.

## FN09

**Native complete in two explicitly separate portfolios.** BBS October 1–6 pack `01a11180-8605-74a7-9266-ff43c6637a4c` has five Ready formats; Finance Review advisories 35 pending / 4 unclassified / 16 missing documents / 2 reconciliation issues, so no finalization. Later October cut hits the existing finalized monthly compensation mismatch; history preserved.

Separate all-synthetic portfolio: Finance generated October 1–6 pack `01a1118e-2286-76bc-a914-28f15b7a64eb`; all five Ready. Review zero advisories / None detected, then **Finalize reviewed version** saved `final`. Actual Auditor login/downloads followed. An empty September pack correctly exposed issuer-related Finalization unavailable; it was not treated as a positive finalize.

Manual: `finance-accounting`. Evidence: [BBS advisory review](finance/screenshots/20-finance-accounting-review.png), [separate successful review](finance/screenshots/31-finance-clean-ready-review.png), [Finance final](finance/screenshots/34-finance-clean-final-accounting.png). Source: `AccountingSection.svelte`, `AccountingPackArtifactStatus.svelte`, `accounting-pack-finalization.ts`. Normal users Generate, wait/Refresh, review and use authenticated Ready links; operator artifact-runner commands are excluded from the manual.

## FN10

**Manual period close native complete; weekly and late-work limits source checked.** Finance closed new Manual stream October 26–26, period `01a11187-4b16-75e6-835b-28bdb1f4f125`. Original source remains locked by issued invoice. At this billing-close capture the project was Active; a later separate Owner project-closeout exercise changed the project to Closed and then supported Owner Reopen returned it to Active, preserving the final closeout version. Close sources did not itself perform project closeout. No new late-work source was created for this finding.

Manual: `finance-close`. Evidence: [Close sources exact cut](finance/screenshots/26-finance-close-source-input.png), saved period ID in manifest. Source: billing close-period action and cadence validation; project-closeout authority. Weekly cut is Monday–Sunday; a later source/correction does not silently join an issued invoice. Receiving support handoff includes work date/source, stream/cadence, closed period, invoice/settlement references and native message.

## AU01

**Native full invoice-to-source reconciliation complete; raw link/rule IDs corroborated read-only.** Normal 000005 is a complete one-line USD 600 invoice. Auditor read Actual 1 h, Qty 1 day, USD 600/day and linked exact October 26 source. `invoice_source` records source version 4, locked issue timestamp, SHA-256 and allocated net/tax/gross 60000/0/60000. Historical October 5 daily rule governs; future November 1 USD 610/day does not rewrite it. Raw rule IDs are an authorized support extract, not invented UI fields.

Manual: `auditor-invoices`. Evidence: [full line](auditor/screenshots/03-auditor-normal-invoice-source-line.png), [actual source](auditor/screenshots/04-auditor-source-actual-hour.png). Exact IDs/formula/hash in manifest. Original 000001–000003 masters and USD 4,672 annex remain preserved separately.

## AU02

**Native complete.** Auditor read the complete six-row BBS register with all nine columns. Three native keyboard-scroll views capture Invoice / Client / Project (cost center/PO), Dates / Amount / Balance, then Amount / Balance / Status / PDF / Actions. Each view retains sticky invoice identity. Financial amounts are allowed for this role; ordinary business write controls remain absent.

Manual: `auditor-invoices`. Evidence: [identity columns](auditor/screenshots/02-auditor-full-invoice-register.png), [dates and amounts](auditor/screenshots/16-auditor-register-dates-and-amounts.png), [balances/status/PDF](auditor/screenshots/15-auditor-register-money-status-ready.png). Source: Billing register responsive table/card definitions.

## AU03

**Native complete.** Auditor read normal invoice outstanding USD 600 after receipt/reversal and separate USD 1 credit. At the captured scoped cut: gross receivable 4591 − credit 1 = customer net outstanding 4590; net collections 682. These are different measures from the single invoice’s face/outstanding and change with later authorized activity.

Manual: `auditor-cash`. Evidence: [scoped reconciliation](auditor/screenshots/07-auditor-credit-receipt-reversal-reconciliation.png). Original invoice face/PDF, separate credit, receipt and reversal remain immutable.

## AU04

**Native complete.** Auditor’s own session read populated BBS pack and downloaded PDF/XLSX/Invoice CSV/Expense CSV/JSON. In separate successful synthetic portfolio, Auditor read Finance’s `final` pack and independently downloaded all five again. All twelve relevant private downloads, including normal invoice/workbook, have hashes/bytes in manifest. The additional customer-safe report was retained from native Open PDF separately and is explicitly labelled. Generate/Review/Finalize controls absent for Auditor.

Manual: `auditor-accounting`. Evidence: [BBS Ready](auditor/screenshots/01-auditor-populated-ready-pack.png), [separate final read](auditor/screenshots/09-auditor-clean-final-pack.png). No empty-register substitute or Owner account used for Auditor verification.

## AU05

**Native event details complete; entire chain corroborated read-only.** Native Audit details show source Finance review, normal invoice issue and receipt. Manifest carries create/submit/approval/Finance review/draft/approval/issue/payment action IDs, UTC timestamps and actor IDs. Source create/submit/operational approval used Owner training session; financial actions used BBS ROLE LAB Finance. Duplicate time.create audit events share one source and do not double work.

Reversal has an immutable ledger row with Finance actor, USD 1, `entry_correction` and recorded timestamp; this release creates no ordinary audit_event for that reversal. Manual explains the separate ledger evidence rather than fabricating an Audit entry. Actor ID resolution requires Owner’s restricted account crosswalk; native UI does not print resolved account names.

Manual: `auditor-audit`, including actionable finding template. Evidence: [source review event](auditor/screenshots/11-auditor-source-finance-review-event.png), [invoice issue event](auditor/screenshots/10-auditor-invoice-audit-chain.png), [receipt event](auditor/screenshots/06-auditor-payment-audit-event.png). Source: Audit page pagination and reversal event ledger.

## AU06

**Read routes native complete, including post-fix customer period detail at 1440 and 390 pixels.** Auditor used own-session Finance/Economic Review/Ledger/Accounting/Audit navigation and direct Billing/invoice/Time/source and read-only Project Billing. Existing native Daily/Technical read procedures retained. No account sharing or mutator grant.

The approved customer period detail previously returned 404 because `load` called reviewer-only `getReportFollowup` for Auditor. Minimal fix skips that follow-up call while retaining canonical snapshot/project authorization and PDF verification. Focused route tests: 18 passed, including Auditor read, denied snapshot authorization before metadata, and approval 403. After the coordinated rebuild, the native Auditor page rendered the approved exact v2 customer report with PDF readiness and no approval/follow-up/signed-copy capture forms (`safeForms=[]`), zero page/HTTP errors at both widths.

Manuals: `auditor-start`, `auditor-invoices`, `auditor-outputs`, `auditor-boundary`. Evidence: [native read-only Project Billing](auditor/screenshots/12-auditor-project-commercial-read.png), [repaired report desktop](auditor/screenshots/13-auditor-repaired-customer-period-desktop.png), [phone](auditor/screenshots/14-auditor-repaired-customer-period-phone.png). Fix: `reports/period/[id]/+page.server.ts`; tests: `tests/unit/period-report-route-problems.test.ts`. No repository mutator authorization was widened.

## S05–S08 receiving-side handoffs

S05–S06: Finance receives PM operational review/approval for the exact customer report v2/hash and safely distinguishes staff follow-up from verified customer signed evidence. Signed-copy recording and explicit invalidation remain source-checked without manufactured signatures. S07: Finance/Auditor receive finalized-obligation exceptions with immutable source/terms/cash evidence, and distinguish new approved adjustment rules from changing a frozen settlement. S08: closed period/project/source conflicts retain work dates and historical issued/finalized evidence for the authorized receiving support process.

## Validation and limits

The bounded Auditor load fix passed its focused 18-test route suite. Finance/Auditor JSON parsing, every figure reference, all screenshot hashes, the unchanged native customer PDF hash and diff whitespace checks passed before handoff. Other agents own renderer, common chapters, Owner training course and final document rebuild; this lane does not restart SSR or generate publication PDFs. No production synthetic data, issued master pixels or historical snapshot values were edited.
