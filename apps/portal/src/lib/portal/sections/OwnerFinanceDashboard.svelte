<script lang="ts">
  import type { OwnerFinanceSummary, CashFilter } from '../owner-finance';
  import { ownerFinanceCopy } from '../owner-finance-copy';
  import { paymentMoney } from '../payment-money';
  let {
    summary,
    locale,
    base,
  }: { summary: OwnerFinanceSummary; locale: 'en' | 'es' | 'pt'; base: string } = $props();
  const t = $derived(ownerFinanceCopy[locale]);
  let selected = $state('');
  const current = $derived(
    summary.currencies.find((item) => item.currency === selected) ?? summary.currencies[0],
  );
  const cards = ['collected', 'receivable', 'payable', 'paid'] as const;
  const colors = {
    overdue: '#b42318',
    not_due: '#0369a1',
    paid: '#0f766e',
    payable: '#92400e',
    unconfirmed: '#64748b',
  };
  const money = (value: string) => paymentMoney(value, current?.currency, locale);
  const href = (filter: CashFilter, from = '', to = '') =>
    `${base}/app/finance/cash?${new URLSearchParams({ filter, currency: current?.currency ?? '', lang: locale, ...(from ? { from, to, dated: '1', group: 'month' } : {}) })}`;
  function percent(value: string, total: bigint) {
    return total > 0n ? Number((BigInt(value) * 10000n) / total) / 100 : 0;
  }
  const maximum = $derived(
    current?.months.reduce(
      (max, month) =>
        [BigInt(month.incoming), BigInt(month.outgoing), max].reduce((a, b) => (a > b ? a : b)),
      0n,
    ) ?? 0n,
  );
  const monthLabel = (from: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
      new Date(`${from}T00:00:00Z`),
    );
</script>

