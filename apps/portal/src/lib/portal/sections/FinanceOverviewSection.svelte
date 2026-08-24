<script lang="ts">
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import FinanceConfigurationSection from './FinanceConfigurationSection.svelte';
  import { SectionCard, StatusBadge, TableRegion, formValidation } from '../ui';
  import type { TableCardRow } from '../ui';

  type MoneyFormatter = (minor: unknown, currency?: string) => string;
  type Metric = {
    key: string;
    label: string;
    value: string;
    note?: string;
  };

  let {
    data,
    availableProjects,
    isAuditor,
    translate,
    controlledValue,
    money,
  }: {
    data: PortalData;
    availableProjects: Row[];
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    money: MoneyFormatter;
  } = $props();

  const financeRoles = ['owner_admin', 'finance_admin', 'auditor_read_only'] as const;
  const financeWriteRoles = ['owner_admin', 'finance_admin'] as const;
  const componentId = $props.id();
  const finance = $derived(data.finance);
  const authorizedFinance = $derived(
    financeRoles.includes(String(data.user.role) as (typeof financeRoles)[number]),
  );
  const canWriteFinance = $derived(
    financeWriteRoles.includes(String(data.user.role) as (typeof financeWriteRoles)[number]),
  );
  const portfolioProjects = $derived(data.portfolio?.projects ?? []);
  const portfolioWorkers = $derived(data.portfolio?.byWorker ?? []);
  const timeEconomics = $derived(finance?.timeEconomics ?? []);
  const expenseEconomics = $derived(finance?.expenseEconomics ?? []);
  const financeExpenses = $derived(data.financeExpenses ?? []);
  const settlements = $derived(data.settlements ?? []);
  const reimbursements = $derived(data.reimbursements ?? []);

  function value(row: Row | Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
        return String(candidate);
      }
    }
    return '';
  }

  function displayMoney(minor: unknown, currency: unknown): string {
    if (minor === null || minor === undefined || String(minor).trim() === '') return '—';
    return money(minor, String(currency || finance?.currency || 'USD'));
  }

  /** Format canonical basis points without converting money or financial truth in the UI. */
  function displayBps(valueToFormat: unknown): string {
    const raw = String(valueToFormat ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    const negative = raw.startsWith('-');
    const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
    const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
    const fraction = digits.slice(-2);
    return `${negative ? '-' : ''}${whole}.${fraction}%`;
  }

  function displayMinutes(valueToFormat: unknown): string {
    const raw = String(valueToFormat ?? '').trim();
    return raw ? `${raw} ${translate('minutes')}` : '—';
  }

  function statusLabel(status: unknown): string {
    const raw = String(status ?? '').trim();
    return raw ? controlledValue('status', raw) || translate(raw) : translate('Not available');
  }

  function categoryLabel(category: unknown): string {
    const raw = String(category ?? '').trim();
    return raw ? controlledValue('category', raw) || translate(raw) : translate('Not classified');
  }

  function expenseClassificationState(row: Row | Record<string, unknown>): string {
    return (
      value(row, 'commercialClassificationState', 'commercial_classification_state') ||
      'unclassified'
    );
  }

  function expenseBillingState(row: Row | Record<string, unknown>): string {
    return value(row, 'billingState', 'billing_state') || 'unlocked';
  }

  function expenseIsLocked(row: Row | Record<string, unknown>): boolean {
    return (
      Boolean(value(row, 'invoiceId', 'invoice_id', 'billingLockId', 'billing_lock_id')) ||
      ['locked', 'invoiced', 'collected', 'paid'].includes(expenseBillingState(row))
    );
  }

  function expenseIdempotencyKey(row: Row | Record<string, unknown>): string {
    return `finance-expense-classification:${value(row, 'id')}:${value(row, 'version') || '1'}`;
  }

  const expensePresets = {
    reimbursable_at_cost: {
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
    },
    all_in: { clientTreatment: 'all_in', billingTreatment: 'all_in' },
    non_billable: { clientTreatment: 'non_billable', billingTreatment: 'internal_non_billable' },
  } as const;

  type ExpensePreset = keyof typeof expensePresets;

  function expensePreset(row: Row | Record<string, unknown>): ExpensePreset {
    const clientTreatment = value(row, 'clientTreatment', 'client_treatment');
    const billingTreatment = value(row, 'billingTreatment', 'billing_treatment');
    const match = (Object.keys(expensePresets) as ExpensePreset[]).find(
      (key) =>
        expensePresets[key].clientTreatment === clientTreatment &&
        expensePresets[key].billingTreatment === billingTreatment,
    );
    return match ?? 'reimbursable_at_cost';
  }

  function syncExpensePreset(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const form = select.form;
    const preset = select.value as ExpensePreset;
    if (!form || !(preset in expensePresets)) return;
    const selected = expensePresets[preset];
    const clientTreatment = form.elements.namedItem('clientTreatment') as HTMLInputElement | null;
    const billingTreatment = form.elements.namedItem('billingTreatment') as HTMLInputElement | null;
    if (clientTreatment) clientTreatment.value = selected.clientTreatment;
    if (billingTreatment) billingTreatment.value = selected.billingTreatment;
  }

  function projectNumber(row: Row | Record<string, unknown>): string {
    return value(row, 'projectNumber', 'project_number') || translate('No project number');
  }

  function projectName(row: Row | Record<string, unknown>): string {
    return value(row, 'projectName', 'project_name', 'name') || translate('Unnamed project');
  }

  function projectId(row: Row | Record<string, unknown>): string {
    return value(row, 'projectId', 'project_id', 'id');
  }

  function projectHref(row: Row | Record<string, unknown>): string {
    return `${base}/app/projects/${encodeURIComponent(projectId(row))}`;
  }

  function rowStatusVariant(
    status: unknown,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(status ?? '')) {
      case 'approved':
      case 'settled':
      case 'reimbursed':
      case 'paid':
        return 'success';
      case 'rejected':
      case 'failed':
      case 'void':
        return 'danger';
      case 'submitted':
      case 'pending':
      case 'scheduled':
      case 'needs_changes':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function timeline(
    row: Row | Record<string, unknown>,
    expectedKeys: string[],
    actualKeys: string[],
  ): string {
    const expected = value(row, ...expectedKeys) || '—';
    const actual = value(row, ...actualKeys) || '—';
    return `${translate('Expected')}: ${expected} · ${translate('Actual')}: ${actual}`;
  }

  const actualMetrics = $derived.by((): Metric[] => {
    if (!finance) return [];
    return [
      {
        key: 'direct-project-result',
        label: translate('Direct Project Result'),
        value: displayMoney(finance.contributionMarginMinor, finance.currency),
        note: translate('Contribution after approved direct cost'),
      },
      {
        key: 'contribution',
        label: translate('Contribution'),
        value: displayMoney(finance.contributionMarginMinor, finance.currency),
        note: translate('Canonical project finance value'),
      },
      {
        key: 'contribution-margin-percent',
        label: translate('Contribution Margin %'),
        value: displayBps(finance.contributionMarginBps),
        note: translate('Derived from the canonical finance projection'),
      },
      {
        key: 'direct-cost',
        label: translate('Direct cost'),
        value: displayMoney(finance.approvedCostMinor, finance.currency),
        note: translate('Approved source records'),
      },
      {
        key: 'revenue-candidate',
        label: translate('Revenue candidate'),
        value: displayMoney(finance.revenueCandidateMinor, finance.currency),
        note: translate('Candidate revenue from approved sources'),
      },
      {
        key: 'invoiced',
        label: translate('Invoiced (actual)'),
        value: displayMoney(finance.invoicedMinor, finance.currency),
      },
      {
        key: 'collected',
        label: translate('Collected (actual)'),
        value: displayMoney(finance.paidMinor, finance.currency),
        note: translate('Only append-only payment events count as collected'),
      },
      {
        key: 'outstanding',
        label: translate('Outstanding (actual)'),
        value: displayMoney(finance.receivableMinor, finance.currency),
      },
      {
        key: 'approved-wip',
        label: translate('Approved unbilled WIP'),
        value: displayMoney(finance.approvedUnbilledWipMinor, finance.currency),
      },
      {
        key: 'unapproved-wip',
        label: translate('Unapproved WIP'),
        value: displayMoney(finance.unapprovedWipMinor, finance.currency),
      },
    ];
  });

  const expectedMetrics = $derived.by((): Metric[] => {
    if (!finance) return [];
    return [
      {
        key: 'planned-minutes',
        label: translate('Planned reference minutes'),
        value: displayMinutes(finance.plannedMinutes),
        note: translate('Planning input only; it never creates actual time'),
      },
      {
        key: 'planned-remaining',
        label: translate('Planned remaining'),
        value: displayMinutes(finance.plannedRemainingMinutes),
      },
      {
        key: 'etc-direct-cost',
        label: translate('ETC direct cost (expected)'),
        value: displayMoney(finance.estimateToCompleteMinor, finance.currency),
      },
      {
        key: 'eac-direct-cost',
        label: translate('EAC direct cost (expected)'),
        value: displayMoney(finance.estimateAtCompletionCostMinor, finance.currency),
      },
      {
        key: 'expected-final-margin',
        label: translate('Expected final Contribution Margin'),
        value: displayMoney(finance.expectedFinalMarginMinor, finance.currency),
      },
      {
        key: 'hours-consumed',
        label: translate('Hours consumed'),
        value: displayBps(finance.hoursConsumedBps),
      },
      {
        key: 'travel-budget-used',
        label: translate('Travel budget used'),
        value: displayBps(finance.travelBudgetConsumedBps),
      },
    ];
  });

  const portfolioCardRows = $derived.by((): TableCardRow[] =>
    portfolioProjects.map((row) => ({
      id: projectId(row),
      cells: [
        { label: translate('Project'), value: `${projectNumber(row)} · ${projectName(row)}` },
        { label: translate('Client'), value: value(row, 'clientName', 'client_name') || '—' },
        { label: translate('Currency'), value: value(row, 'currency') || '—' },
        {
          label: translate('Approved hours'),
          value: displayMinutes(value(row, 'approvedMinutes', 'approved_minutes')),
        },
        {
          label: translate('Contribution'),
          value: displayMoney(
            value(row, 'contributionMarginMinor', 'contribution'),
            value(row, 'currency'),
          ),
        },
        {
          label: translate('Source'),
          value: projectId(row)
            ? translate('Open project source')
            : translate('Source unavailable'),
        },
      ],
    })),
  );

  const workerCardRows = $derived.by((): TableCardRow[] =>
    portfolioWorkers.map((row) => ({
      id: value(row, 'workerId', 'worker_id', 'id'),
      cells: [
        { label: translate('Worker'), value: value(row, 'workerName', 'worker_name') || '—' },
        { label: translate('Currency'), value: value(row, 'currency') || '—' },
        {
          label: translate('Approved hours'),
          value: displayMinutes(value(row, 'actualMinutes', 'actual_minutes')),
        },
        {
          label: translate('Contribution'),
          value: displayMoney(
            value(row, 'contribution', 'contributionMinor'),
            value(row, 'currency'),
          ),
        },
      ],
    })),
  );

  const timeCardRows = $derived.by((): TableCardRow[] =>
    timeEconomics.map((row) => ({
      id: value(row, 'id'),
      cells: [
        { label: translate('Date'), value: value(row, 'workDate', 'work_date') || '—' },
        { label: translate('Category'), value: categoryLabel(row.category) },
        {
          label: translate('Minutes'),
          value: value(row, 'actualMinutes', 'actual_minutes') || '—',
        },
        { label: translate('State'), value: statusLabel(row.approvalState) },
        {
          label: translate('Client revenue'),
          value: displayMoney(row.clientRevenueMinor, finance?.currency),
        },
        {
          label: translate('Loaded cost'),
          value: displayMoney(row.internalCostMinor, finance?.currency),
        },
      ],
    })),
  );

  const expenseCardRows = $derived.by((): TableCardRow[] =>
    expenseEconomics.map((row) => ({
      id: value(row, 'id'),
      cells: [
        { label: translate('Date'), value: value(row, 'spentOn', 'spent_on') || '—' },
        { label: translate('Category'), value: categoryLabel(row.category) },
        {
          label: translate('Treatment'),
          value: translate(value(row, 'treatment') || 'Not classified'),
        },
        { label: translate('Direct cost'), value: displayMoney(row.costMinor, finance?.currency) },
        {
          label: translate('Client revenue'),
          value: displayMoney(row.revenueMinor, finance?.currency),
        },
      ],
    })),
  );

  const attentionSettlements = $derived(
    settlements.filter((row) => !['settled', 'paid'].includes(value(row, 'state', 'status')))
      .length,
  );
  const attentionReimbursements = $derived(
    reimbursements.filter(
      (row) => value(row, 'reimbursementState', 'reimbursement_state') !== 'reimbursed',
    ).length,
  );
</script>

{#if !authorizedFinance}
  <section class="finance-overview finance-overview--denied" data-ui="finance-overview-denied">
    <p class="finance-overview__eyebrow">{translate('Restricted surface')}</p>
    <h2>{translate('Finance overview')}</h2>
    <p>
      {translate('Finance data is available only to authorized Finance, Owner, or Auditor roles.')}
    </p>
  </section>
{:else}
  <div class="finance-overview" data-ui="finance-overview">
    <header class="finance-overview__context">
      <div>
        <p class="finance-overview__eyebrow">{translate('Finance control')}</p>
        <h2>{translate('Finance overview')}</h2>
        <p>
          {translate(
            'Review canonical project economics, source records, planning signals, settlements, and reimbursements in one authorized workspace.',
          )}
        </p>
      </div>
      <StatusBadge
        variant={finance ? 'success' : 'neutral'}
        text={finance ? translate('Canonical projection loaded') : translate('No project selected')}
      />
    </header>

    <div class="finance-overview__attention" aria-label={translate('Finance attention summary')}>
      <article class="finance-overview__attention-card">
        <span>{translate('Projects')}</span>
        <strong>{portfolioProjects.length}</strong>
        <small>{translate('Authorized project sources')}</small>
      </article>
      <article class="finance-overview__attention-card finance-overview__attention-card--notice">
        <span>{translate('Settlement review')}</span>
        <strong>{attentionSettlements}</strong>
        <small>{translate('Expected or actual payment follow-up')}</small>
      </article>
      <article class="finance-overview__attention-card finance-overview__attention-card--notice">
        <span>{translate('Reimbursement review')}</span>
        <strong>{attentionReimbursements}</strong>
        <small>{translate('Expected or actual reimbursement follow-up')}</small>
      </article>
      <article class="finance-overview__attention-card">
        <span>{translate('Alerts')}</span>
        <strong>{finance?.alerts?.length ?? 0}</strong>
        <small>{translate('Canonical projection warnings')}</small>
      </article>
    </div>

    <form
      class="finance-overview__filters"
      method="GET"
      aria-label={translate('Filter finance by project')}
    >
      <label for={`finance-project-${componentId}`}>
        <span>{translate('Project')}</span>
        <select
          id={`finance-project-${componentId}`}
          name="project"
          onchange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {#each availableProjects as project}
            <option
              value={String(project.id)}
              selected={String(project.id) === data.selectedProjectId}
            >
              {project.project_number} — {project.name}
            </option>
          {:else}
            <option value="">{translate('No authorized projects')}</option>
          {/each}
        </select>
      </label>
    </form>

    {#if finance}
      <div class="finance-overview__summary-grid">
        <SectionCard
          title={translate('Actual')}
          class="finance-overview__surface"
          data-finance-actual
        >
          <p class="finance-overview__surface-note">
            {translate(
              'Actual values come from approved source records, issued invoices, and append-only payment events.',
            )}
          </p>
          <div class="finance-overview__metrics" aria-label={translate('Actual finance metrics')}>
            {#each actualMetrics as metric}
              <article class="finance-overview__metric" data-metric={metric.key}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                {#if metric.note}<small>{metric.note}</small>{/if}
              </article>
            {/each}
          </div>
        </SectionCard>

        <SectionCard
          title={translate('Planned / Expected')}
          class="finance-overview__surface"
          data-finance-expected
        >
          <p class="finance-overview__surface-note">
            {translate(
              'Planning and expected values are directional controls. They never count as actual time, paid cash, or collected revenue.',
            )}
          </p>
          <div class="finance-overview__forecast-status" role="status">
            <StatusBadge
              variant={finance.forecastAvailable ? 'info' : 'neutral'}
              text={finance.forecastAvailable
                ? translate('Planning basis available')
                : translate('No detailed plan')}
            />
          </div>
          <div
            class="finance-overview__metrics"
            aria-label={translate('Planned and expected finance metrics')}
          >
            {#each expectedMetrics as metric}
              <article class="finance-overview__metric" data-metric={metric.key}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                {#if metric.note}<small>{metric.note}</small>{/if}
              </article>
            {/each}
          </div>
          {#if finance.alerts?.length}
            <div
              class="finance-overview__alerts"
              role="status"
              aria-label={translate('Finance alerts')}
            >
              {#each finance.alerts as alert}
                <span>{translate(String(alert).replaceAll('_', ' '))}</span>
              {/each}
            </div>
          {/if}
        </SectionCard>
      </div>

      <SectionCard
        title={translate('Portfolio source drill-down')}
        class="finance-overview__surface"
      >
        <p class="finance-overview__surface-note">
          {translate(
            'Open the project source for the underlying operational and commercial records. Portfolio values remain grouped by currency.',
          )}
        </p>
        <TableRegion
          class="finance-overview__table-region"
          ariaLabel={translate('Portfolio finance source table')}
          mobileMode="cards"
          cardRows={portfolioCardRows}
        >
          <table class="finance-overview__table">
            <caption class="sr-only">{translate('Portfolio finance source drill-down')}</caption>
            <thead>
              <tr>
                <th scope="col">{translate('Project')}</th>
                <th scope="col">{translate('Client')}</th>
                <th scope="col">{translate('Currency')}</th>
                <th scope="col">{translate('Approved hours')}</th>
                <th scope="col">{translate('Revenue candidate')}</th>
                <th scope="col">{translate('Direct cost')}</th>
                <th scope="col">{translate('Contribution')}</th>
                <th scope="col">{translate('WIP')}</th>
                <th scope="col">{translate('Source')}</th>
              </tr>
            </thead>
            <tbody>
              {#each portfolioProjects as row}
                <tr data-finance-project-row={projectId(row)}>
                  <td>
                    {#if projectId(row)}
                      <a class="finance-overview__source-link" href={projectHref(row)}>
                        <strong>{projectNumber(row)}</strong>
                        <span>{projectName(row)}</span>
                      </a>
                    {:else}
                      <strong>{projectNumber(row)}</strong>
                    {/if}
                  </td>
                  <td>{value(row, 'clientName', 'client_name') || '—'}</td>
                  <td>{value(row, 'currency') || '—'}</td>
                  <td>{displayMinutes(value(row, 'approvedMinutes', 'approved_minutes'))}</td>
                  <td
                    >{displayMoney(
                      value(row, 'revenueCandidateMinor', 'revenue_candidate_minor'),
                      value(row, 'currency'),
                    )}</td
                  >
                  <td
                    >{displayMoney(
                      value(row, 'approvedCostMinor', 'approved_cost_minor'),
                      value(row, 'currency'),
                    )}</td
                  >
                  <td
                    >{displayMoney(
                      value(row, 'contributionMarginMinor', 'contribution'),
                      value(row, 'currency'),
                    )}</td
                  >
                  <td
                    >{displayMoney(
                      value(row, 'approvedUnbilledWipMinor', 'approved_unbilled_wip_minor'),
                      value(row, 'currency'),
                    )}</td
                  >
                  <td>
                    {#if projectId(row)}
                      <a class="finance-overview__source-link" href={projectHref(row)}
                        >{translate('Open source')}</a
                      >
                    {:else}
                      {translate('Unavailable')}
                    {/if}
                  </td>
                </tr>
              {:else}
                <tr><td colspan="9">{translate('No finance projects are available.')}</td></tr>
              {/each}
            </tbody>
          </table>
        </TableRegion>

        {#if portfolioWorkers.length}
          <div class="finance-overview__subsurface">
            <div class="finance-overview__subsurface-heading">
              <h3>{translate('Worker economics by source')}</h3>
              <span>{portfolioWorkers.length} {translate('records')}</span>
            </div>
            <TableRegion
              class="finance-overview__table-region"
              ariaLabel={translate('Worker economics source table')}
              mobileMode="cards"
              cardRows={workerCardRows}
            >
              <table class="finance-overview__table">
                <caption class="sr-only">{translate('Worker economics by source')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{translate('Worker')}</th>
                    <th scope="col">{translate('Currency')}</th>
                    <th scope="col">{translate('Approved hours')}</th>
                    <th scope="col">{translate('Billable hours')}</th>
                    <th scope="col">{translate('Revenue attributed')}</th>
                    <th scope="col">{translate('Loaded labor cost')}</th>
                    <th scope="col">{translate('Travel / expense')}</th>
                    <th scope="col">{translate('Contribution')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each portfolioWorkers as row}
                    <tr>
                      <td>{value(row, 'workerName', 'worker_name') || '—'}</td>
                      <td>{value(row, 'currency') || '—'}</td>
                      <td>{displayMinutes(value(row, 'actualMinutes', 'actual_minutes'))}</td>
                      <td>{displayMinutes(value(row, 'billableMinutes', 'billable_minutes'))}</td>
                      <td>{displayMoney(value(row, 'revenue'), value(row, 'currency'))}</td>
                      <td
                        >{displayMoney(
                          value(row, 'internalCost', 'internal_cost'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(row, 'expenseCost', 'expense_cost'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(row, 'contribution', 'contributionMinor'),
                          value(row, 'currency'),
                        )}</td
                      >
                    </tr>
                  {:else}
                    <tr
                      ><td colspan="8"
                        >{translate('No approved worker economics are available.')}</td
                      ></tr
                    >
                  {/each}
                </tbody>
              </table>
            </TableRegion>
          </div>
        {/if}
      </SectionCard>

      <SectionCard title={translate('Time economics review')} class="finance-overview__surface">
        <div class="finance-overview__subsurface-heading">
          <div>
            <h3>{translate('Approved time source records')}</h3>
            <p>
              {translate(
                'Review source minutes, billing state, canonical rates, and direct cost without recalculating them here.',
              )}
            </p>
          </div>
          <span>{timeEconomics.length} {translate('records')}</span>
        </div>
        <TableRegion
          class="finance-overview__table-region"
          ariaLabel={translate('Time economics source table')}
          mobileMode="cards"
          cardRows={timeCardRows}
        >
          <table class="finance-overview__table">
            <caption class="sr-only">{translate('Time economics review')}</caption>
            <thead>
              <tr>
                <th scope="col">{translate('Date')}</th>
                <th scope="col">{translate('Category')}</th>
                <th scope="col">{translate('Minutes')}</th>
                <th scope="col">{translate('Billable minutes')}</th>
                <th scope="col">{translate('State')}</th>
                <th scope="col">{translate('Billing')}</th>
                <th scope="col">{translate('Client revenue')}</th>
                <th scope="col">{translate('Loaded cost')}</th>
                <th scope="col">{translate('Worker compensation')}</th>
                <th scope="col">{translate('Configuration')}</th>
              </tr>
            </thead>
            <tbody>
              {#each timeEconomics as row}
                <tr>
                  <td>{value(row, 'workDate', 'work_date') || '—'}</td>
                  <td>{categoryLabel(row.category)}</td>
                  <td>{value(row, 'actualMinutes', 'actual_minutes') || '—'}</td>
                  <td>{value(row, 'clientBillableMinutes', 'client_billable_minutes') || '0'}</td>
                  <td
                    ><StatusBadge
                      variant={rowStatusVariant(row.approvalState)}
                      text={statusLabel(row.approvalState)}
                    /></td
                  >
                  <td>{statusLabel(row.billingStatus ?? 'unlocked')}</td>
                  <td>{displayMoney(row.clientRevenueMinor, finance.currency)}</td>
                  <td>{displayMoney(row.internalCostMinor, finance.currency)}</td>
                  <td>{displayMoney(row.workerCompensationMinor, finance.currency)}</td>
                  <td
                    >{row.clientRateConfigured && row.internalCostConfigured
                      ? translate('Complete')
                      : translate('Rate review')}</td
                  >
                </tr>
              {:else}
                <tr
                  ><td colspan="10"
                    >{translate('No time economics are available for this project.')}</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </TableRegion>
      </SectionCard>

      <SectionCard title={translate('Expense economics')} class="finance-overview__surface">
        <div class="finance-overview__subsurface-heading">
          <div>
            <h3>{translate('Finance-classified expense source records')}</h3>
            <p>
              {translate(
                'Operational expense truth and Finance classification remain separate workflows.',
              )}
            </p>
          </div>
          <span>{expenseEconomics.length} {translate('records')}</span>
        </div>
        <TableRegion
          class="finance-overview__table-region"
          ariaLabel={translate('Expense economics source table')}
          mobileMode="cards"
          cardRows={expenseCardRows}
        >
          <table class="finance-overview__table">
            <caption class="sr-only">{translate('Expense economics')}</caption>
            <thead>
              <tr>
                <th scope="col">{translate('Date')}</th>
                <th scope="col">{translate('Category')}</th>
                <th scope="col">{translate('Treatment')}</th>
                <th scope="col">{translate('Direct cost')}</th>
                <th scope="col">{translate('Client revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {#each expenseEconomics as row}
                <tr>
                  <td>{value(row, 'spentOn', 'spent_on') || '—'}</td>
                  <td>{categoryLabel(row.category)}</td>
                  <td>{translate(value(row, 'treatment') || 'Not classified')}</td>
                  <td>{displayMoney(row.costMinor, finance.currency)}</td>
                  <td>{displayMoney(row.revenueMinor, finance.currency)}</td>
                </tr>
              {:else}
                <tr
                  ><td colspan="5"
                    >{translate('No approved expenses are available for this project.')}</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </TableRegion>

        {#if financeExpenses.length}
          <div
            class="finance-overview__expense-controls"
            data-finance-expense-controls
            aria-label={translate('Finance expense classification and planning')}
          >
            <div class="finance-overview__subsurface-heading">
              <div>
                <h3>{translate('Expense treatment and planning')}</h3>
                <p>
                  {translate(
                    'Finance/Admin classify operational expense truth. Expected reimbursement and recovery remain separate from actual states.',
                  )}
                </p>
              </div>
              <span>{financeExpenses.length} {translate('source records')}</span>
            </div>

            {#each financeExpenses as expense}
              {@const expenseId = value(expense, 'id')}
              {@const expenseVersion = value(expense, 'version') || '1'}
              {@const classificationState = expenseClassificationState(expense)}
              {@const locked = expenseIsLocked(expense)}
              {@const reimbursementState =
                value(expense, 'reimbursementState', 'reimbursement_state') || 'pending'}
              <article
                class="finance-overview__expense-control"
                data-finance-expense-id={expenseId}
              >
                <header class="finance-overview__expense-control-heading">
                  <div>
                    <strong
                      >{value(expense, 'spentOn', 'spent_on') || '—'} · {categoryLabel(
                        expense.category,
                      )}</strong
                    >
                    <small
                      >{value(expense, 'vendor') || translate('Expense')} ·
                      {displayMoney(
                        value(expense, 'amountMinor', 'amount_minor'),
                        value(expense, 'currency'),
                      )}</small
                    >
                  </div>
                  <StatusBadge
                    variant={classificationState === 'classified' ? 'success' : 'warning'}
                    text={classificationState === 'classified'
                      ? translate('Classified')
                      : translate('Needs Finance classification')}
                  />
                </header>

                <div class="finance-overview__expense-timeline" data-expense-timeline>
                  <span
                    ><strong>{translate('Expected reimbursement')}</strong>
                    {value(expense, 'expectedReimbursementOn', 'expected_reimbursement_on') ||
                      '—'}</span
                  >
                  <span
                    ><strong>{translate('Actual reimbursement')}</strong>
                    {value(expense, 'reimbursedAt', 'reimbursed_at') ||
                      statusLabel(reimbursementState)}</span
                  >
                  <span
                    ><strong>{translate('Expected client recovery')}</strong>
                    {value(expense, 'expectedRecoveryOn', 'expected_recovery_on') || '—'}</span
                  >
                  <span
                    ><strong>{translate('Actual client recovery state')}</strong>
                    {statusLabel(expenseBillingState(expense))}</span
                  >
                </div>

                {#if canWriteFinance && !locked}
                  <div class="finance-overview__expense-form-grid">
                    <form
                      method="POST"
                      action="?/classifyExpenseCommercially"
                      class="finance-overview__expense-form"
                      data-finance-expense-classification
                      use:formValidation
                    >
                      <input type="hidden" name="expenseId" value={expenseId} />
                      <input type="hidden" name="expectedVersion" value={expenseVersion} />
                      <input
                        type="hidden"
                        name="clientTreatment"
                        value={expensePresets[expensePreset(expense)].clientTreatment}
                      />
                      <input
                        type="hidden"
                        name="billingTreatment"
                        value={expensePresets[expensePreset(expense)].billingTreatment}
                      />
                      <input type="hidden" name="markupBps" value="0" />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={expenseIdempotencyKey(expense)}
                      />
                      <div class="finance-overview__form-title">
                        <strong>{translate('Finance classification')}</strong>
                        <span>{translate('Commercial configuration only')}</span>
                      </div>
                      <label>
                        <span>{translate('Expense treatment preset')}</span>
                        <select
                          name="expensePreset"
                          value={expensePreset(expense)}
                          onchange={syncExpensePreset}
                          required
                        >
                          <option value="reimbursable_at_cost">
                            {translate('Reimbursable at cost')}
                          </option>
                          <option value="all_in">{translate('All-in')}</option>
                          <option value="non_billable">{translate('Non-billable')}</option>
                        </select>
                      </label>
                      <label>
                        <span>{translate('Tax (basis points; 0% allowed)')}</span>
                        <input
                          name="taxBps"
                          type="number"
                          min="0"
                          max="100000"
                          step="1"
                          value="0"
                          inputmode="numeric"
                          required
                        />
                        <small>{translate('0 bps = 0%; 100 bps = 1%.')}</small>
                      </label>
                      <label>
                        <span>{translate('Reason')}</span>
                        <textarea name="reason" rows="2" minlength="1" maxlength="2000" required
                        ></textarea>
                      </label>
                      <button type="submit">{translate('Save Finance classification')}</button>
                    </form>

                    <form
                      method="POST"
                      action="?/setExpensePlanningDates"
                      class="finance-overview__expense-form"
                      data-finance-expense-planning
                      use:formValidation
                    >
                      <input type="hidden" name="expenseId" value={expenseId} />
                      <input type="hidden" name="expectedVersion" value={expenseVersion} />
                      <div class="finance-overview__form-title">
                        <strong>{translate('Expense planning dates')}</strong>
                        <span>{translate('Planning only; actual states remain authoritative')}</span
                        >
                      </div>
                      <label>
                        <span>{translate('Expected reimbursement')}</span>
                        <input
                          name="expectedReimbursementOn"
                          type="date"
                          value={value(
                            expense,
                            'expectedReimbursementOn',
                            'expected_reimbursement_on',
                          )}
                        />
                      </label>
                      <label>
                        <span>{translate('Expected client recovery')}</span>
                        <input
                          name="expectedRecoveryOn"
                          type="date"
                          value={value(expense, 'expectedRecoveryOn', 'expected_recovery_on')}
                        />
                      </label>
                      <button type="submit">{translate('Save planning dates')}</button>
                    </form>
                  </div>
                {:else if locked}
                  <p class="finance-overview__immutable-note">
                    {translate(
                      'Historical or billed expense state; planning and classification are locked.',
                    )}
                  </p>
                {:else}
                  <p class="finance-overview__immutable-note">
                    {translate(
                      'Auditor view is read-only; Finance/Admin changes require authorized access.',
                    )}
                  </p>
                {/if}
              </article>
            {/each}
          </div>
        {:else}
          <p class="finance-overview__empty" data-finance-expense-controls-empty>
            {translate(
              'No expense source records are available for Finance classification or planning.',
            )}
          </p>
        {/if}
      </SectionCard>

      <SectionCard title={translate('Compensation settlements')} class="finance-overview__surface">
        <p class="finance-overview__surface-note">
          {translate(
            'Finance-only finalization of approved compensation. Settlements are immutable snapshots and keep expected and actual dates distinct.',
          )}
        </p>
        {#if canWriteFinance}
          <form method="POST" action="?/settleCompensation" class="finance-overview__action-form">
            <input type="hidden" name="projectId" value={data.selectedProjectId} />
            <label>
              <span>{translate('Worker')}</span>
              <select name="workerId" required>
                <option value="">{translate('Select worker')}</option>
                {#each data.workers ?? [] as worker}
                  <option value={String(worker.id)}>{worker.name}</option>
                {/each}
              </select>
            </label>
            <label
              ><span>{translate('Period start')}</span><input
                name="periodStart"
                type="date"
                required
              /></label
            >
            <label
              ><span>{translate('Period end')}</span><input
                name="periodEnd"
                type="date"
                required
              /></label
            >
            <button type="submit">{translate('Finalize compensation')}</button>
          </form>
        {/if}
        <TableRegion
          class="finance-overview__table-region"
          ariaLabel={translate('Compensation settlements table')}
          mobileMode="cards"
          cardRows={settlements.map((row) => ({
            id: value(row, 'id'),
            cells: [
              { label: translate('Worker'), value: value(row, 'workerName', 'worker_name') || '—' },
              {
                label: translate('Period'),
                value: `${value(row, 'periodStart', 'period_start')} → ${value(row, 'periodEnd', 'period_end')}`,
              },
              { label: translate('Amount'), value: displayMoney(row.amountMinor, row.currency) },
              { label: translate('State'), value: statusLabel(row.state ?? row.status) },
              {
                label: translate('Timeline'),
                value: timeline(
                  row,
                  ['expectedPaymentDate', 'expected_payment_date'],
                  ['settledAt', 'settled_at'],
                ),
              },
            ],
          }))}
        >
          <table class="finance-overview__table">
            <caption class="sr-only">{translate('Compensation settlements')}</caption>
            <thead>
              <tr>
                <th scope="col">{translate('Worker')}</th>
                <th scope="col">{translate('Period')}</th>
                <th scope="col">{translate('Basis')}</th>
                <th scope="col">{translate('Source')}</th>
                <th scope="col">{translate('Amount')}</th>
                <th scope="col">{translate('State')}</th>
                <th scope="col">{translate('Expected / actual')}</th>
              </tr>
            </thead>
            <tbody>
              {#each settlements as settlement}
                <tr>
                  <td>{value(settlement, 'workerName', 'worker_name') || '—'}</td>
                  <td
                    >{value(settlement, 'periodStart', 'period_start')} → {value(
                      settlement,
                      'periodEnd',
                      'period_end',
                    )}</td
                  >
                  <td>{value(settlement, 'sourceBasis', 'source_basis') || '—'}</td>
                  <td
                    >{displayMoney(
                      value(settlement, 'sourceAmountMinor', 'source_amount_minor'),
                      settlement.currency,
                    )}</td
                  >
                  <td>{displayMoney(settlement.amountMinor, settlement.currency)}</td>
                  <td
                    ><StatusBadge
                      variant={rowStatusVariant(settlement.state ?? settlement.status)}
                      text={statusLabel(settlement.state ?? settlement.status)}
                    /></td
                  >
                  <td
                    >{timeline(
                      settlement,
                      ['expectedPaymentDate', 'expected_payment_date'],
                      ['settledAt', 'settled_at'],
                    )}</td
                  >
                </tr>
              {:else}
                <tr
                  ><td colspan="7">{translate('No settlements recorded for this project.')}</td></tr
                >
              {/each}
            </tbody>
          </table>
        </TableRegion>
        {#if settlements.length && canWriteFinance}
          <div
            class="finance-overview__settlement-planning"
            data-settlement-planning
            aria-label={translate('Expected worker payment planning')}
          >
            <h3>{translate('Expected worker payment')}</h3>
            <p class="finance-overview__surface-note">
              {translate(
                'Set an expected payment date while preserving the actual settled timestamp.',
              )}
            </p>
            {#each settlements as settlement}
              {@const settlementState = value(settlement, 'state', 'status')}
              <form
                method="POST"
                action="?/setCompensationSettlementExpectedPaymentOn"
                class="finance-overview__settlement-form"
                data-settlement-planning-form
                use:formValidation
              >
                <input type="hidden" name="settlementId" value={value(settlement, 'id')} />
                <label>
                  <span
                    >{value(settlement, 'workerName', 'worker_name') || translate('Worker')}</span
                  >
                  <small
                    >{translate('Actual settled')}: {value(settlement, 'settledAt', 'settled_at') ||
                      statusLabel(settlementState) ||
                      '—'}</small
                  >
                  <input
                    name="expectedPaymentOn"
                    type="date"
                    value={value(settlement, 'expectedPaymentOn', 'expected_payment_on')}
                    aria-label={translate('Expected worker payment date')}
                  />
                </label>
                <button type="submit">{translate('Save expected date')}</button>
              </form>
            {/each}
          </div>
        {/if}
      </SectionCard>

      <SectionCard
        title={translate('Worker reimbursement queue')}
        class="finance-overview__surface"
      >
        <p class="finance-overview__surface-note">
          {translate(
            'Worker reimbursement and client expense recovery are separate from customer billing and invoice collection.',
          )}
        </p>
        <div class="finance-overview__reimbursement-list">
          {#each reimbursements as reimbursement}
            {@const reimbursementState = value(
              reimbursement,
              'reimbursementState',
              'reimbursement_state',
            )}
            <article
              class="finance-overview__reimbursement"
              data-reimbursement-id={value(reimbursement, 'id')}
            >
              <div>
                <strong
                  >{value(reimbursement, 'workerName', 'worker_name')} · {value(
                    reimbursement,
                    'vendor',
                  ) || translate('Expense')}</strong
                >
                <small>
                  {value(reimbursement, 'spentOn', 'spent_on')} · {categoryLabel(
                    reimbursement.category,
                  )} ·
                  <StatusBadge
                    variant={rowStatusVariant(reimbursementState)}
                    text={statusLabel(reimbursementState)}
                  />
                </small>
                <small
                  >{timeline(
                    reimbursement,
                    ['expectedReimbursementDate', 'expected_reimbursement_date'],
                    ['reimbursedAt', 'reimbursed_at'],
                  )}</small
                >
              </div>
              {#if canWriteFinance && reimbursementState !== 'reimbursed'}
                <form
                  method="POST"
                  action="?/recordReimbursement"
                  class="finance-overview__reimbursement-form"
                >
                  <input type="hidden" name="expenseId" value={reimbursement.id} />
                  <input
                    type="hidden"
                    name="amountMinor"
                    value={reimbursement.reimbursementAmountMinor}
                  />
                  <label>
                    <span>{translate('Payment reference')}</span>
                    <input name="reference" required />
                  </label>
                  <button type="submit">{translate('Mark reimbursed')}</button>
                </form>
              {:else}
                <strong
                  >{displayMoney(
                    reimbursement.reimbursementAmountMinor,
                    reimbursement.currency,
                  )}</strong
                >
              {/if}
            </article>
          {:else}
            <div class="finance-overview__empty" role="status">
              {translate('No approved worker-paid expenses require reimbursement.')}
            </div>
          {/each}
        </div>
      </SectionCard>

      <div class="finance-overview__configuration">
        <FinanceConfigurationSection
          {data}
          {availableProjects}
          {isAuditor}
          {translate}
          {controlledValue}
        />
      </div>
    {:else}
      <SectionCard title={translate('Select a project')} class="finance-overview__surface">
        <p>
          {translate('Choose an authorized project to inspect its canonical finance projection.')}
        </p>
      </SectionCard>
    {/if}
  </div>
{/if}

<style>
  .finance-overview {
    display: grid;
    gap: 1rem;
    color: var(--portal-ink, #16202a);
  }

  .finance-overview__context {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 0 0.35rem;
  }

  .finance-overview__context h2,
  .finance-overview--denied h2 {
    margin: 0;
    font-size: clamp(1.45rem, 2.5vw, 2rem);
    letter-spacing: -0.025em;
  }

  .finance-overview__context p:last-child,
  .finance-overview--denied p:last-child {
    max-width: 52rem;
    margin: 0.45rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .finance-overview__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-accent, #0f5f73);
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .finance-overview--denied {
    padding: 1.25rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.8rem;
    background: var(--portal-surface, #fff);
  }

  .finance-overview__attention {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .finance-overview__attention-card {
    display: grid;
    gap: 0.22rem;
    min-height: 5.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .finance-overview__attention-card--notice {
    border-color: color-mix(
      in srgb,
      var(--portal-warning, #b7791f) 42%,
      var(--portal-border, #d7dee8)
    );
  }

  .finance-overview__attention-card span,
  .finance-overview__attention-card small {
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .finance-overview__attention-card strong,
  .finance-overview__metric strong {
    font-variant-numeric: tabular-nums;
  }

  .finance-overview__attention-card strong {
    font-size: 1.4rem;
  }

  .finance-overview__filters {
    display: grid;
    grid-template-columns: minmax(15rem, 30rem);
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .finance-overview__filters label,
  .finance-overview__action-form label,
  .finance-overview__reimbursement-form label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .finance-overview__filters select,
  .finance-overview__action-form input,
  .finance-overview__action-form select,
  .finance-overview__reimbursement-form input {
    min-height: 2.7rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .finance-overview__summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .finance-overview__surface-note {
    margin: 0 0 0.9rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .finance-overview__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .finance-overview__metric {
    display: grid;
    gap: 0.25rem;
    min-height: 5.6rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 90%, var(--portal-wash, #eef2f5));
  }

  .finance-overview__metric span {
    color: var(--portal-muted, #64748b);
    font-size: 0.75rem;
    line-height: 1.25;
  }

  .finance-overview__metric strong {
    color: var(--portal-ink, #16202a);
    font-size: 1.15rem;
    overflow-wrap: anywhere;
  }

  .finance-overview__metric small,
  .finance-overview__subsurface-heading p {
    color: var(--portal-muted, #64748b);
    font-size: 0.75rem;
    line-height: 1.35;
  }

  .finance-overview__forecast-status {
    margin: 0 0 0.75rem;
  }

  .finance-overview__alerts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.75rem;
  }

  .finance-overview__alerts span {
    padding: 0.35rem 0.55rem;
    border: 1px solid
      color-mix(in srgb, var(--portal-warning, #b7791f) 38%, var(--portal-border, #d7dee8));
    border-radius: 999px;
    color: var(--portal-ink, #16202a);
    font-size: 0.76rem;
  }

  .finance-overview__table {
    width: 100%;
    border-collapse: collapse;
  }

  .finance-overview__table th,
  .finance-overview__table td {
    padding: 0.72rem 0.65rem;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
    text-align: left;
    vertical-align: top;
  }

  .finance-overview__table th {
    color: var(--portal-muted, #64748b);
    font-size: 0.69rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .finance-overview__table td {
    color: var(--portal-ink, #16202a);
    font-size: 0.84rem;
    font-variant-numeric: tabular-nums;
  }

  .finance-overview__source-link {
    display: grid;
    gap: 0.18rem;
    color: var(--portal-accent, #0f5f73);
    text-decoration: none;
  }

  .finance-overview__source-link span {
    color: var(--portal-ink, #16202a);
  }

  .finance-overview__source-link:hover {
    text-decoration: underline;
  }

  .finance-overview__subsurface {
    display: grid;
    gap: 0.65rem;
    margin-top: 1.1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #d7dee8);
  }

  .finance-overview__subsurface-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .finance-overview__subsurface-heading h3 {
    margin: 0;
    font-size: 1rem;
  }

  .finance-overview__subsurface-heading p {
    margin: 0.3rem 0 0;
  }

  .finance-overview__subsurface-heading > span {
    flex: 0 0 auto;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .finance-overview__expense-controls,
  .finance-overview__settlement-planning {
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #d7dee8);
  }

  .finance-overview__expense-control {
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 94%, var(--portal-wash, #eef2f5));
  }

  .finance-overview__expense-control-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .finance-overview__expense-control-heading > div,
  .finance-overview__form-title {
    display: grid;
    gap: 0.22rem;
  }

  .finance-overview__expense-control-heading small,
  .finance-overview__form-title span,
  .finance-overview__settlement-form small {
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .finance-overview__expense-timeline {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .finance-overview__expense-timeline span {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.6rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
    color: var(--portal-ink, #16202a);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .finance-overview__expense-timeline strong {
    color: var(--portal-muted, #64748b);
    font-size: 0.7rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .finance-overview__expense-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .finance-overview__expense-form,
  .finance-overview__settlement-form {
    display: grid;
    align-content: start;
    gap: 0.65rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }

  .finance-overview__expense-form label,
  .finance-overview__settlement-form label {
    display: grid;
    gap: 0.3rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .finance-overview__expense-form input,
  .finance-overview__expense-form select,
  .finance-overview__expense-form textarea,
  .finance-overview__settlement-form input {
    width: 100%;
    min-height: 2.7rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .finance-overview__expense-form textarea {
    min-height: 4.25rem;
    resize: vertical;
  }

  .finance-overview__expense-form small {
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 500;
  }

  .finance-overview__expense-form button,
  .finance-overview__settlement-form button {
    min-height: 2.7rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--portal-accent, #0f5f73);
    border-radius: 0.5rem;
    background: var(--portal-accent, #0f5f73);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .finance-overview__settlement-planning h3 {
    margin: 0;
    font-size: 1rem;
  }

  .finance-overview__settlement-form {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .finance-overview__immutable-note {
    margin: 0;
    padding: 0.7rem;
    border-left: 3px solid var(--portal-border-strong, #b8c3d1);
    color: var(--portal-muted, #64748b);
    font-size: 0.82rem;
  }

  .finance-overview__action-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 0.7rem;
    margin-bottom: 1rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .finance-overview__action-form button,
  .finance-overview__reimbursement-form button {
    min-height: 2.7rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--portal-accent, #0f5f73);
    border-radius: 0.5rem;
    background: var(--portal-accent, #0f5f73);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .finance-overview__reimbursement-list {
    display: grid;
    gap: 0.65rem;
  }

  .finance-overview__reimbursement {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
  }

  .finance-overview__reimbursement > div:first-child {
    display: grid;
    gap: 0.3rem;
  }

  .finance-overview__reimbursement small {
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .finance-overview__reimbursement-form {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) auto;
    align-items: end;
    gap: 0.55rem;
    min-width: min(27rem, 100%);
  }

  .finance-overview__empty {
    padding: 1rem;
    color: var(--portal-muted, #64748b);
    text-align: center;
  }

  .finance-overview__filters select:focus-visible,
  .finance-overview__action-form input:focus-visible,
  .finance-overview__action-form select:focus-visible,
  .finance-overview__reimbursement-form input:focus-visible,
  .finance-overview__expense-form input:focus-visible,
  .finance-overview__expense-form select:focus-visible,
  .finance-overview__expense-form textarea:focus-visible,
  .finance-overview__settlement-form input:focus-visible,
  .finance-overview__action-form button:focus-visible,
  .finance-overview__reimbursement-form button:focus-visible,
  .finance-overview__expense-form button:focus-visible,
  .finance-overview__settlement-form button:focus-visible,
  .finance-overview__source-link:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 62rem) {
    .finance-overview__attention {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__summary-grid {
      grid-template-columns: 1fr;
    }

    .finance-overview__action-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__expense-timeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__action-form button {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 48rem) {
    .finance-overview__context,
    .finance-overview__reimbursement,
    .finance-overview__subsurface-heading {
      flex-direction: column;
    }

    .finance-overview__context :global(.ui-status-badge),
    .finance-overview__reimbursement-form {
      width: 100%;
    }

    .finance-overview__reimbursement-form {
      min-width: 0;
    }
  }

  @media (max-width: 36rem) {
    .finance-overview__attention,
    .finance-overview__metrics,
    .finance-overview__action-form,
    .finance-overview__expense-form-grid,
    .finance-overview__reimbursement-form {
      grid-template-columns: 1fr;
    }

    .finance-overview__expense-control-heading {
      flex-direction: column;
    }

    .finance-overview__expense-timeline,
    .finance-overview__settlement-form {
      grid-template-columns: 1fr;
    }

    .finance-overview__filters {
      grid-template-columns: 1fr;
    }

    .finance-overview__action-form button {
      grid-column: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .finance-overview * {
      scroll-behavior: auto;
    }
  }
</style>
