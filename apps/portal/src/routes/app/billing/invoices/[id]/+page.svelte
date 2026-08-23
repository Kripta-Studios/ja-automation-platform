<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte';

  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const streamLabel = (value: unknown): string =>
    translateControlledValue(
      locale,
      'billingStream',
      value === null || value === undefined ? null : String(value),
    );
  const sourceLabel = (value: unknown): string =>
    translateControlledValue(
      locale,
      'recordType',
      value === null || value === undefined ? null : String(value),
    );
  const preview = $derived(data.preview as { invoice: Row; lines: Row[]; taxes: Row[] });
  const invoice = $derived(preview.invoice);
  const money = (minor: unknown) =>
    new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale, {
      style: 'currency',
      currency: String(invoice.currency),
    }).format(Number(minor ?? 0) / 100);

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

<svelte:head><title>{t('Invoice preview')} | {invoice.project_number}</title></svelte:head>
<main class="invoice-preview-page">
  <nav class="detail-nav no-print">
    <a href={`${base}/app/billing`}>← {t('Billing')}</a><button
      type="button"
      class="print-trigger"
      onclick={() => window.print()}><span aria-hidden="true">⎙</span> {t('Print Report')}</button
    >
  </nav>
  <article class="invoice-paper">
    <header>
      <div>
        <img src={`${base}/app/logo.png`} alt="J&A Automation" /><small
          >{t('INDUSTRIAL AUTOMATION · FIELD SERVICES')}</small
        >
      </div>
      <div class="invoice-identity">
        <span>{invoice.state === 'draft' ? t('DRAFT INVOICE') : t('INVOICE')}</span><strong
          >{invoice.invoice_number || t('PREVIEW')}</strong
        >
      </div>
    </header>
    <section class="invoice-parties">
      <div>
        <span>{t('FROM')}</span><strong>{invoice.issuer_name}</strong>
        <p>{invoice.issuer_address}</p>
        <small>{invoice.company_identifiers}</small>
      </div>
      <div>
        <span>{t('BILL TO')}</span><strong>{invoice.client_legal_name}</strong>
        <p>{invoice.client_name}<br />{invoice.billing_email}</p>
      </div>
    </section>
    <section class="invoice-meta">
      <div>
        <span>{t('PROJECT')}</span><strong>{invoice.project_number}</strong><small
          >{invoice.project_name}</small
        >
      </div>
      <div>
        <span>{t('BILLING PERIOD')}</span><strong>{invoice.period_start}</strong><small
          >{t('through')} {invoice.period_end}</small
        >
      </div>
      <div>
        <span>{t('STREAM')}</span><strong>{streamLabel(invoice.stream_type)}</strong><small
          >{invoice.tax_profile_name}</small
        >
      </div>
    </section>
    <section
      class="invoice-line-items"
      data-mobile-representation="cards"
      aria-labelledby="invoice-line-items-heading"
    >
      <h2 class="visually-hidden" id="invoice-line-items-heading">{t('Invoice line items')}</h2>
      <table>
        <caption class="visually-hidden">{t('Invoice line items and amounts')}</caption>
        <thead
          ><tr
            ><th scope="col">{t('DESCRIPTION')}</th><th scope="col">{t('SOURCE')}</th><th
              scope="col">{t('QTY')}</th
            ><th scope="col">{t('RATE')}</th><th scope="col">{t('AMOUNT')}</th></tr
          ></thead
        ><tbody
          >{#each preview.lines as line}<tr
              ><td data-label={t('Description')}>{line.description}</td><td data-label={t('Source')}
                >{sourceLabel(line.source_type)}</td
              ><td data-label={t('Quantity')}
                >{(Number(line.quantity_numerator) / Number(line.quantity_denominator)).toFixed(
                  2,
                )}</td
              ><td data-label={t('Rate')}>{money(line.unit_price_minor)}</td><td
                data-label={t('Amount')}>{money(line.subtotal_minor)}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </section>
    <section class="invoice-total">
      <div>
        <span>{t('Separate billing treatment')}</span>
        <p>
          {t(
            'Labor and reimbursable expenses use independent streams and configured tax profiles. All-in project expenses remain in project cost and do not appear here.',
          )}
        </p>
      </div>
      <dl>
        <dt>{t('Subtotal')}</dt>
        <dd>{money(invoice.subtotal_minor)}</dd>
        {#each preview.taxes as tax}<dt>{tax.name} · {Number(tax.basis_points) / 100}%</dt>
          <dd>{money(invoice.tax_minor)}</dd>{/each}
        <dt class="grand">{t('Total')}</dt>
        <dd class="grand">{money(invoice.total_minor)}</dd>
      </dl>
    </section>
    <footer>
      <span>{t('J&A AUTOMATION · INVOICE PREVIEW')}</span><span
        >{invoice.project_number} / {streamLabel(invoice.stream_type)}</span
      >
    </footer>
  </article>
  <div class="no-print localized-pdf-slot">
    <LocalizedPdfPanel ownerType="invoice" ownerId={String(invoice.id)} {locale} title={t('PDF')} />
  </div>
</main>
