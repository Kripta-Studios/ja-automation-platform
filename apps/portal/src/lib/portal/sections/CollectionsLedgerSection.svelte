<script lang="ts">
  import CollectionsWorkbench from './CollectionsWorkbench.svelte';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import type { PortalData } from '../portal-data';
  import { paymentMoney } from '../payment-money';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import { translateControlledValue } from '../../i18n/controlled-values';
  import {
    agingBuckets,
    agingLabels,
    collectionAging,
    collectionMatches,
    collectionSummaries,
  } from '../collections-analysis';
  import { SectionCard, StatusBadge, TableRegion, type TableCardRow } from '../ui';

  type Row = Record<string, unknown>;
  type TimelineEvent = {
    id: string;
    kind: 'payment' | 'reversal';
    date: string;
    amountMinor: string;
    currency: string;
    reference: string;
    detail: string;
  };

  type Props = {
    data: PortalData;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status' | 'billingStream', value: unknown) => string;
    locale?: PortalLocale;
  };

  let { data, translate, controlledValue, locale = 'en' }: Props = $props();

  let search = $state('');
  let statusFilter = $state('');
  let projectFilter = $state('');
  let clientFilter = $state('');
  let currencyFilter = $state('');
  let agingFilter = $state('');

  const rows = $derived((data.ledger ?? []) as Row[]);
  const asOf = $derived(data.financeToday ?? new Date().toISOString().slice(0, 10));
  const currencyOptions = $derived([...new Set(rows.map((row) => value(row, 'currency')))].sort());
  const clientOptions = $derived(
    Array.from(
      new Map(
        rows.map((row) => [
          value(row, 'clientId', 'client_id'),
          [value(row, 'clientNumber', 'client_number'), value(row, 'clientName', 'client_name')]
            .filter(Boolean)
            .join(' · '),
        ]),
      ).entries(),
    ).filter(([id]) => id),
  );
  const projectOptions = $derived(
    Array.from(
      new Map(
        rows
          .filter((row) => value(row, 'projectId', 'project_id'))
          .map((row) => [
            value(row, 'projectId', 'project_id'),
            [
              value(row, 'projectNumber', 'project_number'),
              value(row, 'projectName', 'project_name'),
            ]
              .filter(Boolean)
              .join(' · '),
          ]),
      ).entries(),
    ),
  );

  $effect(() => {
    clientFilter = $page.url.searchParams.get('client')?.trim() ?? '';
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    currencyFilter = $page.url.searchParams.get('currency')?.trim() ?? '';
    agingFilter = $page.url.searchParams.get('aging')?.trim() ?? '';
    const query = $page.url.searchParams.get('q');
    search = query?.trim() ?? '';
  });

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

  function streamLabel(row: Row): string {
    const stream = value(row, 'streamType', 'stream_type');
    return stream ? translateControlledValue(locale, 'billingStream', stream) : '—';
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

  function sourceSummary(row: Row): string {
    const count = sourceCount(row);
    const missing = missingSourceCount(row);
    return missing === '0' ? count : `${count} · ${missing} ${translate('missing')}`;
  }

  function moneyValue(row: Row, ...keys: string[]): string {
    const amount = value(row, ...keys);
    return amount
      ? paymentMoney(amount, value(row, 'currency') || 'USD', documentLanguage(locale))
      : '—';
  }

  function directCostValue(row: Row): string {
    return value(row, 'directCostComplete', 'direct_cost_complete') === 'false'
      ? translate('Unavailable — missing source IDs')
      : moneyValue(row, 'directCostMinor', 'direct_cost_minor');
  }

  function contributionValue(row: Row): string {
    return value(row, 'directCostComplete', 'direct_cost_complete') === 'false'
      ? translate('Unavailable')
      : moneyValue(row, 'contributionMinor', 'contribution_minor');
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
      reference: value(payment, 'reference') || translate('No reference'),
      detail: '',
    }));
    const reversals = reversalRows(row).map((reversal) => ({
      id: `reversal-${value(reversal, 'id')}`,
      kind: 'reversal' as const,
      date: value(reversal, 'effectiveAt', 'effective_at'),
      amountMinor: value(reversal, 'amountMinor', 'amount_minor'),
      currency: value(reversal, 'currency') || value(row, 'currency') || 'USD',
      reference: value(reversal, 'commandId', 'command_id', 'id') || translate('No reference'),
      detail:
        value(reversal, 'reason') ||
        value(reversal, 'reasonCode', 'reason_code') ||
        translate('No reason recorded'),
    }));
    return [...payments, ...reversals].sort((left, right) => left.date.localeCompare(right.date));
  }

  function timelineSummary(row: Row): string {
    const events = timeline(row);
    if (events.length === 0) return translate('No payment or reversal events recorded.');

    return events
      .map((event) => {
        const kind = event.kind === 'reversal' ? translate('Reversal') : translate('Payment');
        const date = displayDate(event.date, translate('Date unavailable'));
        const reference = `${translate('Payment reference / note')}: ${event.reference}`;
        return `${kind}: ${paymentMoney(event.amountMinor, event.currency, documentLanguage(locale))} · ${date} · ${reference}${event.detail ? ` · ${event.detail}` : ''}`;
      })
      .join(' · ');
  }

  const scopeRows = $derived(
    rows.filter((row) =>
      collectionMatches(
        row,
        { project: projectFilter, client: clientFilter, currency: currencyFilter, query: search },
        asOf,
      ),
    ),
  );

  const visibleRows = $derived(
    scopeRows.filter((row) =>
      collectionMatches(row, { status: statusFilter, aging: agingFilter }, asOf),
    ),
  );
  const summaries = $derived(collectionSummaries(visibleRows, asOf));
  const overdueCount = $derived(
    scopeRows.filter((row) => (collectionAging(row, asOf).daysOverdue ?? 0) > 0).length,
  );

  const statusCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const row of scopeRows) {
      const status = value(row, 'paymentStatus', 'payment_status') || 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  });

  const cardRows = $derived.by((): TableCardRow[] =>
    ledgerPage.map((row) => {
      const invoice = value(row, 'invoiceNumber', 'invoice_number', 'invoiceId') || '—';
      const status = value(row, 'paymentStatus', 'payment_status');
      return {
        id: value(row, 'invoiceId', 'id') || invoice,
        href: invoiceHref(row),
        cells: [
          {
            label: translate('Invoice'),
            value: `${invoice} · ${value(row, 'clientNumber', 'client_number') || '—'}`,
          },
          {
            label: translate('Client'),
            value: `${value(row, 'clientName', 'client_name') || '—'} · ${value(row, 'clientNumber', 'client_number') || '—'}`,
          },
          {
            label: translate('Project'),
            value: `${value(row, 'projectName', 'project_name') || '—'} · ${value(row, 'projectNumber', 'project_number') || '—'}`,
          },
          {
            label: translate('Stream'),
            value: streamLabel(row),
          },
          {
            label: translate('Actual issue'),
            value: displayDate(
              value(row, 'issueDate', 'issue_date'),
              translate('Issue date unavailable'),
            ),
          },
          {
            label: translate('Due on'),
            value: displayDate(value(row, 'dueDate', 'due_date'), translate('No due date')),
          },
          {
            label: translate('Receivable aging'),
            value: translate(agingLabels[collectionAging(row, asOf).agingBucket]),
          },
          {
            label: translate('Expected collection'),
            value: displayDate(value(row, 'expectedCollectionDate'), '—'),
          },
          {
            label: translate('Service period'),
            value: `${value(row, 'periodStart') || '—'} → ${value(row, 'periodEnd') || '—'}`,
          },
          { label: translate('PO / reference'), value: value(row, 'poNumber') || '—' },
          {
            label: translate('Invoiced'),
            value: moneyValue(row, 'invoicedMinor', 'invoiced_minor', 'totalMinor', 'total_minor'),
          },
          {
            label: translate('Gross'),
            value: moneyValue(row, 'grossPaymentsMinor', 'gross_payments_minor'),
          },
          {
            label: translate('Reversals'),
            value: moneyValue(row, 'paymentReversalsMinor', 'payment_reversals_minor'),
          },
          {
            label: translate('Net collected'),
            value: moneyValue(row, 'netCollectedMinor', 'collectedMinor', 'net_collected_minor'),
          },
          {
            label: translate('Outstanding'),
            value: moneyValue(row, 'outstandingMinor', 'outstanding_minor'),
          },
          { label: translate('Direct cost'), value: directCostValue(row) },
          { label: translate('Contribution'), value: contributionValue(row) },
          { label: translate('Sources'), value: sourceSummary(row) },
          { label: translate('Status'), value: statusLabel(status) },
          { label: translate('Timeline'), value: timelineSummary(row) },
        ],
      };
    }),
  );

  function isoCalendarDate(value: string): string {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match?.[1] ?? '';
  }

  function displayDate(raw: string, fallback: string): string {
    const calendar = isoCalendarDate(raw);
    return calendar || raw.trim() || fallback;
  }

  const exportPeriod = $derived.by(() => {
    const dates = visibleRows
      .map((row) =>
        isoCalendarDate(
          value(row, 'issueDate', 'issue_date', 'issuedAt', 'issued_at', 'createdAt', 'created_at'),
        ),
      )
      .filter(Boolean)
      .sort();
    if (dates.length === 0) return null;
    return { periodStart: dates[0]!, periodEnd: dates[dates.length - 1]! };
  });

  const periodStart = $derived(exportPeriod?.periodStart ?? '');
  const periodEnd = $derived(exportPeriod?.periodEnd ?? '');
  const canExport = $derived(
    Boolean(periodStart && periodEnd) &&
      ['owner_admin', 'finance_admin'].includes(String(data.user.role)),
  );

  function exportHref(format: 'csv' | 'xlsx'): string {
    // Emission dates describe the visible invoices; they must not truncate later collections.
    const query = new URLSearchParams();
    if (projectFilter) query.set('project', projectFilter);
    if (clientFilter) query.set('client', clientFilter);
    if (statusFilter) query.set('status', statusFilter);
    if (search.trim()) query.set('q', search.trim());
    if (currencyFilter) query.set('currency', currencyFilter);
    if (agingFilter) query.set('aging', agingFilter);
    return `${base}/app/api/invoice-collection-ledger/${format}?${query.toString()}`;
  }

  function invoiceHref(row: Row): string {
    const id = value(row, 'invoiceId', 'id');
    return id ? `${base}/app/billing/invoices/${encodeURIComponent(id)}` : `${base}/app/billing`;
  }

  function ledgerFilterHref(status: string): string {
    const query = new URLSearchParams();
    if (projectFilter) query.set('project', projectFilter);
    if (clientFilter) query.set('client', clientFilter);
    if (search.trim()) query.set('q', search.trim());
    if (currencyFilter) query.set('currency', currencyFilter);
    if (agingFilter) query.set('aging', agingFilter);
    if (status) query.set('status', status);
    const serialized = query.toString();
    return `${base}/app/ledger${serialized ? `?${serialized}` : ''}#collections-ledger-register`;
  }
  function agingHref(bucket: string, currency: string): string {
    const query = new URLSearchParams({ aging: bucket, currency });
    if (projectFilter) query.set('project', projectFilter);
    if (clientFilter) query.set('client', clientFilter);
    if (search.trim()) query.set('q', search.trim());
    return `${base}/app/ledger?${query}#collections-ledger-register`;
  }
  let ledgerPage = $state<typeof visibleRows>([]);
