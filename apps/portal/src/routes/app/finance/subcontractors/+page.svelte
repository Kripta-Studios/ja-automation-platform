<script lang="ts">
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import { paymentMoney } from '$lib/portal/payment-money';
  import { clockHoursFromMinutes } from '$lib/portal/minute-hours';
  import { settlementText, type SettlementCopyKey } from './copy';
  import { billingFixText } from '$lib/portal/billing-fix-copy';
  import { intervalCopy, intervalLabel } from '$lib/portal/interval-copy';
  import { extrasText } from '$lib/portal/assignment-extras-copy';
  import { supplierExpenseText, type SupplierExpenseCopyKey } from '$lib/portal/supplier-expense-copy';

  let { data, form } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const tag = $derived(locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US');
  const t = (key: SettlementCopyKey, params: Record<string, string | number> = {}) =>
    settlementText(locale, key, params);
  const fmt = (minor: string | null, currency: string) =>
    minor === null ? '—' : paymentMoney(minor, currency, tag);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  const range = $derived(`${shortDate(data.week.start)} – ${shortDate(data.week.end)}`);
  // Owner request 2026-11-25: weekly, every 2 weeks, twice a month or monthly periods.
  const weekly = $derived(data.week.interval === 'weekly');
  const periodLabel = $derived(
    weekly
      ? t('weekLabel', { week: data.week.week, range })
      : `${intervalLabel(locale, data.week.interval)} · ${range}`,
  );
  const scopeLabel = $derived(
    weekly
      ? `${locale === 'es' ? 'Sem. ' : locale === 'pt' ? 'S' : 'CW'}${data.week.week}`
      : `${intervalLabel(locale, data.week.interval)} · ${range}`,
  );
  const extraLabel = (extra: { kind: string; basis: string; units: number }) =>
    extrasText(locale, extra.kind === 'per_diem' ? 'payPerDiem' : 'payAllowance', {
      count: extra.units,
      unit: extrasText(locale, extra.basis === 'month' ? 'months' : 'days'),
    });
  const hours = (minutes: number) => clockHoursFromMinutes(minutes);
  const se = (key: SupplierExpenseCopyKey, params: Record<string, string | number> = {}) =>
    supplierExpenseText(locale, key, params);
  /** Remaining minus what Mark as paid deducts (per currency, never below zero). */
  const netToPay = (
    remaining: Array<{ currency: string; minor: string }>,
    deduct: Array<{ currency: string; minor: string }>,
  ) =>
    remaining.map((row) => {
      const off = BigInt(deduct.find((item) => item.currency === row.currency)?.minor ?? '0');
      const net = BigInt(row.minor) - off;
      return { currency: row.currency, minor: (net > 0n ? net : 0n).toString() };
    });
  function href(changes: Record<string, string | null>): string {
    const params = new URLSearchParams();
    params.set('week', data.week.start);
    params.set('interval', data.week.interval);
    if (data.payee) params.set('payee', data.payee);
    if (data.q) params.set('q', data.q);
    if (data.status !== 'all') params.set('status', data.status);
    for (const [key, value] of Object.entries(changes))
      if (value === null) params.delete(key);
      else params.set(key, value);
    return `${base}/app/finance/subcontractors?${params}`;
  }
  const exportHref = (format: 'csv' | 'pdf') =>
    `${base}/app/finance/subcontractors/export?${new URLSearchParams({ week: data.week.start, interval: data.week.interval, payee: data.payee ?? '', format, lang: locale })}`;
  const statusVariant = (status: string) =>
    status === 'paid' ? 'ok' : status === 'approved' ? 'info' : 'draft';
  const issueLabel = (issue: string | null) =>
    issue === 'missing_rule'
      ? t('missingRule')
      : issue === 'currency_mismatch'
        ? t('currencyMismatch')
        : issue === 'not_hourly'
          ? t('notHourly')
          : '';
  const rateHref = `${base}/app/finance?view=commercial&task=Worker%20compensation#finance-worker-compensation`;
  const compensationHref = $derived(
    `${base}/app/finance?view=economic&source=settlements&lang=${locale}#worker-payments`,
  );
  let saving = $state(false);
  const submit = () => {
    saving = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      saving = false;
    };
  };
</script>

