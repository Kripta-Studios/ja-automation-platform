import { fail, isActionFailure } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  ReadinessError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  queueInvoiceEmail,
} from '@ja/database';
import {
  accountingPackPeriodSchema,
  billingCloseSchema,
  billingRuleInputSchema,
  invoiceAdjustmentSchema,
  invoiceIdSchema,
  invoiceNumberPolicyInputSchema,
  invoicePeriodSchema,
  invoicePlanningDatesInputSchema,
  legalEntityInputSchema,
  paymentInputSchema,
  paymentReversalInputSchema,
  sendInvoiceSchema,
  taxProfileInputSchema,
  voidInvoiceSchema,
} from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import { createInvoiceDraftResolvingPeriod } from '../invoice-draft';
import {
  billingReadinessMessageKey,
  billingReadinessRemedyId,
} from '../../portal/billing-readiness';
import {
  dateOnlyToEffectiveInstant,
  decimalToMinor,
  formObject,
  normalizeLocalDateTime,
  type PortalActionEvent,
} from '$lib/server/action-utils';
import { isRealIsoDate, previousCompleteMonth } from '$lib/server/iso-date';

function retainedScrollPosition(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^\d{1,7}$/u.test(raw) ? raw : '';
}

const billingInputProblems = {
  planningDates: [
    'BILLING_PLANNING_DATES_INVALID',
    'problem.billing.planningDatesInvalid',
    'Check the planned issue date, collection date, and record version before saving.',
    'review_invoice',
  ],
  stream: [
    'BILLING_STREAM_FIELDS_INVALID',
    'problem.billing.streamFieldsInvalid',
    'Check the billing stream fields and choose valid project, cadence, currency, and dates.',
    'review_billing_setup',
  ],
  legalEntity: [
    'BILLING_LEGAL_ENTITY_FIELDS_INVALID',
    'problem.billing.legalEntityFieldsInvalid',
    'Check the legal entity name, code, address, and currency before saving.',
    'review_billing_setup',
  ],
  numbering: [
    'BILLING_NUMBER_POLICY_FIELDS_INVALID',
    'problem.billing.numberPolicyFieldsInvalid',
    'Check the invoice number prefix, digits, effective date, and accountant approval date.',
    'review_billing_setup',
  ],
  taxProfile: [
    'BILLING_TAX_PROFILE_FIELDS_INVALID',
    'problem.billing.taxProfileFieldsInvalid',
    'Check the tax profile name, currency, effective date, and component rate.',
    'review_billing_setup',
  ],
  billingRuleId: [
    'BILLING_STREAM_SELECTION_REQUIRED',
    'problem.billing.streamSelectionRequired',
    'Choose a billing stream before changing or archiving it.',
    'review_billing_setup',
  ],
  fixedAmount: [
    'BILLING_FIXED_AMOUNT_INVALID',
    'problem.billing.fixedAmountInvalid',
    'Enter a non-negative exact fixed amount before saving the billing stream.',
    'review_billing_setup',
  ],
  legalEntityId: [
    'BILLING_LEGAL_ENTITY_SELECTION_REQUIRED',
    'problem.billing.legalEntitySelectionRequired',
    'Choose a legal entity before changing or archiving it.',
    'review_billing_setup',
  ],
  taxProfileId: [
    'BILLING_TAX_PROFILE_SELECTION_REQUIRED',
    'problem.billing.taxProfileSelectionRequired',
    'Choose a tax profile before changing or archiving it.',
    'review_billing_setup',
  ],
  draftPeriod: [
    'BILLING_DRAFT_PERIOD_INVALID',
    'problem.billing.draftPeriodInvalid',
    'Choose a billing stream and valid start and end dates for the draft.',
    'review_billing_setup',
  ],
  adjustment: [
    'BILLING_ADJUSTMENT_FIELDS_INVALID',
    'problem.billing.adjustmentFieldsInvalid',
    'Choose an invoice and enter a valid adjustment type, amount, and reason.',
    'review_invoice',
  ],
  invoiceId: [
    'BILLING_INVOICE_SELECTION_INVALID',
    'problem.billing.invoiceSelectionInvalid',
    'Choose a valid invoice before continuing.',
    'review_invoice',
  ],
  payment: [
    'BILLING_PAYMENT_FIELDS_INVALID',
    'problem.billing.paymentFieldsInvalid',
    'Check the payment amount, currency, received date, reference, and request key.',
    'review_ledger',
  ],
  reversal: [
    'BILLING_REVERSAL_FIELDS_INVALID',
    'problem.billing.reversalFieldsInvalid',
    'Check the reversal amount, effective date, reason, and request key.',
    'review_ledger',
  ],
  closePeriod: [
    'BILLING_CLOSE_PERIOD_FIELDS_INVALID',
    'problem.billing.closePeriodFieldsInvalid',
    'Choose a billing stream and valid dates before closing the period.',
    'review_billing_setup',
  ],
  void: [
    'BILLING_VOID_FIELDS_INVALID',
    'problem.billing.voidFieldsInvalid',
    'Choose an invoice and enter a reason and request key before voiding it.',
    'review_invoice',
  ],
  emailChoice: [
    'BILLING_EMAIL_CHOICE_REQUIRED',
    'problem.billing.emailChoiceRequired',
    'Choose whether to send the invoice email before continuing.',
    'review_invoice',
  ],
  send: [
    'BILLING_SEND_FIELDS_INVALID',
    'problem.billing.sendFieldsInvalid',
    'Choose an invoice and use a valid request key before marking it sent.',
    'review_invoice',
  ],
  accountingPeriod: [
    'BILLING_ACCOUNTING_PERIOD_INVALID',
    'problem.billing.accountingPeriodInvalid',
    'Choose valid start and end dates for the accounting pack. Empty dates use the previous complete month.',
    'review_accounting_pack',
  ],
  accountingPeriodShort: [
    'BILLING_ACCOUNTING_PERIOD_TOO_SHORT',
    'problem.billing.accountingPeriodTooShort',
    'Choose an accounting period of at least two calendar dates.',
    'review_accounting_pack',
  ],
  discount: [
    'BILLING_DISCOUNT_INVALID',
    'problem.billing.discountInvalid',
    'Enter a valid exact discount amount before saving the invoice draft.',
    'review_invoice',
  ],
} as const;

type BillingInputKind = keyof typeof billingInputProblems;

