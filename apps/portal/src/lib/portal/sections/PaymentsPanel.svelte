<script lang="ts">
  /**
   * Owner "Payments": open invoices first (most overdue on top), balance per
   * currency, and an inline one-step "Record payment" on each row.
   */
  import { base } from '$app/paths';
  import { moneyText, type MoneyCopyKey } from '../money-copy';
  import RecordPaymentForm from './RecordPaymentForm.svelte';
  import { collectionSummaries } from '../collections-analysis';

  type Row = Record<string, unknown>;
  let {
    ledger,
    today,
    locale = 'en',
    money,
    canRecord,
  }: {
    ledger: Row[];
    today: string;
    locale?: string;
    money: (minor: unknown, currency?: string) => string;
    canRecord: boolean;
  } = $props();

  const t = (key: MoneyCopyKey, params: Record<string, string | number> = {}) =>
    moneyText(locale, key, params);
  const big = (value: unknown) => {
    const text = String(value ?? '0');
    return /^-?\d+$/u.test(text) ? BigInt(text) : 0n;
  };
  const day = (value: unknown) => String(value ?? '').slice(0, 10);
  const daysBetween = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  const open = $derived(
    ledger
      .filter((row) => String(row.billingStatus) !== 'void' && big(row.outstandingMinor) > 0n)
      .map((row) => {
        const due = day(row.dueDate);
        const late = due ? daysBetween(due, today) : 0;
        return { row, due, late };
      })
      .sort((a, b) => b.late - a.late || a.due.localeCompare(b.due)),
  );
  // "Still owed" nets issued credit notes exactly like the ledger's customer balance.
  const totals = $derived.by(() => {
    const byCurrency = new Map<
      string,
      { owed: bigint; overdue: bigint; credits: bigint; count: number }
    >();
    for (const summary of collectionSummaries(ledger, `${today}T23:59:59.999Z`)) {
      if (summary.netOutstanding === 0n && summary.credits === 0n && summary.outstanding === 0n)
        continue;
      byCurrency.set(summary.currency, {
        owed: summary.netOutstanding,
        overdue: summary.overdue,
        credits: summary.credits,
        count: 0,
      });
    }
    for (const item of open) {
      const entry = byCurrency.get(String(item.row.currency));
      if (entry) entry.count += 1;
    }
    return [...byCurrency.entries()]
      .filter(([, entry]) => entry.count > 0 || entry.owed !== 0n)
      .sort(([a], [b]) => a.localeCompare(b));
  });

  let editing = $state('');
  let notice = $state('');
  const invoiceHref = (id: unknown) =>
    `${base}/app/billing/invoices/${encodeURIComponent(String(id))}?lang=${locale}`;
  const dueText = (late: number, due: string) =>
    !due ? '' : late > 0 ? t('daysOverdue', { days: late }) : late === 0 ? t('dueToday') : t('dueInDays', { days: -late });
  const shortDate = (value: string) =>
    value
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(`${value}T00:00:00Z`),
        )
      : '—';
</script>

