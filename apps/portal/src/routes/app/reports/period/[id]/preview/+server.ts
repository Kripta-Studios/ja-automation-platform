import { periodReportHtml, reportPreviewSnapshot } from '@ja/reporting';
import { error } from '@sveltejs/kit';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params, url, cookies }) => {
  if (!locals.user) error(401, 'Sign in to preview this report.');
  const context = openPortalRepository(locals);
  try {
    // This repository projection preserves audience, field allowlists and project authorization.
    const report = context.v3.periodReportSnapshot(context.principal, params.id);
    const locale = resolvePortalLocalePreference(
      url.searchParams.get('lang'), cookies.get('ja.portal.locale'), cookies.get('ja-portal-locale'),
    );
    const snapshot = reportPreviewSnapshot('period_report_revision', report as Record<string, unknown>, locale);
    return new Response(periodReportHtml(snapshot as Parameters<typeof periodReportHtml>[0]), { headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
    } });
  } catch {
    error(404, 'Period report preview is unavailable. Review your report access.');
  } finally {
    context.sqlite.close();
  }
};
