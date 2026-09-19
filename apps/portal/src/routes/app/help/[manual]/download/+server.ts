import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { base } from '$app/paths';
import {
  manualForPersona,
  normalizeManualLocale,
  personaForPrincipal,
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

const messages = {
  en: {
    signIn: 'Sign in required.',
    notFound: 'Help document not found.',
    language: 'Unsupported manual language.',
    unavailable: 'Help document is temporarily unavailable.',
  },
  es: {
    signIn: 'Debes iniciar sesión.',
    notFound: 'No se encontró el documento de ayuda.',
    language: 'Idioma de manual no admitido.',
    unavailable: 'El documento de ayuda no está disponible temporalmente.',
  },
  pt: {
    signIn: 'É necessário entrar na conta.',
    notFound: 'Documento de ajuda não encontrado.',
    language: 'Idioma do manual não aceito.',
    unavailable: 'O documento de ajuda está temporariamente indisponível.',
  },
} as const;
type ErrorKey = keyof typeof messages.en;
function errorResponse(key: ErrorKey, status: number, locale: ManualLocale): Response {
  return json({ error: messages[locale][key] }, { status, headers: privateHeaders() });
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const GET: RequestHandler = async ({ locals, params, url, cookies }) => {
  const errorLocale =
    normalizeManualLocale(url.searchParams.get('lang')) ??
    normalizeManualLocale(cookies?.get('ja.portal.locale') ?? cookies?.get('ja-portal-locale')) ??
    'en';
  if (!locals.user || !locals.session) return errorResponse('signIn', 401, errorLocale);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);

    const manualId = params.manual?.trim() ?? '';
    const manual = manualForPersona(
      manualId,
      personaForPrincipal(context.sqlite, context.principal),
    );
    // The same response is used for an unknown id and a role-disallowed manual so
    // a worker cannot probe for the existence of the Owner reference.
    if (!manual) return errorResponse('notFound', 404, errorLocale);

    const requestedLocale = normalizeManualLocale(url.searchParams.get('lang'));
    if (!requestedLocale) return errorResponse('language', 400, errorLocale);
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
      return errorResponse('unavailable', 503, errorLocale);
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
    if (cause instanceof AccessDeniedError) return errorResponse('signIn', 401, errorLocale);
    throw cause;
  } finally {
    context?.sqlite.close();
  }
};
