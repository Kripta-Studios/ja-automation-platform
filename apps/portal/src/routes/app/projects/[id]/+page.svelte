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
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';
  type Row = Record<string, string | number | boolean | null>;
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
  const overview = $derived(
    data.overview as {
      project: Row;
      workers: Row[];
      time: Row[];
      reports: Row[];
      expenses: Row[];
      planning: Row[];
      milestones: Row[];
      schedule: Row | null;
      actualMinutes: number;
      financial: {
        currency: string;
        approvedCostMinor: string;
        revenueCandidateMinor: string;
        contributionMarginMinor: string;
        invoicedMinor: string;
        paidMinor: string;
        receivableMinor: string;
        budgetMinor: string | null;
        plannedMinutes: number | null;
        estimateToCompleteMinor: string | null;
        estimateAtCompletionCostMinor: string | null;
        expectedFinalMarginMinor: string | null;
        hoursConsumedBps: string | null;
        travelBudgetConsumedBps: string | null;
        approvedUnbilledWipMinor: string;
        unapprovedWipMinor: string;
      } | null;
    },
  );
  const project = $derived(overview.project);
  const money = (minor: unknown) =>
    new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale, {
      style: 'currency',
      currency: String(project.currency),
    }).format(Number(minor ?? 0) / 100);
  const totalExpenses = $derived(
    overview.expenses
      .filter(
        (row) =>
          ['approved', 'locked'].includes(String(row.approval_state)) &&
          row.billing_treatment !== 'client_direct' &&
          row.who_paid !== 'client',
      )
      .reduce((sum, row) => sum + Number(row.project_currency_amount_minor ?? row.amount_minor), 0),
  );
  const allInExpenses = $derived(
    overview.expenses
      .filter(
        (row) =>
          ['approved', 'locked'].includes(String(row.approval_state)) &&
          row.client_treatment === 'all_in' &&
          row.billing_treatment !== 'client_direct' &&
          row.who_paid !== 'client',
      )
      .reduce((sum, row) => sum + Number(row.project_currency_amount_minor ?? row.amount_minor), 0),
  );
  const budget = $derived(
    Number(
      overview.financial?.budgetMinor ?? project.po_cap_minor ?? project.revenue_budget_minor ?? 0,
    ),
  );
  const plannedMinutes = $derived(
    overview.financial?.plannedMinutes ??
      overview.workers.reduce((sum, worker) => sum + Number(worker.planned_minutes ?? 0), 0),
  );
  const cost = $derived(Number(overview.financial?.approvedCostMinor ?? 0));
  const consumed = $derived(budget ? Math.min(100, (cost / budget) * 100) : 0);
  const margin = $derived(Number(overview.financial?.contributionMarginMinor ?? 0));
  const revenue = $derived(Number(overview.financial?.revenueCandidateMinor ?? 0));
  const financePeriodStart = '2026-08-01';
  const financePeriodEnd = '2026-08-31';
  const financeExportUrl = $derived(
    `${base}/app/api/projects/${encodeURIComponent(String(project.id))}/finance-export?periodStart=${financePeriodStart}&periodEnd=${financePeriodEnd}`,
  );
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

