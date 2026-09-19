<script lang="ts">
  import { base } from '$app/paths';
  import { SectionCard, TableRegion, type TableCardRow } from '../ui';
  import { collectionText, type CollectionRow } from '../collections-analysis';
  import {
    customerBalances,
    collectionForecast,
    collectionPriorities,
    forecastBuckets,
    forecastLabels,
  } from '../collections-workbench';
  import { paymentMoney } from '../payment-money';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';

  let {
    rows,
    asOf,
    translate,
    exportUrl,
    locale = 'en',
  }: {
    rows: readonly CollectionRow[];
    asOf: string;
    translate: (text: string) => string;
    exportUrl: string | null;
    locale?: PortalLocale;
  } = $props();
  const views = {
    customers: 'Customer balances',
    priorities: 'Collection priorities',
    forecast: 'Collection forecast',
  } as const;
  let view = $state<keyof typeof views>('customers');
  let page = $state(0);
  const money = (amount: bigint | string, currency: string) =>
    paymentMoney(String(amount), currency, documentLanguage(locale));
  const cell = (label: string, value: string | number) => ({
    label: translate(label),
    value: String(value),
  });
  const tableRows = $derived.by((): TableCardRow[] => {
    if (view === 'customers')
      return customerBalances(rows, asOf).map((row) => ({
        id: row.id,
        href: row.clientId ? customerHref(row.clientId, row.currency) : undefined,
        linkLabel: translate('Review invoices'),
        cells: [
          cell('Client', `${row.clientNumber} · ${row.clientName}`),
          cell('Currency', row.currency),
          cell('Open documents', row.openDocuments),
          cell('Gross receivables', money(row.outstanding, row.currency)),
          cell('Credit balances', money(row.credits, row.currency)),
          cell('Net outstanding', money(row.netOutstanding, row.currency)),
          cell('Overdue', money(row.overdue, row.currency)),
          cell('Oldest overdue (days)', row.oldestDaysOverdue),
        ],
      }));
    if (view === 'forecast')
      return collectionForecast(rows, asOf).map((row) => ({
        id: row.currency,
        cells: [
          cell('Currency', row.currency),
          ...forecastBuckets.map((bucket) =>
            cell(forecastLabels[bucket], money(row.buckets[bucket], row.currency)),
          ),
          cell('Gross receivables', money(row.total, row.currency)),
          cell('Using expected collection date', money(row.explicit, row.currency)),
          cell('Using invoice due date', money(row.dueFallback, row.currency)),
        ],
      }));
    return collectionPriorities(rows, asOf).map((row) => ({
      id: collectionText(row, 'invoiceId'),
      href: `${base}/app/billing/invoices/${encodeURIComponent(collectionText(row, 'invoiceId'))}`,
      linkLabel: translate('Review invoice'),
      cells: [
        cell('Invoice', collectionText(row, 'invoiceNumber', 'invoiceId')),
        cell('Client', collectionText(row, 'clientName')),
        cell('Project', collectionText(row, 'projectName')),
        cell(
          'Outstanding',
          money(collectionText(row, 'outstandingMinor'), collectionText(row, 'currency')),
        ),
        cell('Review reason', translate(row.reason)),
        cell('Oldest overdue (days)', row.daysOverdue ?? '—'),
        cell('Due on', collectionText(row, 'dueDate').slice(0, 10) || '—'),
        cell('Expected collection', collectionText(row, 'expectedCollectionDate') || '—'),
      ],
    }));
  });
  const pageCount = $derived(Math.max(1, Math.ceil(tableRows.length / 10)));
  const currentPage = $derived(Math.min(page, pageCount - 1));
  const cardRows = $derived(tableRows.slice(currentPage * 10, (currentPage + 1) * 10));
  const headers = $derived(tableRows[0]?.cells.map((item) => item.label) ?? []);
  $effect(() => {
    void rows;
    void view;
    page = 0;
  });
  function customerHref(client: string, currency: string): string {
    const params = new URLSearchParams(exportUrl?.split('?')[1] ?? '');
    params.set('client', client);
    params.set('currency', currency);
    return `${base}/app/ledger?${params}#collections-ledger-register`;
  }
