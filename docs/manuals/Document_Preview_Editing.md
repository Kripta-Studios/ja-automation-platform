# Edit documents from their preview

Use the document preview to review saved content, open editable fields and download the corresponding PDF. Highlighted or underlined fields indicate an available edit or a link to the record that owns the value. You can activate these fields with a mouse or with Tab and Enter.

## Invoice drafts

1. Open **Billing**, choose an invoice in **Draft**, and review its preview.
2. Select an underlined field, or open **Edit Invoice Details**. The editor opens at the relevant field.
3. Change the values, review the future-invoice checkbox, and choose **Save Details**.
4. Wait for the save confirmation. The preview refreshes with the saved values; reload the page to revisit them, or download the latest draft PDF.

Owners and Finance administrators can edit an authorized, unissued draft. Auditor access is read-only. Workers, crew chiefs and project managers do not gain access to commercial invoice editing through a preview link.

| Field                            | What saving changes                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Invoice date                     | This draft's business invoice date. The actual issuance event remains recorded separately.                     |
| Due date                         | This draft's explicit due date. Leave it empty to calculate the due date from invoice date plus payment terms. |
| Payment terms                    | The number of days used for the calculated due date; the accepted range is 0–365.                              |
| Purchase No.                     | The purchase/PO reference printed on this invoice.                                                             |
| Bank details and past-due notice | The payment instructions printed on this invoice.                                                              |
| Company contact details          | Supplemental company information printed on this invoice, such as division, phone, email and website.          |

A due date must be on or after the invoice date. Changing the invoice date or payment terms recalculates the due date when the explicit due-date field is empty.

The checkbox **Use purchase number, payment terms, bank and company contact details for future invoices in this billing stream** is checked initially. Keep it checked to save those values as defaults for new drafts in the same billing stream. Uncheck it for a change that applies only to this draft. Invoice dates and explicit due dates always apply to the current draft; future drafts use their own dates. These defaults belong to the selected stream, so another project's stream has its own settings.

The supplemental company fields do not replace the reviewed issuing legal entity. Use **Issuing authority** and the authorized billing configuration workflow to change that source.

## Invoice numbers and calculated amounts

An invoice number is assigned when the invoice is issued under its reviewed numbering policy. A draft displays its draft identity until then. Owners can follow **Billing configuration and numbering** to review that configuration.

Hours, expense amounts, rates, tax and totals come from their source records and commercial rules. Use **Edit hours, expenses and billing source records**, **Project and client**, or **Billing configuration** to open the relevant source. Complete any required correction and approval, then rebuild the draft from Billing to update its calculated lines.

Discounts require the billing calculation workflow so payable totals and tax remain consistent; the preview discount field is read-only. A warning about a legacy discount calls for Finance review before issuance.

Approved invoices require a replacement/recalculation workflow before further editing. Issued invoices retain their issued content and use the available void, credit, adjustment or replacement workflow for corrections.

## Daily and technical reports

Open a report's **Document preview**. For a writable Draft or Needs changes report, select a highlighted field, change its value in the editor, and choose **Save and close**. Wait for the save confirmation: the preview updates after the original report acknowledges the save. Report editing follows the report's existing author, role and project permissions.

These edits update the owning report. Project settings and other source records have their own links and permissions. Approved reports preserve their history; when available, use **Create corrected draft**, then submit the correction for the required approval.

Period reports show a saved snapshot. Follow highlighted source links to change authorized records, then use **Recalculate report** to produce an updated snapshot through the permitted lifecycle. Approved and signed versions retain their history.

## PDFs and remembered views

Newly generated invoice and report previews use the same document layout as their PDFs. Choose the same language and document revision when comparing them. Ready historical PDF viewers show the stored artifact that the corresponding download returns. Existing historical PDF bytes remain unchanged. If generation is queued, running or failed, wait for readiness or use the offered retry before downloading.

If the PDF panel says **Earlier layout**, choose **Generate current layout** to create a PDF that matches the current preview. The previous artifact remains listed under **Previous PDF layouts**. A **Download previous layout** link is explicitly historical; when its source has changed, the panel instead explains that a current PDF must be generated.

Filters, currencies and supported view selectors are remembered for your user and role in the same browser. Explicit filtered links take precedence over remembered selections. Use the view's reset control where available, or open that view with `reset=1` in its URL, to restore defaults. Saved viewing preferences do not save invoice edits, report text or payment forms. If browser storage is unavailable, the view remains usable without remembering selections.

If another session changes an invoice or its billing-stream settings, saving shows a conflict instead of overwriting the newer data. Review the retained values, refresh the record and reconcile your changes before saving again.
