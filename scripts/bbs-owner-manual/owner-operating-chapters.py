def build_owner_start():
    page('owner-first-access','Start here · Owner access and this guide',
        '<p>This guide combines a saved BBS worked example with operational instructions for the Owner. It is not proof that every possible contract, integration or exception was exercised. The verification chapter distinguishes browser-tested operations from source-checked reference instructions.</p>'
        +steps('Open the portal link provided by the company. Sign in with your own Owner account; review your name and role before changing business records. The first Owner is provisioned by the platform operator. An existing Owner creates the rest of the team in the application.',
            'Choose your interface language from the account/navigation language control. On a phone, open the navigation menu to reach the same named workspaces.',
            'Open <strong>Help</strong> for the relevant manual. Use this BBS guide for the lab and financial cycle; Administration, finance and audit is the broader reference.',
            'If login or account access fails, use the account recovery offered on the sign-in page or contact the company administrator. Another person’s credentials are not an account-switching feature.')
        +note('Two environments appear in the evidence. Initial BBS operational records and pre-issue exports were inspected in the saved fictional project. Issue, payment, reversal and onboarding exercises use a separate local training database. They do not alter the real company’s cash ledger or establish real accountant approval.'),toc=True)
    page('owner-navigation','Owner navigation · choose the workspace',table(['Workspace','Use it for'],[
        ['Dashboard / Projects','Operational attention, customer/project directory, project team, dates, budgets and project detail.'],
        ['Team / Crew','Account/person administration versus dated chief delegation and entry on behalf of a crew.'],
        ['Time / Expenses / Approvals','Actual sources, evidence, submission, operational review and Finance treatment.'],
        ['Reports','Daily and Technical / PLC facts; reviewed period files and separate Client Sign-off.'],
        ['Finance Overview','Portfolio financial position and attention; open the underlying project before changing a figure.'],
        ['Economic Review','Project potential charges, costs, compensation, contribution and settlement/payment registers.'],
        ['Commercial Configuration','Dated policies, expense classification and project issuing authority.'],
        ['Project → Billing','That project’s people/defaults, invoice settings and project finance export.'],
        ['Billing → Invoices / Collections','Cross-project invoice lifecycle, dispatch, collections and ledger reconciliation.'],
        ['Accounting / Documents / Audit','Period packs; private files and outputs; preserved history.'],
        ['Planning / Notifications / Profile / Help','Future assignments and availability; attention; own settings; instructions.'],
    ])+note('A workspace name is not a financial state: opening Billing does not issue a document, and marking a notification read does not approve a source.'),toc=True)
    page('owner-access-model','Person, role, assignment and review permission',table(['Layer','What it grants / what to verify'],[
        ['Person record','A named person/contact; search before creating another person with the same identity.'],
        ['Account and access role','Sign-in and platform permissions. Active access does not automatically assign a project.'],
        ['Project assignment','Participation for its dated interval. Work and settlement periods must fall within that coverage.'],
        ['Review authority','Permission to review the applicable project/source; a worker cannot self-approve by becoming chief.'],
        ['Crew-chief delegation','Entry for named assigned colleagues over a dated interval, separately from their platform role.'],
        ['Supplier relationship','External technician/coordinator restrictions and permitted supplier payee; review the supplier link.'],
    ])+steps('Verify each layer before asking a worker to enter time. A missing project in their selector usually means checking active access and dated assignment first.','When someone leaves, close permitted access and future assignments/delegations while keeping their approved historical sources. Review ongoing work and pay obligations separately.')+note('The Owner account is protected from ordinary role/offboarding controls. A restricted supplier profile can override the underlying Worker role; do not infer full internal-worker access from that label.'),toc=True)
    page('owner-team-onboarding','Create workforce access · exact controls',route('Owner → Projects → Team → Create user','/projects?view=team&lang=en')+steps(
        'Search the Team directory by name/email. Click <strong>Create user</strong>. In <strong>Create user access</strong>, choose the existing person when the person already exists, or enter the new person’s Name, Email and optional contact details.',
        'Choose the permitted <strong>Access role</strong>. External technician and Supplier coordinator require the correct supplier; they are different from unrestricted internal workers.',
        'For a local account select <strong>Set email and password</strong>. Supply the correct email and a password of at least 12 characters. Click <strong>Create user access</strong> and confirm the saved account in Team. This action does not send an email.',
        'Alternatively choose <strong>Invitation link</strong>. Review the generated private activation link and share it using the company’s trusted channel. Treat the link as an access secret; the application does not imply automatic email delivery.',
        'Open the project’s <strong>Team</strong> tab and assign that person with dates covering the work. Add crew delegation separately in <strong>Crew</strong> when needed. Ask the worker to sign in with their own credentials and confirm project visibility.'
    )+note('Training account provisioning was exercised only in isolation. Do not copy demonstration emails/passwords into a real employee account.'),toc=True)
    page('bbs-inspect-or-create','Two learning paths · inspect or build',table(['Path','Starting state and action'],[
        ['Inspect the saved example','Open BBS · Ejemplo de manual, C-0050-P-20261005. Inspect sources, dated terms and outputs. Do not recreate it or edit earlier locked agreements merely to match an illustrative screenshot.'],
        ['Build your own project','Use a separate client/project and real agreed values. Follow account → assignment → dated terms → reporting/issuer/stream prerequisites before recording work.'],
        ['Complete the training financial cycle','Use an isolated copy of the fictional BBS example. Final training PDFs are included at the end. Synthetic approval/payment entries are demonstrations.'],
    ])+steps('For an existing project, start at its first unfinished prerequisite. Locate the saved project by number, not only a similar name.','For a new project, prepare the initial-data sheet on the next page. Enter initial terms before the first workday, then add later agreements with later effective dates.','Use the checkpoints after each stage; a form filled in the browser is not a saved agreement until its save succeeds and it can be reopened.')+note('Real BBS Mexico and Junkers projects inspired the naming/currency/issuer context. Their operational and financial history is outside this fictional exercise.'),toc=True)
    page('bbs-initial-sheet','Initial data sheet · before the first work record',table(['Item','Required initial state'],[
        ['Project / client','Fictional BBS project in USD, America/New_York site timezone, start and all three assignments from 1 October 2026, with no saved assignment end.'],
        ['People','Active chief, technician 1 and technician 2 worker accounts; all assigned to this project.'],
        ['Customer terms for 2–3 October','Chief USD 80/hour; technician 1 USD 60/hour; technician 2 USD 55/hour.'],
        ['Worker pay terms','Chief USD 40/hour. Saved training rules include technician 1 USD 240/day and technician 2 fixed USD 900 per selected settlement period effective 2 October. Inspect their earlier dated rules rather than inferring pay from customer rates.'],
        ['Later customer change','From 5 October: chief USD 80/hour, technician 1 USD 600/day and technician 2 USD 1,500/week. Earlier customer work keeps its hourly terms.'],
        ['Delegation','Saved chief-to-technician delegations run 1–31 October 2026, covering the initial crew entry. All three project assignments have can_review = false; chief delegation grants entry, not approval.'],
        ['Expenses','Policies for worker/company payer, reimbursement and customer recovery; receipt/evidence and currency requirements.'],
        ['Invoice readiness','Dated issuer authority, currency/tax compatibility, streams, reporting/sign-off requirements and final numbering policy.'],
    ])+note('Checkpoint: before entering 2 October work, all three assignments, customer agreements, pay rules and applicable delegations cover that date. Screenshots of a later agreement do not establish the earlier one.'),toc=True)
    page('contract-decisions','Translate the contract into independent settings',table(['Business agreement','Configure and verify'],[
        ['Customer daily minimum, hourly worker','Set the customer minimum on the hourly commercial model; keep worker Hourly pay on approved actual hours. A minimum adds customer charge, never fictitious time.'],
        ['Daily customer price / daily worker price','Set each independently. Customer Daily is a full eligible worked-day unit; worker Daily uses the saved compensation rule and eligible days. Compare separate charge and pay totals.'],
        ['Included customer expenses, reimbursable worker receipt','Use included-in-labor customer recovery and the worker’s reimbursement source/payer policy. Included customer pricing does not cancel a worker obligation.'],
        ['Capped T&M','Configure the agreed ceiling/budget; inspect budget consumption and alerts before invoicing the next period. Do not replace the cap with a guessed rate.'],
        ['Fixed-period worker pay','Choose the settlement period deliberately. USD 900 per selected period is not USD 900 per time part or an automatic weekly schedule.'],
        ['Percentage compensation','Select the precise eligible labor basis and trigger (approved labor, invoice issue or client payment). Expenses/tax are not automatically included.'],
    ])+note('If applicable rules are missing or conflicting, inspect dated rules and assignments in Commercial Configuration. Resolve the coverage/conflict before saving financial history; a different dropdown value is not a remedy.'),toc=True)
    page('overtime-reference','Overtime and full units · verify both sides',
        '<p>A Time category such as Overtime describes the work. It does not automatically apply an extra multiplier. The stage-1 chief’s two overtime hours are still billed at USD 80/hour and paid at USD 40/hour under this saved agreement.</p>'
        +steps('Open the selected person’s dated project Billing terms and inspect the actual customer and worker rule covering the work date.',
            'If the contract requires a premium, inspect the available dated commercial rule controls in <strong>Commercial Configuration</strong>. Record only the supported rule and effective dates; do not use invoice presentation editing to manufacture a premium.',
            'Test an eligible approved source and reconcile its customer charge, internal cost and compensation separately in Economic Review and the export.',
            'If the desired premium or day boundary is not represented by the offered controls, resolve it with the company administrator before entering a substitute agreement.')
        +note('This BBS lab verifies its saved standard category rates and full customer day/week grouping. It does not establish every overtime contract or percentage trigger. Those need their own agreed rule and acceptance example.'),toc=True)

