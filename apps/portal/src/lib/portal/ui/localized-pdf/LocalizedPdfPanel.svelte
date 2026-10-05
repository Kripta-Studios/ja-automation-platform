<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { localizedPdfTemplateVersion } from '@ja/domain';
  import { onMount, tick, untrack } from 'svelte';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  import type { ProblemData } from '$lib/problem/contract';
  import ProblemNotice from '../ProblemNotice.svelte';
  import { privateDownloadFilename } from '../private-document-download';
  import {
    canRetryLocalizedPdf,
    localeFromPortalLocale,
    localizedPdfCollectionUrl,
    localizedPdfDownloadUrl,
    localizedPdfLocaleOptions,
    localizedPdfRequestUrl,
    localizedPdfRetryUrl,
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
    compact?: boolean;
    sourceVersion?: number;
  };

  let {
    ownerType,
    ownerId,
    locale,
    title = 'PDF',
    description = '',
    initialVariants = [],
    class: className = '',
    compact = false,
    sourceVersion,
  }: Props = $props();
  const readOnly = $derived(
    $page.data.chromeUser?.role === 'auditor_read_only' ||
      $page.data.user?.role === 'auditor_read_only',
  );

  const t = (key: string): string => portalText(locale, key);
  const seededVariants = $derived.by(() =>
    initialVariants
      .map(normalizeLocalizedPdfVariant)
      .filter((item): item is LocalizedPdfVariant => item !== null),
  );
  let variants = $state<LocalizedPdfVariant[]>([]);
  let loaded = $state(false);
  let mounted = $state(false);
  let refreshedSourceKey = untrack(() => JSON.stringify([ownerType, ownerId, sourceVersion]));
  $effect(() => {
    const key = JSON.stringify([ownerType, ownerId, sourceVersion]);
    if (!mounted || key === refreshedSourceKey) return;
    refreshedSourceKey = key;
    variants = [];
    loaded = false;
    problem = null;
    errorMessage = '';
    submittingLocale = null;
    retryingVariantId = null;
    downloadingVariantId = null;
    requestStatusUnknownLocale = null;
    retryStatusUnknownId = null;
    userSelectedLocale = false;
    void untrack(() => refresh());
  });
  const visibleVariants = $derived(loaded ? variants : seededVariants);
  const defaultLocale = $derived(localeFromPortalLocale(locale));
  let selectedLocale = $state<LocalizedPdfLocale>('en');
  let userSelectedLocale = $state(false);
  let loading = $state(false);
  let errorMessage = $state('');
  let problem = $state<ProblemData | null>(null);
  let problemVariantId = $state<string | null>(null);
  let submittingLocale = $state<LocalizedPdfLocale | null>(null);
  let requestStatusUnknownLocale = $state<LocalizedPdfLocale | null>(null);
  let retryingVariantId = $state<string | null>(null);
  let retryStatusUnknownId = $state<string | null>(null);
  let downloadingVariantId = $state<string | null>(null);
  let pollingTimer: ReturnType<typeof setInterval> | undefined;
  let panelElement: HTMLElement | undefined;
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

  const currentTemplateVersion = $derived(localizedPdfTemplateVersion(ownerType));
  const currentLayout = (variant: LocalizedPdfVariant): boolean =>
    variant.templateVersion === currentTemplateVersion;
  const variantForLocale = (target: LocalizedPdfLocale): LocalizedPdfVariant | undefined => {
    const localized = visibleVariants.filter((item) => item.locale === target);
    return (
      localized.filter((item) => currentLayout(item) && item.sourceCurrent !== false).at(-1) ??
      localized.filter(currentLayout).at(-1) ??
      localized.at(-1)
    );
  };
  const previousLayouts = $derived(
    visibleVariants.filter(
      (item) => !currentLayout(item) && item.status === 'ready' && item.integrityBlocked !== true,
    ),
  );
  // Keep authorized historical versions in the inventory when a new layout is requested.
  function mergeVariant(incoming: LocalizedPdfVariant): LocalizedPdfVariant[] {
    return visibleVariants.some((item) => item.variantId === incoming.variantId)
      ? visibleVariants.map((item) => (item.variantId === incoming.variantId ? incoming : item))
      : [...visibleVariants, incoming];
  }
  const selectedVariant = $derived(variantForLocale(effectiveLocale));
  const problemVariant = $derived(
    problemVariantId ? visibleVariants.find((item) => item.variantId === problemVariantId) : null,
  );

  const variantStatus = (variant: LocalizedPdfVariant): string =>
    t(
      variant.sourceCurrent === false
        ? 'Outdated'
        : !currentLayout(variant)
          ? 'pdf.earlierLayout'
          : variant.status,
    );

  function failureMessage(variant: LocalizedPdfVariant): string {
    return t(
      variant.integrityBlocked === true
        ? 'problem.localizedPdf.downloadIntegrity'
        : variant.retryable === true
          ? 'problem.localizedPdf.downloadFailed'
          : 'problem.localizedPdf.retryNotAllowed',
    );
  }

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

  function responseProblem(body: Record<string, unknown>): ProblemData | null {
    if (
      typeof body.code !== 'string' ||
      typeof body.messageKey !== 'string' ||
      !/^(?:problem|action)\./u.test(body.messageKey)
    )
      return null;
    return {
      code: body.code,
      messageKey: body.messageKey as ProblemData['messageKey'],
      message: typeof body.message === 'string' ? body.message : undefined,
      params:
        body.params && typeof body.params === 'object' && !Array.isArray(body.params)
          ? (body.params as ProblemData['params'])
          : {},
      fieldErrors: {},
      remedies: Array.isArray(body.remedies)
        ? body.remedies.filter((item): item is ProblemData['remedies'][number] =>
            Boolean(item && typeof item === 'object' && typeof item.id === 'string'),
          )
        : [],
      correlationId: typeof body.correlationId === 'string' ? body.correlationId : '',
    };
  }

  function responseError(response: Response, body: Record<string, unknown>): string {
    if (responseProblem(body)) return '';
    if (response.status === 401) return t('Sign in again to continue.');
    if (response.status === 403 || response.status === 404)
      return t('You do not have permission to generate this PDF or its source is unavailable.');
    if (response.status === 409)
      return t('The source changed. Refresh this page and generate the PDF again.');
    return t('The PDF could not be generated. Try again shortly.');
  }

  function showResponseProblem(
    response: Response,
    body: Record<string, unknown>,
    variantId: string | null = null,
    focus = false,
  ): void {
    problem = responseProblem(body);
    problemVariantId = problem ? variantId : null;
    errorMessage = problem ? '' : responseError(response, body);
    if (focus && problem)
      void tick().then(() =>
        panelElement?.querySelector<HTMLElement>('[data-ui="problem-notice"]')?.focus(),
      );
  }

  async function refresh(options: { silent?: boolean } = {}): Promise<boolean> {
    if (!ownerId) return false;
    const sourceKey = JSON.stringify([ownerType, ownerId, sourceVersion]);
    const stillCurrent = () => sourceKey === JSON.stringify([ownerType, ownerId, sourceVersion]);
    if (!options.silent) loading = true;
    if (!options.silent) {
      errorMessage = '';
      problem = null;
      problemVariantId = null;
    }
    try {
      const response = await fetch(localizedPdfCollectionUrl(base, ownerType, ownerId), {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await jsonResponse(response);
      if (!stillCurrent()) return false;
      if (!response.ok) {
        showResponseProblem(response, body, null, !options.silent);
        return false;
      }
      const next = Array.isArray(body.variants)
        ? body.variants
            .map(normalizeLocalizedPdfVariant)
            .filter((item): item is LocalizedPdfVariant => item !== null)
        : [];
      variants = next;
      loaded = true;
      requestStatusUnknownLocale = null;
      retryStatusUnknownId = null;
      return true;
    } catch {
      if (!stillCurrent()) return false;
      errorMessage = t('The PDF list could not be loaded.');
      return false;
    } finally {
      if (!options.silent && stillCurrent()) loading = false;
    }
  }

  async function requestVariant(targetLocale: LocalizedPdfLocale): Promise<void> {
    if (readOnly || submittingLocale || requestStatusUnknownLocale === targetLocale || !ownerId)
      return;
    const sourceKey = JSON.stringify([ownerType, ownerId, sourceVersion]);
    const stillCurrent = () => sourceKey === JSON.stringify([ownerType, ownerId, sourceVersion]);
    const priorVariant = variantForLocale(targetLocale);
    submittingLocale = targetLocale;
    errorMessage = '';
    problem = null;
    try {
      const response = await fetch(localizedPdfRequestUrl(base), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId, locale: targetLocale }),
      });
      const body = await jsonResponse(response);
      if (!stillCurrent()) return;
      if (!stillCurrent()) return;
      const next = normalizeLocalizedPdfVariant(body.variant);
      if (!response.ok || !next) {
        showResponseProblem(response, body, null, true);
        return;
      }
      if (!stillCurrent()) return;
      variants = mergeVariant(next);
      loaded = true;
    } catch {
      if (!stillCurrent()) return;
      const refreshed = await refresh({ silent: true });
      if (!stillCurrent()) return;
      if (!refreshed && problem) {
        requestStatusUnknownLocale = targetLocale;
        void tick().then(() =>
          panelElement?.querySelector<HTMLElement>('[data-ui="problem-notice"]')?.focus(),
        );
        return;
      }
      const current = variantForLocale(targetLocale);
      if (
        refreshed &&
        current &&
        currentLayout(current) &&
        (current.variantId !== priorVariant?.variantId ||
          current.status === 'queued' ||
          current.status === 'running')
      )
        return;
      const stillFailed =
        refreshed && current && currentLayout(current) && current.status === 'failed';
      requestStatusUnknownLocale = stillFailed ? null : targetLocale;
      problem = {
        code: stillFailed
          ? 'LOCALIZED_PDF_REQUEST_STILL_FAILED'
          : 'LOCALIZED_PDF_REQUEST_UNCERTAIN',
        messageKey: stillFailed
          ? 'problem.localizedPdf.requestStillFailed'
          : 'problem.localizedPdf.requestUncertain',
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'refresh_pdf_status' }],
        correlationId: '',
      };
      problemVariantId = current?.variantId ?? null;
      errorMessage = '';
      void tick().then(() =>
        panelElement?.querySelector<HTMLElement>('[data-ui="problem-notice"]')?.focus(),
      );
    } finally {
      if (stillCurrent()) submittingLocale = null;
    }
  }

  async function retryVariant(variant: LocalizedPdfVariant): Promise<void> {
    if (
      retryingVariantId ||
      retryStatusUnknownId === variant.variantId ||
      readOnly ||
      !canRetryLocalizedPdf(variant)
    )
      return;
    const sourceKey = JSON.stringify([ownerType, ownerId, sourceVersion]);
    const stillCurrent = () => sourceKey === JSON.stringify([ownerType, ownerId, sourceVersion]);
    retryingVariantId = variant.variantId;
    errorMessage = '';
    problem = null;
    try {
      const response = await fetch(localizedPdfRetryUrl(base, variant.variantId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await jsonResponse(response);
      if (!stillCurrent()) return;
      if (!stillCurrent()) return;
      const next = normalizeLocalizedPdfVariant(body.variant);
      if (!response.ok || !next) {
        if (response.status === 409) await refresh({ silent: true });
        if (!stillCurrent()) return;
        showResponseProblem(response, body, variant.variantId, true);
        return;
      }
      if (!stillCurrent()) return;
      variants = mergeVariant(next);
      loaded = true;
    } catch {
      if (!stillCurrent()) return;
      const refreshed = await refresh({ silent: true });
      if (!stillCurrent()) return;
      if (!refreshed && problem) {
        retryStatusUnknownId = variant.variantId;
        void tick().then(() =>
          panelElement?.querySelector<HTMLElement>('[data-ui="problem-notice"]')?.focus(),
        );
        return;
      }
      const current = variants.find((item) => item.variantId === variant.variantId);
      if (refreshed && current && current.status !== 'failed') return;
      retryStatusUnknownId = refreshed ? null : variant.variantId;
      problem = {
        code: refreshed ? 'LOCALIZED_PDF_RETRY_STILL_FAILED' : 'LOCALIZED_PDF_RETRY_UNCERTAIN',
        messageKey: refreshed
          ? 'problem.localizedPdf.retryStillFailed'
          : 'problem.localizedPdf.retryUncertain',
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'refresh_pdf_status' }],
        correlationId: '',
      };
      problemVariantId = variant.variantId;
      errorMessage = '';
      void tick().then(() =>
        panelElement?.querySelector<HTMLElement>('[data-ui="problem-notice"]')?.focus(),
      );
    } finally {
      if (stillCurrent()) retryingVariantId = null;
    }
  }

  async function downloadVariant(event: MouseEvent, variant: LocalizedPdfVariant): Promise<void> {
    event.preventDefault();
    if (downloadingVariantId) return;
    const sourceKey = JSON.stringify([ownerType, ownerId, sourceVersion]);
    const stillCurrent = () => sourceKey === JSON.stringify([ownerType, ownerId, sourceVersion]);
    downloadingVariantId = variant.variantId;
    errorMessage = '';
    problem = null;
    problemVariantId = null;
    try {
      const response = await fetch(localizedPdfDownloadUrl(base, variant.variantId), {
        credentials: 'same-origin',
        headers: { accept: 'application/pdf, application/json' },
      });
      if (!response.ok) {
        const body = await jsonResponse(response);
        if (!stillCurrent()) return;
        if (response.status === 409 || response.status === 404) await refresh({ silent: true });
        if (!stillCurrent()) return;
        showResponseProblem(response, body, variant.variantId, true);
        return;
      }
      if (!stillCurrent()) return;
      if (!response.headers.get('content-type')?.includes('application/pdf')) {
        errorMessage = t('problem.localizedPdf.downloadNetwork');
        return;
      }
      const blob = await response.blob();
      if (!stillCurrent()) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = privateDownloadFilename(
        response.headers.get('content-disposition'),
        variant.semanticFilename ?? 'document.pdf',
      );
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      if (!stillCurrent()) return;
      errorMessage = t('problem.localizedPdf.downloadNetwork');
    } finally {
      if (stillCurrent()) downloadingVariantId = null;
    }
  }

  function chooseLocale(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    selectedLocale = localeFromPortalLocale(value as PortalLocale);
    userSelectedLocale = true;
  }

  $effect(() => {
    const hasActiveVariant = visibleVariants.some(
      (item) =>
        item.sourceCurrent !== false &&
        currentLayout(item) &&
        (item.status === 'queued' || item.status === 'running'),
    );
    if (!hasActiveVariant || pollingTimer) return;
    pollingTimer = setInterval(() => void refresh({ silent: true }), 2500);
    return () => {
      if (pollingTimer) clearInterval(pollingTimer);
      pollingTimer = undefined;
    };
  });

  onMount(() => {
    mounted = true;
    void refresh();
  });
