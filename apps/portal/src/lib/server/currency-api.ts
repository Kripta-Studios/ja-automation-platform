import { json } from '@sveltejs/kit';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';

export const currencyApiHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};

export function currencyApiError(status: number, code: string, message: string) {
  return json({ ok: false, code, message }, { status, headers: currencyApiHeaders });
}

/** Owner / finance only, live session; returns an open context the caller must close. */
type FinanceContext = ReturnType<typeof openPortalRepository>;
export function openFinanceCurrencyContext(
  locals: App.Locals,
): { error: Response; context?: never } | { context: FinanceContext; error?: never } {
  if (!locals.user || !locals.session) return { error: currencyApiError(401, 'SIGN_IN', 'Sign in required') };
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  } catch {
    context.sqlite.close();
    return { error: currencyApiError(401, 'SIGN_IN', 'Live authenticated session required') };
  }
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role)) {
    context.sqlite.close();
    return { error: currencyApiError(403, 'FINANCE_ONLY', 'Owner or finance access required') };
  }
  return { context };
}
