<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { money as formatMoney } from '$lib/portal/portal-format';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const record = $derived(data.record as Row);
  const money = (minor: unknown, currency: string) =>
    formatMoney(minor, currency, locale === 'pt' ? 'pt-BR' : locale);
  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Expense')} | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/expenses'}>← {t('Expenses')}</a>
    <a href={base + '/app/projects/' + String(record.project_id)}>{t('Open project')}</a>
    <button type="button" class="no-print print-trigger" onclick={printReport}>
      <span aria-hidden="true">⎙</span>
      {t('Print Report')}
    </button>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">{t('EXPENSE · SOURCE RECORD')}</span>
      <h1>{record.vendor ?? controlled('expenseCategory', record.category)}</h1>
      <p>{record.project_number} · {record.project_name} · {record.spent_on}</p>
    </div>
    <span class="state-tag">{controlled('status', record.approval_state)}</span>
  </header>
  <section class="record-detail-grid">
    <article>
      <span>{t('AMOUNT')}</span><strong
        >{money(record.amount_minor, String(record.currency))}</strong
      >
    </article>
    <article>
      <span>{t('CATEGORY')}</span><strong>{controlled('expenseCategory', record.category)}</strong>
    </article>
    <article>
      <span>{t('CLIENT TREATMENT')}</span><strong
        >{controlled('billingStream', record.client_treatment)}</strong
      >
    </article>
    <article>
      <span>{t('REIMBURSEMENT')}</span><strong
        >{controlled('status', record.reimbursement_state ?? 'pending')}</strong
      >
    </article>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{t('Expense details')}</h2>
      <span>{record.who_paid ? controlled('role', record.who_paid) : t('worker paid')}</span>
    </div>
    <p>{record.description ?? t('No description was recorded.')}</p>
    <dl class="record-facts">
      <div>
        <dt>{t('Vendor')}</dt>
        <dd>{record.vendor ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Payment method')}</dt>
        <dd>{record.payment_method ?? '—'}</dd>
      </div>
      <div>
        <dt>{t('Billing treatment')}</dt>
        <dd>{controlled('billingStream', record.billing_treatment ?? 'internal')}</dd>
      </div>
      <div>
        <dt>{t('Project-currency amount')}</dt>
        <dd>
          {money(
            record.project_currency_amount_minor ?? record.amount_minor,
            String(record.project_currency ?? record.currency),
          )}
        </dd>
      </div>
      <div>
        <dt>{t('Receipt')}</dt>
        <dd>
          {record.receipt_document_id ? t('Registered private receipt') : t('No receipt linked')}
        </dd>
      </div>
    </dl>
    {#if record.receipt_document_id}
      <a
        class="preview-link"
        target="_blank"
        href={base + '/app/api/documents/' + String(record.receipt_document_id) + '?view=1'}
        >{t('Open private receipt')}</a
      >
    {/if}
  </section>
</main>