</script>

<section
  bind:this={panelElement}
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
      {#if !readOnly}<button
          type="button"
          class="localized-pdf-primary-action"
          onclick={() => void requestVariant(effectiveLocale)}
          disabled={submittingLocale !== null ||
            requestStatusUnknownLocale === effectiveLocale ||
            loading ||
            (selectedVariant &&
              currentLayout(selectedVariant) &&
              selectedVariant.sourceCurrent !== false &&
              (selectedVariant.status === 'queued' || selectedVariant.status === 'running'))}
          >{t(
            selectedVariant &&
              selectedVariant.sourceCurrent !== false &&
              !currentLayout(selectedVariant)
              ? 'pdf.generateCurrentLayout'
              : 'Generate report',
          )}</button
        >{/if}
      {#if selectedVariant?.sourceCurrent !== false && selectedVariant?.status === 'ready' && currentLayout(selectedVariant)}
        <a
          class="localized-pdf-primary-action"
          href={localizedPdfDownloadUrl(base, selectedVariant.variantId)}
          download={selectedVariant.semanticFilename ?? undefined}
          onclick={(event) => void downloadVariant(event, selectedVariant)}
          aria-disabled={downloadingVariantId === selectedVariant.variantId}>{t('Download')}</a
        >
      {:else if !readOnly && selectedVariant?.sourceCurrent !== false && selectedVariant && currentLayout(selectedVariant) && canRetryLocalizedPdf(selectedVariant)}
        <button
          type="button"
          class="localized-pdf-primary-action"
          onclick={() => void retryVariant(selectedVariant)}
          disabled={retryingVariantId === selectedVariant.variantId ||
            retryStatusUnknownId === selectedVariant.variantId}>{t('Retry')}</button
        >
      {/if}
    </div>
    <p id={`${languageId}-help`} class="localized-pdf-help">
      {#if selectedVariant?.sourceCurrent === false}{t(
          'The source changed. Generate a current PDF before downloading.',
        )}{:else if selectedVariant && !currentLayout(selectedVariant)}{t('pdf.earlierLayout')} · {t(
          'pdf.currentLayoutHelp',
        )}{:else if selectedVariant}{variantStatus(selectedVariant)}{:else}{t(
          'Not generated yet',
        )}{/if}
    </p>
  </div>

  {#if problem}
    <ProblemNotice
      {problem}
      status={problemVariant &&
      problem.code !== 'LOCALIZED_PDF_RETRY_UNCERTAIN' &&
      problem.code !== 'LOCALIZED_PDF_REQUEST_UNCERTAIN'
        ? `${t('Status')}: ${variantStatus(problemVariant)}`
        : undefined}
      remedyLinks={{
        refresh_pdf_status: { label: t('Refresh') },
        review_current_record: { label: t('problem.remedy.reviewPdfRecord') },
        contact_owner: { label: t('problem.remedy.contactPdfOwner') },
        sign_in_again: { label: t('Sign in again to continue.'), href: `${base}/app/login` },
      }}
    />
    {#if problem.remedies.some((remedy) => remedy.id === 'refresh_pdf_status')}
      <button
        type="button"
        class="localized-pdf-refresh"
        onclick={() => void refresh()}
        disabled={loading}>{t('Refresh')}</button
      >
    {/if}
  {:else if errorMessage}
    <p class="localized-pdf-error" role="alert">{errorMessage}</p>
  {:else if !loaded && loading}
    <p class="localized-pdf-loading" role="status" aria-live="polite">{t('Loading')}</p>
  {/if}

  {#snippet variantsList()}
    <ul class="localized-pdf-variants" aria-label={t('Language')} aria-live="polite">
      {#each localizedPdfLocaleOptions as option}
        {@const variant = variantForLocale(option.value)}
        <li class:localized-pdf-selected={option.value === effectiveLocale}>
          <div class="localized-pdf-variant-label">
            <strong>{t(option.labelKey)}</strong>
            {#if variant}
              <span
                class={`localized-pdf-status localized-pdf-status-${variant.sourceCurrent === false || !currentLayout(variant) ? 'warning' : statusVariant(variant.status)}`}
              >
                {variantStatus(variant)}
              </span>
            {:else}
              <span class="localized-pdf-status localized-pdf-status-neutral"
                >{t('Not generated yet')}</span
              >
            {/if}
          </div>
          <div class="localized-pdf-variant-actions">
            {#if variant?.sourceCurrent === false}<span>{t('Generate a current PDF')}</span
              >{:else if variant && !currentLayout(variant)}
              <span>{t('pdf.generateCurrentLayout')}</span>
            {:else if variant?.status === 'ready'}
              <a
                href={localizedPdfDownloadUrl(base, variant.variantId)}
                download={variant.semanticFilename ?? undefined}
                onclick={(event) => void downloadVariant(event, variant)}
                aria-disabled={downloadingVariantId === variant.variantId}
                aria-label={`${t('Download')} ${t(option.labelKey)}`}>{t('Download')}</a
              >
            {:else if variant?.status === 'failed'}
              <span class="localized-pdf-failure-reason">{failureMessage(variant)}</span>
              {#if !readOnly && canRetryLocalizedPdf(variant)}
                <button
                  type="button"
                  class="localized-pdf-text-action"
                  onclick={() => void retryVariant(variant)}
                  disabled={retryingVariantId === variant.variantId ||
                    retryStatusUnknownId === variant.variantId}>{t('Retry')}</button
                >
              {/if}
            {:else if variant}
              <span>{variantStatus(variant)}</span>
            {:else}
              <span>{t('Not generated yet')}</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/snippet}
  {#if compact}
    <details class="localized-pdf-language-details">
      <summary>{t('Other PDF languages')}</summary>{@render variantsList()}
    </details>
  {:else}
    {@render variantsList()}
  {/if}
  {#if previousLayouts.length}
    <details class="localized-pdf-language-details" data-previous-pdf-layouts>
      <summary>{t('pdf.previousLayouts')}</summary>
      <ul class="localized-pdf-variants">
        {#each previousLayouts as variant (variant.variantId)}
          <li>
            <div class="localized-pdf-variant-label">
              <strong
                >{t(
                  localizedPdfLocaleOptions.find((option) => option.value === variant.locale)
                    ?.labelKey ?? 'English',
                )}</strong
              >
              <span class="localized-pdf-status localized-pdf-status-warning"
                >{variantStatus(variant)}</span
              >
              <span>{String(variant.templateVersion ?? '')}</span>
            </div>
            {#if variant.sourceCurrent === false}
              <span>{t('The source changed. Generate a current PDF before downloading.')}</span>
            {:else}
              <a
                href={localizedPdfDownloadUrl(base, variant.variantId)}
                download={variant.semanticFilename ?? undefined}
                onclick={(event) => void downloadVariant(event, variant)}
                aria-disabled={downloadingVariantId === variant.variantId}
                aria-label={`${t('pdf.downloadPreviousLayout')} · ${t(localizedPdfLocaleOptions.find((option) => option.value === variant.locale)?.labelKey ?? 'English')} · ${String(variant.templateVersion ?? '')}`}
                >{t('pdf.downloadPreviousLayout')}</a
              >
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .localized-pdf-language-details summary {
    cursor: pointer;
    padding-block: 0.6rem;
    min-height: 44px;
    font-weight: 700;
  }
  .localized-pdf-language-details summary:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
  }
  .localized-pdf-panel {
    display: grid;
    gap: 1.15rem;
    padding: 1.25rem;
    border: 1px solid color-mix(in srgb, var(--portal-ink, #21201e) 14%, transparent);
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
    color: var(--portal-ink, #21201e);
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
    border: 1px solid color-mix(in srgb, var(--portal-ink, #21201e) 16%, transparent);
    border-radius: 0.65rem;
    color: var(--portal-ink, #21201e);
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
    color: var(--portal-ink, #21201e);
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
    border: 1px solid color-mix(in srgb, var(--portal-ink, #21201e) 22%, transparent);
    border-radius: 0.65rem;
    color: var(--portal-ink, #21201e);
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
    color: #1e1e1c;
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
    color: var(--portal-ink, #21201e);
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
    border: 1px solid color-mix(in srgb, var(--portal-ink, #21201e) 10%, transparent);
    border-radius: 0.72rem;
    background: rgb(255 255 255 / 52%);
  }

  .localized-pdf-variants li.localized-pdf-selected {
    border-color: color-mix(in srgb, var(--portal-ink, #21201e) 35%, transparent);
    box-shadow: inset 3px 0 0 var(--portal-accent, #d8f06a);
  }

  .localized-pdf-variant-label {
    gap: 0.6rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .localized-pdf-variant-label strong {
    color: var(--portal-ink, #21201e);
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
    color: #504f49;
    background: #eaeae8;
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
    color: var(--portal-ink, #21201e);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  .localized-pdf-failure-reason {
    max-width: 12rem;
    color: #8e2b28;
    font-size: 0.76rem;
    line-height: 1.35;
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
