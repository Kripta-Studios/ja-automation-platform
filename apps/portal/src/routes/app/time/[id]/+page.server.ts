import { error, redirect } from '@sveltejs/kit';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const record = context.repository.timeDetail(context.principal, params.id) as Record<
      string,
      unknown
    >;
    const relatedReportIds = context.sqlite
      .prepare(
        `SELECT id FROM daily_report
          WHERE project_id=? AND worker_id=? AND work_date=?
         UNION ALL
         SELECT id FROM technical_report
          WHERE project_id=? AND author_id=? AND report_date=?
         LIMIT 50`,
      )
      .all(
        String(record.project_id),
        String(record.worker_id),
        String(record.work_date),
        String(record.project_id),
        String(record.worker_id),
        String(record.work_date),
      ) as Array<{ id: string }>;
    const relatedReports: Array<{ id: string; type: string; status: string }> = [];
    for (const candidate of relatedReportIds) {
      try {
        const detail = context.repository.reportDetail(context.principal, candidate.id);
        relatedReports.push({
          id: candidate.id,
          type: detail.type,
          status: String(detail.report.approval_state),
        });
      } catch (caught) {
        if (caught instanceof AccessDeniedError) continue;
        throw caught;
      }
    }
    return {
      user: locals.user,
      record,
      relatedReports,
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(403, 'detail.timeEntry.accessDenied');
    if (caught instanceof ValidationError) error(404, 'detail.timeEntry.notFound');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
