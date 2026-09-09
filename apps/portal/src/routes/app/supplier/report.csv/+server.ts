import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { normalizePortalLocale } from '$lib/portal-i18n';
import {
  openSupplierContext,
  supplierPeriod,
  supplierReadFailure,
} from '$lib/server/supplier-context';
import { supplierCsv } from '$lib/server/supplier-csv';
import { supplierCopy } from '../copy';
export const GET: RequestHandler = ({ locals, url }) => {
  const ctx = openSupplierContext(locals);
  try {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) error(400, 'Select an installation');
    const c = supplierCopy[normalizePortalLocale(url.searchParams.get('lang'))];
    const report = ctx.supplier.operationalReport(ctx.principal, {
      projectId,
      supplierId: url.searchParams.get('supplierId') || undefined,
      ...supplierPeriod(url),
    });
    const body = supplierCsv([
      [c.project, c.worker, c.date, c.category, c.minutes, c.summary, c.state, c.recordedBy],
      ...report.rows.map((row) => [
        report.project.name,
        row.workerName,
        row.workDate,
        row.category,
        row.minutes,
        row.summary,
        row.isSuperseded ? `${row.state} (${c.superseded})` : row.state,
        row.recordedByName,
      ]),
    ]);
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="operational-report-${report.from}-${report.to}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (caught) {
    supplierReadFailure(caught);
  } finally {
    ctx.sqlite.close();
  }
};
