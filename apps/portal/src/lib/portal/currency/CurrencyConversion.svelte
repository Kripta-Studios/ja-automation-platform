<script lang="ts">
  /**
   * Explicit, audited conversion of one source amount into another currency.
   * Proposes the ECB reference rate of the document date (or the last business
   * day before it); the owner accepts with one click or edits the rate/amount.
   * Saved conversions are immutable (a change adds a new one).
   *
   * Usage (fixr3billing invoice screen):
   *   <CurrencyConversion sourceKind="invoice_line" sourceId={lineId}
   *     sourceCurrency="MXN" sourceAmountMinor="100000" targetCurrency="USD"
   *     documentDate="2026-11-16" projectId={projectId} locale={locale}
   *     onconfirmed={(c) => ...} />
   * For an expense only sourceKind="expense", sourceId, sourceCurrency,
   * sourceAmountMinor, targetCurrency and documentDate are needed (the server
   * reads the expense itself).
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { convertExact, divideDecimals, exactMoney, formatDecimal, parseRate, type Currency } from '@ja/billing-engine';
  import { inputTextToMinor, minorToInputText, paymentMoney } from '../payment-money';
  import { conversionText } from './conversion-copy';

  type Proposal = {
    rate: string;
    rateDate: string;
    source: 'ECB';
    stale: boolean;
    businessDaysOld: number;
  } | null;
  type Conversion = {
    id: string;
    targetAmountMinor: string;
    targetCurrency: string;
    rate: string;
    rateSource: 'ECB' | 'manual';
    rateDate: string | null;
    amountEdited: boolean;
    confirmedByName: string | null;
    confirmedAt: string;
    note: string | null;
  };

  let {
    sourceKind,
    sourceId,
    sourceCurrency,
    sourceAmountMinor,
    targetCurrency,
    documentDate,
    projectId = null,
    locale = 'en',
    onconfirmed,
  }: {
    sourceKind: 'expense' | 'invoice_line' | 'document';
    sourceId: string;
    sourceCurrency: string;
    sourceAmountMinor: string;
    targetCurrency: string;
    documentDate: string;
    projectId?: string | null;
    locale?: string;
    onconfirmed?: (conversion: Conversion) => void;
  } = $props();

  const tag = $derived(locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US');
  const t = (key: Parameters<typeof conversionText>[1], params: Record<string, string | number> = {}) =>
    conversionText(locale, key, params);

  let loading = $state(true);
  let proposal = $state<Proposal>(null);
  let current = $state<Conversion | null>(null);
  let history = $state<Conversion[]>([]);
  let editing = $state(false);
  let autoEditing = false;
  let rateText = $state('');
  let amountText = $state('');
  let amountTouched = $state(false);
  let note = $state('');
  let saving = $state(false);
  let refreshing = $state(false);
  let message = $state('');
  let errorText = $state('');
  let idempotencyKey = $state(newKey());

  function newKey(): string {
    return `conv-${crypto.randomUUID()}`;
  }
  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '';
  const fmtMoney = (minor: string | bigint, currency: string) => paymentMoney(String(minor), currency, tag);
  /** Readable rate (6 decimals max); the exact rate is what is stored. */
  function readableRate(rate: string): string {
    const parsed = parseRate(rate);
    if (!parsed) return rate;
    const rounded = parsed.scale > 6 ? divideDecimals(parsed, { units: 1n, scale: 0 }, 6) : parsed;
    return formatDecimal(rounded).replace('.', locale === 'en' ? '.' : ',');
  }
  function converted(rate: string): bigint | null {
    const parsed = parseRate(rate.replace(',', '.'));
    if (!parsed) return null;
    try {
      return convertExact(
        exactMoney(sourceCurrency as Currency, BigInt(sourceAmountMinor)),
        parsed,
        targetCurrency as Currency,
      ).target.minorUnits;
    } catch {
      return null;
    }
  }
  const proposalAmount = $derived(proposal ? converted(proposal.rate) : null);
  const typedRateAmount = $derived(converted(rateText));
  $effect(() => {
    if (editing && !amountTouched)
      amountText = typedRateAmount === null ? '' : minorToInputText(typedRateAmount.toString(), targetCurrency);
  });

  async function load(): Promise<void> {
    loading = true;
    errorText = '';
    const params = new URLSearchParams({ sourceKind, sourceId, targetCurrency, sourceCurrency, documentDate });
    try {
      const response = await fetch(`${base}/app/api/currency/conversions?${params}`, {
        headers: { accept: 'application/json' },
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'load failed');
      proposal = body.proposal;
      current = body.current;
      history = (body.history ?? []).filter((row: Conversion) => row.id !== body.current?.id);
      if (!proposal && !current) {
        startEdit();
        autoEditing = true;
      } else if (autoEditing && proposal && !rateText.trim()) {
        // Rates arrived (e.g. after "Get latest ECB rates"): offer the one-click proposal.
        editing = false;
        autoEditing = false;
      }
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  function startEdit(): void {
    editing = true;
    autoEditing = false;
    amountTouched = false;
    rateText = proposal ? proposal.rate : current?.rate ?? '';
    note = '';
    idempotencyKey = newKey();
  }

  async function refreshRates(): Promise<void> {
    refreshing = true;
    message = '';
    try {
      const response = await fetch(`${base}/app/api/currency/rates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'refresh' }),
      });
      const body = await response.json();
      if (body.outcome === 'disabled') message = t('refreshDisabled');
      else if (!response.ok) message = t('refreshFailed');
      await load();
    } catch {
      message = t('refreshFailed');
    } finally {
      refreshing = false;
    }
  }

  async function save(useEcb: boolean): Promise<void> {
    errorText = '';
    message = '';
    const rate = useEcb ? proposal!.rate : rateText.replace(',', '.').trim();
    if (!parseRate(rate)) {
      errorText = t('invalidRate');
      return;
    }
    let targetAmountMinor: string | null = null;
    if (!useEcb && amountTouched) {
      const minor = inputTextToMinor(amountText, targetCurrency);
      if (minor === null) {
        errorText = t('invalidAmount', { to: targetCurrency });
        return;
      }
      targetAmountMinor = minor.toString();
    }
    saving = true;
    try {
      const response = await fetch(`${base}/app/api/currency/conversions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceKind,
          sourceId,
          targetCurrency,
          rate,
          rateSource: useEcb || (proposal && rate === proposal.rate) ? 'ECB' : 'manual',
          targetAmountMinor,
          note: note.trim() || null,
          idempotencyKey,
          expectedCurrentId: current?.id ?? null,
          ...(sourceKind === 'expense'
            ? {}
            : {
                source: {
                  currency: sourceCurrency,
                  amountMinor: sourceAmountMinor,
                  documentDate,
                  projectId,
                },
              }),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        errorText = body.message ?? 'Could not save';
        idempotencyKey = newKey();
        await load();
        return;
      }
      editing = false;
      message = t('saved');
      await load();
      if (current) onconfirmed?.(current);
    } finally {
      saving = false;
    }
  }
</script>

<section class="fx" data-currency-conversion aria-live="polite">
  <header class="fx__head">
    <h3>{t('title')}</h3>
    <p class="fx__source">
      <strong>{fmtMoney(sourceAmountMinor, sourceCurrency)}</strong> · {fmtDate(documentDate)}
    </p>
  </header>

  {#if loading}
    <p class="fx__muted">{t('loading')}</p>
  {:else}
    {#if current && !editing}
      <div class="fx__current" data-fx-current>
        <p class="fx__result">{t('converted', { amount: fmtMoney(current.targetAmountMinor, targetCurrency) })}</p>
        <p class="fx__muted">
          1 {sourceCurrency} = {readableRate(current.rate)} {targetCurrency} ·
          {current.rateSource === 'ECB' ? t('ecbSource', { date: fmtDate(current.rateDate) }) : t('manual')}
          {#if current.amountEdited}· {t('edited')}{/if}
        </p>
        <p class="fx__muted">{t('confirmedBy', { name: current.confirmedByName ?? '—', when: fmtDate(current.confirmedAt) })}</p>
        {#if current.note}<p class="fx__muted">“{current.note}”</p>{/if}
        <button type="button" class="fx__secondary" onclick={startEdit}>{t('change')}</button>
      </div>
    {:else if proposal && !editing}
      <div class="fx__proposal" data-fx-proposal>
        <p>{t('ecbRate', { date: fmtDate(proposal.rateDate), from: sourceCurrency, rate: readableRate(proposal.rate), to: targetCurrency })}</p>
        <p class="fx__result">{t('equals', { amount: fmtMoney(proposalAmount ?? 0n, targetCurrency) })}</p>
        {#if proposal.stale}
          <p class="fx__warn" role="alert" data-fx-stale>{t('stale', { days: proposal.businessDaysOld })}</p>
        {/if}
        <div class="fx__actions">
          <button type="button" class="fx__primary" disabled={saving} onclick={() => save(true)} data-fx-accept
            >{saving ? t('saving') : t('useEcb', { amount: fmtMoney(proposalAmount ?? 0n, targetCurrency) })}</button
          >
          <button type="button" class="fx__secondary" onclick={startEdit} data-fx-edit>{t('edit')}</button>
        </div>
      </div>
    {/if}

    {#if editing}
      <form class="fx__form" onsubmit={(event) => { event.preventDefault(); void save(false); }} data-fx-form>
        {#if !proposal}
          <p class="fx__muted">{t('noEcb', { from: sourceCurrency, to: targetCurrency })}</p>
        {:else if proposal.stale}
          <p class="fx__warn" role="alert">{t('stale', { days: proposal.businessDaysOld })}</p>
        {/if}
        <label>
          <span>{t('rate', { from: sourceCurrency, to: targetCurrency })}</span>
          <input
            name="rate"
            inputmode="decimal"
            autocomplete="off"
            required
            bind:value={rateText}
            data-fx-rate
          />
        </label>
        <label>
          <span>{t('convertedAmount', { to: targetCurrency })}</span>
          <input
            name="targetAmount"
            inputmode="decimal"
            autocomplete="off"
            bind:value={amountText}
            oninput={() => (amountTouched = true)}
            data-fx-amount
          />
        </label>
        <label class="fx__wide">
          <span>{t('note')}</span>
          <input name="note" maxlength="500" placeholder={t('notePlaceholder')} bind:value={note} />
        </label>
        <div class="fx__actions">
          <button type="submit" class="fx__primary" disabled={saving} data-fx-save>{saving ? t('saving') : t('save')}</button>
          {#if proposal || current}
            <button type="button" class="fx__secondary" onclick={() => (editing = false)}>{t('cancel')}</button>
          {/if}
        </div>
        <p class="fx__muted">{t('immutableHint')}</p>
      </form>
    {/if}

    {#if !proposal || proposal.stale}
      <button type="button" class="fx__link" disabled={refreshing} onclick={refreshRates} data-fx-refresh
        >{refreshing ? t('refreshing') : t('refresh')}</button
      >
    {/if}
    {#if errorText}<p class="fx__error" role="alert">{errorText}</p>{/if}
    {#if message}<p class="fx__ok" role="status">{message}</p>{/if}
    {#if history.length}
      <details class="fx__history">
        <summary>{t('history')} ({history.length})</summary>
        <ul>
          {#each history as row (row.id)}
            <li>
              {fmtMoney(row.targetAmountMinor, row.targetCurrency)} · 1 {sourceCurrency} = {readableRate(row.rate)}
              {row.targetCurrency} · {row.rateSource === 'ECB' ? t('ecbSource', { date: fmtDate(row.rateDate) }) : t('manual')}
              · {t('confirmedBy', { name: row.confirmedByName ?? '—', when: fmtDate(row.confirmedAt) })}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>

<style>
  .fx {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--color-border, #d6dbe1);
    border-radius: 12px;
    background: var(--color-surface, #fff);
  }
  .fx__head h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .fx__source {
    margin: 0.2rem 0 0;
  }
  .fx p {
    margin: 0;
  }
  .fx__result {
    font-size: 1.25rem;
    font-weight: 700;
  }
  .fx__muted {
    color: var(--color-text-muted, #5b6470);
    font-size: 0.92rem;
  }
  .fx__warn {
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    background: #fff4d6;
    color: #6b4b00;
  }
  .fx__error {
    color: #a3161a;
  }
  .fx__ok {
    color: #11643a;
    font-weight: 600;
  }
  .fx__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .fx__primary,
  .fx__secondary {
    min-height: 44px;
    padding: 0.55rem 1rem;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .fx__primary {
    border: 0;
    background: var(--color-primary, #0b5cad);
    color: #fff;
  }
  .fx__secondary {
    border: 1px solid var(--color-border, #c4ccd6);
    background: transparent;
    color: inherit;
  }
  .fx__link {
    justify-self: start;
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--color-primary, #0b5cad);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }
  .fx__form {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }
  .fx__form label {
    display: grid;
    gap: 0.25rem;
  }
  .fx__form input {
    min-height: 44px;
    font-size: 1rem;
  }
  .fx__wide,
  .fx__form .fx__actions,
  .fx__form > p {
    grid-column: 1 / -1;
  }
  .fx__history ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
    font-size: 0.9rem;
  }
</style>
