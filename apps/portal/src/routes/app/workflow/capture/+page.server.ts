import { error, fail, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { createFieldCapture, type CaptureInput } from '@ja/database';
import { normalizePortalLocale } from '$lib/portal-i18n';
import {
  workflowCaptureConflictCopy,
  workflowCaptureValidationCopy,
} from '$lib/portal/workflow/copy';
import { openPortalRepository } from '$lib/server/portal-repository';
import { decimalToMinor } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

const str = (form: FormData, key: string) => String(form.get(key) ?? '');
const checked = (form: FormData, key: string) => form.get(key) === 'on';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, `${base}/app/login`);
  const context = openPortalRepository(locals);
  try {
    if (context.principal.role !== 'worker') error(403, 'Worker access required');
    const supplier = context.sqlite
      .prepare(
        "SELECT 1 FROM supplier_user_profile WHERE user_id=? AND profile='supplier_coordinator'",
      )
      .get(context.principal.userId);
    return {
      userId: context.principal.userId,
      supplierCoordinator: Boolean(supplier),
      projects: supplier
        ? []
        : context.repository.listAssignedProjects(context.principal).map((row) => ({
            id: String(row.id),
            name: `${row.project_number} · ${row.name}`,
            currency: String(row.currency),
          })),
    };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { message: 'Sign in required' });
    const form = await request.formData();
    const locale = normalizePortalLocale(str(form, 'locale'));
    if (str(form, 'confirmed') !== 'yes')
      return fail(400, {
        message:
          locale === 'es'
            ? 'Revisa y confirma los datos antes de crear borradores en el servidor.'
            : locale === 'pt'
              ? 'Reveja e confirme os dados antes de criar rascunhos no servidor.'
              : 'Review and confirm the facts before creating server drafts.',
      });
    const values = Object.fromEntries(
      Array.from(form.entries()).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    const amountMinor = decimalToMinor(str(form, 'amount'));
    const input: CaptureInput = {
      requestKey: str(form, 'requestKey'),
      projectId: str(form, 'projectId'),
      workDate: str(form, 'workDate'),
      workSummary: str(form, 'workSummary'),
      ...(checked(form, 'includeTime')
        ? { time: { category: str(form, 'timeCategory'), minutes: Number(str(form, 'minutes')) } }
        : {}),
      ...(checked(form, 'includeReport')
        ? {
            report: {
              tasksCompleted: str(form, 'tasksCompleted'),
              siteShift: str(form, 'siteShift'),
              problemsFound: str(form, 'problemsFound'),
              correctiveActions: str(form, 'correctiveActions'),
              clientDecisions: str(form, 'clientDecisions'),
              downtimeMinutes: Number(str(form, 'downtimeMinutes')),
              standbyReason: str(form, 'standbyReason'),
              blockers: str(form, 'blockers'),
              openItems: str(form, 'openItems'),
              nextDayPlan: str(form, 'nextDayPlan'),
              safetyRelated: checked(form, 'safetyRelated'),
              customerContact: str(form, 'customerContact'),
            },
          }
        : {}),
      ...(checked(form, 'includeExpense')
        ? {
            expense: {
              category: str(form, 'expenseCategory'),
              description: str(form, 'expenseDescription'),
              currency: str(form, 'currency'),
              amountMinor: amountMinor ?? '',
              whoPaid: str(form, 'whoPaid'),
              vendor: str(form, 'vendor'),
            },
          }
        : {}),
    };
    const context = openPortalRepository(locals);
    try {
      return {
        success: true,
        result: createFieldCapture(context.sqlite, context.repository, context.principal, input),
      };
    } catch (error) {
      if (error instanceof AccessDeniedError)
        return fail(403, {
          message:
            locale === 'es'
              ? 'La sesión o asignación ya no autoriza este registro. Revise el acceso al proyecto.'
              : locale === 'pt'
                ? 'A sessão ou atribuição já não autoriza este registo. Reveja o acesso ao projeto.'
                : 'Your session or assignment no longer authorizes this entry. Check project access.',
          values,
        });
      if (error instanceof ConflictError)
        return fail(409, {
          message: workflowCaptureConflictCopy(locale),
          values,
        });
      if (error instanceof ValidationError)
        return fail(400, {
          message: workflowCaptureValidationCopy(locale, error.message),
          values,
        });
      throw error;
    } finally {
      context.sqlite.close();
    }
  },
};