def build_owner_cycle():
    page('correction-states','Correct time by its current state',table(['State','Procedure / preserved history'],[
        ['Unsubmitted draft','Open the saved draft; Edit/Save the actual facts. Delete/withdraw only the permitted unsubmitted draft, including linked-pair handling.'],
        ['Submitted','Use the reviewer’s request for changes, or the record’s permitted withdrawal. Submitted facts are not silently editable.'],
        ['Returned / needs changes','Follow the record’s correction/edit action; supply the reason and corrected facts, then resubmit. Review both operational facts and Finance treatment again.'],
        ['Approved, no active correction','Use Create correction on the approved record, with the actual reason and replacement facts. Original approved history remains linked.'],
        ['Already in a draft/settlement','Inspect reservations and locks. Correct through the supported source lifecycle; recalculate/review an unissued invoice using its reason field. Finalized obligations require their financial correction flow.'],
        ['Issued invoice','Use the authorized void/credit/adjustment/replacement flow. A new source cannot overwrite the old invoice snapshot.'],
    ])+note('Check for an existing active correction before creating another. A correction is linked to the original; duplicating an eight-hour source with a six-hour row risks counting both.'),toc=True)
    page('correction-worked','Worked correction · eight hours should be six',route('Time → filter the project and date → open the original record','/time?lang=en')+steps(
        'Locate the original eight-hour source by worker, date, activity and state. Open its details. If submitted, request changes in Approvals with the factual reason; if approved, open its available corrected-draft form.',
        'Enter six actual hours and a reason explaining the two-hour correction. Preserve actual dates/category/activity and linked receipt context. In the Owner returned-record form click <strong>Create owner override draft</strong>. Its exact heading is <strong>Create corrected draft</strong>; a linked correction cannot be edited after creation. Review first or withdraw an unsubmitted correction and start again.',
        'Open the linked correction, check the replacement values and use its individual <strong>Submit</strong> action in the record detail or Time register. Review the exact linked correction before submission; the weekly selector may also include eligible correction drafts. This exercise uses individual Submit. The reviewer uses <strong>Approve</strong> after checking the correction; Finance records the intended commercial treatment.',
        'Reopen Time and the correction history. Confirm the replacement is the active source and the original remains traceable, rather than two independently eligible records.',
        'For an unissued invoice affected by the correction, open its details, enter <strong>Recalculation reason</strong> and click <strong>Recalculate and review draft</strong>. Review included/excluded sources and totals before approving again.'
    )+note('If a finalized settlement or issued invoice prevents correction, inspect the displayed lock/remedy and escalate the financial adjustment. Do not delete history or create a duplicate project to bypass it.'),toc=True)
    page('operational-review','Review an active queue · Owner and Finance handoff',route('Approvals → filter project','/approvals?lang=en')+steps(
        'Choose the project in Approvals and apply the filter. Open an item still waiting for review, rather than only looking at the finished empty queue.',
        'As operational reviewer, check worker/date/actual duration or expense, activity, receipt and correction context. Click <strong>Approve</strong> when correct; otherwise request changes with the specific reason.',
        'In <strong>Finance review</strong>, inspect the operationally approved item. Choose <strong>Commercial treatment: Billable</strong> or <strong>Non-billable</strong> for time.',
        'When an expense says <strong>Classify this expense before Finance review</strong>, open <strong>Classify expense in Finance</strong>, save payer/recovery/reimbursement decisions, then return.',
        'Click <strong>Record Finance review</strong>. Reopen the source or filtered queue and verify the saved treatment. An empty queue verifies completion after the actionable example.'
    )+note('Operational approval confirms facts. Finance review decides the commercial treatment. Customer acceptance, invoice issue and worker payment are later states.'),toc=True)
    page('report-model','Reports and customer acceptance · distinct evidence',table(['Record','Purpose and role handoff'],[
        ['Time source','Actual duration/activity, submitted by worker/chief, reviewed operationally and commercially.'],
        ['Daily report','Completed work, blockers and next steps; worker submits and Owner/PM reviews.'],
        ['Technical / PLC report','Diagnosis, change, validation, impact and backup/rollback evidence, with author/date.'],
        ['Period report','Finance/Owner generates a snapshot of reviewed sources for selected dates and audience.'],
        ['Client Sign-off','Customer acceptance evidence bound to that precise period report version and PDF.'],
        ['Invoice','Customer charge snapshot and later numbered issue; it does not replace technical evidence.'],
    ])+note('If the project enables required daily/technical/weekly reporting or client acceptance, complete those requirements before treating the period as ready. Turning a switch on creates a dependency; it does not generate or sign the report.'),toc=True)
    page('daily-report-procedure','Create and review a Daily report',route('Reports → Daily reports','/reports?view=daily&lang=en')+steps(
        'Worker opens <strong>Reports → Daily reports</strong> and click <strong>New daily report</strong>. Choose assigned Project and actual Date (Owner also chooses the entitled Worker), then fill <strong>Shift summary</strong>, <strong>Tasks completed</strong>, problems/corrective actions, open items and next-day plan.',
        'Click <strong>Save daily report</strong>, reopen the saved draft and verify factual content/attachments. Use its <strong>Submit</strong> action when ready.',
        'Owner/PM opens the submitted report and reviews the operational facts. Click <strong>Approve report</strong> when the facts are correct, or use <strong>Review actions</strong> to return with a reason.',
        'Check the register’s saved state and report history. If returned, correct the draft through the report’s permitted edit/submit flow.',
        'For Technical / PLC, create the appropriate technical record instead: include diagnosis, changes, validation/result, production impact, risks, rollback plan and actual backup evidence. Required safety review is a separate responsibility.'
    )+note('An attachment upload alone does not submit a report. A Daily report cannot be used as a technical change record merely because a PDF is attached.'),toc=True)
    page('period-report-procedure','Generate the customer-safe period file',route('Reports → Refresh period reports','/reports?view=signoff&lang=en')+steps(
        'As Owner/Finance expand <strong>Refresh period reports</strong>, then click <strong>Open period refresh</strong>. Select Project, <strong>Period start</strong>, <strong>Period end</strong> and <strong>Report language</strong>. Confirm approved source readiness for this scope.',
        'In <strong>Customer report content</strong>, select Hours only, Hours and activity summary, or Hours, activity and selected technical reports. Technical details enter the customer file only when deliberately selected.',
        'If technical content is selected, choose the intended approved records in <strong>Technical reports to include</strong>. Review customer visibility before clicking <strong>Refresh reports</strong>.',
        'Open the created customer period record in <strong>Client Sign-off</strong>. Review the exact source/version; use <strong>Approve customer report</strong>, then <strong>Generate report</strong> for the selected language. Wait for that PDF to become Ready and download/review its exact version.',
        'Keep internal cost/pay/margin outputs private. Creating this period file neither issues an invoice nor records customer acceptance.'
    ),toc=True)
    page('signoff-evidence','Record genuine sign-off against the exact version',route('Reports → Client Sign-off → Open sign-off record','/reports?view=signoff&lang=en')+steps(
        'Open the ready period record. Compare project/dates/version and the file presented to the customer. Review acceptance readiness and any source-change warning.',
        'Obtain the signed copy from the customer using the company’s real acceptance process. In the record’s sign-off form, upload <strong>Signed PDF copy</strong> (complete PDF, maximum 20 MB), fill <strong>Signer name</strong>, optional <strong>Signer identity</strong> and actual <strong>Customer signature date</strong> for that version.',
        'Click <strong>Record verified signed-copy evidence</strong> only when the evidence is valid. If scanning is pending, use <strong>Retry after security scan</strong>, then <strong>Complete sign-off with saved PDF</strong>; do not upload the same evidence again. Reopen the record and check verified state and the evidence/version association.',
        'If underlying approved sources change, prepare a replacement report and obtain acceptance for that replacement. A previously signed report remains preserved and is not silently rewritten.',
        'To invalidate a mistaken acceptance, the authorized Owner/Finance opens <strong>Invalidate sign-off</strong>, fills <strong>Reason for invalidation</strong> and clicks <strong>Confirm invalidation</strong>, then follows the return/dispute or replacement flow.'
    )+note('The isolated browser created, submitted and approved Daily and Technical reports, approved customer period version 2, generated its English PDF and downloaded the Ready output. Customer acceptance remains pending: no signed copy was supplied and no signature was fabricated. Report generation and sign-off form navigation can be tested without claiming the customer accepted the work.'),toc=True)
    page('final-numbering','Choose numbering · business approval and training data',route('Billing → Configure billing → Invoice numbering policy','/billing?view=setup&setup=numbering&lang=en')+table(['Field','Production proposal / training example'],[
        ['Issuer and currency','J&A Automation LLC / USD; confirm the company/currency scope before saving.'],
        ['Prefix','Proposed production prefix: JA-USA (no trailing separator). Training stored prefix: JA-DEMO-.'],
        ['Digits','6 sequence digits; example proposed format JA-USA-2026-000001.'],
        ['Effective date','Proposed production date: 5 October 2026, subject to the company’s approved cutover. Training fixture: 1 October 2026.'],
        ['Accountant approval date/time','Enter genuine documented approval in production. Training fixture stores 5 October 2026 08:00 UTC (10:00 Europe/Madrid); this is synthetic test data, not an accountant fact.'],
        ['Sequence / existing policies','Check existing issued numbers and issuer policy before creating a new one. Never reuse a number or change historical numbering.'],
    ])+note('The user authorized choosing a convention. That supports the JA-USA / 6-digit proposal; it cannot turn a fabricated timestamp into actual accountant approval. At verification, the production BBS invoices had not been issued. Final annex files are genuinely issued training documents from isolation.'),toc=True)
    page('final-issue-procedure','Final invoice issuance · exact tested progression',route('Billing → Invoices → open reviewed invoice','/billing?view=invoices&lang=en')+steps(
        'Review the draft’s client/issuer/currency, source dates, lines, full-unit grouping, PO, taxes, due date and payment instructions. Resolve every readiness message, including required source review, legal authority and customer sign-off.',
        'Click <strong>Approve</strong>. Wait for the detail state to become <strong>Approved</strong>. Approval is still before issue and the preview is still unnumbered.',
        'With the correct effective numbering policy configured, click the actual <strong>Issue invoice</strong> action. Confirm the issue warning once. The application assigns the final number and locks the financial snapshot.',
        'Wait for the final PDF artifact to become <strong>Ready</strong>. Click <strong>Download PDF</strong>, open the file and check <strong>INVOICE</strong>, its assigned invoice number and total. A preview watermark means you downloaded the review-stage file.',
        'Reload the saved detail and verify Issued state and number. The annex supplies the native final files for USD 2,230 labor, USD 182 expenses and USD 2,260 mixed-unit labor.'
    )+note('The final files were downloaded after genuine issue in the isolated application. Their native content is preserved. A PDF editor was never used to hide preview marks or invent final numbers. Final downloads return the integrity-checked stored master; later UI/template changes do not regenerate or rewrite that issued file.'),toc=True)
    page('invoice-dispatch','Deliver an issued invoice and check the result',route('Billing → Invoices → open the issued document','/billing?view=invoices&lang=en')+steps(
        'Download and verify the final Ready invoice file. Review the billing recipient/contact and actual delivery method.',
        'For delivery outside the app, send through the company’s approved channel and use the document’s dispatch-recording action with the actual date/reference. Download alone is not dispatch.',
        'For app email, use its available send/email action only with an authorized real recipient and configured delivery service. Review queued/sent/failed result and recorded delivery history.',
        'If delivery fails, inspect the error, recipient and service configuration, then use the supported retry. Do not assume success from clicking Send.',
        'Return to Collections / Ledger to track receivables. Issuing, delivering and collecting are three different operations.'
    )+note('No demonstration was emailed to a real customer. Email transport and external delivery confirmation remain outside this isolated exercise; this page is a source-checked operating reference.'),toc=True)
    page('collections-procedure','Record collections · partial, later and correction',route('Billing → Collections / Ledger → select invoice','/billing?view=ledger&lang=en')+steps(
        'Filter by the intended client/project, currency and collection status. Open the issued invoice and compare its number and outstanding balance with bank evidence.',
        'In its collection form enter the <strong>Amount</strong>, <strong>Payment date</strong>, required reference from the actual receipt. Click <strong>Record payment</strong> once after reviewing the confirmation notice.',
        'Reopen the ledger and history. The isolated expense example is USD 182: a USD 100 partial collection leaves USD 82. A later USD 82 receipt changes this invoice to Paid. The separate mixed-labor USD 2,260 invoice has USD 500 collected and USD 1,760 remaining.',
        'Record a later receipt as a separate event. Verify the summed collections and remaining receivable. Expected collection date and aging filters are planning/oversight controls.',
        'For a mistaken payment entry, open the existing payment’s reversal action and supply a reason. Verify history retains the payment and reversal; register the correct receipt separately.'
    )+note('Any collection recorded in the training database is simulated bookkeeping with an explicit training reference. It proves application transitions and reconciliation, not that the customer moved money.'),toc=True)
    page('expense-reimbursement','Reimburse a worker expense · exact tested register',route('Economic Review → project → Settlements → Worker reimbursement queue','/finance?view=economic&source=settlements&lang=en')+steps(
        'Find the approved expense in <strong>Worker reimbursement queue</strong>. Check worker, actual payer, receipt currency, eligible reimbursement and saved status. Customer recovery is a separate figure.',
        'After the real reimbursement has occurred, enter its factual <strong>Payment reference</strong> in the matching expense row. This simple queue records the eligible reimbursement as a whole, not a new editable expense amount.',
        'Click <strong>Mark reimbursed</strong> once. Reopen the project and check <strong>Reimbursed</strong> state and Actual timestamp. The isolated test marked parking USD 20, hotel USD 100 and meal USD 60: USD 180 total.',
        'If a reimbursement entry is wrong or only a partial transfer occurred, review the available financial correction/support flow. This queue does not demonstrate a partial-reimbursement or reversal control; do not change the receipt amount to imitate one.',
        'Compare remaining queue obligations with actual evidence. USD 230 purchases, USD 180 reimbursable and USD 182 customer recovery remain different. Company-card tools create no worker reimbursement.'
    )+note('The three queue submissions were exercised in isolation with simulation references. They prove application state changes, not bank transfers. Register actual compensation payment and customer collection are separate workflows.'),toc=True)
    page('accounting-pack','Accounting Pack · generate, review and finalize',route('Accounting → Generate monthly Accounting Pack','/accounting?lang=en')+steps(
        'Open <strong>Generate monthly Accounting Pack</strong>. Review the prefilled previous complete month, or enter the required <strong>Period start</strong>, <strong>Period end</strong> and <strong>Report language</strong>.',
        'Click <strong>Generate pack</strong>. The pack contains invoice/collection registers, worker/direct costs, expenses, receivables, contribution and source counts for that scope.',
        'In <strong>Accounting Pack register</strong> wait for each artifact to become Ready. Queued is processing pending; Failed needs the available independent retry. Normal users do not run backend jobs manually.',
        'Download and review each required PDF/spreadsheet. Reconcile issued invoices, collections, receivables and cost bases to the original registers before clicking <strong>Finalize</strong>.',
        'Reopen the finalized version. Later source corrections require a new pack version; do not overwrite the preserved historical pack.'
    )+note('Check date scope and currency before comparing a global Accounting Pack to a project export. The pack can contain multiple projects; share only with the intended accounting audience.'),toc=True)
    page('economic-meaning','Finance figures · economic position versus cash',table(['Figure','Meaning / check'],[
        ['Actual / approved / billable hours','Actual work, reviewed work and customer-eligible time; never planning/reference hours.'],
        ['Potential customer charges / WIP','Commercially eligible work; not automatically issued revenue or received cash.'],
        ['Internal labor cost / direct expense cost','Company economic cost basis. Compensation is separately displayed and may overlap an internal loaded cost basis; do not add it twice.'],
        ['Worker compensation / settled / paid','Calculated entitlement, finalized snapshot and recorded actual payment are separate amounts/states.'],
        ['Contribution','Potential customer charges minus applicable direct cost in the view’s scope; not cash or a complete statutory profit statement.'],
        ['Issued invoices / collections / receivables','Final invoice total, posted receipt events and outstanding balance. Reversals affect collection history.'],
        ['Forecast / expected dates','Planning; neither future hours nor bank movements are created by a forecast.'],
        ['Budget consumption','Compare contract/planning allowance with the actual applicable basis; investigate scope/currency and missing rules.'],
    ])+steps('Select the project and period in Economic Review. Follow the source links for an unexpected amount.','Check assignment, dated terms, approval, currency and artifact/issue state before concluding that a number is incorrect.'),toc=True)
    page('planning-owner-time','Planning and Owner time-entry tools',
        '<p>Use Planning for future assignments, availability and skills. A planned shift is not actual time. Publish/change the planned assignment deliberately, then review the resulting worker/project calendar.</p>'
        +steps('Open Time and choose <strong>Enter a week in a table</strong> when recording an authorized worker’s actual week. Select worker, project and week before filling actual duration/category/activity.',
            'Review each filled cell/row and any existing records. Save the batch once, then inspect the created drafts before <strong>Submit all week drafts</strong>.',
            'Use the layout-copy action only to copy the offered layout/default context. Inspect what is copied; do not assume it proves that the same hours were worked again.',
            'Use calendar/register filters to locate existing work before creating another row. Clear filters to investigate missing results.')
        +note('This broader workflow is a source-checked reference. The BBS worked lab uses individual and crew-entry tools; it does not establish every planning or table-copy edge case.'),toc=True)
    page('suppliers-owner','Suppliers and external personnel · operating order',
        route('Owner → supplier directory / Team / project assignment','/suppliers?lang=en')+steps('Create or select the supplier company before provisioning external personnel. Verify existing supplier/person identity to avoid duplicates.',
            'Create the external account in Team with <strong>External technician</strong> or <strong>Supplier coordinator</strong> and the required supplier relationship. Their supplier profile constrains visible records.',
            'Authorize the permitted project participation through dated assignments/supplier links. Review worker/payee relationships before using a supplier as payment recipient.',
            'Use the supplier operational reporting workflow for the actual source/evidence. Review and classify work/expenses through the same appropriate operational and commercial handoffs.',
            'Consult the Supplier operations guide for supplier-specific submission and correction controls. Verify privacy from that role’s own account before sharing records.')+note('An internal crew-chief delegation does not establish a supplier relationship or grant supplier financial visibility. Supplier operations were not fully exercised by the BBS internal-crew lab.'),toc=True)
    page('owner-close-and-history','Project lifecycle, documents and history',steps(
        'Maintain the existing client/contact and project details through their edit controls. Review future schedules, assignment dates, status and open work before closing or archiving.',
        'Before closing a period/project, verify source corrections, required reports/sign-off, invoice/receivable position, compensation and expense obligations. Use the applicable closure controls; archiving is not payment.',
        'In Documents upload/select the appropriate private file and audience. Choose customer-facing versus internal finance/report output and its language deliberately.',
        'Open the generated artifact only when Ready. For Failed/Unavailable inspect the recovery message and retry that format when offered; a filename is not evidence that a file exists.',
        'Use Data management/Audit to find historical source/actions. Audit records describe preserved changes; they are not editable replacement facts.'
    )+note('Customer PDFs and internal finance XLSX files have different privacy expectations. Internal worker pay, loaded cost and contribution should not be sent merely because a customer requested the invoice.'),toc=True)
    page('owner-profile-and-help','Notifications, Profile and recovery',steps(
        'Open an actionable notification and follow its record link. Check the active project and role before acting. Marking it read only manages attention.',
        'Use Profile/account settings for your own contact, language and offered security/recovery options. Account status and project assignment remain separate business controls.',
        'On mobile open the full navigation menu and use the named workspace. Wide tables can scroll horizontally; review headings and the entire row before choosing a financial action.',
        'Read the error’s named missing prerequisite and use its recovery link. Reopen current saved context after a conflict instead of repeatedly submitting the old form.',
        'When no permitted self-service remedy exists, contact the company administrator with project/record identifier, exact message and time. Avoid including passwords, activation links or unrelated private finance data.'
    ),toc=True)
