<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { purgeUserCache, queuedCount } from './offline';

  type Row = Record<string, string | number | boolean | null>;
  type PortalData = {
    user: { name: string; email: string; role?: string };
    section: string;
    projects?: Row[];
    clients?: Row[];
    workers?: Row[];
    records?: Row[];
    billingRules?: Row[];
    invoices?: Row[];
    selectedProjectId?: string;
    periodStart?: string;
    periodEnd?: string;
    pay?: {
      currency: string;
      approvedMinutes: number;
      pendingMinutes: number;
      estimatedApprovedMinor: string;
      estimatedPendingMinor: string;
      approvedReimbursementMinor: string;
      pendingReimbursementMinor: string;
    };
    finance?: {
      currency: string;
      approvedCostMinor: string;
      revenueCandidateMinor: string;
      contributionMarginMinor: string;
      invoicedMinor: string;
      paidMinor: string;
      receivableMinor: string;
    } | null;
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
  const navigation = [
    ['today', 'Today'],
    ['time', 'Time'],
    ['reports', 'Reports'],
    ['expenses', 'Expenses'],
    ['projects', 'Projects'],
    ['pay', 'My Pay'],
    ['notifications', 'Notifications'],
  ];
  const admin = [
    ['planning', 'Planning'],
    ['approvals', 'Approvals'],
    ['billing', 'Billing'],
    ['finance', 'Finance'],
  ];
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
  };
  const isManager = $derived(Boolean(data.user.role && data.user.role !== 'worker'));
  const money = (minor: string | number | null | undefined, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      Number(minor ?? 0) / 100,
    );
  const href = (section: string) =>
    section === 'today' ? `${base}/app/` : `${base}/app/${section}`;

  onMount(() => {
    online = navigator.onLine;
    void queuedCount().then((value) => (queue = value));
    const update = () => (online = navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register(`${base}/app/service-worker.js`, {
        scope: `${base}/app/`,
      });
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  });
  async function logout() {
    await fetch(`${base}/app/api/auth/sign-out`, { method: 'POST' });
    await fetch(`${base}/app/demo-login`, { method: 'DELETE' });
    await purgeUserCache();
    location.assign(`${base}/app/login`);
  }
</script>

<svelte:head
  ><title>{titles[data.section]} | J&A Portal</title><link
    rel="manifest"
    href={`${base}/app/manifest.webmanifest`}
  /><meta name="theme-color" content="#17191b" /></svelte:head
>
<div class="portal-layout">
  <aside>
    <a class="portal-brand" href={`${base}/app/`}
      ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
    >
    <nav aria-label="Worker navigation">
      {#each navigation as item}<a class:active={data.section === item[0]} href={href(item[0])}
          ><span>{item[1]}</span></a
        >{/each}
    </nav>
    {#if isManager}<div class="admin-nav">
        <small>MANAGEMENT</small>{#each admin as item}<a
            class:active={data.section === item[0]}
            href={href(item[0])}>{item[1]}</a
          >{/each}
      </div>{/if}
    <button class="signout" onclick={logout}>Sign out</button>
  </aside>
  <header>
    <div>
      <span class:offline={!online} class="connection"><i></i>{online ? 'Online' : 'Offline'}</span
      >{#if queue > 0}<span class="queue">{queue} queued</span>{/if}
    </div>
    <div class="user"><span>{data.user.name}</span><small>{data.user.role ?? 'worker'}</small></div>
  </header>
  <main>
    <div class="portal-title">
      <div>
        <p class="portal-kicker">J&A / {data.section.toUpperCase()}</p>
        <h1>{titles[data.section]}</h1>
      </div>
    </div>
    {#if form?.message}<p class:success={form.success} class="action-message" role="status">
        {form.message}
      </p>{/if}

    {#if data.section === 'today'}
      {#if data.dashboard}
        <div class="dashboard-hero">
          <div>
            <span class="portal-kicker">OPERATIONS CONTROL</span>
            <h2>Work in motion</h2>
            <p>Projects, field records and billing readiness as of 18 Aug 2026.</p>
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
            <span>{data.projects?.length ?? 0} records</span>
          </div>
          {#each data.projects ?? [] as project}<a
              class="project-board-row"
              href={`${base}/app/projects/${project.id}`}
              ><span><b>{project.project_number}</b><strong>{project.name}</strong></span><small
                >{project.status} · {project.timezone}</small
              ><i>OPEN →</i></a
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
          </section>
        </div>
      {/if}
    {:else if data.section === 'time'}
      <div class="worker-form">
        <form method="POST" action="?/createTime" class="entry-panel">
          <h2>Log actual time</h2>
          <p>Enter only minutes actually worked.</p>
          <label
            >Project<select name="projectId" required
              ><option value="">Select assignment</option
              >{#each data.projects ?? [] as project}<option value={project.id}
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
        </form>
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
              {#if row.approval_state === 'draft'}<form method="POST" action="?/submitTime">
                  <input type="hidden" name="id" value={row.id} /><input
                    type="hidden"
                    name="version"
                    value={row.version}
                  /><button>Submit</button>
                </form>{/if}
            </article>{:else}<div class="empty">No time recorded.</div>{/each}
        </section>
      </div>
    {:else if data.section === 'expenses'}
      <div class="worker-form">
        <form
          method="POST"
          action="?/createExpense"
          enctype="multipart/form-data"
          class="entry-panel"
        >
          <h2>Record expense</h2>
          <label
            >Project<select name="projectId" required
              ><option value="">Select assignment</option
              >{#each data.projects ?? [] as project}<option value={project.id}
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
              ><option value="airfare">Airfare</option><option value="meals">Meals</option><option
                value="materials">Materials</option
              ><option value="other">Other</option></select
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
                >Client</option
              ></select
            ></label
          ><label
            >Client treatment<select name="clientTreatment"
              ><option value="non_billable">Non-billable</option><option value="reimbursable"
                >Reimbursable</option
              ><option value="all_in">All-in project cost</option></select
            ></label
          ><label class="check"
            ><input name="receiptRequired" type="checkbox" /> Receipt required</label
          ><label
            >Receipt image or PDF<input
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
            /></label
          ><button>Save draft</button>
        </form>
        <section class="record-list">
          <div class="panel-title">
            <h2>Recent expenses</h2>
            <span>{data.records?.length ?? 0}</span>
          </div>
          {#each data.records ?? [] as row}<article class="record-card">
              <div>
                <strong>{row.vendor} · {money(row.amount_minor, String(row.currency))}</strong
                ><small>{row.spent_on} · {row.project_number} · {row.approval_state}</small>
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
        <div class="report-forms">
          <details open>
            <summary
              ><span>01</span>
              <div>
                <strong>Daily field report</strong><small
                  >Shift summary, blockers and next-day plan</small
                >
              </div></summary
            >
            <form method="POST" action="?/createDailyReport" class="entry-panel report-form">
              <label
                >Project<select name="projectId" required
                  ><option value="">Select assignment</option
                  >{#each data.projects ?? [] as project}<option value={project.id}
                      >{project.project_number} — {project.name}</option
                    >{/each}</select
                ></label
              >
              <div class="two-up">
                <label>Work date<input name="workDate" type="date" required /></label><label
                  >Site / shift<input name="siteShift" placeholder="Line 4 · first shift" /></label
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
            <form method="POST" action="?/createTechnicalReport" class="entry-panel report-form">
              <label
                >Project<select name="projectId" required
                  ><option value="">Select assignment</option
                  >{#each data.projects ?? [] as project}<option value={project.id}
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
                  >PLC platform<input name="plcPlatform" placeholder="Rockwell Automation" /></label
                ><label>Controller<input name="controller" placeholder="ControlLogix 5580" /></label
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
        </div>
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
    {:else if data.section === 'projects'}
      <div class="management-stack">
        {#if data.clients}<form method="POST" action="?/createClient" class="admin-form-grid">
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
            ><input type="hidden" name="expectedMinutesPerDay" value="600" />
            ><button>Create project</button>
          </form>
          <form method="POST" action="?/assignWorker" class="admin-form-grid">
            <h2>Assign worker</h2>
            <label
              >Project<select name="projectId" required
                >{#each data.projects ?? [] as project}<option value={project.id}
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
          </form>{/if}
        <section class="record-list full">
          <div class="panel-title">
            <h2>Authorized projects</h2>
            <span>{data.projects?.length ?? 0}</span>
          </div>
          {#each data.projects ?? [] as row}<a
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
      </div>
    {:else if data.section === 'planning'}
      <div class="management-stack">
        <form method="POST" action="?/createPlanning" class="admin-form-grid">
          <h2>Publish field assignment</h2>
          <label
            >Project<select name="projectId" required
              >{#each data.projects ?? [] as project}<option value={project.id}
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
              {#if row.review_stage === 'report'}<form method="POST" action="?/reviewReport">
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
    {:else if data.section === 'billing'}
      <div class="management-stack">
        <section class="record-list">
          <div class="panel-title">
            <h2>Billing rules</h2>
            <span>{data.billingRules?.length ?? 0}</span>
          </div>
          {#each data.billingRules ?? [] as rule}<article>
              <div>
                <strong>{rule.project_number} · {rule.stream_type}</strong><small
                  >{rule.cadence_type} · {rule.currency}</small
                >
              </div>
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
                {#if invoice.state === 'draft'}<form method="POST" action="?/approveInvoice">
                    <input type="hidden" name="invoiceId" value={invoice.id} /><button
                      >Approve</button
                    >
                  </form>{:else if invoice.state === 'approved'}<form
                    method="POST"
                    action="?/issueInvoice"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} /><button>Issue</button
                    >
                  </form>{:else if invoice.state === 'issued'}<form
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
            >{#each data.projects ?? [] as project}<option
                value={project.id}
                selected={project.id === data.selectedProjectId}
                >{project.project_number} — {project.name}</option
              >{/each}</select
          ></label
        >
      </form>
      <div class="finance-grid">
        {#each [['Approved cost', data.finance.approvedCostMinor], ['Revenue candidate', data.finance.revenueCandidateMinor], ['Contribution margin', data.finance.contributionMarginMinor], ['Invoiced', data.finance.invoicedMinor], ['Paid', data.finance.paidMinor], ['Receivable', data.finance.receivableMinor]] as metric}<section
            class="metric"
          >
            <span>{metric[0]}</span><strong>{money(metric[1], data.finance.currency)}</strong>
          </section>{/each}
      </div>
      <p class="finance-note">
        Contribution margin is project revenue less approved project cost. It is not company net
        profit.
      </p>
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
    {:else}
      <section class="record-list full">
        <div class="panel-title"><h2>{titles[data.section]}</h2></div>
        <div class="empty">No authorized records for this view.</div>
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
