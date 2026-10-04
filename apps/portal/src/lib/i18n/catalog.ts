/**
 * The portal catalog is deliberately kept independent from Svelte.  This makes
 * it usable by route loaders, actions, print views and PDF adapters as well as
 * components.  The English keys remain human-readable for compatibility with
 * the first portal implementation; new code should prefer the semantic keys
 * in this file rather than matching DOM text.
 */

import { PORTAL_COVERAGE_KEYS } from './catalog-coverage';
import {
  coverageInvariantKeys,
  englishCoverageKey,
  isExplicitCoverageTranslation as isExplicitCoverageLiteral,
  isCoverageInvariantKey,
  translateCoverageKey,
} from './coverage-translations';

export const portalLocales = ['en', 'es', 'pt'] as const;
export type PortalLocale = (typeof portalLocales)[number];
export type PortalLocaleInput =
  | PortalLocale
  | 'en-US'
  | 'es-ES'
  | 'pt-BR'
  | string
  | null
  | undefined;
export type DocumentLanguage = 'en-US' | 'es-ES' | 'pt-BR';

const en = {
  'project.costCenter.numberChangeHelp':
    'Changing the final digits can change the project number when no invoice exists. Changes that would alter the number are blocked while any invoice, including a draft, exists.',
  'project.personTerms.payerDraftHelp':
    "Switching the payer preserves your draft choices for each payer. Only the selected payer's expense choices are saved.",
  'finance.commercialTerms.assignmentDates': 'Assignment dates',
  'finance.commercialTerms.historicalReadOnly': 'Inactive assignment · retained terms · read only',
  'finance.commercialTerms.historicalReadOnlyHelp':
    'This inactive assignment covers the selected work date. Its retained terms are available for review. Configuration requires an active assignment and person.',
  'finance.commercialTerms.historicalIssues': 'Retained term issues',
  'billing.invoiceRegister.readOnlyHelp':
    'Each row is one bill. Open an invoice to review its details and history.',
  'billing.invoiceRegister.readOnlyEmptyHelp': 'Adjust filters to review available invoices.',
  'finance.issuerReplacement.title': 'Replace unused issuing authority',
  'finance.issuerReplacement.help':
    'Correct a setup mistake for this exact project and period. The original assignment stays in history. Replacement is available only while this project has no persisted financial records; approved time and unclassified expenses do not prevent it.',
  'finance.issuerReplacement.revision': 'Replacement issuing authority revision',
  'finance.issuerReplacement.compatible':
    'Reviewed revisions must match the project currency and cover the full original period.',
  'finance.issuerReplacement.submit': 'Replace unused issuing authority',
  'finance.issuerReplacement.noCompatibleRevision':
    'No compatible reviewed revision covers this period. Create and review a compatible revision first.',
  'finance.issuerReplacement.replaced': 'Replaced — retained as original history',
  'finance.issuerReplacement.corrected': 'Correction — replaces an unused assignment',
  'problem.finance.input.unusedIssuerReplacement':
    'Choose a reviewed replacement revision and enter a reason of at least five characters.',
  'problem.finance.issuerReplacementUsed':
    'This project has persisted financial records. Its issuing authority cannot be replaced. Configure authority for a future interval instead.',
  'problem.finance.issuerReplacementChanged':
    'This issuing authority is unavailable or was already replaced. Review the current assignment history.',
  'problem.finance.issuerReplacementSameRevision':
    'Choose a different reviewed revision to correct this issuing authority.',
  'problem.finance.issuerReplacementRetryConflict':
    'This replacement request was already used with different details. Review the current assignment history.',
  'problem.finance.projectIssuerCurrencyMismatch':
    'Choose an issuing authority revision whose currency matches the project currency.',
  'action.finance.unusedIssuerReplaced': 'Unused issuing authority replaced',
  'problem.project.deleteHasCommercialAgreements':
    'This project has recorded commercial agreements and cannot be deleted. Archive the project instead.',
  'action.projects.personDefaultsSaved':
    'Project defaults saved. Existing person agreements are unchanged.',
  'problem.project.creationDefaultsDateConflict':
    'Project defaults must take effect on or before this assignment starts. Change the assignment start date or the defaults effective date, or use individual terms.',
  'problem.project.creationDefaultsMissing':
    'Enable project defaults for this assignment, or use individual terms.',
  'problem.assignment.recordedHistory':
    'These dates would exclude recorded time, expenses or reports. Keep dates that cover the recorded work, then save again.',
  'problem.assignment.projectDefaultsUnavailable':
    'No saved project defaults cover this assignment start date. Configure defaults or enter individual terms.',

  'problem.finance.reimbursementDateInvalid': 'Choose a valid reimbursement effective date.',
  'problem.finance.reimbursementOutsideAssignment':
    'Choose a reimbursement effective date within this assignment.',
  'problem.finance.reimbursementDateExists':
    'A reimbursement preference already starts on this date. Choose another effective date.',
  'problem.finance.reimbursementHistoryLocked':
    'This date overlaps invoice, finalized settlement, or paid expense history. Choose a later effective date.',
  'invoice.sourceSettingsChanged':
    'Source settings have changed since this draft was saved. The draft retains its saved details. Rebuild it from Billing to use the current project, billing stream and issuer settings.',
  'problem.billing.previewIssuerMismatch':
    'The project issuing authority does not match this billing stream. Review the issuing setup before changing company settings.',
  'invoice.sourceStreamLink': 'Billing stream settings',
  'issuerSettings.title': 'Issuer payment and contact settings',
  'issuerSettings.help':
    'These are the actual settings for this invoice issuer and currency, shared by its billing streams. Issued invoices retain their saved details. Legal name and address use the reviewed issuing authority workflow.',
  'issuerSettings.save': 'Save issuer settings',
  'invoice.sourceSaveTitle': 'Where these changes are saved',
  'invoice.sourceSaveProjectPo':
    'Changing the purchase number updates the purchase order in the project settings.',
  'invoice.sourceSaveStreamPo':
    'Changing the purchase number updates the existing purchase order override in this billing stream.',
  'invoice.sourceSaveTerms':
    'Changing payment terms or the past due notice updates this billing stream.',
  'invoice.sourceSaveIssuer':
    'Changing bank or company contact details updates the actual issuer settings for this currency, shared across its projects. Only changed fields are saved to their sources.',
  'action.billing.invoiceSourcesUpdated': 'Invoice details and changed source settings saved.',
  'action.billing.issuerSettingsSaved': 'Issuer payment and contact settings saved.',
  'problem.billing.issuerSettingsInvalid':
    'Check the issuer payment and contact fields before saving.',
  'problem.billing.issuerSettingsChanged':
    'The issuer settings changed in another session. Refresh before saving again. Your entered values are retained.',
  'problem.billing.previewProjectChanged':
    'The project settings changed. Refresh the preview before saving again. Your entered values are retained.',
  'pdf.earlierLayout': 'Earlier layout',
  'pdf.generateCurrentLayout': 'Generate current layout',
  'pdf.currentLayoutHelp':
    'Generate the current layout to match this preview. Previous PDFs are preserved.',
  'pdf.previousLayouts': 'Previous PDF layouts',
  'pdf.downloadPreviousLayout': 'Download previous layout',

  'problem.billing.previewFieldsInvalid': 'Check the highlighted invoice fields before saving.',
  'problem.billing.previewDueDateInvalid': 'Due date must be on or after the invoice date.',
  'problem.billing.previewDiscountUnsupported':
    'Update the commercial billing terms and regenerate the draft to change a discount and recalculate totals and tax.',
  'problem.billing.previewDraftOnly':
    'Only an unissued Draft can be edited. Approved invoices need a replacement draft; issued invoices need a correction.',
  'problem.billing.previewVersionChanged':
    'This invoice changed in another session. Refresh the preview before saving again. Your entered values are retained.',
  'problem.billing.previewStreamChanged':
    'The billing stream settings changed. Refresh the preview before saving again. Your entered values are retained.',
  'problem.billing.previewArtifactSealed':
    'This draft has a sealed PDF artifact. Create a replacement draft before editing.',
  'problem.billing.previewPdfBusy':
    'An invoice PDF job is in progress. Wait for it to finish before editing.',
  'View person rates': 'View person rates',
  'Saved automatic draft setting: enabled': 'Saved automatic draft setting: enabled',
  'Saved automatic draft setting: disabled': 'Saved automatic draft setting: disabled',
  'Saved stream settings': 'Saved stream settings',
  'Archived streams retain saved settings and history. Use a new active stream for future billing.':
    'Archived streams retain saved settings and history. Use a new active stream for future billing.',
  'This stream’s availability is unknown. Review the current billing setup before making changes.':
    'This stream’s availability is unknown. Review the current billing setup before making changes.',
  'No active billing streams. Configure a new stream to create invoice drafts.':
    'No active billing streams. Configure a new stream to create invoice drafts.',
  'Refreshing current tax profile information…': 'Refreshing current tax profile information…',
  'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.':
    'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.',
  'Current profile information could not be refreshed. Your entered name is retained. Check your connection and reload to review the profile.':
    'Current profile information could not be refreshed. Your entered name is retained. Check your connection and reload to review the profile.',
  'Tax component details are unavailable. Reload this page to review the current profile.':
    'Tax component details are unavailable. Reload this page to review the current profile.',
  'Review the current profile and your access before retrying. Copy any entered name before reloading this page.':
    'Review the current profile and your access before retrying. Copy any entered name before reloading this page.',
  'Entered name (not saved)': 'Entered name (not saved)',
  'Tax components': 'Tax components',
  'Non-compound tax': 'Non-compound tax',
  'No tax components recorded.': 'No tax components recorded.',
  'Manage tax profile': 'Manage tax profile',
  'Rename tax profile': 'Rename tax profile',
  'Archive tax profile': 'Archive tax profile',
  'I confirm this profile rename.': 'I confirm this profile rename.',
  'I have reviewed linked streams and confirm archiving this profile.':
    'I have reviewed linked streams and confirm archiving this profile.',
  'Renaming changes only the profile name. Rates, dates, currency and issued invoice snapshots stay unchanged.':
    'Renaming changes only the profile name. Rates, dates, currency and issued invoice snapshots stay unchanged.',
  'To change rates, dates or currency, create a new tax profile and explicitly select it in the applicable billing stream. Its effective date does not automatically replace another profile.':
    'To change rates, dates or currency, create a new tax profile and explicitly select it in the applicable billing stream. Its effective date does not automatically replace another profile.',
  'This list shows active profiles. Archived profiles leave this list; their components and issued invoice history are retained.':
    'This list shows active profiles. Archived profiles leave this list; their components and issued invoice history are retained.',
  'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.':
    'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.',
  'Copy these values before reviewing the current invoice.':
    'Copy these values before reviewing the current invoice.',
  'Preview is available before issuance. The final PDF is generated after issuance.':
    'Preview is available before issuance. The final PDF is generated after issuance.',
  'Grouping cannot be customized here. Invoice layout follows the selected template.':
    'Grouping cannot be customized here. Invoice layout follows the selected template.',
  'Saved grouping setting': 'Saved grouping setting',
  'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.':
    'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.',
  'Verified currency conversion needed': 'Verified currency conversion needed',
  'problem.expenseDetail.financeClassificationHold':
    'Operational approval is complete. Finance must confirm this expense’s reimbursement and customer billing treatment. Reimbursement is not ready until classification is complete.',
  'We could not confirm the save. Check the register before submitting again.':
    'We could not confirm the save. Check the register before submitting again.',
  'Your changes were saved, but the register could not be refreshed. Close this form and refresh the page.':
    'Your changes were saved, but the register could not be refreshed. Close this form and refresh the page.',

  'Inherited reimbursement is resolved for the effective date when saved.':
    'Inherited reimbursement is resolved for the effective date when saved.',
  'The person save result is unknown. Review the latest terms before trying again.':
    'The person save result is unknown. Review the latest terms before trying again.',
  'Person terms were saved, but could not be refreshed. Reload the page to review them.':
    'Person terms were saved, but could not be refreshed. Reload the page to review them.',
  'finance.reimbursement.review.confirm':
    'Review reimbursement now? Some unsaved values may change while others remain. Check the settings, effective dates and reason before saving.',
  'correction.draft.navigation.confirm':
    'Continue without saving? Unsaved changes may be lost. Review any retained values before creating the correction.',
  'Discard your unsaved changes? Your entered information will be lost.':
    'Discard your unsaved changes? Your entered information will be lost.',
  'Review your latest 50 notifications. Filters apply to this list.':
    'Review your latest 50 notifications. Filters apply to this list.',
  'Notification filters': 'Notification filters',
  Unread: 'Unread',
  'Notification details': 'Notification details',
  'Could not update the notification. Please try again.':
    'Could not update the notification. Please try again.',
  'Could not refresh the inbox. Reload to check the notification status.':
    'Could not refresh the inbox. Reload to check the notification status.',
  'No unread notifications in this list.': 'No unread notifications in this list.',
  'View all notifications': 'View all notifications',
  'Review this field.': 'Review this field.',
  'Reconnect to save changes. Your entries are still here.':
    'Reconnect to save changes. Your entries are still here.',
  'Your workday': 'Your workday',
  '{count} assignments today': '{count} assignments today',
  'Planning is a reference. Record the time you actually worked.':
    'Planning is a reference. Record the time you actually worked.',
  'All times in UTC': 'All times in UTC',
  'You can still record actual work for your assigned projects.':
    'You can still record actual work for your assigned projects.',
  'Your assigned projects': 'Your assigned projects',
  'Upcoming assignments': 'Upcoming assignments',
  'Showing {shown} of {total}': 'Showing {shown} of {total}',
  'Published assignments after today, in date order.':
    'Published assignments after today, in date order.',
  'No upcoming assignments published.': 'No upcoming assignments published.',
  'Show more assignments': 'Show more assignments',
  'Some assignments have incomplete dates. Ask your coordinator to review them.':
    'Some assignments have incomplete dates. Ask your coordinator to review them.',

  'Technical changes': 'Technical changes',
  Component: 'Component',
  'Original behavior': 'Original behavior',
  'Root cause': 'Root cause',
  'Change made': 'Change made',
  'Safety impact': 'Safety impact',
  'Production impact': 'Production impact',
  'Validation result': 'Validation result',
  'Open risk': 'Open risk',
  'Rollback information': 'Rollback information',
  'Planned minutes': 'Planned minutes',
  'Required skill': 'Required skill',
  'Reports with committed attachments require a versioned correction.':
    'Reports with committed attachments require a versioned correction.',
  'Data management': 'Data management',
  'Manage all company records from your Owner account. Changes apply equally to demo and production records.':
    'Manage all company records from your Owner account. Changes apply equally to demo and production records.',
  'Manage record': 'Manage record',
  'Reopen as draft': 'Reopen as draft',
  'I confirm this change to the selected record.': 'I confirm this change to the selected record.',
  'I confirm creation of this record.': 'I confirm creation of this record.',
  'Create record': 'Create record',
  'Open report': 'Open report',
  'Open sign-off record': 'Open sign-off record',
  'Open period record': 'Open period record',
  'Configure project issuing authority': 'Configure project issuing authority',
  'Operational records': 'Operational records',
  'All management areas': 'All management areas',
  'Management areas': 'Management areas',
  'Add or edit records': 'Add or edit records',
  'Add record': 'Add record',
  'Clients and contacts': 'Clients and contacts',
  'Projects and assignments': 'Projects and assignments',
  'Workers and access': 'Workers and access',
  'Suppliers and technicians': 'Suppliers and technicians',
  'Planning and skills': 'Planning and expertise',
  'Payments and settlements': 'Payments and settlements',
  'Record type': 'Record type',
  'Confirm the operation': 'Confirm the operation',
  'This record is linked to billing. Manage the invoice before changing its sources.':
    'This record is linked to billing. Manage the invoice before changing its sources.',
  'This record is an invoice source. Manage the invoice first.':
    'This record is an invoice source. Manage the invoice first.',
  'This record belongs to a correction history. Use the correction workflow.':
    'This record belongs to a correction history. Use the correction workflow.',
  'This record is included in a period report. Manage the report before changing its sources.':
    'This record is included in a period report. Manage the report before changing its sources.',
  'This expense has a reimbursement. Reverse or adjust the payment first.':
    'This expense has a reimbursement. Reverse or adjust the payment first.',
  'This expense has a financial classification history. Use a financial correction.':
    'This expense has a financial classification history. Use a financial correction.',
  'This time is included in a settlement. Adjust the settlement first.':
    'This time is included in a settlement. Adjust the settlement first.',
  'This report has technical changes. Manage those changes first.':
    'This report has technical changes. Manage those changes first.',

  'Period review and customer follow-up': 'Period review and customer follow-up',
  'Project contribution': 'Project contribution',
  'Calculated from approved project records': 'Calculated from approved project records',
  'Finance records need review': 'Finance records need review',
  'Finance records loaded': 'Finance records loaded',
  'Project alert types': 'Project alert types',
  'Finance alert': 'Finance alert',
  'Purchase order or revenue budget at 70%': 'Purchase order or revenue budget at 70%',
  'Purchase order or revenue budget at 85%': 'Purchase order or revenue budget at 85%',
  'Purchase order or revenue budget at 95%': 'Purchase order or revenue budget at 95%',
  'Labor hours budget at 95%': 'Labor hours budget at 95%',
  'Travel budget at 95%': 'Travel budget at 95%',
  'Projected margin is negative': 'Projected margin is negative',
  'Time finance rules incomplete': 'Time finance rules incomplete',
  'Expense finance projection incomplete': 'Expense finance projection incomplete',
  'Review project finances, work records, upcoming obligations and reimbursements.':
    'Review project finances, work records, upcoming obligations and reimbursements.',
  'Choose a project to review its finances.': 'Choose a project to review its finances.',
  'Review recorded minutes, billing status, effective rates and direct cost.':
    'Review recorded minutes, billing status, effective rates and direct cost.',
  'Expected payment': 'Expected payment',
  'Compensation finalized': 'Compensation finalized',

  'Cash calendar': 'Cash calendar',
  'Commercial agreement and example': 'Commercial agreement and example',
  Today: 'Today',
  Time: 'Time',
  Reports: 'Reports',
  Expenses: 'Expenses',
  Projects: 'Projects',
  'My Pay': 'My Pay',
  Suppliers: 'Suppliers',
  'Supplier team': 'Supplier team',
  'Operational report': 'Operational report',
  Documents: 'Documents',
  Notifications: 'Notifications',
  Profile: 'Profile',
  Dashboard: 'Dashboard',
  Clients: 'Clients',
  Team: 'Team',
  Planning: 'Planning',
  'PLC / Technical': 'PLC / Technical',
  Approvals: 'Approvals',
  Billing: 'Billing',
  Invoices: 'Invoices',
  Finance: 'Finance',
  Settings: 'Settings',
  Audit: 'Audit',
  'Time entries': 'Time entries',
  'Daily and technical reports': 'Daily and technical reports',
  'Expenses and receipts': 'Expenses and receipts',
  'Profile and security': 'Profile and security',
  'Resource planning': 'Resource planning',
  'Approval queue': 'Approval queue',
  'Billing streams': 'Billing streams',
  'Project finance': 'Project finance',
  'Invoice / cost ledger': 'Invoice / cost ledger',
  'Monthly Accounting Pack': 'Monthly Accounting Pack',
  'Audit log': 'Audit log',
  Language: 'Language',
  'Save draft': 'Save draft',
  'Save changes': 'Save changes',
  Submit: 'Submit',
  Save: 'Save',
  Create: 'Create',
  Approve: 'Approve',
  Reject: 'Reject',
  Close: 'Close',
  Issue: 'Issue',
  Download: 'Download',
  Project: 'Project',
  Client: 'Client',
  Worker: 'Worker',
  Date: 'Date',
  Description: 'Description',
  Summary: 'Summary',
  Amount: 'Amount',
  Currency: 'Currency',
  Status: 'Status',
  Category: 'Category',
  Vendor: 'Vendor',
  'Actual minutes': 'Actual minutes',
  'Operational category': 'Operational category',
  'Activity summary': 'Activity summary',
  'Back to approvals': 'Back to approvals',
  'Read-only operational review': 'Read-only operational review',
  'Approval actions remain in the Approvals queue.':
    'Approval actions remain in the Approvals queue.',
  Period: 'Period',
  'Period start': 'Period start',
  'Period end': 'Period end',
  Actual: 'Actual',
  Approved: 'Approved',
  Pending: 'Pending',
  Planned: 'Planned',
  Revenue: 'Revenue',
  'Revenue cap': 'Revenue cap',
  'Daily rate': 'Daily rate',
  'Fixed fee / milestones': 'Fixed fee / milestones',
  'Client paid directly': 'Client paid directly',
  'Project materials': 'Project materials',
  'Time & materials': 'Time & materials',
  'Billing contact': 'Billing contact',
  'Client contacts': 'Client contacts',
  'Team access': 'Team access',
  'All streams': 'All streams',
  Specialists: 'Specialists',
  'Other records': 'Other records',
  'PLC / technical reports': 'PLC / technical reports',
  'No email': 'No email',
  'No due date': 'No due date',
  'No tax profile': 'No tax profile',
  'No budget': 'No budget',
  'Registered device': 'Registered device',
  'Unnamed device': 'Unnamed device',
  Enabled: 'Enabled',
  'Not enabled': 'Not enabled',
  'No records match that search in your access scope.':
    'No records match that search in your access scope.',
  'Project unavailable': 'Project unavailable',
  'Choose an available project': 'Choose an available project',
  'field assignment': 'field assignment',
  'field assignments': 'field assignments',
  'Invalid audit history link': 'Invalid audit history link',
  'Open latest audit events': 'Open latest audit events',
  'This audit history link is incomplete or invalid. Open the latest events to continue.':
    'This audit history link is incomplete or invalid. Open the latest events to continue.',
  'The selected project is unavailable in your access scope. Choose an available project to continue; your other filters are retained.':
    'The selected project is unavailable in your access scope. Choose an available project to continue; your other filters are retained.',
  'No published assignment for today.': 'No published assignment for today.',
  'No time recorded.': 'No time recorded.',
  'No expenses recorded.': 'No expenses recorded.',
  'No field reports recorded.': 'No field reports recorded.',
  'No generated period summaries yet.': 'No generated period summaries yet.',
  'No notifications.': 'No notifications.',
  'No audit events recorded.': 'No audit events recorded.',
  'No availability windows recorded.': 'No availability windows recorded.',
  'No skills recorded.': 'No skills recorded.',
  'No settlements recorded for this project.': 'No settlements recorded for this project.',
  'No approved worker-paid expenses require reimbursement.':
    'No approved worker-paid expenses require reimbursement.',
  'No issued invoice records match the current authorization scope.':
    'No issued invoice records match the current authorization scope.',
  'No Accounting Packs have been generated.': 'No Accounting Packs have been generated.',
  'No project assignment budget context is configured.':
    'No project assignment budget context is configured.',
  'No client contacts recorded.': 'No client contacts recorded.',
  'No milestones await approval.': 'No milestones await approval.',
  'No approved expenses are available for this project.':
    'No approved expenses are available for this project.',
  'No time economics are available for this project.':
    'No financial data for recorded hours is available for this project.',
  'No detailed plan': 'No detailed plan',
  'Finance access required': 'Finance access required',
  'Finance-only finalization of approved compensation for the selected project.':
    'Finance-only finalization of approved compensation for the selected project.',
  'Save availability': 'Save availability',
  Secondary: 'Secondary',
  Administration: 'Administration',
  Security: 'Security',
  'Sign out': 'Sign out',
  Online: 'Online',
  Offline: 'Offline',
  Synced: 'Synced',
  Search: 'Search',
  'Search workspace': 'Search workspace',
  'Search recommendations': 'Search recommendations',
  'Search results': 'Search results',
  'Matching records': 'Matching records',
  'Recommended records': 'Recommended records',
  'Only records in your access scope': 'Only records in your access scope',
  'Dashboard actions': 'Dashboard actions',
  'View pending reports': 'View pending reports',
  'Register time': 'Register time',
  More: 'More',
  'Open PDF': 'Open PDF',
  'Print report': 'Print report',
  'Generate report': 'Generate report',
  Add: 'Add',
  Edit: 'Edit',
  Delete: 'Delete',
  Cancel: 'Cancel',
  Back: 'Back',
  Next: 'Next',
  Previous: 'Previous',
  Open: 'Open',
  Expand: 'Expand',
  Collapse: 'Collapse',
  Refresh: 'Refresh',
  Loading: 'Loading',
  Error: 'Error',
  Success: 'Success',
  Warning: 'Warning',
  Retry: 'Retry',
  'Try again': 'Try again',
  'View details': 'View details',
  'No data': 'No data',
  'Authorized projects': 'Authorized projects',
  'All projects': 'All projects',
  'Project access': 'Project access',
  'New project': 'New project',
  'Add contact': 'Add contact',
  'Edit contact': 'Edit contact',
  'Delete contact': 'Delete contact',
  'Print Report': 'Print Report',
  'Period report register': 'Period report register',
  'Source record': 'Source record',
  'Daily field report': 'Daily field report',
  'PLC / technical report': 'PLC / technical report',
  'Hello, {name}': 'Hello, {name}',
  'Showing {count} records': 'Showing {count} records',
  'Page {page} of {pages}': 'Page {page} of {pages}',
  'Last updated {date}': 'Last updated {date}',
  'Locale: English': 'Locale: English',
  'Locale: Spanish': 'Locale: Spanish',
  'Locale: Brazilian Portuguese': 'Locale: Brazilian Portuguese',
  Owner: 'Owner',
  Admin: 'Admin',
  Manager: 'Manager',
  owner: 'Owner',
  admin: 'Admin',
  finance: 'Finance',
  manager: 'Manager',
  worker: 'Worker',
  auditor: 'Auditor',
  client: 'Client user',
  guest: 'Guest',
  'Client user': 'Client user',
  Guest: 'Guest',
  Draft: 'Draft',
  Submitted: 'Submitted',
  Rejected: 'Rejected',
  Issued: 'Issued',
  Paid: 'Paid',
  Overdue: 'Overdue',
  Queued: 'Queued',
  Running: 'Running',
  Ready: 'Ready',
  Failed: 'Failed',
  queued: 'Queued',
  running: 'Running',
  ready: 'Ready',
  failed: 'Failed',
  pending: 'Pending',
  approved: 'Approved',
  submitted: 'Submitted',
  rejected: 'Rejected',
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  overdue: 'Overdue',
  active: 'Active',
  Verified: 'Verified',
  verified: 'Verified',
  'self-reported': 'Self-reported',
  inactive: 'Inactive',
  Active: 'Active',
  Inactive: 'Inactive',
  Available: 'Available',
  Unavailable: 'Unavailable',
  'Not applicable': 'Not applicable',
  Preferred: 'Preferred',
  Blocked: 'Blocked',
  'Regular time': 'Regular time',
  Travel: 'Travel',
  Materials: 'Materials',
  Accommodation: 'Accommodation',
  Meals: 'Meals',
  Other: 'Other',
  Invoice: 'Invoice',
  'Period report': 'Period report',
  'Accounting Pack': 'Accounting Pack',
  Expense: 'Expense',
  'Time entry': 'Time entry',
  'Daily report': 'Daily report',
  'Technical report': 'Technical report',
  'No results': 'No results',
  'Required field': 'Required field',
  'Invalid value': 'Invalid value',
  'Changes saved': 'Changes saved',
  'Report queued': 'Report queued',
  'Report ready': 'Report ready',
  'Report failed': 'Report failed',
  'Language updated': 'Language updated',
  'Select language': 'Select language',
  'Download PDF': 'Download PDF',
  PDF: 'PDF',
  XLSX: 'XLSX',
  CSV: 'CSV',
  JSON: 'JSON',
  MFA: 'MFA',
  TOTP: 'TOTP',
  PLC: 'PLC',
  HMI: 'HMI',
  SCADA: 'SCADA',
  FAT: 'FAT',
  SAT: 'SAT',
  'Company Webmail': 'Company Webmail',
  Webmail: 'Webmail',
  'Access Company Webmail': 'Access Company Webmail',
  'Open corporate webmail in a new tab': 'Open corporate webmail in a new tab',
} as const;