</script>

<div class="collections-ledger-section" data-ui="collections-ledger-section">
  <header class="collections-ledger__context">
    <div>
      <p class="collections-ledger__eyebrow">{translate('Finance control')}</p>
      <h2>{translate('Invoice / cost ledger')}</h2>
      <p>
        {translate(
          'Reconcile issued invoices, direct costs, collections, outstanding balances and contribution from canonical source rows.',
        )}
      </p>
    </div>
    <div class="collections-ledger__exports" role="group" aria-label={translate('Ledger exports')}>
      {#if canExport}
        <a class="secondary-button" href={exportHref('csv')}>{translate('Export CSV')}</a>
        <a class="secondary-button" href={exportHref('xlsx')}>{translate('Export XLSX')}</a>
      {:else if ['owner_admin', 'finance_admin'].includes(String(data.user.role))}
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
    <a href={ledgerFilterHref('')} aria-current={statusFilter === '' ? 'page' : undefined}>
      <span>{translate('Issued invoices')}</span>
      <strong>{scopeRows.length}</strong>
      <small>{translate('Authorized ledger rows')}</small>
    </a>
    <a
      href={ledgerFilterHref('partially_paid')}
      aria-current={statusFilter === 'partially_paid' ? 'page' : undefined}
    >
      <span>{translate('Partially paid')}</span>
      <strong>{statusCounts.partially_paid ?? 0}</strong>
      <small>{translate('Payment timeline requires review')}</small>
    </a>
    <a
      href={ledgerFilterHref('overdue')}
      aria-current={statusFilter === 'overdue' ? 'page' : undefined}
    >
      <span>{translate('Overdue')}</span>
      <strong>{overdueCount}</strong>
      <small>{translate('Outstanding collection attention')}</small>
    </a>
  </div>

  <form
    class="collections-ledger__filters"
    method="GET"
    action={`${base}/app/ledger`}
    aria-label={translate('Filter collections ledger')}
  >
    <label>
      <span>{translate('Search ledger')}</span>
      <input
        name="q"
        bind:value={search}
        type="search"
        placeholder={translate('Invoice, client or project')}
      />
    </label>
    <label>
      <span>{translate('Collection status')}</span>
      <select name="status" bind:value={statusFilter}>
        <option value="">{translate('All statuses')}</option>
        <option value="outstanding">{translate('Outstanding')}</option>
        <option value="collected">{translate('Collected (actual)')}</option>
        <option value="unpaid">{translate('Unpaid')}</option>
        <option value="partially_paid">{translate('Partially paid')}</option>
        <option value="paid">{translate('Paid')}</option>
        <option value="overdue">{translate('Overdue')}</option>
        <option value="void">{translate('Void')}</option>
      </select>
    </label>
    <label>
      <span>{translate('Client')}</span>
      <select name="client" bind:value={clientFilter}>
        <option value="">{translate('All clients')}</option>
        {#each clientOptions as [id, label]}<option value={id}>{label}</option>{/each}
      </select>
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select name="project" bind:value={projectFilter}>
        <option value="">{translate('All projects')}</option>
        {#each projectOptions as [id, label]}<option value={id}>{label}</option>{/each}
      </select>
    </label>
    <label>
      <span>{translate('Currency')}</span>
      <select name="currency" bind:value={currencyFilter}>
        <option value="">{translate('All currencies')}</option>
        {#each currencyOptions as currency}<option value={currency}>{currency}</option>{/each}
      </select>
    </label>
    <label>
      <span>{translate('Receivable aging')}</span>
      <select name="aging" bind:value={agingFilter}>
        <option value="">{translate('All maturities')}</option>
        {#each agingBuckets as bucket}<option value={bucket}
            >{translate(agingLabels[bucket])}</option
          >{/each}
      </select>
    </label>
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
    <a class="secondary-button" href={`${base}/app/ledger?q=`}>{translate('Clear filters')}</a>
  </form>

  <SectionCard title={translate('Receivable aging')} collapsible>
    <p class="collections-ledger__basis">
      {translate('Current balances as of')}
      {asOf} ({translate('UTC time')}).
      {translate('Amounts follow the active filters. Currencies are never combined.')}
      {#if exportPeriod}{translate('Invoice issue dates')}: {periodStart} → {periodEnd}.{/if}
    </p>
    {#each summaries as summary}
      <section
        class="collections-ledger__aging"
        data-aging-currency={summary.currency}
        aria-label={`${translate('Receivable aging')} · ${summary.currency}`}
      >
        <h3>
          {summary.currency} · {translate('Net outstanding')}: {paymentMoney(
            summary.netOutstanding.toString(),
            summary.currency,
            documentLanguage(locale),
          )}
        </h3>
        <p>
          {translate('Gross receivables')}: {paymentMoney(
            summary.outstanding.toString(),
            summary.currency,
            documentLanguage(locale),
          )} · {translate('Credit balances')}: {paymentMoney(
            summary.credits.toString(),
            summary.currency,
            documentLanguage(locale),
          )}
        </p>
        <p>
          {translate(
            'Aging shows gross receivables. Credit balances are separate, without assumed allocation.',
          )}
        </p>
        <p>
          {translate('Overdue')}: {paymentMoney(
            summary.overdue.toString(),
            summary.currency,
            documentLanguage(locale),
          )}
        </p>
        <div class="collections-ledger__buckets">
          {#each agingBuckets as bucket}
            <a
              href={agingHref(bucket, summary.currency)}
              aria-current={agingFilter === bucket ? 'page' : undefined}
            >
              <span>{translate(agingLabels[bucket])}</span>
              <strong
                >{paymentMoney(
                  summary.buckets[bucket].toString(),
                  summary.currency,
                  documentLanguage(locale),
                )}</strong
              >
            </a>
          {/each}
        </div>
      </section>
    {:else}
      <p role="status">{translate('No ledger rows found')}</p>
    {/each}
  </SectionCard>

  <CollectionsWorkbench
    {locale}
    rows={visibleRows}
    {asOf}
    {translate}
    exportUrl={canExport ? exportHref('csv') : null}
  />

  <SectionCard
    id="collections-ledger-register"
    title={translate('Master Invoice / Cost / Collection Ledger')}
  >
    <RecordBrowser
      rows={visibleRows}
      bind:visible={ledgerPage}
      {translate}
      label="CollectionsLedger"
      filtersEnabled={false}
    />
    <TableRegion
      ariaLabel={translate('Invoice reconciliation details')}
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
            <th scope="col">{translate('Due on')} / {translate('Receivable aging')}</th>
            <th scope="col">{translate('Invoiced')}</th>
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
          {#each ledgerPage as row}
            {@const status = value(row, 'paymentStatus', 'payment_status')}
            {@const aging = collectionAging(row, asOf)}
            <tr data-ledger-row={value(row, 'invoiceId', 'id')}>
              <td>
                <a class="collections-ledger__invoice-link" href={invoiceHref(row)}>
                  <strong
                    >{value(row, 'invoiceNumber', 'invoice_number', 'invoiceId') || '—'}</strong
                  >
                </a>
                <small
                  >{displayDate(
                    value(row, 'issueDate', 'issue_date'),
                    translate('Issue date unavailable'),
                  )}</small
                >
              </td>
              <td>
                <span>{value(row, 'clientNumber', 'client_number') || '—'}</span>
                <small>{value(row, 'clientName', 'client_name') || '—'}</small>
                <small>{value(row, 'projectNumber', 'project_number') || '—'}</small>
              </td>
              <td>{streamLabel(row)}</td>
              <td>
                <span
                  >{displayDate(value(row, 'dueDate', 'due_date'), translate('No due date'))}</span
                >
                <StatusBadge
                  variant={(aging.daysOverdue ?? 0) > 0 ? 'warning' : 'neutral'}
                  text={translate(agingLabels[aging.agingBucket])}
                />
                {#if value(row, 'expectedCollectionDate')}
                  <small
                    >{translate('Expected collection')}: {value(
                      row,
                      'expectedCollectionDate',
                    )}</small
                  >
                {/if}
              </td>
              <td>{moneyValue(row, 'totalMinor', 'total_minor')}</td>
              <td>{moneyValue(row, 'grossPaymentsMinor', 'gross_payments_minor')}</td>
              <td>{moneyValue(row, 'paymentReversalsMinor', 'payment_reversals_minor')}</td>
              <td
                >{moneyValue(row, 'netCollectedMinor', 'collectedMinor', 'net_collected_minor')}</td
              >
              <td>{moneyValue(row, 'outstandingMinor', 'outstanding_minor')}</td>
              <td>
                {directCostValue(row)}
              </td>
              <td>
                {contributionValue(row)}
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
                          <strong
                            >{paymentMoney(
                              event.amountMinor,
                              event.currency,
                              documentLanguage(locale),
                            )}</strong
                          >
                          <small
                            >{displayDate(event.date, translate('Date unavailable'))} · {translate(
                              'Payment reference / note',
                            )}:
                            {event.reference}{event.detail ? ` · ${event.detail}` : ''}</small
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
              <td colspan="14">
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
  .collections-ledger__basis {
    margin: 0 0 1rem;
    color: var(--portal-muted, #67675f);
  }
  .collections-ledger__aging + .collections-ledger__aging {
    margin-top: 1.25rem;
  }
  .collections-ledger__aging h3 {
    margin: 0;
    font-size: 1rem;
  }
  .collections-ledger__buckets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: 0.5rem;
  }
  .collections-ledger__buckets a {
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem;
    min-height: 2.75rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
    color: inherit;
    text-decoration: none;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .collections-ledger__buckets a:hover,
  .collections-ledger__buckets a:focus-visible,
  .collections-ledger__buckets a[aria-current='page'] {
    outline: 2px solid var(--portal-accent, #53524c);
    outline-offset: 2px;
  }
  .collections-ledger__buckets span {
    font-size: 0.8125rem;
  }
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
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .collections-ledger__context h2 {
    margin: 0;
    color: var(--portal-ink, #20201d);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .collections-ledger__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #67675f);
  }

  .collections-ledger__exports {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .collections-ledger__exports-unavailable {
    align-self: center;
    color: var(--portal-muted, #67675f);
    font-size: 0.82rem;
  }

  .collections-ledger__attention {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .collections-ledger__attention a {
    display: grid;
    gap: 0.22rem;
    min-height: 6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
    text-decoration: none;
  }

  .collections-ledger__attention a:hover,
  .collections-ledger__attention a:focus-visible,
  .collections-ledger__attention a[aria-current='page'] {
    border-color: var(--portal-accent, #53524c);
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 24%, transparent);
    outline-offset: 2px;
  }

  .collections-ledger__invoice-link {
    color: var(--portal-accent, #53524c);
    text-decoration: none;
  }

  .collections-ledger__invoice-link:hover,
  .collections-ledger__invoice-link:focus-visible {
    text-decoration: underline;
  }

  .collections-ledger__attention span,
  .collections-ledger__attention small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .collections-ledger__attention strong {
    color: var(--portal-ink, #20201d);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .collections-ledger__filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #f2f2f1));
  }

  .collections-ledger__filters label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .collections-ledger__filters input,
  .collections-ledger__filters select {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
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
    border-bottom: 1px solid var(--portal-border, #dfdedc);
    text-align: left;
    vertical-align: top;
  }

  .collections-ledger__table th {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    line-height: 1.25;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .collections-ledger__table td {
    color: var(--portal-ink, #20201d);
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
  }

  .collections-ledger__table td:nth-child(n + 4):nth-child(-n + 9) {
    white-space: nowrap;
  }

  .collections-ledger__table td > span,
  .collections-ledger__table td > small,
  .collections-ledger__table td > a {
    display: block;
  }

  .collections-ledger__table td > small {
    margin-top: 0.25rem;
    color: var(--portal-muted, #67675f);
    font-variant-numeric: normal;
  }

  .collections-ledger__timeline-toggle {
    min-width: 0;
  }

  .collections-ledger__timeline-toggle summary {
    width: fit-content;
    min-height: 2.75rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.45rem;
    color: var(--portal-ink, #20201d);
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 700;
    list-style: none;
  }

  .collections-ledger__timeline-toggle summary::-webkit-details-marker {
    display: none;
  }

  .collections-ledger__timeline {
    display: grid;
    gap: 0.55rem;
    min-width: 12rem;
    max-width: 22rem;
    margin-top: 0.55rem;
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }

  .collections-ledger__timeline article {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
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
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }

  .collections-ledger__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    text-align: center;
  }

  .collections-ledger__empty span {
    color: var(--portal-muted, #67675f);
  }

  .collections-ledger__filters input:focus-visible,
  .collections-ledger__filters select:focus-visible,
  .collections-ledger__filters button:focus-visible,
  .collections-ledger__exports a:focus-visible,
  .collections-ledger__timeline-toggle summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    outline-offset: 2px;
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