<section class="payments" aria-labelledby="payments-title" data-payments>
  <header class="payments__head">
    <div>
      <h2 id="payments-title" class="page-title-hidden">{t('paymentsTitle')}</h2>
      <p class="payments__muted">{t(canRecord ? 'paymentsIntro' : 'paymentsIntroReadOnly')}</p>
    </div>
    <a class="secondary-button" href={`${base}/app/finance?view=overview&lang=${locale}`}
      >{t('moneyTitle')}</a
    >
  </header>

  {#if notice}<p class="payments__ok" role="status" data-payment-notice>{notice}</p>{/if}

  {#if totals.length}
    <div class="payments__totals">
      {#each totals as [currency, entry] (currency)}
        <div class="payments__total" class:payments__total--alert={entry.overdue > 0n} data-payments-total={currency}>
          <span>{t('outstanding')}</span>
          <strong>{money(entry.owed.toString(), currency)}</strong>
          <small
            >{entry.overdue > 0n
              ? t('overdue', { amount: money(entry.overdue.toString(), currency) })
              : t('noOverdue')} · {entry.count === 1 ? t('outstandingHelpOne') : t('outstandingHelp', { count: entry.count })}{#if entry.credits < 0n}{' · '}<span data-payments-credits>{t('creditsNetted', { amount: money((-entry.credits).toString(), currency) })}</span>{/if}</small
          >
        </div>
      {/each}
    </div>
  {/if}

  <h3>{t('openInvoices')}</h3>
  {#if open.length === 0}
    <p class="payments__empty" data-payments-empty>{t('noOpenInvoices')}</p>
  {:else}
    <ul class="payments__list" data-payments-open>
      {#each open as item (String(item.row.invoiceId))}
        {@const id = String(item.row.invoiceId)}
        {@const currency = String(item.row.currency)}
        <li class:payments__late={item.late > 0} data-open-invoice={id}>
          <div class="payments__line">
            <div class="payments__who">
              <a href={invoiceHref(id)}><strong>{String(item.row.invoiceNumber ?? id)}</strong></a>
              <span>{String(item.row.clientName ?? '')} · {String(item.row.projectName ?? '')}</span>
              <small>
                {t('due')} {shortDate(item.due)}
                {#if item.due}<b class:payments__badge={item.late > 0}>{dueText(item.late, item.due)}</b>{/if}
              </small>
            </div>
            <div class="payments__amounts">
              <span><small>{t('total')}</small> {money(item.row.totalMinor, currency)}</span>
              <strong data-open-balance>
                <small>{t('balance')}</small>
                {money(item.row.outstandingMinor, currency)}</strong
              >
              {#if big(item.row.collectedMinor) > 0n}<small class="payments__muted">{t('partially_paid')}</small>{/if}
            </div>
            <div class="payments__actions">
              {#if canRecord}
                <button
                  type="button"
                  class={editing === id ? 'secondary-button' : 'primary-button'}
                  aria-expanded={editing === id}
                  onclick={() => {
                    editing = editing === id ? '' : id;
                    notice = '';
                  }}
                  data-record-payment-open={id}>{t('recordPayment')}</button
                >
              {/if}
              <a class="secondary-button" href={invoiceHref(id)}>{t('openInvoice')}</a>
            </div>
          </div>
          {#if editing === id}
            <RecordPaymentForm
              invoiceId={id}
              {currency}
              outstandingMinor={String(item.row.outstandingMinor)}
              action={`${base}/app/billing?/recordPayment`}
              {locale}
              {money}
              oncancel={() => (editing = '')}
              ondone={(message) => {
                editing = '';
                notice = `${String(item.row.invoiceNumber ?? '')} · ${message}`;
              }}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  /* The portal header already shows the page title. */
  .page-title-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .payments {
    display: grid;
    gap: 1rem;
    max-width: 82rem;
    margin-bottom: 1.5rem;
  }
  .payments h2 {
    margin: 0;
    font-size: clamp(1.6rem, 3vw, 2.1rem);
  }
  .payments h3 {
    margin: 0.4rem 0 0;
    font-size: 1.15rem;
  }
  .payments__head {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .payments__muted {
    color: var(--ja-steel, #5b6573);
    margin: 0.2rem 0 0;
  }
  .payments__ok {
    margin: 0;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    background: #ecfdf3;
    border: 1px solid #a6e2bf;
    font-weight: 600;
  }
  .payments__totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .payments__total {
    display: grid;
    gap: 0.25rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    background: var(--ja-white, #fff);
  }
  .payments__total span,
  .payments__total small {
    color: var(--ja-steel, #5b6573);
  }
  .payments__total strong {
    font-size: 1.5rem;
  }
  .payments__total--alert {
    border-color: #f2b8b5;
    background: #fff6f5;
  }
  .payments__empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--ja-line, #d9dee5);
    border-radius: 12px;
  }
  .payments__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .payments__list > li {
    display: grid;
    gap: 0.7rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-left-width: 4px;
    border-radius: 12px;
    padding: 0.8rem 1rem;
    background: var(--ja-white, #fff);
  }
  .payments__list > li.payments__late {
    border-left-color: #b42318;
  }
  .payments__line {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: center;
  }
  .payments__who {
    display: grid;
    gap: 0.15rem;
  }
  .payments__who a {
    color: inherit;
  }
  .payments__who span,
  .payments__who small {
    color: var(--ja-steel, #5b6573);
  }
  .payments__badge {
    color: #b42318;
    margin-left: 0.35rem;
  }
  .payments__amounts {
    display: grid;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .payments__amounts small {
    color: var(--ja-steel, #5b6573);
    font-weight: 400;
  }
  .payments__amounts strong {
    font-size: 1.15rem;
  }
  .payments__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  @media (max-width: 760px) {
    .payments__line {
      grid-template-columns: 1fr;
    }
    .payments__amounts {
      text-align: left;
    }
    .payments__actions > * {
      flex: 1;
      justify-content: center;
    }
  }
</style>
