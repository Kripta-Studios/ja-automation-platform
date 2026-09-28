import { error, isHttpError, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { previewCommercialExample, upcomingBillingPeriods } from '$lib/server/commercial-preview';
import {
  actionFail,
  actionFailure,
  type ActionFailureExtras,
  type ActionMessageKey,
} from '$lib/server/actions/action-message';
import type { Actions, PageServerLoad } from './$types';

const defaults = {
  currency: 'USD',
  pricing: 'hourly',
  expenseTreatment: 'included',
  workHours: '8',
  referenceHours: '12',
  minimumHours: '0',
  thresholdHours: '',
  sellRate: '120',
  workerRate: '55',
  loadedCostRate: '65',
  sellMultiplier: '1.6',
  workerMultiplier: '2',
  costMultiplier: '2',
  expenseAmount: '190',
  workerAdvancedExpense: 'yes',
  fixedPrice: '1500',
  cadence: 'semi_monthly',
  exampleDate: '2026-09-01',
  anchorDate: '2026-09-01',
};

function authorized(locals: App.Locals) {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  } catch {
    context.sqlite.close();
    error(401, 'Live authenticated session required');
  }
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role)) {
    context.sqlite.close();
    error(403, 'Finance access required');
  }
  return context;
}

export const load: PageServerLoad = ({ locals, url }) => {
  const context = authorized(locals);
  try {
    const projects = context.repository.listFinanceProjects(context.principal);
    const projectId = url.searchParams.get('project') ?? '';
    const overview = projectId
      ? context.repository.projectOverview(context.principal, projectId)
      : null;
    const savedAgreementCheck = projectId
      ? context.v3.projectFinance(context.principal, projectId)
      : null;
    return {
      defaults,
      projects: projects.map((project) => ({
        id: String(project.id),
        label: `${project.project_number} — ${project.name}`,
      })),
      selectedProjectId: projectId,
      agreement: overview
        ? {
            number: overview.project.project_number,
            name: overview.project.name,
            pricing: overview.project.billing_model,
            fixedPriceMinor: overview.project.fixed_price_minor,
            currency: overview.project.currency,
            referenceMinutes: overview.project.expected_minutes_per_day,
            minimumMinutes: overview.project.client_daily_minimum_minutes,
          }
        : null,
      policies: projectId
        ? context.repository.listProjectCommercialPolicies(context.principal, projectId)
        : [],
      streams: projectId
        ? context.repository
            .listBillingRules(context.principal)
            .filter((rule) => rule.project_id === projectId)
        : [],
      savedAgreementCheck,
      savedRuleCoverage: projectId
        ? {
            clientRates: context.v3.listClientLaborRates(context.principal, projectId).length,
            compensationRules: context.v3.listCompensationRules(context.principal, projectId)
              .length,
            internalCostRules: context.v3.listInternalCostRules(context.principal, projectId)
              .length,
          }
        : null,
    };
  } finally {
    context.sqlite.close();
  }
};

const hours = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/u)
  .transform(Number)
  .refine(
    (value) => value >= 0 && value <= 24 && Math.abs(value * 60 - Math.round(value * 60)) < 1e-7,
  )
  .transform((value) => Math.round(value * 60));
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const multiplier = z
  .string()
  .regex(/^\d{1,2}(?:\.\d{1,2})?$/u)
  .transform((value) => Math.round(Number(value) * 10_000))
  .refine((value) => value <= 100_000);
const schema = z.object({
  currency: z.enum(['USD', 'EUR', 'BRL']),
  pricing: z.enum(['hourly', 'fixed']),
  expenseTreatment: z.enum(['included', 'recoverable', 'customer_direct']),
  workHours: hours,
  referenceHours: hours,
  minimumHours: hours,
  thresholdHours: z.union([z.literal('').transform(() => null), hours]),
  sellRate: amount,
  workerRate: amount,
  loadedCostRate: amount,
  sellMultiplier: multiplier,
  workerMultiplier: multiplier,
  costMultiplier: multiplier,
  expenseAmount: amount,
  workerAdvancedExpense: z.enum(['yes', 'no']),
  fixedPrice: amount,
  cadence: z.enum(['weekly', 'every_14_days', 'semi_monthly', 'monthly', 'custom']),
  exampleDate: z.string(),
  anchorDate: z.string(),
});

// The existing preview UI uses a string[] `fields` list. Keep it alongside
// the shared problem contract's map-shaped `fieldErrors` during migration.
function previewFail(
  messageKey: ActionMessageKey,
  message: string,
  extra: Omit<ActionFailureExtras, 'fields'> & { fields: string[] },
) {
  return actionFail(400, messageKey, {}, message, extra as unknown as ActionFailureExtras);
}

const previewFieldGuidance: Record<string, string> = {
  workHours: 'Enter 0 to 24 hours in whole-minute increments.',
  referenceHours: 'Enter 0 to 24 hours in whole-minute increments.',
  minimumHours: 'Enter 0 to 24 hours in whole-minute increments.',
  thresholdHours: 'Enter a positive threshold of at most 24 hours.',
  sellRate: 'Enter a non-negative customer rate with up to two decimal places.',
  workerRate: 'Enter a non-negative worker rate with up to two decimal places.',
  loadedCostRate: 'Enter a non-negative internal cost with up to two decimal places.',
  expenseAmount: 'Enter a non-negative expense with up to two decimal places.',
  fixedPrice: 'Enter a non-negative fixed price with up to two decimal places.',
  sellMultiplier: 'Enter a customer overtime multiplier from 0 to 10.',
  workerMultiplier: 'Enter a worker overtime multiplier from 0 to 10.',
  costMultiplier: 'Enter an internal cost overtime multiplier from 0 to 10.',
};