const billingInputFields = new Set([
  'invoiceId',
  'plannedIssueOn',
  'expectedCollectionOn',
  'expectedVersion',
  'projectId',
  'legalEntityId',
  'streamType',
  'includeExpenses',
  'cadenceType',
  'anchorDate',
  'taxProfileId',
  'currency',
  'templateId',
  'recipientEmail',
  'billingContactId',
  'paymentTermsDays',
  'fixedAmountMinor',
  'includedMinutes',
  'monthlyCutoffDay',
  'poNumberOverride',
  'semiMonthlyRule',
  'groupingMode',
  'autoGenerateDraft',
  'autoIssue',
  'autoSend',
  'effectiveFrom',
  'code',
  'legalName',
  'billingAddress',
  'companyIdentifiers',
  'prefix',
  'digits',
  'accountantApprovedAt',
  'name',
  'componentName',
  'componentPercent',
  'componentBasisPoints',
  'componentCompound',
  'billingRuleId',
  'periodStart',
  'periodEnd',
  'originalInvoiceId',
  'adjustmentType',
  'amount',
  'reason',
  'version',
  'reportLocale',
  'receivedOn',
  'reference',
  'paymentId',
  'effectiveOn',
  'reasonCode',
  'emailChoice',
  'recipient',
  'purchaseNo',
  'discount',
  'bankSwiftNumber',
  'bankAccountNumber',
  'bankName',
  'beneficiary',
  'pastDueNotice',
  'companyName',
  'companyDivision',
  'companyPhone',
  'companyAddress',
  'companyEmail',
  'companyWebsite',
  'viewportScrollY',
  'drawerScrollTop',
]);

function safeBillingInputValues(input: Record<string, unknown> | FormData): Record<string, string> {
  const entries = input instanceof FormData ? input.entries() : Object.entries(input);
  const values = Object.fromEntries(
    Array.from(entries).flatMap(([key, value]) => {
      if (!billingInputFields.has(key) || !['string', 'number', 'boolean'].includes(typeof value))
        return [];
      if (key === 'viewportScrollY' || key === 'drawerScrollTop')
        return [[key, retainedScrollPosition(value)]];
      const text = String(value).replaceAll(String.fromCharCode(0), '').slice(0, 2000);
      return [[key, text]];
    }),
  );
  if (input instanceof FormData) {
    if (input.has('autoGenerateDraftPresent') && !input.has('autoGenerateDraft'))
      values.autoGenerateDraft = 'false';
    if (input.has('includeExpensesPresent') && !input.has('includeExpenses'))
      values.includeExpenses = 'false';
  }
  return values;
}

const billingFieldHints: Record<string, string> = {
  amount: 'Enter a valid number.',
  amountMinor: 'Enter a valid number.',
  fixedAmountMinor: 'Enter a valid number.',
  discount: 'Enter a valid number.',
  receivedAt: 'Enter a valid date.',
  effectiveAt: 'Enter a valid date.',
  effectiveOn: 'Enter a valid date.',
  periodStart: 'Enter a valid date.',
  periodEnd: 'Enter a valid date.',
  plannedIssueOn: 'Enter a valid date.',
  expectedCollectionOn: 'Enter a valid date.',
  invoiceId: 'Please select an option.',
  billingRuleId: 'Please select an option.',
  legalEntityId: 'Please select an option.',
  taxProfileId: 'Please select an option.',
  paymentId: 'Please select an option.',
  idempotencyKey: 'Please complete this field.',
  emailChoice: 'Please select an option.',
  reportLocale: 'Please select an option.',
};

function billingInputFailure(
  kind: BillingInputKind,
  operation: string,
  input: Record<string, unknown> | FormData,
  issues: Record<string, string[] | string | undefined> = {},
  extra: Record<string, unknown> = {},
) {
  const [code, key, message, remedy] = billingInputProblems[kind];
  const values = safeBillingInputValues(input);
  const fieldErrors = Object.fromEntries(
    Object.entries(issues).flatMap(([field, issue]) => {
      const name =
        field === 'amountMinor' ? 'amount' : field === 'receivedAt' ? 'receivedOn' : field;
      const messages = Array.isArray(issue) ? issue : issue ? [issue] : [];
      if (!messages.length) return [];
      return [[name, [billingFieldHints[field] ?? 'Enter a valid value.']]];
    }),
  );
  return actionFail(400, key, {}, message, {
    code,
    fieldErrors,
    remedies: [{ id: remedy }],
    billingOperation: operation,
    values,
    ...(operation === 'createDraft'
      ? {
          billingRuleId: values.billingRuleId ?? '',
          periodStart: values.periodStart ?? '',
          periodEnd: values.periodEnd ?? '',
        }
      : {}),
    ...extra,
  });
}

