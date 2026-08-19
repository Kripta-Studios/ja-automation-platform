<script lang="ts">
  import { base } from '$app/paths';

  type Row = Record<string, unknown>;
  let { data } = $props();
  const report = $derived(data.report as Row);
  const project = $derived((report.project ?? {}) as Row);
  const summary = $derived((report.commercialSummary ?? {}) as Row);
  const finance = $derived((report.financialSummary ?? {}) as Row);
  const calculation = $derived((report.commercialCalculation ?? []) as Row[]);
  const dailyReports = $derived((report.dailyReports ?? []) as Row[]);
  const technicalReports = $derived((report.technicalReports ?? []) as Row[]);
  const technicalChanges = $derived((report.technicalChanges ?? []) as Row[]);
  const expenses = $derived((report.expenses ?? []) as Row[]);
  const timeSummary = $derived((report.timeSummary ?? []) as Row[]);
  const internal = $derived(String(report.audience) === 'internal');

  const display = (value: unknown, fallback = '—') =>
    value === null || value === undefined || value === '' ? fallback : String(value);
  const hours = (minutes: unknown) => `${(Number(minutes ?? 0) / 60).toFixed(1)} h`;
  const money = (
    minor: unknown,
    currency = String(summary.currency ?? project.currency ?? 'USD'),
  ) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      Number(minor ?? 0) / 100,
    );
  const reportLink = (id: unknown) => `${base}/app/reports/${String(id)}`;
</script>

<svelte:head><title>Period report · {display(project.number)}</title></svelte:head>