export function _previewValidationFailure(values: Record<string, string>, issues: z.ZodIssue[]) {
  const fields = [...new Set(issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean);
  const fieldErrors = Object.fromEntries(
    fields.map((field) => [field, [previewFieldGuidance[field] ?? 'Choose a valid option.']]),
  );
  return previewFail(
    'problem.finance.previewInvalidFields',
    'Check the highlighted example fields and calculate again.',
    {
      code: 'FINANCE_PREVIEW_INVALID_FIELDS',
      values,
      invalid: true,
      result: null,
      periods: [],
      fields,
      fieldErrors,
    },
  );
}

export function _previewRangeFailure(values: Record<string, string>, cause: RangeError) {
  if (cause.message === 'A customer-direct expense cannot also have been advanced by the worker.')
    return previewFail(
      'problem.finance.previewPayerConflict',
      'A customer-direct expense cannot also have been advanced by the worker. Change the expense treatment or payer.',
      {
        code: 'FINANCE_PREVIEW_PAYER_CONFLICT',
        values,
        invalid: true,
        result: null,
        periods: [],
        fields: ['expenseTreatment', 'workerAdvancedExpense'],
        fieldErrors: {
          expenseTreatment: ['Customer-direct and worker-advanced cannot be selected together.'],
          workerAdvancedExpense: [
            'Customer-direct and worker-advanced cannot be selected together.',
          ],
        },
      },
    );
  if (
    cause.message.startsWith('Invalid date:') ||
    cause.message === 'Every 14 days requires an anchor date'
  )
    return previewFail(
      'problem.finance.previewPeriodInvalid',
      'Enter valid example and anchor dates before calculating billing periods.',
      {
        code: 'FINANCE_PREVIEW_PERIOD_INVALID',
        values,
        invalid: true,
        result: null,
        periods: [],
        fields: ['exampleDate', 'anchorDate'],
        fieldErrors: {
          exampleDate: ['Enter a valid date.'],
          anchorDate: ['Enter a valid anchor date.'],
        },
      },
    );
  return previewFail(
    'problem.finance.previewCalculationInvalid',
    'The example cannot be calculated with these values. Review the rates, hours, and multipliers.',
    {
      code: 'FINANCE_PREVIEW_CALCULATION_INVALID',
      values,
      invalid: true,
      result: null,
      periods: [],
      fields: [],
      remedies: [{ id: 'review_preview_inputs' }],
    },
  );
}

export const actions: Actions = {
  default: async ({ locals, request }) => {
    let context: ReturnType<typeof authorized>;
    try {
      context = authorized(locals);
    } catch (cause) {
      if (isHttpError(cause) && cause.status === 403)
        return actionFail(
          403,
          'problem.finance.previewRoleRequired',
          {},
          'Finance access is required to calculate this example. Contact Finance or an owner.',
          { code: 'FINANCE_PREVIEW_ROLE_REQUIRED', remedies: [{ id: 'contact_finance_owner' }] },
        );
      if (isHttpError(cause) && cause.status === 401)
        return actionFail(
          401,
          'problem.finance.previewSessionRequired',
          {},
          'Sign in again before calculating this Finance example.',
          { code: 'FINANCE_PREVIEW_SESSION_REQUIRED', remedies: [{ id: 'sign_in_again' }] },
        );
      throw cause;
    }
    let values: Record<string, string> = {};
    try {
      // Active account/role are checked by the repository before any financial preview.
      context.repository.listFinanceProjects(context.principal);
      const formData = await request.formData();
      values = Object.fromEntries(
        Object.keys(defaults).map((key) => [key, String(formData.get(key) ?? '').slice(0, 100)]),
      );
      const parsed = schema.safeParse(values);
      if (!parsed.success) return _previewValidationFailure(values, parsed.error.issues);
      const input = parsed.data;
      try {
        const result = previewCommercialExample({
          currency: input.currency,
          pricing: input.pricing,
          expenseTreatment: input.expenseTreatment,
          workMinutes: input.workHours,
          referenceMinutes: input.referenceHours,
          minimumMinutes: input.minimumHours,
          overtimeThresholdMinutes: input.thresholdHours,
          sellRate: input.sellRate,
          workerRate: input.workerRate,
          loadedCostRate: input.loadedCostRate,
          sellOvertimeBps: input.sellMultiplier,
          workerOvertimeBps: input.workerMultiplier,
          costOvertimeBps: input.costMultiplier,
          expenseAmount: input.expenseAmount,
          workerAdvancedExpense: input.workerAdvancedExpense === 'yes',
          fixedPrice: input.fixedPrice,
        });
        const periods = upcomingBillingPeriods(
          input.cadence,
          input.exampleDate,
          input.anchorDate || undefined,
        );
        return { values, invalid: false, result, periods, fields: [] };
      } catch (cause) {
        if (!(cause instanceof RangeError)) throw cause;
        return _previewRangeFailure(values, cause);
      }
    } catch (cause) {
      return actionFailure(cause, { values, invalid: true, result: null, periods: [] });
    } finally {
      context.sqlite.close();
    }
  },
};
