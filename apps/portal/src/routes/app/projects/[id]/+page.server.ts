import { error, redirect } from '@sveltejs/kit';
import { lastCompletePeriodForCadence, type BillingCadence } from '@ja/billing-engine';
import { invoicePeriodSchema } from '@ja/schemas';
import { newId } from '@ja/domain';
import { z } from 'zod';
import {
  AccessDeniedError,
  ConflictError,
  ProjectBillingSetupRepository,
  ValidationError,
  V3ValidationError,
  V3ConflictError,
  projectCalendarDate,
} from '@ja/database';
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
    const latestLaborRule = [...billingRules]
      .filter((rule) => rule.stream_type === 'labor' && Number(rule.enabled) === 1)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const latestExpenseRule = [...billingRules]
      .filter((rule) => rule.stream_type === 'expense' && Number(rule.enabled) === 1)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const billingSetup = financeVisible
      ? new ProjectBillingSetupRepository(context.sqlite, context.repository)
      : null;
    const projectRow = overview.project as { client_id?: string };
    const invoiceDraftPeriod = cadencePeriod(
      (latestLaborRule ?? billingRules[0]) as Record<string, unknown> | undefined,
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
      billingSetup: billingSetup
        ? {
            version: billingSetup.currentVersion(context.principal, params.id),
            rulesFingerprint: billingSetup.rulesFingerprint(context.principal, params.id),
            issuingPrerequisites: latestLaborRule
              ? billingSetup.issuingPrerequisites(
                  context.principal,
                  params.id,
                  String(latestLaborRule.effective_from),
                  String(latestLaborRule.legal_entity_id ?? ''),
                  [
                    String(latestLaborRule.tax_profile_id ?? ''),
                    ...(Number(latestLaborRule.include_expenses) === 1 || !latestExpenseRule
                      ? []
                      : [String(latestExpenseRule.tax_profile_id ?? '')]),
                  ],
                )
              : ['billing_setup_required'],
            requestKey: newId(),
            legalEntities: context.repository.listLegalEntities(context.principal),
            taxProfiles: context.repository.listTaxProfiles(context.principal),
            contacts: projectRow.client_id
              ? context.repository.listClientContacts(context.principal, projectRow.client_id)
              : [],
            templates: billingSetup.listTemplates(
              context.principal,
              String(overview.project.currency) as 'EUR' | 'USD' | 'BRL',
            ),
            people: billingSetup.peopleReview(
              context.principal,
              params.id,
              projectCalendarDate(String(overview.project.timezone)),
            ),
          }
        : null,
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
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(403, 'detail.project.forbidden');
    if (caught instanceof ValidationError && /not found/i.test(caught.message))
      error(404, 'detail.project.notFound');
    error(500, 'detail.project.unavailable');
  } finally {
    context.sqlite.close();
  }
};

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/);
const personTermsSchema = z
  .object({
    projectId: z.uuid(),
    projectMemberId: z.uuid(),
    workerId: z.string().min(1).max(200),
    expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    effectiveFrom: z.iso.date(),
    customerHourlyRate: amount,
    workerPayType: z.enum([
      'Hourly',
      'Daily',
      'FixedPerBillingPeriod',
      'FixedProjectAmount',
      'PercentageOfEligibleClientLabor',
    ]),
    workerPayAmount: amount,
    percentageBasis: z.enum([
      'CLIENT_LABOR_BEFORE_TAX',
      'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
      'ISSUED_ELIGIBLE_LABOR',
      'COLLECTED_ELIGIBLE_LABOR',
    ]),
    expensePayer: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
    workerReimbursement: z.enum(['at_cost', 'none']),
    clientRecovery: z.enum(['at_cost', 'markup', 'included', 'non_billable', 'client_direct']),
    markupPercent: z.union([z.literal(''), amount]),
  })
  .strict()
  .superRefine((value, issue) => {
    if (value.expensePayer !== 'worker' && value.workerReimbursement !== 'none')
      issue.addIssue({
        code: 'custom',
        path: ['workerReimbursement'],
        message: 'Only worker-paid expenses can reimburse a worker',
      });
    if ((value.expensePayer === 'client') !== (value.clientRecovery === 'client_direct'))
      issue.addIssue({
        code: 'custom',
        path: ['clientRecovery'],
        message: 'Client-paid expenses require client-direct recovery',
      });
    if (
      value.clientRecovery === 'markup' &&
      (!value.markupPercent || Number(value.markupPercent.replace(',', '.')) <= 0)
    )
      issue.addIssue({
        code: 'custom',
        path: ['markupPercent'],
        message: 'A positive markup percentage is required',
      });
    if (
      value.clientRecovery !== 'markup' &&
      value.markupPercent &&
      Number(value.markupPercent.replace(',', '.')) > 0
    )
      issue.addIssue({
        code: 'custom',
        path: ['markupPercent'],
        message: 'Markup is only available with markup recovery',
      });
  });
