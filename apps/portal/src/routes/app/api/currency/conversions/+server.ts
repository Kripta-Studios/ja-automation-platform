import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  CurrencyConversionError,
  currencyConversionHistory,
  currentCurrencyConversion,
  proposeExchangeRate,
  recordCurrencyConversion,
} from '@ja/database';
import { CURRENCIES } from '@ja/billing-engine';
import {
  currencyApiError,
  currencyApiHeaders,
  openFinanceCurrencyContext,
} from '$lib/server/currency-api';

const sourceKind = z.enum(['expense', 'invoice_line', 'document']);

/** GET ?sourceKind=expense&sourceId=..&targetCurrency=USD -> current conversion, history, ECB proposal. */
export const GET: RequestHandler = ({ locals, url }) => {
  const parsed = z
    .object({
      sourceKind,
      sourceId: z.string().min(1).max(200),
      targetCurrency: z.enum(CURRENCIES),
      sourceCurrency: z.enum(CURRENCIES).optional(),
      documentDate: z.iso.date().optional(),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return currencyApiError(400, 'INVALID', 'Invalid conversion source');
  const opened = openFinanceCurrencyContext(locals);
  if (opened.error) return opened.error;
  const { context } = opened;
  try {
    const q = parsed.data;
    let sourceCurrency: string | null = q.sourceCurrency ?? null;
    let documentDate = q.documentDate ?? null;
    if (q.sourceKind === 'expense') {
      const expense = context.sqlite
        .prepare('SELECT currency,spent_on FROM expense WHERE id=?')
        .get(q.sourceId) as { currency: string; spent_on: string } | undefined;
      if (!expense) return currencyApiError(404, 'NOT_FOUND', 'Expense not found');
      sourceCurrency = expense.currency;
      documentDate = expense.spent_on;
    }
    return json(
      {
        ok: true,
        current: currentCurrencyConversion(context.sqlite, q.sourceKind, q.sourceId, q.targetCurrency),
        history: currencyConversionHistory(context.sqlite, q.sourceKind, q.sourceId),
        proposal:
          sourceCurrency && documentDate
            ? proposeExchangeRate(context.sqlite, sourceCurrency, q.targetCurrency, documentDate)
            : null,
      },
      { headers: currencyApiHeaders },
    );
  } finally {
    context.sqlite.close();
  }
};

const postSchema = z
  .object({
    sourceKind,
    sourceId: z.string().min(1).max(200),
    targetCurrency: z.enum(CURRENCIES),
    rate: z.string().trim().min(1).max(24),
    rateSource: z.enum(['ECB', 'manual']),
    targetAmountMinor: z.string().regex(/^\d{1,15}$/u).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    idempotencyKey: z.string().min(8).max(240),
    expectedCurrentId: z.string().min(1).max(200).nullable(),
    source: z
      .object({
        currency: z.enum(CURRENCIES),
        amountMinor: z.string().regex(/^\d{1,15}$/u),
        documentDate: z.iso.date(),
        projectId: z.string().min(1).max(200).nullable(),
      })
      .optional(),
  })
  .strict();

/** POST -> record an explicit, audited, immutable conversion (owner / finance). */
export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (request.headers.get('origin') !== url.origin)
    return currencyApiError(403, 'ORIGIN', 'Cross-site request rejected');
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return currencyApiError(400, 'INVALID', 'Check the rate and amount');
  const opened = openFinanceCurrencyContext(locals);
  if (opened.error) return opened.error;
  const { context } = opened;
  try {
    const input = parsed.data;
    const record = recordCurrencyConversion(context.sqlite, context.principal, {
      ...input,
      targetAmountMinor:
        input.targetAmountMinor === undefined || input.targetAmountMinor === null
          ? null
          : BigInt(input.targetAmountMinor),
      source: input.source
        ? { ...input.source, amountMinor: BigInt(input.source.amountMinor) }
        : undefined,
    });
    return json({ ok: true, conversion: record }, { headers: currencyApiHeaders });
  } catch (error) {
    if (error instanceof CurrencyConversionError) {
      const status =
        error.code === 'access_denied' ? 403 : error.code === 'not_found' ? 404 : error.code === 'invalid' ? 400 : 409;
      return currencyApiError(status, error.code.toUpperCase(), error.message);
    }
    throw error;
  } finally {
    context.sqlite.close();
  }
};