/** A deliberately closed mapping: repository text is used only to identify a known rule. */
export function billingProblemFor(
  error: unknown,
  operation: string,
):
  | Readonly<{
      status: number;
      code: string;
      key: ActionMessageKey;
      message: string;
      remedies: readonly { id: string }[];
      fieldErrors?: Record<string, string[]>;
      params?: Readonly<Record<string, string>>;
    }>
  | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message;
  const known = (
    status: number,
    code: string,
    key: ActionMessageKey,
    explanation: string,
    remedy: string,
    fieldErrors?: Record<string, string[]>,
    params?: Readonly<Record<string, string>>,
  ) => ({
    status,
    code,
    key,
    message: explanation,
    remedies: [{ id: remedy }],
    fieldErrors,
    params,
  });
  if (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError) {
    if (/owner (role|administration) required/i.test(message))
      return known(
        403,
        'BILLING_OWNER_REQUIRED',
        'problem.billing.ownerRequired',
        'An owner must perform this billing action. Contact an owner to review the record.',
        'contact_owner',
      );
    if (/finance|billing|auditor|active finance or owner/i.test(message))
      return known(
        403,
        'BILLING_FINANCE_REQUIRED',
        'problem.billing.financeRequired',
        'Finance access is required for this billing action. Contact a finance administrator.',
        'contact_finance',
      );
    return undefined;
  }
  if (error instanceof ReadinessError) return undefined; // Preserve structured readiness reasons below.
  if (
    !(
      error instanceof ConflictError ||
      error instanceof V3ConflictError ||
      error instanceof ValidationError ||
      error instanceof V3ValidationError
    )
  )
    return undefined;
  if (
    /idempotency key was already used|idempotency key.*another|idempotency conflict|IDEMPOTENCY_CONFLICT/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_IDEMPOTENCY_REUSED',
      'problem.billing.idempotencyReused',
      'This request key was already used for different details. Review the existing record before submitting a new request.',
      'review_record',
    );
  if (/^invoice not found$/i.test(message))
    return known(
      404,
      'BILLING_INVOICE_NOT_FOUND',
      'problem.billing.invoiceNotFound',
      'This invoice is no longer available. Review the invoice register before continuing.',
      'review_invoice',
    );
  if (/^accounting pack not found$/i.test(message))
    return known(
      404,
      'BILLING_PACK_NOT_FOUND',
      'problem.billing.packNotFound',
      'This accounting pack is no longer available. Refresh the pack list before continuing.',
      'review_accounting_pack',
    );
  if (/^period end must follow start$/i.test(message))
    return known(
      400,
      'BILLING_PERIOD_END_BEFORE_START',
      'problem.billing.accountingPeriodEndBeforeStart',
      'The accounting period end must be on or after its start. Choose a later end date.',
      'review_accounting_pack',
      { periodEnd: ['Choose an end date on or after the start date.'] },
    );
  if (/^expenses can only be included in a labor billing stream$/i.test(message))
    return known(
      400,
      'BILLING_EXPENSES_REQUIRE_LABOR_STREAM',
      'problem.billing.expensesRequireLaborStream',
      'Expenses can be included only in a labor billing stream. Turn off Include expenses or choose a labor stream before saving.',
      'review_billing_setup',
      { includeExpenses: ['Turn off Include expenses or choose a labor stream.'] },
    );
  if (/^combined labor and separate expense billing rules cannot overlap$/i.test(message))
    return known(
      409,
      'BILLING_EXPENSE_BILLING_MODE_OVERLAP',
      'problem.billing.expenseBillingModeOverlap',
      'Combined labor and separate expense billing cannot overlap for this project. Review the existing stream and its effective dates before choosing one billing mode.',
      'review_billing_setup',
      operation === 'updateBillingRule'
        ? { includeExpenses: ['Turn off Include expenses or review the separate expense stream.'] }
        : {
            effectiveFrom: [
              'Choose a nonoverlapping effective date or review the existing stream.',
            ],
          },
    );
  if (/^automatic invoice issue and send are disabled$/i.test(message))
    return known(
      400,
      'BILLING_AUTOMATIC_ISSUANCE_DISABLED',
      'problem.billing.automaticIssuanceDisabled',
      'Automatic invoice issue and sending are disabled. Turn off Auto issue and Auto send, then review each draft before issuing or sending it manually.',
      'review_billing_setup',
      {
        autoIssue: ['Automatic issue is unavailable.'],
        autoSend: ['Automatic sending is unavailable.'],
      },
    );
  if (/^issue or recalculate approved invoices before archiving this billing rule$/i.test(message))
    return known(
      409,
      'BILLING_STREAM_APPROVED_INVOICE_BLOCKS_ARCHIVE',
      'problem.billing.streamApprovedInvoiceBlocksArchive',
      'This billing stream has an approved invoice. Review that invoice and issue or recalculate it before archiving the stream.',
      'review_invoice',
    );
  if (/^(?:active )?billing rule not found$/i.test(message))
    return known(
      404,
      'BILLING_ACTIVE_STREAM_UNAVAILABLE',
      'problem.billing.activeStreamUnavailable',
      'This billing stream is already archived or no longer available. Review the current billing setup and stream list before another change.',
      'review_billing_setup',
    );
  if (
    /billing period end must follow start|billing period does not match the configured cadence/i.test(
      message,
    )
  )
    return known(
      400,
      'BILLING_PERIOD_INVALID',
      'problem.billing.periodInvalid',
      'The billing period is reversed or does not match the stream cadence. Review the selected dates and stream.',
      'review_billing_setup',
      {
        periodStart: ['Review the billing period dates.'],
        periodEnd: ['Review the billing period dates.'],
      },
    );
  if (/milestone currency does not match the billing stream/i.test(message))
    return known(
      409,
      'BILLING_MILESTONE_CURRENCY_MISMATCH',
      'problem.billing.milestoneCurrencyMismatch',
      'A milestone uses a different currency from its billing stream. Ask Finance to review the milestone and stream setup.',
      'review_billing_setup',
    );
  if (/source .* is already reserved for billing/i.test(message))
    return known(
      409,
      'BILLING_SOURCE_ALREADY_RESERVED',
      'problem.billing.sourceAlreadyReserved',
      'A selected source is already reserved for another invoice. Review the current invoice and source allocation.',
      'review_invoice',
    );
  if (/resolved client rate disappeared/i.test(message))
    return known(
      409,
      'BILLING_CLIENT_RATE_CHANGED',
      'problem.billing.clientRateChanged',
      'The client rate changed while this invoice was being prepared. Ask Finance to review the current rate before creating a new draft.',
      'review_billing_setup',
    );
  if (
    /invoice (line projection|commercial source manifest) is empty|invoice (commercial )?source .* (missing a hash|hash mismatch|not bound to its commercial manifest)/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_ISSUE_EVIDENCE_INCOMPLETE',
      'problem.billing.issueEvidenceIncomplete',
      'The invoice source evidence is incomplete or no longer matches its snapshot. Review the invoice before issuing.',
      'review_invoice',
    );
  if (
    /invoice could not be recalculated; prior approval is preserved|replacement draft did not retain every approved source/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_RECALCULATION_NOT_APPLIED',
      'problem.billing.recalculationNotApplied',
      'The recalculation could not preserve every approved source. The prior approval remains intact; review it before another attempt.',
      'review_invoice',
    );
  if (
    /^accounting pack source changed; create a current revision before finalization$|^accounting pack requires a successful current canonical revision$/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_PACK_REVISION_STALE',
      'problem.billing.packRevisionStale',
      'The accounting pack no longer reflects current sources or a clean canonical revision. Create and review a current revision before finalizing.',
      'review_accounting_pack',
    );
  if (/^accounting pack reconciliation is blocked$/i.test(message))
    return known(
      409,
      'BILLING_PACK_RECONCILIATION_BLOCKED',
      'problem.billing.packReconciliationBlocked',
      'The accounting pack does not reconcile. Review its checks and source records before finalizing.',
      'review_accounting_pack',
    );
  if (
    /^accounting pack artifacts are still processing$|^accounting pack artifact job was not queued$/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_PACK_ARTIFACTS_PENDING',
      'problem.billing.packArtifactsPending',
      'Accounting pack artifacts are still queued or processing. Check the pack status before finalizing or trying again.',
      'review_accounting_pack',
    );
  const missingPackExports = message.match(
    /^Accounting Pack required exports are not ready: (.+)$/iu,
  );
  if (missingPackExports)
    return known(
      409,
      'BILLING_PACK_EXPORTS_REQUIRED',
      'problem.billing.packExportsRequired',
      `Required accounting pack exports are not ready: ${missingPackExports[1]}. Review each artifact before finalizing.`,
      'review_accounting_pack',
      undefined,
      { formats: missingPackExports[1] ?? '' },
    );
  if (/^accounting pack is not reviewable$/i.test(message))
    return known(
      409,
      'BILLING_PACK_NOT_REVIEWABLE',
      'problem.billing.packNotReviewable',
      'This accounting pack is no longer in a reviewable state. Check its current state before another finalization request.',
      'review_accounting_pack',
    );
  if (
    /invoice changed|replacement draft changed|source.*changed|configuration.*stale|billing.*changed|changed concurrently/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_RECORD_CHANGED',
      'problem.billing.recordChanged',
      'This billing record or its sources changed while you were reviewing it. Review the current record before deciding what to do.',
      'review_record',
    );
  if (
    /only an unissued approved invoice can be recalculated|finalized evidence.*cannot be recalculated|approved invoice draft required/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_APPROVED_INVOICE_REQUIRED',
      'problem.billing.approvedInvoiceRequired',
      'This invoice is no longer an unissued approved draft. Review its current state before recalculating or issuing.',
      'review_invoice',
    );
  if (
    /draft invoice required|only draft or approved invoices can be modified|issued or approved invoices cannot be deleted|draft invoices with source lines must be superseded/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_DRAFT_STATE_REQUIRED',
      'problem.billing.draftStateRequired',
      'The invoice has moved beyond the editable draft state. Review it before making another change.',
      'review_invoice',
    );
  if (/invoice pdf must be ready|invoice pdf is not ready/i.test(message))
    return known(
      409,
      'BILLING_PDF_NOT_READY',
      'problem.billing.pdfNotReady',
      'The invoice PDF is still pending or failed. Check its artifact status before sending or downloading it.',
      'review_invoice',
    );
  if (/accounting pack.*export.*(not ready|failed)/i.test(message))
    return /failed/i.test(message)
      ? known(
          409,
          'BILLING_EXPORT_FAILED',
          'problem.billing.exportFailed',
          'This export failed. Review the pack status and request an authorized retry for this artifact.',
          'review_accounting_pack',
        )
      : known(
          409,
          'BILLING_EXPORT_PENDING',
          'problem.billing.exportPending',
          'This export is still queued or running. Check the pack status before downloading.',
          'review_accounting_pack',
        );
  if (/final accounting pack is immutable/i.test(message))
    return known(
      409,
      'BILLING_PACK_FINAL',
      'problem.billing.packFinal',
      'This accounting pack is final and cannot be changed. Review its existing artifacts or create a new revision.',
      'review_accounting_pack',
    );
  if (/collections must be fully reversed before the invoice can be voided/i.test(message))
    return known(
      409,
      'BILLING_VOID_COLLECTIONS_PRESENT',
      'problem.billing.voidCollectionsPresent',
      'This invoice has collections. Review and reverse the applicable payments before an owner can void it.',
      'review_ledger',
    );
  if (
    /^payment must be positive$|^payment reversal must be positive$|^payment exceeds invoice balance$|^payment reversal exceeds the remaining unreversed amount$/i.test(
      message,
    )
  )
    return known(
      400,
      'BILLING_PAYMENT_AMOUNT_INVALID',
      'problem.billing.paymentAmountInvalid',
      'The amount must be positive and cannot exceed the available invoice or payment balance. Review the ledger and enter an allowed amount.',
      'review_ledger',
      { amount: ['Enter an amount within the available balance.'] },
    );
  if (/^payment reference is too long$/i.test(message))
    return known(
      400,
      'BILLING_PAYMENT_REFERENCE_INVALID',
      'problem.billing.paymentReferenceInvalid',
      'The payment reference must contain no more than 200 characters.',
      'review_ledger',
      { reference: ['Use no more than 200 characters.'] },
    );
  if (
    /^payment received date cannot be before the invoice was issued$|^payment received date cannot precede invoice issue date$|^payment received date cannot be in the future$|^payment reversal cannot predate the original payment$|^payment reversal effective date cannot be in the future$/i.test(
      message,
    )
  )
    return known(
      400,
      'BILLING_PAYMENT_DATE_INVALID',
      'problem.billing.paymentDateInvalid',
      'The payment date must be between the invoice issue date and today. A reversal cannot predate its payment.',
      'review_ledger',
      operation === 'reversePayment'
        ? { effectiveOn: ['Choose a date on or after the payment date and no later than today.'] }
        : { receivedOn: ['Choose a date on or after invoice issue and no later than today.'] },
    );
  if (
    /^legacy payment truth lacks canonical finance provenance$|^issued invoice lacks canonical legal-entity provenance$|^payment provenance does not match its invoice$|^issued invoice is missing its immutable issue timestamp$|^completed payment reversal command has no reversal event$/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_PAYMENT_PROVENANCE_BLOCKED',
      'problem.billing.paymentProvenanceBlocked',
      'The invoice or payment is missing required finance evidence. Ask Finance to review its history before another entry.',
      'contact_finance',
    );
  if (
    /^issued invoice in matching currency required$|^active issued invoice payment is required$|^invoice payment is required$/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_PAYMENT_INVOICE_UNAVAILABLE',
      'problem.billing.paymentInvoiceUnavailable',
      'The payment requires an issued invoice in the matching currency, or an active payment to reverse. Review the current ledger state.',
      'review_ledger',
    );
  if (
    /^payment (reversal )?idempotency key is required$|^payment reversal reason code is invalid$/i.test(
      message,
    )
  )
    return known(
      400,
      'BILLING_PAYMENT_REQUEST_INVALID',
      'problem.billing.paymentRequestInvalid',
      'This payment request is missing a valid request key or reversal reason. Review the record before submitting again.',
      'review_ledger',
    );
  if (/^valid invoice recipient required$/i.test(message))
    return known(
      400,
      'BILLING_EMAIL_RECIPIENT_INVALID',
      'problem.billing.emailRecipientInvalid',
      'Enter a valid invoice recipient email address before requesting delivery.',
      'review_invoice',
      { recipient: ['Enter a valid email address.'] },
    );
  if (/^email confirmation required$/i.test(message))
    return known(
      400,
      'BILLING_EMAIL_CONFIRMATION_REQUIRED',
      'problem.billing.emailConfirmationRequired',
      'Confirm the recipient before requesting invoice email delivery.',
      'review_invoice',
    );
  if (
    /^issued invoice with ready PDF required$|^invoice pdf exceeds email size limit$|^invoice pdf integrity verification failed$/i.test(
      message,
    )
  )
    return known(
      409,
      'BILLING_EMAIL_PDF_UNAVAILABLE',
      'problem.billing.emailPdfUnavailable',
      'The issued invoice PDF is not ready, exceeds the email size limit, or failed integrity verification. Review its artifact status before requesting email delivery.',
      'review_invoice',
    );
  if (
    /payment.*(exceed|positive|currency|issued|future|precede|outstanding|balance)|invoice.*payment|issued invoice in matching currency required|legacy payment truth/i.test(
      message,
    )
  )
    return known(
      error instanceof V3ConflictError ? 409 : 400,
      'BILLING_PAYMENT_BLOCKED',
      'problem.billing.paymentBlocked',
      'The payment cannot be recorded against the invoice in its current state or for this amount or date. Review the invoice ledger and payment details.',
      'review_ledger',
    );
  if (
    /only.*invoice.*void|void.*invoice|issued invoice required/i.test(message) &&
    /void|payment|send/i.test(operation)
  )
    return known(
      409,
      'BILLING_INVOICE_STATE_BLOCKED',
      'problem.billing.invoiceStateBlocked',
      'The invoice is not in a state that permits this action. Review its current state and history.',
      'review_invoice',
    );
  if (
    /invoice.*(archived legal entity|inactive tax profile|currency no longer matches)|billing context is incomplete/i.test(
      message,
    )
  )
    return known(
      400,
      'BILLING_ISSUE_CONFIGURATION_BLOCKED',
      'problem.billing.issueConfigurationBlocked',
      'The invoice issuer, tax profile, or currency configuration is no longer ready for issuance. Ask Finance to review the setup.',
      'review_billing_setup',
    );
  if (/recalculation reason|current invoice version is required/i.test(message))
    return known(
      400,
      'BILLING_RECALCULATION_DETAILS_REQUIRED',
      'problem.billing.recalculationDetailsRequired',
      'Enter a reason and use the current invoice version before recalculating.',
      'review_invoice',
    );
  if (/credit adjustment.*exceed|adjustment amount must be non-zero/i.test(message))
    return known(
      400,
      'BILLING_ADJUSTMENT_AMOUNT_BLOCKED',
      'problem.billing.adjustmentAmountBlocked',
      'The adjustment amount is invalid or exceeds the remaining amount on the original invoice. Review its credits and amount.',
      'review_invoice',
    );
  return undefined;
}

