import { json, type RequestHandler } from '@sveltejs/kit';
import {
  enqueueLocalizedPdfRender,
  localizedPdfDownloadLocation,
  mapLocalizedPdfError,
  publicLocalizedPdfVariant,
} from '$lib/server/localized-pdf-api';
import { openPortalRepository } from '$lib/server/portal-repository';

export const POST: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) return json({ error: 'Sign in required' }, { status: 401 });
  const variantId = params.variantId?.trim() ?? '';
  if (!variantId) return json({ error: 'Localized PDF variant not found' }, { status: 404 });
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
    const mapped = mapLocalizedPdfError(cause);
    if (mapped) return json(mapped.body, { status: mapped.status });
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
