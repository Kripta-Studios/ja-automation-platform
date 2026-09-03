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
  import { money as formatMoney } from '$lib/portal/portal-format';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  import { TableRegion } from '$lib/portal/ui';
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
  const userRole = $derived(String(data.user?.role ?? 'worker'));
  const audience = $derived(String(report.audience ?? '').toLowerCase());
  const internal = $derived(audience === 'internal');
  const customerAudience = $derived(audience === 'customer');
  const customerConformity = $derived((report.conformity ?? null) as Row | null);
  const canManageCustomerSignoff = $derived(
    userRole === 'owner_admin' || userRole === 'finance_admin',
  );
  const canApproveCustomerReport = $derived(
    customerAudience &&
      String(report.state) === 'review' &&
      ['owner_admin', 'finance_admin', 'project_manager'].includes(userRole) &&
      Number.isInteger(Number(report.snapshotVersion)) &&
      Number(report.snapshotVersion) > 0 &&
      /^[a-f0-9]{64}$/u.test(String(report.snapshotSha256 ?? '')),
  );
  const reportReadyForSignoff = $derived(
    ['approved', 'final'].includes(String(report.state)) && Boolean(report.pdfReady),
  );
  const hasActiveCustomerConformity = $derived(customerConformity?.status === 'active');
  const signoffState = $derived(
    customerConformity?.status === 'active'
      ? 'signed'
      : customerConformity?.status === 'invalidated'
        ? 'invalid'
        : reportReadyForSignoff
          ? 'ready_for_signature'
          : 'needs_report',
  );
  const canCaptureCustomerSignoff = $derived(
    !internal && canManageCustomerSignoff && reportReadyForSignoff && !hasActiveCustomerConformity,
  );
  const approvedMinutes = $derived(
    timeSummary.reduce(
      (total, item) =>
        total +
        (['approved', 'locked'].includes(String(item.approvalState))
          ? Number(item.minutes ?? 0)
          : 0),
      0,
    ),
  );
  const display = (value: unknown, fallback = '—') =>
    value === null || value === undefined || value === '' ? fallback : String(value);
  const hours = (minutes: unknown) => `${(Number(minutes ?? 0) / 60).toFixed(1)} h`;
  const signoffLabel = (state: string): string => {
    switch (state) {
      case 'ready_for_signature':
        return t('Ready for signature');
      case 'signed':
        return t('Signed');
      case 'invalid':
        return t('Invalid / superseded');
      default:
        return t('Needs report');
    }
  };
  const timestamp = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    const date = new Date(String(value));
    if (Number.isNaN(date.valueOf())) return String(value);
    return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };
  const money = (
    minor: unknown,
    currency = String(summary.currency ?? project.currency ?? 'USD'),
  ) => formatMoney(minor, currency, locale === 'pt' ? 'pt-BR' : locale);
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
      <span class="project-state" data-report-lifecycle-state={String(report.state ?? '')}
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

  {#if customerAudience}
    <section class="detail-panel customer-signoff" data-customer-signoff>
      <header class="customer-signoff__header">
        <div>
          <p class="portal-kicker">{t('Reports')} / {t('Client Sign-off')}</p>
          <h2>{t('Customer sign-off')}</h2>
          <p class="customer-signoff__lede">
            {t(
              'This confirmation covers approved hours and field activity for this report version. It contains no financial information.',
            )}
          </p>
        </div>
        <span
          class="customer-signoff__status"
          data-signoff-state={signoffState}
          role="status"
          aria-live="polite">{signoffLabel(signoffState)}</span
        >
      </header>

      <div class="customer-signoff__body">
        {#if canApproveCustomerReport}
          <form
            method="POST"
            action="?/approve"
            class="customer-signoff__form customer-signoff__approval-form"
            data-period-report-approval
            aria-describedby="customer-report-approval-help"
          >
            <div>
              <h3>{t('Approve customer report')}</h3>
              <p id="customer-report-approval-help" class="form-help">
                {t(
                  'Approve the operational hours and activity in this immutable report snapshot. Customer conformity remains a separate step.',
                )}
              </p>
            </div>
            <input type="hidden" name="expectedSnapshotVersion" value={report.snapshotVersion} />
            <input type="hidden" name="expectedSnapshotSha256" value={report.snapshotSha256} />
            <button type="submit">{t('Approve customer report')}</button>
          </form>
        {/if}

        {#if signoffState === 'needs_report'}
          <div class="customer-signoff__notice" data-signoff-notice="needs-report">
            <strong>{t('Needs report')}</strong>
            <p>
              {t(
                'A finalized customer-safe report and a ready PDF are required before customer sign-off can be captured.',
              )}
            </p>
          </div>
        {:else if signoffState === 'ready_for_signature'}
          <div class="customer-signoff__notice" data-signoff-notice="ready">
            <strong>{t('Ready for signature')}</strong>
            <p>{t('The approved report version is ready for customer conformity.')}</p>
          </div>
        {:else if signoffState === 'invalid'}
          <div class="customer-signoff__notice" data-signoff-notice="invalid">
            <strong>{t('Invalid / superseded')}</strong>
            <p>
              {t(
                'The previous conformity was retained for audit and is no longer the active sign-off for this report version.',
              )}
            </p>
          </div>
        {:else if customerConformity}
          <div class="customer-signoff__notice" data-signoff-notice="signed">
            <strong>{t('Signed')}</strong>
            <p>{t('Customer conformity is bound to this immutable report version.')}</p>
          </div>
        {/if}

        {#if customerConformity?.status === 'active'}
          <dl class="customer-signoff__facts">
            <div>
              <dt>{t('Signer')}</dt>
              <dd>{display(customerConformity.signerName)}</dd>
            </div>
            <div>
              <dt>{t('Signer identity')}</dt>
              <dd>{display(customerConformity.signerIdentity)}</dd>
            </div>
            <div>
              <dt>{t('Signed at')}</dt>
              <dd>{timestamp(customerConformity.signedAt)}</dd>
            </div>
            <div>
              <dt>{t('Report version')}</dt>
              <dd>
                {customerConformity.snapshotVersion
                  ? `v${display(customerConformity.snapshotVersion)}`
                  : t('Immutable version binding')}
              </dd>
            </div>
          </dl>
          <p class="customer-signoff__immutable">
            <span aria-hidden="true">✓</span>
            {t('Signed record is immutable. Any correction requires a new report version.')}
          </p>
        {/if}

        {#if report.pdfReady}
          <div class="customer-signoff__preview">
            <a
              class="customer-signoff__pdf"
              href={`${base}/app/api/reports/${String(report.id)}/pdf`}
              target="_blank"
              rel="noreferrer">{t('Preview customer-safe PDF')}</a
            >
            <span>{t('Only approved hours and activities are included.')}</span>
          </div>
        {/if}

        {#if canCaptureCustomerSignoff}
          <form method="POST" action="?/sign" class="customer-signoff__form" data-signoff-form>
            <div>
              <h3>{t('Capture conformity')}</h3>
              <p class="form-help">
                {t(
                  'Enter the customer signer details. The signed-at time is captured by the server.',
                )}
              </p>
            </div>
            <label>
              {t('Signer name')}
              <input
                name="signerName"
                type="text"
                required
                maxlength="200"
                autocomplete="name"
                aria-describedby="customer-signoff-signer-help"
              />
            </label>
            <p id="customer-signoff-signer-help" class="form-help">
              {t('Required. Use the name provided by the customer signer.')}
            </p>
            <label>
              {t('Signer identity')} <span class="optional-label">({t('optional')})</span>
              <input name="signerIdentity" type="text" maxlength="320" autocomplete="email" />
            </label>
            <button type="submit">{t('Record customer sign-off')}</button>
          </form>
        {/if}

        {#if customerConformity?.status === 'active' && canManageCustomerSignoff}
          <details class="customer-signoff__invalidate no-print" data-signoff-invalidation>
            <summary>{t('Invalidate sign-off')}</summary>
            <div>
              <p class="form-help">
                {t(
                  'Use this only when the customer confirmation no longer matches the report. The signed record remains available in the audit history.',
                )}
              </p>
              <form method="POST" action="?/invalidateSignoff" class="customer-signoff__form">
                <input type="hidden" name="conformityId" value={customerConformity.id} />
                <label>
                  {t('Reason for invalidation')}
                  <textarea name="reason" required maxlength="2000" rows="3"></textarea>
                </label>
                <button type="submit" class="customer-signoff__danger-action">
                  {t('Confirm invalidation')}
                </button>
              </form>
            </div>
          </details>
        {/if}
      </div>
    </section>
  {/if}

  {#if internal}
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
      <TableRegion
        class="table-wrap report-period-table"
        mobileMode="scroll"
        label={t('How this report was calculated')}
      >
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
      </TableRegion>
      <p class="form-help">
        {t('Operational value')}: {money(summary.operationalRevenueCandidateMinor)} · {t('Paid')}: {money(
          summary.paidMinor,
        )} · {t('Receivable')}: {money(summary.receivableMinor)}
      </p>
    </section>
  {:else}
    <section class="record-detail-grid report-operational-summary">
      <article class="record-fact">
        <span>{t('Approved hours')}</span><strong>{hours(approvedMinutes)}</strong>
      </article>
    </section>
  {/if}

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
      <TableRegion
        class="table-wrap report-period-table"
        mobileMode="scroll"
        label={t('Internal financial detail')}
      >
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
      </TableRegion>
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
            ><small
              >{display(item.worker)} · {display(item.activitySummary)} · {controlled(
                'status',
                item.approvalState,
              )}</small
            >
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
    {#if internal}
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
    {/if}
  </div>

  {#if internal && String(report.id)}
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

  {#if customerAudience}
    <section class="detail-panel customer-signoff-preview-panel">
      <div class="signature-block">
        <div class="signature-field">
          <span>{t('Client Representative Signature')}</span>
          <div class="signature-line">____________________________________</div>
          <small>{t('Name & Title')}</small>
        </div>
        <div class="signature-field">
          <span>{t('Date')}</span>
          <div class="signature-line">__________________</div>
        </div>
      </div>
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

<style>
  .customer-signoff {
    margin-top: 1rem;
    border: 1px solid #cbdde2;
    border-top: 0.3rem solid #277e78;
    box-shadow: 0 0.55rem 1.4rem rgb(19 49 70 / 0.05);
  }

  .customer-signoff__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e2ebee;
  }

  .customer-signoff__header h2 {
    margin: 0.25rem 0 0.4rem;
    color: #173146;
  }

  .customer-signoff__lede,
  .customer-signoff__notice p,
  .customer-signoff__immutable,
  .customer-signoff__preview span {
    margin: 0;
    color: #536b7b;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .customer-signoff__lede {
    max-width: 68ch;
  }

  .customer-signoff__status {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    flex: 0 0 auto;
    padding: 0.55rem 0.8rem;
    border: 1px solid #d6a340;
    border-radius: 999px;
    color: #704c0b;
    background: #fff8e6;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .customer-signoff__status[data-signoff-state='ready_for_signature'] {
    border-color: #9bc6da;
    color: #15536a;
    background: #eef8fc;
  }

  .customer-signoff__status[data-signoff-state='signed'] {
    border-color: #80c6ac;
    color: #155b49;
    background: #eefaf5;
  }

  .customer-signoff__status[data-signoff-state='invalid'] {
    border-color: #d99595;
    color: #8a3030;
    background: #fff2f1;
  }

  .customer-signoff__body {
    display: grid;
    gap: 1rem;
    padding-top: 1rem;
  }

  .customer-signoff__notice {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
    border-left: 0.3rem solid #d69a26;
    border-radius: 0 0.55rem 0.55rem 0;
    background: #fffaf0;
  }

  .customer-signoff__notice strong {
    color: #60470d;
    font-size: 0.8rem;
  }

  .customer-signoff__notice[data-signoff-notice='ready'] {
    border-left-color: #277e78;
    background: #f1fbfa;
  }

  .customer-signoff__notice[data-signoff-notice='ready'] strong {
    color: #17665e;
  }

  .customer-signoff__notice[data-signoff-notice='signed'] {
    border-left-color: #1ba37a;
    background: #f1fbf6;
  }

  .customer-signoff__notice[data-signoff-notice='signed'] strong {
    color: #155b49;
  }

  .customer-signoff__notice[data-signoff-notice='invalid'] {
    border-left-color: #b94b45;
    background: #fff7f6;
  }

  .customer-signoff__notice[data-signoff-notice='invalid'] strong {
    color: #8a3030;
  }

  .customer-signoff__facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.8rem 1.25rem;
    margin: 0;
    padding: 0.25rem 0 0;
  }

  .customer-signoff__facts div {
    min-width: 0;
  }

  .customer-signoff__facts dt {
    color: #748596;
    font:
      700 0.62rem Consolas,
      monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .customer-signoff__facts dd {
    margin: 0.3rem 0 0;
    overflow-wrap: anywhere;
    color: #1d3a4d;
    font-size: 0.8rem;
  }

  .customer-signoff__immutable {
    display: flex;
    gap: 0.45rem;
    align-items: flex-start;
    color: #155b49;
  }

  .customer-signoff__preview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 0.95rem;
    border-top: 1px solid #e2ebee;
  }

  .customer-signoff__pdf,
  .customer-signoff__form button,
  .customer-signoff__invalidate summary {
    min-height: 2.75rem;
  }

  .customer-signoff__pdf {
    display: inline-flex;
    align-items: center;
    padding: 0.65rem 0.85rem;
    border: 1px solid #277e78;
    border-radius: 0.5rem;
    color: #17665e;
    background: #f1fbfa;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
  }

  .customer-signoff__pdf:hover,
  .customer-signoff__pdf:focus-visible {
    color: #0e4d47;
    border-color: #17665e;
    background: #e4f5f2;
  }

  .customer-signoff__pdf:focus-visible,
  .customer-signoff__form button:focus-visible,
  .customer-signoff__invalidate summary:focus-visible {
    outline: 3px solid #0d6070;
    outline-offset: 2px;
  }

  .customer-signoff__form {
    display: grid;
    gap: 0.9rem;
    max-width: 42rem;
    padding: 1rem;
    border: 1px solid #dbe7eb;
    border-radius: 0.7rem;
    background: #f8fbfc;
  }

  .customer-signoff__form h3 {
    margin: 0 0 0.25rem;
    color: #173146;
    font-size: 1rem;
  }

  .customer-signoff__form label {
    display: grid;
    gap: 0.4rem;
    color: #485d6e;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.055em;
  }

  .customer-signoff__form input,
  .customer-signoff__form textarea {
    width: 100%;
    min-height: 2.75rem;
    box-sizing: border-box;
    padding: 0.65rem 0.7rem;
    border: 1px solid #d7e1e9;
    border-radius: 0.52rem;
    color: #213c50;
    background: #fff;
    font: inherit;
    font-size: 0.82rem;
  }

  .customer-signoff__form textarea {
    min-height: 5.5rem;
    resize: vertical;
  }

  .customer-signoff__form input:focus,
  .customer-signoff__form textarea:focus {
    border-color: #4ea89f;
    outline: none;
    box-shadow: 0 0 0 3px rgb(78 168 159 / 0.12);
  }

  .customer-signoff__form input:focus-visible,
  .customer-signoff__form textarea:focus-visible {
    outline: 3px solid #0d6070;
    outline-offset: 2px;
  }

  .customer-signoff__form button {
    width: max-content;
    padding: 0.65rem 0.9rem;
    border: 1px solid #17665e;
    border-radius: 0.5rem;
    color: #fff;
    background: #277e78;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
  }

  .customer-signoff__form button:hover,
  .customer-signoff__form button:focus-visible {
    background: #17665e;
  }

  .optional-label {
    color: #748596;
    font-weight: 600;
    letter-spacing: normal;
  }

  .customer-signoff__invalidate {
    border-top: 1px solid #e2ebee;
    padding-top: 0.9rem;
  }

  .customer-signoff__invalidate summary {
    display: inline-flex;
    align-items: center;
    padding: 0.65rem 0.85rem;
    border: 1px solid #d99595;
    border-radius: 0.5rem;
    color: #8a3030;
    background: #fff7f6;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
  }

  .customer-signoff__invalidate[open] summary {
    margin-bottom: 0.9rem;
  }

  .customer-signoff__danger-action {
    border-color: #a53b36 !important;
    background: #b94b45 !important;
  }

  .customer-signoff__danger-action:hover,
  .customer-signoff__danger-action:focus-visible {
    background: #963b36 !important;
  }

  @media (max-width: 760px) {
    .customer-signoff__header,
    .customer-signoff__preview {
      align-items: stretch;
      flex-direction: column;
    }

    .customer-signoff__status {
      align-self: flex-start;
    }

    .customer-signoff__facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .customer-signoff__form button,
    .customer-signoff__pdf {
      width: 100%;
      justify-content: center;
    }
  }

  .customer-signoff-preview-panel {
    margin-top: 1.5rem;
    padding: 1.75rem 2rem;
    background: #ffffff;
    border: 1px solid #cbdde2;
    border-radius: 0.5rem;
  }

  .signature-block {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 3rem;
    flex-wrap: wrap;
  }

  .signature-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .signature-field > span {
    font-weight: 700;
    font-size: 0.9rem;
    color: #173146;
  }

  .signature-line {
    font-family: monospace;
    font-size: 1rem;
    color: #536b7b;
    letter-spacing: 0.05em;
  }

  .signature-field > small {
    font-size: 0.78rem;
    color: #64748b;
  }

  @media (prefers-reduced-motion: reduce) {
    .customer-signoff,
    .customer-signoff * {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
</style>