<svelte:head><title>{t('title')}</title></svelte:head>

<main class="sub" data-subcontractor-settlement>
  <h1>{t('title')}</h1>
  <p class="sub__intro">{t('intro')}</p>

  <nav class="sub__week" aria-label={t('week')}>
    <a
      class="sub__btn sub__btn--ghost"
      href={href({ week: data.week.previous })}
      aria-label={t('previous')}
      data-week-prev>‹</a
    >
    <form method="GET" class="sub__weekform">
      {#if data.payee}<input type="hidden" name="payee" value={data.payee} />{/if}
      <span class="sub__weeklabel" data-week-label>{periodLabel}</span>
      <!-- The period length sits next to the date picker (one row, also on phones). -->
      <div class="sub__weekfields">
        <label>
          <span class="sub__muted">{intervalCopy(locale, 'periodDay')}</span>
          <input
            type="date"
            name="week"
            value={data.week.start}
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
            aria-label={t('week')}
          />
        </label>
        <label>
          <span class="sub__muted">{intervalCopy(locale, 'periodLabel')}</span>
          <select
            name="interval"
            value={data.week.interval}
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
            data-period-interval
          >
            <option value="weekly">{intervalCopy(locale, 'weekly')}</option>
            <option value="every_14_days">{intervalCopy(locale, 'every_14_days')}</option>
            <option value="semi_monthly">{intervalCopy(locale, 'semi_monthly')}</option>
            <option value="monthly">{intervalCopy(locale, 'monthly')}</option>
          </select>
        </label>
      </div>
    </form>
    <a
      class="sub__btn sub__btn--ghost"
      href={href({ week: data.week.next })}
      aria-label={t('next')}
      data-week-next>›</a
    >
  </nav>

  {#if form?.message}
    <p class="sub__error" role="alert">{form.message}</p>
  {:else if form?.success}
    <p class="sub__ok" role="status">{form.action === 'approve' ? t('approvedOk') : t('paidOk')}</p>
  {/if}

  {#if data.overview}
    <form method="GET" class="sub__filters">
      <input type="hidden" name="week" value={data.week.start} />
      <input type="hidden" name="interval" value={data.week.interval} />
      <input
        type="search"
        name="q"
        value={data.q}
        placeholder={t('search')}
        aria-label={t('search')}
      />
      <select
        name="status"
        value={data.status}
        aria-label={t('status')}
        onchange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="all">{t('all')}</option>
        <option value="draft">{t('draft')}</option>
        <option value="approved">{t('approved')}</option>
        <option value="paid">{t('paid')}</option>
      </select>
      <button type="submit" class="sub__btn sub__btn--ghost">{t('apply')}</button>
    </form>
    <p class="sub__scope" data-settlement-scope>
      {t(data.overview.total === 1 ? 'scopeOne' : 'scope', {
        period: scopeLabel,
        count: data.overview.total,
      })}
      {#if data.overview.total > data.overview.rows.length}· {t('showing', {
          shown: data.overview.rows.length,
          total: data.overview.total,
        })}{/if}
    </p>
    {#if data.overview.rows.length === 0}
      <p class="sub__empty">{t('none')}</p>
    {:else}
      <ul class="sub__list">
        {#each data.overview.rows as row (row.key)}
          <li data-payee-row={row.key}>
            <!-- The payee opens on the period its own next pay covers. -->
            <a
              href={href({ payee: row.key, q: null, status: null, week: null, interval: null })}
              class="sub__row"
            >
              <span class="sub__name">
                <strong>{row.name}</strong>
                <small
                  >{row.kind === 'supplier' ? t('supplier') : t('person')} · {row.kind ===
                  'supplier'
                    ? t('workers', { count: row.workers.length })
                    : ''}
                  {t('hours', { hours: hours(row.minutes) })}
                  · {intervalCopy(locale, 'paid', {
                    interval: intervalLabel(locale, row.interval ?? 'weekly'),
                  })}</small
                >
              </span>
              <span class="sub__money">
                {#each row.totals as total (total.currency)}<strong
                    >{fmt(total.minor, total.currency)}</strong
                  >{/each}
                {#if row.payable}<small>{row.status === 'draft' ? t('estimate') : t('owed')}</small
                  >{/if}
              </span>
              {#if row.payable}
                <span class={`sub__badge sub__badge--${statusVariant(row.status)}`}
                  >{t(row.status)}</span
                >
              {:else}
                <span class="sub__badge sub__badge--info" data-internal-worker
                  >{billingFixText(locale, 'internalPaidViaCompensation')}</span
                >
              {/if}
            </a>
          </li>
        {/each}
      </ul>
      {#if data.overview.total > data.overview.rows.length}
        <p>
          <a class="sub__btn sub__btn--ghost" href={href({ show: String(data.limit + 25) })}
            >{t('more')}</a
          >
        </p>
      {/if}
    {/if}
  {:else if data.detail}
    {@const detail = data.detail}
    <p><a href={href({ payee: null })}>← {t('backToList')}</a></p>
    <section class="sub__card" data-settlement-detail={detail.payee.key}>
      <header class="sub__head">
        <div>
          <h2>{detail.payee.name}</h2>
          <p class="sub__muted">
            {detail.payee.kind === 'supplier' ? t('supplier') : t('person')} · {periodLabel}
          </p>
          <p class="sub__muted" data-payee-interval>
            {intervalCopy(locale, 'paid', {
              interval: intervalLabel(locale, detail.interval ?? 'weekly'),
            })}
          </p>
        </div>
        {#if detail.payable}
          <span
            class={`sub__badge sub__badge--${statusVariant(detail.status)}`}
            data-settlement-status={detail.status}>{t(detail.status)}</span
          >
        {:else}
          <span class="sub__badge sub__badge--info" data-internal-worker
            >{billingFixText(locale, 'internalPaidViaCompensation')}</span
          >
        {/if}
      </header>
      {#if !detail.payable}
        <p class="sub__muted" data-internal-worker-help>
          {billingFixText(locale, 'internalPaidViaCompensationHelp')}
          <a href={compensationHref}>{billingFixText(locale, 'openCompensationSettlements')}</a>
        </p>
      {/if}

      <div class="sub__totals" data-settlement-totals>
        {#each detail.totals as total (total.currency)}
          <div>
            <small>{detail.status === 'draft' ? t('estimate') : t('owed')} · {total.currency}</small
            ><strong>{fmt(total.minor, total.currency)}</strong>
          </div>
        {/each}
        {#if detail.status === 'approved'}
          {#each detail.remaining as total (total.currency)}
            <div>
              <small>{t('remaining')} · {total.currency}</small><strong
                >{fmt(total.minor, total.currency)}</strong
              >
            </div>
          {/each}
        {/if}
        {#if detail.expenses}
          {#each detail.expenses.toDeduct as total (total.currency)}
            <div data-settlement-recharge-deduct>
              <small>{se('toDeduct')} · {total.currency}</small><strong
                >−{fmt(total.minor, total.currency)}</strong
              >
            </div>
          {/each}
          {#if detail.status === 'approved' && detail.expenses.toDeduct.length > 0}
            {#each netToPay(detail.remaining, detail.expenses.toDeduct) as total (total.currency)}
              <div data-settlement-net>
                <small>{se('netToPay')} · {total.currency}</small><strong
                  >{fmt(total.minor, total.currency)}</strong
                >
              </div>
            {/each}
          {/if}
          {#each detail.expenses.deducted as total (total.currency)}
            <div data-settlement-recharge-deducted>
              <small>{se('deducted')} · {total.currency}</small><strong
                >{fmt(total.minor, total.currency)}</strong
              >
            </div>
          {/each}
          {#each detail.expenses.toRecover as total (total.currency)}
            <div data-settlement-recharge-recover>
              <small>{se('toRecover')} · {total.currency}</small><strong
                >{fmt(total.minor, total.currency)}</strong
              >
            </div>
          {/each}
        {/if}
        {#if detail.status === 'paid' && detail.paidOn}
          <div class="sub__paidinfo">
            <small>{t('paid')}</small><strong
              >{t('paidInfo', {
                date: shortDate(detail.paidOn),
                reference: detail.reference ?? '',
              })}</strong
            >
          </div>
        {/if}
      </div>

      {#if detail.issues > 0}
        <p class="sub__warn" role="alert">
          {t('issuesWarning', { count: detail.issues })} <a href={rateHref}>{t('setRate')}</a>
        </p>
      {/if}
      {#if detail.changedPairs > 0}
        <p class="sub__warn">{t('changedWarning')}</p>
      {/if}

      {#if detail.entries.length === 0}
        <p class="sub__empty">{t('noHours')}</p>
      {:else}
        {#each detail.workers as worker (worker.id)}
          <details
            class="sub__worker"
            open={detail.workers.length <= 6}
            data-settlement-worker={worker.id}
          >
            <summary>
              <strong>{worker.name}</strong>
              <span>{t('hours', { hours: hours(worker.minutes) })}</span>
              <span class="sub__money">
                {#each detail.status === 'draft' || worker.settled.length === 0 ? worker.estimate : worker.settled as total (total.currency)}<strong
                    >{fmt(total.minor, total.currency)}</strong
                  >{/each}
              </span>
            </summary>
            <table class="sub__table">
              <thead>
                <tr
                  ><th>{t('day')}</th><th>{t('project')}</th><th class="num">{t('hoursCol')}</th><th
                    class="num">{t('rate')}</th
                  ><th class="num">{t('amount')}</th></tr
                >
              </thead>
              <tbody>
                {#each worker.entries as entry (entry.timeEntryId)}
                  <tr data-settlement-entry>
                    <td data-label={t('day')}>{day(entry.workDate)}</td>
                    <td data-label={t('project')}>{entry.projectNumber} · {entry.projectName}</td>
                    <td data-label={t('hoursCol')} class="num">{hours(entry.minutes)}</td>
                    <td data-label={t('rate')} class="num">
                      {#if entry.rateMinor !== null}{fmt(
                          entry.rateMinor,
                          entry.currency,
                        )}{entry.rateBasis === 'daily' ? t('perDay') : t('perHour')}{:else}—{/if}
                    </td>
                    <td data-label={t('amount')} class="num">
                      {#if entry.issue && entry.issue !== 'not_hourly'}<a
                          class="sub__issue"
                          href={rateHref}>{issueLabel(entry.issue)}</a
                        >
                      {:else if entry.issue === 'not_hourly'}<span class="sub__muted"
                          >{issueLabel(entry.issue)}</span
                        >
                      {:else}{fmt(entry.amountMinor, entry.currency)}{/if}
                    </td>
                  </tr>
                {/each}
                {#each worker.extras as extra, index (index)}
                  <tr data-settlement-extra={extra.kind}>
                    <td data-label={t('day')}>{extraLabel(extra)}</td>
                    <td data-label={t('project')}
                      >{worker.entries.find((entry) => entry.projectId === extra.projectId)
                        ?.projectNumber ?? ''}</td
                    >
                    <td data-label={t('hoursCol')} class="num">—</td>
                    <td data-label={t('rate')} class="num"
                      >{fmt(extra.rateMinor, extra.currency)}</td
                    >
                    <td data-label={t('amount')} class="num"
                      >{fmt(extra.amountMinor, extra.currency)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        {/each}
      {/if}

      {#if detail.expenses}
        <section class="sub__expenses" data-settlement-expenses aria-labelledby="sub-expenses-title">
          <h3 id="sub-expenses-title">{se('sectionTitle')}</h3>
          <p class="sub__muted">{se('sectionIntro')}</p>
          {#if detail.expenses.items.length === 0}
            <p class="sub__empty">{se('noExpenses')}</p>
          {:else}
            <table class="sub__table">
              <thead>
                <tr
                  ><th>{se('colDate')}</th><th>{se('colWho')}</th><th>{se('colWhat')}</th><th
                    >{se('colPays')}</th
                  ><th class="num">{se('colAmount')}</th></tr
                >
              </thead>
              <tbody>
                {#each detail.expenses.items as item (item.expenseId)}
                  <tr data-settlement-expense={item.treatment}>
                    <td data-label={se('colDate')}>{day(item.spentOn)}</td>
                    <td data-label={se('colWho')}>{item.workerName}</td>
                    <td data-label={se('colWhat')}
                      >{item.category}{#if item.vendor}<span class="sub__muted"> · {item.vendor}</span>{/if}</td
                    >
                    <td data-label={se('colPays')}
                      >{se(`treat_${item.treatment}`)}{#if item.treatment === 'recharge'}<small
                          class="sub__muted"
                          >{' · '}{item.rechargedSettlementId
                            ? se('deductedTag')
                            : item.amountMinor === null
                              ? se('needsConversion')
                              : item.deductNow
                                ? se('deductNow')
                                : se('toRecoverTag')}</small
                        >{/if}</td
                    >
                    <td data-label={se('colAmount')} class="num"
                      >{fmt(item.sourceAmountMinor, item.sourceCurrency)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </section>
      {/if}

      <div class="sub__actions">
        {#if !detail.payable}
          <!-- Internal worker: paid via compensation (decision D7), never approved or paid here. -->
        {:else if detail.status === 'draft' && detail.entries.length > 0}
          <form method="POST" action="?/approve" use:enhance={submit}>
            <input type="hidden" name="payee" value={detail.payee.key} />
            <input type="hidden" name="week" value={data.week.start} />
            <input type="hidden" name="interval" value={data.week.interval} />
            <button
              class="sub__btn"
              type="submit"
              disabled={saving || detail.issues > 0}
              data-settlement-approve>{t('approve')}</button
            >
            <small class="sub__muted">{t('approveHint')}</small>
          </form>
        {:else if detail.status === 'approved'}
          <form method="POST" action="?/markPaid" class="sub__payform" use:enhance={submit}>
            <input type="hidden" name="payee" value={detail.payee.key} />
            <input type="hidden" name="week" value={data.week.start} />
            <input type="hidden" name="interval" value={data.week.interval} />
            <input type="hidden" name="requestKey" value={data.requestKey} />
            <label
              ><span>{t('paidOn')}</span><input
                type="date"
                name="paidOn"
                value={data.today}
                required
              /></label
            >
            <label
              ><span>{t('reference')}</span><input
                name="reference"
                required
                maxlength="200"
                placeholder={t('referencePlaceholder')}
                value={`${weekly ? `CW${data.week.week}` : range} ${detail.payee.name}`.slice(
                  0,
                  200,
                )}
              /></label
            >
            <button class="sub__btn" type="submit" disabled={saving} data-settlement-paid
              >{t('markPaid')}</button
            >
          </form>
        {/if}
        <div class="sub__exports">
          <a
            class="sub__btn sub__btn--ghost"
            href={exportHref('pdf')}
            data-sveltekit-reload
            target="_blank"
            rel="noopener"
            data-settlement-pdf>{t('pdf')}</a
          >
          <a
            class="sub__btn sub__btn--ghost"
            href={exportHref('csv')}
            data-sveltekit-reload
            download
            data-settlement-csv>{t('csv')}</a
          >
        </div>
      </div>
    </section>
  {/if}
</main>

<style>
  .sub {
    max-width: 1040px;
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    display: grid;
    gap: 0.75rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
  }
  p {
    margin: 0;
  }
  .sub__intro {
    line-height: 1.5;
  }
  .sub__muted,
  small {
    color: #5b6470;
  }
  .sub__week {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .sub__weekform {
    display: grid;
    gap: 0.35rem;
    flex: 1 1 auto;
    min-width: 0;
  }
  .sub__weekfields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.5rem;
    max-width: 26rem;
  }
  .sub__weekform label {
    display: grid;
    grid-template-rows: auto 1fr;
    align-items: end;
    gap: 0.2rem;
    min-width: 0;
  }
  /* Phones: the period heading, date and length take the full width; the arrows go below. */
  @media (max-width: 520px) {
    .sub__week {
      flex-wrap: wrap;
      justify-content: space-between;
    }
    .sub__weekform {
      order: -1;
      flex-basis: 100%;
    }
    .sub__weekfields {
      max-width: none;
    }
  }
  .sub__weekform select {
    min-height: 44px;
    font-size: 1rem;
  }
  .sub__weekform input,
  .sub__weekform select {
    width: 100%;
    min-width: 0;
  }
  .sub__weeklabel {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .sub__weekform input,
  .sub__filters input,
  .sub__filters select,
  .sub__payform input {
    min-height: 44px;
    font-size: 1rem;
  }
  .sub__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .sub__filters input[type='search'] {
    flex: 1 1 16rem;
  }
  .sub__scope {
    font-weight: 600;
  }
  .sub__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: 0 1rem;
    border-radius: 10px;
    border: 0;
    background: #0b5cad;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    font-size: 1rem;
  }
  .sub__btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .sub__btn--ghost {
    background: transparent;
    color: #0b5cad;
    border: 1px solid #c4ccd6;
  }
  .sub__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .sub__row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 1rem;
    border: 1px solid #d6dbe1;
    border-radius: 12px;
    background: #fff;
    color: inherit;
    text-decoration: none;
  }
  .sub__row:hover {
    border-color: #0b5cad;
  }
  .sub__name,
  .sub__money {
    display: grid;
    gap: 0.1rem;
  }
  .sub__money {
    text-align: right;
  }
  .sub__badge {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .sub__badge--draft {
    background: #eef1f4;
    color: #3a4350;
  }
  .sub__badge--info {
    background: #e2efff;
    color: #0b4a8f;
  }
  .sub__badge--ok {
    background: #dff5e8;
    color: #11643a;
  }
  .sub__card {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid #d6dbe1;
    border-radius: 14px;
    background: #fff;
  }
  .sub__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: start;
  }
  .sub__totals {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .sub__totals div {
    display: grid;
    gap: 0.15rem;
    padding: 0.6rem 0.9rem;
    background: #f4f6f8;
    border-radius: 10px;
    min-width: 10rem;
  }
  .sub__totals strong {
    font-size: 1.3rem;
  }
  .sub__totals .sub__paidinfo strong {
    font-size: 1rem;
  }
  .sub__warn {
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: #fff4d6;
    color: #6b4b00;
  }
  .sub__error {
    color: #a3161a;
    font-weight: 600;
  }
  .sub__ok {
    color: #11643a;
    font-weight: 700;
  }
  .sub__expenses {
    border-top: 1px solid #e5e9ee;
    padding-top: 0.5rem;
    min-width: 0;
  }
  .sub__expenses h3 {
    margin: 0.25rem 0;
    font-size: 1rem;
  }
  .sub__worker {
    border-top: 1px solid #e5e9ee;
    padding-top: 0.5rem;
  }
  .sub__worker summary {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    align-items: center;
    min-height: 44px;
    cursor: pointer;
  }
  .sub__table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.4rem;
  }
  .sub__table th,
  .sub__table td {
    padding: 0.45rem 0.5rem;
    border-bottom: 1px solid #eef1f4;
    text-align: left;
  }
  .sub__table .num {
    text-align: right;
    white-space: nowrap;
  }
  .sub__issue {
    color: #a3161a;
    font-weight: 600;
  }
  .sub__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
    justify-content: space-between;
  }
  .sub__actions form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .sub__payform label {
    display: grid;
    gap: 0.2rem;
  }
  .sub__exports {
    display: flex;
    gap: 0.5rem;
  }
  .sub__empty {
    padding: 1rem;
    border: 1px dashed #c4ccd6;
    border-radius: 12px;
  }
  @media (max-width: 640px) {
    .sub__row {
      grid-template-columns: 1fr auto;
    }
    .sub__row .sub__badge {
      grid-column: 1 / -1;
      justify-self: start;
    }
    .sub__table thead {
      display: none;
    }
    .sub__table tr {
      display: grid;
      grid-template-columns: auto auto 1fr;
      grid-template-areas: 'day day amount' 'project project project' 'hours rate rate';
      gap: 0.1rem 0.5rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #eef1f4;
    }
    .sub__table td {
      border: 0;
      padding: 0;
    }
    .sub__table td:nth-child(1) {
      grid-area: day;
      font-weight: 600;
    }
    .sub__table td:nth-child(2) {
      grid-area: project;
      color: #5b6470;
      font-size: 0.9rem;
    }
    .sub__table td:nth-child(3) {
      grid-area: hours;
      text-align: left;
    }
    .sub__table td:nth-child(3)::after {
      content: ' h ×';
    }
    .sub__table td:nth-child(4) {
      grid-area: rate;
      text-align: left;
      color: #5b6470;
    }
    .sub__table td:nth-child(5) {
      grid-area: amount;
      font-weight: 700;
    }
    .sub__actions,
    .sub__actions form {
      flex-direction: column;
      align-items: stretch;
    }
    .sub__exports {
      justify-content: stretch;
    }
    .sub__exports a {
      flex: 1;
    }
  }
</style>
