/**
 * Point-of-need fixes for the one-screen invoice ("Needs attention" checklist).
 *
 * Every fix is an existing audited command (approval lifecycle, dated rates, expense
 * classification, client/project/issuer updates, billing stream creation). This module
 * only checks scope (the project must be visible to the caller, records must belong to
 * it) and translates owner-language inputs into those commands. Money arrives as decimal
 * text and is converted to integer minor units by the rates core; nothing here sums money.
 */
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  ValidationError,
  assertLiveSession,
  type InvoiceCompositionSourceRef,
} from '@ja/database';
import type { openPortalRepository } from './portal-repository';
import { saveRateFromDate } from './rates-core';
import { applyProjectExpenseConditions } from './expense-conditions';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
  type QuickInvoiceInput,
  type QuickInvoicePreview,
} from './billing-quick-invoice';

type Context = ReturnType<typeof openPortalRepository>;

function authorize(context: Context): void {
  assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
    throw new AccessDeniedError('Active Finance or Owner role required');
}

function visibleProject(context: Context, projectId: string): Record<string, unknown> {
  const project = context.repository
    .listFinanceProjects(context.principal)
    .find((row) => String(row.id) === projectId);
  if (!project) throw new AccessDeniedError('Project is not available');
  return project;
}

/** "Approve & include": the records shown in the checklist, on the workers' behalf. */
export function quickInvoiceIncludePending(
  context: Context,
  input: QuickInvoiceInput & { sources: readonly InvoiceCompositionSourceRef[]; requestKey: string },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  return context.repository.approvePendingForInvoice(context.principal, {
    projectId: input.projectId,
    sources: input.sources,
    requestKey: input.requestKey,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
}

export type RateKind = 'client' | 'cost' | 'pay';

/**
 * Save a person's client rate (or internal cost) on this project from the oldest affected
 * work date, so it covers the invoice. Issued periods are never re-priced: the date moves
 * to the day after the last issued invoice and the response says so.
 */
export function quickInvoiceSetRate(
  context: Context,
  input: {
    kind: RateKind;
    projectId: string;
    workerId: string;
    amount: string;
    effectiveFrom: string;
    /** Phase 1 always saves the rate on the project (invoice-only overrides need S6). */
    scope: 'project';
    alsoCost?: boolean;
  },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  const member = context.sqlite
    .prepare('SELECT 1 FROM project_member WHERE project_id=? AND user_id=? LIMIT 1')
    .get(input.projectId, input.workerId);
  if (!member) throw new ValidationError('Worker is not assigned to this project');
  return saveRateFromDate(input.kind, context.sqlite, context.v3, context.principal, {
    projectId: input.projectId,
    workerId: input.workerId,
    amount: input.amount,
    basis: 'hourly',
    effectiveFrom: input.effectiveFrom,
    // Pay missing: the same hourly amount is also the internal cost when that is missing too.
    ...(input.kind === 'pay' && input.alsoCost ? { alsoCost: 'on' } : {}),
  });
}

const TREATMENTS = {
  reimbursable: { clientTreatment: 'reimbursable', billingTreatment: 'reimbursable_at_cost' },
  markup: { clientTreatment: 'reimbursable', billingTreatment: 'reimbursable_plus_markup' },
  all_in: { clientTreatment: 'all_in', billingTreatment: 'all_in' },
  non_billable: { clientTreatment: 'non_billable', billingTreatment: 'internal_non_billable' },
} as const;

/** Reimbursable / All-in / Not charged (+ markup) for one expense, recorded with a reason. */
export function quickInvoiceSetExpenseTreatment(
  context: Context,
  input: {
    projectId: string;
    source: InvoiceCompositionSourceRef;
    treatment: 'reimbursable' | 'all_in' | 'non_billable';
    markupBps: number;
    requestKey: string;
  },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  if (input.source.type !== 'expense') throw new ValidationError('Expense required');
  const row = context.sqlite
    .prepare(
      `SELECT project_id,client_treatment,billing_treatment,markup_bps,tax_amount_minor,
        (SELECT r.tax_bps FROM expense_classification_series s JOIN expense_classification_authority_event a ON a.id=s.current_authority_event_id
           JOIN expense_classification_revision r ON r.id=a.revision_id WHERE s.expense_id=expense.id) tax_bps
         FROM expense WHERE id=?`,
    )
    .get(input.source.id) as Record<string, unknown> | undefined;
  if (!row || row.project_id !== input.projectId)
    throw new AccessDeniedError('Expense is outside the selected project');
  if (row.tax_bps == null && Number(row.tax_amount_minor ?? 0) !== 0)
    throw new ValidationError('Review the existing expense tax classification in Finance first.');
  const markupBps =
    input.treatment === 'reimbursable' ? Math.max(0, Math.min(10_000, Math.trunc(input.markupBps))) : 0;
  const key = input.treatment === 'reimbursable' && markupBps > 0 ? 'markup' : input.treatment;
  const pair = TREATMENTS[key];
  // Projects that require dated expense conditions: when the person has none yet for this
  // kind of expense, the choice is saved as their condition on the project (from the start
  // of the assignment), like a rate. Existing conditions are never rewritten here; a
  // different choice is recorded as an explained override on this expense only.
  const policies = new AssignmentExpensePolicyRepository(context.sqlite);
  const policy = policies.preview(context.principal, input.source.id);
  if (policy.issues.includes('missing_policy')) {
    const expense = context.sqlite
      .prepare(
        `SELECT e.category,e.who_paid,pm.id member_id,pm.starts_on,pm.ends_on FROM expense e
           JOIN project_member pm ON pm.project_id=e.project_id AND pm.user_id=e.worker_id AND pm.status='active'
             AND pm.starts_on<=e.spent_on AND (pm.ends_on IS NULL OR pm.ends_on>=e.spent_on)
          WHERE e.id=? LIMIT 1`,
      )
      .get(input.source.id) as
      | { category: string; who_paid: string; member_id: string; starts_on: string; ends_on: string | null }
      | undefined;
    if (!expense) throw new ValidationError('The worker is not assigned to this project on that date');
    const clientPaid = expense.who_paid === 'client';
    policies.create(context.principal, {
      projectMemberId: expense.member_id,
      payer: (expense.who_paid === 'company' ? 'company_card' : expense.who_paid) as never,
      category: expense.category,
      effectiveFrom: expense.starts_on,
      effectiveTo: expense.ends_on,
      workerReimbursement: expense.who_paid === 'worker' ? 'at_cost' : 'none',
      clientRecovery: clientPaid
        ? 'client_direct'
        : key === 'markup'
          ? 'markup'
          : key === 'reimbursable'
            ? 'at_cost'
            : key === 'all_in'
              ? 'included'
              : 'non_billable',
      markupBps,
      reason: `Set from invoice preparation by ${context.principal.role}`,
    });
  }
  const reason = `Changed from invoice by ${context.principal.role}: ${String(row.billing_treatment ?? '—')} → ${pair.billingTreatment}, markup ${markupBps / 100}%`;
  return context.repository.classifyExpenseCommercially(context.principal, {
    expenseId: input.source.id,
    expectedVersion: input.source.version,
    clientTreatment: pair.clientTreatment,
    billingTreatment: pair.billingTreatment,
    markupBps,
    taxBps: Number(row.tax_bps ?? 0),
    reason,
    idempotencyKey: input.requestKey,
    overrideExpensePolicy: true,
  });
}

export function quickInvoiceApplyExpenseConditions(
  context: Context,
  input: { projectId: string; source: InvoiceCompositionSourceRef; requestKey: string },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  return applyProjectExpenseConditions(context, input);
}

/** Billing address / email / legal name, saved on the client (used by future invoices). */
export function quickInvoiceUpdateClient(
  context: Context,
  input: {
    projectId: string;
    clientId: string;
    expectedVersion: number;
    billingAddress?: string;
    billingEmail?: string;
    legalName?: string;
    taxId?: string;
  },
) {
  authorize(context);
  const project = visibleProject(context, input.projectId);
  if (String(project.client_id) !== input.clientId)
    throw new AccessDeniedError('Client is not the client of this project');
  context.repository.updateClient(
    context.principal,
    input.clientId,
    {
      ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
      ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
    },
    input.expectedVersion,
  );
}

/** PO for the whole project (future invoices). "Only this invoice" travels with create/issue. */
export function quickInvoiceSetProjectPurchaseOrder(
  context: Context,
  input: { projectId: string; expectedVersion: number; value: string },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  context.repository.updateProject(context.principal, {
    projectId: input.projectId,
    version: input.expectedVersion,
    poNumber: input.value.trim() || null,
  });
}

/** Minimal "how to invoice this project" when no billing stream exists yet. */
export function quickInvoiceSetupBilling(
  context: Context,
  input: {
    projectId: string;
    legalEntityId: string;
    tax: { profileId: string } | { name: string; basisPoints: number } | { none: true };
    cadence: 'manual' | 'weekly' | 'monthly';
    effectiveFrom: string;
  },
) {
  authorize(context);
  const project = visibleProject(context, input.projectId);
  const currency = String(project.currency) as 'EUR' | 'USD' | 'BRL';
  const existing = context.repository
    .listBillingRules(context.principal)
    .some((rule) => String(rule.project_id) === input.projectId && Number(rule.enabled) === 1);
  if (existing) throw new ConflictError('This project already has billing set up');
  let taxProfileId: string | undefined;
  if ('profileId' in input.tax) taxProfileId = input.tax.profileId;
  else if ('name' in input.tax)
    taxProfileId = context.repository.createTaxProfile(context.principal, {
      legalEntityId: input.legalEntityId,
      name: input.tax.name,
      currency,
      effectiveFrom: input.effectiveFrom,
      components: [{ name: input.tax.name, basisPoints: input.tax.basisPoints }],
    }).id;
  return context.repository.createBillingRule(context.principal, {
    projectId: input.projectId,
    legalEntityId: input.legalEntityId,
    streamType: 'labor',
    cadenceType: input.cadence,
    currency,
    effectiveFrom: input.effectiveFrom,
    ...(taxProfileId ? { taxProfileId } : {}),
  });
}

/** Bank name + account printed on the invoice (issuer document settings). */
export function quickInvoiceSetIssuerBank(
  context: Context,
  input: {
    projectId: string;
    legalEntityId: string;
    currency: string;
    expectedVersion: number;
    bankName: string;
    bankAccountNumber: string;
  },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  const uses = context.repository
    .listBillingRules(context.principal)
    .some(
      (rule) => String(rule.project_id) === input.projectId && String(rule.legal_entity_id) === input.legalEntityId,
    );
  if (!uses) throw new AccessDeniedError('Issuer is not used by this project');
  context.repository.updateIssuerDocumentSettings(context.principal, {
    legalEntityId: input.legalEntityId,
    currency: input.currency,
    expectedVersion: input.expectedVersion,
    bankName: input.bankName,
    bankAccountNumber: input.bankAccountNumber,
  });
}

export type QuickInvoiceIssueResult =
  | { ok: true; invoiceId: string; number: string | null; totalMinor: string; state: string }
  | {
      ok: false;
      reason: 'amount_changed' | 'not_ready' | 'already_invoiced' | 'issue_failed';
      preview: QuickInvoicePreview;
      invoiceId?: string;
      message?: string;
    };

/**
 * Create (guarded by the amount the user saw) + approve + issue in one request. The draft
 * is committed first; if issuing then fails, the draft stays and the reason is returned.
 * A second attempt for an already issued period gets `already_invoiced`, never a duplicate.
 */
export function quickInvoiceIssue(
  context: Context,
  input: QuickInvoiceInput & {
    expectedTotalMinor: string;
    requestKey: string;
    locale: 'en' | 'es' | 'pt';
    purchaseNo?: string;
  },
): QuickInvoiceIssueResult {
  authorize(context);
  // A PO for this invoice only is an invoice override (engine, frozen at issue).
  const po = input.purchaseNo?.trim();
  const created = quickInvoiceCreate(
    context,
    po && !input.overrides?.purchaseNo ? { ...input, overrides: { ...(input.overrides ?? {}), purchaseNo: po } } : input,
  );
  if (!created.ok) {
    const existing = created.preview.existingInvoice;
    if (created.reason === 'not_ready' && existing && existing.state !== 'draft')
      return { ok: false, reason: 'already_invoiced', preview: created.preview, invoiceId: existing.id };
    return { ok: false, reason: created.reason, preview: created.preview };
  }
  const invoiceId = created.invoiceId;
  try {
    const current = context.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(invoiceId) as
      | { state: string }
      | undefined;
    if (current?.state === 'draft') context.repository.approveInvoiceDraft(context.principal, invoiceId);
    context.repository.issueInvoice(context.principal, invoiceId, input.locale);
  } catch (error) {
    return {
      ok: false,
      reason: 'issue_failed',
      invoiceId,
      message: error instanceof Error ? error.message.slice(0, 300) : 'Issue failed',
      preview: quickInvoicePreview(context, input),
    };
  }
  const saved = context.sqlite
    .prepare('SELECT state,invoice_number,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?')
    .get(invoiceId) as { state: string; invoice_number: string | null; total: string };
  return { ok: true, invoiceId, number: saved.invoice_number, totalMinor: saved.total, state: saved.state };
}

/**
 * Tax of the invoice. "This invoice only" is an invoice override chosen on the screen (a new
 * profile is created here first so it can be picked); "from this period on" changes the
 * billing stream (updated in place, or split when issued invoices already used it).
 */
export function quickInvoiceSetTax(
  context: Context,
  input: QuickInvoiceInput & {
    scope: 'invoice' | 'fromPeriod';
    tax: { profileId: string } | { none: true } | { name: string; basisPoints: number };
  },
) {
  authorize(context);
  const project = visibleProject(context, input.projectId);
  const preview = quickInvoicePreview(context, { ...input, overrides: null });
  const stream = preview.stream;
  if (!stream) throw new ValidationError('Set up billing for this project first');
  const rule = context.sqlite
    .prepare('SELECT legal_entity_id,currency,project_id FROM billing_rule WHERE id=?')
    .get(stream.id) as { legal_entity_id: string; currency: string; project_id: string } | undefined;
  if (!rule || rule.project_id !== input.projectId) throw new AccessDeniedError('Billing stream is outside this project');
  let taxProfileId: string | null = null;
  if ('profileId' in input.tax) taxProfileId = input.tax.profileId;
  else if ('name' in input.tax)
    taxProfileId = context.repository.createTaxProfile(context.principal, {
      legalEntityId: rule.legal_entity_id,
      name: input.tax.name,
      currency: String(project.currency) as 'EUR' | 'USD' | 'BRL',
      effectiveFrom: preview.periodStart,
      components: [{ name: input.tax.name, basisPoints: input.tax.basisPoints }],
    }).id;
  if (input.scope === 'invoice') return { scope: 'invoice' as const, taxProfileId };
  const changed = context.repository.changeBillingStreamTaxProfile(context.principal, {
    ruleId: stream.id,
    taxProfileId,
    effectiveFrom: preview.periodStart,
  });
  return { scope: 'fromPeriod' as const, taxProfileId, ...changed };
}

/** "Fix the worker's record": one audited hour correction (correct + submit + approve). */
export function quickInvoiceCorrectHours(
  context: Context,
  input: QuickInvoiceInput & {
    source: InvoiceCompositionSourceRef;
    minutes: number;
    reason: string;
    requestKey: string;
  },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  return context.repository.correctHoursForInvoice(context.principal, {
    projectId: input.projectId,
    source: input.source,
    minutes: input.minutes,
    reason: input.reason,
    requestKey: input.requestKey,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
}

/** One person's time entries in the invoice scope (at most 50), for per-entry corrections. */
export function quickInvoiceWorkerEntries(
  context: Context,
  input: QuickInvoiceInput & { workerId: string; offset?: number },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  const preview = quickInvoicePreview(context, { ...input, overrides: null });
  if (!preview.stream) return { entries: [], total: 0 };
  const sources = context.repository
    .invoiceCompositionSources(context.principal, {
      projectId: input.projectId,
      billingRuleId: preview.stream.id,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
    })
    .sources.filter((source) => source.type === 'time' && source.workerId === input.workerId && source.containingInvoice === null);
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  return {
    total: sources.length,
    entries: sources.slice(offset, offset + 50).map((source) => ({
      ref: { type: source.type, id: source.id, version: source.version },
      date: source.date,
      minutes: Number(source.minutes ?? 0),
      state: source.approvalState,
      summary: source.summary,
    })),
  };
}
