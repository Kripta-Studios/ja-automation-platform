/**
 * Point-of-need fixes for the one-screen invoice ("Needs attention" checklist).
 *
 * Every fix is an existing audited command (approval lifecycle, dated rates, expense
 * classification, client/project/issuer updates, billing stream creation). This module
 * only checks scope (the project must be visible to the caller, records must belong to
 * it) and translates owner-language inputs into those commands. Money arrives as decimal
 * text and is converted to integer minor units by the rates core; nothing here sums money.
 */
import { exactMoney, impliedRate, type Currency } from '@ja/billing-engine';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  CurrencyConversionError,
  currentCurrencyConversion,
  proposeExchangeRate,
  recordCurrencyConversion,
  ValidationError,
  assertLiveSession,
  recordAuditEvent,
  type InvoiceCompositionSourceRef,
} from '@ja/database';
import type { openPortalRepository } from './portal-repository';
import { saveRateFromDate } from './rates-core';
import { applyProjectExpenseConditions } from './expense-conditions';
import { exactExpenseConversion, type ExpenseConversionEntry } from './expense-conversion';
import {
  expenseStreamGap,
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
    /**
     * Client rate only: 'project' saves the project's rate (everyone without a personal rate,
     * shown on Rates as "Project rate"); 'person' saves this person's rate on the project.
     */
    appliesTo?: 'project' | 'person';
  },
) {
  authorize(context);
  visibleProject(context, input.projectId);
  const member = context.sqlite
    .prepare('SELECT 1 FROM project_member WHERE project_id=? AND user_id=? LIMIT 1')
    .get(input.projectId, input.workerId);
  if (!member) throw new ValidationError('Worker is not assigned to this project');
  const projectRate = input.kind === 'client' && input.appliesTo === 'project';
  return saveRateFromDate(input.kind, context.sqlite, context.v3, context.principal, {
    projectId: input.projectId,
    ...(projectRate ? {} : { workerId: input.workerId }),
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

/**
 * One conversion for a foreign-currency expense, shared by billing and worker reimbursement:
 * the audited `currency_conversion` row (Money → Currency conversions). A value typed on New
 * invoice is recorded there (superseding a different earlier one); with nothing typed, the
 * confirmed conversion is used as is.
 */
/** The classification audit keeps a short rate text; the exact rate stays on the conversion row. */
const shortRate = (rate: string | null | undefined) => (rate && /^\d{1,6}(?:\.\d{1,8})?$/u.test(rate) ? rate : null);

function confirmedExpenseConversion(
  context: Context,
  input: {
    expenseId: string;
    sourceCurrency: string;
    sourceAmountMinor: number;
    targetCurrency: string;
    entry: ExpenseConversionEntry | null;
    requestKey: string;
  },
) {
  const current = currentCurrencyConversion(context.sqlite, 'expense', input.expenseId, input.targetCurrency);
  const usable = current && current.sourceAmountMinor === String(input.sourceAmountMinor) ? current : null;
  const typed =
    input.entry && (input.entry.rate?.trim() || input.entry.convertedAmount?.trim())
      ? exactExpenseConversion(input.sourceAmountMinor, input.sourceCurrency, input.targetCurrency, input.entry)
      : null;
  if (!typed) {
    if (!usable)
      throw new ValidationError(`Enter the ${input.targetCurrency} amount or the exchange rate for this expense`);
    return { projectCurrencyAmountMinor: Number(usable.targetAmountMinor), rate: shortRate(usable.rate), rateBps: null };
  }
  if (usable && Number(usable.targetAmountMinor) === typed.projectCurrencyAmountMinor && (!typed.rate || typed.rate === usable.rate))
    return { projectCurrencyAmountMinor: typed.projectCurrencyAmountMinor, rate: shortRate(usable.rate), rateBps: typed.rateBps };
  const source = input.sourceCurrency as Currency;
  const target = input.targetCurrency as Currency;
  const rate =
    typed.rate ??
    impliedRate(exactMoney(source, BigInt(input.sourceAmountMinor)), exactMoney(target, BigInt(typed.projectCurrencyAmountMinor)));
  const spentOn = (context.sqlite.prepare('SELECT spent_on FROM expense WHERE id=?').get(input.expenseId) as { spent_on: string })
    .spent_on;
  const proposal = proposeExchangeRate(context.sqlite, source, target, spentOn);
  try {
    const record = recordCurrencyConversion(context.sqlite, context.principal, {
      sourceKind: 'expense',
      sourceId: input.expenseId,
      targetCurrency: target,
      rate,
      rateSource: typed.rate && proposal?.rate === typed.rate ? 'ECB' : 'manual',
      targetAmountMinor: typed.rate ? null : BigInt(typed.projectCurrencyAmountMinor),
      note: 'Entered on New invoice',
      idempotencyKey: `quick-invoice-conversion:${input.requestKey}`,
      expectedCurrentId: current?.id ?? null,
    });
    return { projectCurrencyAmountMinor: Number(record.targetAmountMinor), rate: shortRate(record.rate), rateBps: typed.rateBps };
  } catch (caught) {
    if (caught instanceof CurrencyConversionError) {
      if (caught.code === 'access_denied') throw new AccessDeniedError(caught.message);
      if (caught.code === 'invalid') throw new ValidationError(caught.message);
      throw new ConflictError(caught.message);
    }
    throw caught;
  }
}

/** Reimbursable / All-in / Not charged (+ markup) for one expense, recorded with a reason. */
export function quickInvoiceSetExpenseTreatment(
  context: Context,
  input: {
    projectId: string;
    source: InvoiceCompositionSourceRef;
    treatment: 'reimbursable' | 'all_in' | 'non_billable';
    markupBps: number;
    requestKey: string;
    /** Foreign-currency expense: the exact rate or converted amount the owner entered. */
    conversion?: ExpenseConversionEntry | null;
  },
) {
  authorize(context);
  // One write lock for the conversion, the expense condition and the classification: a later
  // failure never leaves a recorded conversion without the treatment it was entered with.
  const sqlite = context.sqlite;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = setExpenseTreatmentLocked(context, input);
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      /* keep the original error */
    }
    throw error;
  }
}

function setExpenseTreatmentLocked(
  context: Context,
  input: Parameters<typeof quickInvoiceSetExpenseTreatment>[1],
) {
  const project = visibleProject(context, input.projectId);
  if (input.source.type !== 'expense') throw new ValidationError('Expense required');
  const row = context.sqlite
    .prepare(
      `SELECT project_id,worker_id,approval_state,currency,amount_minor,client_treatment,billing_treatment,markup_bps,tax_amount_minor,version,
        (SELECT r.tax_bps FROM expense_classification_series s JOIN expense_classification_authority_event a ON a.id=s.current_authority_event_id
           JOIN expense_classification_revision r ON r.id=a.revision_id WHERE s.expense_id=expense.id) tax_bps
         FROM expense WHERE id=?`,
    )
    .get(input.source.id) as Record<string, unknown> | undefined;
  if (!row || row.project_id !== input.projectId)
    throw new AccessDeniedError('Expense is outside the selected project');
  // A draft or an expense returned for changes still belongs to the worker: it is not on the
  // invoice and is not classified from here. Only the owner's own drafts (he may "Approve &
  // include" them in one step) are the exception.
  if (
    ['draft', 'needs_changes'].includes(String(row.approval_state)) &&
    !(context.principal.role === 'owner_admin' && String(row.worker_id) === context.principal.userId)
  )
    throw new ValidationError('This expense was not sent by the worker yet; it is not on this invoice.');
  if (row.tax_bps == null && Number(row.tax_amount_minor ?? 0) !== 0)
    throw new ValidationError('Review the existing expense tax classification in Finance first.');
  const foreign = String(row.currency) !== String(project.currency);
  const conversion = foreign
    ? confirmedExpenseConversion(context, {
        expenseId: input.source.id,
        sourceCurrency: String(row.currency),
        sourceAmountMinor: Number(row.amount_minor),
        targetCurrency: String(project.currency),
        entry: input.conversion ?? null,
        requestKey: input.requestKey,
      })
    : null;
  const markupBps =
    input.treatment === 'reimbursable' ? Math.max(0, Math.min(10_000, Math.trunc(input.markupBps))) : 0;
  const key = input.treatment === 'reimbursable' && markupBps > 0 ? 'markup' : input.treatment;
  const pair = TREATMENTS[key];
  // Projects that require dated expense conditions: when the person has none yet for this
  // kind of expense, the choice is saved as their condition on the project, from the earliest
  // un-invoiced expense it affects (never over expenses already billed or reimbursed), like a
  // rate. Existing conditions are never rewritten here; a different choice is recorded as an
  // explained override on this expense only.
  const policies = new AssignmentExpensePolicyRepository(context.sqlite);
  const policy = policies.preview(context.principal, input.source.id);
  if (policy.issues.includes('missing_policy')) {
    const window = expensePolicyWindow(context, input.source.id);
    policies.create(context.principal, {
      projectMemberId: window.memberId,
      payer: window.payer as never,
      category: window.category,
      effectiveFrom: window.effectiveFrom,
      effectiveTo: window.effectiveTo,
      workerReimbursement: window.payer === 'worker' ? 'at_cost' : 'none',
      clientRecovery:
        window.payer === 'client'
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
  const reason = `Changed from invoice by ${context.principal.role}: ${String(row.billing_treatment ?? '—')} → ${pair.billingTreatment}, markup ${markupBps / 100}%${
    conversion
      ? `; converted ${String(row.currency)}→${String(project.currency)} ${conversion.rate ? `at ${conversion.rate}` : 'by entered amount'} = ${conversion.projectCurrencyAmountMinor} minor`
      : ''
  }`;
  // Recording a changed conversion re-projects a classified expense (version + 1). When the
  // owner reviewed the current version, classify the version this same transaction produced;
  // otherwise keep the reviewed version so a real concurrent edit (or a replay) is detected.
  const reviewedCurrent = Number(row.version) === input.source.version;
  const expectedVersion = reviewedCurrent
    ? Number(
        (context.sqlite.prepare('SELECT version FROM expense WHERE id=?').get(input.source.id) as { version: number })
          .version,
      )
    : input.source.version;
  return context.repository.classifyExpenseCommercially(context.principal, {
    expenseId: input.source.id,
    expectedVersion,
    clientTreatment: pair.clientTreatment,
    billingTreatment: pair.billingTreatment,
    markupBps,
    taxBps: Number(row.tax_bps ?? 0),
    reason,
    idempotencyKey: input.requestKey,
    overrideExpensePolicy: true,
    conversion,
  });
}

const addDays = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The dated window for a new expense condition (person × payer × category) that must cover
 * one unclassified expense: it starts at the earliest un-invoiced expense of that kind (not
 * before the assignment, a previous condition or an expense already billed on an issued
 * invoice or reimbursed) and ends before the next condition / locked expense, if any. Labor
 * invoices do not matter: they never billed these expenses.
 */
export function expensePolicyWindow(context: Context, expenseId: string) {
  const expense = context.sqlite
    .prepare(
      `SELECT e.project_id,e.worker_id,e.spent_on,e.category,
              CASE e.who_paid WHEN 'company' THEN 'company_direct' ELSE e.who_paid END payer,
              pm.id member_id,pm.starts_on,pm.ends_on FROM expense e
         JOIN project_member pm ON pm.project_id=e.project_id AND pm.user_id=e.worker_id AND pm.status='active'
           AND pm.starts_on<=e.spent_on AND (pm.ends_on IS NULL OR pm.ends_on>=e.spent_on)
        WHERE e.id=? LIMIT 1`,
    )
    .get(expenseId) as
    | {
        project_id: string;
        worker_id: string;
        spent_on: string;
        category: string;
        payer: string;
        member_id: string;
        starts_on: string;
        ends_on: string | null;
      }
    | undefined;
  if (!expense) throw new ValidationError('The worker is not assigned to this project on that date');
  const sameKind = `e.project_id=? AND e.worker_id=? AND e.category=?
      AND (CASE e.who_paid WHEN 'company' THEN 'company_direct' ELSE e.who_paid END)=?`;
  const kindArgs = [expense.project_id, expense.worker_id, expense.category, expense.payer];
  const locked = `(EXISTS(SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
        WHERE s.source_type='expense' AND s.source_id=e.id AND i.state NOT IN ('draft','void','cancelled','superseded'))
      OR e.reimbursed_at IS NOT NULL OR e.reimbursement_state='reimbursed')`;
  const one = (sql: string, ...args: Array<string | null>) =>
    (context.sqlite.prepare(sql).get(...args) as { d: string | null } | undefined)?.d ?? null;
  const lockedBefore = one(
    `SELECT MAX(e.spent_on) d FROM expense e WHERE ${sameKind} AND e.spent_on<? AND ${locked}`,
    ...kindArgs,
    expense.spent_on,
  );
  const lockedAfter = one(
    `SELECT MIN(e.spent_on) d FROM expense e WHERE ${sameKind} AND e.spent_on>? AND ${locked}`,
    ...kindArgs,
    expense.spent_on,
  );
  const policyBefore = one(
    `SELECT MAX(effective_to) d FROM assignment_expense_policy WHERE project_member_id=? AND payer=?
       AND COALESCE(category,'')=? AND effective_to IS NOT NULL AND effective_to<?`,
    expense.member_id,
    expense.payer,
    expense.category,
    expense.spent_on,
  );
  const policyAfter = one(
    `SELECT MIN(effective_from) d FROM assignment_expense_policy WHERE project_member_id=? AND payer=?
       AND COALESCE(category,'')=? AND effective_from>?`,
    expense.member_id,
    expense.payer,
    expense.category,
    expense.spent_on,
  );
  const floor = [expense.starts_on, lockedBefore && addDays(lockedBefore, 1), policyBefore && addDays(policyBefore, 1)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;
  const effectiveFrom =
    one(
      `SELECT MIN(e.spent_on) d FROM expense e WHERE ${sameKind} AND e.spent_on>=? AND e.spent_on<=? AND NOT ${locked}`,
      ...kindArgs,
      floor,
      expense.spent_on,
    ) ?? expense.spent_on;
  const ceilings = [expense.ends_on, lockedAfter && addDays(lockedAfter, -1), policyAfter && addDays(policyAfter, -1)]
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    memberId: expense.member_id,
    payer: expense.payer,
    category: expense.category,
    effectiveFrom,
    effectiveTo: ceilings[0] ?? null,
  };
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
  const currency = String(project.currency) as Currency;
  const existing = context.repository
    .listBillingRules(context.principal)
    .some((rule) => String(rule.project_id) === input.projectId && Number(rule.enabled) === 1);
  if (existing) throw new ConflictError('This project already has billing set up');
  // The stream covers the oldest work no invoice holds yet, so nothing logged before the
  // chosen dates is left without billing terms.
  const oldestOpen = (
    context.sqlite
      .prepare(
        `SELECT MIN(d) d FROM (
           SELECT MIN(work_date) d FROM time_entry t WHERE t.project_id=? AND t.invoice_id IS NULL
             AND t.approval_state IN ('draft','submitted','needs_changes','approved','locked')
           UNION ALL
           SELECT MIN(spent_on) d FROM expense e WHERE e.project_id=? AND e.invoice_id IS NULL
             AND e.approval_state IN ('draft','submitted','needs_changes','approved'))`,
      )
      .get(input.projectId, input.projectId) as { d: string | null }
  ).d;
  const effectiveFrom = oldestOpen && oldestOpen < input.effectiveFrom ? oldestOpen : input.effectiveFrom;
  let taxProfileId: string | undefined;
  if ('profileId' in input.tax) taxProfileId = input.tax.profileId;
  else if ('name' in input.tax)
    taxProfileId = context.repository.createTaxProfile(context.principal, {
      legalEntityId: input.legalEntityId,
      name: input.tax.name,
      currency,
      effectiveFrom,
      components: [{ name: input.tax.name, basisPoints: input.tax.basisPoints }],
    }).id;
  const rule = context.repository.createBillingRule(context.principal, {
    projectId: input.projectId,
    legalEntityId: input.legalEntityId,
    streamType: 'labor',
    cadenceType: input.cadence,
    currency,
    effectiveFrom,
    ...(taxProfileId ? { taxProfileId } : {}),
  });
  // The same choice is the project's issuing company, so New invoice can issue right away.
  const issuer = ensureProjectIssuer(context, input.projectId, input.legalEntityId, currency, false);
  return { ...rule, issuerAssigned: issuer.assigned };
}

/**
 * "Set up expense invoicing" on a labor-only project: one separate expense stream with the
 * labor stream's terms (issuer, tax, cadence, payment terms, contact), backdated to the earliest
 * expense no stream bills yet and never inside dates an expense invoice already covers. The
 * labor stream stays exactly as it is. Returns the new stream so New invoice can switch to it.
 */
export function quickInvoiceSetupExpenseBilling(context: Context, input: { projectId: string }) {
  authorize(context);
  const project = visibleProject(context, input.projectId);
  const sqlite = context.sqlite;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    // Recomputed inside the write lock: a second click (or another tab) finds nothing to do.
    const gap = expenseStreamGap(context, input.projectId);
    if (!gap) throw new ConflictError('Expense invoicing is already set up for this project');
    const labor = sqlite.prepare('SELECT * FROM billing_rule WHERE id=?').get(gap.laborRuleId) as
      | Record<string, unknown>
      | undefined;
    if (!labor || !labor.legal_entity_id) throw new ValidationError('Set up how to invoice this project first');
    const optional = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : String(value));
    const created = context.repository.createBillingRule(context.principal, {
      projectId: input.projectId,
      legalEntityId: String(labor.legal_entity_id),
      streamType: 'expense',
      cadenceType: String(labor.cadence_type),
      currency: String(project.currency) as Currency,
      effectiveFrom: gap.effectiveFrom,
      templateId: 'expenses-detailed',
      anchorDate: optional(labor.anchor_date),
      taxProfileId: optional(labor.tax_profile_id),
      recipientEmail: optional(labor.recipient_email),
      billingContactId: optional(labor.billing_contact_id),
      poNumberOverride: optional(labor.po_number_override),
      semiMonthlyRule: optional(labor.semi_monthly_rule),
      groupingMode: optional(labor.grouping_mode),
      ...(labor.payment_terms_days !== null && labor.payment_terms_days !== undefined
        ? { paymentTermsDays: Number(labor.payment_terms_days) }
        : {}),
      ...(labor.monthly_cutoff_day ? { monthlyCutoffDay: Number(labor.monthly_cutoff_day) } : {}),
    });
    // createBillingRule writes the audited 'billing_rule.create' event (stream + start date).
    sqlite.exec('COMMIT');
    return { billingRuleId: created.id, effectiveFrom: gap.effectiveFrom };
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      /* keep the original error */
    }
    throw error;
  }
}

/**
 * Make `legalEntityId` the project's issuing company (canonical assignment), from the start
 * of that company's current record, unless the project already has one. Without a complete
 * company record nothing is assigned (`strict` throws instead).
 */
export function ensureProjectIssuer(
  context: Context,
  projectId: string,
  legalEntityId: string,
  currency: string,
  strict: boolean,
): { assigned: boolean } {
  const revision = context.sqlite
    .prepare(
      `SELECT r.revision_id,r.effective_from FROM legal_entity_revision_bridge b
         JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
        WHERE b.legacy_legal_entity_id=? AND r.base_currency=? AND r.effective_to IS NULL
        ORDER BY r.effective_from DESC,r.revision_number DESC LIMIT 1`,
    )
    .get(legalEntityId, currency) as { revision_id: string; effective_from: string } | undefined;
  if (!revision) {
    if (strict)
      throw new ValidationError(
        'This issuing company has no complete company record yet. Complete it in Money → Issuing companies.',
      );
    return { assigned: false };
  }
  const open = context.sqlite
    .prepare(
      `SELECT legal_entity_revision_id,effective_from FROM effective_project_legal_entity_assignment
        WHERE project_id=? AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1`,
    )
    .get(projectId) as { legal_entity_revision_id: string; effective_from: string } | undefined;
  if (open) {
    if (open.legal_entity_revision_id === revision.revision_id) return { assigned: false };
    if (strict)
      throw new ConflictError(
        'This project already has another issuing company. Change it in Project → Rates, pay and invoicing.',
      );
    return { assigned: false };
  }
  const lastEnd = (
    context.sqlite
      .prepare('SELECT MAX(effective_to) d FROM effective_project_legal_entity_assignment WHERE project_id=?')
      .get(projectId) as { d: string | null }
  ).d;
  const effectiveFrom = [revision.effective_from, lastEnd ? addDays(lastEnd, 1) : '']
    .sort()
    .at(-1)!;
  context.v3.assignCanonicalLegalEntityToProject(context.principal, {
    projectId,
    legalEntityRevisionId: revision.revision_id,
    effectiveFrom,
    reason: `Issuing company set from New invoice by ${context.principal.role}`,
    idempotencyKey: `quick-invoice-issuer:${projectId}:${revision.revision_id}:${effectiveFrom}`,
  });
  return { assigned: true };
}

/** "Issuing company" picker on New invoice for a project that has billing but no issuer. */
export function quickInvoiceSetIssuer(context: Context, input: { projectId: string; legalEntityId: string }) {
  authorize(context);
  const project = visibleProject(context, input.projectId);
  const currency = String(project.currency);
  const entity = context.sqlite
    .prepare(`SELECT currency,status FROM legal_entity WHERE id=?`)
    .get(input.legalEntityId) as { currency: string; status: string } | undefined;
  if (!entity || entity.status !== 'active' || entity.currency !== currency)
    throw new ValidationError('Choose an issuing company in the project currency');
  return ensureProjectIssuer(context, input.projectId, input.legalEntityId, currency, true);
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
  | {
      ok: true;
      invoiceId: string;
      number: string | null;
      totalMinor: string;
      state: string;
      /** Split by PO: every invoice issued in this action. */
      invoices?: Array<{ invoiceId: string; number: string | null; totalMinor: string; purchaseNo: string | null }>;
    }
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
    expectedSplit?: string | null;
    replacesInvoiceId?: string | null;
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
  const ids = created.invoiceIds ?? [created.invoiceId];
  if (input.replacesInvoiceId) linkReplacement(context, input.projectId, ids[0]!, input.replacesInvoiceId);
  for (const invoiceId of ids) {
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
  }
  const read = context.sqlite.prepare(
    'SELECT state,invoice_number,CAST(total_minor AS TEXT) total,snapshot_json FROM invoice WHERE id=?',
  );
  const invoices = ids.map((invoiceId) => {
    const row = read.get(invoiceId) as { state: string; invoice_number: string | null; total: string; snapshot_json: string | null };
    let purchaseNo: string | null = null;
    try {
      const snapshot = JSON.parse(row.snapshot_json ?? '{}') as { purchaseNo?: unknown; purchase_no?: unknown };
      const value = snapshot.purchaseNo ?? snapshot.purchase_no;
      purchaseNo = typeof value === 'string' && value !== '—' ? value : null;
    } catch {
      purchaseNo = null;
    }
    return { invoiceId, number: row.invoice_number, totalMinor: row.total, state: row.state, purchaseNo };
  });
  const first = invoices[0]!;
  return {
    ok: true,
    invoiceId: first.invoiceId,
    number: first.number,
    totalMinor: created.totalMinor,
    state: first.state,
    ...(ids.length > 1 ? { invoices: invoices.map(({ state: _state, ...rest }) => rest) } : {}),
  };
}

/**
 * "Create replacement invoice" after a void: the new invoice records which voided invoice it
 * replaces (append-only link + audit). Only a void invoice of the same project qualifies.
 */
export function linkReplacement(
  context: Context,
  projectId: string,
  replacementInvoiceId: string,
  voidedInvoiceId: string,
): void {
  const voided = context.sqlite
    .prepare('SELECT project_id,state,invoice_number FROM invoice WHERE id=?')
    .get(voidedInvoiceId) as { project_id: string; state: string; invoice_number: string | null } | undefined;
  if (!voided || voided.project_id !== projectId || voided.state !== 'void') return;
  const table = context.sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_replacement_link'")
    .get();
  if (!table) return;
  context.sqlite.exec('SAVEPOINT invoice_replacement_link');
  try {
    const inserted = context.sqlite
      .prepare(
        `INSERT OR IGNORE INTO invoice_replacement_link(replacement_invoice_id,voided_invoice_id,project_id,created_by,created_at)
         VALUES(?,?,?,?,?)`,
      )
      .run(replacementInvoiceId, voidedInvoiceId, projectId, context.principal.userId, new Date().toISOString());
    if (inserted.changes === 1)
      recordAuditEvent(context.sqlite, context.principal, 'invoice.replacement_link', 'invoice', replacementInvoiceId, {
        projectId,
        replacesInvoiceId: voidedInvoiceId,
        replacesInvoiceNumber: voided.invoice_number,
      });
    context.sqlite.exec('RELEASE invoice_replacement_link');
  } catch (error) {
    context.sqlite.exec('ROLLBACK TO invoice_replacement_link');
    context.sqlite.exec('RELEASE invoice_replacement_link');
    throw error;
  }
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
      currency: String(project.currency) as Currency,
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
