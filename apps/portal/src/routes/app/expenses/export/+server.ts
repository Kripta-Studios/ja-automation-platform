import { error } from '@sveltejs/kit';
import { expenseRegisterExport } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { isRealIsoDate } from '$lib/server/iso-date';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const format = url.searchParams.get('format') ?? 'xlsx';
  if (!isRealIsoDate(from) || !isRealIsoDate(to) || from > to) error(400, 'Choose a valid date range');
  if (!['pdf', 'xlsx', 'csv'].includes(format)) error(400, 'Choose PDF, XLSX or CSV');
  const project = url.searchParams.get('project') ?? '';
  const worker = url.searchParams.get('worker') ?? '';
  const ctx = openPortalRepository(locals);
  try {
    if (ctx.principal.role === 'worker' && worker && worker !== ctx.principal.userId) error(403, 'Own expenses only');
    const rows = (ctx.repository.listExpensesForScope(ctx.principal) as Record<string, unknown>[]).filter(row => String(row.spent_on) >= from && String(row.spent_on) <= to && (!project || row.project_id === project) && (!worker || row.worker_id === worker));
    const bytes = expenseRegisterExport(rows, format as 'pdf' | 'xlsx' | 'csv', `${from} — ${to}`);
    return new Response(Buffer.from(bytes), { headers: { 'content-type': format === 'pdf' ? 'application/pdf' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="Expenses_${from}_${to}.${format}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } finally { ctx.sqlite.close(); }
};
