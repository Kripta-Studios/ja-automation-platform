<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import {
    cacheAssignments,
    getOfflineAssignments,
    purgeUserCache,
    queueMutation,
    queuedCount,
    syncQueuedMutations,
    type OfflineAttachment,
  } from './offline';

  type Row = Record<string, string | number | boolean | null>;
  type PortalData = {
    user: { id?: string; name: string; email: string; role?: string };
    section: string;
    projects?: Row[];
    clients?: Row[];
    contacts?: Row[];
    workers?: Row[];
    skills?: Row[];
    availability?: Row[];
    records?: Row[];
    milestones?: Row[];
    documents?: Row[];
    technicalChanges?: Row[];
    periodReports?: Row[];
    billingRules?: Row[];
    invoices?: Row[];
    settlements?: Row[];
    reimbursements?: Row[];
    ledger?: Array<Record<string, unknown>>;
    packs?: Array<Record<string, unknown>>;
    audit?: Row[];
    legalEntities?: Row[];
    taxProfiles?: Row[];
    selectedProjectId?: string;
    periodStart?: string;
    periodEnd?: string;
    searchQuery?: string;
    searchResults?: Row[];
    pay?: {
      currency: string;
      projectIds?: string[];
      approvedMinutes: number;
      pendingMinutes: number;
      estimatedApprovedMinor: string;
      estimatedPendingMinor: string;
      approvedReimbursementMinor: string;
      pendingReimbursementMinor: string;
      guaranteedMinutes?: number;
      percentageBased?: boolean;
      settlementTriggers?: string[];
      missingCompensationRules?: number;
      label?: string;
      projectProgress?: Array<Record<string, unknown>>;
    };
    finance?: {
      currency: string;
      approvedCostMinor: string;
      revenueCandidateMinor: string;
      contributionMarginMinor: string;
      invoicedMinor: string;
      paidMinor: string;
      receivableMinor: string;
      laborRevenueMinor?: string;
      expenseRevenueMinor?: string;
      directLaborCostMinor?: string;
      travelCostMinor?: string;
      otherDirectCostMinor?: string;
      approvedUnbilledWipMinor?: string;
      unapprovedWipMinor?: string;
      milestoneRevenueMinor?: string;
      budgetMinor?: string | null;
      plannedMinutes?: number | null;
      plannedRemainingMinutes?: number | null;
      estimateToCompleteMinor?: string | null;
      estimateAtCompletionCostMinor?: string | null;
      expectedFinalMarginMinor?: string | null;
      hoursConsumedBps?: string | null;
      travelBudgetConsumedBps?: string | null;
      travelBudgetMinor?: string | null;
      forecastAvailable?: boolean;
      alerts?: string[];
      contributionMarginBps?: string;
      timeEconomics?: Array<Record<string, unknown>>;
      expenseEconomics?: Array<Record<string, unknown>>;
    } | null;
    portfolio?: {
      projects?: Array<Record<string, unknown>>;
      byClient?: Array<Record<string, unknown>>;
      byWorker?: Array<Record<string, unknown>>;
      byMonth?: Array<Record<string, unknown>>;
      byWeek?: Array<Record<string, unknown>>;
    };
    workers?: Row[];
    dashboard?: {
      activeProjects: number;
      actualMinutes: number;
      pendingReports: number;
      expenseMinor: string;
      upcomingInvoices: number;
      upcomingInvoiceMinor: string;
      currency: string;
    };
  };
  type ActionResult = { success?: boolean; message?: string } | null;

  let { data, form }: { data: PortalData; form?: ActionResult } = $props();
  let online = $state(true);
  let queue = $state(0);
  let syncMessage = $state('');
  let stepUpMessage = $state('');
  let menuOpen = $state(false);
  let offlineProjects = $state<Row[]>([]);
  let expenseClientTreatment = $state('non_billable');
  let expenseBillingTreatment = $state('internal_non_billable');

  function syncExpenseTreatment(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    expenseClientTreatment = value;
    expenseBillingTreatment =
      value === 'reimbursable'
        ? 'reimbursable_at_cost'
        : value === 'all_in'
          ? 'all_in'
          : 'internal_non_billable';
  }
  const navigation = [
    ['today', 'Today', '⌂'],
    ['time', 'Time', '◷'],
    ['reports', 'Reports', '▤'],
    ['expenses', 'Expenses', '◇'],
    ['documents', 'Documents', '▧'],
    ['projects', 'Projects', '▦'],
    ['pay', 'My Pay', '$'],
    ['notifications', 'Notifications', '◌'],
  ];
  const admin = [
    ['planning', 'Planning', '⌘'],
    ['approvals', 'Approvals', '✓'],
    ['billing', 'Billing', '◫'],
    ['finance', 'Finance', '↗'],
  ];
  const financeAdmin = [
    ['billing', 'Billing', '◫'],
    ['finance', 'Finance', '↗'],
    ['ledger', 'Ledger', '▥'],
    ['accounting', 'Accounting Pack', '▤'],
  ];
  const securityAdmin = [['audit', 'Audit log', '⌁']];
  const titles: Record<string, string> = {
    today: 'Today',
    time: 'Time entries',
    reports: 'Daily and technical reports',
    expenses: 'Expenses and receipts',
    projects: 'Projects',
    pay: 'My Pay',
    documents: 'Documents',
    notifications: 'Notifications',
    profile: 'Profile and security',
    planning: 'Resource planning',
    approvals: 'Approval queue',
    billing: 'Billing streams',
    finance: 'Project finance',
    ledger: 'Invoice / cost ledger',
    accounting: 'Monthly Accounting Pack',
    audit: 'Audit log',
  };
  const isAuditor = $derived(data.user.role === 'auditor_read_only');
  const isManager = $derived(Boolean(data.user.role && data.user.role !== 'worker' && !isAuditor));
  const isFinance = $derived(
    data.user.role === 'owner_admin' ||
      data.user.role === 'finance_admin' ||
      data.user.role === 'auditor_read_only',
  );
  const canAudit = $derived(data.user.role === 'owner_admin' || isAuditor);
  const availableProjects = $derived(
    data.projects && data.projects.length > 0 ? data.projects : offlineProjects,
  );
  const money = (minor: string | number | null | undefined, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      Number(minor ?? 0) / 100,
    );
  const href = (section: string) =>
    section === 'today' ? `${base}/app/` : `${base}/app/${section}`;
  const searchHref = (row: Row) => {
    const id = String(row.id ?? '');
    if (row.type === 'project') return `${base}/app/projects/${id}`;
    if (row.type === 'invoice') return `${base}/app/billing/invoices/${id}`;
    if (row.type === 'worker') return `${base}/app/planning`;
    if (row.type === 'expense') return `${base}/app/expenses`;
    return `${base}/app/reports`;
  };
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

  onMount(() => {
    online = navigator.onLine;
    void queuedCount().then((value) => (queue = value));
    void getOfflineAssignments().then((value) => {
      offlineProjects = value.map((project) => ({
        id: project.id,
        project_number: project.projectNumber,
        name: project.name,
        status: project.status,
        currency: project.currency,
        timezone: project.timezone,
      }));
    });
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        const result = await syncQueuedMutations();
        queue = await queuedCount();
        if (result.failed)
          syncMessage = `Sync failed — retry (${result.failed} item${result.failed === 1 ? '' : 's'})`;
        else if (result.accepted || result.conflicts || result.rejected)
          syncMessage = result.conflicts
            ? `${result.accepted} synced · server changed since your offline edit · ${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'}`
            : `${result.accepted} synced · ${result.rejected} rejected`;
        else syncMessage = 'Synced';
      } catch {
        syncMessage = 'Sync failed — retry when the connection is stable.';
      }
    };
    void sync();
    const update = () => {
      online = navigator.onLine;
      if (online) void sync();
    };
    addEventListener('online', update);
    addEventListener('offline', update);
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'sync-request') void sync();
    });
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register(`${base}/app/service-worker.js`, {
        scope: `${base}/app/`,
      });
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  });
  $effect(() => {
    const projects = data.projects;
    if (projects?.length) void cacheAssignments(projects);
  });
  async function logout() {
    await fetch(`${base}/app/api/auth/sign-out`, { method: 'POST' });
    await fetch(`${base}/app/demo-login`, { method: 'DELETE' });
    await purgeUserCache();
    location.assign(`${base}/app/login`);
  }
  async function stepUp(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const response = await fetch(`${base}/app/api/step-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: formData.get('password') }),
    });
    stepUpMessage = response.ok
      ? 'Step-up authentication is active for the next 10 minutes.'
      : 'Password verification failed.';
  }

  type OfflineEntity = 'time' | 'daily_report' | 'technical_report' | 'expense';

  const formValue = (formData: FormData, name: string): string => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  const formNumber = (formData: FormData, name: string): number | undefined => {
    const value = formValue(formData, name);
    if (!value) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  };

  const formBoolean = (formData: FormData, name: string): boolean => formData.get(name) === 'on';

  const decimalToMinor = (value: string): string | undefined => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) return undefined;
    return `${match[1]}${(match[2] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  };

  const compact = (payload: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== ''),
    );

  async function saveOfflineDraft(event: SubmitEvent, entityType: OfflineEntity): Promise<void> {
    if (online) return;
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const formData = new FormData(formElement);
    const projectId = formValue(formData, 'projectId');
    if (!projectId) {
      syncMessage = 'Select a project before saving an offline draft.';
      return;
    }
    const payload =
      entityType === 'time'
        ? compact({
            projectId,
            workDate: formValue(formData, 'workDate'),
            category: formValue(formData, 'category'),
            activityCode: formValue(formData, 'activityCode'),
            minutes: formNumber(formData, 'minutes'),
            summary: formValue(formData, 'summary'),
          })
        : entityType === 'daily_report'
          ? compact({
              projectId,
              workDate: formValue(formData, 'workDate'),
              siteShift: formValue(formData, 'siteShift'),
              summary: formValue(formData, 'summary'),
              tasksCompleted: formValue(formData, 'tasksCompleted'),
              problemsFound: formValue(formData, 'problemsFound'),
              correctiveActions: formValue(formData, 'correctiveActions'),
              clientDecisions: formValue(formData, 'clientDecisions'),
              downtimeMinutes: formNumber(formData, 'downtimeMinutes') ?? 0,
              standbyReason: formValue(formData, 'standbyReason'),
              blockers: formValue(formData, 'blockers'),
              openItems: formValue(formData, 'openItems'),
              nextDayPlan: formValue(formData, 'nextDayPlan'),
              safetyRelated: formBoolean(formData, 'safetyRelated'),
              customerContact: formValue(formData, 'customerContact'),
            })
          : entityType === 'technical_report'
            ? compact({
                projectId,
                systemName: formValue(formData, 'systemName'),
                plantSite: formValue(formData, 'plantSite'),
                areaLine: formValue(formData, 'areaLine'),
                stationMachine: formValue(formData, 'stationMachine'),
                systemType: formValue(formData, 'systemType'),
                plcPlatform: formValue(formData, 'plcPlatform'),
                controller: formValue(formData, 'controller'),
                hmiScada: formValue(formData, 'hmiScada'),
                networkProtocol: formValue(formData, 'networkProtocol'),
                softwareVersion: formValue(formData, 'softwareVersion'),
                programReference: formValue(formData, 'programReference'),
                changeSummary: formValue(formData, 'changeSummary'),
                safetyRelated: formBoolean(formData, 'safetyRelated'),
                productionImpact: formValue(formData, 'productionImpact'),
                validation: formValue(formData, 'validation'),
                validationResult: formValue(formData, 'validationResult'),
                openRisk: formValue(formData, 'openRisk'),
                rollbackPlan: formValue(formData, 'rollbackPlan'),
              })
            : compact({
                projectId,
                spentOn: formValue(formData, 'spentOn'),
                vendor: formValue(formData, 'vendor'),
                category: formValue(formData, 'category'),
                description: formValue(formData, 'description'),
                currency: formValue(formData, 'currency'),
                amountMinor: decimalToMinor(formValue(formData, 'amount')),
                projectCurrencyAmountMinor: formValue(formData, 'projectCurrencyAmountMinor'),
                fxRateBps: formNumber(formData, 'fxRateBps'),
                taxAmountMinor: formValue(formData, 'taxAmountMinor'),
                whoPaid: formValue(formData, 'whoPaid'),
                clientTreatment: formValue(formData, 'clientTreatment'),
                billingTreatment: formValue(formData, 'billingTreatment'),
                markupBps: formNumber(formData, 'markupBps'),
                paymentMethod: formValue(formData, 'paymentMethod'),
                receiptRequired: formBoolean(formData, 'receiptRequired'),
              });
    const attachmentFiles: OfflineAttachment[] = [];
    if (entityType === 'expense') {
      const receipt = formData.get('receipt');
      if (receipt instanceof File && receipt.size > 0) {
        const id = crypto.randomUUID();
        attachmentFiles.push({
          id,
          fileName: receipt.name || 'receipt',
          mediaType: receipt.type,
          bytes: await receipt.arrayBuffer(),
        });
        payload.receiptRequired = true;
      }
    }
    const mutationId = crypto.randomUUID();
    const existingEntityId = formElement.dataset.entityId;
    const existingVersion = Number(formElement.dataset.version);
    try {
      await queueMutation(
        {
          mutationId,
          entityType,
          entityId: existingEntityId || crypto.randomUUID(),
          baseVersion: existingEntityId && Number.isInteger(existingVersion) ? existingVersion : 0,
          createdAt: new Date().toISOString(),
          payload,
          attachments: attachmentFiles.map((attachment) => attachment.id),
        },
        attachmentFiles,
      );
      queue = await queuedCount();
      syncMessage = 'Offline — saved on this device';
      formElement.reset();
    } catch {
      syncMessage = 'Offline draft could not be saved on this device.';
    }
  }
</script>

<svelte:head
  ><title>{titles[data.section]} | J&A Portal</title><link
    rel="manifest"
    href={`${base}/app/manifest.webmanifest`}
  /><meta name="theme-color" content="#17191b" /></svelte:head
>
<div class="portal-layout">
  <aside class:open={menuOpen}>
    <a class="portal-brand" href={`${base}/app/`}
      ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
    >
    <nav aria-label="Worker navigation">
      {#each navigation as item}<a
          class:active={data.section === item[0]}
          href={href(item[0])}
          onclick={() => (menuOpen = false)}
          ><span class="nav-icon" aria-hidden="true">{item[2]}</span><span>{item[1]}</span></a
        >{/each}
    </nav>
    {#if isManager || isAuditor}<div class="admin-nav">
        {#if isManager}<small>MANAGEMENT</small>{#each admin as item}<a
              class:active={data.section === item[0]}
              href={href(item[0])}
              onclick={() => (menuOpen = false)}
              ><span class="nav-icon" aria-hidden="true">{item[2]}</span><span>{item[1]}</span></a
            >{/each}{/if}
        {#if isFinance}<small>FINANCE CONTROL</small>{#each financeAdmin as item}<a
              class:active={data.section === item[0]}
              href={href(item[0])}
              onclick={() => (menuOpen = false)}
              ><span class="nav-icon" aria-hidden="true">{item[2]}</span><span>{item[1]}</span></a
            >{/each}{/if}
        {#if canAudit}<small>SECURITY</small>{#each securityAdmin as item}<a
              class:active={data.section === item[0]}
              href={href(item[0])}
              onclick={() => (menuOpen = false)}
              ><span class="nav-icon" aria-hidden="true">{item[2]}</span><span>{item[1]}</span></a
            >{/each}{/if}
      </div>{/if}
    <button class="signout" onclick={logout}>Sign out</button>
  </aside>
  <header>
    <div class="header-status">
      <button
        class="menu-button"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}><span></span><span></span></button
      >
      <span class:offline={!online} class="connection"><i></i>{online ? 'Online' : 'Offline'}</span
      >{#if queue > 0}<span class="queue">{queue} queued</span>{/if}
      {#if syncMessage}<span class="sync-message" role="status">{syncMessage}</span>{/if}
    </div>
    <a class="user" href={href('profile')}>
      <span class="user-avatar" aria-hidden="true">{initials(data.user.name)}</span>
      <span class="user-copy"
        ><b>{data.user.name}</b><small>{data.user.role ?? 'worker'}</small></span
      >
    </a>
  </header>
  <main>
    <div class="portal-title">
      <div>
        <p class="portal-kicker">J&A / {data.section.toUpperCase()}</p>
        <h1>{titles[data.section]}</h1>
      </div>
      <div class="portal-heading-tools">
        <form class="global-search" method="GET" action={href(data.section)} role="search">
          <label class="visually-hidden" for="portal-global-search">Search workspace</label>
          <input
            id="portal-global-search"
            name="q"
            value={data.searchQuery ?? ''}
            placeholder="Search projects, people, invoices…"
            autocomplete="off"
          />
          <button type="submit">Search</button>
        </form>
      </div>
    </div>
    {#if form?.message}<p class:success={form.success} class="action-message" role="status">
        {form.message}
      </p>{/if}
    {#if (data.searchQuery ?? '').length >= 2}
      <section class="record-list full search-results" aria-live="polite">
        <div class="panel-title">
          <h2>Search results</h2>
          <span>{data.searchResults?.length ?? 0} matches</span>
        </div>
        {#each data.searchResults ?? [] as result}
          <a class="search-result" href={searchHref(result)}>
            <strong>{String(result.label ?? 'Result')}</strong>
            <small>{String(result.type ?? 'record')} · {String(result.detail ?? '')}</small>
          </a>
        {:else}
          <div class="empty">No records match that search in your access scope.</div>
        {/each}
      </section>
    {/if}

    {#if data.section === 'today'}
      {#if data.dashboard}
        <div class="dashboard-hero">
          <div>
            <span class="portal-kicker">OPERATIONS CONTROL</span>
            <h2>Field operations overview</h2>
            <p>Current projects, field records, and billing readiness in one view.</p>
          </div>
          <strong>{data.dashboard.activeProjects}<small>active projects</small></strong>
        </div>
        <div class="finance-grid dashboard-metrics">
          <section class="metric">
            <span>RECORDED HOURS</span><strong
              >{(data.dashboard.actualMinutes / 60).toFixed(1)}</strong
            >
            <p>Approved and submitted field time</p>
          </section>
          <section class="metric attention">
            <span>PENDING REPORTS</span><strong>{data.dashboard.pendingReports}</strong>
            <p>Daily and PLC records awaiting review</p>
          </section>
          <section class="metric">
            <span>PROJECT EXPENSES</span><strong
              >{money(data.dashboard.expenseMinor, data.dashboard.currency)}</strong
            >
            <p>All-in and reimbursable combined</p>
          </section>
          <section class="metric">
            <span>UPCOMING BILLING</span><strong
              >{money(data.dashboard.upcomingInvoiceMinor, data.dashboard.currency)}</strong
            >
            <p>{data.dashboard.upcomingInvoices} draft invoice streams</p>
          </section>
        </div>
        <section class="record-list dashboard-projects">
          <div class="panel-title">
            <h2>Active project board</h2>
            <span>{availableProjects.length} records</span>
          </div>
          {#each availableProjects as project}<a
              class="project-board-row"
              href={`${base}/app/projects/${project.id}`}
              ><span><b>{project.project_number}</b><strong>{project.name}</strong></span><small
                >{project.status} · {project.timezone}</small
              ><i>Open project</i></a
            >{/each}
        </section>
      {:else}
        <div class="portal-grid">
          <section class="assignment">
            <span class="status-chip"><b></b>TODAY / 10 H EXPECTED</span>
            <h2>{data.records?.[0]?.project_name ?? 'Field workspace'}</h2>
            <p>
              {data.records?.[0]
                ? `${data.records[0].site} · ${String(data.records[0].starts_at).slice(11, 16)}–${String(data.records[0].ends_at).slice(11, 16)}`
                : 'No published assignment for today.'}
            </p>
            <div class="quick-actions">
              <a href={`${base}/app/time`}>Log actual time</a><a href={`${base}/app/reports`}
                >Write field report</a
              ><a href={`${base}/app/expenses`}>Add expense</a>
            </div>
          </section>
          <section class="sync-panel">
            <span class="portal-kicker">DEVICE STATUS</span><strong
              >{online ? 'Connected to J&A' : 'Working offline'}</strong
            >
            <p>{queue} local mutation{queue === 1 ? '' : 's'} waiting to synchronize.</p>
            {#if syncMessage}<small>{syncMessage}</small>{/if}
          </section>
        </div>
      {/if}
    {:else if data.section === 'time'}
      <div class="worker-form">
        {#if !isAuditor}<form
            method="POST"
            action="?/createTime"
            class="entry-panel"
            onsubmit={(event) => saveOfflineDraft(event, 'time')}
          >
            <h2>Log actual time</h2>
            <p>Enter only minutes actually worked.</p>
            <label
              >Project<select name="projectId" required
                ><option value="">Select assignment</option
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label>Work date<input name="workDate" type="date" required /></label><label
              >Category<select name="category"
                ><option value="regular">Regular</option><option value="commissioning"
                  >Commissioning</option
                ><option value="overtime">Overtime</option><option value="standby"
                  >Standby / waiting</option
                ><option value="travel">Travel</option><option value="training">Training</option
                ></select
              ></label
            ><label
              >Minutes<input
                name="minutes"
                type="number"
                min="1"
                max="1440"
                required
                inputmode="numeric"
              /></label
            ><label>Activity summary<textarea name="summary" required></textarea></label><button
              >Save draft</button
            >
          </form>{/if}
        <section class="record-list">
          <div class="panel-title">
            <h2>Recent entries</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article class="record-card">
              <div>
                <strong>{row.work_date} · {row.project_number}</strong><small
                  >{row.category} · {row.minutes} min · {row.approval_state}</small
                >
              </div>
              {#if row.approval_state === 'draft'}<div class="record-actions">
                  <details>
                    <summary>Edit draft</summary>
                    <form
                      method="POST"
                      action="?/updateTime"
                      data-entity-id={String(row.id)}
                      data-version={String(row.version)}
                      onsubmit={(event) => saveOfflineDraft(event, 'time')}
                    >
                      <input type="hidden" name="id" value={row.id} /><input
                        type="hidden"
                        name="version"
                        value={row.version}
                      /><input type="hidden" name="projectId" value={row.project_id} /><input
                        type="hidden"
                        name="workDate"
                        value={row.work_date}
                      /><label
                        >Category<select name="category" value={row.category}
                          ><option value="regular">Regular</option><option value="commissioning"
                            >Commissioning</option
                          ><option value="overtime">Overtime</option><option value="standby"
                            >Standby / waiting</option
                          ><option value="travel">Travel</option><option value="training"
                            >Training</option
                          ></select
                        ></label
                      ><label
                        >Minutes<input
                          name="minutes"
                          type="number"
                          min="0"
                          max="1440"
                          value={row.minutes}
                          required
                        /></label
                      ><label
                        >Summary<textarea name="summary" required>{row.activity_summary}</textarea
                        ></label
                      ><button>Save changes</button>
                    </form>
                  </details>
                  <form method="POST" action="?/submitTime">
                    <input type="hidden" name="id" value={row.id} /><input
                      type="hidden"
                      name="version"
                      value={row.version}
                    /><button>Submit</button>
                  </form>
                </div>{/if}
            </article>{:else}<div class="empty">No time recorded.</div>{/each}
        </section>
      </div>
    {:else if data.section === 'expenses'}
      <div class="worker-form">
        {#if !isAuditor}<form
            method="POST"
            action="?/createExpense"
            enctype="multipart/form-data"
            class="entry-panel"
            onsubmit={(event) => saveOfflineDraft(event, 'expense')}
          >
            <h2>Record expense</h2>
            <label
              >Project<select name="projectId" required
                ><option value="">Select assignment</option
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label>Date<input name="spentOn" type="date" required /></label><label
              >Vendor<input name="vendor" required /></label
            ><label
              >Category<select name="category"
                ><option value="hotel">Hotel</option><option value="rental_car">Rental car</option
                ><option value="fuel">Fuel</option><option value="tolls">Tolls</option><option
                  value="parking">Parking</option
                ><option value="airfare">Airfare</option><option value="ground_transport"
                  >Train / bus / taxi / rideshare</option
                ><option value="meals">Meals</option><option value="per_diem">Per diem</option
                ><option value="materials">Project materials</option><option value="tools"
                  >Tools / consumables</option
                ><option value="shipping">Shipping</option><option value="phone_data"
                  >Phone / data</option
                ><option value="visa_permit">Visa / permit</option><option value="other"
                  >Other</option
                ></select
              ></label
            ><label
              >Amount<input
                name="amount"
                inputmode="decimal"
                pattern="[0-9]+([.][0-9][0-9]?)?"
                required
              /></label
            ><label
              >Currency<select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label>Description<textarea name="description" required></textarea></label><label
              >Who paid<select name="whoPaid"
                ><option value="worker">Worker</option><option value="company_card"
                  >Company card</option
                ><option value="company_direct">Company direct</option><option value="client"
                  >Client paid directly</option
                ><option value="third_party">Third party</option></select
              ></label
            ><label
              >Client treatment<select
                name="clientTreatment"
                value={expenseClientTreatment}
                onchange={syncExpenseTreatment}
                ><option value="non_billable">Non-billable</option><option value="reimbursable"
                  >Reimbursable</option
                ><option value="all_in">All-in project cost</option></select
              ></label
            ><label
              >Billing treatment<select name="billingTreatment" value={expenseBillingTreatment}
                ><option value="internal_non_billable">Internal / non-billable</option><option
                  value="reimbursable_at_cost">Reimbursable at cost</option
                ><option value="reimbursable_plus_markup">Reimbursable + markup</option><option
                  value="all_in">Included in all-in / fixed price</option
                ><option value="client_direct">Paid directly by client</option><option
                  value="allowance_per_diem">Allowance / per diem</option
                ><option value="informational">Informational only</option></select
              ></label
            ><label>Markup (basis points)<input name="markupBps" type="number" min="0" /></label
            ><label
              >Tax amount (minor units)<input name="taxAmountMinor" type="number" min="0" /></label
            ><label
              >Project currency amount (minor units)<input
                name="projectCurrencyAmountMinor"
                type="number"
                min="0"
              /></label
            ><label
              >FX rate (basis points)<input
                name="fxRateBps"
                type="number"
                min="1"
                placeholder="e.g. 9200"
              /></label
            ><label
              >Payment method<input
                name="paymentMethod"
                placeholder="Card, transfer, cash"
              /></label
            ><label class="check"
              ><input name="receiptRequired" type="checkbox" /> Receipt required</label
            ><label
              >Receipt image or PDF<input
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              /></label
            ><button>Save draft</button>
          </form>{/if}
        <section class="record-list">
          <div class="panel-title">
            <h2>Recent expenses</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article class="record-card">
              <div>
                <strong>{row.vendor} · {money(row.amount_minor, String(row.currency))}</strong
                ><small
                  >{row.spent_on} · {row.project_number} · {row.approval_state} · {row.who_paid} ·
                  {row.reimbursement_state}</small
                >
              </div>
              {#if row.approval_state === 'draft'}<form method="POST" action="?/submitExpense">
                  <input type="hidden" name="id" value={row.id} /><input
                    type="hidden"
                    name="version"
                    value={row.version}
                  /><button>Submit</button>
                </form>{/if}
            </article>{:else}<div class="empty">No expenses recorded.</div>{/each}
        </section>
      </div>
    {:else if data.section === 'reports'}
      <div class="report-workspace">
        {#if !isAuditor}<div class="report-forms">
            <details open>
              <summary
                ><span>01</span>
                <div>
                  <strong>Daily field report</strong><small
                    >Shift summary, blockers and next-day plan</small
                  >
                </div></summary
              >
              <form
                method="POST"
                action="?/createDailyReport"
                class="entry-panel report-form"
                onsubmit={(event) => saveOfflineDraft(event, 'daily_report')}
              >
                <label
                  >Project<select name="projectId" required
                    ><option value="">Select assignment</option
                    >{#each availableProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                >
                <div class="two-up">
                  <label>Work date<input name="workDate" type="date" required /></label><label
                    >Site / shift<input
                      name="siteShift"
                      placeholder="Line 4 · first shift"
                    /></label
                  >
                </div>
                <label>Shift summary<textarea name="summary" required></textarea></label><label
                  >Tasks completed<textarea name="tasksCompleted" required></textarea></label
                >
                <div class="two-up">
                  <label>Problems found<textarea name="problemsFound"></textarea></label><label
                    >Corrective actions<textarea name="correctiveActions"></textarea></label
                  >
                </div>
                <div class="two-up">
                  <label
                    >Downtime minutes<input
                      name="downtimeMinutes"
                      type="number"
                      min="0"
                      max="1440"
                      value="0"
                    /></label
                  ><label>Standby reason<input name="standbyReason" /></label>
                </div>
                <label>Open items<textarea name="openItems"></textarea></label><label
                  >Next-day plan<textarea name="nextDayPlan"></textarea></label
                >
                <label class="check"
                  ><input name="safetyRelated" type="checkbox" /> Safety-related change</label
                ><button>Save daily report</button>
              </form>
            </details>
            <details>
              <summary
                ><span>02</span>
                <div>
                  <strong>PLC / technical report</strong><small
                    >Controls-specific change and validation record</small
                  >
                </div></summary
              >
              <form
                method="POST"
                action="?/createTechnicalReport"
                class="entry-panel report-form"
                onsubmit={(event) => saveOfflineDraft(event, 'technical_report')}
              >
                <label
                  >Project<select name="projectId" required
                    ><option value="">Select assignment</option
                    >{#each availableProjects as project}<option value={project.id}
                        >{project.project_number} — {project.name}</option
                      >{/each}</select
                  ></label
                >
                <div class="two-up">
                  <label
                    >System / machine<input
                      name="systemName"
                      placeholder="Line 4 main conveyor"
                      required
                    /></label
                  ><label>Plant / site<input name="plantSite" /></label>
                </div>
                <div class="three-up">
                  <label>Area / line<input name="areaLine" /></label><label
                    >Station / machine<input name="stationMachine" /></label
                  ><label>System type<input name="systemType" /></label>
                </div>
                <div class="three-up">
                  <label
                    >PLC platform<input
                      name="plcPlatform"
                      placeholder="Rockwell Automation"
                    /></label
                  ><label
                    >Controller<input name="controller" placeholder="ControlLogix 5580" /></label
                  ><label>HMI / SCADA<input name="hmiScada" /></label>
                </div>
                <div class="two-up">
                  <label>Network / protocol<input name="networkProtocol" /></label><label
                    >Software version<input name="softwareVersion" /></label
                  >
                </div>
                <label>Program / project reference<input name="programReference" /></label><label
                  >Problem and change performed<textarea name="changeSummary" required
                  ></textarea></label
                ><label>Production impact<textarea name="productionImpact"></textarea></label>
                <div class="two-up">
                  <label>Validation performed<textarea name="validation"></textarea></label><label
                    >Validation result<textarea name="validationResult"></textarea></label
                  >
                </div>
                <div class="two-up">
                  <label>Open risk / issue<textarea name="openRisk"></textarea></label><label
                    >Rollback plan<textarea name="rollbackPlan"></textarea></label
                  >
                </div>
                <label class="check safety-check"
                  ><input name="safetyRelated" type="checkbox" /> Safety impact: technical lead review,
                  validation and rollback detail required</label
                ><button>Save PLC report</button>
              </form>
            </details>
          </div>{/if}
        <section class="record-list report-history">
          <div class="panel-title">
            <h2>Report register</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article class="record-card">
              <div>
                <span class:technical={row.type === 'technical'} class="report-type"
                  >{row.type === 'technical' ? 'PLC' : 'DAILY'}</span
                ><strong>{row.title}</strong><small
                  >{row.date} · {row.project_number} · {row.approval_state}</small
                >
              </div>
              {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}<form
                  method="POST"
                  action="?/submitReport"
                >
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="version" value={row.version} /><button>Submit</button
                  >
                </form>{/if}
            </article>{:else}<div class="empty">No field reports recorded.</div>{/each}
        </section>
        <section class="record-list full period-report-list">
          <div class="panel-title">
            <div>
              <h2>Period report register</h2>
              <p class="form-help">
                Customer and internal summaries are generated after a reviewed billing-period close.
              </p>
            </div>
            <span>{data.periodReports?.length ?? 0}</span>
          </div>
          {#each data.periodReports ?? [] as report}<article class="record-card">
              <div>
                <strong
                  >{String(report.project_number)} · {String(report.audience).toUpperCase()}</strong
                ><small
                  >{String(report.period_start)} → {String(report.period_end)} · {String(
                    report.state,
                  )}</small
                >
              </div>
              {#if report.pdf_storage_key}<a
                  class="preview-link"
                  href={`${base}/app/api/reports/${String(report.id)}/pdf`}>PDF</a
                >{/if}
            </article>{:else}<div class="empty">No generated period summaries yet.</div>{/each}
        </section>
      </div>
    {:else if data.section === 'documents'}
      <div class="document-workspace">
        <section class="entry-panel document-upload">
          <div class="panel-title">
            <div>
              <h2>Register a private artifact</h2>
              <p class="form-help">
                Receipts, PLC backups and project reports are validated, hashed and kept outside the
                public site.
              </p>
            </div>
          </div>
          {#if !isAuditor}<form
              method="POST"
              action="?/uploadPrivateDocument"
              enctype="multipart/form-data"
            >
              <label
                >Project<select name="projectId" required
                  ><option value="">Select assignment</option
                  >{#each availableProjects as project}<option value={project.id}
                      >{project.project_number} — {project.name}</option
                    >{/each}</select
                ></label
              >
              <div class="two-up">
                <label
                  >Artifact type<input
                    name="artifactType"
                    placeholder="PLC backup, engineering report"
                    required
                  /></label
                >
                <label
                  >Sensitivity<select name="sensitivity"
                    ><option value="internal">Internal</option><option value="sensitive"
                      >Sensitive</option
                    ><option value="customer_private">Customer private</option></select
                  ></label
                >
              </div>
              <label
                >Description<textarea
                  name="description"
                  required
                  placeholder="What this artifact contains and why it is retained"
                ></textarea></label
              >
              <label
                >File<input
                  name="file"
                  type="file"
                  accept="application/pdf,application/zip,image/jpeg,image/png,image/webp,image/heic,image/heif,text/plain"
                  capture="environment"
                  required
                /></label
              >
              <button>Upload and register hash</button>
            </form>{/if}
        </section>
        <section class="record-list full">
          <div class="panel-title">
            <div>
              <h2>Private project documents</h2>
              <p class="form-help">
                Files are private, hash-verified, and authorized on every download.
              </p>
            </div>
            <span>{data.documents?.length ?? 0} files</span>
          </div>
          {#each data.documents ?? [] as document}<article class="invoice-row">
              <div>
                <strong
                  >{String(
                    document.safe_filename ?? document.original_filename ?? 'Document',
                  )}</strong
                >
                <small
                  >{String(document.project_number ?? 'Private')} · {String(document.artifact_type)} ·
                  {String(document.byte_length)} bytes</small
                >
              </div>
              <div class="record-actions">
                <span class="state-tag">{String(document.sensitivity ?? 'internal')}</span>
                <a class="preview-link" href={`${base}/app/api/documents/${String(document.id)}`}
                  >Download</a
                >
              </div>
            </article>{:else}<div class="empty">
              No private documents are available in your access scope.
            </div>{/each}
        </section>
      </div>
    {:else if data.section === 'pay' && data.pay}
      <form class="filter-form">
        <label>From<input name="start" type="date" value={data.periodStart} /></label><label
          >Through<input name="end" type="date" value={data.periodEnd} /></label
        ><button>Apply period</button>
      </form>
      <div class="finance-grid">
        <section class="metric">
          <span>APPROVED COMPENSATION</span><strong
            >{money(data.pay.estimatedApprovedMinor, data.pay.currency)}</strong
          >
          <p>{data.pay.approvedMinutes} approved minutes</p>
        </section>
        <section class="metric">
          <span>APPROVED REIMBURSEMENTS</span><strong
            >{money(data.pay.approvedReimbursementMinor, data.pay.currency)}</strong
          >
          <p>
            Pending pay: {money(data.pay.estimatedPendingMinor, data.pay.currency)} plus {money(
              data.pay.pendingReimbursementMinor,
              data.pay.currency,
            )} reimbursements.
          </p>
        </section>
      </div>
      <section class="record-list full pay-detail">
        <div class="panel-title">
          <div>
            <h2>Compensation statement</h2>
            <p>
              {data.pay.label ?? 'Estimate from approved and pending records'} · {data.periodStart} to
              {data.periodEnd}
            </p>
          </div>
          <span>{data.pay.percentageBased ? 'Percentage rule active' : 'Rate rule active'}</span>
        </div>
        <div class="detail-grid">
          <div>
            <span>Approved actual time</span><strong
              >{(data.pay.approvedMinutes / 60).toFixed(2)} h</strong
            >
          </div>
          <div>
            <span>Pending actual time</span><strong
              >{(data.pay.pendingMinutes / 60).toFixed(2)} h</strong
            >
          </div>
          <div>
            <span>Daily guarantee coverage</span><strong
              >{(data.pay.guaranteedMinutes ?? 0) / 60} h</strong
            >
          </div>
          <div>
            <span>Projects included</span><strong>{data.pay.projectIds?.length ?? 0}</strong>
          </div>
        </div>
        <div class="statement-note">
          <strong>Privacy boundary</strong>
          <p>
            This view contains only your own time, reimbursement, and compensation estimate. Client
            rates, internal cost, margin, and other workers remain restricted.
          </p>
          {#if (data.pay.missingCompensationRules ?? 0) > 0}<p class="warning">
              {data.pay.missingCompensationRules} time record(s) have no matching compensation rule and
              require Finance review.
            </p>{/if}
          {#if data.pay.settlementTriggers?.length}<p>
              Settlement trigger: {data.pay.settlementTriggers.join(' · ')}
            </p>{/if}
        </div>
      </section>
      <section class="record-list full pay-detail">
        <div class="panel-title">
          <div>
            <h2>Assignment budget context</h2>
            <p>
              Optional planning context only; actual and approved time remain the source of
              compensation.
            </p>
          </div>
          <span>{data.pay.projectProgress?.length ?? 0} projects</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>Project</th><th>Actual</th><th>Approved</th><th>Pending</th><th>Planned</th><th
                  >Remaining</th
                ><th>Approved estimate</th><th>Pending estimate</th></tr
              ></thead
            >
            <tbody
              >{#each data.pay.projectProgress ?? [] as row}<tr
                  ><td>{String(row.projectNumber)} · {String(row.projectName)}</td><td
                    >{(Number(row.actualMinutes ?? 0) / 60).toFixed(1)} h</td
                  ><td>{(Number(row.approvedMinutes ?? 0) / 60).toFixed(1)} h</td><td
                    >{(Number(row.pendingMinutes ?? 0) / 60).toFixed(1)} h</td
                  ><td
                    >{row.plannedMinutes === null
                      ? '—'
                      : `${(Number(row.plannedMinutes) / 60).toFixed(1)} h`}</td
                  ><td
                    >{row.hoursRemaining === null
                      ? '—'
                      : `${(Number(row.hoursRemaining) / 60).toFixed(1)} h`}</td
                  ><td>{money(String(row.estimatedApprovedMinor), String(row.currency))}</td><td
                    >{money(String(row.estimatedPendingMinor), String(row.currency))}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="8">No project assignment budget context is configured.</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full pay-settlements">
        <div class="panel-title">
          <div>
            <h2>Settlement status</h2>
            <p>Finalized compensation events for your own approved work.</p>
          </div>
          <span>{data.settlements?.length ?? 0}</span>
        </div>
        {#each data.settlements ?? [] as settlement}<article class="record-card">
            <div>
              <strong
                >{settlement.projectNumber} · {settlement.periodStart} → {settlement.periodEnd}</strong
              ><small>{settlement.state} · {settlement.settledAt ?? 'Estimate only'}</small>
            </div>
            <strong>{money(settlement.amountMinor, String(settlement.currency))}</strong>
          </article>{:else}<div class="empty">
            No compensation settlements in this period.
          </div>{/each}
      </section>
    {:else if data.section === 'projects'}
      <div class="management-stack">
        {#if data.clients && !isAuditor}<form
            method="POST"
            action="?/createClient"
            class="admin-form-grid"
          >
            <h2>Create client</h2>
            <label>Legal name<input name="legalName" required /></label><label
              >Display name<input name="displayName" required /></label
            ><label
              >Currency<select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label>Timezone<input name="timezone" value="America/New_York" required /></label
            ><input type="hidden" name="paymentTermsDays" value="30" />
            ><button>Create client</button>
          </form>
          <form method="POST" action="?/createProject" class="admin-form-grid">
            <h2>Create project</h2>
            <label
              >Client<select name="clientId" required
                >{#each data.clients as client}<option value={client.id}
                    >{client.client_number} — {client.display_name}</option
                  >{/each}</select
              ></label
            ><label>Name<input name="name" required /></label><label
              >Description<textarea name="description" rows="2"></textarea></label
            ><label>Project alias<input name="projectAlias" /></label><label
              >Currency<select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label
              >Billing model<select name="billingModel"
                ><option value="tm">Time & materials</option><option value="tm_daily_minimum"
                  >T&M · daily minimum</option
                ><option value="all_in">All-in</option><option value="capped_tm">Capped T&M</option
                ></select
              ></label
            ><label>Site timezone<input name="timezone" value="America/New_York" required /></label
            ><label>Start date<input name="startDate" type="date" /></label><label
              >Planned end date<input name="plannedEndDate" type="date" /></label
            ><label
              >Expected minutes / day<input
                name="expectedMinutesPerDay"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Client daily minimum minutes<input
                name="clientDailyMinimumMinutes"
                type="number"
                min="0"
                max="1440"
              /></label
            ><label
              >Budget type<select name="budgetType"
                ><option value="none">No budget</option><option value="revenue">Revenue</option
                ><option value="purchase_order">Purchase order</option><option value="labor"
                  >Labor</option
                ><option value="travel">Travel</option><option value="combined">Combined</option
                ></select
              ></label
            ><label
              >Revenue budget (minor)<input
                name="revenueBudgetMinor"
                inputmode="numeric"
                pattern="[0-9]*"
              /></label
            ><label
              >PO cap (minor)<input name="poCapMinor" inputmode="numeric" pattern="[0-9]*" /></label
            ><label
              >Labor budget minutes<input name="laborBudgetMinutes" type="number" min="0" /></label
            ><label
              >Travel budget (minor)<input
                name="travelBudgetMinor"
                inputmode="numeric"
                pattern="[0-9]*"
              /></label
            ><label class="check"
              ><input name="weeklyCloseEnabled" type="checkbox" /> Weekly close required</label
            ><label class="check"
              ><input name="dailyReportRequired" type="checkbox" /> Daily report required</label
            ><label class="check"
              ><input name="technicalReportingRequired" type="checkbox" /> Technical reporting required</label
            ><button>Create project</button>
          </form>
          <form method="POST" action="?/assignWorker" class="admin-form-grid">
            <h2>Assign worker</h2>
            <label
              >Project<select name="projectId" required
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number}</option
                  >{/each}</select
              ></label
            ><label
              >Worker<select name="workerId" required
                >{#each data.workers ?? [] as worker}<option value={worker.id}
                    >{worker.name} — {worker.role}</option
                  >{/each}</select
              ></label
            ><label>Role<input name="assignmentRole" value="worker" required /></label><label
              >Starts on<input name="startsOn" type="date" required /></label
            ><button>Assign</button>
          </form>
          <form method="POST" action="?/createClientContact" class="admin-form-grid">
            <h2>Add client contact</h2>
            <label
              >Client<select name="clientId" required
                >{#each data.clients as client}<option value={client.id}
                    >{client.client_number} — {client.display_name}</option
                  >{/each}</select
              ></label
            >
            <label>Name<input name="name" required /></label><label
              >Email<input name="email" type="email" /></label
            ><label>Phone<input name="phone" /></label><label>Role<input name="role" /></label>
            <label class="check"
              ><input name="isBillingContact" type="checkbox" /> Billing contact</label
            ><label class="check"><input name="isPrimary" type="checkbox" /> Primary contact</label>
            <button>Save contact</button>
          </form>
          <form method="POST" action="?/createMilestone" class="admin-form-grid">
            <h2>Create milestone</h2>
            <label
              >Project<select name="projectId" required
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label>Name<input name="name" required /></label><label
              >Description<textarea name="description" rows="2"></textarea></label
            ><label
              >Amount (minor)<input
                name="amountMinor"
                inputmode="numeric"
                pattern="[0-9]*"
                required
              /></label
            ><label>Due on<input name="dueOn" type="date" /></label><button>Save milestone</button>
          </form>
          <form method="POST" action="?/updateSchedule" class="admin-form-grid">
            <h2>Expected working schedule</h2>
            <label
              >Project<select name="projectId" required
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label>Timezone<input name="timezone" value="America/New_York" required /></label
            ><label>Effective from<input name="effectiveFrom" type="date" required /></label>
            <label
              >Mon minutes<input
                name="mondayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Tue minutes<input
                name="tuesdayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Wed minutes<input
                name="wednesdayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Thu minutes<input
                name="thursdayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Fri minutes<input
                name="fridayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Sat minutes<input
                name="saturdayMinutes"
                type="number"
                min="0"
                max="1440"
                value="600"
                required
              /></label
            ><label
              >Sun minutes<input
                name="sundayMinutes"
                type="number"
                min="0"
                max="1440"
                value="0"
                required
              /></label
            ><button>Save schedule</button>
          </form>{/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>Authorized projects</h2>
            <span>{availableProjects.length}</span>
          </div>
          {#each availableProjects as row}<a
              class="project-list-link"
              href={`${base}/app/projects/${row.id}`}
            >
              <div>
                <strong>{row.project_number} · {row.name}</strong><small
                  >{row.status} · {row.currency} · {row.timezone}</small
                >
              </div>
              <span>OPEN PROJECT →</span>
            </a>{/each}
        </section>
        {#if data.contacts}
          <section class="record-list full">
            <div class="panel-title">
              <h2>Client contacts</h2>
              <span>{data.contacts.length}</span>
            </div>
            {#each data.contacts as contact}<article>
                <div>
                  <strong>{contact.client_number} · {contact.name}</strong><small
                    >{contact.email ?? 'No email'} · {contact.role ??
                      'Contact'}{contact.is_billing_contact ? ' · billing' : ''}{contact.is_primary
                      ? ' · primary'
                      : ''}</small
                  >
                </div>
              </article>{:else}<div class="empty">No client contacts recorded.</div>{/each}
          </section>
        {/if}
      </div>
    {:else if data.section === 'planning'}
      <div class="management-stack">
        {#if !isAuditor}<form method="POST" action="?/createPlanning" class="admin-form-grid">
            <h2>Publish field assignment</h2>
            <label
              >Project<select name="projectId" required
                >{#each availableProjects as project}<option value={project.id}
                    >{project.project_number} — {project.name}</option
                  >{/each}</select
              ></label
            ><label
              >Worker<select name="workerId" required
                >{#each data.workers ?? [] as worker}<option value={worker.id}>{worker.name}</option
                  >{/each}</select
              ></label
            ><label>Start<input name="startsAt" type="datetime-local" required /></label><label
              >End<input name="endsAt" type="datetime-local" required /></label
            ><label
              >Planned minutes<input
                name="plannedMinutes"
                type="number"
                min="1"
                value="600"
                required
              /></label
            ><label>Site<input name="site" /></label><label
              >Required skill<input name="requiredSkill" /></label
            ><button>Publish assignment</button>
          </form>
          <form method="POST" action="?/createSkill" class="admin-form-grid">
            <h2>Add skill</h2>
            <label>Code<input name="code" required /></label><label
              >Name<input name="name" required /></label
            ><button>Save skill</button>
          </form>
          <form method="POST" action="?/setWorkerSkill" class="admin-form-grid">
            <h2>Assign skill</h2>
            <label
              >Worker<select name="workerId" required
                >{#each data.workers ?? [] as worker}<option value={worker.id}>{worker.name}</option
                  >{/each}</select
              ></label
            ><label
              >Skill<select name="skillId" required
                >{#each data.skills ?? [] as skill}<option value={skill.id}
                    >{skill.code} — {skill.name}</option
                  >{/each}</select
              ></label
            ><label
              >Proficiency<select name="proficiency"
                ><option value="1">1 · exposure</option><option value="2">2 · developing</option
                ><option value="3">3 · capable</option><option value="4">4 · advanced</option
                ><option value="5">5 · expert</option></select
              ></label
            ><button>Update skill matrix</button>
          </form>{/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>Published schedule</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article>
              <div>
                <strong>{row.worker_name} · {row.project_number}</strong><small
                  >{String(row.starts_at).replace('T', ' ').slice(0, 16)} · {row.planned_minutes} min
                  · {row.site}</small
                >
              </div>
              <span class="state-tag">{row.status}</span>
            </article>{/each}
        </section>
      </div>
    {:else if data.section === 'approvals'}
      <section class="record-list full">
        <div class="panel-title">
          <h2>Records requiring review</h2>
          <span>{data.records?.length ?? 0}</span>
        </div>
        {#each data.records ?? [] as row}<article class="approval-row">
            <div>
              <strong>{row.type} · {row.date}</strong><small
                >{row.amount}
                {row.type === 'time' ? 'minutes' : 'minor units'} · {row.approval_state}</small
              >
            </div>
            <div class="record-actions">
              {#if isAuditor}<span class="state-tag">Read-only review</span
                >{:else if row.review_stage === 'report'}<form
                  method="POST"
                  action="?/reviewReport"
                >
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="decision" value="approved" /><button
                    >Approve report</button
                  >
                </form>
                <form method="POST" action="?/reviewReport">
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="decision" value="needs_changes" /><input
                    name="reason"
                    placeholder="Required change"
                    required
                  /><button>Return</button>
                </form>{:else if row.review_stage === 'finance'}<form
                  method="POST"
                  action="?/financeApprove"
                >
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  />{#if row.type === 'time'}<select name="billable"
                      ><option value="yes">Billable</option><option value="no">Non-billable</option
                      ></select
                    >{/if}<button>Finance approve</button>
                </form>{:else}<form method="POST" action="?/approveRecord">
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="decision" value="approved" /><button>Approve</button>
                </form>
                <form method="POST" action="?/approveRecord">
                  <input type="hidden" name="type" value={row.type} /><input
                    type="hidden"
                    name="id"
                    value={row.id}
                  /><input type="hidden" name="decision" value="rejected" /><input
                    name="reason"
                    aria-label="Rejection reason"
                    placeholder="Reason"
                    required
                  /><button>Reject</button>
                </form>{/if}
            </div>
          </article>{:else}<div class="empty">Approval queue clear.</div>{/each}
      </section>
      <section class="record-list full">
        <div class="panel-title">
          <h2>Milestones awaiting approval</h2>
          <span>{data.milestones?.length ?? 0}</span>
        </div>
        {#each data.milestones ?? [] as milestone}<article class="approval-row">
            <div>
              <strong>{milestone.project_number} · {milestone.name}</strong><small
                >{milestone.due_on ?? 'No due date'} · {milestone.amount_minor}
                {milestone.currency} · submitted</small
              >
            </div>
            <div class="record-actions">
              {#if isAuditor}<span class="state-tag">Read-only review</span>{:else}<form
                  method="POST"
                  action="?/reviewMilestone"
                >
                  <input type="hidden" name="id" value={milestone.id} /><input
                    type="hidden"
                    name="decision"
                    value="approved"
                  /><button>Approve milestone</button>
                </form>
                <form method="POST" action="?/reviewMilestone">
                  <input type="hidden" name="id" value={milestone.id} /><input
                    type="hidden"
                    name="decision"
                    value="rejected"
                  /><input name="reason" placeholder="Reason" required /><button>Reject</button>
                </form>{/if}
            </div>
          </article>{:else}<div class="empty">No milestones await approval.</div>{/each}
      </section>
    {:else if data.section === 'billing'}
      <div class="management-stack">
        {#if !isAuditor}<form method="POST" action="?/createBillingRule" class="admin-form-grid">
            <h2>Configure billing stream</h2>
            <p class="form-help">
              Labor and expense streams are configured independently. Draft generation may be
              automatic; invoice issue and send remain manual.
            </p>
            <label
              >Project<select name="projectId" required
                ><option value="">Select project</option>{#each availableProjects as project}<option
                    value={project.id}
                    >{project.project_number} — {project.name} ({project.currency})</option
                  >{/each}</select
              ></label
            ><label
              >Stream<select name="streamType" required
                ><option value="labor">Labor</option><option value="expense">Expenses</option
                ><option value="milestone">Milestone</option><option value="other">Other</option
                ></select
              ></label
            ><label
              >Cadence<select name="cadenceType" required
                ><option value="weekly">Weekly</option><option value="every_14_days"
                  >Every 14 days</option
                ><option value="semi_monthly">Semi-monthly</option><option value="monthly"
                  >Monthly</option
                ><option value="custom">Custom</option><option value="milestone">Milestone</option
                ><option value="manual">Manual</option></select
              ></label
            ><label>Effective from<input name="effectiveFrom" type="date" required /></label><label
              >Anchor date<input name="anchorDate" type="date" /></label
            ><label
              >Legal entity<select name="legalEntityId" required
                ><option value="">Select legal entity</option
                >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                    >{entity.code} — {entity.legal_name} ({entity.currency})</option
                  >{/each}</select
              ></label
            ><label
              >Tax profile<select name="taxProfileId" required
                ><option value="">Select tax profile</option
                >{#each data.taxProfiles ?? [] as profile}<option value={profile.id}
                    >{profile.name} ({profile.currency})</option
                  >{/each}</select
              ></label
            ><label
              >Currency<select name="currency" required
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              ></label
            ><label>Invoice template<input name="templateId" value="default" required /></label
            ><label>Recipient email<input name="recipientEmail" type="email" /></label><label
              >Billing contact<select name="billingContactId"
                ><option value="">Use recipient email</option
                >{#each data.contacts ?? [] as contact}<option value={contact.id}
                    >{contact.client_number} · {contact.name} · {contact.email ??
                      'no email'}</option
                  >{/each}</select
              ></label
            ><label
              >Payment terms (days)<input
                name="paymentTermsDays"
                type="number"
                min="0"
                max="365"
                value="30"
                required
              /></label
            ><label>PO reference<input name="poNumberOverride" /></label><label
              >Grouping<select name="groupingMode"
                ><option value="summary">Summary</option><option value="detail">Detail</option
                ><option value="by_worker">By worker</option><option value="by_day">By day</option
                ><option value="by_category">By category</option></select
              ></label
            ><label
              >Semi-monthly rule<input name="semiMonthlyRule" value="1_15_16_end" required /></label
            ><label class="check"
              ><input name="autoGenerateDraft" type="checkbox" /> Generate drafts when the stream is due</label
            ><button>Save billing stream</button>
          </form>
          <div class="management-grid">
            <form method="POST" action="?/createLegalEntity" class="admin-form-grid">
              <h2>Legal entity</h2>
              <label>Code<input name="code" required /></label><label
                >Legal name<input name="legalName" required /></label
              ><label
                >Currency<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              ><label
                >Billing address<textarea name="billingAddress" rows="3" required></textarea></label
              ><label
                >Company identifiers<textarea name="companyIdentifiers" rows="2" required
                ></textarea></label
              ><button>Save legal entity</button>
            </form>
            <form method="POST" action="?/createInvoiceNumberPolicy" class="admin-form-grid">
              <h2>Invoice numbering policy</h2>
              <label
                >Legal entity<select name="legalEntityId" required
                  ><option value="">Select entity</option
                  >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                      >{entity.code} — {entity.legal_name}</option
                    >{/each}</select
                ></label
              ><label>Prefix<input name="prefix" value="JA-" required /></label><label
                >Digits<input
                  name="digits"
                  type="number"
                  min="4"
                  max="10"
                  value="6"
                  required
                /></label
              ><label>Effective from<input name="effectiveFrom" type="date" required /></label
              ><label
                >Accountant approved at<input
                  name="accountantApprovedAt"
                  type="datetime-local"
                  required
                /></label
              ><button>Save numbering policy</button>
            </form>
            <form method="POST" action="?/createTaxProfile" class="admin-form-grid">
              <h2>Tax profile</h2>
              <label
                >Legal entity<select name="legalEntityId"
                  ><option value="">Global profile</option
                  >{#each data.legalEntities ?? [] as entity}<option value={entity.id}
                      >{entity.code} — {entity.legal_name}</option
                    >{/each}</select
                ></label
              ><label>Name<input name="name" required /></label><label
                >Currency<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              ><label>Effective from<input name="effectiveFrom" type="date" required /></label
              ><label
                >Component<input name="componentName" value="VAT / sales tax" required /></label
              ><label
                >Rate (basis points)<input
                  name="componentBasisPoints"
                  type="number"
                  min="0"
                  max="100000"
                  value="0"
                  required
                /></label
              ><label class="check"
                ><input name="componentCompound" type="checkbox" /> Compound on prior component</label
              ><button>Save tax profile</button>
            </form>
          </div>{/if}
        <section class="record-list">
          <div class="panel-title">
            <h2>Billing rules</h2>
            <span>{data.billingRules?.length ?? 0}</span>
          </div>
          {#each data.billingRules ?? [] as rule}<article>
              <div>
                <strong>{rule.project_number} · {rule.stream_type}</strong><small
                  >{rule.cadence_type} · {rule.currency} · {rule.tax_profile_name ??
                    'No tax profile'}</small
                >
              </div>
              {#if !isAuditor}<div class="compact-actions">
                  <form method="POST" action="?/createDraft" class="compact-form">
                    <input type="hidden" name="billingRuleId" value={rule.id} /><input
                      name="periodStart"
                      type="date"
                      aria-label="Period start"
                      required
                    /><input name="periodEnd" type="date" aria-label="Period end" required /><button
                      >Build draft</button
                    >
                  </form>
                  <form method="POST" action="?/closePeriod" class="compact-form">
                    <input type="hidden" name="billingRuleId" value={rule.id} /><input
                      name="periodStart"
                      type="date"
                      aria-label="Close period start"
                      required
                    /><input
                      name="periodEnd"
                      type="date"
                      aria-label="Close period end"
                      required
                    /><button>Close sources</button>
                  </form>
                </div>{/if}
            </article>{/each}
        </section>
        <section class="record-list full">
          <div class="panel-title">
            <h2>Invoices</h2>
            <span>{data.invoices?.length ?? 0}</span>
          </div>
          {#each data.invoices ?? [] as invoice}<article class="invoice-row">
              <div>
                <strong>{invoice.invoice_number || 'Draft'} · {invoice.project_number}</strong
                ><small
                  >{invoice.stream_type} · {invoice.state} · {money(
                    invoice.total_minor,
                    String(invoice.currency),
                  )}</small
                >
              </div>
              <div class="record-actions">
                <a class="preview-link" href={`${base}/app/billing/invoices/${invoice.id}`}
                  >Preview</a
                >
                {#if !isAuditor}{#if invoice.state === 'draft'}<form
                      method="POST"
                      action="?/approveInvoice"
                    >
                      <input type="hidden" name="invoiceId" value={invoice.id} /><button
                        >Approve</button
                      >
                    </form>{:else if invoice.state === 'approved'}<form
                      method="POST"
                      action="?/issueInvoice"
                    >
                      <input type="hidden" name="invoiceId" value={invoice.id} /><button
                        >Issue</button
                      >
                    </form>{:else if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}<form
                      method="POST"
                      action="?/recordPayment"
                      class="payment-form"
                    >
                      <input type="hidden" name="invoiceId" value={invoice.id} /><input
                        name="amount"
                        aria-label="Payment amount"
                        placeholder="0.00"
                        required
                      /><input
                        name="receivedOn"
                        type="date"
                        aria-label="Received on"
                        required
                      /><input
                        name="idempotencyKey"
                        type="hidden"
                        value={`payment-${invoice.id}-${invoice.paid_minor}`}
                      /><button>Record payment</button>
                    </form>{/if}
                  {#if invoice.state === 'issued'}
                    <form method="POST" action="?/sendInvoice">
                      <input type="hidden" name="invoiceId" value={invoice.id} /><input
                        type="hidden"
                        name="idempotencyKey"
                        value={`send-${invoice.id}`}
                      /><button>Mark sent</button>
                    </form>
                  {/if}
                  {#if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}
                    <form method="POST" action="?/voidInvoice">
                      <input type="hidden" name="invoiceId" value={invoice.id} /><input
                        type="hidden"
                        name="idempotencyKey"
                        value={`void-${invoice.id}`}
                      /><input
                        name="reason"
                        placeholder="Void reason"
                        aria-label="Void reason"
                        required
                      /><button>Void</button>
                    </form>
                  {/if}
                  {#if ['issued', 'sent', 'partially_paid', 'overdue'].includes(String(invoice.state))}
                    <form method="POST" action="?/createInvoiceAdjustment" class="payment-form">
                      <input type="hidden" name="originalInvoiceId" value={invoice.id} />
                      <select name="adjustmentType" aria-label="Adjustment type">
                        <option value="credit">Credit</option><option value="debit">Debit</option
                        ><option value="correction">Correction</option>
                      </select>
                      <input
                        name="amountMinor"
                        placeholder="Minor-unit amount"
                        aria-label="Adjustment amount"
                        required
                      />
                      <input
                        name="reason"
                        placeholder="Reason"
                        aria-label="Adjustment reason"
                        required
                      />
                      <button>Create adjustment</button>
                    </form>
                  {/if}{/if}
              </div>
            </article>{:else}<div class="empty">No invoice drafts.</div>{/each}
        </section>
      </div>
    {:else if data.section === 'finance' && data.finance}
      <form class="filter-form">
        <label
          >Project<select
            name="project"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >{#each availableProjects as project}<option
                value={project.id}
                selected={project.id === data.selectedProjectId}
                >{project.project_number} — {project.name}</option
              >{/each}</select
          ></label
        >
      </form>
      <div class="finance-grid">
        {#each [['Approved cost', data.finance.approvedCostMinor], ['Revenue candidate', data.finance.revenueCandidateMinor], ['Contribution margin', data.finance.contributionMarginMinor], ['Invoiced', data.finance.invoicedMinor], ['Paid', data.finance.paidMinor], ['Receivable', data.finance.receivableMinor], ['Approved unbilled WIP', data.finance.approvedUnbilledWipMinor], ['Unapproved WIP', data.finance.unapprovedWipMinor]] as metric}<section
            class="metric"
          >
            <span>{metric[0]}</span><strong>{money(metric[1], data.finance.currency)}</strong>
          </section>{/each}
      </div>
      <p class="finance-note">
        Contribution margin is project revenue less approved project cost. It is not company net
        profit.
      </p>
      <section class="record-list full forecast-panel">
        <div class="panel-title">
          <div>
            <h2>Forecast and budget control</h2>
            <p>
              Forecasts use actual records first and only use configured planning data for the
              remaining work. They never create actual time or billing sources.
            </p>
          </div>
          <span
            >{data.finance.forecastAvailable
              ? 'Planning basis available'
              : 'No detailed plan'}</span
          >
        </div>
        <div class="finance-grid">
          {#each [['Planned remaining', data.finance.plannedRemainingMinutes === null ? '—' : `${(Number(data.finance.plannedRemainingMinutes) / 60).toFixed(1)} h`], ['ETC direct cost', data.finance.estimateToCompleteMinor === null ? '—' : money(data.finance.estimateToCompleteMinor, data.finance.currency)], ['EAC direct cost', data.finance.estimateAtCompletionCostMinor === null ? '—' : money(data.finance.estimateAtCompletionCostMinor, data.finance.currency)], ['Expected final margin', data.finance.expectedFinalMarginMinor === null ? '—' : money(data.finance.expectedFinalMarginMinor, data.finance.currency)], ['Hours consumed', data.finance.hoursConsumedBps === null ? '—' : `${(Number(data.finance.hoursConsumedBps) / 100).toFixed(1)}%`], ['Travel budget used', data.finance.travelBudgetConsumedBps === null ? '—' : `${(Number(data.finance.travelBudgetConsumedBps) / 100).toFixed(1)}%`]] as metric}<section
              class="metric"
            >
              <span>{metric[0]}</span><strong>{metric[1]}</strong>
            </section>{/each}
        </div>
        {#if data.finance.alerts?.length}<div class="alert-strip" role="status">
            {#each data.finance.alerts as alert}<span>{String(alert).replaceAll('_', ' ')}</span
              >{/each}
          </div>{/if}
      </section>
      {#if data.portfolio}<section class="record-list full economics-list">
          <div class="panel-title">
            <div>
              <h2>Portfolio views</h2>
              <p>
                Admin/Finance-only aggregates remain grouped by currency and drill back to the
                selected project economics.
              </p>
            </div>
            <span>{data.portfolio.projects?.length ?? 0} projects</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead
                ><tr
                  ><th>Project</th><th>Client</th><th>Currency</th><th>Approved hours</th><th
                    >Revenue candidate</th
                  ><th>Direct cost</th><th>Contribution</th><th>WIP</th></tr
                ></thead
              >
              <tbody
                >{#each data.portfolio.projects ?? [] as row}<tr
                    ><td>{String(row.projectNumber)} · {String(row.projectName)}</td><td
                      >{String(row.clientName)}</td
                    ><td>{String(row.currency)}</td><td
                      >{(Number(row.approvedMinutes ?? 0) / 60).toFixed(1)} h</td
                    ><td>{money(String(row.revenueCandidateMinor), String(row.currency))}</td><td
                      >{money(String(row.approvedCostMinor), String(row.currency))}</td
                    ><td>{money(String(row.contributionMarginMinor), String(row.currency))}</td><td
                      >{money(String(row.approvedUnbilledWipMinor), String(row.currency))}</td
                    ></tr
                  >{:else}<tr><td colspan="8">No finance projects are available.</td></tr
                  >{/each}</tbody
              >
            </table>
          </div>
          <div class="table-wrap">
            <table>
              <thead
                ><tr
                  ><th>Worker</th><th>Currency</th><th>Approved hours</th><th>Billable hours</th><th
                    >Revenue attributed</th
                  ><th>Loaded labor cost</th><th>Travel / expense</th><th>Contribution</th></tr
                ></thead
              >
              <tbody
                >{#each data.portfolio.byWorker ?? [] as row}<tr
                    ><td>{String(row.workerName)}</td><td>{String(row.currency)}</td><td
                      >{(Number(row.actualMinutes ?? 0) / 60).toFixed(1)} h</td
                    ><td>{(Number(row.billableMinutes ?? 0) / 60).toFixed(1)} h</td><td
                      >{money(String(row.revenue), String(row.currency))}</td
                    ><td>{money(String(row.internalCost), String(row.currency))}</td><td
                      >{money(String(row.expenseCost), String(row.currency))}</td
                    ><td>{money(String(row.contribution), String(row.currency))}</td></tr
                  >{:else}<tr><td colspan="8">No approved worker economics are available.</td></tr
                  >{/each}</tbody
              >
            </table>
          </div>
        </section>{/if}
      <section class="record-list full">
        <div class="panel-title">
          <div>
            <h2>Finance configuration</h2>
            <p>
              Rates are effective-dated and resolved by assignment, category, activity, and project
              scope.
            </p>
          </div>
          <span>Exact minor units</span>
        </div>
        {#if !isAuditor}<div class="management-stack compact-stack">
            <form method="POST" action="?/createCompensationRule" class="admin-form-grid">
              <h3>Worker compensation</h3>
              <label
                >Worker<select name="workerId" required
                  ><option value="">Select worker</option
                  >{#each data.workers ?? [] as worker}<option value={worker.id}
                      >{worker.name} · {worker.role}</option
                    >{/each}</select
                ></label
              >
              <label
                >Project scope<select name="projectId"
                  ><option value="">Global</option>{#each availableProjects as project}<option
                      value={project.id}
                      selected={project.id === data.selectedProjectId}
                      >{project.project_number}</option
                    >{/each}</select
                ></label
              >
              <label
                >Currency<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              >
              <label
                >Rule type<select name="ruleType"
                  ><option value="Hourly">Hourly</option><option value="Daily">Daily</option><option
                    value="FixedPerBillingPeriod">Fixed per billing period</option
                  ><option value="FixedProjectAmount">Fixed project amount</option><option
                    value="PercentageOfEligibleClientLabor"
                    >Percentage of eligible client labor</option
                  ><option value="CustomApprovedAdjustment">Custom approved adjustment</option
                  ></select
                ></label
              >
              <label
                >Rate (minor units)<input
                  name="rateMinor"
                  type="number"
                  min="0"
                  value="0"
                  required
                /></label
              >
              <label
                >Rate basis<select name="rateBasis"
                  ><option value="hourly">Hourly</option><option value="daily">Daily</option
                  ></select
                ></label
              >
              <label
                >Percentage (basis points)<input
                  name="percentageBps"
                  type="number"
                  min="0"
                  max="10000"
                  placeholder="e.g. 5500 = 55%"
                /></label
              >
              <label
                >Percentage basis<select name="percentageBasis"
                  ><option value="CLIENT_LABOR_BEFORE_TAX">Client labor before tax</option><option
                    value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT"
                    >Client labor after approved discount</option
                  ><option value="ISSUED_ELIGIBLE_LABOR">Issued eligible labor</option><option
                    value="COLLECTED_ELIGIBLE_LABOR">Collected eligible labor</option
                  ></select
                ></label
              >
              <label
                >Settlement trigger<select name="settlementTrigger"
                  ><option value="ON_APPROVED_BILLABLE_LABOR">Approved billable labor</option
                  ><option value="ON_INVOICE_ISSUE">Invoice issue</option><option
                    value="ON_CLIENT_PAYMENT">Client payment</option
                  ></select
                ></label
              >
              <label
                >Daily guarantee (minutes)<input
                  name="dailyGuaranteeMinutes"
                  type="number"
                  min="0"
                  max="1440"
                /></label
              >
              <label>Effective from<input name="effectiveFrom" type="date" required /></label>
              <button>Save compensation rule</button>
            </form>
            <form method="POST" action="?/createClientLaborRate" class="admin-form-grid">
              <h3>Client labor rate</h3>
              <input type="hidden" name="projectId" value={data.selectedProjectId} />
              <label
                >Worker scope<select name="workerId"
                  ><option value="">All assigned workers</option
                  >{#each data.workers ?? [] as worker}<option value={worker.id}
                      >{worker.name}</option
                    >{/each}</select
                ></label
              >
              <label
                >Time category<input
                  name="category"
                  placeholder="regular, overtime, travel"
                /></label
              >
              <label
                >Currency<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              >
              <label
                >Hourly rate (minor units)<input
                  name="hourlyRateMinor"
                  type="number"
                  min="0"
                  required
                /></label
              >
              <label
                >Overtime method<select name="overtimeMethod"
                  ><option value="BASE_RATE_MULTIPLIER">Base rate multiplier</option><option
                    value="NONE">None</option
                  ><option value="FIXED_RATE">Fixed rate</option><option
                    value="FIXED_ADDITION_PER_HOUR">Fixed addition per hour</option
                  ><option value="PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME"
                    >Percentage of eligible overtime</option
                  ></select
                ></label
              >
              <label
                >Overtime multiplier (bps)<input
                  name="overtimeMultiplierBps"
                  type="number"
                  min="0"
                  value="15000"
                /></label
              >
              <label>Effective from<input name="effectiveFrom" type="date" required /></label>
              <label class="check"
                ><input name="eligibleForPercentage" type="checkbox" checked /> Eligible for percentage
                compensation</label
              >
              <button>Save client rate</button>
            </form>
            <form method="POST" action="?/createInternalCostRule" class="admin-form-grid">
              <h3>Internal loaded cost</h3>
              <input type="hidden" name="projectId" value={data.selectedProjectId} />
              <label
                >Worker<select name="workerId" required
                  ><option value="">Select worker</option
                  >{#each data.workers ?? [] as worker}<option value={worker.id}
                      >{worker.name}</option
                    >{/each}</select
                ></label
              >
              <label
                >Currency<select name="currency"
                  ><option>USD</option><option>BRL</option><option>EUR</option></select
                ></label
              >
              <label
                >Hourly cost (minor units)<input
                  name="hourlyRateMinor"
                  type="number"
                  min="0"
                  required
                /></label
              >
              <label>Cost method<input name="costMethod" value="loaded_cost" required /></label>
              <label
                >Overtime method<select name="overtimeMethod"
                  ><option value="BASE_RATE_MULTIPLIER">Base rate multiplier</option><option
                    value="NONE">None</option
                  ><option value="FIXED_RATE">Fixed rate</option><option
                    value="FIXED_ADDITION_PER_HOUR">Fixed addition per hour</option
                  ></select
                ></label
              >
              <label
                >Overtime multiplier (bps)<input
                  name="overtimeMultiplierBps"
                  type="number"
                  min="0"
                  value="15000"
                /></label
              >
              <label>Effective from<input name="effectiveFrom" type="date" required /></label>
              <button>Save internal cost</button>
            </form>
          </div>{/if}
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <h2>Time economics review</h2>
          <span>{data.finance.timeEconomics?.length ?? 0} records</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>Date</th><th>Category</th><th>Minutes</th><th>Billable</th><th>State</th><th
                  >Billing</th
                ><th>Client revenue</th><th>Loaded cost</th><th>Worker compensation</th><th
                  >Configuration</th
                ></tr
              ></thead
            ><tbody
              >{#each data.finance.timeEconomics ?? [] as row}<tr
                  ><td>{String(row.workDate)}</td><td>{String(row.category)}</td><td
                    >{String(row.actualMinutes)}</td
                  ><td>{String(row.clientBillableMinutes ?? 0)}</td><td
                    >{String(row.approvalState)}</td
                  ><td>{String(row.billingStatus ?? 'unlocked')}</td><td
                    >{money(String(row.clientRevenueMinor), data.finance.currency)}</td
                  ><td>{money(String(row.internalCostMinor), data.finance.currency)}</td><td
                    >{money(String(row.workerCompensationMinor), data.finance.currency)}</td
                  ><td
                    >{row.clientRateConfigured && row.internalCostConfigured
                      ? 'Complete'
                      : 'Rate review'}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="10">No time economics are available for this project.</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <h2>Expense economics</h2>
          <span>{data.finance.expenseEconomics?.length ?? 0} records</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>Date</th><th>Category</th><th>Treatment</th><th>Direct cost</th><th
                  >Client revenue</th
                ></tr
              ></thead
            ><tbody
              >{#each data.finance.expenseEconomics ?? [] as row}<tr
                  ><td>{String(row.spentOn)}</td><td>{String(row.category)}</td><td
                    >{String(row.treatment)}</td
                  ><td>{money(String(row.costMinor), data.finance.currency)}</td><td
                    >{money(String(row.revenueMinor), data.finance.currency)}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="5">No approved expenses are available for this project.</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <div>
            <h2>Compensation settlements</h2>
            <p>Finance-only finalization of approved compensation for the selected project.</p>
          </div>
          <span>{data.settlements?.length ?? 0}</span>
        </div>
        {#if !isAuditor}<form method="POST" action="?/settleCompensation" class="admin-form-grid">
            <input type="hidden" name="projectId" value={data.selectedProjectId} />
            <label
              >Worker<select name="workerId" required
                ><option value="">Select worker</option>{#each data.workers ?? [] as worker}<option
                    value={worker.id}>{worker.name}</option
                  >{/each}</select
              ></label
            >
            <label>Period start<input name="periodStart" type="date" required /></label>
            <label>Period end<input name="periodEnd" type="date" required /></label>
            <button>Finalize compensation</button>
          </form>{/if}
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>Worker</th><th>Period</th><th>Basis</th><th>Source</th><th>Amount</th><th
                  >State</th
                ></tr
              ></thead
            ><tbody
              >{#each data.settlements ?? [] as settlement}<tr
                  ><td>{String(settlement.workerName)}</td><td
                    >{String(settlement.periodStart)} → {String(settlement.periodEnd)}</td
                  ><td>{String(settlement.sourceBasis)}</td><td
                    >{money(String(settlement.sourceAmountMinor), String(settlement.currency))}</td
                  ><td>{money(String(settlement.amountMinor), String(settlement.currency))}</td><td
                    >{String(settlement.state)}</td
                  ></tr
                >{:else}<tr><td colspan="6">No settlements recorded for this project.</td></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
      <section class="record-list full economics-list">
        <div class="panel-title">
          <div>
            <h2>Worker reimbursement queue</h2>
            <p>Reimbursements are separate from customer expense billing status.</p>
          </div>
          <span>{data.reimbursements?.length ?? 0}</span>
        </div>
        {#each data.reimbursements ?? [] as reimbursement}<article class="record-card">
            <div>
              <strong>{reimbursement.workerName} · {reimbursement.vendor}</strong><small
                >{reimbursement.spentOn} · {reimbursement.category} · {reimbursement.reimbursementState}</small
              >
            </div>
            {#if !isAuditor && reimbursement.reimbursementState !== 'reimbursed'}<form
                method="POST"
                action="?/recordReimbursement"
              >
                <input type="hidden" name="expenseId" value={reimbursement.id} />
                <input
                  type="hidden"
                  name="amountMinor"
                  value={reimbursement.reimbursementAmountMinor}
                />
                <input
                  name="reference"
                  placeholder="Payment reference"
                  aria-label="Payment reference"
                  required
                />
                <button>Mark reimbursed</button>
              </form>{:else}<strong
                >{money(
                  reimbursement.reimbursementAmountMinor,
                  String(reimbursement.currency),
                )}</strong
              >{/if}
          </article>{:else}<div class="empty">
            No approved worker-paid expenses require reimbursement.
          </div>{/each}
      </section>
    {:else if data.section === 'ledger'}
      <section class="record-list full ledger-list">
        <div class="panel-title">
          <div>
            <h2>Master Invoice / Cost / Collection Ledger</h2>
            <p>
              Each row reconciles the issued invoice, locked source records, direct cost,
              collection, outstanding balance, and contribution.
            </p>
          </div>
          <span>{data.ledger?.length ?? 0} invoices</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead
              ><tr
                ><th>Invoice</th><th>Client / project</th><th>Stream</th><th>Gross</th><th
                  >Collected</th
                ><th>Outstanding</th><th>Direct cost</th><th>Contribution</th><th>Sources</th><th
                  >Status</th
                ></tr
              ></thead
            ><tbody
              >{#each data.ledger ?? [] as row}<tr
                  ><td>{String(row.invoiceNumber ?? '—')}</td><td
                    >{String(row.clientNumber)} · {String(row.projectNumber)}</td
                  ><td>{String(row.streamType)}</td><td
                    >{money(String(row.totalMinor), String(row.currency))}</td
                  ><td>{money(String(row.collectedMinor), String(row.currency))}</td><td
                    >{money(String(row.outstandingMinor), String(row.currency))}</td
                  ><td>{money(String(row.directCostMinor), String(row.currency))}</td><td
                    >{money(String(row.contributionMinor), String(row.currency))}</td
                  ><td>{Array.isArray(row.sources) ? row.sources.length : 0}</td><td
                    >{String(row.paymentStatus)}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="10"
                    >No issued invoice records match the current authorization scope.</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      </section>
    {:else if data.section === 'accounting'}
      <div class="management-stack">
        {#if !isAuditor}<form method="POST" action="?/createAccountingPack" class="admin-form-grid">
            <h2>Generate monthly Accounting Pack</h2>
            <p class="form-help">
              The pack contains invoice register, collections, worker/direct costs, expenses, AR,
              contribution, source counts, and deterministic PDF/XLSX/CSV/JSON artifacts.
            </p>
            <label>Period start<input name="periodStart" type="date" required /></label><label
              >Period end<input name="periodEnd" type="date" required /></label
            ><button>Generate pack</button>
          </form>
          <form method="POST" action="?/runJobs" class="entry-panel">
            <h2>Process durable finance jobs</h2>
            <p>
              Runs queued PDF and Accounting Pack artifact jobs with idempotent output registration.
            </p>
            <button>Run due jobs</button>
          </form>{/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>Accounting Pack register</h2>
            <span>{data.packs?.length ?? 0} packs</span>
          </div>
          {#each data.packs ?? [] as pack}<article class="invoice-row">
              <div>
                <strong>{String(pack.period_start)} → {String(pack.period_end)}</strong><small
                  >{String(pack.state)} · {String(pack.created_at)}</small
                >
              </div>
              <div class="record-actions">
                <a
                  class="preview-link"
                  href={`${base}/app/api/accounting-pack/${String(pack.id)}/pdf`}>PDF</a
                ><a
                  class="preview-link"
                  href={`${base}/app/api/accounting-pack/${String(pack.id)}/xlsx`}>XLSX</a
                ><a
                  class="preview-link"
                  href={`${base}/app/api/accounting-pack/${String(pack.id)}/invoice_csv`}
                  >Invoice CSV</a
                >{#if !isAuditor && String(pack.state) !== 'final'}<form
                    method="POST"
                    action="?/finalizeAccountingPack"
                  >
                    <input type="hidden" name="packId" value={pack.id} /><button>Finalize</button>
                  </form>{/if}
              </div>
            </article>{:else}<div class="empty">
              No Accounting Packs have been generated.
            </div>{/each}
        </section>
      </div>
    {:else if data.section === 'profile'}
      <div class="management-stack">
        <section class="entry-panel">
          <span class="portal-kicker">WORKFORCE PROFILE</span>
          <h2>Skills and availability</h2>
          <p>
            Keep your own workforce profile current without exposing compensation or client rates.
          </p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Skill</th><th>Proficiency</th><th>Verified</th></tr></thead><tbody
                >{#each data.skills ?? [] as skill}<tr
                    ><td>{skill.name}</td><td>{skill.proficiency}/5</td><td
                      >{skill.verified_at ? 'verified' : 'self-reported'}</td
                    ></tr
                  >{:else}<tr><td colspan="3">No skills recorded.</td></tr>{/each}</tbody
              >
            </table>
          </div>
          {#if !isAuditor}<form method="POST" action="?/setAvailability" class="admin-form-grid">
              <input type="hidden" name="workerId" value={data.user.id ?? ''} /><label
                >Starts<input name="startsAt" type="datetime-local" required /></label
              ><label>Ends<input name="endsAt" type="datetime-local" required /></label><label
                >Availability<select name="availability"
                  ><option value="available">Available</option><option value="unavailable"
                    >Unavailable</option
                  ><option value="tentative">Tentative</option></select
                ></label
              ><label>Note<textarea name="note" rows="2"></textarea></label><button
                >Save availability</button
              >
            </form>{/if}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Window</th><th>Status</th><th>Note</th></tr></thead><tbody
                >{#each data.availability ?? [] as item}<tr
                    ><td
                      >{String(item.starts_at).replace('T', ' ').slice(0, 16)} → {String(
                        item.ends_at,
                      )
                        .replace('T', ' ')
                        .slice(0, 16)}</td
                    ><td>{item.availability}</td><td>{item.note ?? '—'}</td></tr
                  >{:else}<tr><td colspan="3">No availability windows recorded.</td></tr
                  >{/each}</tbody
              >
            </table>
          </div>
        </section>
        <section class="entry-panel security-panel">
          <span class="portal-kicker">ACCOUNT SECURITY</span>
          <h2>{data.user.name}</h2>
          <p>{data.user.email} · {data.user.role ?? 'worker'}</p>
          <p>
            Use step-up authentication immediately before payment, invoice void, rate, invitation,
            or final-pack actions.
          </p>
          <form onsubmit={stepUp}>
            <label
              >Password<input
                name="password"
                type="password"
                minlength="12"
                autocomplete="current-password"
                required
              /></label
            ><button>Verify for protected actions</button>
          </form>
          {#if stepUpMessage}<p class="action-message" role="status">{stepUpMessage}</p>{/if}
        </section>
      </div>
    {:else if data.section === 'notifications'}
      <section class="record-list full">
        <div class="panel-title">
          <h2>Activity inbox</h2>
          <span>{data.records?.length ?? 0}</span>
        </div>
        {#each data.records ?? [] as row}<article>
            <div>
              <strong>{String(row.kind).replaceAll('_', ' ')}</strong><small
                >{String(row.created_at).replace('T', ' ').slice(0, 16)}</small
              >
            </div>
            <span class="state-tag">{row.read_at ? 'read' : 'new'}</span>
          </article>{:else}<div class="empty">No notifications.</div>{/each}
      </section>
    {:else if data.section === 'audit'}
      <section class="record-list full">
        <div class="panel-title">
          <h2>Append-only security and finance audit</h2>
          <span>{data.audit?.length ?? 0} events</span>
        </div>
        {#each data.audit ?? [] as row}<article>
            <div>
              <strong>{String(row.action).replaceAll('_', ' ')}</strong><small
                >{String(row.entity_type)} · {String(row.entity_id)} · {String(row.occurred_at)
                  .replace('T', ' ')
                  .slice(0, 19)}</small
              >
            </div>
            <code>{String(row.details_json ?? '{}')}</code>
          </article>{:else}<div class="empty">No audit events recorded.</div>{/each}
      </section>
    {:else}
      <section class="record-list full">
        <div class="panel-title"><h2>{titles[data.section]}</h2></div>
        <div class="empty">Nothing is available in this view yet.</div>
      </section>
    {/if}
  </main>
  <nav class="bottom-nav" aria-label="Mobile navigation">
    {#each navigation.slice(0, 5) as item}<a
        class:active={data.section === item[0]}
        href={href(item[0])}>{item[1]}</a
      >{/each}
  </nav>
</div>
