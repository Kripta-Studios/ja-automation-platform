<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import { tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  import type { ControlledValueDomain } from '$lib/i18n/controlled-values';
  import type { ProblemData } from '$lib/problem/contract';
  import { requestGuidedRecovery } from '$lib/portal/guided-recovery/events';
  import {
    downloadAccountingPackArtifact,
    classifyAccountingPackDownloadFailure,
    classifyAccountingPackRetryFailure,
    isModifiedDownloadClick,
    requestAccountingPackExportRetry,
    saveBlobAsFile,
  } from '$lib/portal/accounting-pack-download';
  import type { AccountingPackDownloadFailureKind } from '$lib/portal/accounting-pack-download';
  import { accountingPackFinalizationReadiness } from '$lib/portal/accounting-pack-finalization';
  import DirectionIcon from '../DirectionIcon.svelte';
  import ActualPdfPreview from '../ActualPdfPreview.svelte';
  import LocalizedPdfPanel from './LocalizedPdfPanel.svelte';
  import { accountingUxRound2Text } from '../../accounting-ux-round2-copy';

  type Pack = Record<string, unknown>;
  type AccountingPackExportType = 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json';
  type AccountingPackArtifactStatus = 'ready' | 'failed' | 'queued' | 'processing' | 'pending';

  type Props = {
    pack: Pack;
    isAuditor: boolean;
    locale: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    problem?: ProblemData | null;
    rememberPackScroll: (form: HTMLFormElement) => { destroy(): void };
  };

  let {
    pack,
    isAuditor,
    locale,
    translate,
    controlledValue,
    rememberPackScroll,
    problem = null,
  }: Props = $props();

  const packHeadingId = $derived(`accounting-pack-period-${String(pack.id)}`);

  const packContext = $derived(
    `${String(pack.period_start)} – ${String(pack.period_end)} · ${translate('Created')}: ${String(pack.created_at)}`,
  );

  const accountingPackExportTypes: ReadonlyArray<{
    key: AccountingPackExportType;
    label: string;
  }> = [
    { key: 'pdf', label: 'PDF' },
    { key: 'xlsx', label: 'XLSX' },
    { key: 'invoice_csv', label: 'Invoice CSV' },
    { key: 'expense_csv', label: 'Expense CSV' },
    { key: 'json', label: 'JSON' },
  ];

  function accountingPackExportStatuses(
    source: Pack,
  ): Record<AccountingPackExportType, AccountingPackArtifactStatus> {
    const raw = source.exportStatuses;
    const rawStatuses =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : Object.create(null);
    const artifacts = Array.isArray(source.artifacts)
      ? source.artifacts.map(String)
      : String(source.export_types ?? '')
          .split(',')
          .map((type) => type.trim())
          .filter(Boolean);
    const packState = String(source.state ?? '').toLowerCase();
    const failures = accountingPackExportErrors(source);
    return Object.fromEntries(
      accountingPackExportTypes.map(({ key }) => {
        const value = String(rawStatuses[key] ?? '').toLowerCase();
        const status: AccountingPackArtifactStatus =
          value === 'ready' || artifacts.includes(key)
            ? 'ready'
            : value === 'failed' || failures[key] || (!value && packState === 'failed')
              ? 'failed'
              : value === 'running' || value === 'processing' || packState === 'running'
                ? 'processing'
                : value === 'queued' || value === 'pending' || packState === 'queued'
                  ? 'queued'
                  : 'pending';
        return [key, status];
      }),
    ) as Record<AccountingPackExportType, AccountingPackArtifactStatus>;
  }

  function accountingPackExportErrors(
    source: Pack,
  ): Partial<Record<AccountingPackExportType, true>> {
    const raw = source.reconciliation_json;
    let reconciliation: unknown = raw;
    if (typeof raw === 'string') {
      try {
        reconciliation = JSON.parse(raw) as unknown;
      } catch {
        reconciliation = null;
      }
    }
    if (!reconciliation || typeof reconciliation !== 'object') return {};
    const failures = (reconciliation as Record<string, unknown>)._artifactFailures;
    if (!failures || typeof failures !== 'object') return {};
    return Object.fromEntries(
      Object.entries(failures as Record<string, unknown>)
        .filter(
          ([key, value]) =>
            accountingPackExportTypes.some((artifact) => artifact.key === key) &&
            value !== null &&
            typeof value === 'object',
        )
        .map(([key]) => [key, true]),
    ) as Partial<Record<AccountingPackExportType, true>>;
  }

  function accountingPackStatusLabel(status: AccountingPackArtifactStatus): string {
    if (status === 'ready') return translate('Ready');
    if (status === 'failed') return translate('Failed');
    if (status === 'processing') return translate('Processing');
    if (status === 'queued') return translate('Queued');
    return translate('Pending');
  }

  function packStatusLabel(status: string): string {
    if (status === 'final') return accountingUxRound2Text(locale, 'finalPack');
    if (status === 'stale') return accountingUxRound2Text(locale, 'stalePack');
    return controlledValue('artifactState', status) || translate(status);
  }

  function accountingPackStatusVariant(
    status: AccountingPackArtifactStatus,
  ): 'success' | 'danger' | 'warning' | 'info' {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'processing' || status === 'queued') return 'warning';
    return 'info';
  }

  /**
   * The legacy pack row's `id` is a mutable accounting_pack_run series/run id and
   * cannot authorize a localized variant. Only an immutable/current revision id
   * supplied by the loader is accepted; otherwise the localized panel is omitted.
   */
  function readRevisionId(pack: Pack): string | null {
    const candidates = [
      pack.revision_id,
      pack.revisionId,
      pack.current_revision_id,
      pack.currentRevisionId,
      pack.tail_revision_id,
      pack.tailRevisionId,
    ];
    const revision = candidates.find((value) => typeof value === 'string' && value.trim());
    return typeof revision === 'string' ? revision : null;
  }

  const exportStatuses = $derived(accountingPackExportStatuses(pack));
  const revisionId = $derived(readRevisionId(pack));
  const packState = $derived(String(pack.state ?? ''));
  const reconciliation = $derived.by(() => {
    const raw = pack.reconciliation_json;
    if (typeof raw !== 'string') return {} as Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  });
  const reviewCount = (key: string): number => {
    const value = Number(reconciliation[key] ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  const finalizationReadiness = $derived(accountingPackFinalizationReadiness(reconciliation));
  let previewOpen = $state(false);
  let downloadingKey = $state<AccountingPackExportType | null>(null);
  let retryingKey = $state<AccountingPackExportType | null>(null);
  let retryUncertainKey = $state<AccountingPackExportType | null>(null);
  let retryBlockedKey = $state<AccountingPackExportType | null>(null);
  let downloadNotice = $state<{
    key: AccountingPackExportType;
    kind:
      | AccountingPackDownloadFailureKind
      | 'network'
      | 'retry_queued'
      | 'retry_uncertain'
      | 'retry_error'
      | 'retry_unavailable'
      | 'retry_service_unavailable';
    correlationId?: string;
  } | null>(null);
  let downloadNoticeElement = $state<HTMLDivElement | undefined>(undefined);
  let downloadController: AbortController | null = null;
  const retryKeys = new SvelteMap<AccountingPackExportType, string>();

  function artifactHref(key: AccountingPackExportType): string {
    return `${base}/app/api/accounting-pack/${String(pack.id)}/${key}`;
  }

  function displayedStatus(
    key: AccountingPackExportType,
    status: AccountingPackArtifactStatus,
  ): AccountingPackArtifactStatus {
    return downloadingKey === key ? 'processing' : status;
  }

  function downloadNoticeMessage(notice: NonNullable<typeof downloadNotice>): string {
    const { kind } = notice;
    if (kind === 'retry_queued')
      return translate('The export retry was queued. Check the pack status before downloading.');
    if (kind === 'retry_uncertain')
      return translate(
        'The retry may already be queued. Check this pack status before trying again.',
      );
    if (kind === 'retry_error')
      return translate(
        'The export retry could not be queued. Check the pack status before trying again.',
      );
    if (kind === 'retry_service_unavailable')
      return notice.correlationId
        ? portalText(locale, 'problem.accountingPack.retryServiceUnavailable', {
            correlationId: notice.correlationId,
          })
        : translate(
            'The export retry could not be queued. Check the pack status before trying again.',
          );
    if (kind === 'retry_unavailable')
      return translate(
        'This export cannot be retried here. Review the pack and source records, then contact the owner or platform support.',
      );
    if (kind === 'changed')
      return translate(
        'The source records changed. Review the updated pack before generating another version.',
      );
    if (kind === 'processing')
      return translate(
        'This export is still processing. Check the pack status before trying the download again.',
      );
    if (kind === 'failed')
      return translate(
        'The export failed during generation. Check the pack status before trying again.',
      );
    if (kind === 'unauthenticated') return translate('Sign in again to continue.');
    if (kind === 'permission')
      return isAuditor
        ? translate('Contact a finance administrator to review the failed export.')
        : translate('Contact an owner');
    if (kind === 'temporary' || kind === 'network')
      return translate(
        'The download status is uncertain. Check the pack status before trying again.',
      );
    return translate(
      'The export could not be downloaded. Check the pack status before trying again.',
    );
  }

  async function showDownloadNotice(
    key: AccountingPackExportType,
    kind: NonNullable<typeof downloadNotice>['kind'],
    correlationId?: string,
  ): Promise<void> {
    downloadNotice = { key, kind, ...(correlationId ? { correlationId } : {}) };
    await tick();
    const notice = downloadNoticeElement;
    if (!notice?.isConnected) return;
    if (!['retry_queued', 'processing'].includes(kind)) {
      const messageKey: ProblemData['messageKey'] =
        kind === 'unauthenticated'
          ? 'problem.accountingPack.signInRequired'
          : kind === 'failed'
            ? 'problem.accountingPack.exportFailedRetryable'
            : kind === 'retry_service_unavailable'
              ? 'problem.accountingPack.retryServiceUnavailable'
              : kind === 'retry_unavailable'
                ? 'problem.accountingPack.retryLimit'
                : 'problem.accountingPack.exportUnavailable';
      requestGuidedRecovery({
        source: notice,
        problem: {
          code: `ACCOUNTING_PACK_${kind.toUpperCase()}`,
          messageKey,
          params: { format: key.toUpperCase(), correlationId: correlationId ?? '' },
          fieldErrors: {},
          remedies: [],
          correlationId: correlationId ?? '',
        },
        links: [
          {
            label: translate(kind === 'unauthenticated' ? 'Sign in again' : 'Check pack status'),
            href:
              kind === 'unauthenticated'
                ? `${base}/app/login`
                : `${base}/app/accounting#accounting-register`,
            reload: kind !== 'unauthenticated',
          },
        ],
      });
    }
    notice.focus({ preventScroll: true });
    const bounds = notice.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const headerPosition = header ? getComputedStyle(header).position : '';
    const safeTop =
      (header && (headerPosition === 'sticky' || headerPosition === 'fixed')
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0) + 16;
    const mobileNavigation = document.querySelector<HTMLElement>('.bottom-nav');
    const navigationTop =
      mobileNavigation && getComputedStyle(mobileNavigation).position === 'fixed'
        ? mobileNavigation.getBoundingClientRect().top
        : window.innerHeight;
    const safeBottom = Math.min(window.innerHeight, navigationTop) - 16;
    const scrollDelta =
      bounds.height > safeBottom - safeTop || bounds.top < safeTop
        ? bounds.top - safeTop
        : bounds.bottom > safeBottom
          ? bounds.bottom - safeBottom
          : 0;
    if (scrollDelta) window.scrollBy({ top: scrollDelta, behavior: 'instant' });
  }

  async function checkPackStatus(): Promise<void> {
    try {
      await invalidateAll();
      await tick();
      if (
        retryUncertainKey &&
        (exportStatuses[retryUncertainKey] === 'queued' ||
          exportStatuses[retryUncertainKey] === 'processing' ||
          exportStatuses[retryUncertainKey] === 'ready')
      )
        clearRetryIdempotencyKey(retryUncertainKey);
      retryUncertainKey = null;
      downloadNotice = null;
    } catch {
      if (downloadNotice)
        await showDownloadNotice(
          downloadNotice.key,
          downloadNotice.kind === 'retry_service_unavailable' ? downloadNotice.kind : 'network',
          downloadNotice.correlationId,
        );
    }
  }

  function retryStorageKey(key: AccountingPackExportType): string {
    return `ja-accounting-pack-export-retry:${String(pack.id)}:${key}`;
  }

  function retryIdempotencyKey(key: AccountingPackExportType): string {
    const existing = retryKeys.get(key);
    if (existing) return existing;
    const storageKey = retryStorageKey(key);
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(storageKey);
    } catch {
      // Keep the same in-memory key if browser storage is unavailable.
    }
    const value = stored || crypto.randomUUID();
    retryKeys.set(key, value);
    try {
      sessionStorage.setItem(storageKey, value);
    } catch {
      // The in-memory key still protects retries in this page session.
    }
    return value;
  }

  function clearRetryIdempotencyKey(key: AccountingPackExportType): void {
    retryKeys.delete(key);
    try {
      sessionStorage.removeItem(retryStorageKey(key));
    } catch {
      // Session storage can be disabled without affecting accepted retry state.
    }
  }

  async function recheckUncertainRetry(key: AccountingPackExportType): Promise<void> {
    try {
      await invalidateAll();
      await tick();
      if (exportStatuses[key] === 'failed') {
        retryUncertainKey = null;
        await showDownloadNotice(key, 'retry_error');
      } else if (
        exportStatuses[key] === 'queued' ||
        exportStatuses[key] === 'processing' ||
        exportStatuses[key] === 'ready'
      ) {
        retryUncertainKey = null;
        await showDownloadNotice(key, 'retry_queued');
      } else {
        await showDownloadNotice(key, 'retry_uncertain');
      }
    } catch {
      await showDownloadNotice(key, 'retry_uncertain');
    }
  }

  async function retryFailedExport(key: AccountingPackExportType): Promise<void> {
    if (
      isAuditor ||
      pack.sourceStale ||
      packState === 'final' ||
      exportStatuses[key] !== 'failed' ||
      retryingKey ||
      retryUncertainKey ||
      retryBlockedKey === key
    )
      return;
    retryingKey = key;
    const idempotencyKey = retryIdempotencyKey(key);
    try {
      const result = await requestAccountingPackExportRetry(
        `${artifactHref(key)}/retry`,
        idempotencyKey,
        fetch,
      );
      if (result.ok) {
        // A confirmed 202 has its own durable job identity. Retire this key so a later
        // terminal failure can receive a new, explicit retry; uncertain responses keep it.
        clearRetryIdempotencyKey(key);
        if (!['queued', 'claimed', 'running'].includes(result.job.state)) {
          retryUncertainKey = null;
          downloadNotice = null;
          try {
            await invalidateAll();
          } catch {
            await showDownloadNotice(key, 'retry_uncertain');
          }
          return;
        }
        retryUncertainKey = key;
        await showDownloadNotice(key, 'retry_queued');
        try {
          await invalidateAll();
          await tick();
          if (
            exportStatuses[key] === 'queued' ||
            exportStatuses[key] === 'processing' ||
            exportStatuses[key] === 'ready'
          ) {
            retryUncertainKey = null;
          }
        } catch {
          // The accepted retry may already be running; keep this key until a status check.
        }
        return;
      }
      const retryFailure = classifyAccountingPackRetryFailure(result);
      if (retryFailure === 'not_queued') {
        // The server failed before invoking the retry. Require a status check,
        // and keep the same idempotency key for the next explicit attempt.
        retryUncertainKey = key;
        await showDownloadNotice(key, 'retry_service_unavailable', result.correlationId);
        return;
      }
      if (retryFailure === 'uncertain') {
        retryUncertainKey = key;
        await showDownloadNotice(key, 'retry_uncertain');
        await recheckUncertainRetry(key);
        return;
      }
      if (
        result.code === 'ACCOUNTING_PACK_EXPORT_RETRY_LIMIT' ||
        result.code === 'ACCOUNTING_PACK_EXPORT_FINAL_IMMUTABLE' ||
        result.code === 'ACCOUNTING_PACK_EXPORT_UNAVAILABLE'
      ) {
        retryBlockedKey = key;
        await showDownloadNotice(key, 'retry_unavailable');
        return;
      }
      const kind = classifyAccountingPackDownloadFailure(result.status, result.error, result.code);
      await showDownloadNotice(key, kind === 'unknown' ? 'retry_error' : kind);
    } catch {
      retryUncertainKey = key;
      await showDownloadNotice(key, 'retry_uncertain');
      await recheckUncertainRetry(key);
    } finally {
      retryingKey = null;
    }
  }

  async function handleDownloadClick(
    event: MouseEvent,
    key: AccountingPackExportType,
  ): Promise<void> {
    if (event.defaultPrevented || isModifiedDownloadClick(event) || downloadingKey) return;
    event.preventDefault();
    // A stale non-final pack requires an explicit review and new version.
    if (pack.sourceStale && packState !== 'final') {
      await showDownloadNotice(key, 'changed');
      return;
    }
    downloadNotice = null;
    downloadingKey = key;
    downloadController?.abort();
    const controller = new AbortController();
    downloadController = controller;
    try {
      const href = artifactHref(key);
      const result = await downloadAccountingPackArtifact(
        href,
        {
          fetch: (input, init) => fetch(input, init),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          save: saveBlobAsFile,
        },
        { signal: controller.signal, maxAttempts: 1 },
      );
      if (controller.signal.aborted) return;
      if (result.ok) {
        await invalidateAll();
        return;
      }
      await showDownloadNotice(
        key,
        classifyAccountingPackDownloadFailure(result.status, result.error, result.code),
      );
    } catch {
      if (!controller.signal.aborted) await showDownloadNotice(key, 'network');
    } finally {
      if (downloadController === controller) {
        downloadController = null;
        downloadingKey = null;
      }
    }
  }
</script>

<article
  class="invoice-row accounting-pack-artifact-row"
  id={`accounting-pack-${String(pack.id)}`}
  aria-labelledby={packHeadingId}
>
  <header class="accounting-pack-artifact-row__heading">
    <h3 id={packHeadingId}>{String(pack.period_start)} → {String(pack.period_end)}</h3>
    <small>{packStatusLabel(packState)} · {String(pack.created_at)}</small>
    {#if pack.sourceStale}
      <span class="accounting-pack-stale-badge" data-ui="status-badge" data-variant="warning">
        {accountingUxRound2Text(locale, 'stalePack')}
      </span>
    {/if}
  </header>
  <div
    class="accounting-pack-downloads"
    role="group"
    aria-label={accountingUxRound2Text(locale, 'artifactStatusAndDownloads')}
  >
    {#each accountingPackExportTypes as artifact}
      {@const status = displayedStatus(artifact.key, exportStatuses[artifact.key])}
      {#if status === 'ready'}
        <a
          class="preview-link"
          data-ui="status-badge"
          data-variant="success"
          href={artifactHref(artifact.key)}
          aria-busy="false"
          aria-label={`${translate(artifact.label)} ${translate('Ready')} · ${packContext}`}
          data-accounting-pack-download={artifact.key}
          onclick={(event) => void handleDownloadClick(event, artifact.key)}
          >{translate(artifact.label)} · {translate('Ready')}</a
        >
      {:else}
        <span
          class="artifact-pending"
          data-ui="status-badge"
          data-variant={accountingPackStatusVariant(status)}
          title={`${translate(artifact.label)} ${accountingPackStatusLabel(status)}`}
          aria-label={`${translate(artifact.label)} ${accountingPackStatusLabel(status)} · ${packContext}`}
        >
          {translate(artifact.label)} · {accountingPackStatusLabel(status)}
        </span>
      {/if}
    {/each}
  </div>
  <details
    class="accounting-pack-secondary"
    data-accounting-pack-secondary
    open={Boolean(
      problem ||
      downloadNotice ||
      retryingKey ||
      retryUncertainKey ||
      previewOpen ||
      packState === 'failed' ||
      Object.values(exportStatuses).some((status) => status === 'failed'),
    )}
  >
    <summary>{accountingUxRound2Text(locale, 'secondaryPackControls')}</summary>
    <div
      class="record-actions"
      role="group"
      aria-label={translate('Accounting Pack status and actions')}
    >
      {#if exportStatuses.pdf === 'ready'}
        <button
          type="button"
          class="preview-link"
          aria-expanded={previewOpen}
          onclick={() => {
            previewOpen = !previewOpen;
          }}
          >{previewOpen
            ? locale === 'es'
              ? 'Cerrar vista previa'
              : locale === 'pt'
                ? 'Fechar prévia'
                : 'Close PDF preview'
            : locale === 'es'
              ? 'Vista previa del PDF guardado'
              : locale === 'pt'
                ? 'Prévia do PDF salvo'
                : 'Preview saved PDF'}<span class="sr-only"> · {packContext}</span></button
        >
      {/if}
      {#each accountingPackExportTypes as artifact}
        {#if exportStatuses[artifact.key] === 'failed'}
          <div class="accounting-pack-export-guidance" role="status">
            <p>
              <strong>{translate(artifact.label)}:</strong>
              {translate('The export failed during generation. Other formats may still be ready.')}
            </p>
            <p>
              {isAuditor
                ? translate('Contact a finance administrator to review the failed export.')
                : packState === 'final'
                  ? translate(
                      'This finalized pack cannot be changed. Review its historical export and generate a new version if current records need to be included.',
                    )
                  : pack.sourceStale
                    ? translate(
                        'Retry is unavailable because source records changed. Review the pack before generating a new version.',
                      )
                    : translate('Review this pack, then retry only this failed export.')}
            </p>
            {#if !isAuditor}
              <a href={`${base}/app/finance?view=economic&lang=${encodeURIComponent(locale)}`}
                >{translate('Review project economics')} →</a
              >
              {#if !pack.sourceStale && packState !== 'final' && retryBlockedKey !== artifact.key}
                <button
                  type="button"
                  disabled={Boolean(retryingKey || retryUncertainKey === artifact.key)}
                  aria-busy={retryingKey === artifact.key}
                  onclick={() => void retryFailedExport(artifact.key)}
                  >{translate('Retry')} {translate(artifact.label)}</button
                >
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
      {#if downloadNotice}
        <div
          class="accounting-pack-download-notice"
          role="alert"
          tabindex="-1"
          bind:this={downloadNoticeElement}
        >
          <p>
            <strong
              >{translate(
                accountingPackExportTypes.find((artifact) => artifact.key === downloadNotice?.key)
                  ?.label ?? '',
              )}:</strong
            >
            {downloadNoticeMessage(downloadNotice)}
          </p>
          <button type="button" onclick={() => void checkPackStatus()}
            >{translate('Check pack status')}</button
          >
          {#if downloadNotice.kind === 'unauthenticated'}
            <a href={`${base}/app/login?lang=${encodeURIComponent(locale)}`}
              >{translate('Sign in again')}</a
            >
          {/if}
        </div>
      {/if}
      {#if !isAuditor && packState === 'final' && pack.sourceStale}
        <div class="accounting-pack-review" role="status">
          <p>
            {translate(
              'Sources changed after this final version. Keep this historical pack and generate a new version for the same period.',
            )}
          </p>
          <form
            method="POST"
            action="?/createAccountingPack"
            data-pack-id={String(pack.id)}
            use:rememberPackScroll
          >
            <input type="hidden" name="periodStart" value={String(pack.period_start)} />
            <input type="hidden" name="periodEnd" value={String(pack.period_end)} />
            <input type="hidden" name="viewportScrollY" value="0" />
            <input
              type="hidden"
              name="reportLocale"
              value={locale === 'es' ? 'es' : String(locale).startsWith('pt') ? 'pt' : 'en'}
            />
            <button type="submit">{translate('Generate new version')}</button>
          </form>
        </div>
      {/if}
      {#if packState !== 'final' && !finalizationReadiness.ready}
        <div
          class="accounting-pack-export-guidance"
          role="status"
          data-accounting-finalization-blocked
        >
          <strong>{translate('Finalization unavailable')}</strong>
          <p>{translate(finalizationReadiness.message)}</p>
          {#if !isAuditor}
            <a
              href={`${base}/app/billing?view=setup&lang=${encodeURIComponent(locale)}`}
              aria-label={`${translate('Review invoice issuers')} · ${packContext}`}
              >{translate('Review invoice issuers')} <DirectionIcon /></a
            >
          {:else}
            <p>{translate('Contact an owner')}</p>
          {/if}
        </div>
      {/if}
      {#if !isAuditor && packState !== 'final' && packState !== 'queued'}
        <section
          class="accounting-pack-review"
          aria-label={`${translate('Review before finalizing')} · ${packContext}`}
        >
          <h4>{translate('Review before finalizing')}</h4>
          <p>
            {translate(
              'Finalize freezes this reviewed version. Later source corrections require a new Accounting Pack version.',
            )}
          </p>
          <dl>
            <div>
              <dt>{translate('Pending records')}</dt>
              <dd>
                {reviewCount('pendingRecordCount')}
                <a href={`${base}/app/approvals?lang=${encodeURIComponent(locale)}`}
                  >{translate('Review pending records')} →</a
                >
                {#if reviewCount('pendingRecordCount') > 0}
                  <small
                    >{translate(
                      'Draft and returned records may not appear in the approval queue.',
                    )}</small
                  >
                {/if}
              </dd>
            </div>
            <div>
              <dt>{translate('Unclassified expenses')}</dt>
              <dd>
                {reviewCount('unclassifiedExpenseCount')}
                <a
                  href={`${base}/app/finance?view=economic&lang=${encodeURIComponent(locale)}#finance-source-records`}
                  >{translate('Classify expenses')} →</a
                >
              </dd>
            </div>
            <div>
              <dt>{translate('Missing documents')}</dt>
              <dd>
                {reviewCount('missingDocumentCount')}
                <a href={`${base}/app/documents?lang=${encodeURIComponent(locale)}`}
                  >{translate('Review documents')} →</a
                >
              </dd>
            </div>
            <div>
              <dt>{translate('Reconciliation issues')}</dt>
              <dd>
                {reviewCount('sourceMismatchCount') + reviewCount('missingCostRuleCount')}
                <a href={`${base}/app/finance?view=economic&lang=${encodeURIComponent(locale)}`}
                  >{translate('Review project economics')} →</a
                >
              </dd>
            </div>
            <div>
              <dt>{translate('Changes since generation')}</dt>
              <dd>
                {pack.sourceStale
                  ? translate('Yes — generate a new version')
                  : translate('None detected')}
                {#if pack.sourceStale}
                  <a href="#accounting-generate">{translate('Generate new version')} →</a>{/if}
              </dd>
            </div>
          </dl>
          {#if packState === 'ready' && reconciliation.reconciles === true && !pack.sourceStale && finalizationReadiness.ready}
            <form method="POST" action="?/finalizeAccountingPack" use:rememberPackScroll>
              <input type="hidden" name="packId" value={pack.id} />
              <input type="hidden" name="viewportScrollY" value="0" />
              <button>{translate('Finalize reviewed version')}</button>
            </form>
          {:else if finalizationReadiness.ready}
            <p role="status">
              {translate('Resolve processing, source-change or reconciliation issues first.')}
            </p>
          {/if}
        </section>
      {/if}
    </div>
    {#if previewOpen && exportStatuses.pdf === 'ready'}
      <ActualPdfPreview
        src={artifactHref('pdf')}
        {locale}
        onFailure={(payload, status, reference) => {
          const value =
            payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
          return showDownloadNotice(
            'pdf',
            classifyAccountingPackDownloadFailure(
              status,
              typeof value.error === 'string' ? value.error : '',
              typeof value.code === 'string' ? value.code : undefined,
            ),
            reference ?? undefined,
          );
        }}
      />
      <p class="form-help no-print">
        {locale === 'es'
          ? 'Revise los registros de origen antes de generar una nueva versión. Los paquetes finalizados conservan sus cifras históricas.'
          : locale === 'pt'
            ? 'Revise os registros de origem antes de gerar uma nova versão. Pacotes finalizados preservam seus valores históricos.'
            : 'Review source records before generating a new version. Finalized packs preserve their historical figures.'}
        <a href={`${base}/app/billing?view=invoices&lang=${encodeURIComponent(locale)}`}
          >{translate('Invoices')}</a
        >
        ·
        <a href={`${base}/app/finance?view=economic&lang=${encodeURIComponent(locale)}`}
          >{translate('Finance')}</a
        >
      </p>
    {/if}

    {#if revisionId}
      <div class="no-print accounting-pack-localized-pdf">
        <LocalizedPdfPanel
          ownerType="accounting_pack_revision"
          ownerId={revisionId}
          {locale}
          title={translate('Accounting Pack')}
          compact
        />
      </div>
    {/if}
  </details>
</article>

<style>
  .accounting-pack-artifact-row {
    display: grid;
    gap: 0.65rem;
    align-items: stretch;
  }
  .accounting-pack-artifact-row__heading {
    display: grid;
    gap: 0.2rem;
  }
  .accounting-pack-artifact-row__heading h3 {
    margin: 0;
    font-size: 1rem;
  }
  .accounting-pack-downloads {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .accounting-pack-artifact-row a,
  .accounting-pack-artifact-row button,
  .accounting-pack-secondary summary {
    min-height: 44px;
  }
  .accounting-pack-downloads a {
    display: inline-flex;
    align-items: center;
    padding-block: 0.55rem;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .accounting-pack-secondary > summary {
    width: fit-content;
    max-width: 100%;
    padding-block: 0.55rem;
    cursor: pointer;
    font-weight: 700;
  }
  .accounting-pack-secondary > .record-actions {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }
  .accounting-pack-localized-pdf {
    margin: 0 0 1rem;
  }

  .accounting-pack-review {
    width: min(100%, 38rem);
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.6rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .accounting-pack-review h4 {
    margin: 0 0 0.45rem;
  }

  .accounting-pack-review p {
    color: var(--portal-muted, #67675f);
  }

  .accounting-pack-review dl {
    display: grid;
    gap: 0.45rem;
  }

  .accounting-pack-review dl > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .accounting-pack-review dd {
    margin: 0;
    font-weight: 700;
  }

  .accounting-pack-export-guidance,
  .accounting-pack-download-notice {
    width: min(100%, 38rem);
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.6rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .accounting-pack-export-guidance p,
  .accounting-pack-download-notice p {
    margin: 0 0 0.45rem;
  }
</style>