<section class="owner-finance" aria-labelledby="owner-finance-title" data-owner-finance>
  <header class="overview-heading">
    <div>
      <span class="portal-kicker">J&amp;A · {t.finance}</span>
      <h2 id="owner-finance-title">{t.title}</h2>
      <p>{t.subtitle}</p>
    </div>
    {#if current}<label
        >{t.currency}<select
          aria-label={t.currency}
          value={current.currency}
          onchange={(event) => (selected = event.currentTarget.value)}
          >{#each summary.currencies as item}<option value={item.currency}>{item.currency}</option
            >{/each}</select
        ></label
      >{/if}
  </header>
  <nav class="finance-links" aria-label={t.finance}>
    {#each [['billing', '/billing'], ['expenses', '/expenses'], ['finance', '/finance?view=economic'], ['cash', '/finance/cash']] as [key, route]}<a
        href={`${base}/app${route}`}
        >{t[key as 'billing' | 'expenses' | 'finance' | 'cash']}
        <span aria-hidden="true">↗</span></a
      >{/each}
  </nav>
  {#if current}
    <p class="scope">{t.allTime}</p>
    <div class="overview-cards">
      {#each cards as key}<a href={href(key)} class="overview-card" data-finance-metric={key}
          ><span>{t[key]}</span><strong>{money(current?.[key] ?? '0')}</strong><small
            >{t.view} →</small
          ></a
        >{/each}
    </div>
    <div class="chart-card trend">
      <h3>{t.trend}</h3>
      <p>{t.period}</p>
      <div class="bar-legend">
        <span><i data-tone="paid"></i>{t.incoming}</span><span
          ><i data-tone="payable"></i>{t.outgoing}</span
        >
      </div>
      <div class="months">
        {#each current.months as month}<div class="month">
            <div class="bars">
              {#each ['incoming', 'outgoing'] as key}<a
                  class="bar-link"
                  href={href(key as CashFilter, month.from, month.to)}
                  aria-label={`${monthLabel(month.from)} · ${t[key as 'incoming' | 'outgoing']}: ${money(month[key as 'incoming' | 'outgoing'])}`}
                  title={`${t[key as 'incoming' | 'outgoing']}: ${money(month[key as 'incoming' | 'outgoing'])}`}
                  ><svg
                    class="bar-graphic"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    ><rect
                      class="bar"
                      x="18"
                      width="64"
                      y={100 - percent(month[key as 'incoming' | 'outgoing'], maximum)}
                      height={percent(month[key as 'incoming' | 'outgoing'], maximum)}
                      rx="3"
                      fill={key === 'incoming' ? '#0f766e' : '#92400e'}
                    /></svg
                  ></a
                >{/each}
            </div>
            <strong>{monthLabel(month.from)}</strong>
            <div class="month-values">
              {#each ['incoming', 'outgoing'] as key}<a
                  href={href(key as CashFilter, month.from, month.to)}
                  >{t[key as 'incoming' | 'outgoing']}: {money(
                    month[key as 'incoming' | 'outgoing'],
                  )}</a
                >{/each}
            </div>
          </div>{/each}
      </div>
    </div>
    <div class="donut-grid">
      {@render donut(t.collections, ['overdue', 'not_due'])}{@render donut(t.payments, [
        'paid',
        'payable',
        'unconfirmed',
      ])}
    </div>
    <p class="scope">{t.note}</p>
  {:else}<div class="chart-card"><p>{t.empty}</p></div>{/if}
</section>

{#snippet donut(title: string, keys: Array<keyof typeof colors>)}
  {@const total = keys.reduce((sum, key) => sum + BigInt(current?.[key] ?? '0'), 0n)}
  <section class="chart-card">
    <h3>{title}</h3>
    <div class="donut-content">
      <svg viewBox="0 0 120 120" aria-label={title} role="group"
        ><circle cx="60" cy="60" r="44" fill="none" stroke="#e2e8f0" stroke-width="18" />
        {#each keys as key, index}{@const share = percent(
            current?.[key] ?? '0',
            total,
          )}{@const offset = keys
            .slice(0, index)
            .reduce((sum, previous) => sum + percent(current?.[previous] ?? '0', total), 0)}
          {#if share > 0}<a
              href={href(key)}
              aria-label={`${t[key]}: ${money(current?.[key] ?? '0')}`}
              ><circle
                class="slice"
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke={colors[key]}
                stroke-width="18"
                pathLength="100"
                stroke-dasharray={`${share} ${100 - share}`}
                stroke-dashoffset={-offset}
                transform="rotate(-90 60 60)"
                ><title>{t[key]}: {money(current?.[key] ?? '0')}</title></circle
              ></a
            >{/if}
        {/each}
        <text x="60" y="63" text-anchor="middle">{current?.currency ?? ''}</text></svg
      >
      <div class="donut-legend">
        {#each keys as key}<a href={href(key)}
            ><span><i data-tone={key}></i>{t[key]}</span><strong
              >{money(current?.[key] ?? '0')}</strong
            ></a
          >{/each}{#if total === 0n}<p>{t.noData}</p>{/if}
      </div>
    </div>
  </section>
{/snippet}

<style>
  .owner-finance {
    display: grid;
    gap: 20px;
    margin-bottom: 32px;
    color: var(--ja-text-primary);
  }
  .overview-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }
  h2 {
    font-size: clamp(1.6rem, 3vw, 2.1rem);
    margin: 8px 0;
    letter-spacing: -0.035em;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.05rem;
  }
  p {
    margin: 0;
    color: var(--ja-text-secondary);
    line-height: 1.65;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  select {
    min-height: 44px;
    min-width: 110px;
  }
  a {
    text-decoration: none;
    color: inherit;
  }
  a:focus-visible {
    outline: 3px solid var(--ja-border-focus);
    outline-offset: 3px;
  }
  a:hover {
    color: var(--ja-primary);
  }
  .finance-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .finance-links a {
    display: flex;
    gap: 20px;
    align-items: center;
    min-height: 44px;
    padding: 8px 14px;
    border: 1px solid var(--ja-control-border);
    border-radius: 8px;
    background: var(--ja-surface);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .scope {
    font-size: 0.8rem;
  }
  .overview-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .overview-card,
  .chart-card {
    border: 1px solid var(--ja-border-strong);
    border-radius: 14px;
    background: var(--ja-surface);
    box-shadow: var(--ja-shadow-soft);
    padding: 22px;
    min-width: 0;
  }
  .overview-card {
    display: grid;
    gap: 12px;
    border-top: 3px solid var(--ja-primary);
  }
  .overview-card:nth-child(2),
  .overview-card:nth-child(3) {
    border-top-color: #92400e;
  }
  .overview-card:hover {
    background: var(--ja-surface-raised);
  }
  .overview-card span {
    font-size: 0.85rem;
    color: var(--ja-text-secondary);
  }
  .overview-card strong {
    font-size: clamp(1.2rem, 2vw, 1.7rem);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  small {
    color: var(--ja-primary);
  }
  .bar-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin: 18px 0;
    font-size: 0.8rem;
  }
  .bar-legend span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .months {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 14px;
  }
  .month {
    min-width: 0;
    text-align: center;
  }
  .bars {
    display: flex;
    height: 160px;
    align-items: stretch;
    border-bottom: 1px solid var(--ja-border-strong);
    background: repeating-linear-gradient(to top, transparent 0, transparent 39px, #e2e8f0 40px);
  }
  .bar-link {
    width: 50%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-width: 0;
  }
  .bar-graphic {
    width: 100%;
    height: 100%;
    max-width: none;
  }
  i[data-tone='paid'] {
    background: #0f766e;
  }
  i[data-tone='payable'] {
    background: #92400e;
  }
  i[data-tone='overdue'] {
    background: #b42318;
  }
  i[data-tone='not_due'] {
    background: #0369a1;
  }
  i[data-tone='unconfirmed'] {
    background: #64748b;
  }
  .bar-link:hover .bar {
    opacity: 0.7;
  }
  .month > strong {
    display: block;
    margin: 12px 0 6px;
    font-size: 0.8rem;
  }
  .month-values {
    display: grid;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .month-values a {
    padding: 8px 0;
    min-height: 44px;
  }
  .donut-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .donut-content {
    display: flex;
    gap: 20px;
    align-items: center;
    margin-top: 20px;
  }
  svg {
    width: 150px;
    max-width: 40%;
    flex-shrink: 0;
    overflow: visible;
  }
  svg text {
    font-size: 10px;
    font-weight: 700;
    fill: var(--ja-text-secondary);
  }
  .slice {
    pointer-events: stroke;
  }
  svg a:hover circle {
    stroke-width: 22px;
  }
  .donut-legend {
    flex: 1;
    min-width: 0;
  }
  .donut-legend a {
    display: grid;
    gap: 6px;
    padding: 12px 0;
    border-bottom: 1px solid var(--ja-border-subdued);
    font-size: 0.85rem;
  }
  .donut-legend span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .donut-legend strong {
    overflow-wrap: anywhere;
  }
  @media (max-width: 1100px) {
    .overview-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .donut-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 600px) {
    .overview-card,
    .chart-card {
      padding: 16px;
    }
    .overview-cards {
      gap: 10px;
    }
    .months {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px 10px;
    }
    .bars {
      height: 110px;
    }
    .finance-links a {
      flex: 1 1 40%;
      justify-content: space-between;
    }
    .donut-content {
      gap: 12px;
    }
  }
</style>
