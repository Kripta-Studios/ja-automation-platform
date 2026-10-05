page('worker-schedules', '23 · Different worker payment periods and dates',
    route('Owner/Finance → Economic Review → select BBS · Ejemplo de manual → Source records → Settlements → Compensation settlements', f'/finance?view=economic&project={PROJECT}&source=settlements#worker-payments')
    + '<p>Configure each person’s pay method/rate in project Billing → 3. Review each person. Then use Economic Review for that worker’s compensation period and expected payment date.</p>'
    + table(['Decision', 'Where / meaning'], [
        ['Customer billing cadence', 'Project → Billing or Billing → Configure billing. Suggests customer invoice periods.'],
        ['Worker rate and method', 'Project → Billing → Review each person. Hourly, Daily, Fixed per billing period, fixed project amount or percentage.'],
        ['Worker settlement period', 'Economic Review → Settlements. Select Worker, Period start and Period end for each compensation snapshot.'],
        ['Expected worker payment date', 'After finalization, fill the date in that worker’s Expected worker payment form and click Save expected date.'],
        ['Actual payment', 'Separate register used only after a real transfer. Neither finalization nor an expected date proves payment.'],
    ])
    + note('Current limitation: the app has no saved automatic Weekly/Monthly payroll cadence per person. Different periods and dates are manually selected for each worker. Fixed per billing period is a compensation calculation method, not an automatic payroll schedule.'), toc=True)

page('worker-payment-prerequisites', 'Worker payment prerequisites and period selection',
    table(['Before finalizing', 'Check'], [
        ['Role and project', 'Use Owner or authorized Finance. Confirm the project heading is C-0050-P-20261005 for this exercise.'],
        ['Assignment', 'The person’s project assignment must cover the full chosen start/end period. Past assignments can appear when their dates fit.'],
        ['Pay terms', 'The dated compensation rule covers the approved work. The customer charge and internal hourly cost are different fields.'],
        ['Source completeness', 'Review actual approved time and any active corrections. Do not finalize a real period before its work is complete.'],
        ['Periods', 'Keep a written weekly, fortnightly or monthly schedule per person. Choose consecutive non-overlapping periods for that same worker.'],
        ['Prior finalization', 'Review existing settlements first. Finalization freezes a financial snapshot; do not create another period for the same work.'],
    ])
    + note('The October 5 browser exercise deliberately used fictional monthly/fourteen-day periods ending in the future. The saved amounts include only work already recorded and approved, not forecast future pay. This early finalization is for the demonstration; real payroll should wait until the period is complete.'))

page('worker-settlement-steps', 'Finalize one worker’s compensation · exact steps',
    route('Economic Review → Project → BBS · Ejemplo de manual → Settlements', f'/finance?view=economic&project={PROJECT}&source=settlements#worker-payments')
    + steps(
        'Scroll to <strong>Compensation settlements</strong>. Verify the project number/name above the Worker field.',
        'Select <strong>Worker</strong>. Fill <strong>Period start</strong> and <strong>Period end</strong> using the agreed compensation period, independently of the customer invoice period.',
        'For the chief’s opening partial week, select <strong>BBS DEMO - Jefe de crew</strong>, <strong>2026-10-01</strong> and <strong>2026-10-04</strong>. Ten approved hours × USD 40/h = USD 400.',
        'After reviewing the existing settlements and period completeness, click <strong>Finalize compensation</strong> once. Wait for the success notification.',
        'After saving, confirm the selected project remains BBS and reopen <strong>Settlements</strong>. The update preserves the project context after finalization; a wrong project heading must be corrected before another action.',
        'Check the saved worker, period, <strong>Reviewed settlement</strong>, <strong>Actual paid</strong> and <strong>Remaining</strong>. USD 400 reviewed with USD 0 paid means a finalized obligation, not a transfer.',
    ))
fig('worker-period-image', 'Actual BBS settlement form · worker and dates', '64-worker-settlement-period.png', 'Owner/Finance selects one worker and that worker’s compensation period. Finalize compensation saves a snapshot; it does not transfer money.')

