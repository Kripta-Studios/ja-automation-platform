<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  import LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte';

  type Row = Record<string, unknown>;
  let { data, form } = $props();
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
  const report = $derived(data.report as Row);
  const project = $derived((report.project ?? {}) as Row);
  const summary = $derived((report.commercialSummary ?? {}) as Row);
  const finance = $derived(
    (report.financialSummary ?? {}) as Row & {
      timeEconomics?: Row[];
      expenseEconomics?: Row[];
    },
  );
  const calculation = $derived((report.commercialCalculation ?? []) as Row[]);
  const dailyReports = $derived((report.dailyReports ?? []) as Row[]);
  const technicalReports = $derived((report.technicalReports ?? []) as Row[]);
  const technicalChanges = $derived((report.technicalChanges ?? []) as Row[]);
  const expenses = $derived((report.expenses ?? []) as Row[]);
  const timeSummary = $derived((report.timeSummary ?? []) as Row[]);
  const internal = $derived(String(report.audience) === 'internal');

  const display = (value: unknown, fallback = '—') =>
    value === null || value === undefined || value === '' ? fallback : String(value);
  const hours = (minutes: unknown) => `${(Number(minutes ?? 0) / 60).toFixed(1)} h`;
  const money = (
    minor: unknown,
    currency = String(summary.currency ?? project.currency ?? 'USD'),
  ) =>
    new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale, {
      style: 'currency',
      currency,
    }).format(Number(minor ?? 0) / 100);
  const reportLink = (id: unknown) => `${base}/app/reports/${String(id)}`;
  const printReport = (): void => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  };
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

<svelte:head><title>{t('Period report')} · {display(project.number)}</title></svelte:head>

