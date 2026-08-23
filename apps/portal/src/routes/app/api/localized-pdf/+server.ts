import { json, type RequestHandler } from '@sveltejs/kit';
import {
  LOCALIZED_PDF_GENERATION_VERSION,
  isLocalizedPdfLocale,
  isLocalizedPdfOwnerType,
  localizedPdfDownloadLocation,
  mapLocalizedPdfError,
  normalizedLocalizedPdfLocale,
  enqueueLocalizedPdfRender,
  publicLocalizedPdfVariant,
} from '$lib/server/localized-pdf-api';
import type { LocalizedPdfOwnerType } from '@ja/database';
import { REPORT_TEMPLATE_VERSION } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';

function unauthorized(): Response {
  return json(
    { error: 'Sign in required' },
    { status: 401, headers: { 'cache-control': 'no-store' } },
  );
}

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return unauthorized();
  const ownerTypeValue = url.searchParams.get('ownerType');
  const ownerId = url.searchParams.get('ownerId');
  if ((ownerTypeValue && !ownerId) || (!ownerTypeValue && ownerId))
    return json({ error: 'ownerType and ownerId must be provided together' }, { status: 400 });
  if (ownerTypeValue && !isLocalizedPdfOwnerType(ownerTypeValue))
    return json({ error: 'Unsupported localized PDF owner type' }, { status: 400 });

  // Keep the database lifecycle local to this request; no metadata is retained in memory.
  const context = openPortalRepository(locals);
  try {
    const variants = context.localizedPdf.listLocalizedPdfVariants(
      context.principal,
      ownerTypeValue && ownerId
        ? { ownerType: ownerTypeValue as LocalizedPdfOwnerType, ownerId }
        : undefined,
    );
    return json(
      { variants: variants.map(publicLocalizedPdfVariant) },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (cause) {
    const mapped = mapLocalizedPdfError(cause);
    if (mapped) return json(mapped.body, { status: mapped.status });
    throw cause;
  } finally {
    context.sqlite.close();
  }
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!locals.user || !locals.session) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'A JSON request body is required' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'A JSON request body is required' }, { status: 400 });
  const values = body as Record<string, unknown>;
  if (!isLocalizedPdfOwnerType(values.ownerType))
    return json({ error: 'Unsupported localized PDF owner type' }, { status: 400 });
  if (typeof values.ownerId !== 'string' || !values.ownerId.trim())
    return json({ error: 'ownerId is required' }, { status: 400 });
  if (!isLocalizedPdfLocale(values.locale))
    return json({ error: 'Locale must be en, es or pt-BR' }, { status: 400 });

  const context = openPortalRepository(locals);
  try {
    const enqueueState: { value: { id: string; created: boolean } | null } = { value: null };
    const variant = context.localizedPdf.requestLocalizedPdf(
      context.principal,
      {
        ownerType: values.ownerType,
        ownerId: values.ownerId,
        locale: normalizedLocalizedPdfLocale(values.locale),
        templateVersion: REPORT_TEMPLATE_VERSION,
        generationVersion: LOCALIZED_PDF_GENERATION_VERSION,
      },
      (persisted) => {
        // The repository invokes this hook inside its write transaction. If enqueueing fails,
        // SQLite rolls back both the variant and the job instead of exposing an orphan request.
        enqueueState.value = enqueueLocalizedPdfRender(context, persisted);
      },
    );
    const queued = variant.status === 'queued' || variant.status === 'running';
    const headers: Record<string, string> = {
      'cache-control': 'private, no-store',
    };
    if (queued) {
      headers.location = localizedPdfDownloadLocation(url, variant.variantId);
      headers['retry-after'] = '2';
    }
    return json(
      {
        variant: publicLocalizedPdfVariant(variant),
        job: enqueueState.value
          ? { id: enqueueState.value.id, created: enqueueState.value.created }
          : null,
      },
      {
        status: queued ? 202 : 200,
        headers,
      },
    );
  } catch (cause) {
    const mapped = mapLocalizedPdfError(cause);
    if (mapped) return json(mapped.body, { status: mapped.status });
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