const supplementalKeys = [...new Set(PORTAL_COVERAGE_KEYS)].filter((key) => !(key in en));

/** Coverage entries not part of the hand-curated core catalog. */
export const portalSupplementalKeys = supplementalKeys;

export type PortalTranslationKey = keyof typeof en | (typeof supplementalKeys)[number];

type Catalog = Record<PortalTranslationKey, string>;

const esBase: Record<keyof typeof en, string> = {
  'project.costCenter.numberChangeHelp':
    'Cambiar los dígitos finales puede cambiar el número del proyecto si no hay ninguna factura. Los cambios que modificarían el número se bloquean mientras exista cualquier factura, incluida una factura en borrador.',
  'project.personTerms.payerDraftHelp':
    'Cambiar quién paga conserva las opciones del borrador para cada pagador. Solo se guardan las opciones de gastos del pagador seleccionado.',
  'finance.commercialTerms.assignmentDates': 'Fechas de asignación',
  'finance.commercialTerms.historicalReadOnly':
    'Asignación inactiva · condiciones conservadas · solo lectura',
  'finance.commercialTerms.historicalReadOnlyHelp':
    'Esta asignación inactiva cubre la fecha de trabajo seleccionada. Sus condiciones conservadas están disponibles para revisión. La configuración requiere una asignación y una persona activas.',
  'finance.commercialTerms.historicalIssues': 'Incidencias de las condiciones conservadas',
  'billing.invoiceRegister.readOnlyHelp':
    'Cada fila es una factura. Abre una factura para revisar sus detalles e historial.',
  'billing.invoiceRegister.readOnlyEmptyHelp':
    'Ajusta los filtros para revisar las facturas disponibles.',
  'finance.issuerReplacement.title': 'Reemplazar entidad emisora sin uso financiero',
  'finance.issuerReplacement.help':
    'Corrige un error de configuración para este proyecto y período exactos. La asignación original permanece en el historial. Solo es posible si el proyecto no tiene registros financieros guardados; el tiempo aprobado y los gastos sin clasificar no lo impiden.',
  'finance.issuerReplacement.revision': 'Revisión de la entidad emisora de reemplazo',
  'finance.issuerReplacement.compatible':
    'Las revisiones verificadas deben coincidir con la moneda del proyecto y cubrir todo el período original.',
  'finance.issuerReplacement.submit': 'Reemplazar entidad emisora sin uso financiero',
  'finance.issuerReplacement.noCompatibleRevision':
    'Ninguna revisión verificada compatible cubre este período. Primero crea y verifica una revisión compatible.',
  'finance.issuerReplacement.replaced': 'Reemplazada — conservada en el historial original',
  'finance.issuerReplacement.corrected': 'Corrección — reemplaza una asignación sin uso financiero',
  'problem.finance.input.unusedIssuerReplacement':
    'Elige una revisión de reemplazo verificada e indica un motivo de al menos cinco caracteres.',
  'problem.finance.issuerReplacementUsed':
    'Este proyecto tiene registros financieros guardados. No se puede reemplazar su entidad emisora. Configura la entidad para un período futuro.',
  'problem.finance.issuerReplacementChanged':
    'Esta entidad emisora no está disponible o ya fue reemplazada. Revisa el historial de asignaciones actual.',
  'problem.finance.issuerReplacementSameRevision':
    'Elige una revisión verificada diferente para corregir esta entidad emisora.',
  'problem.finance.issuerReplacementRetryConflict':
    'Esta solicitud de reemplazo ya se utilizó con otros datos. Revisa el historial de asignaciones actual.',
  'problem.finance.projectIssuerCurrencyMismatch':
    'Elige una revisión de entidad emisora cuya moneda coincida con la moneda del proyecto.',
  'action.finance.unusedIssuerReplaced': 'Entidad emisora sin uso financiero reemplazada',
  'problem.project.deleteHasCommercialAgreements':
    'Este proyecto tiene acuerdos comerciales registrados y no se puede eliminar. Archiva el proyecto.',
  'action.projects.personDefaultsSaved':
    'Valores predeterminados del proyecto guardados. Los acuerdos individuales existentes no cambian.',
  'problem.project.creationDefaultsDateConflict':
    'Los valores predeterminados del proyecto deben entrar en vigor antes o el mismo día que esta asignación. Cambia la fecha de inicio de la asignación o la fecha de vigencia de los valores predeterminados, o introduce condiciones individuales.',
  'problem.project.creationDefaultsMissing':
    'Activa los valores predeterminados del proyecto para esta asignación o introduce condiciones individuales.',
  'problem.assignment.recordedHistory':
    'Estas fechas excluirían horas, gastos o informes registrados. Mantén fechas que cubran el trabajo registrado y vuelve a guardar.',
  'problem.assignment.projectDefaultsUnavailable':
    'Ningún valor predeterminado guardado cubre el inicio de esta asignación. Configura los valores predeterminados o introduce condiciones individuales.',
  'problem.finance.reimbursementDateInvalid':
    'Elige una fecha de vigencia válida para el reembolso.',
  'problem.finance.reimbursementOutsideAssignment':
    'Elige una fecha de vigencia del reembolso dentro de esta asignación.',
  'problem.finance.reimbursementDateExists':
    'Ya existe una preferencia de reembolso que comienza en esta fecha. Elige otra fecha de vigencia.',
  'problem.finance.reimbursementHistoryLocked':
    'Esta fecha se solapa con facturas, liquidaciones finalizadas o gastos ya pagados. Elige una fecha de vigencia posterior.',
  'invoice.sourceSettingsChanged':
    'La configuración de origen cambió desde que se guardó este borrador. El borrador conserva sus datos guardados. Regenérelo desde Facturación para usar la configuración actual del proyecto, flujo y emisor.',
  'problem.billing.previewIssuerMismatch':
    'La autoridad emisora del proyecto no coincide con este flujo de facturación. Revise la configuración de emisión antes de cambiar los datos de la empresa.',
  'invoice.sourceStreamLink': 'Configuración del flujo de facturación',
  'issuerSettings.title': 'Configuración de pago y contacto del emisor',
  'issuerSettings.help':
    'Esta es la configuración real del emisor y la moneda, compartida por sus flujos de facturación. Las facturas emitidas conservan sus datos. El nombre y la dirección legal se modifican mediante la autoridad emisora revisada.',
  'issuerSettings.save': 'Guardar configuración del emisor',
  'invoice.sourceSaveTitle': 'Dónde se guardan estos cambios',
  'invoice.sourceSaveProjectPo':
    'Cambiar el número de compra actualiza la orden de compra en la configuración del proyecto.',
  'invoice.sourceSaveStreamPo':
    'Cambiar el número de compra actualiza la referencia específica existente en este flujo de facturación.',
  'invoice.sourceSaveTerms':
    'Cambiar las condiciones de pago o el aviso de vencimiento actualiza este flujo de facturación.',
  'invoice.sourceSaveIssuer':
    'Cambiar los datos bancarios o de contacto de la empresa actualiza la configuración real del emisor para esta moneda, compartida entre sus proyectos. Solo se guardan los campos modificados en su origen.',
  'action.billing.invoiceSourcesUpdated':
    'Se guardaron los detalles de la factura y los cambios en su configuración de origen.',
  'action.billing.issuerSettingsSaved': 'Se guardó la configuración de pago y contacto del emisor.',
  'problem.billing.issuerSettingsInvalid':
    'Revise los campos de pago y contacto del emisor antes de guardar.',
  'problem.billing.issuerSettingsChanged':
    'La configuración del emisor cambió en otra sesión. Actualice antes de guardar de nuevo. Se conserva la información introducida.',
  'problem.billing.previewProjectChanged':
    'La configuración del proyecto cambió. Actualice la vista previa antes de guardar de nuevo. Se conserva la información introducida.',
  'pdf.earlierLayout': 'Diseño anterior',
  'pdf.generateCurrentLayout': 'Generar diseño actual',
  'pdf.currentLayoutHelp':
    'Genera el diseño actual para que coincida con esta vista previa. Los PDF anteriores se conservan.',
  'pdf.previousLayouts': 'Diseños anteriores del PDF',
  'pdf.downloadPreviousLayout': 'Descargar diseño anterior',

  'problem.billing.previewFieldsInvalid':
    'Revise los campos de la factura marcados antes de guardar.',
  'problem.billing.previewDueDateInvalid':
    'El vencimiento debe ser igual o posterior a la fecha de la factura.',
  'problem.billing.previewDiscountUnsupported':
    'Actualice las condiciones comerciales y regenere el borrador para cambiar un descuento y recalcular los totales e impuestos.',
  'problem.billing.previewDraftOnly':
    'Solo se puede editar un borrador sin emitir. Una factura aprobada necesita un nuevo borrador y una emitida requiere una corrección.',
  'problem.billing.previewVersionChanged':
    'Esta factura cambió en otra sesión. Actualice la vista previa antes de guardar de nuevo. Se conserva la información introducida.',
  'problem.billing.previewStreamChanged':
    'La configuración del flujo de facturación cambió. Actualice la vista previa antes de guardar de nuevo. Se conserva la información introducida.',
  'problem.billing.previewArtifactSealed':
    'Este borrador tiene un PDF sellado. Cree un borrador de reemplazo antes de editarlo.',
  'problem.billing.previewPdfBusy':
    'Se está generando el PDF de la factura. Espere a que termine antes de editarla.',
  'View person rates': 'Ver tarifas por persona',
  'Saved automatic draft setting: enabled':
    'Configuración guardada del borrador automático: activado',
  'Saved automatic draft setting: disabled':
    'Configuración guardada del borrador automático: desactivado',
  'Saved stream settings': 'Configuración guardada del flujo',
  'Archived streams retain saved settings and history. Use a new active stream for future billing.':
    'Los flujos archivados conservan su configuración y su historial. Usa un nuevo flujo activo para facturar en el futuro.',
  'This stream’s availability is unknown. Review the current billing setup before making changes.':
    'No se conoce la disponibilidad de este flujo. Revisa la configuración de facturación actual antes de hacer cambios.',
  'No active billing streams. Configure a new stream to create invoice drafts.':
    'No hay flujos de facturación activos. Configura un nuevo flujo para crear borradores de factura.',
  'Refreshing current tax profile information…': 'Actualizando la información del perfil fiscal…',
  'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.':
    'Se ha actualizado la información del perfil. No se ha vuelto a enviar el cambio. Copia el nombre introducido antes de salir de esta vista.',
  'Current profile information could not be refreshed. Your entered name is retained. Check your connection and reload to review the profile.':
    'No se pudo actualizar la información del perfil. Se conserva el nombre introducido. Revisa tu conexión y recarga para consultar el perfil.',
  'Tax component details are unavailable. Reload this page to review the current profile.':
    'Los detalles de los componentes fiscales no están disponibles. Recarga esta página para revisar el perfil actual.',
  'Review the current profile and your access before retrying. Copy any entered name before reloading this page.':
    'Revisa el perfil actual y tu acceso antes de volver a intentarlo. Copia el nombre introducido antes de recargar esta página.',
  'Entered name (not saved)': 'Nombre introducido (sin guardar)',
  'Tax components': 'Componentes fiscales',
  'Non-compound tax': 'Impuesto no compuesto',
  'No tax components recorded.': 'No se han registrado componentes fiscales.',
  'Manage tax profile': 'Gestionar perfil fiscal',
  'Rename tax profile': 'Renombrar perfil fiscal',
  'Archive tax profile': 'Archivar perfil fiscal',
  'I confirm this profile rename.': 'Confirmo el cambio de nombre de este perfil.',
  'I have reviewed linked streams and confirm archiving this profile.':
    'He revisado las líneas vinculadas y confirmo que deseo archivar este perfil.',
  'Renaming changes only the profile name. Rates, dates, currency and issued invoice snapshots stay unchanged.':
    'Al renombrar solo cambia el nombre del perfil. Los tipos, las fechas, la moneda y las instantáneas de las facturas emitidas no cambian.',
  'To change rates, dates or currency, create a new tax profile and explicitly select it in the applicable billing stream. Its effective date does not automatically replace another profile.':
    'Para cambiar los tipos, las fechas o la moneda, crea un nuevo perfil fiscal y selecciónalo expresamente en la línea de facturación correspondiente. Su fecha de vigencia no sustituye automáticamente otro perfil.',
  'This list shows active profiles. Archived profiles leave this list; their components and issued invoice history are retained.':
    'Esta lista muestra perfiles activos. Los perfiles archivados dejan de aparecer aquí; sus componentes y el historial de facturas emitidas se conservan.',
  'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.':
    'Las líneas que usan un perfil archivado no pueden crear nuevos borradores de factura hasta que se seleccione expresamente un perfil de reemplazo. Antes de archivar este perfil, hay que emitir o recalcular cualquier factura aprobada que lo use. Las facturas emitidas no cambian.',
  'Copy these values before reviewing the current invoice.':
    'Copia estos valores antes de revisar la factura actual.',
  'Preview is available before issuance. The final PDF is generated after issuance.':
    'La vista previa está disponible antes de emitir la factura. El PDF final se genera después de la emisión.',
  'Grouping cannot be customized here. Invoice layout follows the selected template.':
    'La agrupación no se puede personalizar aquí. El diseño de la factura sigue la plantilla seleccionada.',
  'Saved grouping setting': 'Configuración de agrupación guardada',
  'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.':
    'No se ha registrado una conversión verificada. Este gasto conserva su moneda original. Actualmente no se puede introducir una conversión aquí.',
  'Verified currency conversion needed': 'Se necesita una conversión de moneda verificada',
  'problem.expenseDetail.financeClassificationHold':
    'La aprobación operativa está completa. Finanzas debe confirmar el reembolso y el tratamiento de facturación al cliente de este gasto. El reembolso no está listo hasta que se complete la clasificación.',
  'We could not confirm the save. Check the register before submitting again.':
    'No pudimos confirmar el guardado. Revisa el listado antes de volver a enviar.',
  'Your changes were saved, but the register could not be refreshed. Close this form and refresh the page.':
    'Los cambios se han guardado, pero no se pudo actualizar el listado. Cierra este formulario y recarga la página.',

  'Inherited reimbursement is resolved for the effective date when saved.':
    'El reembolso heredado se resuelve para la fecha de vigencia al guardar.',
  'The person save result is unknown. Review the latest terms before trying again.':
    'No se ha confirmado el guardado de las condiciones de la persona. Revisa las condiciones más recientes antes de volver a intentarlo.',
  'Person terms were saved, but could not be refreshed. Reload the page to review them.':
    'Las condiciones de la persona se han guardado, pero no se pudieron actualizar en pantalla. Recarga la página para revisarlas.',
  'finance.reimbursement.review.confirm':
    '¿Revisar el reembolso ahora? Algunos datos sin guardar pueden cambiar mientras que otros se conservan. Revisa la configuración, las fechas de vigencia y el motivo antes de guardar.',
  'correction.draft.navigation.confirm':
    '¿Continuar sin guardar? Los cambios sin guardar pueden perderse. Revisa cualquier dato que se conserve antes de crear la corrección.',
  'Discard your unsaved changes? Your entered information will be lost.':
    '¿Descartar los cambios sin guardar? Se perderán los datos que has introducido.',
  'Review your latest 50 notifications. Filters apply to this list.':
    'Consulta tus últimas 50 notificaciones. Los filtros se aplican a esta lista.',
  'Notification filters': 'Filtros de notificaciones',
  Unread: 'Sin leer',
  'Notification details': 'Detalle de la notificación',
  'Could not update the notification. Please try again.':
    'No se pudo actualizar la notificación. Inténtalo de nuevo.',
  'Could not refresh the inbox. Reload to check the notification status.':
    'No se pudo actualizar la bandeja. Recarga para comprobar el estado de la notificación.',
  'No unread notifications in this list.': 'No hay notificaciones sin leer en esta lista.',
  'View all notifications': 'Ver todas las notificaciones',
  'Review this field.': 'Revisa este campo.',
  'Reconnect to save changes. Your entries are still here.':
    'Vuelve a conectarte para guardar los cambios. Los datos siguen aquí.',
  'Your workday': 'Tu jornada',
  '{count} assignments today': '{count} asignaciones hoy',
  'Planning is a reference. Record the time you actually worked.':
    'La planificación es una referencia. Registra el tiempo que realmente has trabajado.',
  'All times in UTC': 'Todos los horarios en UTC',
  'You can still record actual work for your assigned projects.':
    'Puedes registrar el trabajo realizado en tus proyectos asignados.',
  'Your assigned projects': 'Tus proyectos asignados',
  'Upcoming assignments': 'Próximas asignaciones',
  'Showing {shown} of {total}': 'Mostrando {shown} de {total}',
  'Published assignments after today, in date order.':
    'Asignaciones publicadas posteriores a hoy, por orden de fecha.',
  'No upcoming assignments published.': 'No hay próximas asignaciones publicadas.',
  'Show more assignments': 'Mostrar más asignaciones',
  'Some assignments have incomplete dates. Ask your coordinator to review them.':
    'Algunas asignaciones tienen fechas incompletas. Pide a tu coordinador que las revise.',

  'Technical changes': 'Cambios técnicos',
  Component: 'Componente',
  'Original behavior': 'Comportamiento original',
  'Root cause': 'Causa raíz',
  'Change made': 'Cambio realizado',
  'Safety impact': 'Impacto en la seguridad',
  'Production impact': 'Impacto en la producción',
  'Validation result': 'Resultado de validación',
  'Open risk': 'Riesgo pendiente',
  'Rollback information': 'Información de reversión',
  'Planned minutes': 'Minutos planificados',
  'Required skill': 'Competencia requerida',
  'Reports with committed attachments require a versioned correction.':
    'Los informes con adjuntos confirmados requieren una corrección versionada.',
  'Data management': 'Gestión de datos',
  'Manage all company records from your Owner account. Changes apply equally to demo and production records.':
    'Gestiona los registros de la empresa desde tu cuenta Owner. Las acciones se aplican tanto a datos de ejemplo como a datos reales.',
  'Manage record': 'Gestionar registro',
  'Reopen as draft': 'Quitar aprobación y reabrir',
  'I confirm this change to the selected record.':
    'Confirmo este cambio en el registro seleccionado.',
  'I confirm creation of this record.': 'Confirmo la creación de este registro.',
  'Create record': 'Crear registro',
  'Open report': 'Abrir informe',
  'Open sign-off record': 'Abrir registro de conformidad',
  'Open period record': 'Abrir registro de período',
  'Configure project issuing authority': 'Configurar la entidad emisora del proyecto',
  'Operational records': 'Registros operativos',
  'All management areas': 'Todas las áreas de gestión',
  'Management areas': 'Áreas de gestión',
  'Add or edit records': 'Añadir o editar registros',
  'Add record': 'Añadir registro',
  'Clients and contacts': 'Clientes y contactos',
  'Projects and assignments': 'Proyectos y asignaciones',
  'Workers and access': 'Trabajadores y accesos',
  'Suppliers and technicians': 'Proveedores y técnicos',
  'Planning and skills': 'Planificación y especialidades',
  'Payments and settlements': 'Pagos y liquidaciones',
  'Record type': 'Tipo de registro',
  'Confirm the operation': 'Confirma la operación',
  'This record is linked to billing. Manage the invoice before changing its sources.':
    'Este registro está vinculado a facturación. Gestiona la factura antes de cambiar sus registros de origen.',
  'This record is an invoice source. Manage the invoice first.':
    'Este registro forma parte de una factura. Gestiona primero la factura.',
  'This record belongs to a correction history. Use the correction workflow.':
    'Este registro tiene un historial de correcciones. Usa la opción de corrección.',
  'This record is included in a period report. Manage the report before changing its sources.':
    'Este registro forma parte de un informe finalizado. Gestiona el informe antes de cambiar sus registros de origen.',
  'This expense has a reimbursement. Reverse or adjust the payment first.':
    'Este gasto tiene un reembolso. Revierte o ajusta primero el pago.',
  'This expense has a financial classification history. Use a financial correction.':
    'Este gasto tiene un historial de clasificación financiera. Usa una corrección financiera.',
  'This time is included in a settlement. Adjust the settlement first.':
    'Estas horas están incluidas en una liquidación. Ajusta primero la liquidación.',
  'This report has technical changes. Manage those changes first.':
    'Este informe tiene cambios técnicos asociados. Gestiona primero esos cambios.',

  'Period review and customer follow-up': 'Revisión del período y seguimiento del cliente',
  'Project contribution': 'Contribución del proyecto',
  'Calculated from approved project records':
    'Calculado a partir de registros aprobados del proyecto',
  'Finance records need review': 'Los registros financieros necesitan revisión',
  'Finance records loaded': 'Registros financieros cargados',
  'Project alert types': 'Tipos de alerta del proyecto',
  'Finance alert': 'Alerta financiera',
  'Purchase order or revenue budget at 70%': 'Pedido de compra o presupuesto de ingresos al 70 %',
  'Purchase order or revenue budget at 85%': 'Pedido de compra o presupuesto de ingresos al 85 %',
  'Purchase order or revenue budget at 95%': 'Pedido de compra o presupuesto de ingresos al 95 %',
  'Labor hours budget at 95%': 'Presupuesto de horas de trabajo al 95 %',
  'Travel budget at 95%': 'Presupuesto de viajes al 95 %',
  'Projected margin is negative': 'El margen previsto es negativo',
  'Time finance rules incomplete': 'Faltan reglas financieras para las horas',
  'Expense finance projection incomplete': 'La proyección financiera de gastos está incompleta',
  'Review project finances, work records, upcoming obligations and reimbursements.':
    'Revise las finanzas del proyecto, los registros de trabajo, las próximas obligaciones y los reembolsos.',
  'Choose a project to review its finances.': 'Seleccione un proyecto para revisar sus finanzas.',
  'Review recorded minutes, billing status, effective rates and direct cost.':
    'Revise los minutos registrados, el estado de facturación, las tarifas vigentes y el coste directo.',
  'Expected payment': 'Pago previsto',
  'Compensation finalized': 'Compensación finalizada',

  'Cash calendar': 'Calendario de caja',
  'Commercial agreement and example': 'Acuerdo comercial y ejemplo',
  Today: 'Hoy',
  Time: 'Horas',
  Reports: 'Informes',
  Expenses: 'Gastos',
  Projects: 'Proyectos',
  'My Pay': 'Mi pago',
  Suppliers: 'Proveedores',
  'Supplier team': 'Equipo del proveedor',
  'Operational report': 'Informe operativo',
  Documents: 'Documentos',
  Notifications: 'Notificaciones',
  Profile: 'Perfil',
  Dashboard: 'Panel',
  Clients: 'Clientes',
  Team: 'Equipo',
  Planning: 'Planificación',
  'PLC / Technical': 'PLC / Técnico',
  Approvals: 'Aprobaciones',
  Billing: 'Facturación',
  Invoices: 'Facturas',
  Finance: 'Finanzas',
  Settings: 'Configuración',
  Audit: 'Auditoría',
  'Time entries': 'Registros de horas',
  'Daily and technical reports': 'Informes diarios y técnicos',
  'Expenses and receipts': 'Gastos y recibos',
  'Profile and security': 'Perfil y seguridad',
  'Resource planning': 'Planificación de recursos',
  'Approval queue': 'Cola de aprobación',
  'Billing streams': 'Flujos de facturación',
  'Project finance': 'Finanzas del proyecto',
  'Invoice / cost ledger': 'Libro de facturas y costes',
  'Monthly Accounting Pack': 'Paquete contable mensual',
  'Audit log': 'Registro de auditoría',
  Language: 'Idioma',
  'Save draft': 'Guardar borrador',
  'Save changes': 'Guardar cambios',
  Submit: 'Enviar',
  Save: 'Guardar',
  Create: 'Crear',
  Approve: 'Aprobar',
  Reject: 'Rechazar',
  Close: 'Cerrar',
  Issue: 'Emitir',
  Download: 'Descargar',
  Project: 'Proyecto',
  Client: 'Cliente',
  Worker: 'Trabajador',
  Date: 'Fecha',
  Description: 'Descripción',
  Summary: 'Resumen',
  Amount: 'Importe',
  Currency: 'Moneda',
  Status: 'Estado',
  Category: 'Categoría',
  Vendor: 'Proveedor',
  'Actual minutes': 'Minutos reales',
  'Operational category': 'Categoría operativa',
  'Activity summary': 'Resumen de actividad',
  'Back to approvals': 'Volver a aprobaciones',
  'Read-only operational review': 'Revisión operativa de solo lectura',
  'Approval actions remain in the Approvals queue.':
    'Las acciones de aprobación permanecen en la cola de Aprobaciones.',
  Period: 'Periodo',
  'Period start': 'Inicio del periodo',
  'Period end': 'Fin del periodo',
  Actual: 'Real',
  Approved: 'Aprobado',
  Pending: 'Pendiente',
  Planned: 'Planificado',
  Revenue: 'Ingresos',
  'Revenue cap': 'Límite de ingresos',
  'Daily rate': 'Tarifa diaria',
  'Fixed fee / milestones': 'Precio cerrado / Hitos',
  'Client paid directly': 'Pagado directamente por el cliente',
  'Project materials': 'Materiales del proyecto',
  'Time & materials': 'Tiempo y materiales',
  'Billing contact': 'Contacto de facturación',
  'Client contacts': 'Contactos del cliente',
  'Team access': 'Acceso del equipo',
  'All streams': 'Todos los flujos',
  Specialists: 'Especialistas',
  'Other records': 'Otros registros',
  'PLC / technical reports': 'Informes PLC / técnicos',
  'No email': 'Sin correo electrónico',
  'No due date': 'Sin fecha de vencimiento',
  'No tax profile': 'Sin perfil fiscal',
  'No budget': 'Sin presupuesto',
  'Registered device': 'Dispositivo registrado',
  'Unnamed device': 'Dispositivo sin nombre',
  Enabled: 'Activado',
  'Not enabled': 'No activado',
  'No records match that search in your access scope.':
    'Ningún registro coincide con la búsqueda en su ámbito de acceso.',
  'Project unavailable': 'Proyecto no disponible',
  'Choose an available project': 'Elegir un proyecto disponible',
  'field assignment': 'asignación de campo',
  'field assignments': 'asignaciones de campo',
  'Invalid audit history link': 'Enlace de historial de auditoría no válido',
  'Open latest audit events': 'Abrir los últimos eventos de auditoría',
  'This audit history link is incomplete or invalid. Open the latest events to continue.':
    'Este enlace del historial de auditoría está incompleto o no es válido. Abra los últimos eventos para continuar.',
  'The selected project is unavailable in your access scope. Choose an available project to continue; your other filters are retained.':
    'El proyecto seleccionado no está disponible en su ámbito de acceso. Elija un proyecto disponible para continuar; se conservan los demás filtros.',
  'No published assignment for today.': 'No hay asignación publicada para hoy.',
  'No time recorded.': 'No hay horas registradas.',
  'No expenses recorded.': 'No hay gastos registrados.',
  'No field reports recorded.': 'No hay informes de campo registrados.',
  'No generated period summaries yet.': 'Aún no hay resúmenes de periodo generados.',
  'No notifications.': 'No hay notificaciones.',
  'No audit events recorded.': 'No hay eventos de auditoría registrados.',
  'No availability windows recorded.': 'No hay ventanas de disponibilidad registradas.',
  'No skills recorded.': 'No hay competencias registradas.',
  'No settlements recorded for this project.':
    'No hay liquidaciones registradas para este proyecto.',
  'No approved worker-paid expenses require reimbursement.':
    'No hay gastos aprobados pagados por trabajadores que requieran reembolso.',
  'No issued invoice records match the current authorization scope.':
    'Ninguna factura emitida coincide con el ámbito de autorización actual.',
  'No Accounting Packs have been generated.': 'No se han generado paquetes contables.',
  'No project assignment budget context is configured.':
    'No hay contexto de presupuesto de asignación configurado.',
  'No client contacts recorded.': 'No hay contactos de cliente registrados.',
  'No milestones await approval.': 'No hay hitos pendientes de aprobación.',
  'No approved expenses are available for this project.':
    'No hay gastos aprobados disponibles para este proyecto.',
  'No time economics are available for this project.':
    'No hay datos económicos de las horas de este proyecto.',
  'No detailed plan': 'No hay plan detallado',
  'Finance access required': 'Se requiere acceso financiero',
  'Finance-only finalization of approved compensation for the selected project.':
    'Finalización exclusiva de Finanzas de la compensación aprobada para el proyecto seleccionado.',
  'Save availability': 'Guardar disponibilidad',
  Secondary: 'Secundario',
  Administration: 'Administración',
  Security: 'Seguridad',
  'Sign out': 'Cerrar sesión',
  Online: 'En línea',
  Offline: 'Sin conexión',
  Synced: 'Sincronizado',
  Search: 'Buscar',
  'Search workspace': 'Buscar en el espacio de trabajo',
  'Search recommendations': 'Recomendaciones de búsqueda',
  'Search results': 'Resultados de búsqueda',
  'Matching records': 'Registros coincidentes',
  'Recommended records': 'Registros recomendados',
  'Only records in your access scope': 'Solo registros de tu ámbito de acceso',
  'Dashboard actions': 'Acciones del panel',
  'View pending reports': 'Ver informes pendientes',
  'Register time': 'Registrar horas',
  More: 'Más',
  'Open PDF': 'Abrir PDF',
  'Print report': 'Imprimir informe',
  'Generate report': 'Generar informe',
  Add: 'Añadir',
  Edit: 'Editar',
  Delete: 'Eliminar',
  Cancel: 'Cancelar',
  Back: 'Atrás',
  Next: 'Siguiente',
  Previous: 'Anterior',
  Open: 'Abrir',
  Expand: 'Expandir',
  Collapse: 'Contraer',
  Refresh: 'Actualizar',
  Loading: 'Cargando',
  Error: 'Error',
  Success: 'Éxito',
  Warning: 'Advertencia',
  Retry: 'Reintentar',
  'Try again': 'Intentar de nuevo',
  'View details': 'Ver detalles',
  'No data': 'Sin datos',
  'Authorized projects': 'Proyectos autorizados',
  'All projects': 'Todos los proyectos',
  'Project access': 'Acceso al proyecto',
  'New project': 'Nuevo proyecto',
  'Add contact': 'Añadir contacto',
  'Edit contact': 'Editar contacto',
  'Delete contact': 'Eliminar contacto',
  'Print Report': 'Imprimir informe',
  'Period report register': 'Registro de informes de periodo',
  'Source record': 'Registro de origen',
  'Daily field report': 'Informe de campo diario',
  'PLC / technical report': 'Informe PLC / técnico',
  'Hello, {name}': 'Hola, {name}',
  'Showing {count} records': 'Mostrando {count} registros',
  'Page {page} of {pages}': 'Página {page} de {pages}',
  'Last updated {date}': 'Última actualización {date}',
  'Locale: English': 'Idioma: inglés',
  'Locale: Spanish': 'Idioma: español',
  'Locale: Brazilian Portuguese': 'Idioma: portugués de Brasil',
  Owner: 'Propietario',
  Admin: 'Administrador',
  Manager: 'Responsable',
  owner: 'Propietario',
  admin: 'Administrador',
  finance: 'Finanzas',
  manager: 'Responsable',
  worker: 'Trabajador',
  auditor: 'Auditor',
  client: 'Usuario cliente',
  guest: 'Invitado',
  'Client user': 'Usuario cliente',
  Guest: 'Invitado',
  Draft: 'Borrador',
  Submitted: 'Enviado',
  Rejected: 'Rechazado',
  Issued: 'Emitida',
  Paid: 'Pagada',
  Overdue: 'Vencida',
  Queued: 'En cola',
  Running: 'En ejecución',
  Ready: 'Listo',
  Failed: 'Fallido',
  queued: 'En cola',
  running: 'En ejecución',
  ready: 'Listo',
  failed: 'Fallido',
  pending: 'Pendiente',
  approved: 'Aprobado',
  submitted: 'Enviado',
  rejected: 'Rechazado',
  draft: 'Borrador',
  issued: 'Emitida',
  paid: 'Pagada',
  overdue: 'Vencida',
  active: 'Activo',
  Verified: 'Verificada',
  verified: 'Verificada',
  'self-reported': 'Auto-declarada',
  inactive: 'Inactivo',
  Active: 'Activo',
  Inactive: 'Inactivo',
  Available: 'Disponible',
  Unavailable: 'No disponible',
  'Not applicable': 'No aplicable',
  Preferred: 'Preferido',
  Blocked: 'Bloqueado',
  'Regular time': 'Tiempo ordinario',
  Travel: 'Viaje',
  Materials: 'Materiales',
  Accommodation: 'Alojamiento',
  Meals: 'Comidas',
  Other: 'Otros',
  Invoice: 'Factura',
  'Period report': 'Informe de periodo',
  'Accounting Pack': 'Paquete contable',
  Expense: 'Gasto',
  'Time entry': 'Registro de horas',
  'Daily report': 'Informe diario',
  'Technical report': 'Informe técnico',
  'No results': 'Sin resultados',
  'Required field': 'Campo obligatorio',
  'Invalid value': 'Valor no válido',
  'Changes saved': 'Cambios guardados',
  'Report queued': 'Informe en cola',
  'Report ready': 'Informe listo',
  'Report failed': 'Informe fallido',
  'Language updated': 'Idioma actualizado',
  'Select language': 'Seleccionar idioma',
  'Download PDF': 'Descargar PDF',
  PDF: 'PDF',
  XLSX: 'XLSX',
  CSV: 'CSV',
  JSON: 'JSON',
  MFA: 'MFA',
  TOTP: 'TOTP',
  PLC: 'PLC',
  HMI: 'HMI',
  SCADA: 'SCADA',
  FAT: 'FAT',
  SAT: 'SAT',
  'Company Webmail': 'Correo corporativo',
  Webmail: 'Webmail',
  'Access Company Webmail': 'Acceder al correo corporativo',
  'Open corporate webmail in a new tab': 'Abrir el correo corporativo en una pestaña nueva',
};

