import {
  approvalDecisionSchema,
  accountingPackPeriodSchema,
  availabilityInputSchema,
  assignmentInputSchema,
  assignmentRateOverrideInputSchema,
  billingRuleInputSchema,
  billingCloseSchema,
  clientContactInputSchema,
  clientLaborRateInputSchema,
  clientInputSchema,
  compensationSettlementInputSchema,
  compensationRuleInputSchema,
  dailyReportInputSchema,
  expenseInputSchema,
  financeDecisionSchema,
  invoiceIdSchema,
  invoiceAdjustmentSchema,
  invoicePeriodSchema,
  invitationInputSchema,
  invoiceNumberPolicyInputSchema,
  internalCostRuleInputSchema,
  legalEntityInputSchema,
  milestoneInputSchema,
  paymentInputSchema,
  planningAssignmentInputSchema,
  projectInputSchema,
  reportDecisionSchema,
  reimbursementInputSchema,
  scheduleInputSchema,
  sendInvoiceSchema,
  skillInputSchema,
  taxProfileInputSchema,
  technicalReportInputSchema,
  technicalChangeDecisionSchema,
  technicalChangeInputSchema,
  timeInputSchema,
  versionedRecordSchema,
  voidInvoiceSchema,
  workerSkillInputSchema,
} from '@ja/schemas';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { runArtifactJobs } from '$lib/server/artifact-jobs';
import type { Actions, PageServerLoad } from './$types';
const sections = [
  'time',
  'reports',
  'expenses',
  'projects',
  'pay',
  'documents',
  'notifications',
  'profile',
  'planning',
  'approvals',
  'billing',
  'finance',
  'ledger',
  'accounting',
  'audit',
];
export const load: PageServerLoad = ({ locals, params, url }) => {
  const section = params.section;
  if (!section || !sections.includes(section)) error(404, 'Page not found');
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (
    ['billing', 'finance', 'ledger', 'accounting'].includes(section) &&
    !['owner_admin', 'finance_admin', 'auditor_read_only'].includes(locals.user.role ?? '')
  )
    error(403, 'Finance access required');
  if (section === 'audit' && !['owner_admin', 'auditor_read_only'].includes(locals.user.role ?? ''))
    error(403, 'Audit access required');
  const context = openPortalRepository(locals);
  try {
    const searchQuery = url.searchParams.get('q')?.trim() ?? '';
    const common = {
      user: locals.user,
      section,
      searchQuery,
      searchResults:
        searchQuery.length >= 2 ? context.repository.search(context.principal, searchQuery) : [],
    };
    switch (section) {
      case 'time':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnTime(context.principal),
        };
      case 'reports':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnReports(context.principal),
          technicalChanges: context.v3.listTechnicalChanges(context.principal),
          periodReports: context.v3.listPeriodReports(context.principal),
        };
      case 'expenses':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnExpenses(context.principal),
        };
      case 'documents':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          documents: context.repository.listDocuments(context.principal),
        };
      case 'pay': {
        const periodStart =
          url.searchParams.get('start') ?? `${new Date().toISOString().slice(0, 7)}-01`;
        const periodEnd =
          url.searchParams.get('end') ??
          new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0))
            .toISOString()
            .slice(0, 10);
        return {
          ...common,
          periodStart,
          periodEnd,
          pay: context.v3.workerPay(context.principal, periodStart, periodEnd),
          settlements: context.v3.listCompensationSettlements(
            context.principal,
            periodStart,
            periodEnd,
          ),
        };
      }
      case 'projects':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          clients:
            context.principal.role === 'owner_admin' ||
            context.principal.role === 'finance_admin' ||
            context.principal.role === 'auditor_read_only'
              ? context.repository.listClients(context.principal)
              : [],
          contacts:
            context.principal.role === 'worker'
              ? []
              : context.repository.listAllClientContacts(context.principal),
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
        };
      case 'approvals':
        return {
          ...common,
          records: context.repository.listApprovalQueue(context.principal),
          milestones: context.repository.listMilestonesForReview(context.principal),
          technicalChanges:
            context.principal.role === 'owner_admin' || context.principal.role === 'project_manager'
              ? context.v3.listTechnicalChanges(context.principal, true)
              : [],
        };
      case 'planning':
        return {
          ...common,
          records: context.repository.listPlanning(context.principal),
          projects: context.repository.listAssignedProjects(context.principal),
          skills: context.repository.listSkills(context.principal),
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
        };
      case 'profile':
        return {
          ...common,
          skills: context.repository.listWorkerSkills(context.principal),
          availability: context.repository.listWorkerAvailability(context.principal),
        };
      case 'notifications':
        return { ...common, records: context.repository.listNotifications(context.principal) };
      case 'billing':
        return {
          ...common,
          billingRules: context.repository.listBillingRules(context.principal),
          invoices: context.repository.listInvoices(context.principal),
          projects: context.repository.listFinanceProjects(context.principal),
          legalEntities: context.repository.listLegalEntities(context.principal),
          taxProfiles: context.repository.listTaxProfiles(context.principal),
          contacts: context.repository.listAllClientContacts(context.principal),
        };
      case 'finance': {
        const projects = context.repository.listFinanceProjects(context.principal);
        const selected =
          url.searchParams.get('project') ?? (projects[0] as { id?: string } | undefined)?.id ?? '';
        return {
          ...common,
          projects,
          workers:
            context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
          selectedProjectId: selected,
          finance: selected ? context.v3.projectFinance(context.principal, selected) : null,
          portfolio: context.v3.financePortfolio(context.principal),
          settlements: selected
            ? context.v3.listCompensationSettlements(
                context.principal,
                undefined,
                undefined,
                selected,
              )
            : [],
          reimbursements: selected
            ? context.v3.listReimbursementQueue(context.principal, selected)
            : [],
        };
      }
      case 'ledger':
        return { ...common, ledger: context.v3.masterLedger(context.principal) };
      case 'accounting': {
        return {
          ...common,
          packs: context.v3.listAccountingPacks(context.principal),
        };
      }
      case 'audit':
        return { ...common, audit: context.repository.listAuditEvents(context.principal) };
      default:
        return { ...common, records: [] };
    }
  } finally {
    context.sqlite.close();
  }
};

