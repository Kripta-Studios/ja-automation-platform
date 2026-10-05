import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ValidationError,
  V3AccessDeniedError,
  assertLiveSession,
} from '@ja/database';
import { invoicePdf } from '@ja/reporting';
import type { ProblemData } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import { draftInvoiceTemplateSnapshot } from '$lib/server/invoice-draft-preview';

const definitions = {
  signInRequired: [
    401,
    'SIGN_IN_REQUIRED',
    'Sign in again before downloading this invoice preview.',
  ],
  sessionExpired: [
    401,
    'SESSION_EXPIRED',
    'Your session ended. Sign in again, then retry the preview.',
  ],
  accountDisabled: [
    403,
    'ACCOUNT_DISABLED',
    'Your account is no longer active. Contact the owner for access.',
  ],
  accessDenied: [
    403,
    'ACCESS_DENIED',
    'This role cannot download invoice previews. Ask the owner to review your access.',
  ],
  invoiceUnavailable: [
    404,
    'INVOICE_UNAVAILABLE',
    'This invoice is unavailable. Return to Billing and choose an invoice you can access.',
  ],
  stateUnavailable: [
    409,
    'STATE_UNAVAILABLE',
    'This invoice is now {status}. Draft previews are available only while an invoice is Draft or Approved.',
  ],
  linesMissing: [
    409,
    'LINES_MISSING',
    'This draft has no lines to preview. Review the invoice lines before downloading.',
  ],
  amountInvalid: [
    409,
    'AMOUNT_INVALID',
    'An invoice amount is invalid. Review the invoice amounts before downloading.',
  ],
  subtotalMismatch: [
    409,
    'SUBTOTAL_MISMATCH',
    'The invoice lines no longer match its subtotal. Review the latest draft totals before downloading.',
  ],
  issuerMissing: [
    409,
    'ISSUER_MISSING',
    'This draft has no canonical issuing legal entity for its period. Ask an owner to review the legal entity assignment.',
  ],
  issuerNotEffective: [
    409,
    'ISSUER_NOT_EFFECTIVE',
    'The issuing legal entity is not effective for this project and period. Ask an owner to review the assignment dates.',
  ],
  issuerCoverageGap: [
    409,
    'ISSUER_COVERAGE_GAP',
    'Cannot generate the PDF: issuer {issuerName} does not cover {missingFrom} to {missingTo} for project {projectName}. This invoice covers {periodStart} to {periodEnd}. In Finance → Project issuing authority, add a reviewed issuer assignment in {currency} covering the missing dates, then retry the PDF.',
  ],
  issuerRevisionChange: [
    409,
    'ISSUER_REVISION_CHANGE',
    'Cannot generate the PDF: the issuing company data changes version during {periodStart} to {periodEnd} for project {projectName}. One reviewed version of {issuerName} must cover the whole invoice period. In Finance → Project issuing authority, review the version dates and use separate billing periods when different versions apply.',
  ],
  currencyMismatch: [
    409,
    'CURRENCY_MISMATCH',
    'The issuing legal entity currency differs from this invoice. Ask an owner to review the billing setup.',
  ],
  unavailable: [
    503,
    'UNAVAILABLE',
    'We could not prepare the draft preview. Nothing was changed; retry. Reference: {correlationId}.',
  ],
} as const;

type ProblemName = keyof typeof definitions;