export const actions: Actions = {
  submitMilestone: async ({ request, locals, params }) => {
    if (!locals.user) return actionFail(401, 'action.error.unauthenticated');
    const raw = Object.fromEntries(await request.formData());
    const parsed = z
      .object({ id: z.string().uuid(), version: z.coerce.number().int().positive() })
      .safeParse(raw);
    if (!parsed.success)
      return actionFail(400, 'action.validation.milestoneRecord', {}, 'Invalid milestone record');
    const context = openPortalRepository(locals);
    try {
      const milestone = context.sqlite
        .prepare('SELECT project_id FROM project_milestone WHERE id=?')
        .get(parsed.data.id) as { project_id: string } | undefined;
      if (!milestone || milestone.project_id !== params.id)
        return actionFail(404, 'action.validation.milestoneRecord', {}, 'Milestone not found');
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return actionSuccess(
        'action.projects.milestoneSubmitted',
        {},
        'Milestone submitted for review',
      );
    } catch (caught) {
      return actionFailure(caught);
    } finally {
      context.sqlite.close();
    }
  },
  savePeopleTerms: async ({ request, locals, params }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return actionFail(403, 'action.error.financeRoleRequired');
    const raw = Object.fromEntries(await request.formData());
    let candidate: unknown;
    try {
      candidate = JSON.parse(String(raw.rows ?? ''));
    } catch {
      return actionFail(
        400,
        'action.validation.billingStream',
        {},
        'Invalid people terms payload',
        {
          action: 'savePeopleTerms',
        },
      );
    }
    const parsed = z.array(personTermsSchema).min(1).max(50).safeParse(candidate);
    if (!parsed.success)
      return actionFail(400, 'action.validation.billingStream', {}, 'Check selected people terms', {
        action: 'savePeopleTerms',
        values: { rows: String(raw.rows ?? '') },
        fields: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]),
        ),
      });
    if (parsed.data.some((row) => row.projectId !== params.id))
      return actionFail(403, 'action.error.forbidden');
    const context = openPortalRepository(locals);
    try {
      const result = new ProjectBillingSetupRepository(
        context.sqlite,
        context.repository,
      ).savePeopleTerms(context.principal, parsed.data);
      return {
        ...actionSuccess(
          'action.finance.assignmentCommercialReferencesSaved',
          result,
          'Selected people terms saved',
        ),
        action: 'savePeopleTerms',
      };
    } catch (caught) {
      if (
        caught instanceof ValidationError ||
        caught instanceof ConflictError ||
        caught instanceof V3ValidationError ||
        caught instanceof V3ConflictError
      )
        return actionFail(400, 'action.validation.billingStream', {}, caught.message, {
          action: 'savePeopleTerms',
          values: { rows: String(raw.rows ?? '') },
        });
      return actionFailure(caught);
    } finally {
      context.sqlite.close();
    }
  },
  savePersonTerms: async ({ request, locals, params }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return actionFail(403, 'action.error.financeRoleRequired');
    const raw = Object.fromEntries(await request.formData());
    const values = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, typeof value === 'string' ? value : '']),
    );
    const parsed = personTermsSchema.safeParse(raw);
    if (!parsed.success)
      return actionFail(400, 'action.validation.billingStream', {}, 'Check person terms fields', {
        action: 'savePersonTerms',
        values,
        fields: parsed.error.flatten().fieldErrors,
      });
    if (parsed.data.projectId !== params.id) return actionFail(403, 'action.error.forbidden');
    const context = openPortalRepository(locals);
    try {
      const result = new ProjectBillingSetupRepository(
        context.sqlite,
        context.repository,
      ).savePersonTerms(context.principal, parsed.data);
      return {
        ...actionSuccess(
          'action.finance.assignmentCommercialReferencesSaved',
          result,
          'Person commercial terms saved',
        ),
        action: 'savePersonTerms',
        workerId: parsed.data.workerId,
      };
    } catch (caught) {
      if (
        caught instanceof ValidationError ||
        caught instanceof ConflictError ||
        caught instanceof V3ValidationError ||
        caught instanceof V3ConflictError
      )
        return actionFail(
          caught instanceof ConflictError || caught instanceof V3ConflictError ? 409 : 400,
          'action.validation.billingStream',
          {},
          caught.message,
          { action: 'savePersonTerms', values },
        );
      return actionFailure(caught);
    } finally {
      context.sqlite.close();
    }
  },
  saveBillingSetup: async ({ request, locals, params }) => {
    if (!locals.user) return actionFail(401, 'action.error.forbidden');
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return actionFail(403, 'action.error.financeRoleRequired');
    const raw = Object.fromEntries(await request.formData());
    const values = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, typeof value === 'string' ? value : '']),
    );
    const schema = z
      .object({
        projectId: z.uuid(),
        expectedVersion: z.coerce.number().int().nonnegative(),
        expectedRulesFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
        requestKey: z.uuid(),
        selectedTemplateId: z.union([z.literal(''), z.uuid()]).optional(),
        mode: z.enum(['combined', 'separate']),
        effectiveFrom: z.iso.date(),
        legalEntityId: z.uuid(),
        laborTaxProfileId: z.uuid(),
        expenseTaxProfileId: z.union([z.literal(''), z.uuid()]),
        cadenceType: z.enum(['weekly', 'every_14_days', 'semi_monthly', 'monthly', 'manual']),
        expenseCadenceType: z.enum([
          'weekly',
          'every_14_days',
          'semi_monthly',
          'monthly',
          'manual',
        ]),
        anchorDate: z.union([z.literal(''), z.iso.date()]).optional(),
        expenseAnchorDate: z.union([z.literal(''), z.iso.date()]).optional(),
        invoiceLayout: z.enum(['default', 'labor-detailed', 'labor-summary']),
        groupingMode: z.enum(['detail', 'summary', 'by_worker', 'by_day', 'by_category']),
        billingContactId: z.union([z.literal(''), z.uuid()]).optional(),
        recipientEmail: z.union([z.literal(''), z.email().max(254)]).optional(),
        paymentTermsDays: z.coerce.number().int().min(0).max(365),
        autoGenerateDraft: z.enum(['true', 'false']).transform((value) => value === 'true'),
        saveAsTemplate: z.enum(['true', 'false']).transform((value) => value === 'true'),
        templateName: z.string().trim().max(100).optional(),
      })
      .strict()
      .superRefine((value, issue) => {
        if (value.cadenceType === 'every_14_days' && !value.anchorDate)
          issue.addIssue({
            code: 'custom',
            path: ['anchorDate'],
            message: 'Choose a labor cadence anchor date',
          });
        if (
          value.mode === 'separate' &&
          value.expenseCadenceType === 'every_14_days' &&
          !value.expenseAnchorDate
        )
          issue.addIssue({
            code: 'custom',
            path: ['expenseAnchorDate'],
            message: 'Choose an expense cadence anchor date',
          });
        if (value.saveAsTemplate && (value.templateName?.length ?? 0) < 2)
          issue.addIssue({
            code: 'custom',
            path: ['templateName'],
            message: 'Use at least two characters for the template name',
          });
      })
      .safeParse(raw);
    if (!schema.success)
      return actionFail(400, 'action.validation.billingStream', {}, 'Check billing setup fields', {
        action: 'saveBillingSetup',
        values,
        fields: schema.error.flatten().fieldErrors,
      });
    if (schema.data.projectId !== params.id) return actionFail(403, 'action.error.forbidden');
    const context = openPortalRepository(locals);
    try {
      const setup = new ProjectBillingSetupRepository(context.sqlite, context.repository);
      const result = setup.save(context.principal, {
        ...schema.data,
        selectedTemplateId: schema.data.selectedTemplateId || undefined,
        anchorDate: schema.data.anchorDate || undefined,
        expenseAnchorDate: schema.data.expenseAnchorDate || undefined,
        billingContactId: schema.data.billingContactId || undefined,
        recipientEmail: schema.data.recipientEmail || undefined,
      });
      return actionSuccess(
        'action.billing.streamSaved',
        { version: result.version },
        'Project billing setup saved',
      );
    } catch (caught) {
      if (caught instanceof ValidationError || caught instanceof ConflictError)
        return actionFail(
          caught instanceof ConflictError ? 409 : 400,
          'action.validation.billingStream',
          {},
          caught.message,
          { action: 'saveBillingSetup', values },
        );
      return actionFailure(caught);
    } finally {
      context.sqlite.close();
    }
  },
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
      expenseBudgetMinor: moneyMinor('expenseBudgetMinor'),
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
