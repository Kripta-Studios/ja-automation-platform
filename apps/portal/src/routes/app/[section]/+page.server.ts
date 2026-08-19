import {
  approvalDecisionSchema,
  assignmentInputSchema,
  assignmentRateOverrideInputSchema,
  clientContactInputSchema,
  clientLaborRateInputSchema,
  clientInputSchema,
  compensationSettlementInputSchema,
  compensationRuleInputSchema,
  expenseInputSchema,
  financeDecisionSchema,
  invitationInputSchema,
  internalCostRuleInputSchema,
  milestoneInputSchema,
  projectInputSchema,
  reimbursementInputSchema,
  scheduleInputSchema,
  timeInputSchema,
  versionedRecordSchema,
  uuidSchema,
} from '@ja/schemas';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  decimalToMinor,
  formObject,
  privateDocumentExtension,
  privateDocumentSignature,
  receiptSignature,
} from '$lib/server/action-utils';
import { billingActions } from '$lib/server/actions/billing-actions';
import { reportActions } from '$lib/server/actions/operations-actions';
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

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const mondayOf = (value: string | null): string => {
  const candidate =
    value && isoDatePattern.test(value) ? value : new Date().toISOString().slice(0, 10);
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return mondayOf(null);
  const distance = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - distance);
  return date.toISOString().slice(0, 10);
};

const weeklyView = (
  rows: readonly Record<string, unknown>[],
  weekStart: string,
): {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    label: string;
    expectedMinutes: number;
    actualMinutes: number;
    differenceMinutes: number;
    status: string;
    categories: Record<string, number>;
  }>;
} => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateValue = date.toISOString().slice(0, 10);
    const dayRows = rows.filter((row) => row.work_date === dateValue);
    const actualMinutes = dayRows.reduce((sum, row) => sum + Number(row.minutes ?? 0), 0);
    const categories = dayRows.reduce<Record<string, number>>((result, row) => {
      const category = String(row.category ?? 'other');
      result[category] = (result[category] ?? 0) + Number(row.minutes ?? 0);
      return result;
    }, {});
    const states = new Set(dayRows.map((row) => String(row.approval_state ?? 'draft')));
    const status =
      dayRows.length === 0
        ? '—'
        : states.has('needs_changes') || states.has('rejected')
          ? 'Needs changes'
          : states.has('submitted')
            ? 'Submitted'
            : states.has('draft')
              ? 'Draft'
              : actualMinutes !== 600 && index < 6
                ? 'Needs note'
                : 'Approved';
    const expectedMinutes = index < 6 ? 600 : 0;
    return {
      date: dateValue,
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      expectedMinutes,
      actualMinutes,
      differenceMinutes: actualMinutes - expectedMinutes,
      status,
      categories,
    };
  });
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart, weekEnd: end.toISOString().slice(0, 10), days };
};
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
      searchSuggestions: context.repository.searchSuggestions(context.principal),
      searchResults:
        searchQuery.length >= 2 ? context.repository.search(context.principal, searchQuery) : [],
    };
    switch (section) {
      case 'time': {
        const weekStart = mondayOf(url.searchParams.get('week'));
        const week = context.repository.listOwnTimeWeek(context.principal, weekStart);
        const timesheet = weeklyView(week.rows as Array<Record<string, unknown>>, weekStart);
        const weeklyPay =
          context.principal.role === 'worker'
            ? context.v3.workerPay(context.principal, weekStart, week.weekEnd)
            : undefined;
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnTime(context.principal),
          weekStart,
          weekEnd: week.weekEnd,
          timesheet,
          weeklyPay,
        };
      }
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

export const actions: Actions = {
  ...reportActions,
  ...billingActions,
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
  updateUserStatus: async ({ locals, request, params }) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const userId = typeof object.userId === 'string' ? object.userId : '';
    const status = typeof object.status === 'string' ? object.status : '';
    const parsedId = uuidSchema.safeParse(userId);
    if (!parsedId.success || !['active', 'suspended', 'offboarded', 'archived'].includes(status))
      return fail(400, { success: false, message: 'Invalid account status change' });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateUserStatus(
        context.principal,
        userId,
        status as 'active' | 'suspended' | 'offboarded' | 'archived',
      );
      return { success: true, message: `Account marked ${status}` };
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
  copyTimeLayout: async ({ locals, request, params }) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const targetWeekStart = mondayOf(
      typeof object.targetWeekStart === 'string' ? object.targetWeekStart : null,
    );
    const sourceWeekStart = mondayOf(
      typeof object.sourceWeekStart === 'string' ? object.sourceWeekStart : null,
    );
    if (sourceWeekStart === targetWeekStart)
      return fail(400, { success: false, message: 'Choose a different source week' });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.copyOwnTimeLayout(
        context.principal,
        sourceWeekStart,
        targetWeekStart,
      );
      return {
        success: true,
        message: `${result.created} layout draft${result.created === 1 ? '' : 's'} added for ${targetWeekStart}; minutes remain 0.`,
      };
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