const ptBase: Record<keyof typeof en, string> = {
  'project.costCenter.numberChangeHelp':
    'Alterar os dígitos finais pode alterar o número do projeto se não houver nenhuma fatura. As alterações que mudariam o número são bloqueadas enquanto existir qualquer fatura, inclusive uma fatura em rascunho.',
  'project.personTerms.payerDraftHelp':
    'Alterar quem paga preserva as opções do rascunho para cada pagador. Apenas as opções de despesas do pagador selecionado são salvas.',
  'finance.commercialTerms.assignmentDates': 'Datas da atribuição',
  'finance.commercialTerms.historicalReadOnly':
    'Atribuição inativa · condições preservadas · somente leitura',
  'finance.commercialTerms.historicalReadOnlyHelp':
    'Esta atribuição inativa cobre a data de trabalho selecionada. Suas condições preservadas estão disponíveis para revisão. A configuração exige uma atribuição e uma pessoa ativas.',
  'finance.commercialTerms.historicalIssues': 'Pendências das condições preservadas',
  'billing.invoiceRegister.readOnlyHelp':
    'Cada linha é uma fatura. Abra uma fatura para revisar seus detalhes e histórico.',
  'billing.invoiceRegister.readOnlyEmptyHelp':
    'Ajuste os filtros para revisar as faturas disponíveis.',
  'finance.issuerReplacement.title': 'Substituir entidade emissora sem uso financeiro',
  'finance.issuerReplacement.help':
    'Corrige um erro de configuração para este projeto e período exatos. A atribuição original permanece no histórico. A substituição só está disponível se o projeto não tiver registros financeiros salvos; horas aprovadas e despesas não classificadas não impedem a correção.',
  'finance.issuerReplacement.revision': 'Revisão da entidade emissora substituta',
  'finance.issuerReplacement.compatible':
    'As revisões verificadas devem corresponder à moeda do projeto e cobrir todo o período original.',
  'finance.issuerReplacement.submit': 'Substituir entidade emissora sem uso financeiro',
  'finance.issuerReplacement.noCompatibleRevision':
    'Nenhuma revisão verificada compatível cobre este período. Primeiro crie e verifique uma revisão compatível.',
  'finance.issuerReplacement.replaced': 'Substituída — preservada no histórico original',
  'finance.issuerReplacement.corrected': 'Correção — substitui uma atribuição sem uso financeiro',
  'problem.finance.input.unusedIssuerReplacement':
    'Escolha uma revisão substituta verificada e informe um motivo de pelo menos cinco caracteres.',
  'problem.finance.issuerReplacementUsed':
    'Este projeto tem registros financeiros salvos. Sua entidade emissora não pode ser substituída. Configure a entidade para um período futuro.',
  'problem.finance.issuerReplacementChanged':
    'Esta entidade emissora não está disponível ou já foi substituída. Revise o histórico atual de atribuições.',
  'problem.finance.issuerReplacementSameRevision':
    'Escolha uma revisão verificada diferente para corrigir esta entidade emissora.',
  'problem.finance.issuerReplacementRetryConflict':
    'Esta solicitação de substituição já foi usada com outros dados. Revise o histórico atual de atribuições.',
  'problem.finance.projectIssuerCurrencyMismatch':
    'Escolha uma revisão de entidade emissora cuja moeda corresponda à moeda do projeto.',
  'action.finance.unusedIssuerReplaced': 'Entidade emissora sem uso financeiro substituída',
  'problem.project.deleteHasCommercialAgreements':
    'Este projeto tem acordos comerciais registrados e não pode ser excluído. Arquive o projeto.',
  'action.projects.personDefaultsSaved':
    'Padrões do projeto salvos. Os acordos individuais existentes permanecem inalterados.',
  'problem.project.creationDefaultsDateConflict':
    'Os padrões do projeto devem entrar em vigor antes ou no dia de início desta atribuição. Altere a data de início da atribuição ou a data de vigência dos padrões, ou informe condições individuais.',
  'problem.project.creationDefaultsMissing':
    'Ative os padrões do projeto para esta atribuição ou informe condições individuais.',
  'problem.assignment.recordedHistory':
    'Estas datas excluiriam horas, despesas ou relatórios registrados. Mantenha datas que cubram o trabalho registrado e salve novamente.',
  'problem.assignment.projectDefaultsUnavailable':
    'Nenhum padrão salvo abrange o início desta atribuição. Configure os padrões ou informe condições individuais.',
  'problem.finance.reimbursementDateInvalid':
    'Escolha uma data de vigência válida para o reembolso.',
  'problem.finance.reimbursementOutsideAssignment':
    'Escolha uma data de vigência do reembolso dentro desta atribuição.',
  'problem.finance.reimbursementDateExists':
    'Já existe uma preferência de reembolso que começa nesta data. Escolha outra data de vigência.',
  'problem.finance.reimbursementHistoryLocked':
    'Esta data se sobrepõe a faturas, acertos finalizados ou despesas já pagas. Escolha uma data de vigência posterior.',
  'invoice.sourceSettingsChanged':
    'As configurações de origem mudaram desde que este rascunho foi salvo. O rascunho mantém seus dados salvos. Gere-o novamente em Faturamento para usar as configurações atuais do projeto, fluxo e emissor.',
  'problem.billing.previewIssuerMismatch':
    'A autoridade emissora do projeto não corresponde a este fluxo de faturamento. Revise a configuração de emissão antes de alterar os dados da empresa.',
  'invoice.sourceStreamLink': 'Configurações do fluxo de faturamento',
  'issuerSettings.title': 'Configurações de pagamento e contato do emissor',
  'issuerSettings.help':
    'Estas são as configurações reais do emissor e da moeda, compartilhadas pelos seus fluxos de faturamento. Faturas emitidas mantêm seus dados. Nome e endereço legais seguem o fluxo de autoridade emissora revisada.',
  'issuerSettings.save': 'Salvar configurações do emissor',
  'invoice.sourceSaveTitle': 'Onde estas alterações são salvas',
  'invoice.sourceSaveProjectPo':
    'Alterar o número de compra atualiza o pedido de compra nas configurações do projeto.',
  'invoice.sourceSaveStreamPo':
    'Alterar o número de compra atualiza a referência específica existente neste fluxo de faturamento.',
  'invoice.sourceSaveTerms':
    'Alterar os termos de pagamento ou o aviso de atraso atualiza este fluxo de faturamento.',
  'invoice.sourceSaveIssuer':
    'Alterar dados bancários ou de contato da empresa atualiza as configurações reais do emissor nesta moeda, compartilhadas pelos seus projetos. Somente os campos alterados são salvos nas fontes.',
  'action.billing.invoiceSourcesUpdated':
    'Detalhes da fatura e alterações nas configurações de origem salvos.',
  'action.billing.issuerSettingsSaved': 'Configurações de pagamento e contato do emissor salvas.',
  'problem.billing.issuerSettingsInvalid':
    'Revise os campos de pagamento e contato do emissor antes de salvar.',
  'problem.billing.issuerSettingsChanged':
    'As configurações do emissor mudaram em outra sessão. Atualize antes de salvar novamente. Os valores informados foram mantidos.',
  'problem.billing.previewProjectChanged':
    'As configurações do projeto mudaram. Atualize a prévia antes de salvar novamente. Os valores informados foram mantidos.',
  'pdf.earlierLayout': 'Layout anterior',
  'pdf.generateCurrentLayout': 'Gerar layout atual',
  'pdf.currentLayoutHelp':
    'Gere o layout atual para corresponder a esta prévia. Os PDFs anteriores são preservados.',
  'pdf.previousLayouts': 'Layouts anteriores do PDF',
  'pdf.downloadPreviousLayout': 'Baixar layout anterior',

  'problem.billing.previewFieldsInvalid': 'Revise os campos da fatura destacados antes de salvar.',
  'problem.billing.previewDueDateInvalid':
    'O vencimento deve ser igual ou posterior à data da fatura.',
  'problem.billing.previewDiscountUnsupported':
    'Atualize as condições comerciais e gere o rascunho novamente para alterar um desconto e recalcular totais e impostos.',
  'problem.billing.previewDraftOnly':
    'Somente um rascunho não emitido pode ser editado. Faturas aprovadas exigem um novo rascunho; as emitidas exigem correção.',
  'problem.billing.previewVersionChanged':
    'Esta fatura mudou em outra sessão. Atualize a prévia antes de salvar novamente. Os valores informados foram mantidos.',
  'problem.billing.previewStreamChanged':
    'As configurações do fluxo de faturamento mudaram. Atualize a prévia antes de salvar novamente. Os valores informados foram mantidos.',
  'problem.billing.previewArtifactSealed':
    'Este rascunho tem um PDF selado. Crie um rascunho substituto antes de editar.',
  'problem.billing.previewPdfBusy':
    'O PDF da fatura está sendo gerado. Aguarde a conclusão antes de editar.',
  'View person rates': 'Ver tarifas por pessoa',
  'Saved automatic draft setting: enabled': 'Configuração salva do rascunho automático: ativado',
  'Saved automatic draft setting: disabled':
    'Configuração salva do rascunho automático: desativado',
  'Saved stream settings': 'Configurações salvas do fluxo',
  'Archived streams retain saved settings and history. Use a new active stream for future billing.':
    'Os fluxos arquivados preservam suas configurações e seu histórico. Use um novo fluxo ativo para faturamentos futuros.',
  'This stream’s availability is unknown. Review the current billing setup before making changes.':
    'A disponibilidade deste fluxo é desconhecida. Revise a configuração atual de faturamento antes de fazer alterações.',
  'No active billing streams. Configure a new stream to create invoice drafts.':
    'Não há fluxos de faturamento ativos. Configure um novo fluxo para criar rascunhos de fatura.',
  'Refreshing current tax profile information…': 'Atualizando as informações do perfil tributário…',
  'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.':
    'As informações do perfil foram atualizadas. A alteração não foi reenviada. Copie o nome informado antes de sair desta tela.',
  'Current profile information could not be refreshed. Your entered name is retained. Check your connection and reload to review the profile.':
    'Não foi possível atualizar as informações do perfil. O nome informado foi mantido. Verifique sua conexão e recarregue para revisar o perfil.',
  'Tax component details are unavailable. Reload this page to review the current profile.':
    'Os detalhes dos componentes tributários estão indisponíveis. Recarregue esta página para revisar o perfil atual.',
  'Review the current profile and your access before retrying. Copy any entered name before reloading this page.':
    'Revise o perfil atual e seu acesso antes de tentar novamente. Copie o nome informado antes de recarregar esta página.',
  'Entered name (not saved)': 'Nome informado (não salvo)',
  'Tax components': 'Componentes tributários',
  'Non-compound tax': 'Imposto não composto',
  'No tax components recorded.': 'Nenhum componente tributário registrado.',
  'Manage tax profile': 'Gerenciar perfil tributário',
  'Rename tax profile': 'Renomear perfil tributário',
  'Archive tax profile': 'Arquivar perfil tributário',
  'I confirm this profile rename.': 'Confirmo a alteração do nome deste perfil.',
  'I have reviewed linked streams and confirm archiving this profile.':
    'Revisei os fluxos vinculados e confirmo o arquivamento deste perfil.',
  'Renaming changes only the profile name. Rates, dates, currency and issued invoice snapshots stay unchanged.':
    'Renomear altera apenas o nome do perfil. As alíquotas, datas, moeda e os registros das faturas emitidas permanecem inalterados.',
  'To change rates, dates or currency, create a new tax profile and explicitly select it in the applicable billing stream. Its effective date does not automatically replace another profile.':
    'Para alterar alíquotas, datas ou moeda, crie um novo perfil tributário e selecione-o explicitamente no fluxo de faturamento aplicável. Sua data de vigência não substitui automaticamente outro perfil.',
  'This list shows active profiles. Archived profiles leave this list; their components and issued invoice history are retained.':
    'Esta lista mostra perfis ativos. Perfis arquivados deixam de aparecer aqui; seus componentes e o histórico de faturas emitidas são preservados.',
  'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.':
    'Fluxos que usam um perfil arquivado não podem criar novos rascunhos de fatura até que um perfil substituto seja selecionado explicitamente. Uma fatura aprovada que use este perfil deve ser emitida ou recalculada antes do arquivamento. Faturas emitidas permanecem inalteradas.',
  'Copy these values before reviewing the current invoice.':
    'Copie estes valores antes de revisar a fatura atual.',
  'Preview is available before issuance. The final PDF is generated after issuance.':
    'A prévia está disponível antes da emissão. O PDF final é gerado após a emissão.',
  'Grouping cannot be customized here. Invoice layout follows the selected template.':
    'O agrupamento não pode ser personalizado aqui. O layout da fatura segue o modelo selecionado.',
  'Saved grouping setting': 'Configuração de agrupamento salva',
  'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.':
    'Nenhuma conversão verificada foi registrada. Esta despesa mantém sua moeda original. No momento, não é possível informar uma conversão aqui.',
  'Verified currency conversion needed': 'É necessária uma conversão de moeda verificada',
  'problem.expenseDetail.financeClassificationHold':
    'A aprovação operacional está concluída. A equipe financeira deve confirmar o reembolso e o tratamento de faturamento ao cliente desta despesa. O reembolso não está pronto até que a classificação seja concluída.',
  'We could not confirm the save. Check the register before submitting again.':
    'Não foi possível confirmar o salvamento. Verifique a lista antes de enviar novamente.',
  'Your changes were saved, but the register could not be refreshed. Close this form and refresh the page.':
    'As alterações foram salvas, mas não foi possível atualizar a lista. Feche este formulário e recarregue a página.',

  'Inherited reimbursement is resolved for the effective date when saved.':
    'O reembolso herdado é resolvido para a data de vigência ao salvar.',
  'The person save result is unknown. Review the latest terms before trying again.':
    'Não foi confirmado o salvamento das condições da pessoa. Revise as condições mais recentes antes de tentar novamente.',
  'Person terms were saved, but could not be refreshed. Reload the page to review them.':
    'As condições da pessoa foram salvas, mas não puderam ser atualizadas na tela. Recarregue a página para revisá-las.',
  'finance.reimbursement.review.confirm':
    'Revisar o reembolso agora? Alguns dados não salvos podem mudar, enquanto outros são mantidos. Confira as configurações, as datas de vigência e o motivo antes de salvar.',
  'correction.draft.navigation.confirm':
    'Continuar sem salvar? As alterações não salvas podem ser perdidas. Revise os dados que permanecerem antes de criar a correção.',
  'Discard your unsaved changes? Your entered information will be lost.':
    'Descartar as alterações não salvas? Os dados preenchidos serão perdidos.',
  'Review your latest 50 notifications. Filters apply to this list.':
    'Consulte suas últimas 50 notificações. Os filtros se aplicam a esta lista.',
  'Notification filters': 'Filtros de notificações',
  Unread: 'Não lidas',
  'Notification details': 'Detalhes da notificação',
  'Could not update the notification. Please try again.':
    'Não foi possível atualizar a notificação. Tente novamente.',
  'Could not refresh the inbox. Reload to check the notification status.':
    'Não foi possível atualizar a caixa de entrada. Recarregue para verificar o estado da notificação.',
  'No unread notifications in this list.': 'Não há notificações não lidas nesta lista.',
  'View all notifications': 'Ver todas as notificações',
  'Review this field.': 'Revise este campo.',
  'Reconnect to save changes. Your entries are still here.':
    'Reconecte-se para salvar as alterações. Os dados continuam aqui.',
  'Your workday': 'Sua jornada',
  '{count} assignments today': '{count} alocações hoje',
  'Planning is a reference. Record the time you actually worked.':
    'O planejamento é uma referência. Registre o tempo que você realmente trabalhou.',
  'All times in UTC': 'Todos os horários em UTC',
  'You can still record actual work for your assigned projects.':
    'Você pode registrar o trabalho realizado nos seus projetos atribuídos.',
  'Your assigned projects': 'Seus projetos atribuídos',
  'Upcoming assignments': 'Próximas alocações',
  'Showing {shown} of {total}': 'Exibindo {shown} de {total}',
  'Published assignments after today, in date order.':
    'Alocações publicadas após hoje, em ordem de data.',
  'No upcoming assignments published.': 'Nenhuma próxima alocação publicada.',
  'Show more assignments': 'Mostrar mais alocações',
  'Some assignments have incomplete dates. Ask your coordinator to review them.':
    'Algumas alocações têm datas incompletas. Peça ao seu coordenador para revisá-las.',

  'Technical changes': 'Alterações técnicas',
  Component: 'Componente',
  'Original behavior': 'Comportamento original',
  'Root cause': 'Causa raiz',
  'Change made': 'Alteração realizada',
  'Safety impact': 'Impacto na segurança',
  'Production impact': 'Impacto na produção',
  'Validation result': 'Resultado da validação',
  'Open risk': 'Risco pendente',
  'Rollback information': 'Informações de reversão',
  'Planned minutes': 'Minutos planejados',
  'Required skill': 'Competência necessária',
  'Reports with committed attachments require a versioned correction.':
    'Relatórios com anexos confirmados exigem uma correção versionada.',
  'Data management': 'Gestão de dados',
  'Manage all company records from your Owner account. Changes apply equally to demo and production records.':
    'Gerencie os registros da empresa com sua conta Owner. As ações se aplicam tanto aos dados de exemplo quanto aos reais.',
  'Manage record': 'Gerenciar registro',
  'Reopen as draft': 'Reabrir como rascunho',
  'I confirm this change to the selected record.':
    'Confirmo esta alteração no registro selecionado.',
  'I confirm creation of this record.': 'Confirmo a criação deste registro.',
  'Create record': 'Criar registro',
  'Open report': 'Abrir relatório',
  'Open sign-off record': 'Abrir registro de conformidade',
  'Open period record': 'Abrir registro do período',
  'Configure project issuing authority': 'Configurar a entidade emissora do projeto',
  'Operational records': 'Registros operacionais',
  'All management areas': 'Todas as áreas de gestão',
  'Management areas': 'Áreas de gestão',
  'Add or edit records': 'Adicionar ou editar registros',
  'Add record': 'Adicionar registro',
  'Clients and contacts': 'Clientes e contatos',
  'Projects and assignments': 'Projetos e atribuições',
  'Workers and access': 'Trabalhadores e acessos',
  'Suppliers and technicians': 'Fornecedores e técnicos',
  'Planning and skills': 'Planejamento e especialidades',
  'Payments and settlements': 'Pagamentos e liquidações',
  'Record type': 'Tipo de registro',
  'Confirm the operation': 'Confirme a operação',
  'This record is linked to billing. Manage the invoice before changing its sources.':
    'Este registro está vinculado ao faturamento. Gerencie a fatura antes de alterar seus registros de origem.',
  'This record is an invoice source. Manage the invoice first.':
    'Este registro faz parte de uma fatura. Gerencie a fatura primeiro.',
  'This record belongs to a correction history. Use the correction workflow.':
    'Este registro tem um histórico de correções. Use a opção de correção.',
  'This record is included in a period report. Manage the report before changing its sources.':
    'Este registro faz parte de um relatório finalizado. Gerencie o relatório antes de alterar seus registros de origem.',
  'This expense has a reimbursement. Reverse or adjust the payment first.':
    'Esta despesa tem um reembolso. Reverta ou ajuste o pagamento primeiro.',
  'This expense has a financial classification history. Use a financial correction.':
    'Esta despesa tem um histórico de classificação financeira. Use uma correção financeira.',
  'This time is included in a settlement. Adjust the settlement first.':
    'Estas horas estão incluídas em uma liquidação. Ajuste a liquidação primeiro.',
  'This report has technical changes. Manage those changes first.':
    'Este relatório tem alterações técnicas associadas. Gerencie essas alterações primeiro.',

  'Period review and customer follow-up': 'Revisão do período e acompanhamento do cliente',
  'Project contribution': 'Contribuição do projeto',
  'Calculated from approved project records':
    'Calculado a partir de registros aprovados do projeto',
  'Finance records need review': 'Os registros financeiros precisam de revisão',
  'Finance records loaded': 'Registros financeiros carregados',
  'Project alert types': 'Tipos de alerta do projeto',
  'Finance alert': 'Alerta financeira',
  'Purchase order or revenue budget at 70%': 'Pedido de compra ou orçamento de receita em 70%',
  'Purchase order or revenue budget at 85%': 'Pedido de compra ou orçamento de receita em 85%',
  'Purchase order or revenue budget at 95%': 'Pedido de compra ou orçamento de receita em 95%',
  'Labor hours budget at 95%': 'Orçamento de horas de trabalho em 95%',
  'Travel budget at 95%': 'Orçamento de viagens em 95%',
  'Projected margin is negative': 'A margem projetada é negativa',
  'Time finance rules incomplete': 'Regras financeiras das horas incompletas',
  'Expense finance projection incomplete': 'A projeção financeira das despesas está incompleta',
  'Review project finances, work records, upcoming obligations and reimbursements.':
    'Revise as finanças do projeto, os registros de trabalho, as próximas obrigações e os reembolsos.',
  'Choose a project to review its finances.': 'Selecione um projeto para revisar suas finanças.',
  'Review recorded minutes, billing status, effective rates and direct cost.':
    'Revise os minutos registrados, o estado do faturamento, as tarifas vigentes e o custo direto.',
  'Expected payment': 'Pagamento previsto',
  'Compensation finalized': 'Remuneração finalizada',

  'Cash calendar': 'Calendário de caixa',
  'Commercial agreement and example': 'Acordo comercial e exemplo',
  Today: 'Hoje',
  Time: 'Horas',
  Reports: 'Relatórios',
  Expenses: 'Despesas',
  Projects: 'Projetos',
  'My Pay': 'Meu pagamento',
  Suppliers: 'Fornecedores',
  'Supplier team': 'Equipe do fornecedor',
  'Operational report': 'Relatório operacional',
  Documents: 'Documentos',
  Notifications: 'Notificações',
  Profile: 'Perfil',
  Dashboard: 'Painel',
  Clients: 'Clientes',
  Team: 'Equipe',
  Planning: 'Planejamento',
  'PLC / Technical': 'PLC / Técnico',
  Approvals: 'Aprovações',
  Billing: 'Faturamento',
  Invoices: 'Faturas',
  Finance: 'Finanças',
  Settings: 'Configurações',
  Audit: 'Auditoria',
  'Time entries': 'Registros de horas',
  'Daily and technical reports': 'Relatórios diários e técnicos',
  'Expenses and receipts': 'Despesas e recibos',
  'Profile and security': 'Perfil e segurança',
  'Resource planning': 'Planejamento de recursos',
  'Approval queue': 'Fila de aprovação',
  'Billing streams': 'Fluxos de faturamento',
  'Project finance': 'Finanças do projeto',
  'Invoice / cost ledger': 'Livro de faturas e custos',
  'Monthly Accounting Pack': 'Pacote contábil mensal',
  'Audit log': 'Registro de auditoria',
  Language: 'Idioma',
  'Save draft': 'Salvar rascunho',
  'Save changes': 'Salvar alterações',
  Submit: 'Enviar',
  Save: 'Salvar',
  Create: 'Criar',
  Approve: 'Aprovar',
  Reject: 'Rejeitar',
  Close: 'Fechar',
  Issue: 'Emitir',
  Download: 'Baixar',
  Project: 'Projeto',
  Client: 'Cliente',
  Worker: 'Colaborador',
  Date: 'Data',
  Description: 'Descrição',
  Summary: 'Resumo',
  Amount: 'Valor',
  Currency: 'Moeda',
  Status: 'Status',
  Category: 'Categoria',
  Vendor: 'Fornecedor',
  'Actual minutes': 'Minutos reais',
  'Operational category': 'Categoria operacional',
  'Activity summary': 'Resumo da atividade',
  'Back to approvals': 'Voltar às aprovações',
  'Read-only operational review': 'Revisão operacional somente leitura',
  'Approval actions remain in the Approvals queue.':
    'As ações de aprovação permanecem na fila de Aprovações.',
  Period: 'Período',
  'Period start': 'Início do período',
  'Period end': 'Fim do período',
  Actual: 'Real',
  Approved: 'Aprovado',
  Pending: 'Pendente',
  Planned: 'Planejado',
  Revenue: 'Receita',
  'Revenue cap': 'Limite de receita',
  'Daily rate': 'Taxa diária',
  'Fixed fee / milestones': 'Preço fechado / Marcos',
  'Client paid directly': 'Pago diretamente pelo cliente',
  'Project materials': 'Materiais do projeto',
  'Time & materials': 'Tempo e materiais',
  'Billing contact': 'Contato de faturamento',
  'Client contacts': 'Contatos do cliente',
  'Team access': 'Acesso da equipe',
  'All streams': 'Todos os fluxos',
  Specialists: 'Especialistas',
  'Other records': 'Outros registros',
  'PLC / technical reports': 'Relatórios PLC / técnicos',
  'No email': 'Sem e-mail',
  'No due date': 'Sem data de vencimento',
  'No tax profile': 'Sem perfil fiscal',
  'No budget': 'Sem orçamento',
  'Registered device': 'Dispositivo registrado',
  'Unnamed device': 'Dispositivo sem nome',
  Enabled: 'Ativado',
  'Not enabled': 'Não ativado',
  'No records match that search in your access scope.':
    'Nenhum registro corresponde à busca no seu escopo de acesso.',
  'Project unavailable': 'Projeto indisponível',
  'Choose an available project': 'Escolher um projeto disponível',
  'field assignment': 'atribuição de campo',
  'field assignments': 'atribuições de campo',
  'Invalid audit history link': 'Link do histórico de auditoria inválido',
  'Open latest audit events': 'Abrir os eventos de auditoria mais recentes',
  'This audit history link is incomplete or invalid. Open the latest events to continue.':
    'Este link do histórico de auditoria está incompleto ou é inválido. Abra os eventos mais recentes para continuar.',
  'The selected project is unavailable in your access scope. Choose an available project to continue; your other filters are retained.':
    'O projeto selecionado não está disponível no seu escopo de acesso. Escolha um projeto disponível para continuar; os outros filtros são mantidos.',
  'No published assignment for today.': 'Nenhuma atribuição publicada para hoje.',
  'No time recorded.': 'Nenhuma hora registrada.',
  'No expenses recorded.': 'Nenhuma despesa registrada.',
  'No field reports recorded.': 'Nenhum relatório de campo registrado.',
  'No generated period summaries yet.': 'Nenhum resumo de período foi gerado.',
  'No notifications.': 'Nenhuma notificação.',
  'No audit events recorded.': 'Nenhum evento de auditoria registrado.',
  'No availability windows recorded.': 'Nenhuma janela de disponibilidade registrada.',
  'No skills recorded.': 'Nenhuma competência registrada.',
  'No settlements recorded for this project.': 'Nenhum acerto registrado para este projeto.',
  'No approved worker-paid expenses require reimbursement.':
    'Nenhuma despesa aprovada paga pelo colaborador exige reembolso.',
  'No issued invoice records match the current authorization scope.':
    'Nenhuma fatura emitida corresponde ao escopo de autorização atual.',
  'No Accounting Packs have been generated.': 'Nenhum pacote contábil foi gerado.',
  'No project assignment budget context is configured.':
    'Nenhum contexto de orçamento da atribuição está configurado.',
  'No client contacts recorded.': 'Nenhum contato de cliente registrado.',
  'No milestones await approval.': 'Nenhum marco aguarda aprovação.',
  'No approved expenses are available for this project.':
    'Nenhuma despesa aprovada está disponível para este projeto.',
  'No time economics are available for this project.':
    'Não há dados financeiros das horas deste projeto.',
  'No detailed plan': 'Nenhum plano detalhado',
  'Finance access required': 'Acesso financeiro necessário',
  'Finance-only finalization of approved compensation for the selected project.':
    'Finalização exclusiva de Finanças da remuneração aprovada para o projeto selecionado.',
  'Save availability': 'Salvar disponibilidade',
  Secondary: 'Secundário',
  Administration: 'Administração',
  Security: 'Segurança',
  'Sign out': 'Sair',
  Online: 'Online',
  Offline: 'Sem conexão',
  Synced: 'Sincronizado',
  Search: 'Pesquisar',
  'Search workspace': 'Pesquisar no espaço de trabalho',
  'Search recommendations': 'Recomendações de pesquisa',
  'Search results': 'Resultados da pesquisa',
  'Matching records': 'Registros correspondentes',
  'Recommended records': 'Registros recomendados',
  'Only records in your access scope': 'Apenas registros no seu escopo de acesso',
  'Dashboard actions': 'Ações do painel',
  'View pending reports': 'Ver relatórios pendentes',
  'Register time': 'Registrar horas',
  More: 'Mais',
  'Open PDF': 'Abrir PDF',
  'Print report': 'Imprimir relatório',
  'Generate report': 'Gerar relatório',
  Add: 'Adicionar',
  Edit: 'Editar',
  Delete: 'Excluir',
  Cancel: 'Cancelar',
  Back: 'Voltar',
  Next: 'Próximo',
  Previous: 'Anterior',
  Open: 'Abrir',
  Expand: 'Expandir',
  Collapse: 'Recolher',
  Refresh: 'Atualizar',
  Loading: 'Carregando',
  Error: 'Erro',
  Success: 'Sucesso',
  Warning: 'Aviso',
  Retry: 'Tentar novamente',
  'Try again': 'Tentar novamente',
  'View details': 'Ver detalhes',
  'No data': 'Sem dados',
  'Authorized projects': 'Projetos autorizados',
  'All projects': 'Todos os projetos',
  'Project access': 'Acesso ao projeto',
  'New project': 'Novo projeto',
  'Add contact': 'Adicionar contato',
  'Edit contact': 'Editar contato',
  'Delete contact': 'Excluir contato',
  'Print Report': 'Imprimir relatório',
  'Period report register': 'Registro de relatórios de período',
  'Source record': 'Registro de origem',
  'Daily field report': 'Relatório de campo diário',
  'PLC / technical report': 'Relatório PLC / técnico',
  'Hello, {name}': 'Olá, {name}',
  'Showing {count} records': 'Mostrando {count} registros',
  'Page {page} of {pages}': 'Página {page} de {pages}',
  'Last updated {date}': 'Última atualização {date}',
  'Locale: English': 'Idioma: inglês',
  'Locale: Spanish': 'Idioma: espanhol',
  'Locale: Brazilian Portuguese': 'Idioma: português do Brasil',
  Owner: 'Proprietário',
  Admin: 'Administrador',
  Manager: 'Gerente',
  owner: 'Proprietário',
  admin: 'Administrador',
  finance: 'Finanças',
  manager: 'Gerente',
  worker: 'Colaborador',
  auditor: 'Auditor',
  client: 'Usuário cliente',
  guest: 'Convidado',
  'Client user': 'Usuário cliente',
  Guest: 'Convidado',
  Draft: 'Rascunho',
  Submitted: 'Enviado',
  Rejected: 'Rejeitado',
  Issued: 'Emitida',
  Paid: 'Paga',
  Overdue: 'Vencida',
  Queued: 'Na fila',
  Running: 'Em execução',
  Ready: 'Pronto',
  Failed: 'Falhou',
  queued: 'Na fila',
  running: 'Em execução',
  ready: 'Pronto',
  failed: 'Falhou',
  pending: 'Pendente',
  approved: 'Aprovado',
  submitted: 'Enviado',
  rejected: 'Rejeitado',
  draft: 'Rascunho',
  issued: 'Emitida',
  paid: 'Paga',
  overdue: 'Vencida',
  active: 'Ativo',
  Verified: 'Verificada',
  verified: 'Verificada',
  'self-reported': 'Autodeclarada',
  inactive: 'Inativo',
  Active: 'Ativo',
  Inactive: 'Inativo',
  Available: 'Disponível',
  Unavailable: 'Indisponível',
  'Not applicable': 'Não aplicável',
  Preferred: 'Preferencial',
  Blocked: 'Bloqueado',
  'Regular time': 'Tempo regular',
  Travel: 'Viagem',
  Materials: 'Materiais',
  Accommodation: 'Hospedagem',
  Meals: 'Refeições',
  Other: 'Outro',
  Invoice: 'Fatura',
  'Period report': 'Relatório de período',
  'Accounting Pack': 'Pacote contábil',
  Expense: 'Despesa',
  'Time entry': 'Registro de horas',
  'Daily report': 'Relatório diário',
  'Technical report': 'Relatório técnico',
  'No results': 'Nenhum resultado',
  'Required field': 'Campo obrigatório',
  'Invalid value': 'Valor inválido',
  'Changes saved': 'Alterações salvas',
  'Report queued': 'Relatório na fila',
  'Report ready': 'Relatório pronto',
  'Report failed': 'Falha no relatório',
  'Language updated': 'Idioma atualizado',
  'Select language': 'Selecionar idioma',
  'Download PDF': 'Baixar PDF',
  PDF: 'PDF',
  XLSX: 'XLSX',
  CSV: 'CSV',
  JSON: 'JSON',
  MFA: 'MFA',
  TOTP: 'TOTP',
  PLC: 'PLC',
  HMI: 'HMI',
  SCADA: 'SCADA',
  FAT: 'FAT',
  SAT: 'SAT',
  'Company Webmail': 'Webmail corporativo',
  Webmail: 'Webmail',
  'Access Company Webmail': 'Acessar e-mail corporativo',
  'Open corporate webmail in a new tab': 'Abrir o e-mail corporativo em uma nova guia',
};

