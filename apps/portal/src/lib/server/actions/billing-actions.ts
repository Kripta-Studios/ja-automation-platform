import { fail } from '@sveltejs/kit';
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
  ) => ({ status, code, key, message: explanation, remedies: [{ id: remedy }] });
  if (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError) {
    if (/owner (role|administration) required/i.test(message))
      return known(
        403,
        'BILLING_OWNER_REQUIRED',
        'problem.billing.ownerRequired',
        'An owner must perform this billing action. Contact an owner to review the record.',
        'contact_owner',
      );
    if (/finance|billing|auditor/i.test(message))
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
    /idempotency key was already used|idempotency key.*another|IDEMPOTENCY_CONFLICT/i.test(message)
  )
    return known(
      409,
      'BILLING_IDEMPOTENCY_REUSED',
      'problem.billing.idempotencyReused',
      'This request key was already used for different details. Review the existing record before submitting a new request.',
      'review_record',
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
      },
    );
  }
  const mapped = billingProblemFor(error, operation);
  if (mapped)
    return actionFail(mapped.status, mapped.key, {}, mapped.message, {
      code: mapped.code,
      remedies: mapped.remedies,
      billingOperation: operation,
      ...(values ? { values } : {}),
    });
  return actionFailure(error);
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
    const parsed = invoicePlanningDatesInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.invoicePlanningDates',
        {},
        'Invalid invoice planning dates',
        { fields: parsed.error.flatten().fieldErrors },
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
      return billingActionFailure(error, 'setInvoicePlanningDates');
    } finally {
      context.sqlite.close();
    }
  },
  createBillingRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.autoGenerateDraft = object.autoGenerateDraft === 'on';
    object.includeExpenses = object.includeExpenses === 'on';
    const parsed = billingRuleInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.billingStream', {}, 'Invalid billing stream', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createBillingRule(context.principal, parsed.data);
      return actionSuccess('action.billing.streamSaved', {}, 'Billing stream saved');
    } catch (error) {
      return billingActionFailure(error, 'createBillingRule');
    } finally {
      context.sqlite.close();
    }
  },
  createLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = legalEntityInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.legalEntityFields',
        {},
        'Check legal entity fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createLegalEntity(context.principal, parsed.data);
      return actionSuccess('action.billing.legalEntitySaved', {}, 'Legal entity saved');
    } catch (error) {
      return billingActionFailure(error, 'createLegalEntity');
    } finally {
      context.sqlite.close();
    }
  },
  createInvoiceNumberPolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.accountantApprovedAt = normalizeLocalDateTime(object.accountantApprovedAt);
    const parsed = invoiceNumberPolicyInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.invoiceNumberPolicyFields',
        {},
        'Check invoice-number policy fields',
        { fields: parsed.error.flatten().fieldErrors },
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
      return billingActionFailure(error, 'createInvoiceNumberPolicy');
    } finally {
      context.sqlite.close();
    }
  },
  createTaxProfile: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.componentCompound = object.componentCompound === 'on';
    const parsed = taxProfileInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.taxProfileFields', {}, 'Check tax profile fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
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
      return billingActionFailure(error, 'createTaxProfile');
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
      return actionFail(
        400,
        'action.validation.billingRuleIdRequired',
        {},
        'Billing Rule ID required',
      );

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
        return actionFail(
          400,
          'action.validation.fixedAmount',
          {},
          'Fixed amount must be a non-negative exact amount',
        );
      }
    }

    const context = openPortalRepository(locals);
    try {
      context.repository.updateBillingRule(context.principal, id, input);
      return actionSuccess('action.billing.ruleUpdated', {}, 'Billing rule updated');
    } catch (error) {
      return billingActionFailure(error, 'updateBillingRule');
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
      return actionFail(
        400,
        'action.validation.billingRuleIdRequired',
        {},
        'Billing Rule ID required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveBillingRule(context.principal, id);
      return actionSuccess('action.billing.ruleArchived', {}, 'Billing rule archived');
    } catch (error) {
      return billingActionFailure(error, 'archiveBillingRule');
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
      return actionFail(
        400,
        'action.validation.legalEntityIdRequired',
        {},
        'Legal Entity ID required',
      );

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
      return billingActionFailure(error, 'updateLegalEntity');
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
      return actionFail(
        400,
        'action.validation.legalEntityIdRequired',
        {},
        'Legal Entity ID required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveLegalEntity(context.principal, id);
      return actionSuccess('action.billing.legalEntityArchived', {}, 'Legal entity archived');
    } catch (error) {
      return billingActionFailure(error, 'archiveLegalEntity');
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
      return actionFail(
        400,
        'action.validation.taxProfileIdRequired',
        {},
        'Tax Profile ID required',
      );

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();

    const context = openPortalRepository(locals);
    try {
      context.repository.updateTaxProfile(context.principal, id, input);
      return actionSuccess('action.billing.taxProfileUpdated', {}, 'Tax profile updated');
    } catch (error) {
      return billingActionFailure(error, 'updateTaxProfile');
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
      return actionFail(
        400,
        'action.validation.taxProfileIdRequired',
        {},
        'Tax Profile ID required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.archiveTaxProfile(context.principal, id);
      return actionSuccess('action.billing.taxProfileArchived', {}, 'Tax profile archived');
    } catch (error) {
      return billingActionFailure(error, 'archiveTaxProfile');
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
      return actionFail(
        400,
        'action.validation.billingPeriod',
        {},
        'Choose a valid billing stream and period.',
        {
          fields: parsed.error.flatten().fieldErrors,
          billingRuleId: String(object.billingRuleId ?? ''),
          periodStart: String(object.periodStart ?? ''),
          periodEnd: String(object.periodEnd ?? ''),
        },
      );
    const context = openPortalRepository(locals);
    try {
      return createInvoiceDraftResolvingPeriod(context, parsed.data);
    } catch (error) {
      return billingActionFailure(error, 'createDraft');
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
      return actionFail(
        400,
        'action.validation.invoiceAdjustment',
        {},
        'Invalid invoice adjustment',
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
      return billingActionFailure(error, 'createInvoiceAdjustment');
    } finally {
      context.sqlite.close();
    }
  },
  approveInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = invoiceIdSchema.safeParse(await formObject(request));
    if (!parsed.success) return actionFail(400, 'action.validation.invoice', {}, 'Invalid invoice');
    const context = openPortalRepository(locals);
    try {
      context.repository.approveInvoiceDraft(context.principal, parsed.data.invoiceId);
      return actionSuccess('action.billing.invoiceApproved', {}, 'Invoice approved');
    } catch (error) {
      return billingActionFailure(error, 'approveInvoice');
    } finally {
      context.sqlite.close();
    }
  },
  recalculateApprovedInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success) return actionFail(400, 'action.validation.invoice', {}, 'Invalid invoice');
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
      return billingActionFailure(error, 'recalculateApprovedInvoice', context.principal.role);
    } finally {
      context.sqlite.close();
    }
  },
  deleteInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = invoiceIdSchema.safeParse(object);
    if (!parsed.success) return actionFail(400, 'action.validation.invoice', {}, 'Invalid invoice');
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
      return billingActionFailure(error, 'deleteInvoice');
    } finally {
      context.sqlite.close();
    }
  },
  issueInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = invoiceIdSchema.safeParse(await formObject(request));
    if (!parsed.success) return actionFail(400, 'action.validation.invoice', {}, 'Invalid invoice');
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
      return billingActionFailure(error, 'issueInvoice', context.principal.role);
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
      return actionFail(400, 'action.validation.payment', {}, 'Invalid payment', {
        fields: parsed.error.flatten().fieldErrors,
        billingOperation: 'recordPayment',
        values,
      });
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
    object.amountMinor = decimalToMinor(object.amount);
    if (typeof object.effectiveOn === 'string')
      object.effectiveAt = `${object.effectiveOn}T12:00:00.000Z`;
    const parsed = paymentReversalInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.paymentReversal', {}, 'Invalid payment reversal', {
        fields: parsed.error.flatten().fieldErrors,
      });
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
      return billingActionFailure(error, 'reversePayment');
    } finally {
      context.sqlite.close();
    }
  },
  closePeriod: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = billingCloseSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.billingPeriod', {}, 'Invalid billing period');
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
        });
      }
      return actionSuccess(
        'action.billing.periodClosed',
        {},
        'Billing period closed and sources locked',
      );
    } catch (error) {
      return billingActionFailure(error, 'closePeriod');
    } finally {
      context.sqlite.close();
    }
  },
  voidInvoice: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = voidInvoiceSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.invoiceVoid', {}, 'Invalid void request');
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
      return billingActionFailure(error, 'voidInvoice');
    } finally {
      context.sqlite.close();
    }
  },
  restoreCreditNoteState: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'billing')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = invoiceIdSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.invoice', {}, 'Invalid credit note');
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.restoreCreditNoteState(context.principal, parsed.data.invoiceId);
      return actionSuccess(
        'action.billing.creditNoteStateRestored',
        {},
        result.restored ? 'Credit note restored to issued state' : 'Credit note is already issued',
      );
    } catch (error) {
      return billingActionFailure(error, 'restoreCreditNoteState');
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
        return actionFail(
          400,
          'action.validation.invalid',
          {},
          'Choose whether to send the invoice email.',
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
      const failure = billingActionFailure(error, 'emailInvoice');
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
    const parsed = sendInvoiceSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.invoiceSend', {}, 'Invalid send request');
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
      return billingActionFailure(error, 'sendInvoice');
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
    if (
      (suppliedStart !== '' && !isRealIsoDate(suppliedStart)) ||
      (suppliedEnd !== '' && !isRealIsoDate(suppliedEnd))
    )
      return actionFail(
        400,
        'action.validation.accountingPeriod',
        {},
        'Choose valid calendar dates for the accounting period.',
      );
    const start = suppliedStart || fallback.periodStart;
    const end = suppliedEnd || fallback.periodEnd;
    const parsed = accountingPackPeriodSchema.safeParse({
      ...object,
      periodStart: start,
      periodEnd: end,
    });
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.accountingPeriod',
        {},
        'Choose a start date on or before the end date. Empty dates use the previous complete month.',
      );
    if (parsed.data.periodStart === parsed.data.periodEnd)
      return actionFail(
        400,
        'action.validation.accountingPeriod',
        {},
        'Choose an accounting period of at least two calendar dates.',
      );
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
      return billingActionFailure(error, 'createAccountingPack');
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
      return billingActionFailure(error, 'finalizeAccountingPack');
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
      return actionFail(400, 'action.validation.invoiceIdRequired', {}, 'Invoice ID required');

    const purchaseNo = formData.get('purchaseNo')?.toString();
    const discountRaw = formData.get('discount')?.toString();
    let discountMinor: string | undefined = undefined;
    if (discountRaw !== undefined && discountRaw !== '') {
      const minor = decimalToMinor(discountRaw);
      if (minor === undefined)
        return actionFail(400, 'action.validation.invalid', {}, 'Enter a valid discount amount.');
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
      return billingActionFailure(error, 'updateInvoiceDraftDetails');
    } finally {
      context.sqlite.close();
    }
  },
};
