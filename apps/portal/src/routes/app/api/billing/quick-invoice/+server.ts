import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { AccessDeniedError, V3AccessDeniedError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { billingActionFailure } from '$lib/server/actions/billing-actions';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
  quickInvoiceProjects,
} from '$lib/server/billing-quick-invoice';

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
const createSchema = z
  .object({
    projectId: z.string().min(1).max(200),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    billingRuleId: z.string().min(1).max(200).optional(),
    expectedTotalMinor: z.string().regex(/^\d{1,18}$/u),
    requestKey: z.string().trim().min(8).max(200),
  })
  .strict();

function denied(status: number, code: string, correlationId: string) {
  return json({ success: false, code, correlationId }, { status, headers });
}

function failure(caught: unknown, operation: string, correlationId: string) {
  if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
    return denied(403, 'QUICK_INVOICE_ACCESS_REQUIRED', correlationId);
  try {
    const mapped = billingActionFailure(caught, operation);
    return json(
      { ...(mapped.data as object), success: false, correlationId },
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
    const raw = Object.fromEntries(url.searchParams);
    if (!raw.billingRuleId) delete raw.billingRuleId;
    const parsed = scopeSchema.safeParse(raw);
    if (!parsed.success) return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
    return json(
      { success: true, preview: quickInvoicePreview(context, parsed.data) },
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
  if (raw.length > 10_000) return denied(413, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  }
  const parsed = createSchema.safeParse(value);
  if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart)
    return denied(400, 'QUICK_INVOICE_SELECTION_INVALID', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const result = quickInvoiceCreate(context, parsed.data);
    return json(
      { success: result.ok, ...result },
      { status: result.ok ? 200 : 409, headers },
    );
  } catch (caught) {
    return failure(caught, 'createDraft', correlationId);
  } finally {
    context?.sqlite.close();
  }
};
