# Candidate browser audit: invoice planning race

Baseline observed on 27 September 2026 against **committed candidate `5e56d7a`** in the disposable Portal preview at `127.0.0.1:4174`. Actual headless Chromium used separate authorized Owner and Finance browser contexts. In Finance, an approvable disposable draft was approved through the invoice drawer; in Owner, planning dates were entered while that invoice remained approved; Finance then issued it through the invoice drawer; Owner submitted the stale planning form. No production origin was contacted. No email or payment was sent.

The stale Owner POST returned **HTTP 409** with `BILLING_PLANNING_INVOICE_LOCKED` in the response and `data-problem-code`. Read-only fixture DB snapshots before and after the rejected POST were identical for invoice state, version and planning dates; the invoice remained issued. On both 390 px English and 1440 px Spanish, the selected invoice drawer stayed open and a focused notice with a role-safe Review invoice link was visible. No page exception occurred. Console resource errors came from the expected rejected POST and fixture offline-identity 503 responses.

Two recovery defects were visible in the baseline:

- The explanation rendered the literal key `problem.billing.planningInvoiceLocked` instead of translated English or Spanish wording. The [redacted phone trace](phone-pre-fix.json) records the exact visible text; the baseline notice screenshots were replaced by the fresh-build rerun and are not presented as separate artifacts here.
- The planning form disappeared when the invoice refreshed to Issued. Neither attempted date remained in any visible text, input, or hidden input. The actual HTTP 409 payload did include both attempted dates, verified without retaining its raw body. The drawer and selected invoice remained visible. See the [redacted phone trace](phone-response-values-pre-fix.json).

The first two seeded drafts could not be approved for this race because the current billing/source snapshot had changed. Their actual Finance approval returned HTTP 409 `BILLING_READINESS_STALE_BILLING_CONFIGURATION` with an explanation and Review billing setup remedy; an [independent captured case](approval-blocker-pre-fix.json) documents that valid blocker. The race used other disposable drafts that could be approved through the UI.

## Reviewed fix: fresh browser rerun

The reviewed five-file fix was built from candidate HEAD `5e56d7a` (committed tree `2ebda9dbf425e2a8520c40f033057e305c96e04d`) plus the reviewed five-file fix, with a **fresh unique disposable fixture**. The [after-fix trace](after-fix.json) records two independent Spanish browser races: 390 × 844 and 1440 × 900. Both passed.

- Finance approved and issued a disposable invoice through its visible drawer while Owner kept the planning form open in a separate authorized browser context. Owner's stale submission returned HTTP 409 with `BILLING_PLANNING_INVOICE_LOCKED` in the response and notice.
- Exactly one focused notice was visible in the still-open selected-invoice drawer. It explained the cause in Spanish, showed current status **Emitida**, and linked to **Revisar factura**. Focus bounds were 326–542 px on the phone and 430–626 px on desktop, fully within the viewport.
- Both attempted dates remained in the recovery form. The fieldset has the `disabled` attribute/property, both date inputs match `:disabled`, and no Save button is rendered. The note says the attempted dates were not saved. Read-only fixture DB snapshots confirmed no planning write after the blocked action.
- No page exception occurred. The only failed network responses were the expected billing 409 and local fixture offline-identity 503s; console errors were corresponding failed-resource entries.

[Phone notice](after-fix-phone-390-notice.png) and [desktop notice](after-fix-desktop-1440-notice.png) are cropped to translated wording. The JSON uses short one-way invoice references and booleans for attempted date presence. No raw request body, credential, invoice ID, customer detail, or session material is retained. This rerun covers the Spanish phone and desktop race; broader role and locale coverage remains a separate release check.
