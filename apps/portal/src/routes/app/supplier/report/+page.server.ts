import type { PageServerLoad } from './$types';
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
    const projectId = url.searchParams.get('projectId') || projects[0]?.id;
    const supplierId = url.searchParams.get('supplierId') || undefined;
    const period = supplierPeriod(url);
    return {
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      owner: ctx.principal.role === 'owner_admin',
      projects,
      projectId,
      supplierId,
      ...period,
      suppliers:
        ctx.principal.role === 'owner_admin' ? ctx.supplier.listSuppliers(ctx.principal) : [],
      report: projectId
        ? ctx.supplier.operationalReport(ctx.principal, { projectId, supplierId, ...period })
        : null,
    };
  } catch (caught) {
    supplierReadFailure(caught);
  } finally {
    ctx.sqlite.close();
  }
};
