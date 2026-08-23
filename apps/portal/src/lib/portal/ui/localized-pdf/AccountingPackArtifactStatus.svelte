<script lang="ts">
  import { base } from '$app/paths';
  import type { PortalLocale } from '$lib/portal-i18n';
  import type { ControlledValueDomain } from '$lib/i18n/controlled-values';
  import LocalizedPdfPanel from './LocalizedPdfPanel.svelte';

  type Pack = Record<string, unknown>;
  type AccountingPackExportType = 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json';
  type AccountingPackArtifactStatus = 'ready' | 'failed' | 'queued' | 'processing' | 'pending';

  type Props = {
    pack: Pack;
    isAuditor: boolean;
    locale: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  };

  let { pack, isAuditor, locale, translate, controlledValue }: Props = $props();

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
    return Object.fromEntries(
      accountingPackExportTypes.map(({ key }) => {
        const value = String(rawStatuses[key] ?? '').toLowerCase();
        const status: AccountingPackArtifactStatus =
          value === 'ready' || artifacts.includes(key)
            ? 'ready'
            : value === 'failed' || packState === 'failed'
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
  ): Partial<Record<AccountingPackExportType, string>> {
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
            typeof value === 'string' &&
            value.trim().length > 0,
        )
        .map(([key, value]) => [key, String(value)]),
    ) as Partial<Record<AccountingPackExportType, string>>;
  }

  function accountingPackStatusLabel(status: AccountingPackArtifactStatus): string {
    if (status === 'ready') return translate('Ready');
    if (status === 'failed') return translate('Failed');
    if (status === 'processing') return translate('Processing');
    if (status === 'queued') return translate('Queued');
    return translate('Pending');
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
  const exportErrors = $derived(accountingPackExportErrors(pack));
  const revisionId = $derived(readRevisionId(pack));
  const packState = $derived(String(pack.state ?? ''));
</script>

<article class="invoice-row accounting-pack-artifact-row">
  <div>
    <strong>{String(pack.period_start)} → {String(pack.period_end)}</strong>
    <small>{controlledValue('artifactState', pack.state)} · {String(pack.created_at)}</small>
  </div>
  <div class="record-actions" aria-label={translate('Accounting Pack artifacts')}>
    {#each accountingPackExportTypes as artifact}
      {@const status = exportStatuses[artifact.key]}
      {@const error = exportErrors[artifact.key]}
      {#if status === 'ready'}
        <a
          class="preview-link"
          data-ui="status-badge"
          data-variant="success"
          href={`${base}/app/api/accounting-pack/${String(pack.id)}/${artifact.key}`}
          aria-label={`${translate(artifact.label)} ${translate('Ready')}`}
          >{translate(artifact.label)} · {translate('Ready')}</a
        >
      {:else}
        <span
          class="artifact-pending"
          data-ui="status-badge"
          data-variant={accountingPackStatusVariant(status)}
          title={error ?? `${translate(artifact.label)} ${accountingPackStatusLabel(status)}`}
          aria-label={`${translate(artifact.label)} ${accountingPackStatusLabel(status)}`}
        >
          {translate(artifact.label)} · {accountingPackStatusLabel(status)}{#if error}
            — {error}{/if}
        </span>
      {/if}
    {/each}
    {#if !isAuditor && packState !== 'final' && packState !== 'queued'}
      <form method="POST" action="?/finalizeAccountingPack">
        <input type="hidden" name="packId" value={pack.id} />
        <button>{translate('Finalize')}</button>
      </form>
    {/if}
  </div>
</article>

{#if revisionId}
  <div class="no-print accounting-pack-localized-pdf">
    <LocalizedPdfPanel
      ownerType="accounting_pack_revision"
      ownerId={revisionId}
      {locale}
      title={translate('Accounting Pack')}
    />
  </div>
{/if}

<style>
  .accounting-pack-localized-pdf {
    margin: 0 0 1rem;
  }
</style>
