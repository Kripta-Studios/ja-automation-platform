<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount, tick } from 'svelte';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { SectionCard, StatusBadge } from '../ui';
  import {
    operationalMatches,
    operationalPage,
    operationalSort,
    operationalStatusMatches,
    readOperationalRegisterState,
    type OperationalOrder,
    writeOperationalRegisterState,
  } from './operational-register';

  type Tab = 'time' | 'expenses' | 'reports';
  type Stage = 'operational' | 'report' | 'correction' | 'owner_override' | 'finance' | '';
  const tabs: readonly Tab[] = ['time', 'expenses', 'reports'];

  let {
    data,
    isAuditor,
    isOwner,
    canSeeFinanceReview = false,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    isOwner: boolean;
    /** Explicit capability: finance rows remain out of the PM surface by default. */
    canSeeFinanceReview?: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  let activeTab = $state<Tab>('time');
  let search = $state('');
  let stageFilter = $state<Stage>('');
  let projectFilter = $state('');
  let workerFilter = $state('');
  let clientFilter = $state('');
  let fromFilter = $state('');
  let toFilter = $state('');
  let statusFilter = $state('');
  let order = $state<OperationalOrder>('priority');
  let queuePage = $state(1);
  let completedPage = $state(1);
  let milestoneSearch = $state('');
  let milestonePage = $state(1);
  let financeSearch = $state('');
  let financePage = $state(1);
  let registerStateHydrated = $state(false);
  // v2 intentionally resets the former "oldest" default to the action-priority ordering.
  const registerStateKey = (): string => `ja-operational-register:approvals-v2:${data.user.id}`;

  onMount(() => {
    const saved = readOperationalRegisterState<{
      activeTab?: Tab;
      search?: string;
      order?: OperationalOrder;
      queuePage?: number;
      completedPage?: number;
      milestoneSearch?: string;
      milestonePage?: number;
      financeSearch?: string;
      financePage?: number;
    }>(registerStateKey());
    if (!$page.url.searchParams.has('tab') && saved?.activeTab && tabs.includes(saved.activeTab))
      activeTab = saved.activeTab;
    if (!$page.url.searchParams.has('q') && typeof saved?.search === 'string')
      search = saved.search;
    if (
      !$page.url.searchParams.has('order') &&
      saved?.order &&
      ['priority', 'newest', 'oldest', 'name', 'status'].includes(saved.order)
    ) {
      order = saved.order;
    }
    if (typeof saved?.queuePage === 'number') queuePage = saved.queuePage;
    if (typeof saved?.completedPage === 'number') completedPage = saved.completedPage;
    if (typeof saved?.milestoneSearch === 'string') milestoneSearch = saved.milestoneSearch;
    if (typeof saved?.milestonePage === 'number') milestonePage = saved.milestonePage;
    if (typeof saved?.financeSearch === 'string') financeSearch = saved.financeSearch;
    if (typeof saved?.financePage === 'number') financePage = saved.financePage;
    registerStateHydrated = true;
  });
  $effect(() => {
    if (registerStateHydrated)
      writeOperationalRegisterState(registerStateKey(), {
        activeTab,
        search,
        order,
        queuePage,
        completedPage,
        milestoneSearch,
        milestonePage,
        financeSearch,
        financePage,
      });
  });
  const componentId = $props.id();

  $effect(() => {
    const tab = $page.url.searchParams.get('tab');
    if (tab === 'time' || tab === 'expenses' || tab === 'reports') activeTab = tab;
    search = $page.url.searchParams.get('q')?.trim() ?? search;
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    workerFilter = $page.url.searchParams.get('worker')?.trim() ?? '';
    clientFilter = $page.url.searchParams.get('client')?.trim() ?? '';
    fromFilter = $page.url.searchParams.get('from')?.trim() ?? '';
    toFilter = $page.url.searchParams.get('to')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    const requestedStage = $page.url.searchParams.get('stage');
    if (
      requestedStage === '' ||
      requestedStage === 'operational' ||
      requestedStage === 'report' ||
      requestedStage === 'correction' ||
      requestedStage === 'owner_override' ||
      requestedStage === 'finance'
    ) {
      stageFilter = requestedStage;
    }
    const requestedOrder = $page.url.searchParams.get('order');
    if (
      requestedOrder &&
      ['priority', 'newest', 'oldest', 'name', 'status'].includes(requestedOrder)
    ) {
      order = requestedOrder as OperationalOrder;
    }
  });

  const rows = $derived(data.records ?? []);
  const milestones = $derived(data.milestones ?? []);
  const financeReviewVisible = $derived(
    canSeeFinanceReview &&
      ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(String(data.user.role)),
  );
  const ownerOverrideAllowed = $derived(
    isOwner && String(data.user.role) === 'owner_admin' && !isAuditor,
  );
  const financeRows = $derived(
    financeReviewVisible ? rows.filter((row) => String(row.review_stage) === 'finance') : [],
  );
  const operationalRows = $derived(rows.filter((row) => String(row.review_stage) !== 'finance'));
  const clientOptions = $derived(
    Array.from(
      new Map(
        [...rows, ...milestones]
          .filter((row) => value(row, 'client_name'))
          .map((row) => [value(row, 'client_name'), value(row, 'client_name')]),
      ).entries(),
    ),
  );
  const attentionCount = $derived(
    operationalRows.filter((row) =>
      ['submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const reportCount = $derived(
    operationalRows.filter((row) => ['daily', 'technical'].includes(String(row.type))).length,
  );

  const filteredOperationalRows = $derived.by(() => {
    return operationalRows.filter((row) => {
      const type = String(row.type);
      const matchesTab =
        activeTab === 'time'
          ? type === 'time'
          : activeTab === 'expenses'
            ? type === 'expense'
            : ['daily', 'technical'].includes(type);
      const matchesStage = !stageFilter || String(row.review_stage) === stageFilter;
      const matchesSearch = operationalMatches(row, search, [
        'id',
        'date',
        'type',
        'project_id',
        'project_name',
        'project_number',
        'client_name',
        'worker_id',
        'worker_name',
      ]);
      const matchesProject = !projectFilter || value(row, 'project_id') === projectFilter;
      const matchesWorker = !workerFilter || value(row, 'worker_id') === workerFilter;
      const matchesClient = !clientFilter || value(row, 'client_name') === clientFilter;
      const recordDate = value(row, 'date');
      const matchesFrom = !fromFilter || recordDate >= fromFilter;
      const matchesTo = !toFilter || recordDate <= toFilter;
      const matchesStatus = operationalStatusMatches(row.approval_state, statusFilter, [
        'submitted',
        'needs_changes',
      ]);
      return (
        matchesTab &&
        matchesStage &&
        matchesSearch &&
        matchesProject &&
        matchesWorker &&
        matchesClient &&
        matchesFrom &&
        matchesTo &&
        matchesStatus
      );
    });
  });
  const submittedRows = $derived(
    operationalSort(
      filteredOperationalRows.filter((row) => value(row, 'approval_state') !== 'approved'),
      order,
      ['date'],
      ['worker_name', 'project_name', 'project_number'],
      ['approval_state', 'review_stage'],
    ),
  );
  const completedRows = $derived(
    operationalSort(
      filteredOperationalRows.filter((row) => value(row, 'approval_state') === 'approved'),
      order,
      ['date'],
      ['worker_name', 'project_name', 'project_number'],
      ['approval_state', 'review_stage'],
    ),
  );
  const pagedSubmittedRows = $derived(operationalPage(submittedRows, queuePage));
  const pagedCompletedRows = $derived(operationalPage(completedRows, completedPage));
  const filteredMilestones = $derived(
    operationalSort(
      milestones.filter(
        (row) =>
          (!projectFilter || value(row, 'project_id') === projectFilter) &&
          (!clientFilter || value(row, 'client_name') === clientFilter) &&
          (!fromFilter || value(row, 'due_on') >= fromFilter) &&
          (!toFilter || value(row, 'due_on') <= toFilter) &&
          operationalMatches(row, milestoneSearch || search, [
            'id',
            'project_number',
            'project_name',
            'client_name',
            'name',
            'due_on',
          ]),
      ),
      order,
      ['due_on'],
      ['name', 'project_number'],
      ['approval_state', 'state'],
    ),
  );
  const pagedMilestones = $derived(operationalPage(filteredMilestones, milestonePage));
  const filteredFinanceRows = $derived(
    operationalSort(
      financeRows.filter(
        (row) =>
          (!projectFilter || value(row, 'project_id') === projectFilter) &&
          (!workerFilter || value(row, 'worker_id') === workerFilter) &&
          (!clientFilter || value(row, 'client_name') === clientFilter) &&
          (!fromFilter || value(row, 'date') >= fromFilter) &&
          (!toFilter || value(row, 'date') <= toFilter) &&
          operationalMatches(row, financeSearch || search, [
            'id',
            'date',
            'type',
            'project_id',
            'project_name',
            'project_number',
            'client_name',
            'worker_id',
            'worker_name',
          ]),
      ),
      order,
      ['date'],
      ['worker_name', 'project_name'],
      ['approval_state', 'review_stage'],
    ),
  );
  const pagedFinanceRows = $derived(operationalPage(filteredFinanceRows, financePage));

  function value(row: Row, key: string): string {
    const raw = row[key];
    return raw === null || raw === undefined ? '' : String(raw);
  }

  function recordHref(row: Row): string {
    const id = encodeURIComponent(value(row, 'id'));
    const type = value(row, 'type');
    if (type === 'expense') return `${base}/app/expenses/${id}`;
    if (type === 'time') return `${base}/app/time/${id}`;
    if (['daily', 'technical'].includes(type)) return `${base}/app/reports/${id}`;
    return `${base}/app/${encodeURIComponent(type)}/${id}`;
  }

  function tabId(tab: Tab): string {
    return `approval-tab-${componentId}-${tab}`;
  }

  function panelId(): string {
    return 'approval-queue';
  }

  function resetApprovalPages(): void {
    queuePage = 1;
    completedPage = 1;
    milestonePage = 1;
    financePage = 1;
  }

  function focusTab(tab: Tab): void {
    activeTab = tab;
    if (typeof document === 'undefined') return;
    void tick().then(() => document.getElementById(tabId(tab))?.focus());
  }

  /** Keep the current tab and scroll position while the server refreshes the queue. */
  const submitApproval: SubmitFunction = () => {
    const scrollTop = window.scrollY;
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success' || result.type === 'failure') {
        await tick();
        window.scrollTo({ top: scrollTop, behavior: 'instant' });
      }
    };
  };

  function applyFilters(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === 'string' && value) params.set(name, value);
    }
    void goto(`${base}/app/approvals?${params.toString()}`, {
      noScroll: true,
      keepFocus: true,
    });
  }

  function clearFilters(event: MouseEvent): void {
    event.preventDefault();
    resetApprovalPages();
    void goto(`${base}/app/approvals?tab=${activeTab}&q=&stage=&order=priority`, {
      noScroll: true,
      keepFocus: true,
    });
  }

  function approvalHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const tab = overrides.tab ?? activeTab;
    const project = overrides.project ?? projectFilter;
    const worker = overrides.worker ?? workerFilter;
    const client = overrides.client ?? clientFilter;
    const from = overrides.from ?? fromFilter;
    const to = overrides.to ?? toFilter;
    const status = overrides.status ?? statusFilter;
    const q = overrides.q ?? search;
    if (tab) params.set('tab', tab);
    if (project) params.set('project', project);
    if (worker) params.set('worker', worker);
    if (client) params.set('client', client);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return `${base}/app/approvals?${params.toString()}`;
  }

  function handleTabKeydown(event: KeyboardEvent, tab: Tab): void {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) focusTab(nextTab);
  }

  function tabLabel(tab: Tab): string {
    if (tab === 'time') return translate('Time');
    if (tab === 'expenses') return translate('Expenses');
    return translate('Reports');
  }

  function stageLabel(stage: unknown): string {
    switch (String(stage)) {
      case 'report':
        return translate('Report review');
      case 'correction':
        return translate('Correction draft');
      case 'owner_override':
        return translate('Owner override');
      case 'finance':
        return translate('Finance review');
      default:
        return translate('Operational review');
    }
  }

  function statusVariant(
    valueToClass: unknown,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(valueToClass ?? '')) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'submitted':
      case 'needs_changes':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function rowType(row: Row): 'time' | 'expense' {
    return value(row, 'type') === 'expense' ? 'expense' : 'time';
  }

  function expenseClassificationHref(row: Row): string {
    const params = new URLSearchParams({
      view: 'commercial',
      project: value(row, 'project_id'),
      expense: value(row, 'id'),
    });
    return `${base}/app/finance?${params.toString()}#expense-classification`;
  }
