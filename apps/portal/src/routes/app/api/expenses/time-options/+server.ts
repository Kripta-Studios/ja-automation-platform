import { projectRecordIdSchema } from '@ja/schemas';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { expenseTimeOptions } from '$lib/server/expense-time-options';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  expenseLookupCaught,
  expenseLookupInvalid,
  expenseLookupSignIn,
} from '$lib/server/expense-lookup-problem';

const filtersSchema = z.object({
  projectId: projectRecordIdSchema,
  date: z.iso.date(),
  workerId: z.uuid().optional(),
  originalExpenseId: z.uuid().optional(),
});

/** Read-only, role-scoped time choices for an operational expense. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return expenseLookupSignIn(locals.correlationId);
  const parsed = filtersSchema.safeParse({
    projectId: url.searchParams.get('projectId'),
    date: url.searchParams.get('date'),
    workerId: url.searchParams.get('workerId') || undefined,
    originalExpenseId: url.searchParams.get('originalExpenseId') || undefined,
  });
  if (!parsed.success) return expenseLookupInvalid('time', locals.correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const rows = expenseTimeOptions(context, {
      projectId: parsed.data.projectId,
      date: parsed.data.date,
      workerId: parsed.data.workerId,
    });
    let originalLinkValid: boolean | undefined;
    if (parsed.data.originalExpenseId) {
      const expense = context.repository.expenseDetail(
        context.principal,
        parsed.data.originalExpenseId,
      );
      const linkedId = String(expense.time_entry_id ?? '');
      const sameScope =
        String(expense.project_id) === parsed.data.projectId &&
        (!parsed.data.workerId || String(expense.worker_id) === parsed.data.workerId) &&
        String(expense.spent_on) === parsed.data.date;
      const linked =
        sameScope && linkedId
          ? (context.sqlite
              .prepare(
                `SELECT 1 FROM time_entry
                WHERE id=? AND project_id=? AND worker_id=? AND work_date=?
                  AND approval_state NOT IN ('rejected','void') LIMIT 1`,
              )
              .get(linkedId, parsed.data.projectId, String(expense.worker_id), parsed.data.date) as
              | { 1: number }
              | undefined)
          : undefined;
      originalLinkValid = Boolean(linked);
    }
    return json(parsed.data.originalExpenseId ? { rows, originalLinkValid } : { rows }, {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (caught) {
    return expenseLookupCaught('time', caught, locals.correlationId);
  } finally {
    context?.sqlite.close();
  }
};
