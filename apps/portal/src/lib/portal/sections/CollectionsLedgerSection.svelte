<script lang="ts">
  import { base } from '$app/paths';
  import type { PortalData } from '../portal-data';
  import { paymentMoney } from '../payment-money';
  import { SectionCard, StatusBadge, TableRegion, type TableCardRow } from '../ui';

  type Row = Record<string, unknown>;
  type TimelineEvent = {
    id: string;
    kind: 'payment' | 'reversal';
    date: string;
    amountMinor: string;
    currency: string;
    detail: string;
  };

  type Props = {
    data: PortalData;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status', value: unknown) => string;
  };

  let { data, translate, controlledValue }: Props = $props();

  let search = $state('');
  let statusFilter = $state('');

  const rows = $derived((data.ledger ?? []) as Row[]);
  const normalizedSearch = $derived(search.trim().toLowerCase());

  function value(row: Row, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
        return String(candidate);
      }
    }
    return '';
  }

  function statusLabel(valueToLabel: unknown): string {
    return controlledValue?.('status', valueToLabel) || translate(String(valueToLabel || '—'));
  }

  function statusVariant(
    valueToClass: unknown,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(valueToClass ?? '')) {
      case 'paid':
        return 'success';
      case 'partially_paid':
      case 'overdue':
        return 'warning';
      case 'void':
      case 'credited':
        return 'danger';
      case 'issued':
      case 'sent':
        return 'info';
      default:
        return 'neutral';
    }
  }

  function sourceCount(row: Row): string {
    return Array.isArray(row.sources) ? String(row.sources.length) : '0';
  }

  function missingSourceCount(row: Row): string {
    return Array.isArray(row.directCostMissingSourceIds)
      ? String(row.directCostMissingSourceIds.length)
      : '0';
  }

  function moneyValue(row: Row, ...keys: string[]): string {
    const amount = value(row, ...keys);
    return amount ? paymentMoney(amount, value(row, 'currency') || 'USD') : '—';
  }

  function paymentRows(row: Row): Row[] {
    return Array.isArray(row.payments)
      ? row.payments.filter((candidate): candidate is Row =>
          Boolean(candidate && typeof candidate === 'object'),
        )
      : [];
  }

  function reversalRows(row: Row): Row[] {
    return Array.isArray(row.paymentReversals)
      ? row.paymentReversals.filter((candidate): candidate is Row =>
          Boolean(candidate && typeof candidate === 'object'),
        )
      : [];
  }

  function timeline(row: Row): TimelineEvent[] {
    const payments = paymentRows(row).map((payment) => ({
      id: `payment-${value(payment, 'id')}`,
      kind: 'payment' as const,
      date: value(payment, 'received_at', 'receivedAt'),
      amountMinor: value(payment, 'grossAmountMinor', 'amount_minor', 'amountMinor'),
      currency: value(payment, 'currency') || value(row, 'currency') || 'USD',
      detail: value(payment, 'reference') || translate('No reference'),
    }));
    const reversals = reversalRows(row).map((reversal) => ({
      id: `reversal-${value(reversal, 'id')}`,
      kind: 'reversal' as const,
      date: value(reversal, 'effectiveAt', 'effective_at'),
      amountMinor: value(reversal, 'amountMinor', 'amount_minor'),
      currency: value(reversal, 'currency') || value(row, 'currency') || 'USD',
      detail:
        value(reversal, 'reason') ||
        value(reversal, 'reasonCode', 'reason_code') ||
        translate('No reason recorded'),
    }));
    return [...payments, ...reversals].sort((left, right) => left.date.localeCompare(right.date));
  }

  const visibleRows = $derived.by(() =>
    rows.filter((row) => {
      const status = value(row, 'paymentStatus', 'payment_status');
      const matchesStatus = !statusFilter || status === statusFilter;
      const searchable = [
        value(row, 'invoiceNumber', 'invoice_number', 'invoiceId'),
        value(row, 'clientNumber', 'client_number', 'clientName', 'client_name'),
        value(row, 'projectNumber', 'project_number', 'projectName', 'project_name'),
        value(row, 'streamType', 'stream_type'),
      ]
        .join(' ')
        .toLowerCase();
      return matchesStatus && (!normalizedSearch || searchable.includes(normalizedSearch));
    }),
  );

  const statusCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const status = value(row, 'paymentStatus', 'payment_status') || 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  });

  const cardRows = $derived.by((): TableCardRow[] =>
    visibleRows.map((row) => {
      const invoice = value(row, 'invoiceNumber', 'invoice_number', 'invoiceId') || '—';
      const status = value(row, 'paymentStatus', 'payment_status');
      return {
        id: value(row, 'invoiceId', 'id') || invoice,
        cells: [
          {
            label: translate('Invoice'),
            value: `${invoice} · ${value(row, 'clientNumber', 'client_number') || '—'}`,
          },
          {
            label: translate('Client / project'),
            value: `${value(row, 'clientName', 'client_name') || '—'} · ${value(row, 'projectNumber', 'project_number') || '—'}`,
          },
          { label: translate('Gross'), value: moneyValue(row, 'totalMinor', 'total_minor') },
          {
            label: translate('Net collected'),
            value: moneyValue(row, 'netCollectedMinor', 'collectedMinor', 'net_collected_minor'),
          },
          {
            label: translate('Outstanding'),
            value: moneyValue(row, 'outstandingMinor', 'outstanding_minor'),
          },
          { label: translate('Status'), value: statusLabel(status) },
        ],
      };
    }),
  );

  const periodStart = $derived(
    data.periodStart || value(rows[0] ?? {}, 'periodStart', 'period_start') || '',
  );
  const periodEnd = $derived(
    data.periodEnd || value(rows[0] ?? {}, 'periodEnd', 'period_end') || '',
  );

  const canExport = $derived(Boolean(periodStart && periodEnd));

  function exportHref(format: 'csv' | 'xlsx'): string {
    const query = new URLSearchParams({
      periodStart,
      periodEnd,
    });
    return `${base}/app/api/invoice-collection-ledger/${format}?${query.toString()}`;
  }