<svelte:head><title>{project.project_number} | J&A {t('Portal')}</title></svelte:head>
<main class="project-page">
  <header class="print-only-header" aria-hidden="true" style="display: none;">
    <div class="print-identity">
      <img src={`${base}/app/logo.png`} alt="J&A Automation" />
      <small>{t('INDUSTRIAL AUTOMATION · FIELD SERVICES')}</small>
    </div>
    <div class="print-meta">
      <span>{t('PROJECT REPORT')}</span>
      <strong>{new Date().toISOString().slice(0, 10)}</strong>
    </div>
  </header>
  <nav class="detail-nav no-print">
    <a href={`${base}/app/projects`}>← {t('Projects')}</a>
    <div style="display: flex; gap: 1rem;">
      <button type="button" class="no-print print-trigger" onclick={printReport}>
        <span aria-hidden="true">⎙</span>
        {t('Print report')}
      </button>
      <a href={`${base}/app/`}>{t('Operations dashboard')}</a>
    </div>
  </nav>
  {#if standaloneActionMessage(locale, form)}
    <p
      class:success={form.success}
      class="action-message no-print"
      role="status"
      aria-live="polite"
    >
      {standaloneActionMessage(locale, form)}
    </p>
  {/if}
  <header class="project-header">
    <div>
      <p class="portal-kicker">{project.client_number} / {project.project_number}</p>
      <h1>{project.name}</h1>
      <p>{project.client_name} · {project.site_name} · {project.country}</p>
    </div>
    <span class="project-state">{controlled('status', project.status)}</span>
  </header>

  {#if data.user?.role === 'owner_admin'}
    <section class="detail-panel project-administration no-print">
      <div class="panel-title">
        <div>
          <p class="portal-kicker">{t('OWNER WORKSPACE')}</p>
          <h2>{t('Project Administration')}</h2>
        </div>
        <span>{t('Owner access')}</span>
      </div>
      <details class="admin-details" open>
        <summary>{t('Edit all project settings')}</summary>
        <form method="POST" action="?/updateProject" class="admin-form-grid">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="version" value={project.version ?? 1} />
          <label>{t('Project number')}<input value={project.project_number} readonly /></label>
          <label>{t('Client')}<input value={project.client_name} readonly /></label>
          <label>{t('Currency')}<input value={project.currency} readonly /></label>
          <label
            >{t('Project manager')}
            <select name="projectManagerId">
              <option value="">{t('Unassigned')}</option>
              {#each data.workers ?? [] as worker}
                {#if worker.role === 'project_manager'}
                  <option
                    value={worker.id}
                    selected={String(worker.id) === String(project.project_manager_id)}
                    >{worker.name}</option
                  >
                {/if}
              {/each}
            </select>
          </label>
          <label>{t('Name')}<input name="name" value={project.name} required /></label>
          <label
            >{t('Project alias')}<input
              name="projectAlias"
              value={project.project_alias ?? ''}
            /></label
          >
          <label
            >{t('PO / reference')}<input name="poNumber" value={project.po_number ?? ''} /></label
          >
          <label
            >{t('Contract number')}<input
              name="contractNumber"
              value={project.contract_number ?? ''}
            /></label
          >
          <label
            >{t('Commercial model')}
            <select name="billingModel">
              {#each ['tm', 'tm_daily_minimum', 'all_in', 'capped_tm', 'milestone', 'hybrid', 'internal'] as model}
                <option value={model} selected={project.billing_model === model}
                  >{controlled('billingStream', model)}</option
                >
              {/each}
            </select>
          </label>
          <label>{t('Timezone')}<input name="timezone" value={project.timezone} required /></label>
          <label>{t('Site / plant')}<input name="siteName" value={project.site_name ?? ''} /></label
          >
          <label>{t('Country')}<input name="country" value={project.country ?? ''} /></label>
          <label
            >{t('Budget type')}<input
              name="budgetType"
              value={project.budget_type ?? 'none'}
            /></label
          >
          <label
            >{t('Start date')}<input
              name="startDate"
              type="date"
              value={project.start_date ?? ''}
            /></label
          >
          <label
            >{t('Planned end')}<input
              name="plannedEndDate"
              type="date"
              value={project.planned_end_date ?? ''}
            /></label
          >
          <label
            >{t('Expected minutes / day')}<input
              name="expectedMinutesPerDay"
              type="number"
              min="0"
              max="1440"
              value={project.expected_minutes_per_day ?? 600}
              required
            /></label
          >
          <label
            >{t('Client minimum minutes')}<input
              name="clientDailyMinimumMinutes"
              type="number"
              min="0"
              max="1440"
              value={project.client_daily_minimum_minutes ?? ''}
            /></label
          >
          <label
            >{t('Planned minutes')}<input
              name="plannedMinutes"
              type="number"
              min="0"
              value={project.planned_minutes ?? ''}
            /></label
          >
          <label
            >{t('Legacy budget · minor units')}<input
              name="budgetMinor"
              type="number"
              min="0"
              value={project.budget_minor ?? ''}
            /></label
          >
          <label
            >{t('Revenue budget · minor units')}<input
              name="revenueBudgetMinor"
              type="number"
              min="0"
              value={project.revenue_budget_minor ?? ''}
            /></label
          >
          <label
            >{t('PO cap · minor units')}<input
              name="poCapMinor"
              type="number"
              min="0"
              value={project.po_cap_minor ?? ''}
            /></label
          >
          <label
            >{t('Fixed price · minor units')}<input
              name="fixedPriceMinor"
              type="number"
              min="0"
              value={project.fixed_price_minor ?? ''}
            /></label
          >
          <label
            >{t('Labor budget minutes')}<input
              name="laborBudgetMinutes"
              type="number"
              min="0"
              value={project.labor_budget_minutes ?? ''}
            /></label
          >
          <label
            >{t('Travel budget · minor units')}<input
              name="travelBudgetMinor"
              type="number"
              min="0"
              value={project.travel_budget_minor ?? ''}
            /></label
          >
          <label
            >{t('Other cost budget · minor units')}<input
              name="otherCostBudgetMinor"
              type="number"
              min="0"
              value={project.other_cost_budget_minor ?? ''}
            /></label
          >
          <label class="check"
            ><input
              name="weeklyCloseEnabled"
              type="checkbox"
              checked={Number(project.weekly_close_enabled ?? 0) === 1}
            />
            {t('Weekly close enabled')}</label
          >
          <label class="check"
            ><input
              name="dailyReportRequired"
              type="checkbox"
              checked={Number(project.daily_report_required ?? 0) === 1}
            />
            {t('Daily report required')}</label
          >
          <label class="check"
            ><input
              name="technicalReportingRequired"
              type="checkbox"
              checked={Number(project.technical_reporting_required ?? 0) === 1}
            />
            {t('PLC report required')}</label
          >
          <label class="wide-field"
            >{t('Description')}<textarea name="description"
              >{String(project.description ?? '')}</textarea
            ></label
          >
          <label class="wide-field"
            >{t('Administration notes')}<textarea name="notes"
              >{String(project.notes ?? '')}</textarea
            ></label
          >
          <p class="form-help wide-field">
            {t(
              'Project number, client, currency, created history and version remain read-only to protect financial references. Monetary fields use exact database minor units (for USD, cents).',
            )}
          </p>
          <div class="form-actions">
            <button type="submit">{t('Save all project settings')}</button>
          </div>
        </form>
      </details>
      <p class="form-help admin-warning">
        {t(
          'Projects cannot be hard-deleted to preserve financial history and audit logs. Use Archived to remove a project from active operational views.',
        )}
      </p>
    </section>
  {/if}

  <section class="project-contract">
    <div><span>{t('PO / REFERENCE')}</span><strong>{project.po_number}</strong></div>
    <div>
      <span>{t('COMMERCIAL MODEL')}</span><strong
        >{controlled('billingStream', project.billing_model)}</strong
      >
    </div>
    <div>
      <span>{t('EXPECTED DAY')}</span><strong
        >{Number(project.expected_minutes_per_day) / 60} h</strong
      >
    </div>
    <div><span>{t('TIMEZONE')}</span><strong>{project.timezone}</strong></div>
    <div>
      <span>{t('START / TARGET')}</span><strong
        >{project.start_date ?? '—'} → {project.planned_end_date ?? '—'}</strong
      >
    </div>
    <div>
      <span>{t('ACTUAL END')}</span><strong
        >{project.actual_end_date ?? t('Open / not closed')}</strong
      >
    </div>
  </section>

  {#if overview.financial}<section class="project-finance">
      <div class="finance-heading">
        <div>
          <p class="portal-kicker">{t('PROJECT FINANCIAL POSITION')}</p>
          <h2>{money(cost)} {t('committed')}</h2>
        </div>
        {#if budget > 0}
          <div
            class="budget-ring"
            role="img"
            aria-label={`${consumed.toFixed(0)}% ${t('budget used')}`}
          >
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle class="budget-ring-track" cx="18" cy="18" r="15.5" pathLength="100" />
              <circle
                class="budget-ring-value"
                cx="18"
                cy="18"
                r="15.5"
                pathLength="100"
                stroke-dasharray="100"
                stroke-dashoffset={100 - consumed}
              />
            </svg>
            <span>{consumed.toFixed(0)}%<small>{t('budget used')}</small></span>
          </div>
        {/if}
      </div>
      <div class="project-kpis">
        <article><span>{t('PO / PROJECT BUDGET')}</span><strong>{money(budget)}</strong></article>
        <article>
          <span>{t('PLANNED HOURS')}</span><strong
            >{plannedMinutes ? (plannedMinutes / 60).toFixed(0) : '—'} h</strong
          >
        </article>
        <article>
          <span>{t('ACTUAL HOURS')}</span><strong
            >{(overview.actualMinutes / 60).toFixed(1)} h</strong
          >
        </article>
        <article>
          <span>{t('DIRECT LABOR COST')}</span><strong>{money(cost - totalExpenses)}</strong>
        </article>
        <article>
          <span>{t('TRAVEL / EXPENSE')}</span><strong>{money(totalExpenses)}</strong><small
            >{money(allInExpenses)} {t('stays all-in')}</small
          >
        </article>
        <article><span>{t('BILLABLE VALUE')}</span><strong>{money(revenue)}</strong></article>
        <article class="accent">
          <span>{t('CONTRIBUTION MARGIN')}</span><strong>{money(margin)}</strong><small
            >{revenue ? ((margin / revenue) * 100).toFixed(1) : '0.0'}%</small
          >
        </article>
        <article>
          <span>{t('INVOICED')}</span><strong>{money(overview.financial.invoicedMinor)}</strong>
        </article>
        <article>
          <span>{t('APPROVED UNBILLED WIP')}</span><strong
            >{money(overview.financial.approvedUnbilledWipMinor)}</strong
          >
        </article>
        <article>
          <span>{t('UNAPPROVED WIP')}</span><strong
            >{money(overview.financial.unapprovedWipMinor)}</strong
          >
        </article>
        <article>
          <span>{t('FORECAST ETC')}</span><strong
            >{overview.financial.estimateToCompleteMinor === null
              ? '—'
              : money(overview.financial.estimateToCompleteMinor)}</strong
          >
        </article>
        <article class="accent">
          <span>{t('EXPECTED FINAL MARGIN')}</span><strong
            >{overview.financial.expectedFinalMarginMinor === null
              ? '—'
              : money(overview.financial.expectedFinalMarginMinor)}</strong
          >
        </article>
      </div>
    </section>{/if}

  {#if overview.financial}
    <section class="detail-panel finance-output-panel no-print">
      <div class="panel-title">
        <div>
          <p class="portal-kicker">{t('TRACEABLE FINANCE OUTPUTS')}</p>
          <h2>{t('Invoice, bill and project economics')}</h2>
          <p class="form-help">
            {t(
              'The Excel export is generated from the current exact database snapshot and includes project margin, employee cost/revenue detail and expense treatment for',
            )}
            {financePeriodStart} → {financePeriodEnd}.
          </p>
        </div>
        <span>{t('Owner / finance')}</span>
      </div>
      <div class="form-actions">
        {#if data.user?.role === 'owner_admin' || data.user?.role === 'finance_admin'}
          <a class="primary-button" href={financeExportUrl} download>
            <span aria-hidden="true">↓</span>
            {t('Download project finance XLSX')}
          </a>
          <a class="secondary-button" href={`${base}/app/accounting`}>{t('Open Accounting Pack')}</a
          >
        {/if}
      </div>
      {#if data.user?.role === 'owner_admin' || data.user?.role === 'finance_admin'}
        <details class="admin-details">
          <summary>{t('Create invoice draft for this project')}</summary>
          {#if (data.billingRules ?? []).length > 0}
            <form method="POST" action="?/createInvoiceDraft" class="admin-form-grid">
              <p class="form-help wide-field">
                {t(
                  'This creates a reviewable draft only. Approval, issue, sending and payment remain explicit finance actions and never happen from Print report.',
                )}
              </p>
              <label
                >{t('Billing stream')}<select name="billingRuleId" required>
                  {#each data.billingRules ?? [] as rule}
                    <option value={rule.id}
                      >{controlled('billingStream', rule.stream_type)} · {controlled(
                        'billingStream',
                        rule.cadence_type,
                      )} · {rule.currency}</option
                    >
                  {/each}
                </select></label
              >
              <label
                >{t('Period start')}<input
                  name="periodStart"
                  type="date"
                  value={financePeriodStart}
                  required
                /></label
              >
              <label
                >{t('Period end')}<input
                  name="periodEnd"
                  type="date"
                  value={financePeriodEnd}
                  required
                /></label
              >
              <div class="form-actions wide-field">
                <button type="submit">{t('Create invoice draft')}</button>
              </div>
            </form>
          {:else}
            <p class="empty">
              {t(
                'No billing stream is configured for this project. Configure one in Billing before creating an invoice draft.',
              )}
            </p>
          {/if}
        </details>
      {/if}
    </section>
  {/if}

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Assigned workforce')}</h2>
        <span>{overview.workers.length}</span>
      </div>
      {#each overview.workers as worker}<a
          href={`${base}/app/projects?view=team`}
          class="detail-panel-article"
        >
          <div class="worker-mark">
            {String(worker.name)
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </div>
          <div>
            <strong>{worker.name}</strong><small
              >{controlled('role', worker.assignment_role ?? worker.role)} · {worker.starts_on} → {worker.ends_on ??
                t('open assignment')}</small
            >
          </div>
          <b>{Number(worker.planned_minutes ?? 0) / 60} {t('h plan')}</b>
        </a>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Time by category')}</h2>
        <span>{(overview.actualMinutes / 60).toFixed(1)} h</span>
      </div>
      {#each overview.time as category}<a
          href={`${base}/app/time?project=${encodeURIComponent(String(project.id))}&category=${encodeURIComponent(String(category.category))}`}
          class="detail-panel-article"
        >
          <div>
            <strong>{controlled('timeCategory', category.category)}</strong><small
              >{t('Recorded actual time')}</small
            >
          </div>
          <b>{(Number(category.minutes) / 60).toFixed(1)} h</b>
        </a>{/each}
    </section>
  </div>
  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Field & PLC reports')}</h2>
        <span>{overview.reports.length}</span>
      </div>
      {#each overview.reports as report}<a
          class="record-card-link project-record-link"
          href={`${base}/app/reports/${String(report.id)}`}
        >
          <span class:plc={report.type === 'PLC'} class="activity-code"
            >{controlled('recordType', report.type === 'PLC' ? 'PLC' : 'Daily')}</span
          >
          <div>
            <strong>{report.title}</strong><small
              >{report.date} · {controlled('status', report.approval_state)}</small
            >
          </div>
          {#if report.safety_related}<b class="safety-flag">{t('SAFETY')}</b>{/if}
        </a>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>{t('Expense treatment')}</h2>
        <span>{money(totalExpenses)}</span>
      </div>
      {#each overview.expenses as expense}<a
          class="record-card-link project-record-link"
          href={`${base}/app/expenses/${String(expense.id)}`}
        >
          <span class:all-in={expense.client_treatment === 'all_in'} class="activity-code"
            >{expense.client_treatment === 'all_in' ? t('ALL-IN') : t('REIMB.')}</span
          >
          <div>
            <strong>{expense.vendor}</strong><small
              >{controlled('expenseCategory', expense.category)} · {expense.spent_on} · {controlled(
                'billingStream',
                expense.billing_treatment ?? expense.client_treatment,
              )} · {expense.who_paid ? controlled('role', expense.who_paid) : t('worker')}</small
            >
          </div>
          <b>{money(expense.project_currency_amount_minor ?? expense.amount_minor)}</b>
        </a>{/each}
    </section>
  </div>
  <section class="detail-panel schedule-panel">
    <div class="panel-title">
      <h2>{t('Published schedule')}</h2>
      <span
        >{overview.schedule
          ? `${Number(overview.schedule.monday_minutes) / 60} h Mon`
          : t('Not configured')}</span
      >
    </div>
    {#if overview.schedule}<p class="form-help">
        {t('Expected minutes')}: Mon {overview.schedule.monday_minutes} · Tue {overview.schedule
          .tuesday_minutes} · Wed {overview.schedule.wednesday_minutes} · Thu {overview.schedule
          .thursday_minutes} · Fri {overview.schedule.friday_minutes} · Sat {overview.schedule
          .saturday_minutes} · Sun {overview.schedule.sunday_minutes}. {t(
          'This is planning context; actual time remains independently recorded.',
        )}
      </p>{/if}
    {#each overview.planning as plan}<a
        href={`${base}/app/projects?view=team`}
        class="detail-panel-article"
      >
        <div>
          <strong>{plan.worker_name}</strong><small>{plan.site} · {plan.required_skill}</small>
        </div>
        <b
          >{String(plan.starts_at).replace('T', ' ').slice(0, 16)} → {String(plan.ends_at).slice(
            11,
            16,
          )}</b
        >
      </a>{/each}
  </section>
  <section class="detail-panel">
    <div class="panel-title">
      <h2>{t('Commercial milestones')}</h2>
      <span>{overview.milestones.length}</span>
    </div>
    {#each overview.milestones as milestone}<a
        href={`${base}/app/approvals`}
        class="detail-panel-article"
      >
        <div>
          <strong>{milestone.name}</strong><small
            >{milestone.due_on ?? t('No due date')} · {controlled(
              'status',
              milestone.approval_state,
            )}</small
          >
        </div>
        <b>{money(milestone.amount_minor)}</b>
      </a>{:else}<div class="empty">{t('No milestones configured.')}</div>{/each}
  </section>
</main>