const formObject = (request: Request): Promise<Record<string, unknown>> =>
  request.formData().then((data) => Object.fromEntries(data) as Record<string, unknown>);
const decimalToMinor = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
};
const normalizeLocalDateTime = (value: unknown): unknown => {
  if (typeof value !== 'string' || !value) return value;
  if (value.endsWith('Z')) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
};

function receiptSignature(mediaType: string, bytes: Uint8Array): boolean {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (mediaType === 'application/pdf')
    return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (mediaType === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff);
  if (mediaType === 'image/png') return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mediaType === 'image/webp')
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    );
  if (mediaType === 'image/heic' || mediaType === 'image/heif') {
    const brand = new TextDecoder().decode(bytes.slice(8, 16));
    return (
      new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' &&
      /heic|heix|hevc|mif1|msf1/.test(brand)
    );
  }
  return false;
}

function privateDocumentSignature(mediaType: string, bytes: Uint8Array): boolean {
  if (receiptSignature(mediaType, bytes)) return true;
  if (mediaType === 'application/zip' || mediaType === 'application/x-zip-compressed')
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (mediaType === 'text/plain') {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const privateDocumentExtension = (mediaType: string): string =>
  mediaType === 'application/pdf'
    ? 'pdf'
    : mediaType === 'application/zip' || mediaType === 'application/x-zip-compressed'
      ? 'zip'
      : mediaType === 'text/plain'
        ? 'txt'
        : mediaType === 'image/png'
          ? 'png'
          : mediaType === 'image/webp'
            ? 'webp'
            : mediaType === 'image/heic'
              ? 'heic'
              : mediaType === 'image/heif'
                ? 'heif'
                : 'jpg';

export const actions: Actions = {
  createDailyReport: async ({ locals, request, params }) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = dailyReportInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check the daily report fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createDailyReport(context.principal, parsed.data);
      return { success: true, message: 'Daily report draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalReport: async ({ locals, request, params }) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = technicalReportInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check the PLC report fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createTechnicalReport(context.principal, parsed.data);
      return { success: true, message: 'PLC report draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalChange: async ({ locals, request, params }) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyImpact = object.safetyImpact === 'on';
    const parsed = technicalChangeInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check technical change fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createTechnicalChange(context.principal, parsed.data);
      return { success: true, message: 'Technical change draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitReport: async ({ locals, request, params }) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const type = object.type;
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success || (type !== 'daily' && type !== 'technical'))
      return fail(400, { success: false, message: 'Invalid report' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitReport(context.principal, type, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Report submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTechnicalChange: async ({ locals, request, params }) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid technical change' });
    const context = openPortalRepository(locals);
    try {
      context.v3.submitTechnicalChange(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Technical change submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createPlanning: async ({ locals, request, params }) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = planningAssignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Check planning fields' });
    const context = openPortalRepository(locals);
    try {
      context.repository.createPlanningAssignment(context.principal, parsed.data);
      return { success: true, message: 'Assignment published' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createSkill: async ({ locals, request, params }) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = skillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check skill fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createSkill(context.principal, parsed.data);
      return { success: true, message: 'Skill saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerSkill: async ({ locals, request, params }) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = workerSkillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check worker skill fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerSkill(context.principal, parsed.data);
      return { success: true, message: 'Worker skill updated' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setAvailability: async ({ locals, request, params }) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.startsAt = normalizeLocalDateTime(object.startsAt);
    object.endsAt = normalizeLocalDateTime(object.endsAt);
    const parsed = availabilityInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check availability fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerAvailability(context.principal, parsed.data);
      return { success: true, message: 'Availability saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewReport: async ({ locals, request, params }) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = reportDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid report decision' });
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewReport(
        context.principal,
        parsed.data.type,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Report review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewTechnicalChange: async ({ locals, request, params }) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Invalid technical change decision' });
    const context = openPortalRepository(locals);
    try {
      context.v3.reviewTechnicalChange(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Technical change review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewMilestone: async ({ locals, request, params }) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Invalid milestone decision' });
    if (parsed.data.decision === 'needs_changes')
      return fail(400, { success: false, message: 'Milestones must be approved or rejected' });
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Milestone review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClient: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = clientInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check client fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createClient(context.principal, parsed.data);
      return { success: true, message: `Created ${result.clientNumber}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientContact: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.isBillingContact = object.isBillingContact === 'on';
    object.isPrimary = object.isPrimary === 'on';
    const parsed = clientContactInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check contact fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createClientContact(context.principal, parsed.data);
      return { success: true, message: 'Client contact saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createProject: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = projectInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check project fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createProject(context.principal, parsed.data);
      return { success: true, message: `Created ${result.projectNumber}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createMilestone: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = milestoneInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check milestone fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createProjectMilestone(context.principal, parsed.data);
      return { success: true, message: 'Milestone draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitMilestone: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid milestone record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return { success: true, message: 'Milestone submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateSchedule: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = scheduleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check schedule fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProjectSchedule(context.principal, parsed.data);
      return { success: true, message: 'Expected schedule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  assignWorker: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = assignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check assignment fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.assignWorker(context.principal, parsed.data);
      return { success: true, message: 'Assignment created' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInvitation: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invitationInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid invitation',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.createInvitation(context.principal, parsed.data);
      const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
      return { success: true, message: `Invite created: ${publicBase}/app/invite/${result.token}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTime: async ({ locals, request, params }) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = timeInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check time fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createTimeEntry(context.principal, parsed.data);
      return { success: true, message: 'Time draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateTime: async ({ locals, request, params }) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = timeInputSchema.and(versionedRecordSchema).safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check time fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateTimeEntry(context.principal, {
        id: parsed.data.id,
        version: parsed.data.version,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        activityCode: parsed.data.activityCode,
        minutes: parsed.data.minutes,
        summary: parsed.data.summary,
      });
      return { success: true, message: 'Time draft updated' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTime: async ({ locals, request, params }) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid time record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitTime(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Time submitted' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createExpense: async ({ locals, request, params }) => {
    if (params.section !== 'expenses')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const receipt = object.receipt;
    object.receiptRequired =
      object.receiptRequired === 'on' || (receipt instanceof File && receipt.size > 0);
    object.amountMinor = decimalToMinor(object.amount);
    for (const key of [
      'projectCurrencyAmountMinor',
      'fxRateBps',
      'taxAmountMinor',
      'markupBps',
      'paymentMethod',
      'receiptDocumentId',
    ]) {
      if (object[key] === '') object[key] = undefined;
    }
    const preflight = expenseInputSchema.safeParse(object);
    if (!preflight.success)
      return fail(400, {
        success: false,
        message: 'Check expense fields',
        fields: preflight.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    let createdReceiptId: string | undefined;
    let createdReceiptStorageKey: string | undefined;
    let createdReceiptStoragePath: string | undefined;
    let receiptFileCreated = false;
    try {
      if (receipt instanceof File && receipt.size > 0) {
        if (
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/pdf',
          ].includes(receipt.type) ||
          receipt.size > 10_000_000
        )
          return fail(400, {
            success: false,
            message: 'Receipt must be JPG, PNG or PDF under 10 MB',
          });
        const bytes = new Uint8Array(await receipt.arrayBuffer());
        if (!receiptSignature(receipt.type, bytes))
          return fail(400, {
            success: false,
            message: 'Receipt content does not match its declared file type',
          });
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const extension =
          receipt.type === 'application/pdf'
            ? 'pdf'
            : receipt.type === 'image/png'
              ? 'png'
              : receipt.type === 'image/webp'
                ? 'webp'
                : receipt.type === 'image/heic'
                  ? 'heic'
                  : receipt.type === 'image/heif'
                    ? 'heif'
                    : 'jpg';
        const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extension}`;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        const targetRelativePath = relative(root, target);
        if (
          !targetRelativePath ||
          targetRelativePath.split(/[\\/]/).includes('..') ||
          targetRelativePath.startsWith('\\') ||
          targetRelativePath.startsWith('/')
        )
          return fail(400, { success: false, message: 'Invalid receipt path' });
        createdReceiptStoragePath = target;
        await mkdir(resolve(root, sha256.slice(0, 2)), { recursive: true });
        try {
          await writeFile(target, bytes, { flag: 'wx' });
          receiptFileCreated = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        const document = context.repository.registerReceipt(context.principal, {
          projectId: String(object.projectId),
          sha256,
          mediaType: receipt.type,
          byteLength: receipt.size,
          storageKey,
          originalFilename: receipt.name.slice(0, 200),
        });
        object.receiptDocumentId = document.id;
        if (document.created) {
          createdReceiptId = document.id;
          createdReceiptStorageKey = storageKey;
        } else if (receiptFileCreated) {
          await unlink(target);
          receiptFileCreated = false;
        }
      }
      const parsed = expenseInputSchema.safeParse(object);
      if (!parsed.success)
        return fail(400, {
          success: false,
          message: 'Check expense fields',
          fields: parsed.error.flatten().fieldErrors,
        });
      context.repository.createExpense(context.principal, parsed.data);
      return { success: true, message: 'Expense draft saved' };
    } catch (error) {
      if (createdReceiptId && createdReceiptStorageKey) {
        const removedKey = context.repository.removeUnreferencedReceipt(
          context.principal,
          createdReceiptId,
        );
        if (removedKey) {
          const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
          const target = resolve(root, removedKey);
          const relativePath = relative(root, target);
          if (
            relativePath &&
            !relativePath.split(/[\\/]/).includes('..') &&
            !relativePath.startsWith('\\') &&
            !relativePath.startsWith('/')
          )
            await unlink(target).catch(() => undefined);
        }
      }
      if (receiptFileCreated && createdReceiptStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdReceiptStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await unlink(createdReceiptStoragePath).catch(() => undefined);
      }
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  uploadPrivateDocument: async ({ locals, request, params }) => {
    if (params.section !== 'documents')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const file = object.file;
    const projectId = String(object.projectId ?? '').trim();
    const artifactType = String(object.artifactType ?? '').trim();
    const description = String(object.description ?? '').trim();
    const sensitivity = String(object.sensitivity ?? 'internal');
    if (!(file instanceof File) || file.size < 1)
      return fail(400, { success: false, message: 'Choose a private document to upload' });
    if (!projectId || !artifactType || !description)
      return fail(400, {
        success: false,
        message: 'Project, artifact type and description are required',
      });
    if (!['internal', 'sensitive', 'customer_private'].includes(sensitivity))
      return fail(400, { success: false, message: 'Document sensitivity is invalid' });
    const allowed = [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ];
    if (!allowed.includes(file.type) || file.size > 50_000_000)
      return fail(400, { success: false, message: 'Unsupported document type or size over 50 MB' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!privateDocumentSignature(file.type, bytes))
      return fail(400, {
        success: false,
        message: 'Document content does not match its declared type',
      });
    const context = openPortalRepository(locals);
    let createdStorageKey: string | null = null;
    let createdStoragePath: string | null = null;
    let storageFileCreated = false;
    try {
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const lowerType = artifactType.toLowerCase();
      const folder = lowerType.includes('backup')
        ? 'plc-backups'
        : lowerType.includes('report')
          ? 'reports'
          : 'technical';
      const storageKey = `${folder}/${sha256.slice(0, 2)}/${sha256}.${privateDocumentExtension(file.type)}`;
      const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
      const target = resolve(root, storageKey);
      const relativePath = relative(root, target);
      if (
        !relativePath ||
        relativePath.split(/[\\/]/).includes('..') ||
        relativePath.startsWith('\\') ||
        relativePath.startsWith('/')
      )
        return fail(400, { success: false, message: 'Invalid private document path' });
      createdStorageKey = storageKey;
      createdStoragePath = target;
      await mkdir(resolve(target, '..'), { recursive: true });
      try {
        await writeFile(target, bytes, { flag: 'wx' });
        storageFileCreated = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const document = context.repository.registerPrivateDocument(context.principal, {
        projectId,
        sha256,
        mediaType: file.type,
        byteLength: file.size,
        storageKey,
        originalFilename: file.name.slice(0, 200),
        description,
        artifactType,
        sensitivity: sensitivity as 'internal' | 'sensitive' | 'customer_private',
      });
      if (!document.created && storageFileCreated) {
        await unlink(target);
        storageFileCreated = false;
      }
      return { success: true, message: 'Private document uploaded and hash-registered' };
    } catch (error) {
      if (storageFileCreated && createdStorageKey && createdStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await unlink(createdStoragePath).catch(() => undefined);
      }
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitExpense: async ({ locals, request, params }) => {
    if (params.section !== 'expenses')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid expense record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitExpense(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Expense submitted' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  approveRecord: async ({ locals, request, params }) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = approvalDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid approval decision' });
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.operationalApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      else
        context.repository.operationalApproveExpense(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      return { success: true, message: 'Decision recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  financeApprove: async ({ locals, request, params }) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = financeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid finance decision' });
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.financeApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.billable === 'yes',
        );
      else context.repository.financeApproveExpense(context.principal, parsed.data.id);
      return { success: true, message: 'Finance review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createBillingRule: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.autoGenerateDraft = object.autoGenerateDraft === 'on';
    const parsed = billingRuleInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid billing stream',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createBillingRule(context.principal, parsed.data);
      return { success: true, message: 'Billing stream saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createLegalEntity: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = legalEntityInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check legal entity fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createLegalEntity(context.principal, parsed.data);
      return { success: true, message: 'Legal entity saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInvoiceNumberPolicy: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.accountantApprovedAt = normalizeLocalDateTime(object.accountantApprovedAt);
    const parsed = invoiceNumberPolicyInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check invoice-number policy fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createInvoiceNumberPolicy(context.principal, parsed.data);
      return { success: true, message: 'Invoice-number policy saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTaxProfile: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.componentCompound = object.componentCompound === 'on';
    const parsed = taxProfileInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check tax profile fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createTaxProfile(context.principal, {
        legalEntityId: parsed.data.legalEntityId || undefined,
        name: parsed.data.name,
        currency: parsed.data.currency,
        effectiveFrom: parsed.data.effectiveFrom,
        components: [
          {
            name: parsed.data.componentName,
            basisPoints: parsed.data.componentBasisPoints,
            compound: parsed.data.componentCompound,
          },
        ],
      });
      return { success: true, message: 'Tax profile saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createDraft: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invoicePeriodSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid billing period' });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createInvoiceDraft(
        context.principal,
        parsed.data.billingRuleId,
        parsed.data.periodStart,
        parsed.data.periodEnd,
      );
      return {
        success: true,
        message: result.created ? 'Invoice draft created' : 'Existing draft returned',
      };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInvoiceAdjustment: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invoiceAdjustmentSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Invalid invoice adjustment' });
    const context = openPortalRepository(locals);
    try {
      context.repository.createInvoiceAdjustment(context.principal, parsed.data);
      return { success: true, message: 'Adjustment draft created' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  approveInvoice: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invoiceIdSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid invoice' });
    const context = openPortalRepository(locals);
    try {
      context.repository.approveInvoiceDraft(context.principal, parsed.data.invoiceId);
      return { success: true, message: 'Invoice approved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  issueInvoice: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invoiceIdSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid invoice' });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.issueInvoice(context.principal, parsed.data.invoiceId);
      return { success: true, message: `Issued ${result.invoiceNumber}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordPayment: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.amountMinor = decimalToMinor(object.amount);
    if (typeof object.receivedOn === 'string')
      object.receivedAt = `${object.receivedOn}T12:00:00.000Z`;
    const parsed = paymentInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid payment',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.recordPayment(context.principal, parsed.data);
      return { success: true, message: 'Payment recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  closePeriod: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = billingCloseSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid billing period' });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.closeBillingPeriod(
        context.principal,
        parsed.data.billingRuleId,
        parsed.data.periodStart,
        parsed.data.periodEnd,
      );
      if (!result.closed)
        return fail(409, {
          success: false,
          message: 'Period is incomplete',
          reasons: result.reasons,
        });
      return { success: true, message: 'Billing period closed and sources locked' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  voidInvoice: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = voidInvoiceSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid void request' });
    const context = openPortalRepository(locals);
    try {
      context.v3.voidInvoice(
        context.principal,
        parsed.data.invoiceId,
        parsed.data.reason,
        parsed.data.idempotencyKey,
      );
      return { success: true, message: 'Invoice voided with audit trail' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  sendInvoice: async ({ locals, request, params }) => {
    if (params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = sendInvoiceSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid send request' });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.sendInvoice(
        context.principal,
        parsed.data.invoiceId,
        parsed.data.idempotencyKey,
      );
      return {
        success: true,
        message: result.sent ? 'Invoice marked sent' : 'Invoice was already sent',
      };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAccountingPack: async ({ locals, request, params }) => {
    if (params.section !== 'accounting')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = accountingPackPeriodSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid accounting period' });
    const context = openPortalRepository(locals);
    try {
      const pack = context.v3.createAccountingPack(
        context.principal,
        parsed.data.periodStart,
        parsed.data.periodEnd,
      );
      return { success: true, message: `Accounting Pack ${pack.id.slice(0, 8)} is ready` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  finalizeAccountingPack: async ({ locals, request, params }) => {
    if (params.section !== 'accounting')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const packId = typeof object.packId === 'string' ? object.packId : '';
    const context = openPortalRepository(locals);
    try {
      context.v3.markAccountingPackFinal(context.principal, packId);
      return { success: true, message: 'Accounting Pack marked final' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  runJobs: async ({ locals, params }) => {
    if (params.section !== 'accounting' && params.section !== 'billing')
      return fail(404, { success: false, message: 'Wrong section' });
    const context = openPortalRepository(locals);
    try {
      if (context.principal.role !== 'owner_admin' && context.principal.role !== 'finance_admin')
        return fail(403, { success: false, message: 'Finance role required' });
      context.v3.scheduleCoreJobs();
      const result = runArtifactJobs(context);
      return { success: true, message: `Jobs processed: ${result.processed}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createCompensationRule: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = compensationRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid compensation rule',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createCompensationRule(context.principal, parsed.data);
      return { success: true, message: 'Worker compensation rule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  settleCompensation: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = compensationSettlementInputSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid settlement period' });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.settleCompensation(context.principal, parsed.data);
      return { success: true, message: `Settled ${result.length} compensation rule(s)` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordReimbursement: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.amountMinor = object.amountMinor ? String(object.amountMinor) : undefined;
    const parsed = reimbursementInputSchema.safeParse(object);
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid reimbursement' });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordReimbursement(context.principal, {
        expenseId: parsed.data.expenseId,
        amountMinor: parsed.data.amountMinor ? BigInt(parsed.data.amountMinor) : undefined,
        reference: parsed.data.reference,
      });
      return { success: true, message: `Reimbursement recorded: ${result.amountMinor}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientLaborRate: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.eligibleForPercentage = object.eligibleForPercentage === 'on';
    const parsed = clientLaborRateInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid client rate',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createClientLaborRate(context.principal, parsed.data);
      return { success: true, message: 'Client labor rate saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInternalCostRule: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = internalCostRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid internal cost rule',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createInternalCostRule(context.principal, parsed.data);
      return { success: true, message: 'Internal cost rule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAssignmentRateOverride: async ({ locals, request, params }) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = assignmentRateOverrideInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid assignment override',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createAssignmentRateOverride(context.principal, parsed.data);
      return { success: true, message: 'Assignment rate override saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  markNotificationRead: async ({ locals, request, params }) => {
    if (params.section !== 'notifications')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    if (typeof object.notificationId !== 'string' || !object.notificationId)
      return fail(400, { success: false, message: 'Notification is required' });
    const context = openPortalRepository(locals);
    try {
      context.repository.markNotificationRead(context.principal, object.notificationId);
      return { success: true, message: 'Notification marked as read' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