</script>

<SectionCard title={translate('Collection planning')} data-collections-workbench>
  <p>
    {translate('Current balances as of')}
    {asOf} ({translate('UTC time')}). {translate(
      'Amounts follow the active filters. Currencies are never combined.',
    )}
  </p>
  <div class="workbench-controls" role="group" aria-label={translate('Collection views')}>
    {#each Object.entries(views) as [key, label]}
      <button
        type="button"
        class="secondary-button"
        aria-pressed={view === key}
        onclick={() => (view = key as keyof typeof views)}>{translate(label)}</button
      >
    {/each}
    {#if exportUrl}<a class="secondary-button" href={`${exportUrl}&report=${view}`}
        >{translate('Export view CSV')}</a
      >{/if}
  </div>
  <h3>{translate(views[view])}</h3>
  {#if view === 'customers'}
    <p>
      {translate(
        'Internal customer summary across projects and issuers. Credit balances remain separate and are not automatically applied.',
      )}
    </p>
  {:else if view === 'forecast'}
    <p>
      {translate(
        'Remaining receivables use the expected collection date, or the invoice due date when absent. Past dates and missing dates stay separate. This is not a bank balance or guaranteed cash.',
      )}
    </p>
  {:else}
    <p>
      {translate(
        'Review overdue invoices, passed collection dates and missing due dates. Ordered by currency and oldest overdue first. Opening an invoice does not send a reminder.',
      )}
    </p>
  {/if}
  {#if tableRows.length}
    <TableRegion
      label={translate(views[view])}
      mobileMode="cards"
      {cardRows}
      detailsLabel={translate('Open details')}
    >
      <table>
        <caption class="sr-only">{translate(views[view])}</caption>
        <thead
          ><tr
            >{#each headers as header}<th scope="col">{header}</th
              >{/each}{#if view !== 'forecast'}<th scope="col">{translate('Actions')}</th>{/if}</tr
          ></thead
        >
        <tbody
          >{#each cardRows as row}<tr
              >{#each row.cells as item}<td>{item.value}</td>{/each}{#if view !== 'forecast'}<td
                  >{#if row.href}<a href={row.href}>{row.linkLabel}</a>{/if}</td
                >{/if}</tr
            >{/each}</tbody
        >
      </table>
    </TableRegion>
    <div class="workbench-controls" role="group" aria-label={translate('Pagination')}>
      <button
        type="button"
        class="secondary-button"
        disabled={currentPage === 0}
        onclick={() => (page = currentPage - 1)}>{translate('Previous')}</button
      >
      <span aria-live="polite"
        >{currentPage + 1} / {pageCount} · {tableRows.length} {translate('Records')}</span
      >
      <button
        type="button"
        class="secondary-button"
        disabled={currentPage + 1 >= pageCount}
        onclick={() => (page = currentPage + 1)}>{translate('Next')}</button
      >
    </div>
  {:else}<p role="status">{translate('No open items for this view')}</p>{/if}
</SectionCard>

<style>
  .workbench-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    margin-block: 1rem;
  }
  .workbench-controls button,
  .workbench-controls a {
    min-height: 44px;
    min-width: 80px;
  }
  button[aria-pressed='true'] {
    border-color: var(--color-primary, #1768ac);
    box-shadow: inset 0 -3px var(--color-primary, #1768ac);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.8rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border, #dce2ea);
  }
  th {
    white-space: nowrap;
  }
  td a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
  }
  @media (max-width: 600px) {
    .workbench-controls > button,
    .workbench-controls > a {
      flex: 1 1 100%;
      justify-content: center;
    }
  }
</style>