export { billingReadinessRemedyId } from '../../portal/billing-readiness';

export function billingActionFailure(
  error: unknown,
  operation: string,
  role?: string,
  values?: Record<string, string>,
) {
  const retainedDraftSelection =
    operation === 'createDraft' && values
      ? {
          billingRuleId: values.billingRuleId ?? '',
          periodStart: values.periodStart ?? '',
          periodEnd: values.periodEnd ?? '',
        }
      : {};
  if (error instanceof ReadinessError) {
    const reason = error.reasons[0];
    const reasonCode = reason?.code || 'unknown';
    const remedyId = billingReadinessRemedyId(reasonCode, role);
    return actionFail(
      409,
      billingReadinessMessageKey(reasonCode) as ActionMessageKey,
      {},
      undefined,
      {
        code: `BILLING_READINESS_${reasonCode.toUpperCase()}`,
        reasons: error.reasons,
        remedies: [{ id: remedyId }],
        billingOperation: operation,
        ...(values ? { values } : {}),
        ...retainedDraftSelection,
      },
    );
  }
  const mapped = billingProblemFor(error, operation);
  if (mapped)
    return actionFail(mapped.status, mapped.key, mapped.params ?? {}, mapped.message, {
      code: mapped.code,
      remedies: mapped.remedies,
      ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}),
      billingOperation: operation,
      ...(values ? { values } : {}),
      ...retainedDraftSelection,
    });
  return actionFailure(error, {
    billingOperation: operation,
    ...(values ? { values } : {}),
    ...retainedDraftSelection,
  });
}

