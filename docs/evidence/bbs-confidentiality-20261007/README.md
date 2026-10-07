# BBS confidentiality and consistency revision — 7 October 2026

Audience: Owner and specifically authorized documentation/product reviewers. This evidence describes information omitted from operational guides. Do not distribute it through an operational Help library.

The user explicitly authorized Finance and Auditor to retain their current financial access, while reserving costing and margin guidance for Owner. This release preserves own pay/reimbursement, actual work/purchase facts and financial history. It changes role presentation and safe server projections, not financial calculations or the financial access policy.

## Review closure

| Review IDs | Implemented result |
| --- | --- |
| PRIV-01, PRIV-03 | Factual time/expense instructions in operational desktop/phone/tablet UI, Chief allocation copy and supplier copy. Native replacement screenshots follow the corrected UI. |
| PRIV-02 | Commercial time detail fields omitted at the operational server DTO boundary; Billability card limited to authorized financial roles. Operational registers also omit Billability. |
| PRIV-04, PRIV-05 | Operational practice setup lists own account/environment/project/date/start record/outcome. Recovery asks for visible source ID/date/state/correction/reason and routes a locked source to the designated administrator. Full trainer/receiving financial instructions remain in restricted Owner/Finance material. |
| PRIV-06 | Chief linked-correction lesson describes eligibility/delegation and factual review; another worker’s settlement-period context is removed. |
| PRIV-07 | Existing role-specific Help/download authorization is preserved and tested, including denied Owner/legacy direct downloads and unauthenticated requests. Production bytes/access results are recorded after deployment. |
| POLICY-01 | Finance maintains permitted dated inputs using Owner-approved values; necessary actual control labels remain. Finance/Auditor permissions and permitted financial outputs remain unchanged. Owner retains costing/margin explanations and the explicit audience policy. |
| DOC-01, DOC-04, DOC-05 | Native full Save draft/receipt captures and the actual saved Personnel roster with names/assignment dates replace incorrect/clipped images. |
| DOC-02 | External Technical form lesson/caption uses its actual Save PLC report label. |
| DOC-03 | Supplier first-access duplication replaced with Supplier team/project verification; unnecessary employee-finance comparison removed. |
| DOC-06 | Chief boundaries consistently describe the supported entry-only role and independent reviewer handoff. |
| DOC-07 | Worker report lesson ends at its observed Submitted checkpoint; later independent approval is attributed separately. |
| DOC-08 | Auditor recovery uses inspect/request/verify; no Auditor write instructions. |
| DOC-09, DOC-10 | Owner cross-references use current Owner-only section titles, and credit ledger instructions describe inspection/reconciliation plus documented support handoff. |
| DOC-11 | Shared operational final verification is a short role-specific completion check. Long shared financial/Accounting/72-finding QA histories stay restricted. |
| PM personal statement | Full period selection → Generate report → Ready status → PDF/CSV download sequence included. |
| Owner document audience | Explicitly distinguishes the shared Finance/Owner/Auditor category from Owner-only delivery; unavailable Owner-only selection uses restricted Owner distribution. |

## Verification

- [Strict PDF verification](pdf-verification.json): all eight current PDFs, **716 physical pages**; instruction text, task bookmarks/page references, image hashes and layout pass. Seven non-Owner guides contain no embedded files. Owner keeps three original invoice PDFs, three XLSX workbooks and six unchanged native invoice annex content streams.
- [Screenshot audit](screenshot-audit.json): all **165 unique raster images actually embedded in the five operational PDFs**, including shared chapters, were OCR checked. Sensitive replacement forms and rendered PDF pages were visually inspected. No commercial-process or Billability disclosure remains. Residual generic historical search placeholders, own statement wording and permitted customer-report receiving handoffs are explicitly classified.
- [Native capture manifest](capture-manifest.json): 26 replacement captures from the isolated runtime. Captions identify current source states rather than relabelling later outcomes as earlier drafts. A refused historical correction returns neutral instructions without creating a replacement.
- [Native role cycle](role-cycle-verification.json): five genuine operational personas saved/submitted synthetic time, independent authorized Owner review, Worker linked correction to Approved, own statement PDF/CSV downloads. Help across eight roles and complete time-form controls across five operational roles pass at **360/390/768/1440px**. Supplier time uses its documented Owner receiving role. No physical-device certification is claimed.
- [Native receipt cycle](expense-cycle-verification.json): synthetic receipt-backed expense save/submit/independent review and linked factual correction; receipt, amount, currency and payer preserved.
- Portal production build, Portal TypeScript check and scoped ESLint pass. Manual privacy regression: **8/8**. Independent reviewer reran six scoped suites: **62/62**, covering DTO privacy, correction/expense failures, live-session repository privacy, catalog policy and own-statement projection. Additional compensation/currency/pay/operational-loader/catalog suites: **32/32**. Direct manual-download security suite passed standalone. One earlier concurrent run hit the fixture-setup timeout; its isolated rerun passed. Historical own-pay UI marker tests and legacy finance fixture tests previously failed before the changed assertions; the scoped projection/calculation suites and actual native statement cycle provide current behavioral evidence. No full repository-suite pass is claimed.
- Independent final reviewer found no material confidentiality/policy failure. A locked correction form may remain visible after the refusal, while the server correctly prevents a replacement and provides the neutral handoff. This is an existing affordance limitation.

The runtime used separate loopback SQLite/documents and synthetic records; no production business forms were submitted. This bounded revision does not certify every deployed screen/output, external bank/SMTP delivery, or global Client Essential acceptance. Historical review material and legacy guide families remain restricted; an English fallback is explicit for unsupported manual languages.

Canonical deployment, live role download hashes and before/after production business-record integrity checks are recorded after publication.
