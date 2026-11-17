import { json, type RequestHandler } from '@sveltejs/kit';
import {
  fxRefreshConfig,
  lastExchangeRateFetch,
  latestStoredRateDate,
  proposeExchangeRate,
  refreshExchangeRates,
} from '@ja/database';
import { isCurrency } from '@ja/billing-engine';
import { env } from '$env/dynamic/private';
import {
  currencyApiError,
  currencyApiHeaders,
  openFinanceCurrencyContext,
} from '$lib/server/currency-api';

/** GET ?from=MXN&to=USD&date=2026-11-16 -> ECB proposal for the document date (or null). */
export const GET: RequestHandler = ({ locals, url }) => {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!isCurrency(from) || !isCurrency(to) || !/^\d{4}-\d{2}-\d{2}$/u.test(date))
    return currencyApiError(400, 'INVALID', 'Choose two currencies and a date');
  const opened = openFinanceCurrencyContext(locals);
  if ('error' in opened) return opened.error;
  const { context } = opened;
  try {
    return json(
      {
        ok: true,
        proposal: proposeExchangeRate(context.sqlite, from, to, date),
        latestRateDate: latestStoredRateDate(context.sqlite),
        lastFetch: lastExchangeRateFetch(context.sqlite),
        fetchEnabled: fxRefreshConfig(env).enabled,
      },
      { headers: currencyApiHeaders },
    );
  } finally {
    context.sqlite.close();
  }
};

/** POST {operation:'refresh'} -> fetch ECB rates now (owner / finance). */
export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (request.headers.get('origin') !== url.origin)
    return currencyApiError(403, 'ORIGIN', 'Cross-site request rejected');
  const body = (await request.json().catch(() => null)) as { operation?: unknown } | null;
  if (body?.operation !== 'refresh') return currencyApiError(400, 'INVALID', 'Unknown operation');
  const opened = openFinanceCurrencyContext(locals);
  if ('error' in opened) return opened.error;
  const { context } = opened;
  try {
    const result = await refreshExchangeRates(context.sqlite, {
      trigger: 'on_demand',
      config: fxRefreshConfig(env),
      actor: { userId: context.principal.userId, correlationId: locals.correlationId },
    });
    return json(
      { ok: result.outcome !== 'failed', ...result, lastFetch: lastExchangeRateFetch(context.sqlite) },
      { status: result.outcome === 'failed' ? 503 : 200, headers: currencyApiHeaders },
    );
  } finally {
    context.sqlite.close();
  }
};