<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={`${base}/app/reports`}>← Reports</a><a
      href={`${base}/app/projects/${String(project.id)}`}>Open project</a
    >
  </nav>

  <header class="record-detail-header">
    <div>
      <p class="portal-kicker">{display(project.number)} / {display(report.reportType)}</p>
      <h1>{display(project.name, 'Project period report')}</h1>
      <p>
        {display(project.clientName)} · {display(report.periodStart)} → {display(report.periodEnd)}
      </p>
    </div>
    <div class="record-detail-actions">
      <span class="project-state"
        >{String(report.audience).toUpperCase()} · {display(report.state)}</span
      >
      {#if report.pdfReady}<a
          class="preview-link"
          href={`${base}/app/api/reports/${String(report.id)}/pdf`}
          target="_blank"
          rel="noreferrer">Open PDF</a
        >{/if}
    </div>
  </header>

  <section class="record-detail-grid report-calculation-grid">
    <article class="record-fact">
      <span>Actual hours</span><strong>{hours(summary.actualMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>Approved hours</span><strong>{hours(summary.approvedMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>Billable hours</span><strong>{hours(summary.billableMinutes)}</strong>
    </article>
    <article class="record-fact">
      <span>Calculated bill candidate</span><strong>{money(summary.candidateSubtotalMinor)}</strong>
    </article>
    <article class="record-fact">
      <span>Already invoiced</span><strong>{money(summary.invoicedNetMinor)}</strong>
    </article>
    <article class="record-fact">
      <span>Approved unbilled WIP</span><strong>{money(summary.approvedUnbilledWipMinor)}</strong>
    </article>
    {#if internal}
      <article class="record-fact">
        <span>Direct cost</span><strong>{money(finance.approvedCostMinor)}</strong>
      </article>
      <article class="record-fact">
        <span>Contribution</span><strong>{money(finance.contributionMarginMinor)}</strong>
      </article>
      <article class="record-fact">
        <span>Contribution margin</span><strong
          >{(Number(finance.contributionMarginBps ?? 0) / 100).toFixed(1)}%</strong
        >
      </article>
    {/if}
  </section>

  <section class="detail-panel report-breakdown">
    <div class="panel-title">
      <div>
        <h2>How this report was calculated</h2>
        <p class="form-help">
          Values are recalculated from approved source records, effective client rates, internal
          cost rules, compensation rules, daily minimums, milestones and expense treatments. Refresh
          after changing source data.
        </p>
      </div>
      <span>{display(summary.billingModel)}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr><th>Stream</th><th>Calculation basis</th><th>Minutes</th><th>Amount</th></tr></thead
        >
        <tbody>
          {#each calculation as line}
            <tr>
              <td>{display(line.type)}</td>
              <td>{display(line.basis)}</td>
              <td
                >{line.minutes === null || line.minutes === undefined
                  ? '—'
                  : hours(line.minutes)}</td
              >
              <td>{money(line.amountMinor)}</td>
            </tr>
          {:else}<tr><td colspan="4">No calculated commercial lines.</td></tr>{/each}
        </tbody>
      </table>
    </div>
    <p class="form-help">
      Operational value: {money(summary.operationalRevenueCandidateMinor)} · Paid: {money(
        summary.paidMinor,
      )} · Receivable: {money(summary.receivableMinor)}
    </p>
  </section>

  {#if internal}
    <section class="detail-panel report-breakdown">
      <div class="panel-title">
        <div>
          <h2>Internal financial detail</h2>
          <p class="form-help">
            Internal loaded cost, worker compensation and margin remain restricted to Finance, Owner
            and Auditor roles.
          </p>
        </div>
      </div>
      <div class="record-detail-grid">
        <article class="record-fact">
          <span>Labor cost</span><strong>{money(finance.directLaborCostMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>Worker compensation</span><strong>{money(finance.workerCompensationMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>Travel cost</span><strong>{money(finance.travelCostMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>Other direct cost</span><strong>{money(finance.otherDirectCostMinor)}</strong>
        </article>
        <article class="record-fact">
          <span>Missing rate rules</span><strong>{display(finance.missingRateCount, '0')}</strong>
        </article>
      </div>
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Date</th><th>Worker</th><th>Category</th><th>Hours</th><th>Client value</th><th
                >Loaded cost</th
              ><th>Compensation</th></tr
            ></thead
          >
          <tbody>
            {#each finance.timeEconomics ?? [] as line}
              <tr
                ><td>{display(line.workDate)}</td><td>{display(line.workerName)}</td><td
                  >{display(line.category)}</td
                ><td>{hours(line.actualMinutes)}</td><td>{money(line.clientRevenueMinor)}</td><td
                  >{money(line.internalCostMinor)}</td
                ><td>{money(line.workerCompensationMinor)}</td></tr
              >
            {:else}<tr><td colspan="7">No time economics in this period.</td></tr>{/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Daily reports</h2>
        <span>{dailyReports.length}</span>
      </div>
      {#each dailyReports as item}
        <a class="record-card-link" href={item.id ? reportLink(item.id) : `${base}/app/reports`}
          ><strong>{display(item.date)}</strong><small
            >{display(item.worker)} · {display(item.summary)}</small
          ></a
        >
      {:else}<div class="empty">No daily reports in this period.</div>{/each}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Time entries</h2>
        <span>{timeSummary.length}</span>
      </div>
      {#each timeSummary as item}<article>
          <div>
            <strong>{display(item.date)} · {display(item.category)}</strong><small
              >{display(item.worker)} · {display(item.approvalState)}</small
            >
          </div>
          <b>{hours(item.minutes)}</b>
        </article>{:else}<div class="empty">No time entries in this period.</div>{/each}
    </section>
  </div>

  <div class="project-columns">
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Technical / PLC records</h2>
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
              >{display(item.changeMade)} · {display(item.approvalState)}</small
            >
          </div>
        </article>{/each}
      {#if technicalReports.length === 0 && technicalChanges.length === 0}<div class="empty">
          No technical records in this period.
        </div>{/if}
    </section>
    <section class="detail-panel">
      <div class="panel-title">
        <h2>Expenses included</h2>
        <span>{expenses.length}</span>
      </div>
      {#each expenses as item}<article>
          <div>
            <strong>{display(item.date)} · {display(item.vendor)}</strong><small
              >{display(item.category)} · {display(item.treatment)}</small
            >
          </div>
          <b
            >{item.amount === null || item.amount === undefined
              ? '—'
              : money(item.amount, String(item.currency ?? summary.currency))}</b
          >
        </article>{:else}<div class="empty">No expenses in this period.</div>{/each}
    </section>
  </div>

  {#if String(report.id)}
    <section class="detail-panel report-refresh-panel">
      <div class="panel-title">
        <div>
          <h2>Recalculate snapshot</h2>
          <p class="form-help">
            This updates the report from the current database inputs and regenerates the PDF through
            the normal report action.
          </p>
        </div>
      </div>
      <form method="POST" action="?/refresh" class="admin-form-grid">
        <input type="hidden" name="projectId" value={project.id} />
        <input type="hidden" name="periodStart" value={report.periodStart} />
        <input type="hidden" name="periodEnd" value={report.periodEnd} />
        <label
          >Language<select name="reportLocale"
            ><option value="en">English</option><option value="es">Español</option><option
              value="pt">Português</option
            ></select
          ></label
        >
        <button>Recalculate report</button>
      </form>
    </section>
  {/if}
</main>