<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={`${base}/app/reports`}>← {t('Reports')}</a><a
      href={`${base}/app/projects/${String(project.id)}`}>{t('Open project')}</a
    ><button type="button" class="no-print print-trigger" onclick={printReport}
      ><span aria-hidden="true">⎙</span> {t('Print Report')}</button
    >
  </nav>

  {#if standaloneActionMessage(locale, form)}
    <p class="action-message no-print" role="status" aria-live="polite">
      {standaloneActionMessage(locale, form)}
    </p>
  {/if}

  <header class="record-detail-header">
    <div>
      <p class="portal-kicker">
        {display(project.number)} / {controlled('recordType', report.reportType)}
      </p>
      <h1>{display(project.name, t('Project period report'))}</h1>
      <p>
        {display(project.clientName)} · {display(report.periodStart)} → {display(report.periodEnd)}
      </p>
    </div>
    <div class="record-detail-actions">
      <span class="project-state"
        >{controlled('status', report.audience)} · {controlled('status', report.state)}</span
      >
      {#if report.pdfReady}<a
          class="preview-link"
          href={`${base}/app/api/reports/${String(report.id)}/pdf`}
          target="_blank"
          rel="noreferrer">{t('Open PDF')}</a
        >{/if}
    </div>
  </header>

  <section class="record-detail-grid report-calculation-grid">
    <article class="record-fact">
      <span>{t('Actual hours')}</span><strong>{hours(summary.actualMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>{t('Approved hours')}</span><strong>{hours(summary.approvedMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>{t('Billable hours')}</span><strong>{hours(summary.billableMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>{t('Calculated bill candidate')}</span><strong
        >{money(summary.candidateSubtotalMinor)}</strong
      >
    </article>
    <article class="record-fact">
      <span>{t('Already invoiced')}</span><strong>{money(summary.invoicedNetMinor)}</strong>
    </article>
    <article class="record-fact">
      <span>{t('Approved unbilled WIP')}</span><strong
        >{money(summary.approvedUnbilledWipMinor)}</strong
      >
    </article>
    {#if internal}
      <article class="record-fact">
        <span>{t('Direct cost')}</span><strong>{money(finance.approvedCostMinor)}</strong>
      </article>
      <article class="record-fact">
        <span>{t('Contribution')}</span><strong>{money(finance.contributionMarginMinor)}</strong>
      </article>
      <article class="record-fact">
        <span>{t('Contribution margin')}</span><strong
          >{(Number(finance.contributionMarginBps ?? 0) / 100).toFixed(1)}%</strong
        >
      </article>
    {/if}
  </section>

  <section class="detail-panel report-breakdown">
    <div class="panel-title">
      <div>
        <h2>{t('How this report was calculated')}</h2>
        <p class="form-help">
          {t(
            'Values are recalculated from approved source records, effective client rates, internal cost rules, compensation rules, daily minimums, milestones and expense treatments. Refresh after changing source data.',
          )}
        </p>
      </div>
      <span>{controlled('billingStream', summary.billingModel)}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>{t('Stream')}</th><th>{t('Calculation basis')}</th><th>{t('Minutes')}</th><th
              >{t('Amount')}</th
            ></tr
          ></thead
        >
        <tbody>
          {#each calculation as line}
            <tr>
              <td>{controlled('billingStream', line.type)}</td>
              <td>{display(line.basis)}</td>
              <td
                >{line.minutes === null || line.minutes === undefined
                  ? '—'
                  : hours(line.minutes)}</td
              >
              <td>{money(line.amountMinor)}</td>
            </tr>
          {:else}<tr><td colspan="4">{t('No calculated commercial lines.')}</td></tr>{/each}
        </tbody>
      </table>
    </div>
    <p class="form-help">
      {t('Operational value')}: {money(summary.operationalRevenueCandidateMinor)} · {t('Paid')}: {money(
        summary.paidMinor,
      )} · {t('Receivable')}: {money(summary.receivableMinor)}
    </p>
  </section>

  {#if internal}
    <section class="detail-panel report-breakdown">
      <div class="panel-title">
        <div>
          <h2>{t('Internal financial detail')}</h2>
          <p class="form-help">
            {t(
              'Internal loaded cost, worker compensation and margin remain restricted to Finance, Owner and Auditor roles.',
            )}
          </p>
        </div>
      </div>
      <div class="record-detail-grid">
        <article class="record-fact">
          <span>{t('Labor cost')}</span><strong>{money(finance.directLaborCostMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>{t('Worker compensation')}</span><strong
            >{money(finance.workerCompensationMinor)}</strong
          >
        </article>
        <article class="record-fact">
          <span>{t('Travel cost')}</span><strong>{money(finance.travelCostMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>{t('Other direct cost')}</span><strong>{money(finance.otherDirectCostMinor)}</strong
          >
        </article>
        <article class="record-fact">
          <span>{t('Missing rate rules')}</span><strong
            >{display(finance.missingRateCount, '0')}</strong
          >
        </article>
      </div>
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>{t('Date')}</th><th>{t('Worker')}</th><th>{t('Category')}</th><th
                >{t('Hours')}</th
              ><th>{t('Client value')}</th><th>{t('Loaded cost')}</th><th>{t('Compensation')}</th
              ></tr
            ></thead
          >
          <tbody>
            {#each finance.timeEconomics ?? [] as line}
              <tr
                ><td>{display(line.workDate)}</td><td>{display(line.workerName)}</td><td
                  >{controlled('timeCategory', line.category)}</td
                ><td>{hours(line.actualMinutes)}</td><td>{money(line.clientRevenueMinor)}</td><td
                  >{money(line.internalCostMinor)}</td
                ><td>{money(line.workerCompensationMinor)}</td></tr
              >
            {:else}<tr><td colspan="7">{t('No time economics in this period.')}</td></tr>{/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Daily reports')}</h2>
        <span>{dailyReports.length}</span>
      </div>
      {#each dailyReports as item}
        <a class="record-card-link" href={item.id ? reportLink(item.id) : `${base}/app/reports`}
          ><strong>{display(item.date)}</strong><small
            >{display(item.worker)} · {display(item.summary)}</small
          ></a
        >
      {:else}<div class="empty">{t('No daily reports in this period.')}</div>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Time entries')}</h2>
        <span>{timeSummary.length}</span>
      </div>
      {#each timeSummary as item}<article>
          <div>
            <strong>{display(item.date)} · {controlled('timeCategory', item.category)}</strong
            ><small>{display(item.worker)} · {controlled('status', item.approvalState)}</small>
          </div>
          <b>{hours(item.minutes)}</b>
        </article>{:else}<div class="empty">{t('No time entries in this period.')}</div>{/each}
    </section>
  </div>

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Technical / PLC records')}</h2>
        <span>{technicalReports.length + technicalChanges.length}</span>
      </div>
      {#each technicalReports as item}<a
          class="record-card-link"
          href={item.id ? reportLink(item.id) : `${base}/app/reports`}
          ><strong>{display(item.system)}</strong><small
            >{display(item.site)} · {display(item.changes)}</small
          ></a
        >{/each}
      {#each technicalChanges as item}<article>
          <div>
            <strong>{display(item.component)}</strong><small
              >{display(item.changeMade)} · {controlled('status', item.approvalState)}</small
            >
          </div>
        </article>{/each}
      {#if technicalReports.length === 0 && technicalChanges.length === 0}<div class="empty">
          {t('No technical records in this period.')}
        </div>{/if}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Expenses included')}</h2>
        <span>{expenses.length}</span>
      </div>
      {#each expenses as item}<article>
          <div>
            <strong>{display(item.date)} · {display(item.vendor)}</strong><small
              >{controlled('expenseCategory', item.category)} · {controlled(
                'billingStream',
                item.treatment,
              )}</small
            >
          </div>
          <b
            >{item.amount === null || item.amount === undefined
              ? '—'
              : money(item.amount, String(item.currency ?? summary.currency))}</b
          >
        </article>{:else}<div class="empty">{t('No expenses in this period.')}</div>{/each}
    </section>
  </div>

  {#if String(report.id)}
    <section class="detail-panel report-refresh-panel">
      <div class="panel-title">
        <div>
          <h2>{t('Recalculate snapshot')}</h2>
          <p class="form-help">
            {t(
              'This updates the report from the current database inputs and regenerates the PDF through the normal report action.',
            )}
          </p>
        </div>
      </div>
      <form method="POST" action="?/refresh" class="admin-form-grid">
        <input type="hidden" name="projectId" value={project.id} />
        <input type="hidden" name="periodStart" value={report.periodStart} />
        <input type="hidden" name="periodEnd" value={report.periodEnd} />
        <label
          >{t('Language')}<select name="reportLocale" value={locale}
            ><option value="en">{t('English')}</option><option value="es">{t('Español')}</option
            ><option value="pt">{t('Português')}</option></select
          ></label
        >
        <button>{t('Recalculate report')}</button>
      </form>
    </section>
  {/if}

  <div class="no-print report-localized-pdf-slot">
    <LocalizedPdfPanel
      ownerType="period_report_revision"
      ownerId={String(report.id)}
      {locale}
      title={t('PDF')}
    />
  </div>
</main>