type AccountingPackStatusRecord = Readonly<{
  id?: unknown;
  state?: unknown;
  exportStatuses?: unknown;
}>;

const accountingPackStatusRank: Record<string, number> = {
  failed: 4,
  running: 3,
  processing: 3,
  queued: 2,
  pending: 2,
  ready: 1,
  final: 1,
};

/**
 * Build the user-facing result from the target pack, not from global durable-job counters.
 * A finance page can have unrelated jobs in flight, so scheduler counters are not evidence
 * about this specific Accounting Pack.
 */
export function accountingPackActionMessage(
  pack: AccountingPackStatusRecord | undefined,
  fallbackId: string,
): string {
  const shortId = (String(pack?.id ?? fallbackId).slice(0, 8) || 'unknown').trim();
  const statuses =
    pack?.exportStatuses && typeof pack.exportStatuses === 'object'
      ? Object.values(pack.exportStatuses as Record<string, unknown>).map((value) =>
          String(value).toLowerCase(),
        )
      : [];
  const state = String(pack?.state ?? '').toLowerCase();
  const targetStatus =
    statuses.length > 0
      ? statuses.reduce(
          (current, candidate) =>
            !current ||
            (accountingPackStatusRank[candidate] ?? 2) > (accountingPackStatusRank[current] ?? 2)
              ? candidate
              : current,
          '',
        )
      : state;

  if (targetStatus === 'failed')
    return `Accounting Pack ${shortId} failed; one or more artifacts need retry`;
  if (targetStatus === 'running' || targetStatus === 'processing')
    return `Accounting Pack ${shortId} processing`;
  if (targetStatus === 'queued' || targetStatus === 'pending')
    return `Accounting Pack ${shortId} queued`;
  if (targetStatus === 'ready' || targetStatus === 'final')
    return `Accounting Pack ${shortId} ready`;

  // A newly-created pack should never be described as generated when its job status is not
  // observable yet. Queueing is the safest truthful state until the target can be refreshed.
  return `Accounting Pack ${shortId} queued`;
}

export function accountingPackActionFeedback(
  pack: AccountingPackStatusRecord | undefined,
  fallbackId: string,
): Readonly<{
  messageKey: ActionMessageKey;
  messageParams: Readonly<{ packId: string }>;
  legacyMessage: string;
}> {
  const legacyMessage = accountingPackActionMessage(pack, fallbackId);
  const shortId = (String(pack?.id ?? fallbackId).slice(0, 8) || 'unknown').trim();
  const status =
    legacyMessage.match(/\b(failed|processing|queued|ready)\b/i)?.[1]?.toLowerCase() ?? 'queued';
  return {
    messageKey: `action.billing.accountingPack.${status}`,
    messageParams: { packId: shortId },
    legacyMessage,
  };
}