function problemResponse(
  name: ProblemName,
  correlationId: string | undefined,
  options: { params?: ProblemData['params']; role?: string; invoiceId?: string } = {},
): Response {
  const reference = correlationId || randomUUID();
  const [status, suffix, message] = definitions[name];
  const setupProblem = [
    'issuerMissing',
    'issuerNotEffective',
    'issuerCoverageGap',
    'issuerRevisionChange',
    'currencyMismatch',
  ].includes(name);
  const remedy =
    name === 'signInRequired' || name === 'sessionExpired'
      ? { id: 'sign_in_again' }
      : name === 'accountDisabled' || name === 'accessDenied'
        ? { id: 'contact_owner' }
        : name === 'invoiceUnavailable'
          ? { id: 'review_billing' }
          : name === 'unavailable'
            ? { id: 'retry_preview' }
            : setupProblem
              ? options.role === 'owner_admin'
                ? { id: 'review_legal_entity' }
                : { id: 'contact_owner' }
              : { id: 'review_invoice', recordId: options.invoiceId };
  const params = name === 'unavailable' ? { correlationId: reference } : (options.params ?? {});
  const problem: ProblemData = {
    code: `INVOICE_DRAFT_PREVIEW_${suffix}`,
    messageKey: `problem.invoiceDraftPreview.${name}`,
    message: message.replace(/\{([A-Za-z0-9_]+)\}/gu, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`,
    ),
    params,
    fieldErrors: {},
    remedies: [remedy],
    correlationId: reference,
  };
  return new Response(JSON.stringify({ success: false, ...problem }), {
    status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function snapshotProblem(caught: unknown): ProblemName | null {
  if (!(caught instanceof Error)) return null;
  switch (caught.message) {
    case 'Invoice preview amount is invalid':
      return 'amountInvalid';
    case 'Invoice draft lines do not match the subtotal':
      return 'subtotalMismatch';
    case 'A canonical issuing legal-entity revision is required for draft PDF preview':
      return 'issuerMissing';
    case 'The canonical issuing revision is not effective for this project and period':
      return 'issuerNotEffective';
    case 'The canonical issuing currency does not match this invoice':
      return 'currencyMismatch';
    default:
      return null;
  }
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return problemResponse('signInRequired', locals.correlationId);

  let context: ReturnType<typeof openPortalRepository> | null = null;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    // Repository authorization precedes all invoice state facts.
    const invoiceId = params.id ?? '';
    if (!invoiceId) return problemResponse('invoiceUnavailable', locals.correlationId);
    const preview = context.repository.invoicePreview(context.principal, invoiceId);
    const requested = url.searchParams.get('lang')?.trim().toLowerCase();
    const locale = requested === 'es' || requested === 'pt' ? requested : 'en';
    const state = String((preview.invoice as Record<string, unknown>).state ?? '');
    if (state !== 'draft' && state !== 'approved')
      return problemResponse('stateUnavailable', locals.correlationId, {
        params: { status: state || 'Unknown' },
        invoiceId,
      });
    if (!preview.lines.length)
      return problemResponse('linesMissing', locals.correlationId, { invoiceId });
    let snapshot;
    try {
      snapshot = draftInvoiceTemplateSnapshot(preview, locale);
    } catch (caught) {
      const known = snapshotProblem(caught);
      if (!known) throw caught;
      const invoice = preview.invoice as Record<string, unknown>;
      const coverage = invoice.issuer_coverage_issue as
        | { kind?: string; missingFrom?: string; missingTo?: string }
        | undefined;
      const isCoverage = known === 'issuerMissing' || known === 'issuerNotEffective';
      const diagnosticName: ProblemName =
        isCoverage && coverage?.kind === 'gap'
          ? 'issuerCoverageGap'
          : isCoverage && coverage?.kind === 'revision_change'
            ? 'issuerRevisionChange'
            : known;
      return problemResponse(diagnosticName, locals.correlationId, {
        params: {
          periodStart: String(invoice.period_start ?? '—'),
          periodEnd: String(invoice.period_end ?? '—'),
          issuerName: String(invoice.canonical_issuer_name ?? invoice.issuer_name ?? '—'),
          projectName: String(invoice.project_name ?? '—'),
          currency: String(invoice.currency ?? '—'),
          ...(coverage?.kind === 'gap'
            ? { missingFrom: String(coverage.missingFrom), missingTo: String(coverage.missingTo) }
            : {}),
        },
        role: context.principal.role,
        invoiceId,
      });
    }
    const bytes = invoicePdf(snapshot);
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="draft-preview-${invoiceId}-${locale}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError) {
      if (caught.message === 'Live authenticated session required')
        return problemResponse('sessionExpired', locals.correlationId);
      if (caught.message === 'Active account required')
        return problemResponse('accountDisabled', locals.correlationId);
      return problemResponse('accessDenied', locals.correlationId);
    }
    if (caught instanceof ValidationError && caught.message === 'Invoice not found')
      return problemResponse('invoiceUnavailable', locals.correlationId);
    const reference = locals.correlationId || randomUUID();
    console.error('Unexpected invoice draft preview failure', {
      correlationId: reference,
      cause: caught,
    });
    return problemResponse('unavailable', reference);
  } finally {
    context?.sqlite.close();
  }
};
