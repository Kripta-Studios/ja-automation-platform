import { randomUUID } from 'node:crypto';
import { AccessDeniedError, V3AccessDeniedError, assertLiveSession } from '@ja/database';
import { expenseRegisterExport } from '@ja/reporting';
import type { ProblemData } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import { isRealIsoDate } from '$lib/server/iso-date';
import { expenseReceiptState, expenseSearchMatches } from '$lib/portal/expense-evidence';
import type { RequestHandler } from './$types';

type ProblemName = keyof typeof definitions;
type Definition = Readonly<{
  status: number;
  code: string;
  messageKey: ProblemData['messageKey'];
  message: string;
  remedy: string;
}>;

const definitions = {
  signInRequired: [
    401,
    'SIGN_IN_REQUIRED',
    'Sign in again before downloading expenses.',
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
  workerScopeDenied: [
    403,
    'WORKER_SCOPE_DENIED',
    'You can export only your own expenses. Choose your own records and retry.',
    'review_own_expenses',
  ],
  reimbursementScopeDenied: [
    403,
    'REIMBURSEMENT_SCOPE_DENIED',
    'This role cannot filter expenses by reimbursement status. Remove that filter and retry.',
    'review_expense_filters',
  ],
  accessDenied: [
    403,
    'ACCESS_DENIED',
    'You cannot download these expenses. Review your access with the owner.',
    'contact_owner',
  ],
  dateInvalid: [
    400,
    'DATE_INVALID',
    'Enter real start and end dates before downloading expenses.',
    'review_expense_filters',
  ],
  dateOrderInvalid: [
    400,
    'DATE_ORDER_INVALID',
    'The end date is before the start date. Choose an end date on or after the start.',
    'review_expense_filters',
  ],
  formatInvalid: [
    400,
    'FORMAT_INVALID',
    'Choose PDF, Excel, or CSV for this download.',
    'review_expense_filters',
  ],
  receiptInvalid: [
    400,
    'RECEIPT_INVALID',
    'Choose a listed receipt evidence filter.',
    'review_expense_filters',
  ],
  filterTooLong: [
    400,
    'FILTER_TOO_LONG',
    'A filter exceeds 500 characters. Shorten it and retry.',
    'review_expense_filters',
  ],
  filterDuplicate: [
    400,
    'FILTER_DUPLICATE',
    'A download filter was supplied more than once. Keep one value per filter and retry.',
    'review_expense_filters',
  ],
  currencyInvalid: [
    400,
    'CURRENCY_INVALID',
    'Choose USD, EUR, or BRL for the currency filter.',
    'review_expense_filters',
  ],
  statusInvalid: [
    400,
    'STATUS_INVALID',
    'Choose a listed expense status.',
    'review_expense_filters',
  ],
  reimbursementInvalid: [
    400,
    'REIMBURSEMENT_INVALID',
    'Choose a supported reimbursement status.',
    'review_expense_filters',
  ],
  unavailable: [
    503,
    'UNAVAILABLE',
    'We could not prepare the export. Nothing was saved; retry the download. Reference: {correlationId}.',
    'retry_expense_export',
  ],
} as const;

const filterNames = [
  'from',
  'to',
  'format',
  'project',
  'worker',
  'client',
  'category',
  'currency',
  'status',
  'reimbursement',
  'receipt',
  'q',
] as const;

function definition(name: ProblemName): Definition {
  const [status, suffix, message, remedy] = definitions[name];
  return {
    status,
    code: `EXPENSE_EXPORT_${suffix}`,
    messageKey: `problem.expenseExport.${name}`,
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

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session)
    return problemResponse('signInRequired', locals.correlationId);

  let ctx: ReturnType<typeof openPortalRepository> | null = null;
  try {
    ctx = openPortalRepository(locals);
    // Malformed links must not reveal filter guidance before live authorization.
    assertLiveSession(ctx.sqlite, ctx.principal, AccessDeniedError);
    const role = ctx.principal.role;
    const userId = ctx.principal.userId;
    const project = url.searchParams.get('project') ?? '';
    const workers = url.searchParams.getAll('worker');
    const reimbursements = url.searchParams.getAll('reimbursement');
    if (role === 'worker' && workers.some((value) => value && value !== userId))
      return problemResponse('workerScopeDenied', locals.correlationId, {
        worker: [definition('workerScopeDenied').messageKey],
      });
    if (role === 'project_manager' && reimbursements.some((value) => value.trim()))
      return problemResponse('reimbursementScopeDenied', locals.correlationId, {
        reimbursement: [definition('reimbursementScopeDenied').messageKey],
      });

    const duplicateFields = filterNames.filter(
      (field) => url.searchParams.getAll(field).length > 1,
    );
    if (duplicateFields.length)
      return problemResponse(
        'filterDuplicate',
        locals.correlationId,
        Object.fromEntries(
          duplicateFields.map((field) => [field, [definition('filterDuplicate').messageKey]]),
        ),
      );

    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const format = url.searchParams.get('format') ?? 'xlsx';
    const worker = workers[0] ?? '';
    const reimbursement = reimbursements[0]?.trim() ?? '';
    const client = url.searchParams.get('client')?.trim() ?? '';
    const category = url.searchParams.get('category')?.trim() ?? '';
    const currency = url.searchParams.get('currency')?.trim().toUpperCase() ?? '';
    const status = url.searchParams.get('status')?.trim() ?? '';
    const receipt = url.searchParams.get('receipt')?.trim() ?? '';
    const query = url.searchParams.get('q')?.trim() ?? '';
    const fieldErrors: Record<string, string[]> = {};
    let primary: ProblemName | null = null;
    function invalid(field: string, issue: ProblemName): void {
      fieldErrors[field] ??= [definition(issue).messageKey];
      primary ??= issue;
    }

    const fromValid = isRealIsoDate(from);
    const toValid = isRealIsoDate(to);
    if (!fromValid) invalid('from', 'dateInvalid');
    if (!toValid) invalid('to', 'dateInvalid');
    if (fromValid && toValid && from > to) invalid('to', 'dateOrderInvalid');
    if (!['pdf', 'xlsx', 'csv'].includes(format)) invalid('format', 'formatInvalid');
    if (receipt && !['missing', 'attached', 'not_required'].includes(receipt))
      invalid('receipt', 'receiptInvalid');
    for (const [field, value] of Object.entries({
      project,
      worker,
      client,
      category,
      currency,
      status,
      reimbursement,
      q: query,
    })) {
      if (value.length > 500) invalid(field, 'filterTooLong');
    }
    if (currency && !['USD', 'EUR', 'BRL'].includes(currency))
      invalid('currency', 'currencyInvalid');
    if (
      status &&
      ![
        'attention',
        'draft',
        'submitted',
        'approved',
        'needs_changes',
        'rejected',
        'locked',
        'void',
      ].includes(status)
    )
      invalid('status', 'statusInvalid');
    if (reimbursement && !['pending', 'scheduled', 'reimbursed', 'paid'].includes(reimbursement))
      invalid('reimbursement', 'reimbursementInvalid');
    if (primary) return problemResponse(primary, locals.correlationId, fieldErrors);

    const rows = (
      ctx.repository.listExpensesForScope(ctx.principal) as Record<string, unknown>[]
    ).filter(
      (row) =>
        String(row.spent_on) >= from &&
        String(row.spent_on) <= to &&
        (!project || row.project_id === project) &&
        (!worker || row.worker_id === worker) &&
        (!client || row.client_name === client) &&
        (!category || row.category === category) &&
        (!currency || row.currency === currency) &&
        (!receipt || expenseReceiptState(row) === receipt) &&
        (!status ||
          (status === 'attention'
            ? ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state))
            : row.approval_state === status)) &&
        (role === 'project_manager' ||
          !reimbursement ||
          (reimbursement === 'pending'
            ? ['approved', 'locked'].includes(String(row.approval_state)) &&
              ['pending', 'scheduled'].includes(String(row.reimbursement_state))
            : row.reimbursement_state === reimbursement)) &&
        expenseSearchMatches(row, query),
    );
    const bytes = expenseRegisterExport(rows, format as 'pdf' | 'xlsx' | 'csv', `${from} — ${to}`);
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type':
          format === 'pdf'
            ? 'application/pdf'
            : format === 'xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="Expenses_${from}_${to}.${format}"`,
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
      return problemResponse('accessDenied', locals.correlationId);
    }
    const reference = locals.correlationId || randomUUID();
    console.error('Unexpected expense export failure', { correlationId: reference, cause: caught });
    return problemResponse('unavailable', reference);
  } finally {
    ctx?.sqlite.close();
  }
};
