<script lang="ts">
  /**
   * Owner "Money" view: one period selector, five numbers per currency and a
   * per-project table with one-click drill-down. All amounts are exact minor-unit
   * strings computed server-side; currencies are never combined.
   */
  import { base } from '$app/paths';
  import type { PortalLocale } from '../../portal-i18n';
  import type { MoneyOverview } from '../money-overview-types';
  import { moneyPeriodKeys } from '../money-overview-types';
  import { moneyText, type MoneyCopyKey } from '../money-copy';

  let {
    overview,
    locale = 'en',
    money,
    includeArchived = false,
  }: {
    overview: MoneyOverview;
    locale?: PortalLocale;
    money: (minor: unknown, currency?: string) => string;
    includeArchived?: boolean;
  } = $props();

  const t = (key: MoneyCopyKey, params: Record<string, string | number> = {}) =>
    moneyText(locale, key, params);
  const lang = $derived(`lang=${locale}`);
  const big = (value: string | null | undefined) => BigInt(value ?? '0');
  const periodHref = (key: string) =>
    `${base}/app/finance?view=overview&period=${key}${includeArchived ? '&includeArchived=1' : ''}&${lang}`;
  const projectHref = (id: string) =>
    `${base}/app/projects/${encodeURIComponent(id)}?${lang}`;
  const invoiceHref = (id: string) =>
    `${base}/app/billing?project=${encodeURIComponent(id)}&assistantSurface=invoice-create&mode=whole-period&${lang}`;
  const rateHref = (id: string) =>
    `${base}/app/finance?view=commercial&project=${encodeURIComponent(id)}&${lang}#rates-people`;
  const percent = (bps: string | null) =>
    bps === null
      ? '—'
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          Number(bps) / 10_000,
        );
  const dateRange = $derived(
    `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${overview.period.from}T00:00:00Z`))} – ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${overview.period.to}T00:00:00Z`))}`,
  );
  const hasMoney = (row: MoneyOverview['currencies'][number]) =>
    [
      row.invoicedMinor,
      row.collectedMinor,
      row.outstandingMinor,
      row.costsMinor,
      row.workValueMinor,
      row.readyToInvoiceMinor,
    ].some((value) => big(value) !== 0n);
  const currencies = $derived(overview.currencies.filter(hasMoney));
  const active = $derived(overview.projects.filter((project) => project.hasActivity));
  const quiet = $derived(overview.projects.length - active.length);
</script>

