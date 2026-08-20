<script lang="ts">
  import type { PortalData, PortalRow } from '../portal-data';

  let {
    base,
    data,
    availableProjects,
    online,
    queue,
    syncMessage,
    money,
  }: {
    base: string;
    data: Pick<PortalData, 'dashboard' | 'records'>;
    availableProjects: PortalRow[];
    online: boolean;
    queue: number;
    syncMessage: string;
    money: (minor: string | number | null | undefined, currency?: string) => string;
  } = $props();
</script>

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
    <a class="metric" href={`${base}/app/time`}>
      <span>RECORDED HOURS</span><strong>{(data.dashboard.actualMinutes / 60).toFixed(1)}</strong>
      <p>Approved and submitted field time</p>
    </a>
    <a class="metric attention" href={`${base}/app/approvals`}>
      <span>PENDING REPORTS</span><strong>{data.dashboard.pendingReports}</strong>
      <p>Daily and PLC records awaiting review</p>
    </a>
    <a class="metric" href={`${base}/app/expenses`}>
      <span>PROJECT EXPENSES</span><strong
        >{money(data.dashboard.expenseMinor, data.dashboard.currency)}</strong
      >
      <p>All-in and reimbursable combined</p>
    </a>
    <a class="metric" href={`${base}/app/billing`}>
      <span>UPCOMING BILLING</span><strong
        >{money(data.dashboard.upcomingInvoiceMinor, data.dashboard.currency)}</strong
      >
      <p>{data.dashboard.upcomingInvoices} draft invoice streams</p>
    </a>
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
      <div class="quick-actions">
        <a href={`${base}/app/time`}>Log actual time</a><a href={`${base}/app/reports`}
          >Write field report</a
        ><a href={`${base}/app/expenses`}>Add expense</a>
      </div>
      <h2>{data.records?.[0]?.project_name ?? 'Field workspace'}</h2>
      <p>
        {data.records?.[0]
          ? `${data.records[0].site} · ${String(data.records[0].starts_at).slice(11, 16)}–${String(data.records[0].ends_at).slice(11, 16)}`
          : 'No published assignment for today.'}
      </p>
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
