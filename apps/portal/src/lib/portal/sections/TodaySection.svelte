<script lang="ts">
  import DirectionIcon from '../ui/DirectionIcon.svelte';
  import { onMount } from 'svelte';
  import { portalText } from '../../portal-i18n';
  import { clockHoursFromMinutes } from '../minute-hours';
  import { planningAgenda, planningInterval, type AgendaAssignment } from '../planning-agenda';
  import OwnerFinanceDashboard from './OwnerFinanceDashboard.svelte';
  import { homeText, type HomeCopyKey } from './home-copy';
  import type { CurrencyTotal } from '../home-inbox';
  import type { PortalData, PortalRow } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

  let {
    base,
    locale = 'en',
    data,
    availableProjects,
    online,
    queue,
    syncMessage,
    money,
    translate,
    controlledValue,
    canCreateProject = false,
    canCreateInvoiceDraft = false,
    invoiceDraftHref = null,
    canViewPendingReports = false,
  }: {
    base: string;
    locale?: 'en' | 'es' | 'pt';
    data: Pick<
      PortalData,
      'dashboard' | 'records' | 'ownerFinance' | 'locale' | 'homeInbox' | 'workerWeek'
    >;
    availableProjects: PortalRow[];
    online: boolean;
    queue: number;
    syncMessage: string;
    money: (minor: string | number | null | undefined, currency?: string) => string;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    canCreateProject?: boolean;
    canCreateInvoiceDraft?: boolean;
    invoiceDraftHref?: string | null;
    canViewPendingReports?: boolean;
  } = $props();

  const activeProjects = $derived(
    availableProjects.filter((project) => project.status === 'active'),
  );

  const formatPlanningMinutes = (value: unknown): string | null => {
    if (value == null || value === '') return null;
    const hours = clockHoursFromMinutes(value);
    return hours === '—' ? null : `${hours} h`;
  };

  let agendaDate = $state(new Date());
  let upcomingLimit = $state(5);
  const agenda = $derived(planningAgenda(data.records ?? [], agendaDate));
  const upcomingShown = $derived(agenda.upcoming.slice(0, upcomingLimit));
  const dateLocale = $derived(locale === 'pt' ? 'pt-BR' : locale);
  const projectHref = (row: PortalRow): string | null => {
    const projectId = String(row.project_id ?? '');
    return projectId && availableProjects.some((project) => String(project.id) === projectId)
      ? `${base}/app/projects/${encodeURIComponent(projectId)}?lang=${locale}`
      : null;
  };
  const h = (key: HomeCopyKey, params?: Record<string, string | number>) =>
    homeText(locale, key, params);
  const plural = (count: number, one: HomeCopyKey, many: HomeCopyKey) =>
    count === 1 ? h(one) : h(many, { count });
  const totalsText = (totals: readonly CurrencyTotal[] | undefined): string =>
    (totals ?? []).map((total) => money(total.minor, total.currency)).join(' · ');
  const hoursText = (minutes: number) => `${clockHoursFromMinutes(minutes)} h`;
  const link = (path: string, params: Record<string, string> = {}) => {
    const target = new URL(`${base}/app/${path}`, 'https://portal.invalid');
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    target.searchParams.set('lang', locale);
    return `${target.pathname}${target.search}`;
  };

  type InboxRow = {
    id: string;
    label: string;
    value: string;
    detail: string;
    action: string;
    href: string;
    active: boolean;
    tone?: 'danger';
    items?: Array<{ id: string; label: string; value: string; note?: string; href: string }>;
    moreCount?: number;
    moreHref?: string;
    moreLabel?: string;
  };
  const inbox = $derived(data.homeInbox);
  const overdueTotals = $derived(
    (data.ownerFinance?.currencies ?? [])
      .filter((item) => BigInt(item.overdue) > 0n)
      .map((item) => ({ currency: item.currency, minor: item.overdue })),
  );
  const draftCount = $derived(Number(data.dashboard?.upcomingInvoices ?? 0));
  const inboxRows = $derived.by((): InboxRow[] => {
    if (!inbox) return [];
    const approvals = inbox.approvals;
    const rows: InboxRow[] = [
      {
        id: 'hours',
        label: h('hoursToApprove'),
        value: approvals.time.count ? hoursText(approvals.time.minutes) : '0',
        detail: approvals.time.count
          ? plural(approvals.time.count, 'entry', 'entries')
          : h('nothing'),
        action: h('reviewHours'),
        href: link('approvals', { tab: 'time' }),
        active: approvals.time.count > 0,
      },
      {
        id: 'expenses',
        label: h('expensesToApprove'),
        // Project managers never receive expense amounts; they see the count only.
        value: approvals.expenses.count
          ? totalsText(approvals.expenses.totals) || String(approvals.expenses.count)
          : '0',
        detail: !approvals.expenses.count
          ? h('nothing')
          : approvals.expenses.totals.length
            ? plural(approvals.expenses.count, 'expense', 'expenses')
            : '',
        action: h('reviewExpenses'),
        href: link('approvals', { tab: 'expenses' }),
        active: approvals.expenses.count > 0,
      },
    ];
    if (inbox.readyToInvoice) {
      const ready = inbox.readyToInvoice;
      const expensesNote = (expenses: { count: number; totals: readonly CurrencyTotal[] } | undefined) =>
        expenses && expenses.count > 0
          ? h(expenses.count === 1 ? 'approvedExpenseNote' : 'approvedExpensesNote', {
              count: expenses.count,
              amount: totalsText(expenses.totals),
            })
          : '';
      const pendingNote = (minutes: number | undefined) =>
        minutes ? h('pendingToApprove', { hours: clockHoursFromMinutes(minutes) }) : '';
      const unpricedNote = (minutes: number | undefined) =>
        minutes ? h('approvedHours', { hours: clockHoursFromMinutes(minutes) }) : '';
      // Headline: money ready, else approved hours without a rate, else hours to approve, else expenses.
      const headline =
        totalsText(ready.totals) ||
        unpricedNote(ready.unpricedMinutes) ||
        pendingNote(ready.pendingMinutes) ||
        expensesNote(ready.approvedExpenses) ||
        '—';
      rows.push({
        id: 'ready',
        label: h('readyToInvoice'),
        value: ready.projects ? headline : '—',
        detail: ready.projects
          ? [
              plural(ready.projects, 'project', 'projects'),
              ...[
                unpricedNote(ready.unpricedMinutes),
                pendingNote(ready.pendingMinutes),
                expensesNote(ready.approvedExpenses),
              ].filter((part) => part && part !== headline),
              ready.unpricedMinutes ? h('rateMissingSetIt') : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : h('noReady'),
        action: h('createInvoice'),
        href:
          ready.topProjectId && canCreateInvoiceDraft
            ? link('billing', { project: ready.topProjectId, assistantSurface: 'invoice-create' })
            : (invoiceDraftHref ?? link('billing')),
        active: ready.projects > 0,
        // Several projects: one "Create invoice" per project, straight from Home.
        // The rest are one click away on Money, sorted by money waiting.
        moreCount: canCreateInvoiceDraft ? Math.max(0, ready.items.length - 6) : 0,
        moreHref: link('finance', { view: 'overview' }),
        moreLabel: h('viewAllProjects', { count: ready.items.length }),
        items:
          canCreateInvoiceDraft && ready.items.length > 0
            ? ready.items.slice(0, 6).map((item) => {
                const priced = BigInt(item.minor) > 0n;
                const unpriced = item.rateMissing ? unpricedNote(item.approvedMinutes) : '';
                const value = priced
                  ? money(item.minor, item.currency)
                  : unpriced || pendingNote(item.pendingMinutes) || expensesNote(item.approvedExpenses);
                return {
                  id: item.projectId,
                  label: item.label,
                  value,
                  note:
                    [
                      item.draftMinor ? h('inDraft', { amount: money(item.draftMinor, item.currency) }) : '',
                      unpriced && unpriced !== value ? unpriced : '',
                      item.rateMissing ? h('rateMissingSetIt') : '',
                      pendingNote(item.pendingMinutes) !== value ? pendingNote(item.pendingMinutes) : '',
                      item.unsentMinutes
                        ? h('notSentYet', { hours: clockHoursFromMinutes(item.unsentMinutes) })
                        : '',
                      expensesNote(item.approvedExpenses) !== value ? expensesNote(item.approvedExpenses) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined,
                  href: link('billing', {
                    project: item.projectId,
                    assistantSurface: 'invoice-create',
                    // Only approved expenses waiting: open New invoice on its Expenses side.
                    ...(!priced && !unpriced && !item.pendingMinutes && item.approvedExpenses?.count
                      ? { tab: 'expenses' }
                      : {}),
                  }),
                };
              })
            : undefined,
      });
    }
    if (data.ownerFinance) {
      rows.push({
        id: 'overdue',
        label: h('overdueInvoices'),
        value: overdueTotals.length ? totalsText(overdueTotals) : '—',
        detail: overdueTotals.length ? '' : h('noOverdue'),
        action: h('seeOverdue'),
        href: link('billing', { stage: 'overdue' }),
        active: overdueTotals.length > 0,
        tone: 'danger',
      });
    }
    if (approvals.reports > 0)
      rows.push({
        id: 'reports',
        label: h('reportsToApprove'),
        value: String(approvals.reports),
        detail: '',
        action: h('reviewReports'),
        href: link('approvals', { tab: 'reports' }),
        active: true,
      });
    if (data.ownerFinance && draftCount > 0)
      rows.push({
        id: 'drafts',
        label: h('draftsToIssue'),
        value: totalsText(data.dashboard?.upcomingInvoiceTotalsByCurrency) || String(draftCount),
        detail: plural(draftCount, 'draft', 'drafts'),
        action: h('seeDrafts'),
        href: link('billing', { stage: 'drafts' }),
        active: true,
      });
    // What needs the owner comes first; finished rows sink to the bottom.
    return [...rows.filter((row) => row.active), ...rows.filter((row) => !row.active)];
  });
  // One combined bulk action for the weekly routine (confirmation happens on Approvals).
  const approveAll = $derived.by(() => {
    const approvals = inbox?.approvals;
    if (!approvals || approvals.time.count + approvals.expenses.count === 0) return null;
    const parts = [
      approvals.time.count ? hoursText(approvals.time.minutes) : '',
      approvals.expenses.count
        ? [
            plural(approvals.expenses.count, 'expense', 'expenses'),
            totalsText(approvals.expenses.totals),
          ]
            .filter(Boolean)
            .join(' ')
        : '',
    ].filter(Boolean);
    return { detail: parts.join(' · '), href: link('approvals', { approveAll: '1' }) };
  });
  const glance = $derived(new Map((inbox?.projects ?? []).map((item) => [item.projectId, item])));
  // Top 5 projects that need something (approvals, money ready, alerts), then "View all".
  const BOARD_LIMIT = 5;
  const boardProjects = $derived.by(() => {
    const score = (project: PortalRow): [number, bigint, number] => {
      const item = glance.get(String(project.id));
      if (!item) return [0, 0n, 0];
      return [
        item.pendingApprovals + (item.missingRate ? 1 : 0) + (item.missingPo ? 1 : 0),
        BigInt(item.readyMinor || '0'),
        item.weekMinutes,
      ];
    };
    return activeProjects
      .map((project) => ({ project, score: score(project) }))
      .sort(
        (a, b) =>
          b.score[0] - a.score[0] ||
          (a.score[1] === b.score[1] ? 0 : a.score[1] < b.score[1] ? 1 : -1) ||
          b.score[2] - a.score[2],
      )
      .slice(0, BOARD_LIMIT)
      .map(({ project }) => project);
  });
  const inboxClear = $derived(inboxRows.length > 0 && inboxRows.every((row) => !row.active));

  // Worker week
  const week = $derived(data.workerWeek);
  const weekRange = $derived.by(() => {
    if (!week) return '';
    const format = new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return `${format.format(new Date(`${week.weekStart}T00:00:00Z`))} – ${format.format(new Date(`${week.weekEnd}T00:00:00Z`))}`;
  });
  const weekMinutes = $derived(
    week ? week.time.draft + week.time.submitted + week.time.approved + week.time.needsChanges : 0,
  );
  const weekExpenseCount = $derived(
    week
      ? week.expenses.draft +
          week.expenses.submitted +
          week.expenses.approved +
          week.expenses.needsChanges
      : 0,
  );
  type StateChip = { key: string; text: string; tone: string };
  const timeChips = $derived.by((): StateChip[] => {
    if (!week) return [];
    const chips: StateChip[] = [];
    const add = (value: number, key: HomeCopyKey, tone: string) => {
      if (value > 0) chips.push({ key, text: h(key, { value: hoursText(value) }), tone });
    };
    add(week.time.needsChanges, 'stateNeedsChanges', 'warn');
    add(week.time.draft, 'stateDraft', 'draft');
    add(week.time.submitted, 'stateSubmitted', 'info');
    add(week.time.approved, 'stateApproved', 'ok');
    return chips;
  });
  const expenseChips = $derived.by((): StateChip[] => {
    if (!week) return [];
    const chips: StateChip[] = [];
    const add = (value: number, key: HomeCopyKey, tone: string) => {
      if (value > 0) chips.push({ key, text: h(key, { value }), tone });
    };
    add(week.expenses.needsChanges, 'stateNeedsChanges', 'warn');
    add(week.expenses.draft, 'stateDraft', 'draft');
    add(week.expenses.submitted, 'stateSubmitted', 'info');
    add(week.expenses.approved, 'stateApproved', 'ok');
    return chips;
  });

  onMount(() => {
    // A workspace left open overnight must not keep yesterday labelled Today.
    agendaDate = new Date();
    const timer = window.setInterval(() => {
      agendaDate = new Date();
    }, 60_000);
    return () => window.clearInterval(timer);
  });
</script>

{#if data.dashboard}
  <section id="dashboard-overview" class="home-inbox" aria-labelledby="home-inbox-title">
    <h2 id="home-inbox-title">{h('inboxTitle')}</h2>
    {#if inboxClear}<p class="home-inbox-clear">{h('inboxAllClear')}</p>{/if}
    {#if approveAll}
      <a class="home-approve-all" href={approveAll.href} data-home-approve-all>
        <span class="home-approve-all-label">{h('approveAll')} <DirectionIcon /></span>
        <span class="home-approve-all-detail">{approveAll.detail}</span>
      </a>
    {/if}
    <ul class="home-inbox-list">
      {#each inboxRows as row (row.id)}
        <li
          class="home-inbox-row"
          class:home-inbox-row--quiet={!row.active}
          class:home-inbox-row--danger={row.active && row.tone === 'danger'}
          data-home-inbox={row.id}
        >
          <div class="home-inbox-copy">
            <span class="home-inbox-label">{row.label}</span>
            <strong class="home-inbox-value">{row.value}</strong>
            {#if row.detail}<span class="home-inbox-detail">{row.detail}</span>{/if}
          </div>
          {#if !row.items}
            <a
              class="home-inbox-action"
              class:home-inbox-action--primary={row.active}
              href={row.href}
              aria-label={`${row.action} · ${row.label}`}
              ><span class="home-inbox-action-label">{row.action}</span> <DirectionIcon /></a
            >
          {:else}
            <ul class="home-inbox-items">
              {#each row.items as item (item.id)}
                <li>
                  <span class="home-inbox-item-label"
                    >{item.label}{#if item.note}<small class="home-inbox-item-note"
                        >{item.note}</small
                      >{/if}</span
                  >
                  <strong>{item.value}</strong>
                  <a
                    class="home-inbox-action home-inbox-action--primary"
                    href={item.href}
                    data-home-invoice-project={item.id}
                    aria-label={`${row.action} · ${item.label}`}
                    ><span class="home-inbox-action-label">{row.action}</span>
                    <DirectionIcon /></a
                  >
                </li>
              {/each}
            </ul>
            {#if row.moreCount}
              <a class="home-inbox-more" href={row.moreHref} data-home-ready-more
                >{row.moreLabel} <DirectionIcon /></a
              >
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if data.ownerFinance}
  <OwnerFinanceDashboard summary={data.ownerFinance} {locale} {base} />
{/if}

{#if data.dashboard}
  <section id="dashboard-project-board" class="record-list dashboard-projects">
    <div class="panel-title">
      <h2>{h('activeProjects')}</h2>
      <span>{plural(activeProjects.length, 'project', 'projects')}</span>
    </div>
    {#each boardProjects as project}<a
        class="project-board-row"
        href={`${base}/app/projects/${project.id}`}
        data-home-project={project.id}
        ><span><b>{project.project_number}</b><strong>{project.name}</strong></span
        >{#if glance.get(String(project.id))}{@const item = glance.get(String(project.id))!}<span
            class="project-glance"
            ><small
              >{item.weekMinutes > 0
                ? h('weekHours', { hours: clockHoursFromMinutes(item.weekMinutes) })
                : h('noHoursWeek')}</small
            >{#if BigInt(item.readyMinor) > 0n}<small class="project-glance-ready"
                >{h('readyAmount', { amount: money(item.readyMinor, item.currency) })}</small
              >{/if}{#if BigInt(item.draftMinor) > 0n}<small
                >{h('inDraft', { amount: money(item.draftMinor, item.currency) })}</small
              >{/if}{#if item.pendingApprovals > 0}<small class="project-glance-warn"
                >{h('pendingCount', { count: item.pendingApprovals })}</small
              >{/if}{#if item.missingRate}<small class="project-glance-alert"
                >{h('missingRate')}</small
              >{/if}{#if item.missingPo}<small class="project-glance-warn">{h('missingPo')}</small
              >{/if}</span
          >{:else}<small>{controlledValue('status', project.status)} · {project.timezone}</small
          >{/if}<i>{h('openProject')}</i></a
      >{/each}
    {#if activeProjects.length > boardProjects.length}
      <a class="project-board-all" href={link('projects')} data-home-projects-all
        >{h('viewAllProjects', { count: activeProjects.length })} <DirectionIcon /></a
      >
    {/if}
  </section>
{:else}
  <div class="worker-agenda" data-worker-agenda>
    <section class="worker-home" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading" class="worker-home-heading">
        {week ? h('thisWeek', { range: weekRange }) : h('workerTitle')}
      </h2>
      <div class="worker-home-actions">
        <a
          class="worker-home-card worker-home-card--primary"
          href={link('time', { focus: 'hours' })}
          data-home-log-hours
        >
          <span class="worker-home-action">{h('logHours')} <DirectionIcon /></span>
          <span class="worker-home-status">
            <strong
              >{weekMinutes > 0
                ? h('hoursThisWeek', { hours: clockHoursFromMinutes(weekMinutes) })
                : h('noHoursYet')}</strong
            >
            {#each timeChips as chip (chip.key)}<span class="worker-chip" data-tone={chip.tone}
                >{chip.text}</span
              >{/each}
          </span>
        </a>
        <a class="worker-home-card" href={link('expenses', { action: 'record' })} data-home-add-expense>
          <span class="worker-home-action">{h('addExpense')} <DirectionIcon /></span>
          <span class="worker-home-status">
            <strong
              >{weekExpenseCount > 0
                ? [
                    plural(weekExpenseCount, 'expense', 'expenses'),
                    totalsText(week?.expenses.totals),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : h('noExpensesYet')}</strong
            >
            {#each expenseChips as chip (chip.key)}<span class="worker-chip" data-tone={chip.tone}
                >{chip.text}</span
              >{/each}
          </span>
        </a>
      </div>
      <a class="worker-home-report" href={link('reports', { action: 'daily' })} data-home-report>{h('writeReport')} <DirectionIcon /></a>
    </section>

    {#if !online || queue > 0}
      <div class="agenda-device" class:agenda-offline={!online} role="status">
        <span class="agenda-connection-dot" aria-hidden="true"></span>
        <strong>{online ? translate('Connected to J&A') : h('offline')}</strong>
        {#if queue > 0}<span
            >{queue === 1 ? h('pendingSyncOne') : h('pendingSync', { count: queue })}</span
          >{/if}
        {#if syncMessage}<small>{translate(syncMessage)}</small>{/if}
      </div>
    {/if}

    <section
      class="agenda-section"
      aria-labelledby="today-assignments-heading"
      data-today-assignments
    >
      <div class="agenda-section-heading">
        <h2 id="today-assignments-heading">{translate('Today')}</h2>
      </div>
      {#each agenda.today as assignment}
        {@render assignmentCard(assignment)}
      {:else}
        <div class="agenda-empty">
          <h3>{translate('No published assignment for today.')}</h3>
          <p>{translate('You can still record actual work for your assigned projects.')}</p>
          {#if availableProjects.length}
            <details class="agenda-projects">
              <summary
                >{translate('Your assigned projects')}
                <span>({availableProjects.length})</span></summary
              >
              <ul>
                {#each availableProjects as project}
                  <li>
                    <a
                      href={`${base}/app/projects/${encodeURIComponent(String(project.id))}?lang=${locale}`}
                    >
                      <span>{project.project_number}</span>
                      {project.name}
                    </a>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      {/each}
    </section>

    <section
      class="agenda-section"
      aria-labelledby="upcoming-assignments-heading"
      data-upcoming-assignments
    >
      <div class="agenda-section-heading">
        <h2 id="upcoming-assignments-heading">{translate('Upcoming assignments')}</h2>
        <span aria-live="polite"
          >{portalText(locale, 'Showing {shown} of {total}', {
            shown: upcomingShown.length,
            total: agenda.upcoming.length,
          })}</span
        >
      </div>
      <p class="agenda-scope">{translate('Published assignments after today, in date order.')}</p>
      {#each upcomingShown as assignment}
        {@render assignmentCard(assignment)}
      {:else}
        <p class="agenda-empty">{translate('No upcoming assignments published.')}</p>
      {/each}
      {#if upcomingShown.length < agenda.upcoming.length}
        <button type="button" class="agenda-show-more" onclick={() => (upcomingLimit += 5)}>
          {translate('Show more assignments')}
        </button>
      {/if}
    </section>
    {#if agenda.invalidCount}
      <p class="agenda-date-warning" role="status">
        {translate('Some assignments have incomplete dates. Ask your coordinator to review them.')}
      </p>
    {/if}
  </div>
{/if}

{#snippet assignmentCard(assignment: AgendaAssignment)}
  {@const row = assignment.row}
  {@const target = projectHref(row)}
  {@const planned = formatPlanningMinutes(row.planned_minutes)}
  <article class="agenda-assignment" data-agenda-assignment={row.id}>
    <div class="agenda-assignment-content">
      <p class="agenda-interval">{planningInterval(assignment, dateLocale)}</p>
      {#if row.project_number}<span class="agenda-project-number">{row.project_number}</span>{/if}
      <h3>{row.project_name ?? translate('Field workspace')}</h3>
      {#if row.site}<p class="agenda-site">{row.site}</p>{/if}
      {#if planned}<p class="agenda-planned">{translate('Planned')}: {planned}</p>{/if}
    </div>
    {#if target}<a class="agenda-project-link" href={target}
        >{translate('Open project')} <DirectionIcon /></a
      >{/if}
  </article>
{/snippet}

<style>
  .home-inbox {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 2rem;
  }
  .home-inbox h2 {
    margin: 0;
    font-size: 1.125rem;
  }
  .home-approve-all {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    min-height: 52px;
    padding: 0.85rem 1.25rem;
    border-radius: 0.875rem;
    color: #fff;
    background: var(--ja-red, #b42318);
    text-decoration: none;
  }
  .home-approve-all:focus-visible {
    outline: 3px solid var(--ja-border-focus);
    outline-offset: 3px;
  }
  .home-approve-all-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.0625rem;
    font-weight: 700;
  }
  .home-approve-all-detail {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    opacity: 0.92;
  }
  .home-inbox-item-note {
    display: block;
    color: var(--ja-text-secondary);
    font-size: 0.8125rem;
  }
  .project-board-all {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    padding: 0.5rem 0.25rem;
    font-weight: 600;
  }
  .project-glance {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 0;
  }
  @media (max-width: 767px) {
    .project-glance {
      grid-column: 1 / -1;
    }
  }
  .project-glance small {
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--ja-canvas, #f3f3ef);
    color: var(--ja-text-primary);
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  .project-glance .project-glance-ready {
    background: #e6f4ea;
    color: #14532d;
    font-weight: 600;
  }
  .project-glance .project-glance-warn {
    background: #fff4e5;
    color: #7a4100;
  }
  .project-glance .project-glance-alert {
    background: #fde8e8;
    color: #8a1c1c;
    font-weight: 600;
  }
  .home-inbox-clear {
    margin: 0;
    color: var(--ja-text-secondary);
  }
  .home-inbox-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--ja-border-strong);
    border-radius: 0.875rem;
    background: var(--ja-surface);
    overflow: hidden;
  }
  .home-inbox-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 1rem 1.25rem;
    border-left: 4px solid var(--ja-ink, #24251f);
  }
  .home-inbox-more {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    margin-top: 0.5rem;
    font-weight: 600;
    min-height: 44px;
  }
  .home-inbox-row + .home-inbox-row {
    border-top: 1px solid var(--ja-border-subdued);
  }
  .home-inbox-row--quiet {
    border-left-color: transparent;
  }
  .home-inbox-row--danger {
    border-left-color: var(--ja-red, #b42318);
  }
  .home-inbox-copy {
    display: grid;
    grid-template-columns: minmax(10rem, 14rem) auto;
    align-items: baseline;
    gap: 0.15rem 1.25rem;
    min-width: 0;
  }
  .home-inbox-label {
    font-weight: 650;
    color: var(--ja-text-primary);
  }
  .home-inbox-value {
    font-size: 1.375rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .home-inbox-detail {
    grid-column: 2;
    color: var(--ja-text-secondary);
    font-size: 0.875rem;
  }
  .home-inbox-row--quiet .home-inbox-value,
  .home-inbox-row--quiet .home-inbox-label {
    color: var(--ja-text-secondary);
    font-weight: 500;
  }
  .home-inbox-row--quiet .home-inbox-value {
    font-size: 1.125rem;
  }
  .home-inbox-row:has(.home-inbox-items) {
    flex-wrap: wrap;
  }
  .home-inbox-items {
    display: grid;
    gap: 0.5rem;
    flex: 1 1 100%;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
  }
  .home-inbox-items li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--ja-border-subdued);
  }
  .home-inbox-item-label {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.9375rem;
  }
  .home-inbox-items strong {
    font-variant-numeric: tabular-nums;
  }
  /* Phone: the project name gets the full width; amount and action share the next line. */
  @media (max-width: 560px) {
    .home-inbox-items li {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .home-inbox-items li .home-inbox-item-label {
      grid-column: 1 / -1;
    }
  }
  .home-inbox-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    min-height: 44px;
    padding: 0.6rem 1rem;
    border: 1px solid var(--ja-control-border);
    border-radius: 0.6rem;
    color: var(--ja-text-primary);
    background: var(--ja-surface);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .home-inbox-action--primary {
    color: #fff;
    background: var(--ja-ink, #24251f);
    border-color: var(--ja-ink, #24251f);
  }
  .home-inbox-action:focus-visible,
  .worker-home a:focus-visible {
    outline: 3px solid var(--ja-border-focus);
    outline-offset: 3px;
  }
  .worker-home {
    display: grid;
    gap: 1rem;
  }
  .worker-home-heading {
    margin: 0;
    font-size: 1.125rem;
  }
  .worker-home-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: 0.75rem;
  }
  .worker-home-card {
    display: grid;
    gap: 0.6rem;
    min-height: 7rem;
    padding: 1.1rem 1.25rem;
    border: 1px solid var(--ja-border-strong);
    border-radius: 0.875rem;
    color: var(--ja-text-primary);
    background: var(--ja-surface);
    text-decoration: none;
  }
  .worker-home-card--primary {
    color: #fff;
    background: var(--ja-ink, #24251f);
    border-color: var(--ja-ink, #24251f);
  }
  .worker-home-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 700;
  }
  .worker-home-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
  }
  .worker-home-status strong {
    flex-basis: 100%;
    font-weight: 600;
  }
  .worker-chip {
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--ja-canvas, #f3f3ef);
    color: var(--ja-text-primary);
    font-size: 0.8125rem;
  }
  .worker-home-card--primary .worker-chip {
    background: rgb(255 255 255 / 0.16);
    color: #fff;
  }
  .worker-chip[data-tone='warn'] {
    background: #fdecc8;
    color: #6b3d00;
  }
  .worker-home-report {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 3.25rem;
    padding: 0 1.25rem;
    border: 1px solid var(--ja-border-strong);
    border-radius: 0.875rem;
    background: var(--ja-surface);
    color: var(--ja-text-primary);
    font-weight: 700;
    font-size: 1.05rem;
    text-decoration: none;
  }
  @media (max-width: 720px) {
    .home-inbox-row {
      padding: 0.8rem 0.9rem;
    }
    .home-inbox-copy {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
    .home-inbox-detail {
      grid-column: 1;
    }
    .home-inbox-value {
      font-size: 1.2rem;
    }
    /* On phones the whole action is a 48px arrow; its name stays in aria-label. */
    .home-inbox-action {
      justify-content: center;
      width: 48px;
      min-height: 48px;
      padding: 0;
    }
    .home-inbox-action-label {
      display: none;
    }
  }
  .worker-agenda {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
  }
  .agenda-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .agenda-scope,
  .agenda-site,
  .agenda-planned {
    color: var(--ja-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .agenda-device {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-border-subdued);
    border-radius: 0.65rem;
    color: var(--ja-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .agenda-device strong {
    font-size: inherit;
    font-weight: 600;
    color: var(--ja-text-primary);
  }
  .agenda-device small {
    flex-basis: 100%;
    font-size: inherit;
  }
  .agenda-connection-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #0f766e;
    flex-shrink: 0;
  }
  .agenda-offline .agenda-connection-dot {
    background: #92400e;
  }
  .agenda-section {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  .agenda-section-heading h2 {
    margin: 0;
    font-size: 1.125rem;
  }
  .agenda-section-heading > span {
    color: var(--ja-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .agenda-scope {
    margin: -0.25rem 0 0;
  }
  .agenda-assignment {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem;
    min-width: 0;
    border: 1px solid var(--ja-border-strong);
    border-radius: 0.75rem;
    background: var(--ja-surface);
  }
  .agenda-assignment-content {
    min-width: 0;
  }
  .agenda-interval {
    margin: 0 0 0.75rem;
    color: var(--ja-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.6;
    font-variant-numeric: tabular-nums;
  }
  .agenda-project-number {
    display: block;
    font-size: 0.75rem;
    color: var(--ja-text-secondary);
    line-height: 1.5;
  }
  .agenda-assignment h3 {
    margin: 0.25rem 0;
    font-size: 1rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .agenda-site,
  .agenda-planned {
    margin: 0.25rem 0 0;
    overflow-wrap: anywhere;
  }
  .agenda-project-link,
  .agenda-show-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 44px;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--ja-control-border);
    border-radius: 0.5rem;
    color: var(--ja-text-primary);
    background: var(--ja-surface);
    text-decoration: none;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    flex-shrink: 0;
    box-shadow: none;
  }
  .agenda-show-more {
    justify-self: start;
    cursor: pointer;
  }
  .agenda-empty {
    margin: 0;
    padding: 1.25rem;
    border: 1px dashed var(--ja-control-border);
    border-radius: 0.75rem;
    color: var(--ja-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .agenda-empty h3 {
    font-size: 1rem;
    margin: 0;
    color: var(--ja-text-primary);
  }
  .agenda-empty p {
    margin: 0.5rem 0;
  }
  .agenda-projects {
    margin-top: 0.75rem;
  }
  .agenda-projects summary {
    min-height: 44px;
    padding-block: 0.625rem;
    cursor: pointer;
    color: var(--ja-text-primary);
    font-weight: 600;
  }
  .agenda-projects ul {
    display: grid;
    gap: 0.25rem;
    padding: 0;
    list-style: none;
  }
  .agenda-projects a {
    display: block;
    min-height: 44px;
    padding: 0.5rem;
    color: var(--ja-text-primary);
    overflow-wrap: anywhere;
  }
  .agenda-projects a span {
    font-weight: 600;
  }
  .agenda-date-warning {
    padding: 0.75rem 1rem;
    color: var(--ja-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .worker-agenda :is(a, button, summary):focus-visible {
    outline: 3px solid var(--ja-border-focus);
    outline-offset: 3px;
  }
  @media (max-width: 600px) {
    .agenda-assignment {
      flex-direction: column;
      align-items: stretch;
      padding: 1rem;
    }
    .agenda-project-link {
      align-self: start;
    }
    .agenda-device > span:not(.agenda-connection-dot) {
      flex-basis: 100%;
    }
  }
  @media print {
    .worker-home-actions,
    .agenda-device,
    .agenda-show-more {
      display: none;
    }
  }
</style>
