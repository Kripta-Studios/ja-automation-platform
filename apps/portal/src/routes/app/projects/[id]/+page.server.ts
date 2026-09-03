import { error, redirect } from '@sveltejs/kit';
import { lastCompletePeriodForCadence, type BillingCadence } from '@ja/billing-engine';
import { invoicePeriodSchema } from '@ja/schemas';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { createInvoiceDraftResolvingPeriod } from '$lib/server/invoice-draft';
import { defaultLookbackPeriod } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad, Actions } from './$types';

function currentPeriod(): { periodStart: string; periodEnd: string } {
  return defaultLookbackPeriod();
}

function cadencePeriod(rule: Readonly<Record<string, unknown>> | undefined): {
  periodStart: string;
  periodEnd: string;
} {
  const fallback = currentPeriod();
  if (!rule) return fallback;
  const cadence = String(rule.cadence_type ?? rule.cadenceType ?? '') as BillingCadence;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const aligned = lastCompletePeriodForCadence(cadence, today, {
      anchorDate: String(rule.anchor_date ?? rule.anchorDate ?? '') || undefined,
      monthlyCutoffDay:
        rule.monthly_cutoff_day == null && rule.monthlyCutoffDay == null
          ? undefined
          : Number(rule.monthly_cutoff_day ?? rule.monthlyCutoffDay),
    });
    if (aligned) return { periodStart: aligned.start, periodEnd: aligned.end };
  } catch {
    // Cadence options that require an anchor fall back to the operational lookback.
  }
  return fallback;
}

