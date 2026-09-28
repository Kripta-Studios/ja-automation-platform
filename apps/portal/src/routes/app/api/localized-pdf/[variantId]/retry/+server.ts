import { json, type RequestHandler } from '@sveltejs/kit';
import {
  enqueueLocalizedPdfRender,
  localizedPdfDownloadLocation,
  localizedPdfProblem,
  mapLocalizedPdfError,
  publicLocalizedPdfVariant,
} from '$lib/server/localized-pdf-api';
import { openPortalRepository } from '$lib/server/portal-repository';

export const POST: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return json(localizedPdfProblem('signInRequired'), {
      status: 401,
      headers: { 'cache-control': 'private, no-store' },
    });
  const variantId = params.variantId?.trim() ?? '';
  if (!variantId)
    return json(localizedPdfProblem('unavailable'), {
      status: 404,
      headers: { 'cache-control': 'private, no-store' },
    });
  const context = openPortalRepository(locals);
  try {
    const enqueueState: { value: { id: string; created: boolean } | null } = { value: null };
    const variant = context.localizedPdf.retryLocalizedPdfVariant(
      context.principal,
      variantId,
      (persisted) => {
        enqueueState.value = enqueueLocalizedPdfRender(context, persisted);
      },
    );
    const headers = {
      'cache-control': 'private, no-store',
      location: localizedPdfDownloadLocation(url, variant.variantId),
      'retry-after': '2',
    };
    return json(
      {
        variant: publicLocalizedPdfVariant(variant),
        job: enqueueState.value
          ? { id: enqueueState.value.id, created: enqueueState.value.created }
          : null,
      },
      { status: 202, headers },
    );
  } catch (cause) {
    const mapped = mapLocalizedPdfError(cause, {
      owner: context.principal.role === 'owner_admin',
    });
    if (mapped)
      return json(mapped.body, {
        status: mapped.status,
        headers: { 'cache-control': 'private, no-store' },
      });
    const problem = localizedPdfProblem('unexpected', {
      correlationId: locals.correlationId,
    });
    console.error('Unexpected localized PDF retry failure', {
      correlationId: problem.correlationId,
      cause,
    });
    return json(problem, {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  } finally {
    context.sqlite.close();
  }
};