</script>

<div class="collections-ledger-section" data-ui="collections-ledger-section">
  <header class="collections-ledger__context">
    <div>
      <p class="collections-ledger__eyebrow">{translate('Finance control')}</p>
      <h2>{translate('Collections / Ledger')}</h2>
      <p>
        {translate(
          'Reconcile issued invoices, direct costs, collections, outstanding balances and contribution from canonical source rows.',
        )}
      </p>
    </div>
    <div class="collections-ledger__exports" aria-label={translate('Ledger exports')}>
      {#if canExport}
        <a class="secondary-button" href={exportHref('csv')}>{translate('Export CSV')}</a>
        <a class="secondary-button" href={exportHref('xlsx')}>{translate('Export XLSX')}</a>
      {:else}
        <span class="collections-ledger__exports-unavailable"
          >{translate('Select a period to export')}</span
        >
      {/if}
    </div>
  </header>

  <div
    class="collections-ledger__attention"
    aria-label={translate('Collections attention summary')}
  >
    <article>
      <span>{translate('Issued invoices')}</span>
      <strong>{rows.length}</strong>
      <small>{translate('Authorized ledger rows')}</small>
    </article>
    <article>
      <span>{translate('Partially paid')}</span>
      <strong>{statusCounts.partially_paid ?? 0}</strong>
      <small>{translate('Payment timeline requires review')}</small>
    </article>
    <article>
      <span>{translate('Overdue')}</span>
      <strong>{statusCounts.overdue ?? 0}</strong>
      <small>{translate('Outstanding collection attention')}</small>
    </article>
  </div>

  <form
    class="collections-ledger__filters"
    aria-label={translate('Filter collections ledger')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search ledger')}</span>
      <input
        bind:value={search}
        type="search"
        placeholder={translate('Invoice, client or project')}
      />
    </label>
    <label>
      <span>{translate('Collection status')}</span>
      <select bind:value={statusFilter}>
        <option value="">{translate('All statuses')}</option>
        <option value="unpaid">{translate('Unpaid')}</option>
        <option value="partially_paid">{translate('Partially paid')}</option>
        <option value="paid">{translate('Paid')}</option>
        <option value="overdue">{translate('Overdue')}</option>
        <option value="void">{translate('Void')}</option>
      </select>
    </label>
    <button
      type="button"
      class="secondary-button"
      onclick={() => {
        search = '';
        statusFilter = '';
      }}>{translate('Clear filters')}</button
    >
  </form>

  <SectionCard title={translate('Master Invoice / Cost / Collection Ledger')}>
    <TableRegion
      ariaLabel={translate('Master Invoice / Cost / Collection Ledger')}
      mobileMode="cards"
      {cardRows}
    >
      <table class="collections-ledger__table">
        <caption class="sr-only">{translate('Master Invoice / Cost / Collection Ledger')}</caption>
        <thead>
          <tr>
            <th scope="col">{translate('Invoice')}</th>
            <th scope="col">{translate('Client / project')}</th>
            <th scope="col">{translate('Stream')}</th>
            <th scope="col">{translate('Gross')}</th>
            <th scope="col">{translate('Reversals')}</th>
            <th scope="col">{translate('Net collected')}</th>
            <th scope="col">{translate('Outstanding')}</th>
            <th scope="col">{translate('Direct cost')}</th>
            <th scope="col">{translate('Contribution')}</th>
            <th scope="col">{translate('Sources')}</th>
            <th scope="col">{translate('Status')}</th>
            <th scope="col">{translate('Timeline')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleRows as row}
            {@const status = value(row, 'paymentStatus', 'payment_status')}
            <tr data-ledger-row={value(row, 'invoiceId', 'id')}>
              <td>
                <strong>{value(row, 'invoiceNumber', 'invoice_number', 'invoiceId') || '—'}</strong>
                <small
                  >{value(row, 'issueDate', 'issue_date') ||
                    translate('Issue date unavailable')}</small
                >
              </td>
              <td>
                <span>{value(row, 'clientNumber', 'client_number') || '—'}</span>
                <small>{value(row, 'clientName', 'client_name') || '—'}</small>
                <small>{value(row, 'projectNumber', 'project_number') || '—'}</small>
              </td>
              <td>{value(row, 'streamType', 'stream_type') || '—'}</td>
              <td>{moneyValue(row, 'totalMinor', 'total_minor')}</td>
              <td>{moneyValue(row, 'paymentReversalsMinor', 'payment_reversals_minor')}</td>
              <td
                >{moneyValue(row, 'netCollectedMinor', 'collectedMinor', 'net_collected_minor')}</td
              >
              <td>{moneyValue(row, 'outstandingMinor', 'outstanding_minor')}</td>
              <td>
                {value(row, 'directCostComplete', 'direct_cost_complete') === 'false'
                  ? translate('Unavailable — missing source IDs')
                  : moneyValue(row, 'directCostMinor', 'direct_cost_minor')}
              </td>
              <td>
                {value(row, 'directCostComplete', 'direct_cost_complete') === 'false'
                  ? translate('Unavailable')
                  : moneyValue(row, 'contributionMinor', 'contribution_minor')}
              </td>
              <td>
                {sourceCount(row)}
                {#if missingSourceCount(row) !== '0'}
                  <small> · {missingSourceCount(row)} {translate('missing')}</small>
                {/if}
              </td>
              <td>
                <StatusBadge variant={statusVariant(status)} text={statusLabel(status)} />
              </td>
              <td>
                <details class="collections-ledger__timeline-toggle">
                  <summary>{translate('View timeline')}</summary>
                  <div class="collections-ledger__timeline" aria-live="polite">
                    {#each timeline(row) as event}
                      <article data-timeline-event={event.id}>
                        <StatusBadge
                          variant={event.kind === 'reversal' ? 'danger' : 'success'}
                          text={event.kind === 'reversal'
                            ? translate('Reversal')
                            : translate('Payment')}
                        />
                        <div>
                          <strong>{paymentMoney(event.amountMinor, event.currency)}</strong>
                          <small
                            >{event.date || translate('Date unavailable')} · {event.detail}</small
                          >
                        </div>
                      </article>
                    {:else}
                      <p>{translate('No payment or reversal events recorded.')}</p>
                    {/each}
                  </div>
                </details>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="12">
                <div class="collections-ledger__empty" role="status">
                  <strong>{translate('No ledger rows found')}</strong>
                  <span>{translate('Try another filter or period.')}</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableRegion>
  </SectionCard>
</div>

<style>
  .collections-ledger-section {
    display: grid;
    gap: 1.25rem;
  }

  .collections-ledger__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .collections-ledger__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .collections-ledger__context h2 {
    margin: 0;
    color: var(--portal-ink, #16202a);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .collections-ledger__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .collections-ledger__exports {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .collections-ledger__exports-unavailable {
    align-self: center;
    color: var(--portal-muted, #64748b);
    font-size: 0.82rem;
  }

  .collections-ledger__attention {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .collections-ledger__attention article {
    display: grid;
    gap: 0.22rem;
    min-height: 6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .collections-ledger__attention span,
  .collections-ledger__attention small {
    color: var(--portal-muted, #64748b);
    font-size: 0.8rem;
  }

  .collections-ledger__attention strong {
    color: var(--portal-ink, #16202a);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .collections-ledger__filters {
    display: grid;
    grid-template-columns: minmax(16rem, 2fr) minmax(12rem, 1fr) auto;
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .collections-ledger__filters label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .collections-ledger__filters input,
  .collections-ledger__filters select {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .collections-ledger__filters button,
  .collections-ledger__exports a {
    min-height: 2.75rem;
  }

  .collections-ledger__table {
    width: 100%;
    border-collapse: collapse;
  }

  .collections-ledger__table th,
  .collections-ledger__table td {
    padding: 0.8rem 0.7rem;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
    text-align: left;
    vertical-align: top;
  }

  .collections-ledger__table th {
    color: var(--portal-muted, #64748b);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .collections-ledger__table td {
    color: var(--portal-ink, #16202a);
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
  }

  .collections-ledger__table td > span,
  .collections-ledger__table td > small,
  .collections-ledger__table td > strong {
    display: block;
  }

  .collections-ledger__table td > small {
    margin-top: 0.25rem;
    color: var(--portal-muted, #64748b);
    font-variant-numeric: normal;
  }

  .collections-ledger__timeline-toggle {
    min-width: 11rem;
  }

  .collections-ledger__timeline-toggle summary {
    width: fit-content;
    min-height: 2.75rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.45rem;
    color: var(--portal-ink, #16202a);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 700;
    list-style: none;
  }

  .collections-ledger__timeline-toggle summary::-webkit-details-marker {
    display: none;
  }

  .collections-ledger__timeline {
    display: grid;
    gap: 0.55rem;
    min-width: 16rem;
    margin-top: 0.55rem;
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }

  .collections-ledger__timeline article {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
  }

  .collections-ledger__timeline article:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .collections-ledger__timeline article > div {
    display: grid;
    gap: 0.15rem;
  }

  .collections-ledger__timeline small,
  .collections-ledger__timeline p {
    color: var(--portal-muted, #64748b);
    font-size: 0.76rem;
  }

  .collections-ledger__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    text-align: center;
  }

  .collections-ledger__empty span {
    color: var(--portal-muted, #64748b);
  }

  .collections-ledger__filters input:focus-visible,
  .collections-ledger__filters select:focus-visible,
  .collections-ledger__filters button:focus-visible,
  .collections-ledger__exports a:focus-visible,
  .collections-ledger__timeline-toggle summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 60rem) {
    .collections-ledger__table {
      min-width: 70rem;
    }
  }

  @media (max-width: 52rem) {
    .collections-ledger__context {
      align-items: flex-start;
      flex-direction: column;
    }

    .collections-ledger__exports {
      width: 100%;
    }

    .collections-ledger__exports a {
      flex: 1 1 10rem;
      text-align: center;
    }

    .collections-ledger__filters {
      grid-template-columns: 1fr;
    }

    .collections-ledger__filters button {
      width: 100%;
    }
  }

  @media (max-width: 36rem) {
    .collections-ledger__attention {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .collections-ledger-section * {
      scroll-behavior: auto;
    }
  }
</style>
