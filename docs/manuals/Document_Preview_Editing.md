# Edit documents from their preview

Use the document preview to review saved content, open editable fields and download the corresponding PDF. Highlighted or underlined fields indicate an available edit or a link to the record that owns the value. You can activate these fields with a mouse or with Tab and Enter.

## Invoice drafts

1. Open **Billing**, choose an invoice in **Draft**, and review its preview.
2. Select an underlined field, or open **Edit Invoice Details**. The editor opens at the relevant field.
3. Change the values, review which project, billing stream or issuing company owns each field, and choose **Save Details**.
4. Wait for the save confirmation. The preview refreshes with the saved values; reload the page to revisit them, or download the latest draft PDF.

Owners and Finance administrators can edit an authorized, unissued draft. Auditor access is read-only. Workers, crew chiefs and project managers do not gain access to commercial invoice editing through a preview link.

| Field                            | What saving changes                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Invoice date                     | This draft's business invoice date. The actual issuance event remains recorded separately.                     |
| Due date                         | This draft's explicit due date. Leave it empty to calculate the due date from invoice date plus payment terms. |
| Payment terms                    | The actual billing stream's payment terms and this draft's calculated due date; the accepted range is 0–365. |
| Purchase No.                     | The existing billing-stream PO override, or the project's actual PO when there is no stream override. |
| Past-due notice                  | The actual billing stream's payment notice. |
| Bank details                    | The issuing company's bank instructions for this currency and deployment. |
| Company contact details          | The issuing company's supplemental division, phone, email and website settings for this currency and deployment. |

A due date must be on or after the invoice date. Changing the invoice date or payment terms recalculates the due date when the explicit due-date field is empty.

Saving changed configuration fields updates their actual owning settings as well as the current draft. There is no separate future-invoice default checkbox. A project PO applies to that project; stream terms and an existing stream PO override apply to that stream. Issuer bank/contact settings are shared by projects and streams using that issuing company and currency in this deployment. New drafts read those real settings. Existing approved and issued documents preserve their snapshots.

Only fields you change write back. Changing an invoice date alone does not replace the current company bank or contact settings with old values from an invoice snapshot. Invoice dates and explicit due dates always belong to the current invoice.

The supplemental company fields do not replace the reviewed issuing legal entity. Use **Issuing authority** and the authorized billing configuration workflow to change that source.

To review bank/contact changes at their source, open **Issuer payment and contact settings**, or go to **Billing → Configure billing** and expand that section. Owners and Finance can save those actual settings there. **Cancel** restores the currently saved values. Billing-stream payment terms, payment notice and PO override are available through **Billing stream settings**; clearing the override restores inheritance from the project PO, or the existing customer reference when the project has none.

If a saved invoice snapshot differs from its current sources, the preview explains that difference. Use the offered rebuild workflow to create a draft from the current source settings. Saving unrelated invoice fields does not silently replace that snapshot with new company data.

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

If another session changes an invoice or an owning project, billing stream or issuer setting, saving shows a conflict instead of overwriting the newer data. Review the retained values, refresh the record and reconcile your changes before saving again. Source updates and the invoice save succeed together; a rejected save does not commit partial configuration changes.
