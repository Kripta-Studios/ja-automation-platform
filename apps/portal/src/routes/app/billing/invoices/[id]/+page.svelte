<script lang="ts">
  import { invalidateAll } from '$app/navigation';
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
  import { money as formatMoney } from '$lib/portal/portal-format';
  import { createInvoicePdfPollingController } from '$lib/portal/invoice-pdf-polling';
  import { StatusBadge } from '$lib/portal/ui';
  import LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte';

  type Row = Record<string, string | number | boolean | null>;
  type InvoicePdfStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';
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
  const preview = $derived(data.preview as { invoice: Row; lines: Row[]; taxes: Row[] });
  const invoice = $derived(preview.invoice);
  const invoiceState = $derived(String(invoice.state ?? '').toLowerCase());
  const invoiceId = $derived(String(invoice.id ?? ''));
  const pdfStatus = $derived(invoicePdfStatus(invoice));
  const pdfUrl = $derived(`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  let securePdfPreviewOpen = $state(false);
  const pdfPolling = createInvoicePdfPollingController(() => invalidateAll());
  const money = (minor: unknown) =>
    formatMoney(minor, String(invoice.currency), locale === 'pt' ? 'pt-BR' : locale);
  const totalQty = $derived(
    preview.lines.reduce(
      (sum, line) =>
        sum +
        (Number(line.quantity_numerator ?? 1) / Number(line.quantity_denominator ?? 1) ||
          Number(line.quantity ?? 1)),
      0,
    ),
  );
  const subtotalLessDiscountMinor = $derived(
    BigInt(String(invoice.subtotal_minor ?? 0)) - BigInt(String(invoice.discount_minor ?? 0)),
  );

  function invoicePdfStatus(row: Row): InvoicePdfStatus {
    const status = String(row.pdf_status ?? row.pdfStatus ?? '')
      .trim()
      .toLowerCase();
    if (status === 'ready') return 'ready';
    if (status === 'failed') return 'failed';
    if (status === 'rendering' || status === 'running' || status === 'processing') return 'running';
    if (status === 'queued' || status === 'pending') return 'queued';
    return 'unavailable';
  }

  function invoiceStatusVariant(
    value: string,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (value) {
      case 'paid':
        return 'success';
      case 'issued':
      case 'sent':
      case 'partially_paid':
      case 'approved':
        return 'info';
      case 'void':
      case 'voided':
        return 'danger';
      case 'credited':
      case 'credit_note':
      case 'credit':
        return 'warning';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  function invoiceStatusText(row: Row): string {
    const raw = String(row.state ?? '').toLowerCase();
    const status = translateControlledValue(locale, 'status', raw) || t('Unknown');
    return raw === 'paid' ? `✓ ${status}` : status;
  }

  function pdfStatusLabel(status: InvoicePdfStatus): string {
    return t(status === 'unavailable' ? 'Unavailable' : status);
  }

  $effect(() => {
    pdfPolling.update(pdfStatus);
  });

  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      pdfPolling.dispose();
      window.removeEventListener('storage', onStorage);
    };
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
  <section class="invoice-pdf-panel no-print" aria-labelledby="invoice-pdf-heading">
    <div class="invoice-pdf-panel__heading">
      <div>
        <p class="invoice-pdf-panel__eyebrow">{t('PDF')}</p>
        <h2 id="invoice-pdf-heading">{t('Preview')}</h2>
      </div>
      <span class="invoice-pdf-panel__status" data-invoice-pdf-status={pdfStatus} aria-live="polite"
        >{t('PDF')} · {pdfStatusLabel(pdfStatus)}</span
      >
    </div>
    {#if pdfStatus === 'ready'}
      <p class="invoice-pdf-panel__help">{t('Ready')}</p>
      <div class="invoice-pdf-panel__actions">
        <button
          type="button"
          class="invoice-pdf-panel__action"
          aria-controls="invoice-pdf-frame"
          aria-expanded={securePdfPreviewOpen}
          onclick={() => (securePdfPreviewOpen = !securePdfPreviewOpen)}
          >{securePdfPreviewOpen ? t('Close') : t('Open PDF')}</button
        >
        <a
          class="invoice-pdf-panel__action invoice-pdf-panel__action--secondary"
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer">{t('Open PDF')}</a
        >
        <a
          class="invoice-pdf-panel__action invoice-pdf-panel__action--secondary"
          href={pdfUrl}
          download>{t('Download PDF')}</a
        >
      </div>
      {#if securePdfPreviewOpen}
        <div class="invoice-pdf-panel__frame-wrap">
          <!-- The authorized endpoint remains the source of truth. Keep the explicit
               same-origin fallback because attachment/CSP policy may prevent an
               inline browser PDF viewer from rendering inside this frame. -->
          <iframe
            id="invoice-pdf-frame"
            title={`${t('PDF')} · ${invoice.invoice_number || t('PREVIEW')}`}
            src={pdfUrl}
            loading="lazy"
          ></iframe>
          <p class="invoice-pdf-panel__fallback">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">{t('Open PDF')}</a>
          </p>
        </div>
      {/if}
    {:else if pdfStatus === 'queued'}
      <p class="invoice-pdf-panel__message" role="status" aria-live="polite">
        {t(pdfStatus)} · {t('Loading')}
      </p>
    {:else if pdfStatus === 'running'}
      <p class="invoice-pdf-panel__message" role="status" aria-live="polite">
        {t(pdfStatus)} · {t('Loading')}
      </p>
    {:else if pdfStatus === 'failed'}
      <p class="invoice-pdf-panel__message invoice-pdf-panel__message--error" role="alert">
        {t('Failed')} · {t('Error')}
      </p>
    {:else if pdfStatus === 'unavailable'}
      <p class="invoice-pdf-panel__message" role="status">{t('Unavailable')}</p>
    {/if}
  </section>
  <div class="no-print localized-pdf-slot">
    <LocalizedPdfPanel ownerType="invoice" ownerId={invoiceId} {locale} title={t('PDF')} />
  </div>
  {#if invoiceState === 'draft'}
    <details class="no-print draft-edit-details">
      <summary class="draft-edit-summary"
        >⚙ {t('Edit Invoice Details (Purchase No., Terms, Company, Discount)')}</summary
      >
      <form method="POST" action="?/updateInvoiceDraftDetails" class="draft-edit-form">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div class="draft-edit-grid">
          <div class="draft-field">
            <label for="edit-purchase-no">{t('Purchase No.')}</label>
            <input
              id="edit-purchase-no"
              name="purchaseNo"
              type="text"
              value={invoice.purchase_no !== '—' ? invoice.purchase_no : ''}
              placeholder="e.g. BBS Mexico"
            />
          </div>
          <div class="draft-field">
            <label for="edit-discount">{t('Discount Amount')}</label>
            <input
              id="edit-discount"
              name="discount"
              type="text"
              value={invoice.discount_minor
                ? (Number(invoice.discount_minor) / 100).toFixed(2)
                : '0.00'}
              placeholder="0.00"
            />
          </div>
          <div class="draft-field">
            <label for="edit-swift">{t('Bank Swift Number')}</label>
            <input
              id="edit-swift"
              name="bankSwiftNumber"
              type="text"
              value={invoice.terms_and_instructions?.bankSwiftNumber || 'WFBIUS6S'}
            />
          </div>
          <div class="draft-field">
            <label for="edit-account">{t('Bank Account Number')}</label>
            <input
              id="edit-account"
              name="bankAccountNumber"
              type="text"
              value={invoice.terms_and_instructions?.bankAccountNumber || '8769915615'}
            />
          </div>
          <div class="draft-field">
            <label for="edit-bank-name">{t('Bank Name')}</label>
            <input
              id="edit-bank-name"
              name="bankName"
              type="text"
              value={invoice.terms_and_instructions?.bankName || 'Wells Fargo Bank'}
            />
          </div>
          <div class="draft-field">
            <label for="edit-beneficiary">{t('Beneficiary')}</label>
            <input
              id="edit-beneficiary"
              name="beneficiary"
              type="text"
              value={invoice.terms_and_instructions?.beneficiary || 'J&A Automation LLC'}
            />
          </div>
          <div class="draft-field full-width">
            <label for="edit-past-due">{t('Past Due Notice')}</label>
            <input
              id="edit-past-due"
              name="pastDueNotice"
              type="text"
              value={invoice.terms_and_instructions?.pastDueNotice ||
                'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law'}
            />
          </div>
        </div>
        <button type="submit" class="save-draft-btn">{t('Save Details')}</button>
      </form>
    </details>
  {/if}

  <article class="invoice-paper">
    <header>
      <div class="brand-block">
        <img src={`${base}/app/logo.png`} alt="J&A Automation" />
        <div class="company-details">
          <strong>{invoice.company_info?.name || 'J&A Automation LLC'}</strong>
          <div>{invoice.company_info?.division || 'USA division'}</div>
          <div>Phone: {invoice.company_info?.phone || '+1 (864) 208 4684'}</div>
          <div>{invoice.company_info?.address || '112 Birkshire Dr, Georgetown TX 78626'}</div>
          <div>{invoice.company_info?.email || 'field.operations@j-aautomation.com'}</div>
          <div>{invoice.company_info?.website || 'www.j-aautomation.com'}</div>
        </div>
      </div>
      <div class="invoice-identity">
        <span>{invoiceState === 'draft' ? t('DRAFT INVOICE') : t('INVOICE')}</span>
        <strong>{invoice.invoice_number || t('PREVIEW')}</strong>
        <StatusBadge
          variant={invoiceStatusVariant(invoiceState)}
          text={invoiceStatusText(invoice)}
          data-invoice-status={invoiceState}
          aria-label={invoiceStatusText(invoice)}
        />
      </div>
    </header>
    <section class="invoice-parties">
      <div>
        <span>{t('BILL TO')}</span>
        <strong>{invoice.client_legal_name || invoice.client_name}</strong>
        {#if invoice.billing_contact_name}<p>{invoice.billing_contact_name}</p>{/if}
        {#if invoice.client_billing_address}<p>{invoice.client_billing_address}</p>{/if}
        {#if invoice.billing_email}<small>{invoice.billing_email}</small>{/if}
      </div>
    </section>
    <section class="invoice-meta">
      <div>
        <span>{t('PURCHASE NO.')}</span>
        <strong>{invoice.purchase_no || '—'}</strong>
      </div>
      <div>
        <span>{t('INVOICE NUMBER')}</span>
        <strong>{invoice.invoice_number || t('PREVIEW')}</strong>
      </div>
      <div>
        <span>{t('INVOICE DATE')}</span>
        <strong
          >{invoice.issued_at
            ? invoice.issued_at.slice(0, 10)
            : invoice.created_at
              ? invoice.created_at.slice(0, 10)
              : '—'}</strong
        >
      </div>
      <div>
        <span>{t('DUE DATE')}</span>
        <strong
          >{invoice.due_date || (invoice.issued_at ? invoice.issued_at.slice(0, 10) : '—')}</strong
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
        <thead>
          <tr>
            <th scope="col">{t('DESCRIPTION')}</th>
            <th scope="col" class="amount">{t('QTY')}</th>
            <th scope="col" class="amount">{t('UNIT PRICE')}</th>
            <th scope="col" class="amount">{t('TOTAL')}</th>
          </tr>
        </thead>
        <tbody>
          {#each preview.lines as line}
            <tr>
              <td data-label={t('Description')}>{line.description}</td>
              <td data-label={t('Quantity')} class="amount">
                {(Number(line.quantity_numerator) / Number(line.quantity_denominator)).toFixed(2)}
              </td>
              <td data-label={t('Unit Price')} class="amount">{money(line.unit_price_minor)}</td>
              <td data-label={t('Total')} class="amount">{money(line.subtotal_minor)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="qty-total-row">
            <td><strong>{t('Total')}</strong></td>
            <td class="amount qty-total-cell">
              <strong>{totalQty.toFixed(2)}</strong>
            </td>
            <td></td>
            <td class="amount total-amount-cell">
              <strong
                >{money(invoice.calculation?.subtotalMinor || invoice.subtotal_minor || 0)}</strong
              >
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
    <section class="invoice-bottom-grid">
      <div class="invoice-terms-card">
        <div class="terms-heading">{t('Terms & Instructions')}</div>
        <div class="terms-field">
          <strong>{t('Bank Swift Number')}:</strong>
          {invoice.terms_and_instructions?.bankSwiftNumber || 'WFBIUS6S'}
        </div>
        <div class="terms-field">
          <strong>{t('Bank Account Number')}:</strong>
          {invoice.terms_and_instructions?.bankAccountNumber || '8769915615'}
        </div>
        <div class="terms-field">
          <strong>{t('Bank Name')}:</strong>
          {invoice.terms_and_instructions?.bankName || 'Wells Fargo Bank'}
        </div>
        <div class="terms-field">
          <strong>{t('Beneficiary')}:</strong>
          {invoice.terms_and_instructions?.beneficiary || 'J&A Automation LLC'}
        </div>
        <div class="terms-notice">
          {invoice.terms_and_instructions?.pastDueNotice ||
            'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law'}
        </div>
      </div>
      <div class="invoice-total">
        <dl>
          <dt>{t('Subtotal')}</dt>
          <dd>{money(invoice.subtotal_minor)}</dd>
          <dt>{t('Discount')}</dt>
          <dd>{money(invoice.discount_minor || 0)}</dd>
          <dt>{t('Subtotal Less Discount')}</dt>
          <dd>{money(subtotalLessDiscountMinor.toString())}</dd>
          {#each preview.taxes as tax}
            <dt>{tax.name} · {Number(tax.basis_points) / 100}%</dt>
            <dd>{money(invoice.tax_minor)}</dd>
          {/each}
          <dt class="grand">{t('Total')}</dt>
          <dd class="grand">{money(invoice.total_minor)}</dd>
        </dl>
      </div>
    </section>
    <footer>
      <span>{t('J&A AUTOMATION · INVOICE PREVIEW')}</span><span
        >{invoice.project_number} / {streamLabel(invoice.stream_type)}</span
      >
    </footer>
  </article>
</main>
