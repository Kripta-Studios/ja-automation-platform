import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import {
  openSupplierContext,
  supplierPeriod,
  supplierReadFailure,
} from '$lib/server/supplier-context';
import { supplierCsv } from '$lib/server/supplier-csv';
import { supplierCopy, supplierStateLabel, supplierCategoryLabel } from '../copy';
export const GET: RequestHandler = ({ locals, url, cookies }) => {
  const ctx = openSupplierContext(locals);
  try {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) error(400, 'Select an installation');
    const locale = resolvePortalLocalePreference(
      url.searchParams.get('lang'),
      cookies.get('ja.portal.locale'),
      cookies.get('ja-portal-locale'),
    );
    const c = supplierCopy[locale];
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
        supplierCategoryLabel(locale, row.category),
        row.minutes,
        row.summary,
        row.isSuperseded
          ? `${supplierStateLabel(locale, row.state)} (${c.superseded})`
          : supplierStateLabel(locale, row.state),
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