</script>

<div class="approval-page">
  <header class="approval-context">
    <div>
      <p class="approval-eyebrow">{translate('Operational control')}</p>
      <h2>{translate('Approvals')}</h2>
      <p>{translate('Review submitted operational truth before it moves to the next stage.')}</p>
    </div>
    <span class="approval-count" aria-label={translate('Approval queue count')}
      >{operationalRows.length}</span
    >
  </header>

  <div class="approval-attention" aria-label={translate('Approval attention summary')}>
    <a
      class="approval-attention-card"
      href={`${approvalHref({ status: 'attention' })}#approval-queue`}
    >
      <span>{translate('Needs attention')}</span>
      <strong>{attentionCount}</strong>
      <small>{translate('Submitted or correction-ready records')}</small>
    </a>
    <a
      class="approval-attention-card"
      href={`${approvalHref({ tab: 'reports', status: 'submitted' })}#approval-queue`}
    >
      <span>{translate('Reports')}</span>
      <strong>{reportCount}</strong>
      <small>{translate('Daily and technical reports in scope')}</small>
    </a>
    {#if financeReviewVisible}
      <a class="approval-attention-card approval-attention-card-finance" href="#finance-review">
        <span>{translate('Finance review')}</span>
        <strong>{financeRows.length}</strong>
        <small>{translate('Separate finance queue')}</small>
      </a>
    {/if}
  </div>

  <div class="approval-tabs" aria-label={translate('Approval domains')} role="tablist">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        id={tabId(tab)}
        aria-selected={activeTab === tab}
        aria-controls={panelId()}
        tabindex={activeTab === tab ? 0 : -1}
        class:active={activeTab === tab}
        onclick={() => focusTab(tab)}
        onkeydown={(event) => handleTabKeydown(event, tab)}
      >
        <span>{tabLabel(tab)}</span>
        <strong
          >{operationalRows.filter((row) => {
            const type = value(row, 'type');
            return tab === 'time'
              ? type === 'time'
              : tab === 'expenses'
                ? type === 'expense'
                : ['daily', 'technical'].includes(type);
          }).length}</strong
        >
      </button>
    {/each}
  </div>

  <form
    class="approval-filters"
    aria-label={translate('Filter approvals')}
    method="GET"
    action={`${base}/app/approvals`}
    onsubmit={applyFilters}
  >
    <input type="hidden" name="tab" value={activeTab} />
    <label>
      <span>{translate('Search queue')}</span>
      <input
        name="q"
        bind:value={search}
        oninput={resetApprovalPages}
        type="search"
        placeholder={translate('Project, worker, date or record')}
      />
    </label>
    <label
      ><span>{translate('Client')}</span><select
        name="client"
        bind:value={clientFilter}
        onchange={resetApprovalPages}
        ><option value="">{translate('All clients')}</option
        >{#each clientOptions as [clientName, label]}<option value={clientName}>{label}</option
          >{/each}</select
      ></label
    >
    <label>
      <span>{translate('From')}</span>
      <input type="date" name="from" bind:value={fromFilter} onchange={resetApprovalPages} />
    </label>
    <label>
      <span>{translate('To')}</span>
      <input type="date" name="to" bind:value={toFilter} onchange={resetApprovalPages} />
    </label>
    <label
      ><span>{translate('Project')}</span><select
        name="project"
        bind:value={projectFilter}
        onchange={resetApprovalPages}
        ><option value="">{translate('All projects')}</option
        >{#each Array.from(new Map(operationalRows
              .filter((row) => value(row, 'project_id'))
              .map( (row) => [value(row, 'project_id'), value(row, 'project_name') || value(row, 'project_id')], )).entries()) as [id, label]}<option
            value={id}>{label}</option
          >{/each}</select
      ></label
    >
    <label
      ><span>{translate('Worker')}</span><select
        name="worker"
        bind:value={workerFilter}
        onchange={resetApprovalPages}
        ><option value="">{translate('All workers')}</option
        >{#each Array.from(new Map(operationalRows
              .filter((row) => value(row, 'worker_id'))
              .map( (row) => [value(row, 'worker_id'), value(row, 'worker_name') || value(row, 'worker_id')], )).entries()) as [id, label]}<option
            value={id}>{label}</option
          >{/each}</select
      ></label
    >
    <label
      ><span>{translate('Status')}</span><select
        name="status"
        bind:value={statusFilter}
        onchange={resetApprovalPages}
        ><option value="">{translate('All statuses')}</option><option value="attention"
          >{translate('Needs attention')}</option
        ><option value="submitted">{translate('Submitted')}</option><option value="approved"
          >{translate('Approved')}</option
        ><option value="needs_changes">{translate('Needs changes')}</option></select
      ></label
    >
    <label>
      <span>{translate('Sort by')}</span>
      <select name="order" bind:value={order} onchange={resetApprovalPages}>
        <option value="priority">{translate('Priority then oldest')}</option>
        <option value="oldest">{translate('Oldest first')}</option>
        <option value="newest">{translate('Newest first')}</option>
        <option value="name">{translate('Name')}</option>
        <option value="status">{translate('Status')}</option>
      </select>
    </label>
    <label>
      <span>{translate('Review stage')}</span>
      <select name="stage" bind:value={stageFilter}>
        <option value="">{translate('All stages')}</option>
        <option value="operational">{translate('Operational review')}</option>
        <option value="report">{translate('Report review')}</option>
        <option value="correction">{translate('Correction draft')}</option>
        {#if ownerOverrideAllowed}<option value="owner_override"
            >{translate('Owner override')}</option
          >{/if}
      </select>
    </label>
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
    <a
      class="secondary-button"
      href={`${base}/app/approvals?tab=${activeTab}&q=&stage=&order=priority`}
      onclick={clearFilters}>{translate('Clear filters')}</a
    >
  </form>

  <div
    id={panelId()}
    class="approval-tab-panel"
    role="tabpanel"
    aria-labelledby={tabId(activeTab)}
    tabindex="0"
  >
    <SectionCard
      title={`${translate('Action queue')} · ${tabLabel(activeTab)}`}
      class="approval-list-surface"
    >
      <p class="approval-purpose">
        {translate(
          'Records needing action come first, then explicit priority and oldest date. Approved records remain below for audit and correction follow-up.',
        )}
      </p>
      {#if pagedSubmittedRows.rows.length > 0}
        <div class="approval-list" aria-live="polite">
          {#each pagedSubmittedRows.rows as row}
            <article class="approval-row" data-approval-row={value(row, 'id')}>
              <div class="approval-row-main">
                <a class="approval-record-link" href={recordHref(row)}>
                  <strong
                    >{value(row, 'worker_name') || value(row, 'type')} · {value(
                      row,
                      'date',
                    )}</strong
                  >
                  <small
                    >{stageLabel(row.review_stage)} · {value(row, 'project_name') ||
                      value(row, 'project_id')}</small
                  >
                  <span>{translate('Open record →')}</span>
                </a>
                <div class="approval-row-status">
                  <StatusBadge
                    variant={statusVariant(row.approval_state)}
                    text={controlledValue('status', row.approval_state) ||
                      value(row, 'approval_state')}
                  />
                </div>
              </div>

              <div class="approval-row-actions">
                {#if isAuditor}
                  <span class="approval-read-only">{translate('Read-only review')}</span>
                {:else if value(row, 'review_stage') === 'report'}
                  <form method="POST" action="?/reviewReport" use:enhance={submitApproval}>
                    <input type="hidden" name="type" value={value(row, 'type')} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit">{translate('Approve report')}</button>
                  </form>
                  <details class="approval-action-menu">
                    <summary>{translate('Review actions')}</summary>
                    <form method="POST" action="?/reviewReport" use:enhance={submitApproval}>
                      <input type="hidden" name="type" value={value(row, 'type')} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="needs_changes" />
                      <label>
                        <span>{translate('Required change')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="secondary-button">{translate('Return')}</button>
                    </form>
                  </details>
                {:else if ['correction', 'owner_override'].includes(value(row, 'review_stage'))}
                  {#if value(row, 'review_stage') === 'owner_override' && !ownerOverrideAllowed}
                    <span class="approval-read-only">{translate('Owner review required')}</span>
                  {:else}
                    <a
                      class="secondary-button"
                      href={`${recordHref(row)}#${['daily', 'technical'].includes(value(row, 'type')) ? 'report-correction-title' : value(row, 'type') === 'expense' ? 'expense-correction-title' : 'time-correction-title'}`}
                      >{translate(
                        value(row, 'review_stage') === 'owner_override'
                          ? 'Create owner override draft'
                          : 'Create correction draft',
                      )} →</a
                    >
                  {/if}
                {:else}
                  <form method="POST" action="?/approveRecord" use:enhance={submitApproval}>
                    <input type="hidden" name="type" value={rowType(row)} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit">{translate('Approve')}</button>
                  </form>
                  <details class="approval-action-menu">
                    <summary>{translate('Review actions')}</summary>
                    <form method="POST" action="?/approveRecord" use:enhance={submitApproval}>
                      <input type="hidden" name="type" value={rowType(row)} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="needs_changes" />
                      <label>
                        <span>{translate('Required change')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="secondary-button">
                        {translate('Needs changes')}
                      </button>
                    </form>
                    <form method="POST" action="?/approveRecord" use:enhance={submitApproval}>
                      <input type="hidden" name="type" value={rowType(row)} />
                      <input type="hidden" name="id" value={value(row, 'id')} />
                      <input type="hidden" name="decision" value="rejected" />
                      <label>
                        <span>{translate('Rejection reason')}</span>
                        <input name="reason" minlength="3" required />
                      </label>
                      <button type="submit" class="danger-button">{translate('Reject')}</button>
                    </form>
                  </details>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="approval-empty" role="status">
          <strong>{translate('No submitted records match this view.')}</strong>
          <span>{translate('Completed records, if any, remain available below.')}</span>
        </div>
      {/if}
      {#if pagedSubmittedRows.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Submitted approval pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedSubmittedRows.current === 1}
            onclick={() => (queuePage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedSubmittedRows.current}
            {translate('of')}
            {pagedSubmittedRows.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedSubmittedRows.current === pagedSubmittedRows.totalPages}
            onclick={() => (queuePage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </SectionCard>
  </div>

  {#if completedRows.length > 0}
    <SectionCard
      title={translate('Completed review follow-up')}
      collapsible
      class="approval-list-surface"
    >
      <p class="approval-purpose">
        {translate(
          'These approved records are immutable operational history. Open a record to inspect it or start the audited correction path where permitted.',
        )}
      </p>
      <div class="approval-list">
        {#each pagedCompletedRows.rows as row}<article class="approval-row">
            <div class="approval-row-main">
              <a class="approval-record-link" href={recordHref(row)}
                ><strong
                  >{value(row, 'worker_name') || value(row, 'type')} · {value(row, 'date')}</strong
                ><small>{value(row, 'project_name') || value(row, 'project_id')}</small><span
                  >{translate('Open record →')}</span
                ></a
              ><StatusBadge
                variant={statusVariant(row.approval_state)}
                text={controlledValue('status', row.approval_state) || value(row, 'approval_state')}
              />
            </div>
          </article>{/each}
      </div>
      {#if pagedCompletedRows.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Completed approval pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedCompletedRows.current === 1}
            onclick={() => (completedPage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedCompletedRows.current}
            {translate('of')}
            {pagedCompletedRows.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedCompletedRows.current === pagedCompletedRows.totalPages}
            onclick={() => (completedPage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </SectionCard>
  {/if}

  {#if milestones.length > 0}
    <SectionCard title={translate('Project approvals')} class="approval-milestone-surface">
      <p class="approval-purpose">
        {translate(
          'A project appears here when a commercial milestone has been submitted for authorization. Approve confirms that milestone for its next commercial step; Reject returns it with a reason. It does not approve time, expenses or reports.',
        )}
      </p>
      <label class="approval-register-search"
        ><span>{translate('Search project approvals')}</span><input
          bind:value={milestoneSearch}
          oninput={() => (milestonePage = 1)}
          type="search"
          placeholder={translate('Project, milestone or due date')}
        /></label
      >
      <div class="approval-list" aria-live="polite">
        {#each pagedMilestones.rows as milestone}
          <article class="approval-row" data-approval-milestone={value(milestone, 'id')}>
            <div class="approval-row-main">
              <a
                class="approval-record-link"
                href={`${base}/app/projects/${encodeURIComponent(value(milestone, 'project_id'))}`}
              >
                <strong>{value(milestone, 'project_number')} · {value(milestone, 'name')}</strong>
                <small
                  >{value(milestone, 'due_on') || translate('No due date')} · {translate(
                    'Submitted',
                  )}</small
                >
                <span>{translate('Open project →')}</span>
              </a>
              <StatusBadge variant="warning" text={translate('Submitted')} />
            </div>
            {#if isAuditor}
              <span class="approval-read-only">{translate('Read-only review')}</span>
            {:else}
              <div class="approval-row-actions">
                <form method="POST" action="?/reviewMilestone" use:enhance={submitApproval}>
                  <input type="hidden" name="id" value={value(milestone, 'id')} />
                  <input type="hidden" name="decision" value="approved" />
                  <button type="submit">{translate('Approve')}</button>
                </form>
                <details class="approval-action-menu">
                  <summary>{translate('Review actions')}</summary>
                  <form method="POST" action="?/reviewMilestone" use:enhance={submitApproval}>
                    <input type="hidden" name="id" value={value(milestone, 'id')} />
                    <input type="hidden" name="decision" value="rejected" />
                    <label>
                      <span>{translate('Rejection reason')}</span>
                      <input name="reason" minlength="3" required />
                    </label>
                    <button type="submit" class="danger-button">{translate('Reject')}</button>
                  </form>
                </details>
              </div>
            {/if}
          </article>
        {/each}
      </div>
      {#if pagedMilestones.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Project approval pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedMilestones.current === 1}
            onclick={() => (milestonePage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedMilestones.current}
            {translate('of')}
            {pagedMilestones.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedMilestones.current === pagedMilestones.totalPages}
            onclick={() => (milestonePage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </SectionCard>
  {/if}

  {#if canSeeFinanceReview && financeReviewVisible}
    <SectionCard
      id="finance-review"
      title={translate('Finance review')}
      class="approval-finance-surface"
    >
      <p class="approval-finance-note">
        {translate(
          'Finance review starts only after operational approval. Finance must confirm billability or expense treatment before a record can move into billing, reimbursement or settlement; it does not rewrite the operational facts.',
        )}
      </p>
      <label class="approval-register-search"
        ><span>{translate('Search Finance review')}</span><input
          bind:value={financeSearch}
          oninput={() => (financePage = 1)}
          type="search"
          placeholder={translate('Project, worker, date or record')}
        /></label
      >
      {#if pagedFinanceRows.rows.length > 0}
        <div class="approval-list" aria-live="polite">
          {#each pagedFinanceRows.rows as row}
            <article class="approval-row" data-finance-review-row={value(row, 'id')}>
              <div class="approval-row-main">
                <a class="approval-record-link" href={recordHref(row)}>
                  <strong
                    >{value(row, 'worker_name') || value(row, 'type')} · {value(
                      row,
                      'date',
                    )}</strong
                  >
                  <small>{translate('Finance review')} · {value(row, 'project_id')}</small>
                  <span>{translate('Open record →')}</span>
                </a>
                <StatusBadge variant="warning" text={translate('Approved operationally')} />
              </div>
              {#if rowType(row) === 'expense' && value(row, 'commercial_classification_state') !== 'classified'}
                <div class="finance-review-form" data-finance-classification-required>
                  <span>{translate('Classify this expense before Finance review.')}</span>
                  <a href={expenseClassificationHref(row)}
                    >{translate('Classify expense in Finance →')}</a
                  >
                </div>
              {:else if isAuditor}
                <span class="approval-read-only">{translate('Read-only review')}</span>
              {:else}
                <form
                  method="POST"
                  action="?/financeApprove"
                  class="finance-review-form"
                  use:enhance={submitApproval}
                >
                  <input type="hidden" name="type" value={rowType(row)} />
                  <input type="hidden" name="id" value={value(row, 'id')} />
                  {#if value(row, 'type') === 'time'}
                    <label>
                      <span>{translate('Commercial treatment')}</span>
                      <select name="billable" required>
                        <option value="yes">{translate('Billable')}</option>
                        <option value="no">{translate('Non-billable')}</option>
                      </select>
                    </label>
                  {/if}
                  <button type="submit">{translate('Record Finance review')}</button>
                </form>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <div class="approval-empty" role="status">
          <strong>{translate('Finance queue clear.')}</strong>
        </div>
      {/if}
      {#if pagedFinanceRows.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Finance review pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedFinanceRows.current === 1}
            onclick={() => (financePage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedFinanceRows.current}
            {translate('of')}
            {pagedFinanceRows.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedFinanceRows.current === pagedFinanceRows.totalPages}
            onclick={() => (financePage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </SectionCard>
  {/if}
</div>

<style>
  .approval-page {
    display: grid;
    gap: 1.25rem;
  }

  .approval-context,
  .approval-row-main,
  .approval-row-actions,
  .approval-filters,
  .finance-review-form {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .approval-context {
    justify-content: space-between;
    border-bottom: 1px solid var(--border, #dfdedc);
    padding-bottom: 1rem;
  }

  .approval-context h2,
  .approval-context p {
    margin: 0;
  }

  .approval-context p:last-child {
    color: var(--muted, #6b6a62);
    margin-top: 0.35rem;
  }

  .approval-eyebrow {
    color: var(--accent, #4f4e48);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .approval-count {
    align-items: center;
    background: var(--surface-3, #f3f3f2);
    border: 1px solid var(--border, #dfdedc);
    border-radius: 999px;
    display: inline-flex;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    min-height: 2.75rem;
    min-width: 2.75rem;
    justify-content: center;
  }

  .approval-attention {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .approval-attention-card {
    background: var(--surface-2, #f9f9f8);
    border: 1px solid var(--border, #dfdedc);
    border-left: 3px solid var(--accent, #4f4e48);
    border-radius: 0.6rem;
    display: grid;
    gap: 0.2rem;
    padding: 0.9rem 1rem;
    color: inherit;
    text-decoration: none;
  }

  .approval-attention-card:hover,
  .approval-attention-card:focus-visible {
    border-color: var(--accent, #4f4e48);
    outline: 3px solid color-mix(in srgb, var(--accent, #4f4e48) 28%, transparent);
    outline-offset: 2px;
  }

  .approval-attention-card-finance {
    border-left-color: var(--warning, #a25b00);
  }

  .approval-attention-card strong {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }

  .approval-attention-card small,
  .approval-finance-note,
  .approval-record-link small {
    color: var(--muted, #6b6a62);
  }

  .approval-tabs {
    border-bottom: 1px solid var(--border, #dfdedc);
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
  }

  .approval-tabs button {
    align-items: center;
    background: transparent;
    border: 0;
    border-bottom: 3px solid transparent;
    color: var(--muted, #6b6a62);
    display: inline-flex;
    gap: 0.55rem;
    min-height: 2.9rem;
    padding: 0.55rem 0.9rem;
    white-space: nowrap;
  }

  .approval-tabs button.active {
    border-bottom-color: var(--accent, #4f4e48);
    color: var(--ink, #232320);
  }

  .approval-tabs button strong {
    background: var(--surface-3, #f3f3f2);
    border-radius: 999px;
    font-size: 0.8125rem;
    min-width: 1.55rem;
    padding: 0.15rem 0.35rem;
    text-align: center;
  }

  .approval-filters {
    align-items: end;
    flex-wrap: wrap;
  }

  .approval-filters label,
  .finance-review-form label,
  .approval-action-menu label {
    display: grid;
    gap: 0.3rem;
  }

  .approval-filters label:first-of-type {
    flex: 1 1 16rem;
  }

  .approval-filters label:not(:first-of-type) {
    flex: 0 1 14rem;
  }

  .approval-filters span,
  .finance-review-form span,
  .approval-action-menu span {
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .approval-filters input,
  .approval-filters select,
  .finance-review-form select,
  .approval-action-menu input,
  .approval-row-actions > form input {
    border: 1px solid var(--border, #d2d1ce);
    border-radius: 0.4rem;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .approval-row {
    border-bottom: 1px solid var(--border, #dfdedc);
    display: grid;
    gap: 0.9rem;
    padding: 1rem 0;
  }

  .approval-row:last-child {
    border-bottom: 0;
  }

  .approval-row-main {
    justify-content: space-between;
    min-width: 0;
  }

  .approval-record-link {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
    text-decoration: none;
  }

  .approval-record-link strong,
  .approval-record-link small,
  .approval-record-link span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .approval-record-link span {
    color: var(--accent, #4f4e48);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .approval-row-status {
    flex: 0 0 auto;
  }

  .approval-row-actions {
    align-items: start;
    flex-wrap: wrap;
  }

  .approval-row-actions form,
  .finance-review-form {
    align-items: end;
    flex-wrap: wrap;
  }

  .approval-row-actions button,
  .finance-review-form button,
  .approval-tabs button,
  .approval-filters button,
  .approval-action-menu summary {
    cursor: pointer;
    min-height: 44px;
  }

  .approval-action-menu {
    position: relative;
  }

  .approval-action-menu summary {
    align-items: center;
    border: 1px solid var(--border, #d2d1ce);
    border-radius: 0.4rem;
    display: inline-flex;
    list-style: none;
    padding: 0.55rem 0.7rem;
  }

  .approval-action-menu summary::-webkit-details-marker {
    display: none;
  }

  .approval-action-menu[open] summary {
    border-color: var(--accent, #4f4e48);
  }

  .approval-action-menu > form {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #d2d1ce);
    border-radius: 0.5rem;
    box-shadow: 0 10px 28px rgb(19 34 52 / 14%);
    display: grid;
    gap: 0.65rem;
    margin-top: 0.4rem;
    min-width: min(21rem, 84vw);
    padding: 0.8rem;
  }

  .approval-read-only {
    color: var(--muted, #6b6a62);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .approval-empty {
    color: var(--muted, #6b6a62);
    display: grid;
    gap: 0.3rem;
    padding: 1.5rem 0;
    text-align: center;
  }

  .approval-finance-note {
    margin: 0 0 0.5rem;
  }

  .approval-purpose {
    color: var(--muted, #6b6a62);
    margin: 0 0 1rem;
  }

  .approval-register-search {
    display: grid;
    gap: 0.3rem;
    max-width: 30rem;
    margin-bottom: 0.75rem;
  }

  .approval-register-search span {
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .approval-register-search input {
    border: 1px solid var(--border, #d2d1ce);
    border-radius: 0.4rem;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .operational-pagination {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .operational-pagination span {
    color: var(--muted, #6b6a62);
    font-size: 0.85rem;
  }

  .approval-filters button:focus-visible,
  .approval-tabs button:focus-visible,
  .approval-row button:focus-visible,
  .approval-action-menu summary:focus-visible,
  .approval-record-link:focus-visible,
  .approval-filters input:focus-visible,
  .approval-filters select:focus-visible,
  .approval-row input:focus-visible,
  .approval-row select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent, #4f4e48) 38%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    .approval-attention {
      grid-template-columns: 1fr;
    }

    .approval-context,
    .approval-row-main,
    .approval-filters {
      align-items: stretch;
      flex-direction: column;
    }

    .approval-count {
      align-self: flex-start;
    }

    .approval-filters label,
    .approval-filters label:not(:first-of-type) {
      flex: 1 1 auto;
      width: 100%;
    }

    .approval-filters button {
      width: 100%;
    }

    .operational-pagination {
      justify-content: stretch;
    }

    .operational-pagination button {
      flex: 1 1 7rem;
    }

    .operational-pagination span {
      order: -1;
      text-align: center;
      width: 100%;
    }

    .approval-row-actions,
    .approval-row-actions form,
    .finance-review-form {
      align-items: stretch;
      flex-direction: column;
      width: 100%;
    }

    .approval-row-actions > form,
    .approval-row-actions > form button,
    .finance-review-form button,
    .finance-review-form label,
    .approval-action-menu,
    .approval-action-menu summary {
      width: 100%;
    }

    .approval-action-menu > form {
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .approval-page,
    .approval-page * {
      scroll-behavior: auto;
      transition-duration: 0.01ms;
    }
  }
</style>
