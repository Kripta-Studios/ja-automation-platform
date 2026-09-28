import type { PageServerLoad } from './$types';
import type { ProblemData } from '$lib/problem/contract';
import { randomUUID } from 'node:crypto';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import {
  openSupplierContext,
  supplierPeriod,
  supplierReadFailure,
} from '$lib/server/supplier-context';
export const load: PageServerLoad = ({ locals, url, cookies }) => {
  const ctx = openSupplierContext(locals);
  try {
    const projects = ctx.supplier.listProjects(ctx.principal);
    // An explicit deep link remains selected even when its current scope changes.
    const projectId = url.searchParams.has('projectId')
      ? (url.searchParams.get('projectId') ?? '').trim()
      : (projects[0]?.id ?? '');
    const supplierId = url.searchParams.get('supplierId') || undefined;
    const period = supplierPeriod(url, locals.correlationId);
    const reference = locals.correlationId || randomUUID();
    let projectProblem: ProblemData | null = null;
    let unavailableProject: { id: string; name: string; status?: string } | null = null;
    if (!projectId && projects.length === 0) {
      projectProblem = {
        code: 'SUPPLIER_REPORT_NO_PROJECTS',
        messageKey: 'problem.supplier.reportNoProjects',
        message:
          'No operational projects are currently available for this report. Ask the owner to review project status or your access.',
        params: {},
        fieldErrors: {},
        remedies:
          ctx.principal.role === 'owner_admin'
            ? [{ id: 'review_supplier_projects' }]
            : [{ id: 'contact_owner' }],
        correlationId: reference,
      };
    } else if (!projectId) {
      projectProblem = {
        code: 'SUPPLIER_REPORT_PROJECT_REQUIRED',
        messageKey: 'problem.supplier.reportProjectRequired',
        message: 'Choose an operational project before viewing this report.',
        params: {},
        fieldErrors: { projectId: ['problem.supplier.reportProjectRequired'] },
        remedies: [{ id: 'choose_operational_project' }],
        correlationId: reference,
      };
    } else if (projectId && !projects.some((project) => project.id === projectId)) {
      const owner = ctx.principal.role === 'owner_admin';
      const record = owner
        ? (ctx.sqlite.prepare('SELECT name,status FROM project WHERE id=?').get(projectId) as
            | { name: string; status: string }
            | undefined)
        : undefined;
      unavailableProject = {
        id: projectId,
        name: record?.name ?? '',
        status: record?.status,
      };
      projectProblem =
        owner && record
          ? {
              code: 'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
              messageKey: 'problem.supplier.reportProjectUnavailable',
              message: `${record.name} is ${record.status}. Choose an available operational project or review its status.`,
              params: { projectName: record.name, status: record.status },
              fieldErrors: {},
              remedies: [{ id: 'review_supplier_project', projectId }],
              correlationId: reference,
            }
          : {
              code: 'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
              messageKey: 'problem.supplier.reportProjectScopeChanged',
              message:
                'This project is no longer available in your operational report scope. Choose an available project or ask the owner to review your access.',
              params: {},
              fieldErrors: {},
              remedies: [{ id: 'contact_owner' }],
              correlationId: reference,
            };
    }
    const suppliers =
      ctx.principal.role === 'owner_admin' ? ctx.supplier.listSuppliers(ctx.principal) : [];
    let supplierProblem: ProblemData | null = null;
    if (
      supplierId &&
      ctx.principal.role === 'owner_admin' &&
      !suppliers.some((supplier) => supplier.id === supplierId)
    )
      supplierProblem = {
        code: 'SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE',
        messageKey: 'problem.supplier.reportSupplierUnavailable',
        message:
          'The selected supplier is no longer available. Choose another supplier or clear the filter.',
        params: {},
        fieldErrors: { supplierId: ['problem.supplier.reportSupplierUnavailable'] },
        remedies: [{ id: 'choose_supplier' }],
        correlationId: reference,
      };
    const workforceProfile = ctx.sqlite
      .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
      .get(ctx.principal.userId) as { profile?: string } | undefined;
    return {
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      owner: ctx.principal.role === 'owner_admin',
      technician: workforceProfile?.profile === 'external_technician',
      projects,
      projectId,
      projectProblem,
      unavailableProject,
      supplierProblem,
      supplierId,
      ...period,
      suppliers,
      report:
        projectId && !period.periodProblem && !projectProblem && !supplierProblem
          ? ctx.supplier.operationalReport(ctx.principal, {
              projectId,
              supplierId,
              from: period.from,
              to: period.to,
            })
          : null,
    };
  } catch (caught) {
    supplierReadFailure(caught);
  } finally {
    ctx.sqlite.close();
  }
};