const supplementalEnglish: Record<string, string> = Object.fromEntries(
  supplementalKeys.map((key) => [key, englishCoverageKey(key)]),
);
const supplementalEs: Record<string, string> = Object.fromEntries(
  supplementalKeys.map((key) => [key, translateCoverageKey('es', key)]),
);
const supplementalPt: Record<string, string> = Object.fromEntries(
  supplementalKeys.map((key) => [key, translateCoverageKey('pt', key)]),
);

const completeEnglish = { ...en, ...supplementalEnglish } as Catalog;
const es = { ...esBase, ...supplementalEs } as Catalog;
const pt = { ...ptBase, ...supplementalPt } as Catalog;

export const portalCatalog: Record<PortalLocale, Catalog> = {
  en: completeEnglish,
  es,
  pt,
};
export const portalCatalogKeys = Object.keys(completeEnglish) as PortalTranslationKey[];

/** Terms that are intentionally invariant in all display languages. */
export const INVARIANT_TRANSLATION_KEYS = new Set<PortalTranslationKey>([
  'Status',
  'Online',
  'auditor',
  'Error',
  'PDF',
  'XLSX',
  'CSV',
  'JSON',
  'MFA',
  'TOTP',
  'PLC',
  'HMI',
  'SCADA',
  'FAT',
  'SAT',
  'Webmail',
]);

