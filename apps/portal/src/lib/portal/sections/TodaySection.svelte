<script lang="ts">
  import type { PortalData, PortalRow } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

  let {
    base,
    data,
    availableProjects,
    online,
    queue,
    syncMessage,
    money,
    translate,
    controlledValue,
  }: {
    base: string;
    data: Pick<PortalData, 'dashboard' | 'records'>;
    availableProjects: PortalRow[];
    online: boolean;
    queue: number;
    syncMessage: string;
    money: (minor: string | number | null | undefined, currency?: string) => string;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();
</script>

{#if data.dashboard}
  <div class="dashboard-hero">
    <div>
      <span class="portal-kicker">{translate('OPERATIONS CONTROL')}</span>
      <h2>{translate('Field operations overview')}</h2>
      <p>{translate('Current projects, field records, and billing readiness in one view.')}</p>
    </div>
    <a class="dashboard-project-count" href={`${base}/app/projects`}>
      <strong>{data.dashboard.activeProjects}<small>{translate('active projects')}</small></strong>
    </a>
  </div>
  <div class="finance-grid dashboard-metrics">
    <a class="metric" href={`${base}/app/time`}>
      <span>{translate('RECORDED HOURS')}</span><strong>{(data.dashboard.actualMinutes / 60).toFixed(1)}</strong>
      <p>{translate('Approved and submitted field time')}</p>
    </a>
    <a class="metric attention" href={`${base}/app/approvals`}>
      <span>{translate('PENDING REPORTS')}</span><strong>{data.dashboard.pendingReports}</strong>
      <p>{translate('Daily and PLC records awaiting review')}</p>
    </a>
    <a class="metric" href={`${base}/app/expenses`}>
      <span>{translate('PROJECT EXPENSES')}</span><strong
        >{money(data.dashboard.expenseMinor, data.dashboard.currency)}</strong
      >
      <p>{translate('All-in and reimbursable combined')}</p>
    </a>
    <a class="metric" href={`${base}/app/billing`}>
      <span>{translate('UPCOMING BILLING')}</span><strong
        >{money(data.dashboard.upcomingInvoiceMinor, data.dashboard.currency)}</strong
      >
      <p>{data.dashboard.upcomingInvoices} {translate('draft invoice streams')}</p>
    </a>
  </div>
  <section class="record-list dashboard-projects">
    <div class="panel-title">
      <h2>{translate('Active project board')}</h2>
      <span>{availableProjects.length} {translate('records')}</span>
    </div>
    {#each availableProjects as project}<a
        class="project-board-row"
        href={`${base}/app/projects/${project.id}`}
        ><span><b>{project.project_number}</b><strong>{project.name}</strong></span><small
          >{controlledValue('status', project.status)} · {project.timezone}</small
        ><i>{translate('Open project')}</i></a
      >{/each}
  </section>
{:else}
  <div class="portal-grid">
    <section class="assignment">
      <span class="status-chip"><b></b>{translate('TODAY / 10 H EXPECTED')}</span>
      <div class="quick-actions">
        <a href={`${base}/app/time`}>{translate('Log actual time')}</a><a href={`${base}/app/reports`}
          >{translate('Write field report')}</a
        ><a href={`${base}/app/expenses`}>{translate('Add expense')}</a>
      </div>
      <h2>{data.records?.[0]?.project_name ?? translate('Field workspace')}</h2>
      <p>
        {data.records?.[0]
          ? `${data.records[0].site} · ${String(data.records[0].starts_at).slice(11, 16)}–${String(data.records[0].ends_at).slice(11, 16)}`
          : translate('No published assignment for today.')}
      </p>
    </section>
    <section class="sync-panel">
      <span class="portal-kicker">{translate('DEVICE STATUS')}</span><strong
        >{online ? translate('Connected to J&A') : translate('Working offline')}</strong
      >
      <p>{queue} {translate(queue === 1 ? 'local mutation waiting to synchronize.' : 'local mutations waiting to synchronize.')}</p>
      {#if syncMessage}<small>{translate(syncMessage)}</small>{/if}
    </section>
  </div>
{/if}
