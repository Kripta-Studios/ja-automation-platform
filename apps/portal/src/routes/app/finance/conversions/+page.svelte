<script lang="ts">
  import { base } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { paymentMoney } from '$lib/portal/payment-money';
  import CurrencyConversion from '$lib/portal/currency/CurrencyConversion.svelte';
  import { conversionsText } from './copy';

  let { data } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const tag = $derived(locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US');
  const t = (key: Parameters<typeof conversionsText>[1], params: Record<string, string | number> = {}) =>
    conversionsText(locale, key, params);
  const fmt = (minor: string, currency: string) => paymentMoney(minor, currency, tag);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  function href(changes: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (data.q) params.set('q', data.q);
    if (data.status !== 'open') params.set('status', data.status);
    for (const [key, value] of Object.entries(changes))
      if (value === null) params.delete(key);
      else params.set(key, value);
    const query = params.toString();
    return `${base}/app/finance/conversions${query ? `?${query}` : ''}`;
  }
  const statusLabel = $derived(data.status === 'open' ? t('open') : data.status === 'converted' ? t('converted') : t('all'));
</script>

<svelte:head><title>{t('title')}</title></svelte:head>

<main class="fxp" data-conversions-page>
  <p><a href={`${base}/app/finance?view=overview`}>← {t('back')}</a></p>
  <h1>{t('title')}</h1>
  <p class="fxp__intro">{t('intro')}</p>
  <p class="fxp__muted">{data.latestRateDate ? t('latest', { date: date(data.latestRateDate) }) : t('noRates')}</p>

  <form method="GET" class="fxp__filters" data-sveltekit-keepfocus>
    <input type="search" name="q" value={data.q} placeholder={t('search')} aria-label={t('search')} />
    <label
      ><span class="sr-only">{t('status')}</span>
      <select name="status" value={data.status} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
        <option value="open">{t('open')}</option>
        <option value="converted">{t('converted')}</option>
        <option value="all">{t('all')}</option>
      </select></label
    >
    <button type="submit">{t('apply')}</button>
  </form>
  <p class="fxp__scope" data-conversions-scope>
    {t('scope', { status: statusLabel, count: data.total })}
    {#if data.total > data.rows.length}· {t('showing', { shown: data.rows.length, total: data.total })}{/if}
  </p>

  {#if data.selected}
    <div class="fxp__selected" id="convert" data-conversion-selected={data.selected.id}>
      <p>
        <strong>{data.selected.worker_name}</strong> · {data.selected.project_number} {data.selected.project_name}
        {#if data.selected.vendor}· {data.selected.vendor}{/if}
      </p>
      <CurrencyConversion
        sourceKind="expense"
        sourceId={data.selected.id}
        sourceCurrency={data.selected.currency}
        sourceAmountMinor={data.selected.amount_minor}
        targetCurrency={data.selected.project_currency}
        documentDate={data.selected.spent_on}
        projectId={data.selected.project_id}
        {locale}
        onconfirmed={() => invalidateAll()}
      />
      <p><a href={href({ expense: null })}>{t('close')}</a></p>
    </div>
  {/if}

  {#if data.rows.length === 0}
    <p class="fxp__empty">{t('none')}</p>
  {:else}
    <ul class="fxp__list" data-conversion-rows>
      {#each data.rows as row (row.id)}
        <li class:fxp__row--active={data.selected?.id === row.id} data-conversion-row={row.id}>
          <div class="fxp__who">
            <strong>{row.worker_name}</strong>
            <span>{row.project_number} · {row.project_name}</span>
            <span class="fxp__muted">{date(row.spent_on)}{row.vendor ? ` · ${row.vendor}` : ''}</span>
          </div>
          <div class="fxp__amount">
            <strong>{fmt(row.amount_minor, row.currency)}</strong>
            {#if row.converted_minor !== null}
              <span>→ {fmt(row.converted_minor, row.project_currency)}{row.converted_rate_source === 'manual' ? ` · ${t('manual')}` : ''}</span>
            {:else}
              <span class="fxp__muted">→ {row.project_currency}</span>
            {/if}
          </div>
          <a class="fxp__go" href={`${href({ expense: row.id })}#convert`} data-conversion-open
            >{row.converted_minor === null ? t('convert') : t('result')}</a
          >
        </li>
      {/each}
    </ul>
    {#if data.total > data.rows.length}
      <p><a class="fxp__more" href={href({ show: String(data.limit + 25) })}>{t('more')}</a></p>
    {/if}
  {/if}
</main>

<style>
  .fxp {
    max-width: 960px;
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    display: grid;
    gap: 0.75rem;
  }
  h1 {
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    margin: 0;
  }
  p {
    margin: 0;
  }
  .fxp__intro {
    line-height: 1.5;
  }
  .fxp__muted {
    color: #5b6470;
    font-size: 0.92rem;
  }
  .fxp__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .fxp__filters input[type='search'] {
    flex: 1 1 16rem;
    min-height: 44px;
  }
  .fxp__filters select,
  .fxp__filters button {
    min-height: 44px;
  }
  .fxp__scope {
    font-weight: 600;
  }
  .fxp__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .fxp__list li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border: 1px solid #d6dbe1;
    border-radius: 12px;
    background: #fff;
  }
  .fxp__row--active {
    outline: 2px solid #0b5cad;
  }
  .fxp__who,
  .fxp__amount {
    display: grid;
    gap: 0.15rem;
  }
  .fxp__amount {
    text-align: right;
  }
  .fxp__go,
  .fxp__more {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 10px;
    background: #0b5cad;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
  }
  .fxp__more {
    background: transparent;
    color: #0b5cad;
    border: 1px solid #c4ccd6;
  }
  .fxp__selected {
    display: grid;
    gap: 0.5rem;
  }
  .fxp__empty {
    padding: 1rem;
    border: 1px dashed #c4ccd6;
    border-radius: 12px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 640px) {
    .fxp__list li {
      grid-template-columns: 1fr auto;
    }
    .fxp__go {
      grid-column: 1 / -1;
      justify-content: center;
    }
  }
</style>