export { coverageInvariantKeys, isCoverageInvariantKey };

/** True only when the key has a core catalog value, explicit coverage data, or
 * a deliberate semantic action renderer. */
export function isExplicitCoverageTranslation(locale: PortalLocale, key: string): boolean {
  return key in en || isExplicitCoverageLiteral(locale === 'pt' ? 'pt' : 'es', key);
}

export function assertPortalCatalogParity(): string[] {
  const issues: string[] = [];
  const expected = new Set(portalCatalogKeys);
  for (const locale of portalLocales) {
    const actual = Object.keys(portalCatalog[locale]);
    for (const key of expected) if (!actual.includes(key)) issues.push(`${locale}:missing:${key}`);
    for (const key of actual)
      if (!expected.has(key as PortalTranslationKey)) issues.push(`${locale}:extra:${key}`);
  }
  return issues;
}

export type TranslationParams = Readonly<Record<string, string | number>>;

export function normalizePortalLocale(value: PortalLocaleInput): PortalLocale {
  if (typeof value !== 'string') return 'en';
  const normalized = value.trim().toLowerCase().replace('_', '-');
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es';
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt';
  return 'en';
}

function interpolate(source: string, params?: TranslationParams): string {
  if (!params) return source;
  return source.replace(/\{([\w.-]+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function translate(
  locale: PortalLocale,
  key: PortalTranslationKey | (string & {}),
  params?: TranslationParams,
): string {
  const localized = portalCatalog[locale][key as PortalTranslationKey];
  const source =
    localized ??
    completeEnglish[key as PortalTranslationKey] ??
    (key.startsWith('action.')
      ? locale === 'en'
        ? englishCoverageKey(key)
        : translateCoverageKey(locale, key)
      : key);
  return interpolate(source, params);
}

export function createTranslator(locale: PortalLocale) {
  return (key: PortalTranslationKey | (string & {}), params?: TranslationParams): string =>
    translate(locale, key, params);
}

/**
 * Render a persisted/action message key through the same catalog used by
 * components and print/PDF adapters. Unknown keys remain safe and visible so
 * an operational error is never silently discarded.
 */
export function renderPortalMessage(
  locale: PortalLocale,
  messageKey: string,
  params?: TranslationParams,
): string {
  return translate(locale, messageKey, params);
}
