import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '$lib/server/actions/operations-actions';
import { timeActions } from '$lib/server/actions/time-actions';
import {
  timeCorrectionDependency,
  timeCorrectionDependencyProblem,
} from '$lib/server/actions/time-correction-dependency';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const record = context.repository.timeDetail(context.principal, params.id) as Record<
      string,
      unknown
    >;
    const correctionLink = context.sqlite
      .prepare(
        `SELECT original_id,reason FROM record_correction_link
          WHERE record_type='time_entry' AND correction_id=?
            AND tenant_id=(SELECT tenant_id FROM deployment_identity WHERE singleton=1)
          LIMIT 1`,
      )
      .get(params.id) as { original_id: string; reason: string } | undefined;
    let correctionOrigin: { id: string; reason: string } | null = null;
    if (correctionLink) {
      try {
        context.repository.timeDetail(context.principal, correctionLink.original_id);
        correctionOrigin = { id: correctionLink.original_id, reason: correctionLink.reason };
      } catch (caught) {
        // A readable correction does not grant access to its original or its correction metadata.
        if (!(caught instanceof AccessDeniedError || caught instanceof ValidationError))
          throw caught;
      }
    }
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
    let activeCorrection: { id: string; status: string } | null = null;
    if (correctionStatus.active_id && correctionStatus.active_id !== params.id) {
      try {
        const detail = context.repository.timeDetail(
          context.principal,
          correctionStatus.active_id,
        ) as Record<string, unknown>;
        activeCorrection = {
          id: correctionStatus.active_id,
          status: String(detail.approval_state),
        };
      } catch (caught) {
        // The database can find a linked row that this role cannot open. Do not expose its ID.
        if (!(caught instanceof AccessDeniedError || caught instanceof ValidationError))
          throw caught;
      }
    }
    // timeDetail includes a linked ID for returned records. Keep that projection aligned with
    // the live access check above so an unreadable ID is not serialized to the browser.
    const safeRecord = {
      ...record,
      active_correction_id: activeCorrection?.id ?? null,
      active_correction_state: activeCorrection?.status ?? null,
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
    const withdrawDependency = canWithdrawCorrection
      ? timeCorrectionDependency(context.sqlite, context.repository, context.principal, params.id)
      : null;
    const withdrawWarning = withdrawDependency
      ? (() => {
          const problem = timeCorrectionDependencyProblem(withdrawDependency);
          return {
            code: problem.code,
            messageKey: problem.key,
            message: problem.message,
            params: {},
            fieldErrors: {},
            remedies: [
              {
                id:
                  withdrawDependency.kind === 'other' && context.principal.role === 'owner_admin'
                    ? 'contact_finance'
                    : problem.remedy,
                ...(withdrawDependency.recordId ? { recordId: withdrawDependency.recordId } : {}),
              },
            ],
            correlationId: '',
          };
        })()
      : null;
    const ownDraft =
      record.approval_state === 'draft' && String(record.worker_id) === context.principal.userId
        ? (context.sqlite
            .prepare(
              `SELECT t.version,
                 CASE WHEN NOT EXISTS(SELECT 1 FROM record_correction_link l WHERE l.record_type='time_entry' AND l.correction_id=t.id)
                   AND NOT EXISTS(SELECT 1 FROM operational_time_expense_request r WHERE r.time_entry_id=t.id)
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
    const linkedPairRow = context.sqlite
      .prepare(
        `SELECT r.expense_id expenseId,e.version expenseVersion,
        e.approval_state expenseState,t.version timeVersion FROM operational_time_expense_request r
        JOIN expense e ON e.id=r.expense_id JOIN time_entry t ON t.id=r.time_entry_id
        WHERE r.time_entry_id=? LIMIT 1`,
      )
      .get(params.id) as
      | { expenseId: string; expenseVersion: number; expenseState: string; timeVersion: number }
      | undefined;
    let linkedPair: {
      expenseId: string;
      expenseVersion: number;
      expenseState: string;
      timeVersion: number;
    } | null = null;
    if (linkedPairRow) {
      try {
        context.repository.expenseDetail(context.principal, linkedPairRow.expenseId);
        linkedPair = linkedPairRow;
      } catch (caught) {
        if (!(caught instanceof AccessDeniedError || caught instanceof ValidationError))
          throw caught;
      }
    }
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
      reviewOnly: false,
      record: safeRecord,
      correctionOrigin,
      activeCorrection,
      correctionRequestId,
      ownDraft,
      linkedPair,
      canCreateCorrection,
      canWithdrawCorrection,
      withdrawWarning,
      withdrawVersion: correctionStatus.version,
      relatedReports,
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) {
      if (context.principal.role === 'project_manager') {
        // The current approval queue is the authority for review access to older records.
        // Never return the queue row: it also contains fields outside this review surface.
        const queued = context.repository
          .listApprovalQueue(context.principal)
          .find((row) => row.type === 'time' && row.id === params.id);
        if (
          queued &&
          typeof queued.project_id === 'string' &&
          typeof queued.approval_state === 'string'
        ) {
          const row = context.sqlite
            .prepare(
              `SELECT t.id,t.project_id,t.work_date,t.approval_state,t.minutes,t.category,
                      t.activity_summary,u.name worker_name,p.project_number,p.name project_name
                 FROM time_entry t
                 JOIN user u ON u.id=t.worker_id
                 JOIN project p ON p.id=t.project_id
                WHERE t.id=? AND t.project_id=? AND t.approval_state=?`,
            )
            .get(params.id, queued.project_id, queued.approval_state) as
            | {
                id: string;
                project_id: string;
                work_date: string;
                approval_state: string;
                minutes: number;
                category: string;
                activity_summary: string;
                worker_name: string;
                project_number: string;
                project_name: string;
              }
            | undefined;
          if (row) {
            return {
              user: locals.user,
              reviewOnly: true,
              record: {
                id: row.id,
                project_id: row.project_id,
                work_date: row.work_date,
                approval_state: row.approval_state,
                minutes: row.minutes,
                category: row.category,
                activity_summary: row.activity_summary,
                worker_name: row.worker_name,
                project_number: row.project_number,
                project_name: row.project_name,
              },
            };
          }
        }
      }
      error(403, 'detail.timeEntry.accessDenied');
    }
    if (caught instanceof ValidationError) error(404, 'detail.timeEntry.notFound');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  withdrawLinkedDrafts: async (event) => {
    const result = await reportActions.withdrawLinkedDrafts({
      ...event,
      params: { ...event.params, section: 'time' },
    });
    return result;
  },
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
