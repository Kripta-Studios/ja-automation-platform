# Live mixed-rate QA invoice — 2026-09-24

This is evidence from the deployed portal, not a customer invoice. The records belong to the designated synthetic QA client and project. The draft was not issued, sent, paid, or assigned an official invoice number.

- Deployed artifact used for record creation: `zip-361f7828d5d93c09dde6019ad4fd3168`.
- QA project: `01a0cfae-9005-76a9-871a-8cf4edf877dd`; test-only labor stream: `01a0cfb9-759f-7570-8209-9eb301c51bb4`.
- Eight portal-only QA workers were created through the owner Team screen, assigned to this project, and given dated project-specific customer, compensation, and internal-cost rules. Seven are configured to charge €55/hour with €30/hour worker pay; the eighth is configured to charge €70/hour with €45/hour worker pay. The private credential manual is excluded from Git and Docker. No mailbox identity was created for these accounts.
- The owner recorded eight separate 8-hour, duration-only rows for 2026-09-24. The browser submitted each row; the owner operationally approved each and Finance marked each billable. Stored rows have 480 actual minutes and no invented start/end time.
- Chief-workflow QA time on the same project/day was approved and marked non-billable. It was excluded from the labor draft.
- Draft `01a0d26a-5b68-75ad-b440-829cec641142` was created from the visible billing-stream form for 2026-09-24. The stored invoice has eight source-linked lines: 7 × 8 hours × €55 = €3,080, plus 1 × 8 hours × €70 = €560; subtotal and total €3,640 with the test-only zero-tax profile.
- The invoice detail displayed all eight lines, both hourly rates, 64 hours, and €3,640. The browser downloaded the draft preview PDF (262,514 bytes, SHA-256 `b03320c1570b1eb62376da4b1850c7725c585df03cfb7ab3939d37134fdaf48e`); extracted text contained seven €55 lines, one €70 line, 64 hours and €3,640. It did not contain “No invoice lines.”
- The read-only invoice detail acceptance test passed at 360 px and 390 px iPhone widths, 768 px iPad width, and 1440 px desktop, including reload and document-overflow checks (4/4).
- Finance's visible per-person explanation selected the €55/€30/€30 rules for workers 1–7 and €70/€45/€45 for worker 8, with “Person on this project” as the source. Worker 1's expense policy reimburses at cost and bills the customer at cost; worker 8's policy does neither, with expenses included in the labor price. Both policies persisted after browser saves.

This validates the mixed-rate labor draft and PDF. It does not validate a production-issued invoice, mailed artifact, payment, or every commercial model.
