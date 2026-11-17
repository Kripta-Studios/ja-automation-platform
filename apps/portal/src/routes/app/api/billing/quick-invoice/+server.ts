import { CURRENCIES } from '@ja/billing-engine';
import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  AccessDeniedError,
  ConflictError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { billingActionFailure } from '$lib/server/actions/billing-actions';
import { RateSaveError, amountMinor } from '$lib/server/rates-core';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
  quickInvoiceProjects,
} from '$lib/server/billing-quick-invoice';
import {
  quickInvoiceApplyExpenseConditions,
  quickInvoiceCorrectHours,
  quickInvoiceIncludePending,
  quickInvoiceSetTax,
  quickInvoiceWorkerEntries,
  quickInvoiceIssue,
  quickInvoiceSetExpenseTreatment,
  quickInvoiceSetIssuerBank,
  quickInvoiceSetProjectPurchaseOrder,
  quickInvoiceSetRate,
  quickInvoiceSetupBilling,
  quickInvoiceUpdateClient,
} from '$lib/server/billing-quick-invoice-fixes';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const scopeSchema = z
  .object({
    projectId: z.string().min(1).max(200),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    billingRuleId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, { path: ['periodEnd'] });
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u);
const decimal = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/u);
/**
 * "Change for this invoice only". A rate arrives as decimal text (or the minor units the
 * preview echoed), billed hours as decimal hours (or minutes); the server converts them.
 */
const overridesSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            workerId: idSchema,
            category: z.enum(['regular', 'overtime']).nullable().optional(),
            rate: decimal.optional(),
            rateMinor: z.string().regex(/^\d{1,12}$/u).nullable().optional(),
            billedHours: decimal.optional(),
            billedMinutes: z.number().int().min(0).max(10_000_000).nullable().optional(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    tax: z
      .union([
        z.object({ mode: z.literal('profile'), taxProfileId: idSchema }).strict(),
        z.object({ mode: z.literal('exempt') }).strict(),
      ])
      .nullable()
      .optional(),
    purchaseNo: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
type OverridesInput = z.infer<typeof overridesSchema>;

function engineOverrides(value: OverridesInput | undefined | null) {
  if (!value) return null;
  return {
    people: value.people.map((person) => ({
      workerId: person.workerId,
      category: person.category ?? null,
      rateMinor:
        person.rate !== undefined ? amountMinorAllowZero(person.rate) : (person.rateMinor ?? null),
      billedMinutes:
        person.billedHours !== undefined
          ? hoursToMinutes(person.billedHours)
          : (person.billedMinutes ?? null),
    })),
    tax: value.tax ?? null,
    purchaseNo: value.purchaseNo ?? null,
  };
}

function amountMinorAllowZero(text: string): string {
  if (/^0+(?:[.,]0{1,2})?$/u.test(text.trim())) return '0';
  return amountMinor(text).toString();
}

/** Decimal hours (up to 2 decimals) to whole minutes, rounded half up. */
function hoursToMinutes(text: string): number {
  const [whole, fraction = ''] = text.trim().replace(',', '.').split('.');
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Math.floor((hundredths * 60 + 50) / 100);
}

const scopeFields = {
  projectId: z.string().min(1).max(200),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  billingRuleId: z.string().min(1).max(200).optional(),
  overrides: overridesSchema.optional(),
};
const requestKey = z.string().trim().min(8).max(200);
const refSchema = z
  .object({ type: z.enum(['time', 'expense']), id: z.string().min(1).max(200), version: z.number().int().positive() })
  .strict();
const money = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/u);
const createSchema = z
  .object({ ...scopeFields, expectedTotalMinor: z.string().regex(/^\d{1,18}$/u), requestKey })
  .strict();
