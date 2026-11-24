import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  businessDaysBetween,
  currencyConversionHistory,
  currentCurrencyConversion,
  exchangeRateRefreshDue,
  expectedLatestEcbDate,
  fxRefreshConfig,
  parseEcbXml,
  proposeExchangeRate,
  recordCurrencyConversion,
  verifiedExpenseProjectAmountMinor,
  refreshExchangeRates,
  storeEcbRates,
  CurrencyConversionError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from './fixtures/b5-lifecycle-security-fixture';

const xml = readFileSync(resolve('tests/fixtures/fx/ecb-hist-sample.xml'), 'utf8');
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  return f;
}
const okFetch = (body: string) => async () => ({ ok: true, status: 200, text: async () => body });
const enabled = fxRefreshConfig({ JA_FX_FETCH_ENABLED: 'true' });

describe('ECB reference rates', () => {
  it('parses the fixture XML into exact decimal text, oldest day first', () => {
    const days = parseEcbXml(xml);
    expect(days.map((day) => day.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-16']);
    expect(days[2]!.rates).toMatchObject({ USD: '1.0567', MXN: '19.421', JPY: '163.42' });
    expect(() => parseEcbXml('<html>maintenance</html>')).toThrow();
  });

  it('is disabled by default outside production and configurable by env', () => {
    expect(fxRefreshConfig({ NODE_ENV: 'test' }).enabled).toBe(false);
    expect(fxRefreshConfig({ NODE_ENV: 'production' }).enabled).toBe(true);
    expect(fxRefreshConfig({ NODE_ENV: 'production', JA_FX_FETCH_ENABLED: 'false' }).enabled).toBe(false);
    const custom = fxRefreshConfig({ JA_FX_SOURCE_URL: 'https://mirror.example/eurofxref-daily.xml' });
    expect(custom.historyUrl).toBe('https://mirror.example/eurofxref-hist-90d.xml');
  });

  it('knows the ECB publication calendar', () => {
    // Monday 2026-11-16 10:00 CET -> Friday's rates are the latest expected
    expect(expectedLatestEcbDate(new Date('2026-11-16T09:00:00Z'))).toBe('2026-11-13');
    expect(expectedLatestEcbDate(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-16');
    expect(expectedLatestEcbDate(new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-13');
    expect(businessDaysBetween('2026-11-13', '2026-11-16')).toBe(1);
  });

  it('refreshes idempotently, logs failures without throwing and never overwrites a stored rate', async () => {
    const f = fixture();
    const now = () => new Date('2026-11-16T17:00:00Z');
    expect(exchangeRateRefreshDue(f.sqlite, now())).toBe(true);
    const failed = await refreshExchangeRates(f.sqlite, {
      trigger: 'scheduled',
      config: enabled,
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      },
      now,
    });
    expect(failed).toMatchObject({ outcome: 'failed', errorCode: 'FX_NETWORK_UNAVAILABLE' });
    // A failed attempt backs off for an hour instead of hammering the source.
    expect(exchangeRateRefreshDue(f.sqlite, now())).toBe(false);
    const first = await refreshExchangeRates(f.sqlite, { trigger: 'on_demand', config: enabled, fetchImpl: okFetch(xml), now });
    expect(first).toMatchObject({ outcome: 'succeeded', inserted: 16, latestDate: '2026-11-16' });
    const again = await refreshExchangeRates(f.sqlite, { trigger: 'on_demand', config: enabled, fetchImpl: okFetch(xml), now });
    expect(again).toMatchObject({ outcome: 'succeeded', inserted: 0 });
    expect(exchangeRateRefreshDue(f.sqlite, now())).toBe(false);
    const revised = storeEcbRates(f.sqlite, [{ date: '2026-11-16', rates: { USD: '1.1' } }], 'x');
    expect(revised).toMatchObject({ inserted: 0, conflicts: 1 });
    expect(f.sqlite.prepare("SELECT rate_decimal FROM exchange_rate WHERE rate_date='2026-11-16' AND quote_currency='USD'").get()).toEqual({ rate_decimal: '1.0567' });
    expect(f.sqlite.prepare("SELECT outcome,trigger_kind FROM exchange_rate_fetch ORDER BY attempted_at,rowid").all()).toEqual([
      { outcome: 'failed', trigger_kind: 'scheduled' },
      { outcome: 'succeeded', trigger_kind: 'on_demand' },
      { outcome: 'succeeded', trigger_kind: 'on_demand' },
    ]);
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE action='exchange_rate.refresh'").get()).toEqual({ n: 2 });
    const disabled = await refreshExchangeRates(f.sqlite, { trigger: 'scheduled', config: fxRefreshConfig({}), fetchImpl: okFetch(xml) });
    expect(disabled.outcome).toBe('disabled');
  });

  it('proposes the cross rate of the document date or the last business day before it', () => {
    const f = fixture();
    storeEcbRates(f.sqlite, parseEcbXml(xml), '2026-11-16T17:00:00Z');
    // Sunday 2026-11-15 falls back to Friday 2026-11-13
    expect(proposeExchangeRate(f.sqlite, 'MXN', 'USD', '2026-11-15', '2026-11-16')).toMatchObject({
      rateDate: '2026-11-13',
      rate: '0.0543859649',
      source: 'ECB',
      stale: false,
    });
    expect(proposeExchangeRate(f.sqlite, 'MXN', 'USD', '2026-11-16', '2026-11-16')?.rate).toBe('0.0544101746');
    expect(proposeExchangeRate(f.sqlite, 'EUR', 'JPY', '2026-11-16', '2026-11-16')?.rate).toBe('163.42');
    // ARS is not published by ECB: manual only
    expect(proposeExchangeRate(f.sqlite, 'ARS', 'USD', '2026-11-16')).toBeNull();
    // Before the first stored day: no proposal
    expect(proposeExchangeRate(f.sqlite, 'MXN', 'USD', '2026-11-01')).toBeNull();
    // A document two weeks after the last rate is flagged stale
    expect(proposeExchangeRate(f.sqlite, 'MXN', 'USD', '2026-11-30', '2026-12-01')).toMatchObject({ stale: true, rateDate: '2026-11-16' });
  });
});

describe('audited currency conversion', () => {
  function seedMxnExpense(f: B5LifecycleSecurityFixture, id = 'fx-expense-1') {
    const now = new Date().toISOString();
    f.sqlite
      .prepare(
        `INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
           approval_state,created_at,updated_at,commercial_classification_state)
         VALUES(?,?,'b5-worker','2026-11-16','meals','MXN',100000,'reimbursable','approved',?,?,'unclassified')`,
      )
      .run(id, f.project.id, now, now);
    return id;
  }

  // T14 (audit 2026-11-22): a confirmed conversion is the verified project-currency amount
  // for the Accounting Pack and the finance banner, even before it is projected on the expense.
  it('treats a confirmed conversion of the receipt amount as the verified project amount', () => {
    const f = fixture();
    const owner = stepUpB5Principal(f.sqlite, f.owner, 'fx-verified');
    const expenseId = seedMxnExpense(f, 'fx-verified');
    const row = {
      id: expenseId,
      currency: 'MXN',
      project_currency: 'EUR',
      amount_minor: '100000',
      project_currency_amount_minor: null,
    };
    expect(verifiedExpenseProjectAmountMinor(f.sqlite, row)).toBeNull();
    recordCurrencyConversion(f.sqlite, owner, {
      sourceKind: 'expense',
      sourceId: expenseId,
      targetCurrency: 'EUR',
      rate: '0.05',
      rateSource: 'manual',
      idempotencyKey: 'conv-verified',
      expectedCurrentId: null,
    });
    expect(verifiedExpenseProjectAmountMinor(f.sqlite, row)).toBe('5000');
    // A conversion of another receipt amount is not this expense's verified amount.
    expect(verifiedExpenseProjectAmountMinor(f.sqlite, { ...row, amount_minor: '90000' })).toBeNull();
  });

  it('records the ECB proposal or a manual edit immutably with who confirmed, and audits it', () => {
    const f = fixture();
    storeEcbRates(f.sqlite, parseEcbXml(xml), '2026-11-16T17:00:00Z');
    const owner = stepUpB5Principal(f.sqlite, f.owner, 'fx');
    const expenseId = seedMxnExpense(f);
    const proposal = proposeExchangeRate(f.sqlite, 'MXN', 'EUR', '2026-11-16')!;
    expect(proposal.rate).toBe('0.0514906544');
    const first = recordCurrencyConversion(f.sqlite, owner, {
      sourceKind: 'expense',
      sourceId: expenseId,
      targetCurrency: 'EUR',
      rate: proposal.rate,
      rateSource: 'ECB',
      idempotencyKey: 'conv-1',
      expectedCurrentId: null,
    });
    expect(first).toMatchObject({
      sourceCurrency: 'MXN',
      sourceAmountMinor: '100000',
      targetCurrency: 'EUR',
      targetAmountMinor: '5149',
      rateSource: 'ECB',
      rateDate: '2026-11-16',
      amountEdited: false,
      confirmedBy: 'b5-owner',
      idempotent: false,
    });
    // Retrying the same request is idempotent.
    expect(
      recordCurrencyConversion(f.sqlite, owner, {
        sourceKind: 'expense', sourceId: expenseId, targetCurrency: 'EUR', rate: proposal.rate,
        rateSource: 'ECB', idempotencyKey: 'conv-1', expectedCurrentId: null,
      }).idempotent,
    ).toBe(true);
    // A client cannot claim ECB for a different rate.
    expect(() =>
      recordCurrencyConversion(f.sqlite, owner, {
        sourceKind: 'expense', sourceId: expenseId, targetCurrency: 'EUR', rate: '0.06',
        rateSource: 'ECB', idempotencyKey: 'conv-x', expectedCurrentId: first.id,
      }),
    ).toThrow(CurrencyConversionError);
    // Stale view of the current conversion is rejected.
    expect(() =>
      recordCurrencyConversion(f.sqlite, owner, {
        sourceKind: 'expense', sourceId: expenseId, targetCurrency: 'EUR', rate: '0.05',
        rateSource: 'manual', idempotencyKey: 'conv-y', expectedCurrentId: null,
      }),
    ).toThrow(/changed/);
    // Manual amount supersedes the first conversion and is flagged as edited.
    const edited = recordCurrencyConversion(f.sqlite, owner, {
      sourceKind: 'expense', sourceId: expenseId, targetCurrency: 'EUR', rate: proposal.rate,
      rateSource: 'ECB', targetAmountMinor: 5_200n, note: 'Bank statement amount',
      idempotencyKey: 'conv-2', expectedCurrentId: first.id,
    });
    expect(edited).toMatchObject({ targetAmountMinor: '5200', rateSource: 'manual', amountEdited: true, rate: '0.052', proposedRate: '0.0514906544', supersedesId: first.id });
    expect(currentCurrencyConversion(f.sqlite, 'expense', expenseId, 'EUR')?.id).toBe(edited.id);
    expect(currencyConversionHistory(f.sqlite, 'expense', expenseId)).toHaveLength(2);
    expect(() => f.sqlite.prepare('UPDATE currency_conversion SET target_amount_minor=1').run()).toThrow(/immutable/);
    const audits = f.sqlite
      .prepare("SELECT actor_id,entity_id,metadata_json FROM audit_event WHERE action='currency_conversion.confirm' ORDER BY rowid")
      .all() as Array<{ actor_id: string; entity_id: string; metadata_json: string }>;
    expect(audits.map((row) => row.entity_id)).toEqual([first.id, edited.id]);
    expect(JSON.parse(audits[1]!.metadata_json)).toMatchObject({ rateSource: 'manual', amountEdited: true, targetAmountMinor: '5200', supersedesId: first.id });
  });

  it('allows owner/finance only and only into the project currency', () => {
    const f = fixture();
    const expenseId = seedMxnExpense(f, 'fx-expense-2');
    const worker = stepUpB5Principal(f.sqlite, f.worker, 'fx');
    const owner = stepUpB5Principal(f.sqlite, f.owner, 'fx2');
    const input = { sourceKind: 'expense' as const, sourceId: expenseId, targetCurrency: 'EUR', rate: '0.05', rateSource: 'manual' as const, idempotencyKey: 'w-1', expectedCurrentId: null };
    expect(() => recordCurrencyConversion(f.sqlite, worker, input)).toThrow(/Owner or finance/);
    expect(() => recordCurrencyConversion(f.sqlite, f.owner, { ...input, idempotencyKey: 'o-0' })).toThrow(/session/i);
    expect(() => recordCurrencyConversion(f.sqlite, owner, { ...input, targetCurrency: 'USD', idempotencyKey: 'o-1' })).toThrow(/project currency/);
    expect(recordCurrencyConversion(f.sqlite, owner, { ...input, idempotencyKey: 'o-2' })).toMatchObject({ rateSource: 'manual', rateDate: null, targetAmountMinor: '5000' });
  });
});