export const billingActions = {
  setInvoicePlanningDates: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const planningInput = Object.fromEntries(
      Object.entries(object).filter(
        ([key]) => key !== 'viewportScrollY' && key !== 'drawerScrollTop',
      ),
    );
    const parsed = invoicePlanningDatesInputSchema.safeParse(planningInput);
    if (!parsed.success)
      return billingInputFailure(
        'planningDates',
        'setInvoicePlanningDates',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.setInvoicePlanningDates(context.principal, parsed.data);
      return actionSuccess(
        'action.billing.invoicePlanningDatesSaved',
        { version: result.version },
        'Invoice planning dates saved',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'setInvoicePlanningDates',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  createBillingRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const submittedValues = safeBillingInputValues(object);
    object.autoGenerateDraft = object.autoGenerateDraft === 'on';
    object.includeExpenses = object.includeExpenses === 'on';
    const parsed = billingRuleInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'stream',
        'createBillingRule',
        object,
        parsed.error.flatten().fieldErrors,
        { values: submittedValues },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createBillingRule(context.principal, parsed.data);
      return actionSuccess('action.billing.streamSaved', {}, 'Billing stream saved');
    } catch (error) {
      return billingActionFailure(
        error,
        'createBillingRule',
        context.principal.role,
        submittedValues,
      );
    } finally {
      context.sqlite.close();
    }
  },
  createLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = legalEntityInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'legalEntity',
        'createLegalEntity',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createLegalEntity(context.principal, parsed.data);
      return actionSuccess('action.billing.legalEntitySaved', {}, 'Legal entity saved');
    } catch (error) {
      return billingActionFailure(
        error,
        'createLegalEntity',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  createInvoiceNumberPolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const submittedValues = safeBillingInputValues(object);
    object.accountantApprovedAt = normalizeLocalDateTime(object.accountantApprovedAt);
    const parsed = invoiceNumberPolicyInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'numbering',
        'createInvoiceNumberPolicy',
        object,
        parsed.error.flatten().fieldErrors,
        { values: submittedValues },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createInvoiceNumberPolicy(context.principal, parsed.data);
      return actionSuccess(
        'action.billing.invoiceNumberPolicySaved',
        {},
        'Invoice-number policy saved',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'createInvoiceNumberPolicy',
        context.principal.role,
        submittedValues,
      );
    } finally {
      context.sqlite.close();
    }
  },
  createTaxProfile: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const submittedValues = safeBillingInputValues(object);
    object.componentCompound = object.componentCompound === 'on';
    const parsed = taxProfileInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'taxProfile',
        'createTaxProfile',
        object,
        parsed.error.flatten().fieldErrors,
        { values: submittedValues },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createTaxProfile(context.principal, {
        name: parsed.data.name,
        legalEntityId: parsed.data.legalEntityId || undefined,
        effectiveFrom: parsed.data.effectiveFrom,
        currency: parsed.data.currency,
        components: [
          {
            name: parsed.data.componentName,
            basisPoints: parsed.data.componentBasisPoints,
            compound: parsed.data.componentCompound,
          },
        ],
      });
      return actionSuccess('action.billing.taxProfileSaved', {}, 'Tax profile saved');
    } catch (error) {
      return billingActionFailure(
        error,
        'createTaxProfile',
        context.principal.role,
        submittedValues,
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateBillingRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('billingRuleId')?.toString();
    if (!id)
      return billingInputFailure('billingRuleId', 'updateBillingRule', formData, {
        billingRuleId: ['Required'],
      });

    const input: Record<string, unknown> = {};
    if (formData.has('templateId')) input.templateId = formData.get('templateId')?.toString();
    if (formData.has('recipientEmail'))
      input.recipientEmail = formData.get('recipientEmail')?.toString();
    if (formData.has('paymentTermsDays'))
      input.paymentTermsDays = Number(formData.get('paymentTermsDays'));
    if (formData.has('poNumberOverride'))
      input.poNumberOverride = formData.get('poNumberOverride')?.toString();
    if (formData.has('groupingMode')) input.groupingMode = formData.get('groupingMode')?.toString();
    if (formData.has('includedMinutes'))
      input.includedMinutes = Number(formData.get('includedMinutes'));
    if (formData.has('autoGenerateDraft') || formData.has('autoGenerateDraftPresent'))
      input.autoGenerateDraft = formData.get('autoGenerateDraft')?.toString() === 'on';
    if (formData.has('includeExpenses') || formData.has('includeExpensesPresent'))
      input.includeExpenses = formData.get('includeExpenses')?.toString() === 'on';
    if (formData.has('autoIssue')) input.autoIssue = formData.get('autoIssue')?.toString() === 'on';
    if (formData.has('autoSend')) input.autoSend = formData.get('autoSend')?.toString() === 'on';

    const fixedAmountMinorRaw = formData.get('fixedAmountMinor')?.toString();
    if (fixedAmountMinorRaw) {
      const value = fixedAmountMinorRaw.trim();
      try {
        // The field is named in minor units, but accepting an explicitly
        // decimal value keeps the form ergonomic. Both branches are exact;
        // no binary floating-point conversion is involved.
        input.fixedAmountMinor = /^\d+$/.test(value)
          ? BigInt(value)
          : (() => {
              const minor = decimalToMinor(value);
              if (!minor) throw new Error('Invalid fixed amount');
              return BigInt(minor);
            })();
      } catch {
        return billingInputFailure('fixedAmount', 'updateBillingRule', formData, {
          fixedAmountMinor: ['Invalid amount'],
        });
      }
    }

    const context = openPortalRepository(locals);
    try {
      context.repository.updateBillingRule(context.principal, id, input);
      return actionSuccess('action.billing.ruleUpdated', {}, 'Billing rule updated');
    } catch (error) {
      return billingActionFailure(
        error,
        'updateBillingRule',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  archiveBillingRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('billingRuleId')?.toString();
    if (!id)
      return billingInputFailure('billingRuleId', 'archiveBillingRule', formData, {
        billingRuleId: ['Required'],
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveBillingRule(context.principal, id);
      return actionSuccess('action.billing.ruleArchived', {}, 'Billing rule archived');
    } catch (error) {
      return billingActionFailure(
        error,
        'archiveBillingRule',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('legalEntityId')?.toString();
    if (!id)
      return billingInputFailure('legalEntityId', 'updateLegalEntity', formData, {
        legalEntityId: ['Required'],
      });

    const input: Record<string, unknown> = {};
    if (formData.has('legalName')) input.legalName = formData.get('legalName')?.toString();
    if (formData.has('currency')) input.currency = formData.get('currency')?.toString();
    if (formData.has('billingAddress'))
      input.billingAddress = formData.get('billingAddress')?.toString();
    if (formData.has('companyIdentifiers'))
      input.companyIdentifiers = formData.get('companyIdentifiers')?.toString();

    const context = openPortalRepository(locals);
    try {
      context.repository.updateLegalEntity(context.principal, id, input);
      return actionSuccess('action.billing.legalEntityUpdated', {}, 'Legal entity updated');
    } catch (error) {
      return billingActionFailure(
        error,
        'updateLegalEntity',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  archiveLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('legalEntityId')?.toString();
    if (!id)
      return billingInputFailure('legalEntityId', 'archiveLegalEntity', formData, {
        legalEntityId: ['Required'],
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveLegalEntity(context.principal, id);
      return actionSuccess('action.billing.legalEntityArchived', {}, 'Legal entity archived');
    } catch (error) {
      return billingActionFailure(
        error,
        'archiveLegalEntity',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateTaxProfile: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('taxProfileId')?.toString();
    if (!id)
      return billingInputFailure('taxProfileId', 'updateTaxProfile', formData, {
        taxProfileId: ['Required'],
      });

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();

    const context = openPortalRepository(locals);
    try {
      context.repository.updateTaxProfile(context.principal, id, input);
      return actionSuccess('action.billing.taxProfileUpdated', {}, 'Tax profile updated');
    } catch (error) {
      return billingActionFailure(
        error,
        'updateTaxProfile',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  archiveTaxProfile: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('taxProfileId')?.toString();
    if (!id)
      return billingInputFailure('taxProfileId', 'archiveTaxProfile', formData, {
        taxProfileId: ['Required'],
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveTaxProfile(context.principal, id);
      return actionSuccess('action.billing.taxProfileArchived', {}, 'Tax profile archived');
    } catch (error) {
      return billingActionFailure(
        error,
        'archiveTaxProfile',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
  createDraft: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoicePeriodSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'draftPeriod',
        'createDraft',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = createInvoiceDraftResolvingPeriod(context, parsed.data);
      if (isActionFailure(result))
        return fail(result.status, {
          ...(result.data && typeof result.data === 'object' ? result.data : {}),
          billingOperation: 'createDraft',
          values: safeBillingInputValues(object),
        });
      return result;
    } catch (error) {
      return billingActionFailure(
        error,
        'createDraft',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  createInvoiceAdjustment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.amountMinor = decimalToMinor(object.amount) ?? object.amountMinor;
    const parsed = invoiceAdjustmentSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'adjustment',
        'createInvoiceAdjustment',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createInvoiceAdjustment(context.principal, parsed.data);
      return actionSuccess(
        'action.billing.invoiceAdjustmentCreated',
        {},
        'Adjustment draft created',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'createInvoiceAdjustment',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  approveInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'invoiceId',
        'approveInvoice',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.approveInvoiceDraft(context.principal, parsed.data.invoiceId);
      return actionSuccess('action.billing.invoiceApproved', {}, 'Invoice approved');
    } catch (error) {
      return billingActionFailure(
        error,
        'approveInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  recalculateApprovedInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'invoiceId',
        'recalculateApprovedInvoice',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.recalculateApprovedInvoice(
        context.principal,
        parsed.data.invoiceId,
        Number(object.version),
        String(object.reason ?? ''),
      );
      return actionSuccess(
        'action.billing.invoiceRecalculated',
        { invoiceId: result.id },
        'Invoice recalculated as a draft. Review and approve it again.',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'recalculateApprovedInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  deleteInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'invoiceId',
        'deleteInvoice',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteInvoice(
        context.principal,
        parsed.data.invoiceId,
        String(object.reason ?? 'Discarded from billing'),
        object.version === undefined ? undefined : Number(object.version),
      );
      return actionSuccess('action.billing.invoiceDeleted', {}, 'Invoice deleted');
    } catch (error) {
      return billingActionFailure(
        error,
        'deleteInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  issueInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'invoiceId',
        'issueInvoice',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.issueInvoice(
        context.principal,
        parsed.data.invoiceId,
        parsed.data.reportLocale,
      );
      return actionSuccess(
        result.issued ? 'action.billing.invoiceIssued' : 'action.billing.invoiceAlreadyIssued',
        { invoiceNumber: result.invoiceNumber },
        result.issued
          ? `Issued ${result.invoiceNumber}`
          : `Invoice ${result.invoiceNumber} was already issued`,
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'issueInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  recordPayment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = {
      invoiceId: String(object.invoiceId ?? ''),
      amount: String(object.amount ?? ''),
      currency: String(object.currency ?? ''),
      receivedOn: String(object.receivedOn ?? ''),
      reference: String(object.reference ?? ''),
    };
    object.amountMinor = decimalToMinor(object.amount);
    object.receivedAt = dateOnlyToEffectiveInstant(object.receivedOn);
    const parsed = paymentInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'payment',
        'recordPayment',
        values,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordPayment(context.principal, parsed.data);
      return actionSuccess(
        result.created ? 'action.billing.paymentRecorded' : 'action.billing.paymentAlreadyRecorded',
        {},
        result.created ? 'Payment recorded' : 'This payment was already recorded',
      );
    } catch (error) {
      return billingActionFailure(error, 'recordPayment', context.principal.role, values);
    } finally {
      context.sqlite.close();
    }
  },
  reversePayment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = {
      paymentId: String(object.paymentId ?? ''),
      amount: String(object.amount ?? ''),
      effectiveOn: String(object.effectiveOn ?? ''),
      reasonCode: String(object.reasonCode ?? ''),
      reason: String(object.reason ?? ''),
      viewportScrollY: retainedScrollPosition(object.viewportScrollY),
      drawerScrollTop: retainedScrollPosition(object.drawerScrollTop),
    };
    object.amountMinor = decimalToMinor(object.amount);
    if (typeof object.effectiveOn === 'string')
      object.effectiveAt = `${object.effectiveOn}T12:00:00.000Z`;
    const parsed = paymentReversalInputSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'reversal',
        'reversePayment',
        values,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      // v3 owns finance authorization, immutable reversal
      // history, remaining-balance checks, and idempotent retries.
      context.v3.reversePayment(context.principal, {
        paymentId: parsed.data.paymentId,
        amountMinor: parsed.data.amountMinor,
        effectiveAt: String(dateOnlyToEffectiveInstant(parsed.data.effectiveOn)),
        reasonCode: parsed.data.reasonCode,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return actionSuccess('action.billing.paymentReversed', {}, 'Payment reversal recorded');
    } catch (error) {
      return billingActionFailure(error, 'reversePayment', context.principal.role, values);
    } finally {
      context.sqlite.close();
    }
  },
  closePeriod: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = billingCloseSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'closePeriod',
        'closePeriod',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.closeBillingPeriod(
        context.principal,
        parsed.data.billingRuleId,
        parsed.data.periodStart,
        parsed.data.periodEnd,
        parsed.data.reportLocale,
      );
      if (!result.closed) {
        const reasons = result.reasons ?? [];
        const reasonCode = String((reasons[0] as { code?: string } | undefined)?.code ?? 'unknown');
        const messageKey = billingReadinessMessageKey(reasonCode) as ActionMessageKey;
        return actionFail(409, messageKey, {}, undefined, {
          code: `BILLING_READINESS_${reasonCode.toUpperCase()}`,
          reasons,
          remedies: [{ id: billingReadinessRemedyId(reasonCode, context.principal.role) }],
          billingOperation: 'closePeriod',
          values: safeBillingInputValues(object),
        });
      }
      return actionSuccess(
        'action.billing.periodClosed',
        {},
        'Billing period closed and sources locked',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'closePeriod',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  voidInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = voidInvoiceSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure('void', 'voidInvoice', object, parsed.error.flatten().fieldErrors);
    const context = openPortalRepository(locals);
    try {
      context.v3.voidInvoice(
        context.principal,
        parsed.data.invoiceId,
        parsed.data.reason,
        parsed.data.idempotencyKey,
      );
      return actionSuccess('action.billing.invoiceVoided', {}, 'Invoice voided with audit trail');
    } catch (error) {
      return billingActionFailure(
        error,
        'voidInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  restoreCreditNoteState: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure(
        'invoiceId',
        'restoreCreditNoteState',
        object,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.restoreCreditNoteState(context.principal, parsed.data.invoiceId);
      return actionSuccess(
        'action.billing.creditNoteStateRestored',
        {},
        result.restored ? 'Credit note restored to issued state' : 'Credit note is already issued',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'restoreCreditNoteState',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  emailInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing') return actionFail(404, 'action.navigation.wrongSection');
    const object = await formObject(request);
    const context = openPortalRepository(locals);
    try {
      if (!['yes', 'no'].includes(String(object.emailChoice)))
        return billingInputFailure(
          'emailChoice',
          'emailInvoice',
          object,
          { emailChoice: ['Required'] },
          {
            invoiceEmailRecipient: String(object.recipient ?? '').slice(0, 254),
            invoiceEmailId: String(object.invoiceId ?? '').slice(0, 100),
          },
        );
      if (object.emailChoice === 'no')
        return actionSuccess('action.billing.invoiceEmail.declined', {}, 'Email not sent');
      const result = queueInvoiceEmail(context.sqlite, context.principal, {
        invoiceId: String(object.invoiceId ?? ''),
        recipient: String(object.recipient ?? ''),
        emailConfirmed: true,
      });
      return actionSuccess(
        `action.billing.invoiceEmail.${result.status}`,
        {},
        'Invoice email request recorded',
      );
    } catch (error) {
      const failure = billingActionFailure(error, 'emailInvoice', context.principal.role, {
        ...safeBillingInputValues(object),
        recipient: String(object.recipient ?? '').slice(0, 254),
      });
      return fail(failure.status, {
        ...failure.data,
        invoiceEmailRecipient: String(object.recipient ?? '').slice(0, 254),
        invoiceEmailId: String(object.invoiceId ?? ''),
      });
    } finally {
      context.sqlite.close();
    }
  },
  sendInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = sendInvoiceSchema.safeParse(object);
    if (!parsed.success)
      return billingInputFailure('send', 'sendInvoice', object, parsed.error.flatten().fieldErrors);
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.sendInvoice(
        context.principal,
        parsed.data.invoiceId,
        parsed.data.idempotencyKey,
      );
      return actionSuccess(
        result.sent ? 'action.billing.invoiceSent' : 'action.billing.invoiceAlreadySent',
        {},
        result.sent ? 'Invoice marked sent' : 'Invoice was already sent',
      );
    } catch (error) {
      return billingActionFailure(
        error,
        'sendInvoice',
        context.principal.role,
        safeBillingInputValues(object),
      );
    } finally {
      context.sqlite.close();
    }
  },
  createAccountingPack: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'accounting')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const fallback = previousCompleteMonth();
    const suppliedStart = typeof object.periodStart === 'string' ? object.periodStart.trim() : '';
    const suppliedEnd = typeof object.periodEnd === 'string' ? object.periodEnd.trim() : '';
    const values = {
      periodStart: suppliedStart,
      periodEnd: suppliedEnd,
      reportLocale: typeof object.reportLocale === 'string' ? object.reportLocale : '',
      viewportScrollY: retainedScrollPosition(object.viewportScrollY),
    };
    if (
      (suppliedStart !== '' && !isRealIsoDate(suppliedStart)) ||
      (suppliedEnd !== '' && !isRealIsoDate(suppliedEnd))
    )
      return billingInputFailure('accountingPeriod', 'createAccountingPack', values, {
        ...(suppliedStart && !isRealIsoDate(suppliedStart)
          ? { periodStart: ['Invalid date'] }
          : {}),
        ...(suppliedEnd && !isRealIsoDate(suppliedEnd) ? { periodEnd: ['Invalid date'] } : {}),
      });
    const start = suppliedStart || fallback.periodStart;
    const end = suppliedEnd || fallback.periodEnd;
    const parsed = accountingPackPeriodSchema.safeParse({
      ...object,
      periodStart: start,
      periodEnd: end,
    });
    if (!parsed.success)
      return billingInputFailure(
        'accountingPeriod',
        'createAccountingPack',
        values,
        parsed.error.flatten().fieldErrors,
      );
    if (parsed.data.periodStart === parsed.data.periodEnd)
      return billingInputFailure('accountingPeriodShort', 'createAccountingPack', values, {
        periodEnd: ['Choose a later end date.'],
      });
    const context = openPortalRepository(locals);
    try {
      const pack = context.v3.createAccountingPack(
        context.principal,
        parsed.data.periodStart,
        parsed.data.periodEnd,
        parsed.data.reportLocale,
      );
      const refreshedPack = context.v3
        .listAccountingPacks(context.principal)
        .find((candidate) => candidate.id === pack.id);
      const feedback = accountingPackActionFeedback(refreshedPack ?? pack, pack.id);
      return {
        ...actionSuccess(feedback.messageKey, feedback.messageParams, feedback.legacyMessage),
        packId: pack.id,
        packState: refreshedPack?.state ?? pack.state,
        exportStatuses: refreshedPack?.exportStatuses ?? {},
      };
    } catch (error) {
      return billingActionFailure(error, 'createAccountingPack', context.principal.role, values);
    } finally {
      context.sqlite.close();
    }
  },
  finalizeAccountingPack: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'accounting')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const packId = typeof object.packId === 'string' ? object.packId : '';
    const context = openPortalRepository(locals);
    try {
      context.v3.markAccountingPackFinal(context.principal, packId);
      return actionSuccess(
        'action.billing.accountingPackFinalized',
        {},
        'Accounting Pack marked final',
      );
    } catch (error) {
      return billingActionFailure(error, 'finalizeAccountingPack', context.principal.role, {
        packId,
      });
    } finally {
      context.sqlite.close();
    }
  },
  updateInvoiceDraftDetails: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const invoiceId = formData.get('invoiceId')?.toString();
    if (!invoiceId)
      return billingInputFailure('invoiceId', 'updateInvoiceDraftDetails', formData, {
        invoiceId: ['Required'],
      });

    const purchaseNo = formData.get('purchaseNo')?.toString();
    const discountRaw = formData.get('discount')?.toString();
    let discountMinor: string | undefined = undefined;
    if (discountRaw !== undefined && discountRaw !== '') {
      const minor = decimalToMinor(discountRaw);
      if (minor === undefined)
        return billingInputFailure('discount', 'updateInvoiceDraftDetails', formData, {
          discount: ['Invalid amount'],
        });
      discountMinor = minor;
    }

    const termsAndInstructions: Record<string, string> = {};
    if (formData.has('bankSwiftNumber'))
      termsAndInstructions.bankSwiftNumber = formData.get('bankSwiftNumber')!.toString();
    if (formData.has('bankAccountNumber'))
      termsAndInstructions.bankAccountNumber = formData.get('bankAccountNumber')!.toString();
    if (formData.has('bankName'))
      termsAndInstructions.bankName = formData.get('bankName')!.toString();
    if (formData.has('beneficiary'))
      termsAndInstructions.beneficiary = formData.get('beneficiary')!.toString();
    if (formData.has('pastDueNotice'))
      termsAndInstructions.pastDueNotice = formData.get('pastDueNotice')!.toString();

    const companyInfo: Record<string, string> = {};
    if (formData.has('companyName')) companyInfo.name = formData.get('companyName')!.toString();
    if (formData.has('companyDivision'))
      companyInfo.division = formData.get('companyDivision')!.toString();
    if (formData.has('companyPhone')) companyInfo.phone = formData.get('companyPhone')!.toString();
    if (formData.has('companyAddress'))
      companyInfo.address = formData.get('companyAddress')!.toString();
    if (formData.has('companyEmail')) companyInfo.email = formData.get('companyEmail')!.toString();
    if (formData.has('companyWebsite'))
      companyInfo.website = formData.get('companyWebsite')!.toString();

    const context = openPortalRepository(locals);
    try {
      context.repository.updateInvoiceDraftCustomizations(context.principal, invoiceId, {
        purchaseNo,
        termsAndInstructions: Object.keys(termsAndInstructions).length
          ? termsAndInstructions
          : undefined,
        companyInfo: Object.keys(companyInfo).length ? companyInfo : undefined,
        discountMinor,
      });
      return actionSuccess('action.billing.invoiceUpdated', {}, 'Invoice draft details updated');
    } catch (error) {
      return billingActionFailure(
        error,
        'updateInvoiceDraftDetails',
        context.principal.role,
        safeBillingInputValues(formData),
      );
    } finally {
      context.sqlite.close();
    }
  },
};
