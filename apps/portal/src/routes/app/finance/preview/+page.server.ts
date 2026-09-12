import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { previewCommercialExample, upcomingBillingPeriods } from '$lib/server/commercial-preview';
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

export const actions: Actions = {
  default: async ({ locals, request }) => {
    const context = authorized(locals);
    try {
      // Active account/role are checked by the repository before any financial preview.
      context.repository.listFinanceProjects(context.principal);
      const formData = await request.formData();
      const values = Object.fromEntries(
        Object.keys(defaults).map((key) => [key, String(formData.get(key) ?? '').slice(0, 100)]),
      );
      const parsed = schema.safeParse(values);
      if (!parsed.success)
        return fail(400, {
          values,
          invalid: true,
          result: null,
          periods: [],
          fields: parsed.error.issues.map((issue) => String(issue.path[0])),
        });
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
        return fail(400, { values, invalid: true, result: null, periods: [], fields: [] });
      }
    } finally {
      context.sqlite.close();
    }
  },
};
