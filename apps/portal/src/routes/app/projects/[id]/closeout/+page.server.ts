import { error, redirect } from '@sveltejs/kit';
import { actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

function writer(role: string | undefined): boolean {
  return role === 'owner_admin' || role === 'finance_admin';
}
function list(form: FormData, name: string): string[] {
  return form
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (!writer(locals.user.role)) error(403, 'Finance role required');
  const context = openPortalRepository(locals);
  try {
    const overview = context.repository.projectOverview(context.principal, params.id);
    const closeout = context.repository.projectCloseoutDetail(context.principal, params.id);
    const documents = context.sqlite
      .prepare(
        "SELECT id,safe_filename,original_filename,artifact_type,sensitivity,media_type,sha256,byte_length FROM document WHERE project_id=? AND state='committed' AND media_type='application/pdf' AND artifact_type IN ('customer_period_pdf','customer_report_pdf','technical_reference','system_reference','backup_reference','approved_customer_document') AND sensitivity IN ('customer_private','operational') AND scan_status IN ('clean','not_scanned') ORDER BY created_at,id",
      )
      .all(params.id);
    return {
      user: locals.user,
      locale:
        url.searchParams.get('lang') === 'es'
          ? 'es'
          : url.searchParams.get('lang') === 'pt'
            ? 'pt'
            : 'en',
      project: overview.project,
      closeout,
      documents,
    };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  prepare: async ({ request, locals, params }) => {
    if (!locals.user || !writer(locals.user.role)) error(403, 'Finance role required');
    const form = await request.formData();
    const context = openPortalRepository(locals);
    try {
      context.repository.prepareProjectCloseout(context.principal, {
        projectId: params.id ?? '',
        clientDocumentIds: list(form, 'documentId'),
      });
      return actionSuccess('action.success', {}, 'Closeout draft prepared');
    } catch (cause) {
      return actionFailure(cause);
    } finally {
      context.sqlite.close();
    }
  },
  refresh: async ({ request, locals }) => {
    if (!locals.user || !writer(locals.user.role)) error(403, 'Finance role required');
    const form = await request.formData();
    const context = openPortalRepository(locals);
    try {
      context.repository.refreshProjectCloseoutDraft(context.principal, {
        revisionId: String(form.get('revisionId') ?? ''),
        ...(form.has('replaceSelection') ? { clientDocumentIds: list(form, 'documentId') } : {}),
      });
      return actionSuccess(
        'action.success',
        {},
        'Closeout draft refreshed; review and confirm the new client snapshot',
      );
    } catch (cause) {
      return actionFailure(cause);
    } finally {
      context.sqlite.close();
    }
  },
  confirmClient: async ({ request, locals }) => {
    if (!locals.user || !writer(locals.user.role)) error(403, 'Finance role required');
    const form = await request.formData();
    const revisionId = String(form.get('revisionId') ?? '');
    const hash = String(form.get('clientSnapshotHash') ?? '');
    const context = openPortalRepository(locals);
    try {
      context.repository.confirmProjectCloseoutClientPublication(
        context.principal,
        revisionId,
        hash,
      );
      return actionSuccess('action.success', {}, 'Exact client snapshot confirmed');
    } catch (cause) {
      return actionFailure(cause);
    } finally {
      context.sqlite.close();
    }
  },
  finalize: async ({ request, locals }) => {
    if (!locals.user || !writer(locals.user.role)) error(403, 'Finance role required');
    const form = await request.formData();
    const context = openPortalRepository(locals);
    try {
      context.repository.finalizeProjectCloseoutRevision(
        context.principal,
        String(form.get('revisionId') ?? ''),
      );
      return actionSuccess('action.success', {}, 'Closeout packages finalized');
    } catch (cause) {
      return actionFailure(cause);
    } finally {
      context.sqlite.close();
    }
  },
  reopen: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'owner_admin') error(403, 'Owner role required');
    const form = await request.formData();
    const context = openPortalRepository(locals);
    try {
      context.repository.reopenProjectCloseout(
        context.principal,
        String(form.get('revisionId') ?? ''),
        String(form.get('reason') ?? ''),
      );
      return actionSuccess('action.success', {}, 'Closeout reopened');
    } catch (cause) {
      return actionFailure(cause);
    } finally {
      context.sqlite.close();
    }
  },
};
