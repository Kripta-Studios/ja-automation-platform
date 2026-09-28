import { randomUUID } from 'node:crypto';
import {
  AccessDeniedError,
  ValidationError,
  V3AccessDeniedError,
  assertLiveSession,
  recordAuditEvent,
} from '@ja/database';
import { projectFinanceXlsx } from '@ja/reporting';
import type { ProblemData } from '$lib/problem/contract';
import { isRealIsoDate } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { RequestHandler } from './$types';

const financeRoles = new Set(['owner_admin', 'finance_admin']);
type ProblemName = keyof typeof definitions;

const definitions = {
  signInRequired: [
    401,
    'SIGN_IN_REQUIRED',
    "Sign in again before downloading this project's finance export.",
    'sign_in_again',
  ],
  sessionExpired: [
    401,
    'SESSION_EXPIRED',
    'Your session ended. Sign in again, then retry the download.',
    'sign_in_again',
  ],
  accountDisabled: [
    403,
    'ACCOUNT_DISABLED',
    'Your account is no longer active. Contact the owner for access.',
    'contact_owner',
  ],
  financeRoleRequired: [
    403,
    'FINANCE_ROLE_REQUIRED',
    "Only an owner or Finance administrator can download this project's finance export.",
    'contact_owner',
  ],
  projectAccessChanged: [
    403,
    'PROJECT_ACCESS_CHANGED',
    'You can no longer download finance data for this project. Ask the owner to review your access.',
    'contact_owner',
  ],
  periodDateDuplicate: [
    400,
    'PERIOD_DATE_DUPLICATE',
    'A finance period date appears more than once. Keep one start date and one end date.',
    'review_finance_period',
  ],
  periodDateIncomplete: [
    400,
    'PERIOD_DATE_INCOMPLETE',
    'Enter both a start date and an end date for this finance export.',
    'review_finance_period',
  ],
  periodDateInvalid: [
    400,
    'PERIOD_DATE_INVALID',
    'Enter real calendar dates for this finance export.',
    'review_finance_period',
  ],
  periodRangeReversed: [
    400,
    'PERIOD_RANGE_REVERSED',
    'The finance export end date is before the start date. Choose a later end date.',
    'review_finance_period',
  ],
  unavailable: [
    503,
    'UNAVAILABLE',
    'We could not prepare the finance export. Nothing was saved; retry the download. Reference: {correlationId}.',
    'retry_finance_export',
  ],
} as const;

function definition(name: ProblemName) {
  const [status, suffix, message, remedy] = definitions[name];
  return {
    status,
    code: `PROJECT_FINANCE_EXPORT_${suffix}`,
    messageKey: `problem.projectFinanceExport.${name}` as const,
    message,
    remedy,
  };
}

