<script lang="ts">
  import { base } from '$app/paths';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
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
  const money = (minor: string | number | null | undefined) =>
    new Intl.NumberFormat('en-US', {
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
</script>

<svelte:head><title>{project.project_number} | J&A Portal</title></svelte:head>
<main class="project-page">
  <nav class="detail-nav">
    <a href={`${base}/app/projects`}>← Projects</a><a href={`${base}/app/`}>Operations dashboard</a>
  </nav>
  <header class="project-header">
    <div>
      <p class="portal-kicker">{project.client_number} / {project.project_number}</p>
      <h1>{project.name}</h1>
      <p>{project.client_name} · {project.site_name} · {project.country}</p>
    </div>
    <span class="project-state">{project.status}</span>
  </header>
  <section class="project-contract">
    <div><span>PO / REFERENCE</span><strong>{project.po_number}</strong></div>
    <div>
      <span>COMMERCIAL MODEL</span><strong
        >{String(project.billing_model).replaceAll('_', ' ')}</strong
      >
    </div>
    <div>
      <span>EXPECTED DAY</span><strong>{Number(project.expected_minutes_per_day) / 60} h</strong>
    </div>
    <div><span>TIMEZONE</span><strong>{project.timezone}</strong></div>
    <div>
      <span>START / TARGET</span><strong
        >{project.start_date ?? '—'} → {project.planned_end_date ?? '—'}</strong
      >
    </div>
    <div>
      <span>ACTUAL END</span><strong>{project.actual_end_date ?? 'Open / not closed'}</strong>
    </div>
  </section>

  {#if overview.financial}<section class="project-finance">
      <div class="finance-heading">
        <div>
          <p class="portal-kicker">PROJECT FINANCIAL POSITION</p>
          <h2>{money(cost)} committed</h2>
        </div>
        <div class="budget-ring" role="img" aria-label={`${consumed.toFixed(0)}% budget used`}>
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
          <span>{consumed.toFixed(0)}%<small>budget used</small></span>
        </div>
      </div>
      <div class="project-kpis">
        <article><span>PO / PROJECT BUDGET</span><strong>{money(budget)}</strong></article>
        <article>
          <span>PLANNED HOURS</span><strong
            >{plannedMinutes ? (plannedMinutes / 60).toFixed(0) : '—'} h</strong
          >
        </article>
        <article>
          <span>ACTUAL HOURS</span><strong>{(overview.actualMinutes / 60).toFixed(1)} h</strong>
        </article>
        <article>
          <span>DIRECT LABOR COST</span><strong>{money(cost - totalExpenses)}</strong>
        </article>
        <article>
          <span>TRAVEL / EXPENSE</span><strong>{money(totalExpenses)}</strong><small
            >{money(allInExpenses)} stays all-in</small
          >
        </article>
        <article><span>BILLABLE VALUE</span><strong>{money(revenue)}</strong></article>
        <article class="accent">
          <span>CONTRIBUTION MARGIN</span><strong>{money(margin)}</strong><small
            >{revenue ? ((margin / revenue) * 100).toFixed(1) : '0.0'}%</small
          >
        </article>
        <article>
          <span>INVOICED</span><strong>{money(overview.financial.invoicedMinor)}</strong>
        </article>
        <article>
          <span>APPROVED UNBILLED WIP</span><strong
            >{money(overview.financial.approvedUnbilledWipMinor)}</strong
          >
        </article>
        <article>
          <span>UNAPPROVED WIP</span><strong>{money(overview.financial.unapprovedWipMinor)}</strong>
        </article>
        <article>
          <span>FORECAST ETC</span><strong
            >{overview.financial.estimateToCompleteMinor === null
              ? '—'
              : money(overview.financial.estimateToCompleteMinor)}</strong
          >
        </article>
        <article class="accent">
          <span>EXPECTED FINAL MARGIN</span><strong
            >{overview.financial.expectedFinalMarginMinor === null
              ? '—'
              : money(overview.financial.expectedFinalMarginMinor)}</strong
          >
        </article>
      </div>
    </section>{/if}

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Assigned workforce</h2>
        <span>{overview.workers.length}</span>
      </div>
      {#each overview.workers as worker}<article>
          <div class="worker-mark">
            {String(worker.name)
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </div>
          <div>
            <strong>{worker.name}</strong><small
              >{worker.assignment_role} · {worker.starts_on} → {worker.ends_on ??
                'open assignment'}</small
            >
          </div>
          <b>{Number(worker.planned_minutes ?? 0) / 60} h plan</b>
        </article>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Time by category</h2>
        <span>{(overview.actualMinutes / 60).toFixed(1)} h</span>
      </div>
      {#each overview.time as category}<article>
          <div>
            <strong>{String(category.category).replaceAll('_', ' ')}</strong><small
              >Recorded actual time</small
            >
          </div>
          <b>{(Number(category.minutes) / 60).toFixed(1)} h</b>
        </article>{/each}
    </section>
  </div>
  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Field & PLC reports</h2>
        <span>{overview.reports.length}</span>
      </div>
      {#each overview.reports as report}<a
          class="record-card-link project-record-link"
          href={`${base}/app/reports/${String(report.id)}`}
        >
          <span class:plc={report.type === 'PLC'} class="activity-code">{report.type}</span>
          <div>
            <strong>{report.title}</strong><small>{report.date} · {report.approval_state}</small>
          </div>
          {#if report.safety_related}<b class="safety-flag">SAFETY</b>{/if}
        </a>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Expense treatment</h2>
        <span>{money(totalExpenses)}</span>
      </div>
      {#each overview.expenses as expense}<a
          class="record-card-link project-record-link"
          href={`${base}/app/expenses/${String(expense.id)}`}
        >
          <span class:all-in={expense.client_treatment === 'all_in'} class="activity-code"
            >{expense.client_treatment === 'all_in' ? 'ALL-IN' : 'REIMB.'}</span
          >
          <div>
            <strong>{expense.vendor}</strong><small
              >{expense.category} · {expense.spent_on} · {expense.billing_treatment ??
                expense.client_treatment} · {expense.who_paid ?? 'worker'}</small
            >
          </div>
          <b>{money(expense.project_currency_amount_minor ?? expense.amount_minor)}</b>
        </a>{/each}
    </section>
  </div>
  <section class="detail-panel schedule-panel">
    <div class="panel-title">
      <h2>Published schedule</h2>
      <span
        >{overview.schedule
          ? `${Number(overview.schedule.monday_minutes) / 60} h Mon`
          : 'Not configured'}</span
      >
    </div>
    {#if overview.schedule}<p class="form-help">
        Expected minutes: Mon {overview.schedule.monday_minutes} · Tue {overview.schedule
          .tuesday_minutes} · Wed {overview.schedule.wednesday_minutes} · Thu {overview.schedule
          .thursday_minutes} · Fri {overview.schedule.friday_minutes} · Sat {overview.schedule
          .saturday_minutes} · Sun {overview.schedule.sunday_minutes}. This is planning context;
        actual time remains independently recorded.
      </p>{/if}
    {#each overview.planning as plan}<article>
        <div>
          <strong>{plan.worker_name}</strong><small>{plan.site} · {plan.required_skill}</small>
        </div>
        <b
          >{String(plan.starts_at).replace('T', ' ').slice(0, 16)} → {String(plan.ends_at).slice(
            11,
            16,
          )}</b
        >
      </article>{/each}
  </section>
  <section class="detail-panel">
    <div class="panel-title">
      <h2>Commercial milestones</h2>
      <span>{overview.milestones.length}</span>
    </div>
    {#each overview.milestones as milestone}<article>
        <div>
          <strong>{milestone.name}</strong><small
            >{milestone.due_on ?? 'No due date'} · {milestone.approval_state}</small
          >
        </div>
        <b>{money(milestone.amount_minor)}</b>
      </article>{:else}<div class="empty">No milestones configured.</div>{/each}
  </section>
</main>