function resolvePeriod(url: URL): { periodStart: string; periodEnd: string } {
  const fallback = currentPeriod();
  const periodSchema = invoicePeriodSchema.pick({ periodStart: true, periodEnd: true });
  const parsed = periodSchema.safeParse({
    periodStart: url.searchParams.get('periodStart') ?? fallback.periodStart,
    periodEnd: url.searchParams.get('periodEnd') ?? fallback.periodEnd,
  });
  if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart)
    error(400, 'Invalid finance period');
  return parsed.data;
}

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const { periodStart, periodEnd } = resolvePeriod(url);
  const context = openPortalRepository(locals);
  try {
    const overview = context.repository.projectOverview(context.principal, params.id);
    const financeVisible =
      context.principal.role === 'owner_admin' ||
      context.principal.role === 'finance_admin' ||
      context.principal.role === 'auditor_read_only';
    const billingRules = financeVisible
      ? context.repository
          .listBillingRules(context.principal)
          .filter((rule) => String(rule.project_id) === params.id)
      : [];
    const invoiceDraftPeriod = cadencePeriod(
      billingRules[0] as Record<string, unknown> | undefined,
    );
    return {
      user: locals.user,
      periodStart,
      periodEnd,
      invoiceDraftStart: invoiceDraftPeriod.periodStart,
      invoiceDraftEnd: invoiceDraftPeriod.periodEnd,
      workers:
        locals.user.role === 'owner_admin'
          ? context.repository.listAllWorkers(context.principal)
          : [],
      billingRules,
      overview: financeVisible
        ? {
            ...overview,
            financial: context.v3.projectFinance(
              context.principal,
              params.id,
              periodStart,
              periodEnd,
            ),
          }
        : overview,
    };
  } catch {
    error(404, 'detail.project.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  createInvoiceDraft: async ({ request, locals, params }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return actionFail(403, 'action.error.financeRoleRequired');
    const object = Object.fromEntries(await request.formData());
    const parsed = invoicePeriodSchema.safeParse(object);
    if (!parsed.success) return actionFail(400, 'action.validation.billingPeriod');
    if (!params.id) return actionFail(400, 'action.validation.projectIdRequired');

    const context = openPortalRepository(locals);
    try {
      const projectRules = context.repository
        .listBillingRules(context.principal)
        .filter((rule) => String(rule.project_id) === params.id);
      if (!projectRules.some((rule) => String(rule.id) === parsed.data.billingRuleId))
        return actionFail(403, 'action.validation.billingRuleIdRequired');
      return createInvoiceDraftResolvingPeriod(context, parsed.data);
    } catch (e) {
      return actionFailure(e);
    } finally {
      context.sqlite.close();
    }
  },
  updateProject: async ({ request, locals }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    if (!projectId) return actionFail(400, 'action.validation.projectIdRequired');
    const versionValue = data.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields');
    let invalidField: string | null = null;

    const text = (name: string): string | undefined => {
      const value = data.get(name);
      return value === null ? undefined : value.toString();
    };
    const integer = (name: string, nullable = false): number | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (value.trim() === '') return nullable ? null : undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        invalidField = name;
        return undefined;
      }
      return parsed;
    };
    const moneyMinor = (name: string): bigint | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (value.trim() === '') return null;
      try {
        return BigInt(value);
      } catch {
        invalidField = name;
        return undefined;
      }
    };
    const hoursToMinutes = (
      hoursName: string,
      minutesName: string,
      nullable = false,
    ): number | null | undefined => {
      const hoursVal = text(hoursName);
      if (hoursVal !== undefined) {
        if (hoursVal.trim() === '') return nullable ? null : undefined;
        const parsed = Number(hoursVal);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
          invalidField = hoursName;
          return undefined;
        }
        return Math.round(parsed * 60);
      }
      return integer(minutesName, nullable);
    };

    const update = {
      projectId,
      version,
      costCenterCode: text('costCenterCode'),
      name: text('name') ?? undefined,
      poNumber: text('poNumber'),
      description: text('description'),
      projectAlias: text('projectAlias'),
      timezone: text('timezone') ?? undefined,
      billingModel: text('billingModel') ?? undefined,
      siteName: text('siteName'),
      country: text('country'),
      projectManagerId: text('projectManagerId') || null,
      expectedMinutesPerDay:
        hoursToMinutes('expectedHoursPerDay', 'expectedMinutesPerDay') ?? undefined,
      clientDailyMinimumMinutes: hoursToMinutes(
        'clientDailyMinimumHours',
        'clientDailyMinimumMinutes',
        true,
      ),
      budgetMinor: moneyMinor('budgetMinor'),
      revenueBudgetMinor: moneyMinor('revenueBudgetMinor'),
      poCapMinor: moneyMinor('poCapMinor'),
      fixedPriceMinor: moneyMinor('fixedPriceMinor'),
      laborBudgetMinutes: integer('laborBudgetMinutes', true),
      travelBudgetMinor: moneyMinor('travelBudgetMinor'),
      otherCostBudgetMinor: moneyMinor('otherCostBudgetMinor'),
      plannedMinutes: integer('plannedMinutes', true),
      contractNumber: text('contractNumber'),
      startDate: text('startDate'),
      plannedEndDate: text('plannedEndDate'),
      budgetType: text('budgetType') ?? undefined,
      weeklyCloseEnabled: data.get('weeklyCloseEnabled') === 'on',
      dailyReportRequired: data.get('dailyReportRequired') === 'on',
      technicalReportingRequired: data.get('technicalReportingRequired') === 'on',
      notes: text('notes'),
    };
    if (invalidField)
      return actionFail(400, 'action.validation.projectFields', { field: invalidField });

    const context = openPortalRepository(locals);
    try {
      context.repository.updateProject(context.principal, update);
      return actionSuccess('action.projects.projectUpdated', {}, 'Project updated');
    } catch (e) {
      return actionFailure(e);
    } finally {
      context.sqlite.close();
    }
  },
  deleteProject: async ({ request, locals }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    if (!projectId) return actionFail(400, 'action.validation.projectIdRequired');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteProject(context.principal, projectId);
    } catch (e) {
      return actionFailure(e);
    } finally {
      context.sqlite.close();
    }
    redirect(303, '/j-aautomation/app/projects');
  },
};
