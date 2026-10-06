"""Resolve suite audit wording without rewriting preserved native evidence."""

def apply_readiness_revision():
    for item in pages:
        body = item['body']
        body = body.replace('prepare the initial-data sheet on the next page',
            'prepare the <a href="#bbs-initial-sheet">Initial-data sheet</a> before the first workday')
        body = body.replace('as described in chapter 21',
            'using <a href="#final-issue-procedure">Final invoice issuance</a> and <a href="#invoice-dispatch">Deliver an issued invoice</a>')
        body = body.replace('Linked corrections require their individual Submit action.',
            'Eligible linked correction drafts can be included with ordinary drafts in Submit all week drafts. The October readiness exercises verified both saved source IDs became Submitted and the draft count changed from two to zero. Individual Submit remains available for inspecting one precise replacement.')
        body = body.replace('The weekly bulk action excludes linked correction drafts.',
            'Eligible linked corrections can participate in weekly submission; inspect the actual selected drafts and verify each resulting source state.')
        item['body'] = body

    revise('final-numbering', 'Numbering policy · approved inputs and neutral example',
        route('Billing → Configure billing → Invoice numbering policy', '/billing?view=setup&setup=numbering&lang=en')
        + steps('Select the approved invoice issuer and its currency. Check existing issued numbers and dated numbering policies before adding another policy.',
            'Enter the company-approved Prefix and Digits. A neutral isolated example is TRAINING with 6 digits, producing TRAINING-2026-000001. This is illustrative, not a production recommendation.',
            'Enter the approved Effective date and genuine Accountant approval date/time. Confirm the time basis displayed by the form. The synthetic dates in historical BBS fixtures do not establish accountant approval.',
            'Save the numbering policy once and inspect the saved issuer/currency/prefix/date scope. Resolve overlapping policies rather than reusing numbers. Then follow Final invoice issuance.')
        + note('The original annex retains JA-DEMO--2026-000001 through 000003 exactly as issued in isolation. Its double separator comes from the saved trailing separator in JA-DEMO-. These historical numbers and original PDFs are not edited to match the neutral example.'))

    revise('spreadsheet-exports')['body'] += steps(
        'The normal project page has Download finance export, with dates taken from its current page scope. It does not always show a date selector. Without explicit scope the default is the previous UTC month start through today.',
        'To request another supported scope, open the same project Billing page with periodStart=YYYY-MM-DD and periodEnd=YYYY-MM-DD in the supplied project link. Preserve the project ID and use one real start/end value each; for example change October 1–5 to October 1–6. Reload before Download finance export.',
        'If the application displays Review period after an invalid-date error, use its Period start and Period end correction fields, then retry. The filename identifies requested bounds; it does not preserve an earlier snapshot. Compare generation time and source/issue/payment business dates independently.')

    credit_body = note(
        'Receiving the credit in Collections / Ledger is an inspection/reconciliation step. This release does not expose a general credit-allocation or cash-refund entry procedure here. Keep the separate issued credit and original invoice balances. Do not invent a payment, negative receipt or refund to clear them. Send the original/credit numbers, actual collection/reversal references, intended allocation/refund and genuine payment evidence to Finance/accounting and admin@j-aautomation.com for the supported authorized resolution. Obtain resulting document/ledger references before treating the balance as resolved.')
    at = next(i for i,p in enumerate(pages) if p['key']=='issued-correction') + 1
    pages.insert(at, {'key':'credit-receiving', 'title':'Credit balance · allocation and refund boundary',
        'toc':True, 'wide':False, 'figure':False, 'context':'Reference procedure · supported receiving handoff', 'body':credit_body})

    revise('accounting-pack')['body'] += note(
        'This is a portfolio Accounting cut selected by Period start, Period end and Report language. There is no project/entity selector in the generation form. Inspect the generated legal-entity/currency grouping before sharing it; a project export is a different, narrower output. See the current Finance manual task Accounting · generate and finalize a valid portfolio cut and the Auditor populated-pack lesson.')

    # Current readiness evidence follows the corresponding historical chapter.
    new = {
      'key': 'populated-closeout', 'title': 'Populated closeout · final packages and supported reopening',
      'toc': True, 'wide': False, 'figure': False,
      'context': 'Isolated BBS copy · 6 October readiness exercise',
      'body': route('Project → Project closeout', f'/projects/{PROJECT}/closeout?lang=en')
      + steps('Review pending work, technical risks, customer acceptance, invoices, collections and worker obligations with their responsible roles. Closing a project is not evidence that those obligations are paid. The package can preserve unresolved financial history.',
          'Open Project closeout and select only deliberately authorized customer PDFs. Choose Prepare closeout draft. Inspect both Internal audience preview and Customer audience preview; the internal register contains financial/document history, while the customer package excludes private commercial figures.',
          'If sources changed, choose Refresh draft from current sources and review again. Replace selected customer documents changes selection; it is not approval to disclose them. Verify report acceptance/version references independently.',
          'After reviewing the exact customer snapshot, tick I confirm publication of this exact client snapshot after reviewing the selected content. Choose Confirm client publication, then Finalize both packages. This confirmation authorizes that package content; it is not a customer signature.',
          'Verify Revision 1 · Final and both Ready ZIP download links. Finalization also changes the project to Closed and preserves issued invoices, unpaid balances and source history. Download each intended audience ZIP and inspect closeout-summary.pdf, snapshot.json and manifest.json before distribution.',
          'For genuinely authorized late work on the latest final closeout, the Owner can enter Reason and choose Reopen. This requires the project still be Closed, no active draft and no prior reopening of that revision. Verify the project returns to Active and a new draft revision appears; old final ZIPs remain immutable. Archived projects and older revisions do not acquire a universal unlock.')
      + note('Browser exercise: the populated original BBS copy contained five technical reports, six numbered invoices, collection history, approved expenses and private documents. Both native audience ZIPs downloaded successfully. Owner reopening produced a new draft revision; existing issued/finalized financial locks were not removed. No package was delivered to a real customer. The empty-project close/archive example remains a separate historical exercise.')
    }
    at = next((i for i,p in enumerate(pages) if p['key']=='accounting-pack'), len(pages)-1)
    pages.insert(at, new)