/** One request per fix; every write re-checks scope server side and returns the new preview. */
const operationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create'), ...scopeFields, expectedTotalMinor: z.string().regex(/^\d{1,18}$/u), requestKey }).strict(),
  z
    .object({
      operation: z.literal('issue'),
      ...scopeFields,
      expectedTotalMinor: z.string().regex(/^\d{1,18}$/u),
      requestKey,
      locale: z.enum(['en', 'es', 'pt']).default('en'),
      purchaseNo: z.string().trim().max(200).optional(),
    })
    .strict(),
  z.object({ operation: z.literal('includePending'), ...scopeFields, sources: z.array(refSchema).min(1).max(1000), requestKey }).strict(),
  z
    .object({
      operation: z.literal('setRate'),
      ...scopeFields,
      kind: z.enum(['client', 'cost', 'pay']),
      alsoCost: z.boolean().optional(),
      workerId: idSchema,
      amount: money,
      effectiveFrom: z.iso.date(),
      scope: z.literal('project').default('project'),
    })
    .strict(),
  z
    .object({
      operation: z.literal('setExpenseTreatment'),
      ...scopeFields,
      source: refSchema,
      treatment: z.enum(['reimbursable', 'all_in', 'non_billable']),
      markupBps: z.number().int().min(0).max(10_000).default(0),
      requestKey,
    })
    .strict(),
  z.object({ operation: z.literal('applyExpenseConditions'), ...scopeFields, source: refSchema, requestKey }).strict(),
  z
    .object({
      operation: z.literal('updateClient'),
      ...scopeFields,
      clientId: idSchema,
      expectedVersion: z.number().int().positive(),
      billingAddress: z.string().trim().min(1).max(500).optional(),
      billingEmail: z.union([z.email().max(254), z.literal('')]).optional(),
      legalName: z.string().trim().min(1).max(300).optional(),
      taxId: z.string().trim().max(64).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('setTax'),
      ...scopeFields,
      scope: z.enum(['invoice', 'fromPeriod']),
      tax: z.union([
        z.object({ profileId: idSchema }).strict(),
        z.object({ name: z.string().trim().min(1).max(160), basisPoints: z.number().int().min(0).max(100_000) }).strict(),
        z.object({ none: z.literal(true) }).strict(),
      ]),
    })
    .strict(),
  z
    .object({
      operation: z.literal('correctHours'),
      ...scopeFields,
      source: refSchema,
      hours: decimal,
      reason: z.string().trim().min(10).max(2000),
      requestKey,
    })
    .strict(),
  z
    .object({
      operation: z.literal('setProjectPurchaseOrder'),
      ...scopeFields,
      expectedVersion: z.number().int().positive(),
      value: z.string().trim().max(200),
    })
    .strict(),
  z
    .object({
      operation: z.literal('setupBilling'),
      ...scopeFields,
      legalEntityId: idSchema,
      tax: z.union([
        z.object({ profileId: idSchema }).strict(),
        z.object({ name: z.string().trim().min(1).max(160), basisPoints: z.number().int().min(0).max(100_000) }).strict(),
        z.object({ none: z.literal(true) }).strict(),
      ]),
      cadence: z.enum(['manual', 'weekly', 'monthly']).default('manual'),
    })
    .strict(),
  z
    .object({
      operation: z.literal('setIssuerBank'),
      ...scopeFields,
      legalEntityId: idSchema,
      currency: z.enum(CURRENCIES),
      expectedVersion: z.number().int().nonnegative(),
      bankName: z.string().trim().min(1).max(300),
      bankAccountNumber: z.string().trim().min(1).max(160),
    })
    .strict(),
]);

function denied(status: number, code: string, correlationId: string) {
  return json({ success: false, code, correlationId }, { status, headers });
}

function failure(caught: unknown, operation: string, correlationId: string) {
  if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
    return denied(403, 'QUICK_INVOICE_ACCESS_REQUIRED', correlationId);
  // Inline fixes show the domain's own explanation (validation/conflict text only).
  const detail =
    caught instanceof ValidationError ||
    caught instanceof ConflictError ||
    caught instanceof V3ValidationError ||
    caught instanceof V3ConflictError
      ? caught.message.slice(0, 300)
      : undefined;
  try {
    const mapped = billingActionFailure(caught, operation);
    return json(
      { ...(mapped.data as object), ...(detail ? { detail } : {}), success: false, correlationId },
      { status: mapped.status, headers },
    );
  } catch {
    console.error('Quick invoice failed', {
      correlationId,
      operation,
      cause: caught instanceof Error ? { name: caught.name, message: caught.message } : 'unknown',
    });
    return denied(500, 'QUICK_INVOICE_UNAVAILABLE', correlationId);
  }
}