page('worker-period-examples', 'Three saved BBS compensation periods',
    table(['Person / schedule example', 'Selected period', 'Saved compensation', 'Expected payment'], [
        ['Crew chief · opening partial weekly period', '1–4 October', '10 h × USD 40 = USD 400', '9 October 2026'],
        ['Technician 1 · manual monthly period', '1–31 October', '3 worked days × USD 240 = USD 720', '3 November 2026'],
        ['Technician 2 · manual fourteen-day period', '1–14 October', 'Fixed USD 900 once for the selected period', '16 October 2026'],
    ])
    + '<p>These three independent periods and expected dates were saved and reopened in the production browser on 5 October. All three show <strong>Actual paid USD 0</strong>, with the full amount remaining.</p>'
    + '<p>The chief’s additional two hours on 5 October belong to the next period and are not included in the USD 400 snapshot. Project economics show USD 2,100 total compensation; these three snapshots total USD 2,020 because that USD 80 is still outside the chief’s selected opening period.</p>'
    + note('The chief’s exact identical worker/project/period retry retained one USD 400 settlement, the original finalization timestamp and the planned date. This confirms exact-repeat idempotency only; it is not verification that differently dated overlapping periods are safe.'))

page('worker-planning-steps', 'Set different expected payment dates · exact steps',
    route('Economic Review → BBS · Ejemplo de manual → Settlements → Expected worker payment', f'/finance?view=economic&project={PROJECT}&source=settlements#worker-payments')
    + steps(
        'Below the settlements table, find <strong>Expected worker payment</strong>. Match the worker name to the correct settlement row and period.',
        'In the chief’s date field, fill <strong>2026-10-09</strong> and click that form’s <strong>Save expected date</strong>.',
        'For technician 1 fill <strong>2026-11-03</strong>; for technician 2 fill <strong>2026-10-16</strong>. Click <strong>Save expected date</strong> for each person separately.',
        'Leave the page and reopen the same project’s <strong>Settlements</strong>. Verify each expected date persisted and the finalized timestamps remained unchanged.',
        'Check <strong>Actual paid</strong> and <strong>Remaining</strong> again. A <strong>scheduled</strong> state is planning, not a paid state.',
    )
    + note('Repeat this manual process for each new agreed worker period. Changing a customer billing stream to Weekly does not schedule a weekly transfer to every worker.'))
fig('worker-dates-image', 'Actual payment planning · independent saved dates', '66-worker-payment-dates.png', 'The chief, technician 1 and technician 2 have different expected payment dates. The dated plans persisted after leaving and reopening the page.')

page('worker-actual-payment', 'Record actual payment only after a real transfer',
    route('Economic Review → selected project → Settlements → Actual worker or supplier payments', f'/finance?view=economic&project={PROJECT}&source=settlements#worker-payments')
    + steps(
        'After the real bank transfer or other payment has occurred, find the correct worker and period under <strong>Actual worker or supplier payments</strong>.',
        'Review <strong>Payee</strong>. Fill the <strong>Actual payment amount</strong>, <strong>Actual payment date</strong>, <strong>Payment reference</strong> and any Note from the bank/reference evidence from the actual transaction.',
        'Review the on-screen payment confirmation notice. Click <strong>Register actual payment</strong> only when the evidence supports that money was transferred.',
        'Reopen the register and reconcile actual paid, remaining balance and payment history. Record partial payments separately rather than changing the compensation rate.',
    )
    + note('The initial planning exercise verified finalization and planned dates only. The original planning captures recorded no actual payment. The later isolated lifecycle chapter covers the independently tested issue and ledger examples; no real bank transfer or customer email occurred. This original form capture is the planning-stage baseline. The additional isolated payment/reversal procedure distinguishes test bookkeeping from actual money movement.'))
fig('worker-payment-register-image', 'Actual payment register · shown without submitting', '67-worker-actual-payment-register.png', 'A prefilled amount is not evidence of a transfer. The Register actual payment button was not clicked; all demonstration settlements remain unpaid.', wide=False)

page('worker-trigger-limits', 'Percentage settlement triggers and tested limits',
    route('Commercial Configuration → select project → Finance configuration → Commercial policies: Worker compensation', f'/finance?view=commercial&project={PROJECT}&source=expenses')
    + '<p>Select <strong>Worker compensation</strong> in the <strong>Commercial policies</strong> dropdown. In the form, select the worker and <strong>Rule type: Percentage of eligible client labor</strong>. Review <strong>Percentage basis</strong>, <strong>Settlement trigger</strong>, percentage and effective dates before creating any new agreement.</p>'
    + table(['Trigger', 'Meaning for eligible percentage compensation'], [
        ['Approved billable labor', 'Eligibility follows the approved billable source basis.'],
        ['Invoice issue', 'Eligible compensation waits for the relevant customer invoice to be issued.'],
        ['Client payment', 'Eligible compensation waits for customer payment evidence; the collected basis determines the eligible collected share.'],
    ])
    + note('These options were inspected in the real form and their percentage-rule gates were reviewed in source. The final BBS invoices were issued in isolation; the percentage-rule transition remains a separate test and is not established merely by those hourly/daily/fixed examples. Do not treat these triggers as an automatic weekly/monthly payroll calendar or a verified general payment gate for Hourly/Daily/fixed methods.')
    + '<p><strong>Corrected display:</strong> the settlements <strong>Source</strong> column shows approved duration as hours: 600 minutes is 10 h and 780 minutes is 13 h. Percentage rules show their monetary basis with currency. Use <strong>Reviewed settlement</strong> for the compensation amount. The saved USD 400 / USD 720 / USD 900 reviewed amounts were independently checked against the selected methods.</p>')

