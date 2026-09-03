<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  import {
    canRetryLocalizedPdf,
    localeFromPortalLocale,
    localizedPdfCollectionUrl,
    localizedPdfDownloadUrl,
    localizedPdfLocaleOptions,
    localizedPdfRequestUrl,
    localizedPdfRetryUrl,
    mergeLocalizedPdfVariant,
    normalizeLocalizedPdfVariant,
    type LocalizedPdfLocale,
    type LocalizedPdfOwnerType,
    type LocalizedPdfStatus,
    type LocalizedPdfVariant,
  } from './localized-pdf';

  type Props = {
    ownerType: LocalizedPdfOwnerType;
    ownerId: string;
    locale: PortalLocale;
    title?: string;
    description?: string;
    initialVariants?: readonly unknown[];
    class?: string;
  };

  let {
    ownerType,
    ownerId,
    locale,
    title = 'PDF',
    description = '',
    initialVariants = [],
    class: className = '',
  }: Props = $props();

  const t = (key: string): string => portalText(locale, key);
  const seededVariants = $derived.by(() =>
    initialVariants
      .map(normalizeLocalizedPdfVariant)
      .filter((item): item is LocalizedPdfVariant => item !== null),
  );
  let variants = $state<LocalizedPdfVariant[]>([]);
  let loaded = $state(false);
  const visibleVariants = $derived(loaded ? variants : seededVariants);
  const defaultLocale = $derived(localeFromPortalLocale(locale));
  let selectedLocale = $state<LocalizedPdfLocale>('en');
  let userSelectedLocale = $state(false);
  let loading = $state(false);
  let errorMessage = $state('');
  let submittingLocale = $state<LocalizedPdfLocale | null>(null);
  let retryingVariantId = $state<string | null>(null);
  let pollingTimer: ReturnType<typeof setInterval> | undefined;
  const effectiveLocale = $derived(userSelectedLocale ? selectedLocale : defaultLocale);
  const idSuffix = $derived(`${ownerType}-${ownerId}`.replace(/[^A-Za-z0-9_-]/g, '-'));
  const headingId = $derived(`localized-pdf-panel-title-${idSuffix}`);
  const languageId = $derived(`localized-pdf-language-${idSuffix}`);

  const statusVariant = (status: LocalizedPdfStatus): 'success' | 'warning' | 'danger' | 'info' => {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'running') return 'info';
    return 'warning';
  };

  const variantForLocale = (target: LocalizedPdfLocale): LocalizedPdfVariant | undefined =>
    visibleVariants.filter((item) => item.locale === target).at(-1);
  const selectedVariant = $derived(variantForLocale(effectiveLocale));

  function actionData(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    const envelope = value as Record<string, unknown>;
    return envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : envelope;
  }

  async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
    return actionData(await response.json().catch(() => null));
  }

  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (!ownerId) return;
    if (!options.silent) loading = true;
    errorMessage = '';
    try {
      const response = await fetch(localizedPdfCollectionUrl(base, ownerType, ownerId), {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await jsonResponse(response);
      if (!response.ok) throw new Error('localized_pdf_list_failed');
      const next = Array.isArray(body.variants)
        ? body.variants
            .map(normalizeLocalizedPdfVariant)
            .filter((item): item is LocalizedPdfVariant => item !== null)
        : [];
      variants = next;
      loaded = true;
    } catch {
      errorMessage = t('Error');
    } finally {
      if (!options.silent) loading = false;
    }
  }

  async function requestVariant(targetLocale: LocalizedPdfLocale): Promise<void> {
    if (submittingLocale || !ownerId) return;
    submittingLocale = targetLocale;
    errorMessage = '';
    try {
      const response = await fetch(localizedPdfRequestUrl(base), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId, locale: targetLocale }),
      });
      const body = await jsonResponse(response);
      const next = normalizeLocalizedPdfVariant(body.variant);
      if (!response.ok || !next) throw new Error('localized_pdf_request_failed');
      variants = mergeLocalizedPdfVariant(visibleVariants, next);
      loaded = true;
      loaded = true;
    } catch {
      errorMessage = t('Error');
    } finally {
      submittingLocale = null;
    }
  }

  async function retryVariant(variant: LocalizedPdfVariant): Promise<void> {
    if (retryingVariantId || !canRetryLocalizedPdf(variant)) return;
    retryingVariantId = variant.variantId;
    errorMessage = '';
    try {
      const response = await fetch(localizedPdfRetryUrl(base, variant.variantId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await jsonResponse(response);
      const next = normalizeLocalizedPdfVariant(body.variant);
      if (!response.ok || !next) throw new Error('localized_pdf_retry_failed');
      variants = mergeLocalizedPdfVariant(visibleVariants, next);
      loaded = true;
    } catch {
      errorMessage = t('Error');
    } finally {
      retryingVariantId = null;
    }
  }

  function chooseLocale(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    selectedLocale = localeFromPortalLocale(value as PortalLocale);
    userSelectedLocale = true;
  }

  $effect(() => {
    const hasActiveVariant = visibleVariants.some(
      (item) => item.status === 'queued' || item.status === 'running',
    );
    if (!hasActiveVariant || pollingTimer) return;
    pollingTimer = setInterval(() => void refresh({ silent: true }), 2500);
    return () => {
      if (pollingTimer) clearInterval(pollingTimer);
      pollingTimer = undefined;
    };
  });

  onMount(() => {
    void refresh();
  });
</script>

<section
  class={`localized-pdf-panel ${className}`.trim()}
  aria-labelledby={headingId}
  aria-busy={loading}
  data-localized-pdf-panel
>
  <div class="localized-pdf-heading">
    <div>
      <p class="localized-pdf-eyebrow">{t('PDF')}</p>
      <h2 id={headingId}>{title === 'PDF' ? t('PDF') : title}</h2>
      {#if description}<p class="localized-pdf-description">{description}</p>{/if}
    </div>
    <button
      type="button"
      class="localized-pdf-refresh"
      onclick={() => void refresh()}
      disabled={loading}
      aria-label={t('Refresh')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M20 11a8 8 0 0 0-14.9-4.1L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.9 4.1L21 15m0 0v5m0-5h-5"
        />
      </svg>
      <span>{t('Refresh')}</span>
    </button>
  </div>

  <div class="localized-pdf-request" data-localized-pdf-request>
    <label for={languageId}>{t('Language')}</label>
    <div class="localized-pdf-request-controls">
      <select
        id={languageId}
        value={effectiveLocale}
        onchange={chooseLocale}
        aria-describedby={`${languageId}-help`}
      >
        {#each localizedPdfLocaleOptions as option}
          <option value={option.value}>{t(option.labelKey)}</option>
        {/each}
      </select>
      <button
        type="button"
        class="localized-pdf-primary-action"
        onclick={() => void requestVariant(effectiveLocale)}
        disabled={submittingLocale !== null ||
          loading ||
          selectedVariant?.status === 'queued' ||
          selectedVariant?.status === 'running'}>{t('Generate report')}</button
      >
      {#if selectedVariant?.status === 'ready'}
        <a
          class="localized-pdf-primary-action"
          href={localizedPdfDownloadUrl(base, selectedVariant.variantId)}
          download={selectedVariant.semanticFilename ?? undefined}>{t('Download')}</a
        >
      {:else if selectedVariant && canRetryLocalizedPdf(selectedVariant)}
        <button
          type="button"
          class="localized-pdf-primary-action"
          onclick={() => void retryVariant(selectedVariant)}
          disabled={retryingVariantId === selectedVariant.variantId}>{t('Retry')}</button
        >
      {/if}
    </div>
    <p id={`${languageId}-help`} class="localized-pdf-help">
      {#if selectedVariant}{t(selectedVariant.status)}{:else}{t('No data')}{/if}
    </p>
  </div>

  {#if errorMessage}
    <p class="localized-pdf-error" role="alert">{errorMessage}</p>
  {:else if !loaded && loading}
    <p class="localized-pdf-loading" role="status" aria-live="polite">{t('Loading')}</p>
  {/if}

  <ul class="localized-pdf-variants" aria-label={t('Language')} aria-live="polite">
    {#each localizedPdfLocaleOptions as option}
      {@const variant = variantForLocale(option.value)}
      <li class:localized-pdf-selected={option.value === effectiveLocale}>
        <div class="localized-pdf-variant-label">
          <strong>{t(option.labelKey)}</strong>
          {#if variant}
            <span
              class={`localized-pdf-status localized-pdf-status-${statusVariant(variant.status)}`}
            >
              {t(variant.status)}
            </span>
          {:else}
            <span class="localized-pdf-status localized-pdf-status-neutral">{t('No data')}</span>
          {/if}
        </div>
        <div class="localized-pdf-variant-actions">
          {#if variant?.status === 'ready'}
            <a
              href={localizedPdfDownloadUrl(base, variant.variantId)}
              download={variant.semanticFilename ?? undefined}
              aria-label={`${t('Download')} ${t(option.labelKey)}`}>{t('Download')}</a
            >
          {:else if variant?.status === 'failed'}
            {#if variant.errorCode}<code>{variant.errorCode}</code>{/if}
            {#if canRetryLocalizedPdf(variant)}
              <button
                type="button"
                class="localized-pdf-text-action"
                onclick={() => void retryVariant(variant)}
                disabled={retryingVariantId === variant.variantId}>{t('Retry')}</button
              >
            {/if}
          {:else if variant}
            <span>{t(variant.status)}</span>
          {:else}
            <span>{t('No data')}</span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .localized-pdf-panel {
    display: grid;
    gap: 1.15rem;
    padding: 1.25rem;
    border: 1px solid color-mix(in srgb, var(--portal-ink, #14231f) 14%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--portal-paper, #fff) 92%, var(--portal-accent, #d8f06a));
    box-shadow: 0 14px 32px rgb(20 35 31 / 8%);
  }

  .localized-pdf-heading,
  .localized-pdf-request-controls,
  .localized-pdf-variant-label,
  .localized-pdf-variant-actions {
    display: flex;
    align-items: center;
  }

  .localized-pdf-heading {
    justify-content: space-between;
    gap: 1rem;
  }

  .localized-pdf-eyebrow {
    margin: 0 0 0.25rem;
    color: var(--portal-muted, #6e7973);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--portal-ink, #14231f);
    font-size: 1.1rem;
  }

  .localized-pdf-description,
  .localized-pdf-help {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #6e7973);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .localized-pdf-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--portal-ink, #14231f) 16%, transparent);
    border-radius: 0.65rem;
    color: var(--portal-ink, #14231f);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }

  .localized-pdf-refresh svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
  }

  .localized-pdf-refresh:focus-visible,
  .localized-pdf-panel button:focus-visible,
  .localized-pdf-panel a:focus-visible,
  .localized-pdf-panel select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #d8f06a) 78%, #fff);
    outline-offset: 2px;
  }

  .localized-pdf-request {
    display: grid;
    gap: 0.45rem;
  }

  .localized-pdf-request label {
    color: var(--portal-ink, #14231f);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .localized-pdf-request-controls {
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .localized-pdf-request select {
    min-height: 2.55rem;
    min-width: 10rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--portal-ink, #14231f) 22%, transparent);
    border-radius: 0.65rem;
    color: var(--portal-ink, #14231f);
    background: var(--portal-paper, #fff);
    font: inherit;
  }

  .localized-pdf-primary-action,
  .localized-pdf-text-action {
    border: 0;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
  }

  .localized-pdf-primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.55rem;
    padding: 0.5rem 0.85rem;
    border-radius: 0.65rem;
    color: #10211c;
    background: var(--portal-accent, #d8f06a);
  }

  .localized-pdf-primary-action:disabled,
  .localized-pdf-refresh:disabled,
  .localized-pdf-text-action:disabled {
    cursor: progress;
    opacity: 0.55;
  }

  .localized-pdf-text-action {
    padding: 0.15rem 0.25rem;
    color: var(--portal-ink, #14231f);
    background: transparent;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  .localized-pdf-error,
  .localized-pdf-loading {
    margin: 0;
    font-size: 0.84rem;
  }

  .localized-pdf-error {
    color: #a52b27;
  }

  .localized-pdf-variants {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .localized-pdf-variants li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    padding: 0.75rem 0.85rem;
    border: 1px solid color-mix(in srgb, var(--portal-ink, #14231f) 10%, transparent);
    border-radius: 0.72rem;
    background: rgb(255 255 255 / 52%);
  }

  .localized-pdf-variants li.localized-pdf-selected {
    border-color: color-mix(in srgb, var(--portal-ink, #14231f) 35%, transparent);
    box-shadow: inset 3px 0 0 var(--portal-accent, #d8f06a);
  }

  .localized-pdf-variant-label {
    gap: 0.6rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .localized-pdf-variant-label strong {
    color: var(--portal-ink, #14231f);
    font-size: 0.88rem;
  }

  .localized-pdf-status {
    display: inline-flex;
    align-items: center;
    min-height: 1.4rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .localized-pdf-status-success {
    color: #1e633d;
    background: #d9f2df;
  }

  .localized-pdf-status-warning {
    color: #775008;
    background: #f8e7b9;
  }

  .localized-pdf-status-info {
    color: #245570;
    background: #d9edf5;
  }

  .localized-pdf-status-danger {
    color: #8e2b28;
    background: #f9dddd;
  }

  .localized-pdf-status-neutral {
    color: var(--portal-muted, #6e7973);
    background: #e8ece8;
  }

  .localized-pdf-variant-actions {
    justify-content: flex-end;
    gap: 0.55rem;
    color: var(--portal-muted, #6e7973);
    font-size: 0.78rem;
    text-align: right;
  }

  .localized-pdf-variant-actions a {
    color: var(--portal-ink, #14231f);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  .localized-pdf-variant-actions code {
    max-width: 12rem;
    overflow: hidden;
    color: #8e2b28;
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    .localized-pdf-panel {
      padding: 1rem;
      border-radius: 0.8rem;
    }

    .localized-pdf-heading,
    .localized-pdf-variants li {
      align-items: stretch;
    }

    .localized-pdf-heading {
      flex-direction: column;
    }

    .localized-pdf-refresh,
    .localized-pdf-primary-action {
      width: 100%;
    }

    .localized-pdf-request-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .localized-pdf-request select {
      width: 100%;
    }

    .localized-pdf-variants li {
      grid-template-columns: 1fr;
    }

    .localized-pdf-variant-actions {
      justify-content: flex-start;
      text-align: left;
    }
  }
</style>
