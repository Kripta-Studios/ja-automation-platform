import type { DatabaseSync } from 'node:sqlite';
import { proposeExchangeRate } from '@ja/database';
import { convertExact, exactMoney, isCurrency, type Currency } from '@ja/billing-engine';

/**
 * Indicative project-currency amount of a foreign-currency expense, from the
 * stored ECB reference rate of the expense date (T36). It is shown next to the
 * original amount while approving ("≈ US$ 21.35 · ECB 20 Nov") and is never
 * stored: the verified conversion stays an explicit Finance step.
 * Exact integer arithmetic (convertExact), rounded half away from zero once.
 */
export type ExpenseEstimate = {
  minor: string;
  currency: string;
  rateDate: string;
};

export function expenseEstimate(
  sqlite: DatabaseSync,
  amountMinor: string,
  currency: string,
  projectCurrency: string,
  spentOn: string,
): ExpenseEstimate | null {
  if (!projectCurrency || currency === projectCurrency) return null;
  if (!isCurrency(currency) || !isCurrency(projectCurrency) || !/^\d+$/u.test(amountMinor))
    return null;
  const proposal = proposeExchangeRate(sqlite, currency, projectCurrency, spentOn);
  if (!proposal) return null;
  try {
    const converted = convertExact(
      exactMoney(currency as Currency, BigInt(amountMinor)),
      proposal.rate,
      projectCurrency as Currency,
    );
    return {
      minor: converted.target.minorUnits.toString(),
      currency: projectCurrency,
      rateDate: proposal.rateDate,
    };
  } catch {
    return null;
  }
}
