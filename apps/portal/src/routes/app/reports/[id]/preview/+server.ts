import { dailyReportHtml, technicalReportHtml, reportPreviewSnapshot } from '@ja/reporting';
import { error } from '@sveltejs/kit';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params, url, cookies }) => {
  if (!locals.user) error(401, 'Sign in to preview this report.');
  const context = openPortalRepository(locals);
  try {
    // Establish live-session and exact object scope before any identity enrichment.
    const detail = context.repository.reportDetail(context.principal, params.id);
    const report = detail.report;
    const identity = context.sqlite.prepare(
      `SELECT c.display_name client_name FROM project p
       LEFT JOIN client c ON c.id=p.client_id WHERE p.id=?`,
    ).get(String(report.project_id)) as { client_name?: string } | undefined;
    const locale = resolvePortalLocalePreference(
      url.searchParams.get('lang'), cookies.get('ja.portal.locale'), cookies.get('ja-portal-locale'),
    );
    const kind = detail.type === 'technical' ? 'technical_report' : 'daily_report';
    const snapshot = reportPreviewSnapshot(kind, {
      ...report,
      ...identity,
      work_performed_by_name: report.author_name,
      work_performed_by_email: report.author_email,
      report_created_by_name: report.created_by_name ?? report.author_name,
      report_created_by_email: report.created_by_email ?? report.author_email,
    }, locale);
    const html = kind === 'daily_report' ? dailyReportHtml(snapshot) : technicalReportHtml(snapshot);
    return new Response(html, { headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
    } });
  } catch {
    error(404, 'Report preview is unavailable. Review your report access.');
  } finally {
    context.sqlite.close();
  }
};
