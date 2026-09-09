import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { normalizePortalLocale } from '$lib/portal-i18n';
import {
  openSupplierContext,
  supplierPeriod,
  supplierReadFailure,
} from '$lib/server/supplier-context';
import { actionFailure } from '$lib/server/portal-repository';

export const load: PageServerLoad = ({ locals, url, cookies }) => {
  const ctx = openSupplierContext(locals);
  try {
    const owner = ctx.principal.role === 'owner_admin';
    const profile = ctx.sqlite
      .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
      .get(ctx.principal.userId);
    if (profile?.profile === 'external_technician')
      redirect(303, '/j-aautomation/app/supplier/report');
    const projects = ctx.supplier.listProjects(ctx.principal);
    const projectId = url.searchParams.get('projectId') || projects[0]?.id || '';
    const period = supplierPeriod(url);
    return {
      owner,
      correctionRequestId: randomUUID(),
      locale: normalizePortalLocale(
        url.searchParams.get('lang') ??
          cookies.get('ja.portal.locale') ??
          cookies.get('ja-portal-locale'),
      ),
      projects,
      projectId,
      ...period,
      suppliers: ctx.supplier.listSuppliers(ctx.principal),
      technicians: ctx.supplier.listTechnicians(ctx.principal) as {
        id: string;
        name: string;
        supplierId: string;
      }[],
      assigned: projectId
        ? (ctx.supplier.listTechnicians(ctx.principal, projectId) as {
            id: string;
            name: string;
            supplierId: string;
          }[])
        : [],
      entries: projectId ? ctx.supplier.listTime(ctx.principal, { projectId, ...period }) : [],
      accounts: owner
        ? (ctx.sqlite
            .prepare(
              `SELECT u.id,u.name,s.profile,s.supplier_id supplierId FROM user u
        LEFT JOIN supplier_user_profile s ON s.user_id=u.id WHERE u.role='worker' AND u.status='active' AND (EXISTS(SELECT 1 FROM account a WHERE a.user_id=u.id AND (a.provider_id<>'credential' OR length(a.password)>0)) OR EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=u.id)) ORDER BY u.name`,
            )
            .all() as {
            id: string;
            name: string;
            profile: string | null;
            supplierId: string | null;
          }[])
        : [],
      grants: owner
        ? (ctx.supplier.listGrants(ctx.principal) as {
            id: string;
            supplierName: string;
            projectName: string;
            coordinatorName: string;
            startsOn: string;
            endsOn: string | null;
            status: string;
          }[])
        : [],
    };
  } catch (caught) {
    supplierReadFailure(caught);
  } finally {
    ctx.sqlite.close();
  }
};

function action(operation: string): Actions[string] {
  return async ({ locals, request }) => {
    const values = Object.fromEntries(
      [...(await request.formData())].map(([key, value]) => [
        key,
        typeof value === 'string' ? value : '',
      ]),
    );
    const ctx = openSupplierContext(locals);
    try {
      const text = (key: string) => values[key] ?? '';
      const optional = (key: string) => text(key) || undefined;
      switch (operation) {
        case 'createSupplier':
          ctx.supplier.createSupplier(ctx.principal, { name: text('name') });
          break;
        case 'setProfile': {
          const profile = text('profile');
          if (!['standard', 'external_technician', 'supplier_coordinator'].includes(profile))
            return fail(400, { success: false, operation, values });
          ctx.supplier.setAccountProfile(ctx.principal, {
            userId: text('userId'),
            profile: profile as 'standard' | 'external_technician' | 'supplier_coordinator',
            supplierId: profile === 'standard' ? undefined : optional('supplierId'),
          });
          break;
        }
        case 'grant':
          ctx.supplier.grantProject(ctx.principal, {
            supplierId: text('supplierId'),
            projectId: text('projectId'),
            coordinatorId: text('coordinatorId'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'revoke':
          ctx.supplier.revokeProject(ctx.principal, { id: text('id') });
          break;
        case 'addTechnician':
          ctx.supplier.addTechnician(ctx.principal, {
            supplierId: optional('supplierId'),
            projectId: text('projectId'),
            name: text('name'),
            email: optional('email'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'assignTechnician':
          ctx.supplier.assignTechnician(ctx.principal, {
            workerId: text('workerId'),
            projectId: text('projectId'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'createTime':
          ctx.supplier.createTime(ctx.principal, {
            workerId: text('workerId'),
            projectId: text('projectId'),
            workDate: text('workDate'),
            category: text('category'),
            minutes: Number(text('minutes')),
            summary: text('summary'),
          });
          break;
        case 'correctTime':
          ctx.supplier.createTimeCorrection(ctx.principal, {
            originalId: text('id'),
            requestId: text('requestId'),
            reason: text('reason'),
          });
          break;
        case 'submitTime':
          ctx.supplier.submitTime(ctx.principal, {
            id: text('id'),
            version: Number(text('version')),
          });
          break;
        case 'updateTime':
          ctx.supplier.updateTime(ctx.principal, {
            id: text('id'),
            version: Number(text('version')),
            workDate: text('workDate'),
            category: text('category'),
            minutes: Number(text('minutes')),
            summary: text('summary'),
          });
          break;
      }
      return { success: true, operation, values: {} };
    } catch (caught) {
      const result = actionFailure(caught);
      return fail(result.status, { ...result.data, operation, values });
    } finally {
      ctx.sqlite.close();
    }
  };
}
export const actions: Actions = Object.fromEntries(
  [
    'createSupplier',
    'setProfile',
    'grant',
    'revoke',
    'addTechnician',
    'assignTechnician',
    'createTime',
    'submitTime',
    'updateTime',
    'correctTime',
  ].map((name) => [name, action(name)]),
);
