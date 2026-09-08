import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { base } from '$app/paths';
import {
  manualForRole,
  normalizeManualLocale,
  readManualPdf,
  type ManualLocale,
} from '$lib/server/manual-catalog';
import { openPortalRepository } from '$lib/server/portal-repository';

function privateHeaders(): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': 'sandbox',
  };
}

function errorResponse(message: string, status: number): Response {
  return json({ error: message }, { status, headers: privateHeaders() });
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user || !locals.session) return errorResponse(`Sign in required.`, 401);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);

    const manualId = params.manual?.trim() ?? '';
    const manual = manualForRole(manualId, context.principal.role);
    // The same response is used for an unknown id and a role-disallowed manual so
    // a worker cannot probe for the existence of the Owner reference.
    if (!manual) return errorResponse('Help document not found.', 404);

    const requestedLocale = normalizeManualLocale(url.searchParams.get('lang'));
    if (!requestedLocale) return errorResponse('Unsupported manual language.', 400);
    const locale: ManualLocale = manual.assets[requestedLocale] ? requestedLocale : 'en';

    let bytes: Buffer;
    try {
      bytes = await readManualPdf(manual, locale);
    } catch (cause) {
      console.error(
        JSON.stringify({
          event: 'help.manual.read_failed',
          manual: manual.id,
          locale,
          error: cause instanceof Error ? cause.message : 'unknown error',
        }),
      );
      return errorResponse('Help document is temporarily unavailable.', 503);
    }

    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    const languageSuffix = locale === 'pt' ? 'PT-BR' : locale.toUpperCase();
    const filename = `${manual.id}-${languageSuffix}-${manual.revision}.pdf`;
    return new Response(body.buffer as ArrayBuffer, {
      headers: {
        ...privateHeaders(),
        'content-type': 'application/pdf',
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDisposition(filename),
        'x-help-manual-revision': manual.revision,
        'x-help-manual-language': locale,
        'x-help-manual-path': `${base}/app/help/${manual.id}/download`,
      },
    });
  } catch (cause) {
    if (cause instanceof AccessDeniedError) return errorResponse('Sign in required.', 401);
    throw cause;
  } finally {
    context?.sqlite.close();
  }
};
