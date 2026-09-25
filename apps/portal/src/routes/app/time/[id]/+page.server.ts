import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '$lib/server/actions/operations-actions';
import { timeActions } from '$lib/server/actions/time-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const record = context.repository.timeDetail(context.principal, params.id) as Record<
      string,
      unknown
    >;
    const correctionRequestId = randomUUID();
    const correctionStatus = context.sqlite
      .prepare(
        `SELECT t.version,t.invoice_id,t.billing_status,t.billing_lock_id,t.locked_at,
              (SELECT c.id FROM record_correction_link l JOIN time_entry c ON c.id=l.correction_id
                WHERE l.record_type='time_entry' AND l.original_id=COALESCE(
                  (SELECT parent.original_id FROM record_correction_link parent
                    WHERE parent.record_type='time_entry' AND parent.correction_id=t.id LIMIT 1),t.id)
                  AND c.approval_state NOT IN ('rejected','void')
                ORDER BY l.created_at DESC LIMIT 1) active_id,
              (SELECT l.actor_user_id FROM record_correction_link l
                WHERE l.record_type='time_entry' AND l.correction_id=t.id LIMIT 1) correction_actor
         FROM time_entry t WHERE t.id=?`,
      )
      .get(params.id) as {
      version: number;
      invoice_id: string | null;
      billing_status: string;
      billing_lock_id: string | null;
      locked_at: string | null;
      active_id: string | null;
      correction_actor: string | null;
    };
    const canCreateCorrection =
      ['approved', 'needs_changes'].includes(String(record.approval_state)) &&
      (!correctionStatus.active_id ||
        (correctionStatus.active_id === params.id && record.approval_state === 'needs_changes')) &&
      !correctionStatus.invoice_id &&
      correctionStatus.billing_status === 'unlocked' &&
      !correctionStatus.billing_lock_id &&
      !correctionStatus.locked_at &&
      (context.principal.role === 'owner_admin' ||
        context.principal.role === 'project_manager' ||
        (context.principal.role === 'worker' &&
          String(record.worker_id) === context.principal.userId));
    const canWithdrawCorrection =
      record.approval_state === 'draft' &&
      Boolean(correctionStatus.correction_actor) &&
      (correctionStatus.correction_actor === context.principal.userId ||
        context.principal.role === 'owner_admin');
    const ownDraft =
      record.approval_state === 'draft' && String(record.worker_id) === context.principal.userId
        ? (context.sqlite
            .prepare(
              `SELECT t.version,
                 CASE WHEN NOT EXISTS(SELECT 1 FROM record_correction_link l WHERE l.record_type='time_entry' AND l.correction_id=t.id)
                   THEN 1 ELSE 0 END can_edit,
                 CASE WHEN t.invoice_id IS NULL AND t.billing_lock_id IS NULL
                    AND t.billing_status<>'locked'
                    AND NOT EXISTS(SELECT 1 FROM record_correction_link l WHERE l.record_type='time_entry' AND l.correction_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM expense e WHERE e.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM report_time_link r WHERE r.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM operational_time_expense_request r WHERE r.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM crew_time_entry_recorder r WHERE r.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM supplier_time_entry_recorder r WHERE r.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM crew_shared_expense_allocation a WHERE a.time_entry_id=t.id)
                    AND NOT EXISTS(SELECT 1 FROM approval_event a WHERE a.entity_type='time_entry' AND a.entity_id=t.id)
                   THEN 1 ELSE 0 END can_delete
               FROM time_entry t
               WHERE t.id=? AND t.worker_id=? AND t.approval_state='draft'`,
            )
            .get(params.id, context.principal.userId) as
            | { version: number; can_edit: number; can_delete: number }
            | undefined)
        : undefined;
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
      correctionRequestId,
      ownDraft,
      canCreateCorrection,
      canWithdrawCorrection,
      withdrawVersion: correctionStatus.version,
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

export const actions: Actions = {
  submitTime: async (event) => {
    const result = await timeActions.submitTime({
      ...event,
      params: { ...event.params, section: 'time' },
    });
    if ('success' in result && result.success === true)
      redirect(303, `/j-aautomation/app/time/${encodeURIComponent(event.params.id)}`);
    return result;
  },
  createCorrectionDraft: async (event) => {
    const result = await reportActions.createCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'time' },
    });
    if ('success' in result && result.success === true) {
      const id = String(result.messageParams.correctionId);
      redirect(303, `/j-aautomation/app/time/${encodeURIComponent(id)}`);
    }
    return result;
  },
  withdrawCorrectionDraft: async (event) => {
    const result = await reportActions.withdrawCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'time' },
    });
    if ('success' in result && result.success === true) {
      const id = String(result.messageParams.originalId);
      redirect(303, `/j-aautomation/app/time/${encodeURIComponent(id)}`);
    }
    return result;
  },
};
