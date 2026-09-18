import { error } from '@sveltejs/kit';
import { expenseRegisterExport } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { isRealIsoDate } from '$lib/server/iso-date';
import { expenseReceiptState, expenseSearchMatches } from '$lib/portal/expense-evidence';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const format = url.searchParams.get('format') ?? 'xlsx';
  if (!isRealIsoDate(from) || !isRealIsoDate(to) || from > to)
    error(400, 'Choose a valid date range');
  if (!['pdf', 'xlsx', 'csv'].includes(format)) error(400, 'Choose PDF, XLSX or CSV');
  const project = url.searchParams.get('project') ?? '';
  const worker = url.searchParams.get('worker') ?? '';
  const client = url.searchParams.get('client')?.trim() ?? '';
  const category = url.searchParams.get('category')?.trim() ?? '';
  const currency = url.searchParams.get('currency')?.trim().toUpperCase() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const reimbursement = url.searchParams.get('reimbursement')?.trim() ?? '';
  const receipt = url.searchParams.get('receipt')?.trim() ?? '';
  if (receipt && !['missing', 'attached', 'not_required'].includes(receipt))
    error(400, 'Choose a valid receipt filter');
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (
    [project, worker, client, category, currency, status, reimbursement, query].some(
      (value) => value.length > 500,
    )
  )
    error(400, 'Expense filter is too long');
  if (currency && !['USD', 'EUR', 'BRL'].includes(currency))
    error(400, 'Choose a supported currency');
  const ctx = openPortalRepository(locals);
  try {
    if (ctx.principal.role === 'worker' && worker && worker !== ctx.principal.userId)
      error(403, 'Own expenses only');
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
        (ctx.principal.role === 'project_manager' ||
          !reimbursement ||
          (reimbursement === 'pending'
            ? ['pending', 'scheduled'].includes(String(row.reimbursement_state))
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
  } finally {
    ctx.sqlite.close();
  }
};