page('spreadsheet-exports', '24 · Spreadsheet exports: hours, costs and revenue',
    route('Owner/Finance → Projects → BBS · Ejemplo de manual → Billing → Invoices and advanced settings → Download finance export', f'/projects/{PROJECT}?tab=billing&periodStart=2026-10-01&periodEnd=2026-10-05')
    + steps(
        'Open the project, then click its <strong>Billing</strong> tab. Scroll below the configuration wizard to <strong>Invoices and advanced settings</strong>.',
        'Click <strong>Download finance export</strong>. The browser downloads an actual <strong>.xlsx</strong> workbook; saving it does not create or issue an invoice.',
        'Verify the filename’s project and dates. This manual downloaded <strong>ja-C-0050-P-20261005-finance-2026-10-01-2026-10-05.xlsx</strong>. The supplied example link opens that exact date scope.',
        'Open the file in Excel or LibreOffice. Read <strong>Summary</strong> first, then the source sheets. If a column is narrow, widen it or scroll horizontally; do not shrink every column onto one unreadable printed page.',
    )
    + note('The manual’s landscape worksheet screenshots are read-only browser previews rendered from the original XLSX cell values and date/decimal formats. They are not screenshots of Microsoft Excel. Original row numbers and selected column letters are shown; wide sheets are split for readability. The two original workbook files are included as PDF attachments.'), toc=True)
fig('finance-export-button-image', 'Actual app · download the project finance workbook', '68-download-finance-workbook.png', 'Project → Billing → Invoices and advanced settings → Download finance export. The example covers 1–5 October, including both demonstration stages.')

page('spreadsheet-sheets', 'Pre-issue finance workbook · what each tab means',
    table(['Worksheet', 'What to read / how to use it'], [
        ['Summary', 'Project/date scope, hours, potential customer charges, direct costs, worker compensation, contribution, issued invoices, collections and forecast.'],
        ['Labor', 'Each time source: worker/date/category, actual and billable duration, potential customer charge, internal cost, compensation and approval/billing status.'],
        ['Expenses', 'Purchase payer, receipt amount, calculated/paid reimbursement, company cost and Finance-approved customer recovery.'],
        ['Unbilled WIP', 'Approved source amounts not yet issued on a customer invoice. Drafts can coexist with WIP.'],
        ['Daily minimum', 'Additional billable duration/charge from the configured daily minimum; no example rows in this download.'],
        ['Invoices', 'Invoice state, service period, total, expense lines and collected payments. Draft is not issued or paid.'],
        ['Invoice expenses', 'Actual expense lines placed on invoices: the BBS parking 22, hotel 100 and meal 60.'],
        ['Milestones', 'Milestone sources/approval/amount; no milestone rows in this example.'],
        ['Alerts', 'Finance alert code and affected record; no alert rows in this download.'],
    ])
    + note('A blank means missing/not available, not zero. Money is in project currency unless a source currency is explicitly identified. Exact minor-unit columns support reconciliation: USD 182.00 corresponds to 18,200 cents.'))

page('spreadsheet-reconciliation', 'Pre-issue snapshot · economic meanings',
    table(['Actual downloaded value', 'Meaning'], [
        ['42.50 actual / approved / billable hours', '35 stage-1 hours plus 7.5 stage-2 hours. Use this date scope when comparing sources.'],
        ['USD 4,490 labor + USD 182 expense recovery', 'USD 4,672 potential/approved operational customer charges. These are not collected cash.'],
        ['USD 1,520 internal labor + USD 230 expenses', 'USD 1,750 direct company cost; includes USD 180 travel and USD 50 other direct expenses.'],
        ['USD 2,100 worker compensation', 'Separate compensation basis; not an additional copy of every internal loaded labor cost. Use the applicable pay rule and settlement period.'],
        ['USD 2,922 contribution / 62.54%', 'USD 4,672 potential charges minus USD 1,750 direct cost. This is an operational margin, not cash in the bank.'],
        ['Issued invoice and collected totals: USD 0', 'In this original pre-issue snapshot the three invoice examples are drafts. Their USD 2,230 / USD 182 / USD 2,260 totals appear on Invoices; none is issued or collected at this snapshot. See the separate after-lifecycle workbook for their later confirmed state.'],
    ])
    + note('The export assigns the fixed USD 900 compensation to the first eligible worker/rule row; later parts carry zero additional compensation. The Labor compensation column sums to USD 2,100, matching Summary. Reconcile that grouped basis to each reviewed settlement period rather than multiplying the fixed amount by every time entry. Daily/weekly full customer units are likewise grouped; a later part can correctly carry zero additional charge.'))