<section class="money" aria-labelledby="money-title" data-money-overview>
  <header class="money__head">
    <div>
      <h2 id="money-title" class="page-title-hidden">{t('moneyTitle')}</h2>
      <p class="money__muted">{t('moneyIntro')}</p>
    </div>
    <nav class="money__links" aria-label={t('moneyTitle')}>
      <a class="secondary-button" href={`${base}/app/ledger?${lang}`}>{t('payments')}</a>
      <a class="secondary-button" href={`${base}/app/finance?view=commercial&${lang}`}
        >{t('rates')}</a
      >
    </nav>
  </header>

  <nav class="money__periods" aria-label={t('period')}>
    {#each moneyPeriodKeys as key (key)}
      <a
        href={periodHref(key)}
        aria-current={overview.period.key === key ? 'page' : undefined}
        data-money-period={key}>{t(key)}</a
      >
    {/each}
    <span class="money__muted money__range">{dateRange}</span>
  </nav>

  {#if currencies.length === 0}
    <p class="money__empty" data-money-empty>{t('nothingYet')}</p>
  {/if}

  {#each currencies as row (row.currency)}
    <section class="money__currency" aria-label={row.currency} data-money-currency={row.currency}>
      {#if currencies.length > 1}<h3>{row.currency}</h3>{/if}
      <div class="money__cards">
        <article class="money__card" data-money-metric="invoiced">
          <span>{t('invoiced')}</span>
          <strong>{money(row.invoicedMinor, row.currency)}</strong>
          <small>{t('invoicedHelp')}</small>
        </article>
        <article class="money__card" data-money-metric="collected">
          <span>{t('collected')}</span>
          <strong>{money(row.collectedMinor, row.currency)}</strong>
          <small>{t('collectedHelp')}</small>
        </article>
        <a
          class="money__card"
          class:money__card--alert={big(row.overdueMinor) > 0n}
          href={`${base}/app/ledger?${lang}`}
          data-money-metric="outstanding"
        >
          <span>{t('outstanding')}</span>
          <strong>{money(row.outstandingMinor, row.currency)}</strong>
          <small>
            {#if big(row.overdueMinor) > 0n}
              <b class="money__overdue">{t('overdue', { amount: money(row.overdueMinor, row.currency) })}</b>
              ·
            {/if}
            {t('outstandingHelp', { count: row.openCount })}
          </small>
        </a>
        <article class="money__card" data-money-metric="costs">
          <span>{t('costs')}</span>
          <strong>{money(row.costsMinor, row.currency)}</strong>
          <small
            >{t('costsHelp', {
              labor: money(row.laborCostMinor, row.currency),
              expenses: money(row.expenseCostMinor, row.currency),
            })}</small
          >
        </article>
        <article
          class="money__card"
          class:money__card--negative={big(row.marginMinor) < 0n}
          data-money-metric="margin"
        >
          <span>{t('margin')}</span>
          <strong
            >{money(row.marginMinor, row.currency)}
            {#if row.marginBps !== null}<em>{percent(row.marginBps)}</em>{/if}</strong
          >
          <small
            >{big(row.workValueMinor) === 0n
              ? t('marginNone')
              : t('marginHelp', { value: money(row.workValueMinor, row.currency) })}</small
          >
        </article>
        {#if big(row.readyToInvoiceMinor) > 0n}
          <a
            class="money__card money__card--action"
            href={`${base}/app/billing?assistantSurface=invoice-create&${lang}`}
            data-money-metric="ready"
          >
            <span>{t('readyToInvoice')}</span>
            <strong>{money(row.readyToInvoiceMinor, row.currency)}</strong>
            <small>{t('readyToInvoiceHelp')}</small>
          </a>
        {/if}
      </div>
    </section>
  {/each}

  <section class="money__projects" aria-labelledby="money-projects-title">
    <h3 id="money-projects-title">{t('projectsTitle')}</h3>
    {#if active.length === 0}
      <p class="money__muted">{t('noProjects')}</p>
    {:else}
      <div class="money__table-wrap">
        <table class="money__table" data-money-projects>
          <thead>
            <tr>
              <th scope="col">{t('project')}</th>
              <th scope="col" class="num">{t('workValue')}</th>
              <th scope="col" class="num">{t('cost')}</th>
              <th scope="col" class="num">{t('marginPct')}</th>
              <th scope="col" class="num">{t('readyToInvoice')}</th>
              <th scope="col" class="num">{t('unpaid')}</th>
              <th scope="col"><span class="sr-only">{t('actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each active as project (project.projectId)}
              <tr data-money-project={project.projectId}>
                <th scope="row">
                  <a class="money__project" href={projectHref(project.projectId)}
                    ><strong>{project.projectName}</strong>
                    <small>{project.clientName} · {project.projectNumber}</small></a
                  >
                  {#if project.missingRates > 0}
                    <a class="money__badge" href={rateHref(project.projectId)} data-money-rate-missing
                      >{t('rateMissing')} · {t('setRate')}</a
                    >
                  {/if}
                </th>
                <td class="num" data-label={t('workValue')}
                  >{money(project.workValueMinor, project.currency)}</td
                >
                <td class="num" data-label={t('cost')}>{money(project.costMinor, project.currency)}</td>
                <td
                  class="num"
                  class:neg={big(project.marginMinor) < 0n}
                  data-label={t('marginPct')}>{percent(project.marginBps)}</td
                >
                <td class="num" data-label={t('readyToInvoice')}
                  >{money(project.readyToInvoiceMinor, project.currency)}</td
                >
                <td class="num" data-label={t('unpaid')}>
                  {money(project.outstandingMinor, project.currency)}
                  {#if big(project.overdueMinor) > 0n}<small class="money__overdue"
                      >{money(project.overdueMinor, project.currency)} {t('overdueBadge')}</small
                    >{/if}
                </td>
                <td class="money__row-actions">
                  <a class="secondary-button" href={projectHref(project.projectId)}>{t('open')}</a>
                  {#if big(project.readyToInvoiceMinor) > 0n}
                    <a
                      class="primary-button"
                      href={invoiceHref(project.projectId)}
                      data-money-invoice={project.projectId}>{t('invoiceNow')}</a
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if quiet > 0}<p class="money__muted">{t('inactiveProjects', { count: quiet })}</p>{/if}
    {#if currencies.length === 1}
      <p class="money__muted">{t('currencyNote', { currency: currencies[0]!.currency })}</p>
    {/if}
  </section>

  <a class="money__detailed" href={`${base}/app/finance?view=economic&${lang}`} data-money-detailed>
    <strong>{t('detailed')} →</strong>
    <small>{t('detailedHelp')}</small>
  </a>
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
  .money {
    display: grid;
    gap: 1.25rem;
    max-width: 82rem;
  }
  .money h2 {
    margin: 0;
    font-size: clamp(1.6rem, 3vw, 2.1rem);
  }
  .money h3 {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }
  .money__muted {
    color: var(--ja-steel, #5b6573);
    margin: 0.25rem 0 0;
  }
  .money__head {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: space-between;
    align-items: flex-end;
  }
  .money__links {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .money__periods {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .money__periods a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    text-decoration: none;
    color: var(--ja-ink, #1c2430);
    font-weight: 600;
    background: var(--ja-white, #fff);
  }
  .money__periods a[aria-current='page'] {
    background: var(--ja-ink, #1c2430);
    border-color: var(--ja-ink, #1c2430);
    color: #fff;
  }
  .money__range {
    margin-left: 0.5rem;
  }
  .money__cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.75rem;
  }
  .money__card {
    display: grid;
    gap: 0.3rem;
    align-content: start;
    padding: 1rem 1.1rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    background: var(--ja-white, #fff);
    color: inherit;
    text-decoration: none;
  }
  a.money__card:hover,
  a.money__card:focus-visible {
    border-color: var(--ja-ink, #1c2430);
  }
  .money__card span {
    font-weight: 600;
    color: var(--ja-steel, #5b6573);
  }
  .money__card strong {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }
  .money__card strong em {
    font-style: normal;
    font-size: 1rem;
    margin-left: 0.35rem;
    color: var(--ja-steel, #5b6573);
  }
  .money__card small {
    color: var(--ja-steel, #5b6573);
    line-height: 1.35;
  }
  .money__card--alert {
    border-color: #f2b8b5;
    background: #fff6f5;
  }
  .money__card--negative strong {
    color: #b42318;
  }
  .money__card--action {
    border-color: #9fd3c7;
    background: #f1faf7;
  }
  .money__overdue {
    color: #b42318;
    font-weight: 700;
  }
  .money__empty {
    padding: 1rem;
    border: 1px dashed var(--ja-line, #d9dee5);
    border-radius: 12px;
    margin: 0;
  }
  .money__table-wrap {
    overflow-x: auto;
  }
  .money__table {
    width: 100%;
    border-collapse: collapse;
    background: var(--ja-white, #fff);
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
  }
  .money__table th,
  .money__table td {
    padding: 0.7rem 0.8rem;
    border-bottom: 1px solid var(--ja-line, #e5e8ee);
    text-align: left;
    vertical-align: top;
  }
  .money__table thead th {
    font-size: 0.85rem;
    color: var(--ja-steel, #5b6573);
    font-weight: 600;
  }
  .money__table .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .money__table td.num small {
    display: block;
  }
  .money__table .neg {
    color: #b42318;
    font-weight: 700;
  }
  .money__project {
    display: grid;
    color: inherit;
    text-decoration: none;
  }
  .money__project:hover strong {
    text-decoration: underline;
  }
  .money__project small {
    color: var(--ja-steel, #5b6573);
    font-weight: 400;
  }
  .money__badge {
    display: inline-block;
    margin-top: 0.35rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: #fff4e5;
    color: #8a4b00;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .money__row-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
    white-space: nowrap;
  }
  .money__row-actions a {
    min-height: 40px;
  }
  .money__detailed {
    display: grid;
    gap: 0.2rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    background: var(--ja-white, #fff);
  }
  .money__detailed small {
    color: var(--ja-steel, #5b6573);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 760px) {
    .money__card strong {
      font-size: 1.3rem;
    }
    .money__range {
      flex-basis: 100%;
      margin: 0;
    }
    .money__table,
    .money__table tbody,
    .money__table tr,
    .money__table th,
    .money__table td {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .money__table thead {
      display: none;
    }
    .money__table {
      border: 0;
      background: none;
    }
    .money__table tr {
      border: 1px solid var(--ja-line, #d9dee5);
      border-radius: 12px;
      background: var(--ja-white, #fff);
      margin-bottom: 0.75rem;
      padding: 0.4rem 0;
    }
    .money__table td,
    .money__table th {
      border: 0;
      padding: 0.35rem 0.9rem;
    }
    .money__table td.num {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      text-align: right;
    }
    .money__table td.num::before {
      content: attr(data-label);
      color: var(--ja-steel, #5b6573);
      text-align: left;
    }
    .money__table td.num small {
      flex-basis: 100%;
    }
    .money__row-actions {
      justify-content: stretch;
      padding-top: 0.6rem !important;
    }
    .money__row-actions a {
      flex: 1;
      justify-content: center;
    }
  }
</style>
