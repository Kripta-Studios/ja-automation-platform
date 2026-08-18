import {
  approvalDecisionSchema,
  assignmentInputSchema,
  clientInputSchema,
  dailyReportInputSchema,
  expenseInputSchema,
  financeDecisionSchema,
  invoiceIdSchema,
  invoicePeriodSchema,
  paymentInputSchema,
  planningAssignmentInputSchema,
  projectInputSchema,
  reportDecisionSchema,
  technicalReportInputSchema,
  timeInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
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
];
export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!sections.includes(params.section)) error(404, 'Page not found');
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const common = { user: locals.user, section: params.section };
    switch (params.section) {
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
        };
      case 'expenses':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnExpenses(context.principal),
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
          pay: context.repository.workerPay(context.principal, periodStart, periodEnd),
        };
      }
      case 'projects':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          clients:
            context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin'
              ? context.repository.listClients(context.principal)
              : [],
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
        };
      case 'approvals':
        return { ...common, records: context.repository.listApprovalQueue(context.principal) };
      case 'planning':
        return {
          ...common,
          records: context.repository.listPlanning(context.principal),
          projects: context.repository.listAssignedProjects(context.principal),
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
        };
      case 'notifications':
        return { ...common, records: context.repository.listNotifications(context.principal) };
      case 'billing':
        return {
          ...common,
          billingRules: context.repository.listBillingRules(context.principal),
          invoices: context.repository.listInvoices(context.principal),
        };
      case 'finance': {
        const projects = context.repository.listFinanceProjects(context.principal);
        const selected =
          url.searchParams.get('project') ?? (projects[0] as { id?: string } | undefined)?.id ?? '';
        return {
          ...common,
          projects,
          selectedProjectId: selected,
          finance: selected ? context.repository.projectFinance(context.principal, selected) : null,
        };
      }
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
    const context = openPortalRepository(locals);
    try {
      if (receipt instanceof File && receipt.size > 0) {
        if (
          !['image/jpeg', 'image/png', 'application/pdf'].includes(receipt.type) ||
          receipt.size > 10_000_000
        )
          return fail(400, {
            success: false,
            message: 'Receipt must be JPG, PNG or PDF under 10 MB',
          });
        const bytes = new Uint8Array(await receipt.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const extension =
          receipt.type === 'application/pdf' ? 'pdf' : receipt.type === 'image/png' ? 'png' : 'jpg';
        const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extension}`;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        if (!target.startsWith(root))
          return fail(400, { success: false, message: 'Invalid receipt path' });
        await mkdir(resolve(root, sha256.slice(0, 2)), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        });
        const document = context.repository.registerReceipt(context.principal, {
          projectId: String(object.projectId),
          sha256,
          mediaType: receipt.type,
          byteLength: receipt.size,
          storageKey,
          originalFilename: receipt.name.slice(0, 200),
        });
        object.receiptDocumentId = document.id;
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
    const parsed = paymentInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid payment',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.recordPayment(context.principal, parsed.data);
      return { success: true, message: 'Payment recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