function problemResponse(
  name: ProblemName,
  correlationId?: string,
  fieldErrors: ProblemData['fieldErrors'] = {},
): Response {
  const detail = definition(name);
  const reference = correlationId || randomUUID();
  const problem: ProblemData = {
    code: detail.code,
    messageKey: detail.messageKey,
    message: detail.message.replace('{correlationId}', reference),
    params: name === 'unavailable' ? { correlationId: reference } : {},
    fieldErrors,
    remedies: [{ id: detail.remedy }],
    correlationId: reference,
  };
  return new Response(JSON.stringify({ success: false, ...problem }), {
    status: detail.status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function periodProblem(
  url: URL,
): { name: ProblemName; fieldErrors: ProblemData['fieldErrors'] } | null {
  const startValues = url.searchParams.getAll('periodStart');
  const endValues = url.searchParams.getAll('periodEnd');
  const duplicateFields = [
    ...(startValues.length > 1 ? ['periodStart'] : []),
    ...(endValues.length > 1 ? ['periodEnd'] : []),
  ];
  if (duplicateFields.length) {
    const name = 'periodDateDuplicate';
    return {
      name,
      fieldErrors: Object.fromEntries(
        duplicateFields.map((field) => [field, [definition(name).messageKey]]),
      ),
    };
  }
  const start = startValues[0];
  const end = endValues[0];
  if ((start === undefined) !== (end === undefined)) {
    const name = 'periodDateIncomplete';
    const missing = start === undefined ? 'periodStart' : 'periodEnd';
    return { name, fieldErrors: { [missing]: [definition(name).messageKey] } };
  }
  // An omitted pair retains the existing all-time export behaviour.
  if (start === undefined && end === undefined) return null;
  const invalidFields = [
    ...(!isRealIsoDate(start ?? '') ? ['periodStart'] : []),
    ...(!isRealIsoDate(end ?? '') ? ['periodEnd'] : []),
  ];
  if (invalidFields.length) {
    const name = 'periodDateInvalid';
    return {
      name,
      fieldErrors: Object.fromEntries(
        invalidFields.map((field) => [field, [definition(name).messageKey]]),
      ),
    };
  }
  if (start! > end!) {
    const name = 'periodRangeReversed';
    return { name, fieldErrors: { periodEnd: [definition(name).messageKey] } };
  }
  return null;
}

function safeFilenamePart(value: unknown, fallback: string): string {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return problemResponse('signInRequired', locals.correlationId);

  let context: ReturnType<typeof openPortalRepository> | null = null;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    if (!financeRoles.has(context.principal.role))
      return problemResponse('financeRoleRequired', locals.correlationId);

    const projectId = params.id;
    if (!projectId) return problemResponse('projectAccessChanged', locals.correlationId);
    // Object access is checked before any period guidance. Do not compute an
    // all-time finance projection merely to authorize an invalid request.
    const overview = context.repository.projectOverview(context.principal, projectId, {
      includeFinance: false,
    });
    const invalidPeriod = periodProblem(url);
    if (invalidPeriod)
      return problemResponse(invalidPeriod.name, locals.correlationId, invalidPeriod.fieldErrors);

    const periodStart = url.searchParams.get('periodStart') || undefined;
    const periodEnd = url.searchParams.get('periodEnd') || undefined;
    const financial = context.v3.projectFinance(
      context.principal,
      projectId,
      periodStart,
      periodEnd,
    );
    const project = overview.project;
    const bytes = projectFinanceXlsx({
      project: {
        project_number: String(project.project_number ?? ''),
        project_name: String(project.name ?? ''),
        client_number: String(project.client_number ?? ''),
        client_name: String(project.client_name ?? ''),
        currency: String(project.currency ?? ''),
        period_start: periodStart ?? 'all-time',
        period_end: periodEnd ?? 'all-time',
      },
      financial: financial as unknown as Record<string, unknown>,
      timeEconomics: financial.timeEconomics as readonly Record<string, unknown>[],
      expenseEconomics: financial.expenseEconomics as readonly Record<string, unknown>[],
      invoices: context.repository
        .listInvoices(context.principal)
        .filter((invoice) => String(invoice.project_number) === String(project.project_number)),
      invoiceExpenseLines: context.repository.listProjectInvoiceExpenseLines(
        context.principal,
        projectId,
      ),
      milestones: Array.isArray(overview.milestones)
        ? (overview.milestones as unknown as Record<string, unknown>[])
        : [],
      locale: url.searchParams.get('locale') ?? undefined,
    });
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const number = safeFilenamePart(project.project_number, safeFilenamePart(projectId, 'project'));
    const period = periodStart && periodEnd ? `${periodStart}-${periodEnd}` : 'all-time';
    const filename = `ja-${number}-finance-${period}.xlsx`;
    recordAuditEvent(
      context.sqlite,
      context.principal,
      'artifact.access',
      'document',
      `project-finance:${projectId}:${periodStart ?? 'all-time'}:${periodEnd ?? 'all-time'}`,
      {
        artifactType: 'project_finance',
        outcome: 'authorized',
        projectId,
        format: 'xlsx',
        filename,
        byteLength: bytes.byteLength,
        periodStart: periodStart ?? null,
        periodEnd: periodEnd ?? null,
      },
    );
    return new Response(body, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': String(bytes.byteLength),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError) {
      if (caught.message === 'Live authenticated session required')
        return problemResponse('sessionExpired', locals.correlationId);
      if (caught.message === 'Active account required')
        return problemResponse('accountDisabled', locals.correlationId);
      return problemResponse('projectAccessChanged', locals.correlationId);
    }
    if (caught instanceof ValidationError && caught.message === 'Project not found')
      return problemResponse('projectAccessChanged', locals.correlationId);
    const reference = locals.correlationId || randomUUID();
    console.error('Unexpected project finance export failure', {
      correlationId: reference,
      cause: caught,
    });
    return problemResponse('unavailable', reference);
  } finally {
    context?.sqlite.close();
  }
};
