import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import {
  add,
  applyBasisPoints,
  convertExact,
  impliedRate,
  isCurrency,
  money,
  parseRate,
  formatDecimal,
  type Currency,
} from '@ja/money';
import { recordAuditEvent } from '../../core/audit.ts';
import { assertLiveSession } from '../../core/authorization.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { proposeExchangeRate } from './exchange-rates.ts';

export class CurrencyConversionError extends Error {
  constructor(
    readonly code:
      | 'access_denied'
      | 'invalid'
      | 'not_found'
      | 'locked'
      | 'stale_proposal'
      | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

class ConversionAccessError extends CurrencyConversionError {
  constructor(message: string) {
    super('access_denied', message);
  }
}

export type CurrencyConversionSourceKind = 'expense' | 'invoice_line' | 'document';

export type CurrencyConversionRecord = Readonly<{
  id: string;
  sourceKind: CurrencyConversionSourceKind;
  sourceId: string;
  projectId: string | null;
  documentDate: string;
  sourceCurrency: string;
  sourceAmountMinor: string;
  targetCurrency: string;
  targetAmountMinor: string;
  rate: string;
  rateSource: 'ECB' | 'manual';
  rateDate: string | null;
  proposedRate: string | null;
  amountEdited: boolean;
  note: string | null;
  supersedesId: string | null;
  confirmedBy: string;
  confirmedByName: string | null;
  confirmedAt: string;
}>;

export type RecordCurrencyConversionInput = Readonly<{
  sourceKind: CurrencyConversionSourceKind;
  sourceId: string;
  targetCurrency: string;
  /** 1 source unit = rate target units. */
  rate: string;
  rateSource: 'ECB' | 'manual';
  /** Optional manually typed converted amount; when it differs from rate×amount it is kept and flagged. */
  targetAmountMinor?: bigint | null;
  note?: string | null;
  idempotencyKey: string;
  /** Id of the conversion the user saw as current (null when none): concurrency guard. */
  expectedCurrentId: string | null;
  /** Required for non-expense sources (the invoice screen supplies the document truth). */
  source?: Readonly<{
    currency: string;
    amountMinor: bigint;
    documentDate: string;
    projectId: string | null;
  }>;
}>;

const FINANCE_ROLES = new Set(['owner_admin', 'finance_admin']);

function assertFinance(sqlite: DatabaseSync, principal: Principal): void {
  if (!FINANCE_ROLES.has(principal.role))
    throw new ConversionAccessError('Owner or finance access required');
  assertLiveSession(sqlite, principal, ConversionAccessError);
}

type Row = Record<string, string | number | bigint | null>;

function mapRow(row: Row): CurrencyConversionRecord {
  return {
    id: String(row.id),
    sourceKind: row.source_kind as CurrencyConversionSourceKind,
    sourceId: String(row.source_id),
    projectId: row.project_id === null ? null : String(row.project_id),
    documentDate: String(row.document_date),
    sourceCurrency: String(row.source_currency),
    sourceAmountMinor: String(row.source_amount_minor),
    targetCurrency: String(row.target_currency),
    targetAmountMinor: String(row.target_amount_minor),
    rate: String(row.rate_decimal),
    rateSource: row.rate_source as 'ECB' | 'manual',
    rateDate: row.rate_date === null ? null : String(row.rate_date),
    proposedRate: row.proposed_rate_decimal === null ? null : String(row.proposed_rate_decimal),
    amountEdited: Number(row.amount_edited) === 1,
    note: row.note === null ? null : String(row.note),
    supersedesId: row.supersedes_id === null ? null : String(row.supersedes_id),
    confirmedBy: String(row.confirmed_by),
    confirmedByName: row.confirmed_by_name === null ? null : String(row.confirmed_by_name ?? ''),
    confirmedAt: String(row.confirmed_at),
  };
}

const SELECT = `SELECT c.id,c.source_kind,c.source_id,c.project_id,c.document_date,c.source_currency,
       CAST(c.source_amount_minor AS TEXT) source_amount_minor,c.target_currency,
       CAST(c.target_amount_minor AS TEXT) target_amount_minor,c.rate_decimal,c.rate_source,c.rate_date,
       c.proposed_rate_decimal,c.amount_edited,c.note,c.supersedes_id,c.confirmed_by,u.name confirmed_by_name,
       c.confirmed_at
  FROM currency_conversion c LEFT JOIN user u ON u.id=c.confirmed_by`;

/** The current (not superseded) conversion of a source into `targetCurrency`. */
export function currentCurrencyConversion(
  sqlite: DatabaseSync,
  sourceKind: CurrencyConversionSourceKind,
  sourceId: string,
  targetCurrency: string,
): CurrencyConversionRecord | null {
  const row = sqlite
    .prepare(
      `${SELECT} WHERE c.source_kind=? AND c.source_id=? AND c.target_currency=?
         AND NOT EXISTS(SELECT 1 FROM currency_conversion n WHERE n.supersedes_id=c.id)
       ORDER BY c.confirmed_at DESC,c.id DESC LIMIT 1`,
    )
    .get(sourceKind, sourceId, targetCurrency) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function currencyConversionHistory(
  sqlite: DatabaseSync,
  sourceKind: CurrencyConversionSourceKind,
  sourceId: string,
): CurrencyConversionRecord[] {
  return (
    sqlite
      .prepare(`${SELECT} WHERE c.source_kind=? AND c.source_id=? ORDER BY c.confirmed_at DESC,c.id DESC`)
      .all(sourceKind, sourceId) as Row[]
  ).map(mapRow);
}

type ExpenseSource = {
  id: string;
  project_id: string;
  spent_on: string;
  currency: string;
  amount_minor: number;
  invoice_id: string | null;
  billing_state: string;
  billing_lock_id: string | null;
  approval_state: string;
  commercial_classification_state: string;
  client_treatment: string;
  billing_treatment: string;
  markup_bps: number | null;
  project_currency: string;
  version: number;
};

function readExpense(sqlite: DatabaseSync, id: string): ExpenseSource | undefined {
  return sqlite
    .prepare(
      `SELECT e.id,e.project_id,e.spent_on,e.currency,e.amount_minor,e.invoice_id,e.billing_state,
              e.billing_lock_id,e.approval_state,e.commercial_classification_state,e.client_treatment,
              e.billing_treatment,e.markup_bps,e.version,p.currency project_currency
         FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
    )
    .get(id) as ExpenseSource | undefined;
}

/** Converted expense amounts for the billing projection (same math as classification). */
export function convertedExpenseProjection(
  converted: bigint,
  currency: Currency,
  expense: Readonly<{ client_treatment: string; billing_treatment: string; markup_bps: number | null }>,
  taxBps: number,
): { projectCurrencyAmountMinor: bigint; billingAmountMinor: bigint; taxAmountMinor: bigint } {
  const base = money(currency, converted);
  const billing =
    expense.billing_treatment === 'reimbursable_plus_markup'
      ? add(base, applyBasisPoints(base, expense.markup_bps ?? 0))
      : expense.client_treatment === 'reimbursable'
        ? base
        : money(currency, 0n);
  return {
    projectCurrencyAmountMinor: converted,
    billingAmountMinor: billing.minorUnits,
    taxAmountMinor: applyBasisPoints(billing, taxBps).minorUnits,
  };
}

/**
 * Record an explicit, audited conversion. The ECB proposal is recomputed on
 * the server; a client claiming "ECB" with another rate is rejected. A typed
 * converted amount is kept exactly and marked as edited. Rows are immutable;
 * a correction supersedes the previous row.
 */
export function recordCurrencyConversion(
  sqlite: DatabaseSync,
  principal: Principal,
  input: RecordCurrencyConversionInput,
): CurrencyConversionRecord & { idempotent: boolean; projected: boolean } {
  assertFinance(sqlite, principal);
  if (!['expense', 'invoice_line', 'document'].includes(input.sourceKind))
    throw new CurrencyConversionError('invalid', 'Unsupported conversion source');
  if (!isCurrency(input.targetCurrency))
    throw new CurrencyConversionError('invalid', 'Choose a supported currency');
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  if (!idempotencyKey || idempotencyKey.length > 240)
    throw new CurrencyConversionError('invalid', 'Idempotency key is required');
  const parsedRate = parseRate(input.rate);
  if (!parsedRate) throw new CurrencyConversionError('invalid', 'Enter a positive exchange rate');
  const rateText = formatDecimal(parsedRate);
  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new CurrencyConversionError('invalid', 'Note is too long');
  return runImmediateTransaction(sqlite, 'currency-conversion', () => {
    const duplicate = sqlite
      .prepare(`${SELECT} WHERE c.idempotency_key=?`)
      .get(idempotencyKey) as Row | undefined;
    if (duplicate) {
      const record = mapRow(duplicate);
      if (record.sourceKind !== input.sourceKind || record.sourceId !== input.sourceId)
        throw new CurrencyConversionError('conflict', 'Idempotency key was already used');
      return { ...record, idempotent: true, projected: false };
    }
    let sourceCurrency: string;
    let sourceAmountMinor: bigint;
    let documentDate: string;
    let projectId: string | null;
    let expense: ExpenseSource | undefined;
    if (input.sourceKind === 'expense') {
      expense = readExpense(sqlite, input.sourceId);
      if (!expense) throw new CurrencyConversionError('not_found', 'Expense not found');
      if (['void', 'rejected'].includes(expense.approval_state))
        throw new CurrencyConversionError('locked', 'Withdrawn or rejected expense cannot be converted');
      if (expense.invoice_id || expense.billing_lock_id || expense.billing_state !== 'unlocked')
        throw new CurrencyConversionError('locked', 'Invoiced expense keeps its conversion');
      if (input.targetCurrency !== expense.project_currency)
        throw new CurrencyConversionError('invalid', 'Expenses convert into the project currency');
      sourceCurrency = expense.currency;
      sourceAmountMinor = BigInt(expense.amount_minor);
      documentDate = expense.spent_on;
      projectId = expense.project_id;
    } else {
      if (!input.source) throw new CurrencyConversionError('invalid', 'Source amount is required');
      sourceCurrency = input.source.currency;
      sourceAmountMinor = input.source.amountMinor;
      documentDate = input.source.documentDate;
      projectId = input.source.projectId;
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(documentDate))
        throw new CurrencyConversionError('invalid', 'Document date is invalid');
      if (projectId && !sqlite.prepare('SELECT 1 FROM project WHERE id=?').get(projectId))
        throw new CurrencyConversionError('not_found', 'Project not found');
    }
    if (!isCurrency(sourceCurrency))
      throw new CurrencyConversionError('invalid', 'Source currency is not supported');
    if (sourceCurrency === input.targetCurrency)
      throw new CurrencyConversionError('invalid', 'Source and target currency are the same');
    if (sourceAmountMinor < 0n) throw new CurrencyConversionError('invalid', 'Amount is invalid');
    const current = currentCurrencyConversion(
      sqlite,
      input.sourceKind,
      input.sourceId,
      input.targetCurrency,
    );
    if ((current?.id ?? null) !== (input.expectedCurrentId ?? null))
      throw new CurrencyConversionError('conflict', 'The conversion changed; review it again');
    const target = input.targetCurrency as Currency;
    const sourceCode = sourceCurrency as Currency;
    const proposal = proposeExchangeRate(sqlite, sourceCode, target, documentDate);
    if (input.rateSource === 'ECB' && (!proposal || proposal.rate !== rateText))
      throw new CurrencyConversionError('stale_proposal', 'The ECB rate changed; review it again');
    const calculated = convertExact(money(sourceCode, sourceAmountMinor), parsedRate, target).target
      .minorUnits;
    const typed = input.targetAmountMinor ?? null;
    if (typed !== null && typed < 0n)
      throw new CurrencyConversionError('invalid', 'Converted amount is invalid');
    const amountEdited = typed !== null && typed !== calculated;
    const targetAmountMinor = amountEdited ? typed! : calculated;
    // An edited amount is a manual decision even when it started from the ECB proposal.
    const rateSource = amountEdited ? 'manual' : input.rateSource;
    const storedRate =
      amountEdited && sourceAmountMinor > 0n
        ? impliedRate(money(sourceCode, sourceAmountMinor), money(target, targetAmountMinor))
        : rateText;
    const id = newId();
    const confirmedAt = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO currency_conversion(id,source_kind,source_id,project_id,document_date,source_currency,
           source_amount_minor,target_currency,target_amount_minor,rate_decimal,rate_source,rate_date,
           proposed_rate_decimal,amount_edited,note,supersedes_id,confirmed_by,confirmed_at,idempotency_key)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.sourceKind,
        input.sourceId,
        projectId,
        documentDate,
        sourceCurrency,
        sourceAmountMinor,
        input.targetCurrency,
        targetAmountMinor,
        storedRate,
        rateSource,
        rateSource === 'ECB' ? proposal!.rateDate : (proposal?.rateDate ?? null),
        proposal?.rate ?? null,
        amountEdited ? 1 : 0,
        note,
        current?.id ?? null,
        principal.userId,
        confirmedAt,
        idempotencyKey,
      );
    let projected = false;
    if (expense && expense.commercial_classification_state !== 'unclassified') {
      const tax = sqlite
        .prepare(
          'SELECT tax_bps FROM expense_classification_revision WHERE expense_id=? ORDER BY revision_number DESC LIMIT 1',
        )
        .get(expense.id) as { tax_bps: number } | undefined;
      const projection = convertedExpenseProjection(
        targetAmountMinor,
        target,
        expense,
        tax?.tax_bps ?? 0,
      );
      const changed = sqlite
        .prepare(
          `UPDATE expense SET project_currency_amount_minor=?,billing_amount_minor=?,tax_amount_minor=?,
                  fx_rate_bps=NULL,version=version+1,updated_at=?
            WHERE id=? AND version=? AND invoice_id IS NULL AND billing_state='unlocked'
              AND billing_lock_id IS NULL`,
        )
        .run(
          projection.projectCurrencyAmountMinor,
          projection.billingAmountMinor,
          projection.taxAmountMinor,
          confirmedAt,
          expense.id,
          expense.version,
        );
      if (Number(changed.changes) !== 1)
        throw new CurrencyConversionError('conflict', 'Expense changed during conversion');
      projected = true;
    }
    recordAuditEvent(sqlite, principal, 'currency_conversion.confirm', 'currency_conversion', id, {
      projectId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceCurrency,
      sourceAmountMinor: sourceAmountMinor.toString(),
      targetCurrency: input.targetCurrency,
      targetAmountMinor: targetAmountMinor.toString(),
      rate: storedRate,
      rateSource,
      rateDate: proposal?.rateDate ?? null,
      proposedRate: proposal?.rate ?? null,
      amountEdited,
      supersedesId: current?.id ?? null,
      projectedToExpense: projected,
    });
    const record = currentCurrencyConversion(
      sqlite,
      input.sourceKind,
      input.sourceId,
      input.targetCurrency,
    )!;
    return { ...record, idempotent: false, projected };
  });
}