export const GET: RequestHandler = ({ locals, url }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session) return denied(401, 'QUICK_INVOICE_SIGN_IN', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    if (!url.searchParams.has('projectId'))
      return json({ success: true, projects: quickInvoiceProjects(context) }, { headers });
    const raw: Record<string, string> = Object.fromEntries(url.searchParams);
    if (!raw.billingRuleId) delete raw.billingRuleId;
    let overrides: ReturnType<typeof engineOverrides> = null;
    if (raw.overrides) {
      if (raw.overrides.length > 20_000) return denied(413, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw.overrides);
      } catch {
        return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
      }
      const checked = overridesSchema.safeParse(decoded);
      if (!checked.success) return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
      overrides = engineOverrides(checked.data);
    }
    const detail = raw.detail;
    const offset = Number(raw.offset ?? 0);
    delete raw.overrides;
    delete raw.detail;
    delete raw.offset;
    const parsed = scopeSchema.safeParse(raw);
    if (!parsed.success) return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
    if (detail) {
      const worker = /^worker:([A-Za-z0-9][A-Za-z0-9_-]{0,199})$/u.exec(detail);
      if (!worker || !Number.isSafeInteger(offset) || offset < 0)
        return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
      return json(
        { success: true, ...quickInvoiceWorkerEntries(context, { ...parsed.data, workerId: worker[1]!, offset }) },
        { headers },
      );
    }
    return json(
      { success: true, preview: quickInvoicePreview(context, { ...parsed.data, overrides }) },
      { headers },
    );
  } catch (caught) {
    return failure(caught, 'quickInvoicePreview', correlationId);
  } finally {
    context?.sqlite.close();
  }
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session) return denied(401, 'QUICK_INVOICE_SIGN_IN', correlationId);
  if (request.headers.get('origin') !== url.origin)
    return denied(403, 'QUICK_INVOICE_ORIGIN', correlationId);
  const raw = await request.text();
  if (raw.length > 200_000) return denied(413, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  }
  // Older clients post the create payload without an operation.
  if (value && typeof value === 'object' && !('operation' in value)) {
    const legacy = createSchema.safeParse(value);
    if (!legacy.success) return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
    value = { operation: 'create', ...legacy.data };
  }
  const parsed = operationSchema.safeParse(value);
  if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart)
    return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  const command = parsed.data;
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    const scope = {
      projectId: command.projectId,
      periodStart: command.periodStart,
      periodEnd: command.periodEnd,
      ...(command.billingRuleId ? { billingRuleId: command.billingRuleId } : {}),
      overrides: engineOverrides(command.overrides),
    };
    context = openPortalRepository(locals);
    if (command.operation === 'create') {
      const result = quickInvoiceCreate(context, { ...scope, expectedTotalMinor: command.expectedTotalMinor, requestKey: command.requestKey });
      return json({ success: result.ok, ...result }, { status: result.ok ? 200 : 409, headers });
    }
    if (command.operation === 'issue') {
      const result = quickInvoiceIssue(context, {
        ...scope,
        expectedTotalMinor: command.expectedTotalMinor,
        requestKey: command.requestKey,
        locale: command.locale,
        ...(command.purchaseNo ? { purchaseNo: command.purchaseNo } : {}),
      });
      return json({ success: result.ok, ...result }, { status: result.ok ? 200 : 409, headers });
    }
    let result: unknown = null;
    switch (command.operation) {
      case 'includePending':
        result = quickInvoiceIncludePending(context, { ...scope, sources: command.sources, requestKey: command.requestKey });
        break;
      case 'setRate':
        result = quickInvoiceSetRate(context, command);
        break;
      case 'setExpenseTreatment':
        result = quickInvoiceSetExpenseTreatment(context, command);
        break;
      case 'applyExpenseConditions':
        result = quickInvoiceApplyExpenseConditions(context, command);
        break;
      case 'updateClient':
        quickInvoiceUpdateClient(context, command);
        break;
      case 'setProjectPurchaseOrder':
        quickInvoiceSetProjectPurchaseOrder(context, command);
        break;
      case 'setupBilling':
        result = quickInvoiceSetupBilling(context, { ...command, effectiveFrom: command.periodStart });
        break;
      case 'setIssuerBank':
        quickInvoiceSetIssuerBank(context, command);
        break;
      case 'setTax':
        result = quickInvoiceSetTax(context, { ...scope, scope: command.scope, tax: command.tax });
        break;
      case 'correctHours':
        result = quickInvoiceCorrectHours(context, {
          ...scope,
          source: command.source,
          minutes: hoursToMinutes(command.hours),
          reason: command.reason,
          requestKey: command.requestKey,
        });
        break;
    }
    // One round trip: the fix and the recalculated preview.
    const preview = quickInvoicePreview(context, command.operation === 'setupBilling' ? { ...scope, billingRuleId: undefined } : scope);
    return json({ success: true, result, preview }, { headers });
  } catch (caught) {
    if (caught instanceof RateSaveError)
      return json(
        { success: false, code: `RATE_${caught.code.toUpperCase()}`, rateCode: caught.code, correlationId },
        { status: caught.code === 'forbidden' ? 403 : 400, headers },
      );
    return failure(caught, command.operation === 'create' ? 'createDraft' : `quickInvoice.${command.operation}`, correlationId);
  } finally {
    context?.sqlite.close();
  }
};