preview_captions = {
    'Summary': 'Read the selected scope and economic labels. Potential customer charges, costs and compensation are distinct from issued invoices and collected cash.',
    'Labor': 'Actual and billable hours are separate from the customer rate unit. The second part of a day/week can have zero additional customer charge. Reconcile fixed pay at the grouped Summary/settlement level.',
    'Expenses': 'Receipt amount, company cost, reimbursement and customer recovery are independent. The four purchases total USD 230; eligible client recovery totals USD 182.',
    'Invoices': 'The original pre-issue workbook lists three Draft invoices, USD 2,230 / USD 182 / USD 2,260, with USD 0 collected. Invoice service periods can extend beyond the operational export window.',
    'Invoice expenses': 'These native invoice lines total USD 182: parking USD 22 (10% markup), hotel USD 100 and shared meal USD 60. Company-card tools are included in labor and have no extra charge.',
    'Unbilled WIP': 'Source IDs preserve traceability. Approved but unissued charges remain WIP; a draft preview is not an issued invoice.',
    'Totals by currency': 'The operational register totals purchases and reimbursement by receipt currency. This is not a customer expense invoice total.',
}
preview_meta = json.loads((FIG/'workbook-previews.json').read_text())
for item in preview_meta['views']:
    if 'after-lifecycle' in item['file']: continue
    fig(item['key'], item['title'], item['key']+'.png', preview_captions[item['sheet']], wide=True)

page('expense-workbook-steps', 'Download the separate expense register workbook',
    route('Expenses → Filter expenses → Project: BBS · Ejemplo de manual → Apply filters → Export filtered results → Download Excel', f'/expenses?project={PROJECT}')
    + steps(
        'Open <strong>Expenses</strong>. In <strong>Filter expenses</strong>, select the BBS training project and any required worker/date/status scope. Click <strong>Apply filters</strong>.',
        'Check the active Project filter and <strong>4 matching records</strong>. Use <strong>Export filtered results</strong>, not an unreviewed all-project export.',
        'Click <strong>Download Excel</strong>. The actual example filename is <strong>Expenses_2026-10-02_2026-10-03.xlsx</strong>; the filtered register derives the first/last matching expense dates.',
        'Open <strong>Expenses</strong> and <strong>Totals by currency</strong>. The USD recorded total is 230. Review source amount, payer, approval and reimbursement status. This operational export does not contain the complete Finance recovery/margin calculation.',
    )
    + note('Use the project finance workbook’s Expenses and Invoice expenses tabs for customer recovery and invoiced expense amounts. An expense purchase total of USD 230 and customer invoice total of USD 182 are both correct because tools are included and parking has markup.'))
fig('expense-export-button-image', 'Actual app · export only the filtered BBS expenses', '69-download-expenses-workbook.png', 'Expenses → Export filtered results → Download Excel. The downloaded workbook contains the four matching BBS purchases, with its own Totals by currency tab.')

page('spreadsheet-verified-scope', 'Spreadsheet verification and original workbook attachments',
    '<p>Both workbooks were downloaded through the real production browser controls. The project finance workbook contains nine sheets; the expense register workbook contains two. Their OpenXML ZIPs parsed successfully, and the previews use the original cells without editing them.</p>'
    + steps(
        'Use your PDF viewer’s <strong>Attachments</strong> panel to save <strong>BBS-project-finance-2026-10-01_2026-10-05.xlsx</strong> and <strong>BBS-expenses-2026-10-02_2026-10-03.xlsx</strong>. These are renamed copies of the native downloads; their bytes are unchanged.',
        'Compare worksheet row numbers/column letters with the landscape previews. All columns remain available in the attached originals.',
        'Before sharing with a customer, review privacy: these internal workbooks contain worker pay, internal cost and margin. Customer invoice PDFs are separate documents.',
    )
    + note('The final issued customer PDF originals remain at the very end, with all six original invoice pages unchanged. This export snapshot was captured before invoice issuance. It does not establish a Microsoft Excel edit/save cycle or formula recalculation. The later final PDF annex establishes genuine application issuance in isolation.'))
