<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { ResponsiveSheet } from '$lib/portal/ui';
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

  type Primitive = string | number | boolean | null | undefined;
  type Row = Record<string, Primitive>;
  type TabId = 'overview' | 'team' | 'reports' | 'commercial' | 'billing';
  type FinancialProjection = {
    currency?: string;
    approvedCostMinor?: string | null;
    revenueCandidateMinor?: string | null;
    contributionMarginMinor?: string | null;
    contributionMarginBps?: string | null;
    invoicedMinor?: string | null;
    paidMinor?: string | null;
    receivableMinor?: string | null;
    approvedUnbilledWipMinor?: string | null;
    unapprovedWipMinor?: string | null;
    plannedMinutes?: number | null;
  };
  type ProjectOverview = {
    project: Row;
    workers: Row[];
    time: Row[];
    reports: Row[];
    expenses: Row[];
    planning: Row[];
    milestones: Row[];
    schedule: Row | null;
    actualMinutes: number;
    financial: FinancialProjection | null;
  };
  type BillingRule = Row & {
    id?: Primitive;
    stream_type?: Primitive;
    cadence_type?: Primitive;
    currency?: Primitive;
    status?: Primitive;
  };

  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  let activeTab = $state<TabId>('overview');
  let editOpen = $state(false);
  let invoiceOpen = $state(false);
  let saving = $state(false);
  let tabButtons: Partial<Record<TabId, HTMLButtonElement>> = {};

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
  const overview = $derived(data.overview as ProjectOverview);
  const project = $derived(overview.project);
  const role = $derived(String(data.user?.role ?? ''));
  const isOwner = $derived(role === 'owner_admin');
  const isFinance = $derived(role === 'finance_admin');
  const isAuditor = $derived(role === 'auditor_read_only');
  const canViewCommercial = $derived(isOwner || isFinance || isAuditor);
  const canWriteFinance = $derived(isOwner || isFinance);
  const billingRules = $derived((data.billingRules ?? []) as BillingRule[]);
  const finance = $derived(overview.financial);
  const financePeriodStart = $derived(String(data.periodStart ?? ''));
  const financePeriodEnd = $derived(String(data.periodEnd ?? ''));

  const tabs = $derived([
    { id: 'overview' as const, label: t('Overview') },
    { id: 'team' as const, label: t('Team') },
    { id: 'reports' as const, label: t('Reports & Files') },
    ...(canViewCommercial ? [{ id: 'commercial' as const, label: t('Commercial') }] : []),
    ...(canViewCommercial ? [{ id: 'billing' as const, label: t('Billing') }] : []),
  ] satisfies Array<{ id: TabId; label: string }>);
  const financeExportUrl = $derived(
    base +
      '/app/api/projects/' +
      encodeURIComponent(String(project.id)) +
      '/finance-export?periodStart=' +
      financePeriodStart +
      '&periodEnd=' +
      financePeriodEnd,
  );

  function display(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    return String(value);
  }

  function percentageFromBps(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    let bps: bigint;
    try {
      bps = BigInt(raw);
    } catch {
      return '—';
    }
    const negative = bps < 0n;
    const absolute = negative ? -bps : bps;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole.toString()}.${fraction}%`;
  }

  function money(minor: unknown, currency = String(project.currency ?? 'USD')): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    let value: bigint;
    try {
      value = BigInt(raw);
    } catch {
      return '—';
    }
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const major = absolute / 100n;
    const cents = (absolute % 100n).toString().padStart(2, '0');
    const numberLocale = locale === 'pt' ? 'pt-BR' : locale;
    const numberFormat = new Intl.NumberFormat(numberLocale, { useGrouping: true });
    const group =
      numberFormat.formatToParts(1234567).find((part) => part.type === 'group')?.value ?? ',';
    const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
    const decimal = locale === 'en' ? '.' : ',';
    return (negative ? '-' : '') + currency + ' ' + groupedMajor + decimal + cents;
  }

  function hours(minutes: unknown): string {
    const value = Number(minutes);
    return Number.isFinite(value) ? (value / 60).toFixed(1) + ' h' : '—';
  }

  function expenseAmount(row: Row): string {
    return money(row.amount_minor, String(row.currency ?? project.currency ?? 'USD'));
  }

  function status(value: unknown): string {
    return controlled('status', value) || display(value, t('Not configured'));
  }

  function reportType(value: unknown): string {
    return String(value).toUpperCase() === 'PLC' ? t('Technical / PLC') : t('Daily');
  }

  function submitForm(): void {
    saving = true;
  }

  async function handleTabKeydown(event: KeyboardEvent, current: TabId): Promise<void> {
    const index = tabs.findIndex((tab) => tab.id === current);
    if (index < 0) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    activeTab = next.id;
    await tick();
    tabButtons[next.id]?.focus();
  }

  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }

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

<svelte:head>
  <title>{display(project.project_number)} · {display(project.name)} | J&A Automation</title>
</svelte:head>

<main class="project-detail-page" data-project-detail data-role={role}>
  <nav class="project-breadcrumb no-print" aria-label={t('Project navigation')}>
    <a href={base + '/app/projects'}>← {t('Projects')}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{display(project.project_number)}</span>
    <div class="project-breadcrumb-actions">
      <button type="button" class="quiet-button" onclick={printReport}>
        <span aria-hidden="true">⎙</span>
        {t('Print report')}
      </button>
      <a href={base + '/app/'}>{t('Operations dashboard')}</a>
    </div>
  </nav>

  {#if standaloneActionMessage(locale, form)}
    <p
      class:success={form?.success}
      class="project-action-message"
      role="status"
      aria-live="polite"
    >
      {standaloneActionMessage(locale, form)}
    </p>
  {/if}

  <header class="project-context">
    <div>
      <p class="portal-kicker">
        {display(project.client_number)} · {display(project.project_number)}
      </p>
      <h1>{display(project.name, t('Project'))}</h1>
      <p class="project-context-meta">
        {display(project.client_name)} · {display(project.site_name)} · {display(project.country)}
      </p>
    </div>
    <div class="project-context-actions">
      <span class="state-badge" data-state={String(project.status ?? 'unknown')}
        >{status(project.status)}</span
      >
      {#if isOwner}
        <button
          type="button"
          class="primary-button"
          data-project-edit-cta
          onclick={() => (editOpen = true)}
        >
          {t('Edit project')}
        </button>
      {/if}
    </div>
  </header>

  <section class="attention-grid" aria-label={t('Project status summary')}>
    <article class="attention-card">
      <span>{t('Actual time')}</span><strong>{hours(overview.actualMinutes)}</strong><small
        >{t('Recorded operational time')}</small
      >
    </article>
    <article class="attention-card">
      <span>{t('Assigned team')}</span><strong>{overview.workers.length}</strong><small
        >{t('Current project assignment(s)')}</small
      >
    </article>
    <article class="attention-card">
      <span>{t('Reports')}</span><strong>{overview.reports.length}</strong><small
        >{t('Daily and technical records')}</small
      >
    </article>
    {#if canViewCommercial && finance}
      <article class="attention-card finance-summary">
        <span>{t('Contribution')}</span><strong
          >{money(
            finance.contributionMarginMinor,
            String(finance.currency ?? project.currency),
          )}</strong
        ><small>{t('Canonical project finance projection')}</small>
      </article>
    {/if}
  </section>

  <div class="project-tabs no-print" role="tablist" aria-label={t('Project detail sections')}>
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        id={'project-tab-' + tab.id}
        aria-controls={'project-panel-' + tab.id}
        aria-selected={activeTab === tab.id}
        tabindex={activeTab === tab.id ? 0 : -1}
        bind:this={tabButtons[tab.id]}
        class:active={activeTab === tab.id}
        onkeydown={(event) => handleTabKeydown(event, tab.id)}
        onclick={() => (activeTab = tab.id)}>{tab.label}</button
      >
    {/each}
  </div>

  <div class="project-tab-panels">
    {#if activeTab === 'overview'}
      <div
        id="project-panel-overview"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-overview"
        tabindex="0"
      >
        <div class="project-panel-grid">
          <section class="project-surface" aria-labelledby="project-overview-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('PROJECT CONTEXT')}</p>
                <h2 id="project-overview-title">{t('Overview')}</h2>
              </div>
              <span class="surface-count">{status(project.status)}</span>
            </div>
            <dl class="project-facts">
              <div>
                <dt>{t('Client')}</dt>
                <dd>{display(project.client_name)}</dd>
              </div>
              <div>
                <dt>{t('Client number')}</dt>
                <dd>{display(project.client_number)}</dd>
              </div>
              <div>
                <dt>{t('Project number')}</dt>
                <dd>{display(project.project_number)}</dd>
              </div>
              <div>
                <dt>{t('Cost center')}</dt>
                <dd>{display(project.cost_center_code, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('PO / reference')}</dt>
                <dd>{display(project.po_number, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Site / plant')}</dt>
                <dd>{display(project.site_name, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Timezone')}</dt>
                <dd>{display(project.timezone)}</dd>
              </div>
              <div>
                <dt>{t('Schedule')}</dt>
                <dd>{display(project.start_date)} → {display(project.planned_end_date)}</dd>
              </div>
            </dl>
            {#if display(project.description, '')}<p class="project-description">
                {display(project.description)}
              </p>{/if}
          </section>

          <section class="project-surface" aria-labelledby="operational-expenses-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('OPERATIONS')}</p>
                <h2 id="operational-expenses-title">
                  {isFinance || isOwner || isAuditor
                    ? t('Expense review')
                    : t('Operational expenses')}
                </h2>
              </div>
              <span class="surface-count">{overview.expenses.length}</span>
            </div>
            <p class="surface-intro">
              {isFinance || isOwner || isAuditor
                ? t('Commercial classification is shown only in the Finance view.')
                : t(
                    'Reported operational amounts and approval state. No commercial treatment is inferred.',
                  )}
            </p>
            <div class="compact-record-list">
              {#each overview.expenses.slice(0, 5) as expense}
                <a
                  class="compact-record"
                  href={base + '/app/expenses/' + String(expense.id)}
                  data-expense-record
                >
                  <span class="record-mark" aria-hidden="true">E</span>
                  <span class="record-copy"
                    ><strong>{display(expense.vendor, t('Expense'))}</strong><small
                      >{display(expense.spent_on)} · {controlled(
                        'expenseCategory',
                        expense.category,
                      )} · {status(expense.approval_state)}</small
                    ></span
                  >
                  <span class="record-value">{expenseAmount(expense)}</span>
                </a>
              {:else}<p class="empty-state">{t('No expenses recorded for this project.')}</p>{/each}
            </div>
            {#if overview.expenses.length > 5}<a class="inline-link" href={base + '/app/expenses'}
                >{t('View all expenses')} →</a
              >{/if}
          </section>
        </div>
      </div>
    {:else if activeTab === 'team'}
      <div
        id="project-panel-team"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-team"
        tabindex="0"
      >
        <div class="project-panel-grid">
          <section class="project-surface" aria-labelledby="team-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('OPERATIONAL ASSIGNMENTS')}</p>
                <h2 id="team-title">{t('Team')}</h2>
              </div>
              <span class="surface-count">{overview.workers.length}</span>
            </div>
            <p class="surface-intro">
              {t(
                'Assignments, effective dates and planning only. Commercial rates stay in Finance.',
              )}
            </p>
            <div class="team-list">
              {#each overview.workers as worker}
                <article class="team-record">
                  <div class="avatar" aria-hidden="true">
                    {display(worker.name, '?')
                      .split(' ')
                      .map((part) => part[0] ?? '')
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div class="record-copy">
                    <strong>{display(worker.name, t('Assigned worker'))}</strong><small
                      >{controlled('role', worker.assignment_role ?? worker.role)} · {display(
                        worker.starts_on,
                      )} → {display(worker.ends_on, t('Open assignment'))}</small
                    >
                  </div>
                  <span class="record-value"
                    >{worker.planned_minutes === null || worker.planned_minutes === undefined
                      ? '—'
                      : hours(worker.planned_minutes) + ' ' + t('planned')}</span
                  >
                </article>
              {:else}<p class="empty-state">
                  {t('No active assignments for this project.')}
                </p>{/each}
            </div>
          </section>

          <section class="project-surface" aria-labelledby="planning-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('PLANNING CONTEXT')}</p>
                <h2 id="planning-title">{t('Published schedule')}</h2>
              </div>
              <span class="surface-count">{overview.planning.length}</span>
            </div>
            {#if overview.schedule}
              <dl class="schedule-facts">
                <div>
                  <dt>{t('Timezone')}</dt>
                  <dd>{display(overview.schedule.timezone)}</dd>
                </div>
                <div>
                  <dt>{t('Effective from')}</dt>
                  <dd>{display(overview.schedule.effective_from)}</dd>
                </div>
                <div>
                  <dt>{t('Weekday minutes')}</dt>
                  <dd>
                    {display(overview.schedule.monday_minutes)} · {display(
                      overview.schedule.tuesday_minutes,
                    )} · {display(overview.schedule.wednesday_minutes)} · {display(
                      overview.schedule.thursday_minutes,
                    )} · {display(overview.schedule.friday_minutes)}
                  </dd>
                </div>
              </dl>
              <p class="surface-intro">
                {t('Planning context only; actual time remains independently recorded.')}
              </p>
            {:else}<p class="empty-state">{t('No published schedule is configured.')}</p>{/if}
            <div class="planning-list">
              {#each overview.planning as plan}
                <article class="planning-record">
                  <strong>{display(plan.worker_name, t('Assigned worker'))}</strong><small
                    >{display(plan.site)} · {display(plan.required_skill)}</small
                  ><span
                    >{display(plan.starts_at).replace('T', ' ').slice(0, 16)} → {display(
                      plan.ends_at,
                    ).slice(11, 16)}</span
                  >
                </article>
              {:else}<p class="empty-state">{t('No planning assignments recorded.')}</p>{/each}
            </div>
          </section>
        </div>
      </div>
    {:else if activeTab === 'reports'}
      <div
        id="project-panel-reports"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-reports"
        tabindex="0"
      >
        <section class="project-surface report-surface" aria-labelledby="reports-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('REPORTS & FILES')}</p>
              <h2 id="reports-title">{t('Reports')}</h2>
            </div>
            <a class="primary-button" href={base + '/app/reports'}>{t('Open Reports')}</a>
          </div>
          <div class="report-surface-grid">
            <a class="report-type-card" href={base + '/app/reports'}
              ><span class="report-type-icon" aria-hidden="true">D</span><strong
                >{t('Daily')}</strong
              ><small>{t('Field activity and operational summary')}</small><span
                class="record-value"
                >{overview.reports.filter((row) => row.type !== 'PLC').length}</span
              ></a
            >
            <a class="report-type-card" href={base + '/app/reports'}
              ><span class="report-type-icon" aria-hidden="true">P</span><strong
                >{t('Technical / PLC')}</strong
              ><small>{t('Controls, systems and technical evidence')}</small><span
                class="record-value"
                >{overview.reports.filter((row) => row.type === 'PLC').length}</span
              ></a
            >
            <a class="report-type-card report-signoff-card" href={base + '/app/reports'}
              ><span class="report-type-icon" aria-hidden="true">✓</span><strong
                >{t('Client Sign-off')}</strong
              ><small>{t('Customer-safe hours, activities and conformity surface')}</small><span
                class="inline-link">{t('Open sign-off')} →</span
              ></a
            >
          </div>
          <div class="report-register" aria-label={t('Project report register')}>
            {#each overview.reports as report}
              <a class="compact-record" href={base + '/app/reports/' + String(report.id)}
                ><span class="record-mark" aria-hidden="true"
                  >{report.type === 'PLC' ? 'P' : 'D'}</span
                ><span class="record-copy"
                  ><strong>{display(report.title, t('Report'))}</strong><small
                    >{reportType(report.type)} · {display(report.date)} · {status(
                      report.approval_state,
                    )}</small
                  ></span
                >{#if report.safety_related}<span class="safety-label">{t('Safety')}</span>{/if}</a
              >
            {:else}<p class="empty-state">{t('No reports recorded for this project.')}</p>{/each}
          </div>
        </section>
      </div>
    {:else if activeTab === 'commercial' && canViewCommercial}
      <div
        id="project-panel-commercial"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-commercial"
        tabindex="0"
      >
        <div class="project-panel-grid">
          <section class="project-surface" aria-labelledby="commercial-policy-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('FINANCE / ADMIN')}</p>
                <h2 id="commercial-policy-title">{t('Commercial configuration')}</h2>
              </div>
              <span class="read-only-note">{isAuditor ? t('Read only') : t('Authorized view')}</span
              >
            </div>
            <dl class="project-facts">
              <div>
                <dt>{t('Commercial model')}</dt>
                <dd>{display(project.billing_model, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Reference hours / day')}</dt>
                <dd>
                  {project.expected_minutes_per_day === null ||
                  project.expected_minutes_per_day === undefined
                    ? '—'
                    : hours(project.expected_minutes_per_day)}
                </dd>
              </div>
              <div>
                <dt>{t('Client minimum')}</dt>
                <dd>
                  {project.client_daily_minimum_minutes === null ||
                  project.client_daily_minimum_minutes === undefined
                    ? t('Not configured')
                    : hours(project.client_daily_minimum_minutes)}
                </dd>
              </div>
              <div>
                <dt>{t('Budget type')}</dt>
                <dd>{display(project.budget_type, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Cost center')}</dt>
                <dd>{display(project.cost_center_code, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('PO / reference')}</dt>
                <dd>{display(project.po_number, t('Not configured'))}</dd>
              </div>
            </dl>
            <p class="surface-intro">
              {t(
                'Workers and PMs record operational truth. Finance configuration determines its commercial interpretation.',
              )}
            </p>
          </section>

          <section class="project-surface" aria-labelledby="economics-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('CANONICAL PROJECTION')}</p>
                <h2 id="economics-title">{t('Project economics')}</h2>
              </div>
              <span class="read-only-note"
                >{isAuditor ? t('Read only') : t('Exact source records')}</span
              >
            </div>
            {#if finance}
              <dl class="finance-facts">
                <div>
                  <dt>{t('Contribution')}</dt>
                  <dd>
                    {money(
                      finance.contributionMarginMinor,
                      String(finance.currency ?? project.currency),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('Contribution Margin %')}</dt>
                  <dd>
                    {percentageFromBps(finance.contributionMarginBps)}
                  </dd>
                </div>
                <div>
                  <dt>{t('Direct Project Result')}</dt>
                  <dd>
                    {money(
                      finance.contributionMarginMinor,
                      String(finance.currency ?? project.currency),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('Direct cost')}</dt>
                  <dd>
                    {money(finance.approvedCostMinor, String(finance.currency ?? project.currency))}
                  </dd>
                </div>
                <div>
                  <dt>{t('Client receivable')}</dt>
                  <dd>
                    {money(finance.receivableMinor, String(finance.currency ?? project.currency))}
                  </dd>
                </div>
                <div>
                  <dt>{t('Invoiced')}</dt>
                  <dd>
                    {money(finance.invoicedMinor, String(finance.currency ?? project.currency))}
                  </dd>
                </div>
                <div>
                  <dt>{t('Collected')}</dt>
                  <dd>{money(finance.paidMinor, String(finance.currency ?? project.currency))}</dd>
                </div>
                <div>
                  <dt>{t('Approved WIP')}</dt>
                  <dd>
                    {money(
                      finance.approvedUnbilledWipMinor,
                      String(finance.currency ?? project.currency),
                    )}
                  </dd>
                </div>
              </dl>
            {:else}<p class="empty-state">
                {t('Finance projection is not available for this role.')}
              </p>{/if}
          </section>
        </div>
        <section class="project-surface" aria-labelledby="milestones-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('COMMERCIAL RECORDS')}</p>
              <h2 id="milestones-title">{t('Milestones')}</h2>
            </div>
            <span class="surface-count">{overview.milestones.length}</span>
          </div>
          <div class="compact-record-list">
            {#each overview.milestones as milestone}
              <a class="compact-record" href={base + '/app/approvals'}
                ><span class="record-mark" aria-hidden="true">M</span><span class="record-copy"
                  ><strong>{display(milestone.name, t('Milestone'))}</strong><small
                    >{display(milestone.due_on, t('No due date'))} · {status(
                      milestone.approval_state,
                    )}</small
                  ></span
                ><span class="record-value"
                  >{money(
                    milestone.amount_minor,
                    String(milestone.currency ?? project.currency),
                  )}</span
                ></a
              >
            {:else}<p class="empty-state">{t('No milestones configured.')}</p>{/each}
          </div>
        </section>
      </div>
    {:else if activeTab === 'billing' && canViewCommercial}
      <div
        id="project-panel-billing"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-billing"
        tabindex="0"
      >
        <section class="project-surface" aria-labelledby="billing-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('FINANCE WORKFLOW')}</p>
              <h2 id="billing-title">{t('Billing')}</h2>
            </div>
            <a class="secondary-button" href={base + '/app/billing'}>{t('Open Billing')}</a>
          </div>
          <p class="surface-intro">
            {t(
              'Billing lifecycle remains in the finance workspace. Issued invoices are immutable snapshots.',
            )}
          </p>
          <div class="billing-stream-list">
            {#each billingRules as rule}
              <article class="billing-stream">
                <div>
                  <strong>{controlled('billingStream', rule.stream_type)}</strong><small
                    >{controlled('billingStream', rule.cadence_type)} · {display(
                      rule.currency,
                    )}</small
                  >
                </div>
                <span class="state-badge">{status(rule.status ?? 'active')}</span>
              </article>
            {:else}<p class="empty-state">
                {t('No billing stream is configured for this project.')}
              </p>{/each}
          </div>
          {#if canWriteFinance}
            <div class="billing-action-row">
              <button type="button" class="primary-button" onclick={() => (invoiceOpen = true)}
                >{t('Create invoice draft')}</button
              ><a class="secondary-button" href={financeExportUrl} download
                >{t('Download finance export')}</a
              >
            </div>
          {:else}<p class="read-only-note">
              {t('Auditor access is read only. Finance actions remain unavailable.')}
            </p>{/if}
        </section>
      </div>
    {/if}
  </div>
</main>

{#if isOwner}
  <ResponsiveSheet
    open={editOpen}
    title={t('Edit project')}
    description={t(
      'Update project configuration with optimistic concurrency. Lifecycle status and close date remain protected.',
    )}
    closeLabel={t('Close edit project')}
    class="project-edit-sheet"
    onclose={() => (editOpen = false)}
  >
    <form method="POST" action="?/updateProject" class="project-edit-form" onsubmit={submitForm}>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="version" value={project.version ?? 1} />
      <div class="form-notice">
        <strong>{t('Protected project identity')}</strong><span
          >{display(project.project_number)} · {display(project.client_name)} · {display(
            project.currency,
          )}</span
        >
      </div>
      <div class="edit-field-grid">
        <label
          >{t('Name')}<input
            name="name"
            value={display(project.name, '')}
            required
            maxlength="200"
          /></label
        >
        <label
          >{t('Cost center code')}<input
            name="costCenterCode"
            value={display(project.cost_center_code, '')}
            required
            maxlength="120"
          /></label
        >
        <label
          >{t('Project alias')}<input
            name="projectAlias"
            value={display(project.project_alias, '')}
            maxlength="120"
          /></label
        >
        <label
          >{t('PO / reference')}<input
            name="poNumber"
            value={display(project.po_number, '')}
            maxlength="200"
          /></label
        >
        <label
          >{t('Contract number')}<input
            name="contractNumber"
            value={display(project.contract_number, '')}
            maxlength="200"
          /></label
        >
        <label
          >{t('Timezone')}<input
            name="timezone"
            value={display(project.timezone, '')}
            required
            maxlength="80"
          /></label
        >
        <label
          >{t('Site / plant')}<input
            name="siteName"
            value={display(project.site_name, '')}
            maxlength="200"
          /></label
        >
        <label
          >{t('Country')}<input
            name="country"
            value={display(project.country, '')}
            maxlength="120"
          /></label
        >
        <label
          >{t('Project manager')}<select name="projectManagerId"
            ><option value="">{t('Unassigned')}</option
            >{#each data.workers ?? [] as worker}{#if worker.role === 'project_manager'}<option
                  value={worker.id}
                  selected={String(worker.id) === String(project.project_manager_id)}
                  >{display(worker.name)}</option
                >{/if}{/each}</select
          ></label
        >
        <label
          >{t('Commercial model')}<select name="billingModel"
            >{#each ['tm', 'tm_daily_minimum', 'all_in', 'capped_tm', 'milestone', 'hybrid', 'internal'] as model}<option
                value={model}
                selected={String(project.billing_model) === model}
                >{controlled('billingStream', model)}</option
              >{/each}</select
          ></label
        >
        <label
          >{t('Budget type')}<input
            name="budgetType"
            value={display(project.budget_type, 'none')}
            maxlength="80"
          /></label
        >
        <label
          >{t('Start date')}<input
            name="startDate"
            type="date"
            value={display(project.start_date, '')}
          /></label
        >
        <label
          >{t('Planned end')}<input
            name="plannedEndDate"
            type="date"
            value={display(project.planned_end_date, '')}
          /></label
        >
        <label
          >{t('Expected minutes / day')}<input
            name="expectedMinutesPerDay"
            type="number"
            min="0"
            max="1440"
            value={display(project.expected_minutes_per_day, '')}
            required
          /></label
        >
        <label
          >{t('Client minimum minutes')}<input
            name="clientDailyMinimumMinutes"
            type="number"
            min="0"
            max="1440"
            value={display(project.client_daily_minimum_minutes, '')}
          /></label
        >
        <label
          >{t('Planned minutes')}<input
            name="plannedMinutes"
            type="number"
            min="0"
            value={display(project.planned_minutes, '')}
          /></label
        >
        <label
          >{t('Budget · minor units')}<input
            name="budgetMinor"
            type="number"
            min="0"
            value={display(project.budget_minor, '')}
          /></label
        >
        <label
          >{t('Revenue budget · minor units')}<input
            name="revenueBudgetMinor"
            type="number"
            min="0"
            value={display(project.revenue_budget_minor, '')}
          /></label
        >
        <label
          >{t('PO cap · minor units')}<input
            name="poCapMinor"
            type="number"
            min="0"
            value={display(project.po_cap_minor, '')}
          /></label
        >
        <label
          >{t('Fixed price · minor units')}<input
            name="fixedPriceMinor"
            type="number"
            min="0"
            value={display(project.fixed_price_minor, '')}
          /></label
        >
        <label
          >{t('Labor budget minutes')}<input
            name="laborBudgetMinutes"
            type="number"
            min="0"
            value={display(project.labor_budget_minutes, '')}
          /></label
        >
        <label
          >{t('Travel budget · minor units')}<input
            name="travelBudgetMinor"
            type="number"
            min="0"
            value={display(project.travel_budget_minor, '')}
          /></label
        >
        <label
          >{t('Other cost budget · minor units')}<input
            name="otherCostBudgetMinor"
            type="number"
            min="0"
            value={display(project.other_cost_budget_minor, '')}
          /></label
        >
      </div>
      <details class="advanced-edit-fields">
        <summary>{t('Advanced reporting and notes')}</summary>
        <div class="edit-field-grid">
          <label class="wide-field"
            >{t('Description')}<textarea name="description" rows="3"
              >{display(project.description, '')}</textarea
            ></label
          >
          <label class="wide-field"
            >{t('Administration notes')}<textarea name="notes" rows="3"
              >{display(project.notes, '')}</textarea
            ></label
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
        </div>
      </details>
      <p class="form-help">
        {t(
          'Project number, client, currency, lifecycle status and actual close date remain read-only to protect historical references.',
        )}
      </p>
      <div class="sheet-form-actions">
        <button type="button" class="secondary-button" onclick={() => (editOpen = false)}
          >{t('Cancel')}</button
        ><button type="submit" class="primary-button" disabled={saving}
          >{saving ? t('Saving…') : t('Save project')}</button
        >
      </div>
    </form>
  </ResponsiveSheet>
{/if}

{#if canWriteFinance}
  <ResponsiveSheet
    open={invoiceOpen}
    title={t('Create invoice draft')}
    description={t(
      'Draft creation is reviewable. Approval, issue, sending and payment remain explicit finance actions.',
    )}
    closeLabel={t('Close invoice draft')}
    class="project-invoice-sheet"
    onclose={() => (invoiceOpen = false)}
  >
    {#if billingRules.length > 0}
      <form
        method="POST"
        action="?/createInvoiceDraft"
        class="invoice-draft-form"
        onsubmit={submitForm}
      >
        <label
          >{t('Billing stream')}<select name="billingRuleId" required
            >{#each billingRules as rule}<option value={rule.id}
                >{controlled('billingStream', rule.stream_type)} · {controlled(
                  'billingStream',
                  rule.cadence_type,
                )} · {display(rule.currency)}</option
              >{/each}</select
          ></label
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
        <p class="form-help">
          {t(
            'Customer sign-off and other canonical billing readiness checks remain enforced by the server.',
          )}
        </p>
        <div class="sheet-form-actions">
          <button type="button" class="secondary-button" onclick={() => (invoiceOpen = false)}
            >{t('Cancel')}</button
          ><button type="submit" class="primary-button" disabled={saving}
            >{saving ? t('Creating…') : t('Create draft')}</button
          >
        </div>
      </form>
    {:else}<p class="empty-state">
        {t('No billing stream is configured for this project. Configure one in Billing first.')}
      </p>{/if}
  </ResponsiveSheet>
{/if}

<style>
  .project-detail-page {
    --project-ink: var(--ja-ink, #10202f);
    --project-muted: var(--ja-steel, #637486);
    --project-line: var(--ja-line, #dce4ed);
    --project-surface: var(--ja-white, #fff);
    --project-soft: #f5f8fa;
    max-width: 78rem;
    margin: 0 auto;
    padding: clamp(1rem, 2.5vw, 2.25rem);
    color: var(--project-ink);
  }

  .project-breadcrumb,
  .project-context,
  .surface-heading,
  .project-breadcrumb-actions,
  .project-context-actions,
  .billing-action-row,
  .sheet-form-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .project-breadcrumb {
    min-height: 2.75rem;
    color: var(--project-muted);
    font-size: 0.875rem;
  }
  .project-breadcrumb a,
  .inline-link {
    color: var(--ja-teal, #277e78);
    font-weight: 700;
    text-decoration: none;
  }
  .project-breadcrumb a:hover,
  .project-breadcrumb a:focus-visible,
  .inline-link:hover,
  .inline-link:focus-visible {
    text-decoration: underline;
  }
  .project-breadcrumb-actions {
    margin-inline-start: auto;
  }

  .quiet-button,
  .secondary-button,
  .primary-button {
    min-height: 2.75rem;
    border-radius: 0.45rem;
    padding: 0.65rem 0.9rem;
    font: inherit;
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }
  .quiet-button,
  .secondary-button {
    border: 1px solid var(--project-line);
    background: var(--project-surface);
    color: var(--project-ink);
  }
  .primary-button {
    border: 1px solid var(--ja-teal, #277e78);
    background: var(--ja-teal, #277e78);
    color: #fff;
  }
  .quiet-button:hover,
  .secondary-button:hover,
  .quiet-button:focus-visible,
  .secondary-button:focus-visible {
    border-color: var(--ja-teal, #277e78);
  }
  .primary-button:hover,
  .primary-button:focus-visible {
    background: #1f6762;
  }
  .quiet-button:focus-visible,
  .secondary-button:focus-visible,
  .primary-button:focus-visible,
  .project-tabs button:focus-visible,
  .compact-record:focus-visible,
  .report-type-card:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #277e78) 35%, transparent);
    outline-offset: 2px;
  }

  .project-action-message {
    margin: 1rem 0;
    padding: 0.8rem 1rem;
    border: 1px solid #d6a03a;
    border-radius: 0.5rem;
    background: #fff8e7;
    color: #5a3c00;
  }
  .project-action-message.success {
    border-color: #68a980;
    background: #effaf2;
    color: #1f5630;
  }
  .project-context {
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.25rem;
    margin: 1.75rem 0 1.25rem;
    padding: 1.4rem clamp(1rem, 2vw, 1.6rem);
    border: 1px solid var(--project-line);
    border-inline-start: 4px solid var(--ja-red, #a12c2a);
    background: var(--project-surface);
  }
  .project-context h1,
  .surface-heading h2 {
    margin: 0.2rem 0 0;
    color: var(--project-ink);
  }
  .project-context h1 {
    font-size: clamp(1.55rem, 3vw, 2.25rem);
    letter-spacing: -0.025em;
  }
  .project-context-meta,
  .surface-intro,
  .form-help,
  .project-description {
    color: var(--project-muted);
  }
  .project-context-meta {
    margin: 0.45rem 0 0;
  }
  .project-context-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .state-badge,
  .read-only-note,
  .surface-count,
  .safety-label {
    display: inline-flex;
    align-items: center;
    min-height: 1.7rem;
    border: 1px solid var(--project-line);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    color: var(--project-muted);
    font-size: 0.75rem;
    font-weight: 800;
    white-space: nowrap;
  }
  .state-badge[data-state='active'],
  .state-badge[data-state='approved'],
  .state-badge[data-state='locked'] {
    border-color: #86b99a;
    background: #effaf2;
    color: #1f5630;
  }

  .attention-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-block: 1rem 1.25rem;
  }
  .attention-card,
  .project-surface {
    border: 1px solid var(--project-line);
    background: var(--project-surface);
  }
  .attention-card {
    display: grid;
    min-height: 7.5rem;
    gap: 0.35rem;
    align-content: start;
    padding: 1rem;
  }
  .attention-card span,
  .project-facts dt,
  .finance-facts dt,
  .schedule-facts dt {
    color: var(--project-muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .attention-card strong {
    font-size: clamp(1.35rem, 3vw, 1.9rem);
    font-variant-numeric: tabular-nums;
  }
  .attention-card small,
  .record-copy small,
  .team-record small,
  .planning-record small,
  .billing-stream small,
  .report-type-card small {
    color: var(--project-muted);
    line-height: 1.4;
  }

  .project-tabs {
    display: flex;
    gap: 0.2rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--project-line);
    scrollbar-width: thin;
  }
  .project-tabs button {
    min-height: 3rem;
    flex: 0 0 auto;
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 0.7rem 1rem;
    background: transparent;
    color: var(--project-muted);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .project-tabs button.active {
    border-bottom-color: var(--ja-red, #a12c2a);
    color: var(--project-ink);
  }
  .project-tab-panel {
    padding-block: 1.25rem 2rem;
  }
  .project-panel-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .project-surface {
    min-width: 0;
    padding: clamp(1rem, 2vw, 1.4rem);
  }
  .surface-heading {
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .surface-heading h2 {
    font-size: 1.1rem;
  }
  .portal-kicker {
    margin: 0;
    color: var(--ja-red, #a12c2a);
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .project-facts,
  .finance-facts,
  .schedule-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem 1.2rem;
    margin: 0;
  }
  .project-facts div,
  .finance-facts div,
  .schedule-facts div {
    min-width: 0;
  }
  .project-facts dd,
  .finance-facts dd,
  .schedule-facts dd {
    margin: 0.25rem 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }
  .project-description {
    margin: 1rem 0 0;
    white-space: pre-wrap;
  }
  .surface-intro {
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }

  .compact-record-list,
  .team-list,
  .planning-list,
  .billing-stream-list,
  .report-register {
    display: grid;
    gap: 0.55rem;
  }
  .compact-record,
  .team-record,
  .planning-record,
  .billing-stream {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--project-line);
    background: var(--project-soft);
    color: inherit;
    text-decoration: none;
  }
  .compact-record:hover,
  .compact-record:focus-visible {
    border-color: var(--ja-teal, #277e78);
  }
  .record-mark,
  .report-type-icon,
  .avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--project-line);
    border-radius: 0.45rem;
    background: var(--project-surface);
    color: var(--ja-red, #a12c2a);
    font-weight: 850;
  }
  .record-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 0.15rem;
  }
  .record-copy strong,
  .record-copy small {
    overflow-wrap: anywhere;
  }
  .record-value {
    flex: 0 0 auto;
    color: var(--project-ink);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    text-align: end;
  }
  .empty-state {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--project-line);
    color: var(--project-muted);
  }
  .inline-link {
    display: inline-block;
    margin-top: 0.8rem;
  }
  .team-record {
    align-items: flex-start;
  }
  .avatar {
    border-radius: 50%;
    background: #edf4f6;
    color: var(--ja-teal, #277e78);
  }
  .planning-record {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
  }
  .planning-record small {
    grid-column: 1;
  }
  .planning-record span {
    grid-column: 2;
    grid-row: 1 / span 2;
    color: var(--project-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .report-surface {
    display: grid;
    gap: 1rem;
  }
  .report-surface-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .report-type-card {
    display: grid;
    min-height: 8.5rem;
    gap: 0.4rem;
    align-content: start;
    padding: 1rem;
    border: 1px solid var(--project-line);
    background: var(--project-soft);
    color: inherit;
    text-decoration: none;
  }
  .report-type-card .record-value {
    margin-top: auto;
  }
  .report-type-icon {
    width: 2rem;
    height: 2rem;
    margin-bottom: 0.3rem;
  }
  .safety-label {
    border-color: #cf9d6a;
    color: #7a4a12;
  }
  .billing-stream {
    justify-content: space-between;
  }
  .billing-stream > div {
    display: grid;
    gap: 0.2rem;
  }
  .billing-action-row {
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .project-edit-form,
  .invoice-draft-form {
    display: grid;
    gap: 1rem;
  }
  .edit-field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }
  .edit-field-grid label,
  .invoice-draft-form label {
    display: grid;
    gap: 0.35rem;
    color: var(--project-ink);
    font-size: 0.85rem;
    font-weight: 750;
  }
  .edit-field-grid input,
  .edit-field-grid select,
  .edit-field-grid textarea,
  .invoice-draft-form input,
  .invoice-draft-form select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--project-line);
    border-radius: 0.4rem;
    padding: 0.7rem;
    background: var(--project-surface);
    color: var(--project-ink);
    font: inherit;
  }
  .edit-field-grid input:focus-visible,
  .edit-field-grid select:focus-visible,
  .edit-field-grid textarea:focus-visible,
  .invoice-draft-form input:focus-visible,
  .invoice-draft-form select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #277e78) 35%, transparent);
    outline-offset: 1px;
  }
  .wide-field {
    grid-column: 1 / -1;
  }
  .advanced-edit-fields {
    border-block: 1px solid var(--project-line);
    padding-block: 0.8rem;
  }
  .advanced-edit-fields summary {
    cursor: pointer;
    font-weight: 800;
  }
  .advanced-edit-fields .edit-field-grid {
    margin-top: 1rem;
  }
  .check {
    display: flex !important;
    align-items: center;
    gap: 0.5rem !important;
  }
  .check input {
    width: auto;
  }
  .form-notice {
    display: grid;
    gap: 0.2rem;
    border-inline-start: 3px solid var(--ja-teal, #277e78);
    padding: 0.75rem 0.9rem;
    background: #eef8f7;
  }
  .form-notice span {
    color: var(--project-muted);
    font-size: 0.85rem;
  }
  .sheet-form-actions {
    position: sticky;
    bottom: -1.25rem;
    justify-content: flex-end;
    margin: 0 -1.25rem -1.25rem;
    padding: 0.8rem 1.25rem;
    border-top: 1px solid var(--project-line);
    background: var(--project-surface);
  }
  button:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  @media (max-width: 900px) {
    .attention-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .project-panel-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .project-detail-page {
      padding: 0.75rem;
    }
    .project-breadcrumb,
    .project-context,
    .project-breadcrumb-actions,
    .project-context-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .project-breadcrumb-actions {
      margin-inline-start: 0;
    }
    .project-breadcrumb-actions > *,
    .project-context-actions > * {
      justify-content: center;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
    }
    .attention-grid,
    .project-facts,
    .finance-facts,
    .schedule-facts,
    .report-surface-grid,
    .edit-field-grid {
      grid-template-columns: 1fr;
    }
    .project-context {
      margin-top: 1rem;
    }
    .project-tabs button {
      min-width: max-content;
      padding-inline: 0.8rem;
    }
    .compact-record,
    .team-record,
    .billing-stream {
      align-items: flex-start;
    }
    .record-value {
      max-width: 8rem;
      overflow-wrap: anywhere;
      text-align: end;
    }
    .planning-record {
      grid-template-columns: 1fr;
    }
    .planning-record span {
      grid-column: 1;
      grid-row: auto;
      text-align: start;
    }
    :global(.project-edit-sheet),
    :global(.project-invoice-sheet) {
      inset: 0;
      width: 100vw;
      max-height: 100svh;
      border: 0;
      border-radius: 0;
    }
    .sheet-form-actions {
      bottom: -1rem;
      margin-inline: -1rem;
      padding-inline: 1rem;
    }
    .sheet-form-actions > * {
      flex: 1 1 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .project-detail-page *,
    .project-detail-page *::before,
    .project-detail-page *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
  @media print {
    .project-detail-page {
      max-width: none;
      padding: 0;
    }
    .project-breadcrumb,
    .project-tabs,
    .project-context-actions,
    .attention-card.finance-summary,
    .no-print {
      display: none !important;
    }
    .project-tab-panel:not([id='project-panel-overview']) {
      display: none;
    }
    .project-surface,
    .attention-card {
      break-inside: avoid;
      box-shadow: none;
    }
  }
</style>
