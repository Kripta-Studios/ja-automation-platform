<script lang="ts">
  import { base } from '$app/paths';
  import { ResponsiveSheet, StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';

  let {
    data,
    isAuditor,
    availableProjects,
    saveOfflineDraft,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    availableProjects: Row[];
    saveOfflineDraft: (
      event: SubmitEvent,
      entityType: 'time' | 'daily_report' | 'technical_report' | 'expense',
    ) => Promise<void>;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  const tabs = [
    { id: 'daily', label: 'Daily' },
    { id: 'technical', label: 'Technical / PLC' },
    { id: 'signoff', label: 'Client Sign-off' },
  ] as const;

  type ReportTab = (typeof tabs)[number]['id'];
  type Surface = 'daily' | 'technical' | 'generate' | null;
  type SignoffState = 'needs_report' | 'ready_for_signature' | 'signed' | 'invalid';

  let activeTab = $state<ReportTab>('daily');
  let surface = $state<Surface>(null);

  const records = $derived(data.records ?? []);
  const periodReports = $derived(data.periodReports ?? []);
  const dailyReports = $derived(
    records.filter((row) => String(row.type ?? '').toLowerCase() !== 'technical'),
  );
  const technicalReports = $derived(
    records.filter((row) => String(row.type ?? '').toLowerCase() === 'technical'),
  );
  const customerPeriodReports = $derived(
    periodReports.filter((report) => String(report.audience ?? '').toLowerCase() === 'customer'),
  );
  const pendingReportCount = $derived(
    records.filter((row) =>
      ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const readySignoffCount = $derived(
    customerPeriodReports.filter((report) => signoffState(report) === 'ready_for_signature').length,
  );
  const canGeneratePeriodReports = $derived(
    !isAuditor && ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? '')),
  );

  function rowText(row: Row, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  function reportTypeLabel(row: Row): string {
    return String(row.type ?? '').toLowerCase() === 'technical'
      ? translate('Technical / PLC')
      : translate('Daily');
  }

  function reportStatus(row: Row): string {
    const value = controlledValue('status', row.approval_state);
    return value || translate(String(row.approval_state ?? 'Draft'));
  }

  function signoffState(report: Row): SignoffState {
    switch (String(report.conformity_state ?? '').toLowerCase()) {
      case 'signed':
        return 'signed';
      case 'ready_for_signature':
        return 'ready_for_signature';
      case 'invalid':
      case 'superseded':
        return 'invalid';
      default:
        return 'needs_report';
    }
  }

  function signoffLabel(state: SignoffState): string {
    switch (state) {
      case 'ready_for_signature':
        return translate('Ready for signature');
      case 'signed':
        return translate('Signed');
      case 'invalid':
        return translate('Invalid / superseded');
      default:
        return translate('Needs report');
    }
  }

  function signoffVariant(state: SignoffState): 'success' | 'warning' | 'danger' | 'info' {
    switch (state) {
      case 'signed':
        return 'success';
      case 'ready_for_signature':
        return 'info';
      case 'invalid':
        return 'danger';
      default:
        return 'warning';
    }
  }

  function signoffSymbol(state: SignoffState): string {
    switch (state) {
      case 'signed':
        return '✓';
      case 'ready_for_signature':
        return '!';
      case 'invalid':
        return '×';
      default:
        return '•';
    }
  }

  function setTab(tab: ReportTab): void {
    activeTab = tab;
    surface = null;
  }

  function handleTabKey(event: KeyboardEvent, current: ReportTab): void {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === current);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) return;
    setTab(nextTab);
    document.getElementById(`report-tab-${nextTab}`)?.focus();
  }

  function openCreate(type: 'daily' | 'technical'): void {
    surface = type;
  }

  function openGenerator(): void {
    if (canGeneratePeriodReports) surface = 'generate';
  }

  function closeSurface(): void {
    surface = null;
  }
</script>

<section class="report-page" data-report-page>
  <header class="report-page-context">
    <div>
      <p class="report-page-eyebrow">{translate('Operations / reports')}</p>
      <h2>{translate('Reports')}</h2>
      <p>
        {translate(
          'Capture field activity, technical changes and customer confirmation in one register.',
        )}
      </p>
    </div>
    <span class="report-page-count" aria-label={translate('Report count')}>{records.length}</span>
  </header>

  <div class="report-attention" aria-label={translate('Report attention summary')}>
    <div class="report-attention-card">
      <span>{translate('Needs attention')}</span>
      <strong>{pendingReportCount}</strong>
      <small>{translate('Draft or returned field reports')}</small>
    </div>
    <div class="report-attention-card">
      <span>{translate('Ready for signature')}</span>
      <strong>{readySignoffCount}</strong>
      <small>{translate('Customer confirmations awaiting signature')}</small>
    </div>
    <div class="report-attention-card">
      <span>{translate('Customer sign-off')}</span>
      <strong>{customerPeriodReports.length}</strong>
      <small>{translate('Period confirmations in scope')}</small>
    </div>
  </div>

  <div class="report-tab-list" aria-label={translate('Report types')} role="tablist">
    {#each tabs as tab}
      <button
        id={`report-tab-${tab.id}`}
        type="button"
        role="tab"
        class:active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        aria-controls={`report-panel-${tab.id}`}
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => setTab(tab.id)}
        onkeydown={(event) => handleTabKey(event, tab.id)}
      >
        {translate(tab.label)}
      </button>
    {/each}
  </div>

  {#if activeTab === 'daily'}
    <div
      id="report-panel-daily"
      class="report-tab-panel"
      data-report-tab="daily"
      role="tabpanel"
      aria-labelledby="report-tab-daily"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Operational record')}</p>
          <h3>{translate('Daily')}</h3>
          <p>{translate('Shift summary, completed work, blockers and next-day plan.')}</p>
        </div>
      </header>

      <div class="report-register" aria-label={translate('Daily report register')}>
        {#each dailyReports as row}
          <article class="report-register-card">
            <a class="report-register-link" href={`${base}/app/reports/${String(row.id)}`}>
              <span class="report-register-type">{reportTypeLabel(row)}</span>
              <strong>{rowText(row, 'title') || translate('Daily field report')}</strong>
              <small
                >{rowText(row, 'date')} · {rowText(row, 'project_number')} · {reportStatus(
                  row,
                )}</small
              >
              <span class="report-register-open">{translate('Open report →')}</span>
              {#if row.approval_state === 'needs_changes'}
                <span class="report-register-notice"
                  >{translate('Changes requested before resubmission')}</span
                >
              {/if}
            </a>
            {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
              <form method="POST" action="?/submitReport" class="report-register-action">
                <input type="hidden" name="type" value={row.type} />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            <strong>{translate('No daily reports recorded.')}</strong>
            <span>{translate('Your field summaries will appear here after you save them.')}</span>
          </div>
        {/each}
      </div>
      {#if !isAuditor}
        <div class="report-primary-action-wrap">
          <button
            type="button"
            class="report-primary-action"
            data-report-primary-cta
            onclick={() => openCreate('daily')}
          >
            {translate('New daily report')}
          </button>
        </div>
      {/if}
    </div>
  {:else if activeTab === 'technical'}
    <div
      id="report-panel-technical"
      class="report-tab-panel"
      data-report-tab="technical"
      role="tabpanel"
      aria-labelledby="report-tab-technical"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Engineering record')}</p>
          <h3>{translate('Technical / PLC')}</h3>
          <p>
            {translate(
              'Controls changes, validation performed, production impact and rollback detail.',
            )}
          </p>
        </div>
      </header>

      <div class="report-register" aria-label={translate('Technical report register')}>
        {#each technicalReports as row}
          <article class="report-register-card">
            <a class="report-register-link" href={`${base}/app/reports/${String(row.id)}`}>
              <span class="report-register-type report-register-type-technical"
                >{reportTypeLabel(row)}</span
              >
              <strong>{rowText(row, 'title') || translate('Technical report')}</strong>
              <small
                >{rowText(row, 'date')} · {rowText(row, 'project_number')} · {reportStatus(
                  row,
                )}</small
              >
              <span class="report-register-open">{translate('Open report →')}</span>
              {#if row.approval_state === 'needs_changes'}
                <span class="report-register-notice"
                  >{translate('Changes requested before resubmission')}</span
                >
              {/if}
            </a>
            {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
              <form method="POST" action="?/submitReport" class="report-register-action">
                <input type="hidden" name="type" value={row.type} />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            <strong>{translate('No technical reports recorded.')}</strong>
            <span
              >{translate('PLC and controls records will appear here after you save them.')}</span
            >
          </div>
        {/each}
      </div>
      {#if !isAuditor}
        <div class="report-primary-action-wrap">
          <button
            type="button"
            class="report-primary-action"
            data-report-primary-cta
            onclick={() => openCreate('technical')}
          >
            {translate('New technical report')}
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div
      id="report-panel-signoff"
      class="report-tab-panel report-signoff-panel"
      data-report-tab="signoff"
      role="tabpanel"
      aria-labelledby="report-tab-signoff"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Customer confirmation')}</p>
          <h3>{translate('Client Sign-off')}</h3>
          <p>{translate('Confirm approved hours and activities for the selected period.')}</p>
        </div>
      </header>

      <div class="report-signoff-register" aria-label={translate('Client sign-off register')}>
        {#each customerPeriodReports as report}
          {@const state = signoffState(report)}
          <article class="report-signoff-card" data-conformity-state={state}>
            <a
              class="report-register-link"
              href={`${base}/app/reports/period/${String(report.id)}`}
            >
              <span class="report-register-type">{translate('Client sign-off')}</span>
              <strong>{rowText(report, 'project_number') || translate('Project')}</strong>
              <small>{rowText(report, 'period_start')} → {rowText(report, 'period_end')}</small>
              <span class="report-signoff-status">
                <span class="report-signoff-symbol" aria-hidden="true">{signoffSymbol(state)}</span>
                <StatusBadge variant={signoffVariant(state)} text={signoffLabel(state)} />
              </span>
              <span class="report-register-open">{translate('Open sign-off record →')}</span>
            </a>
          </article>
        {:else}
          <div class="report-empty" role="status">
            <strong>{translate('No client sign-off records yet.')}</strong>
            <span
              >{translate(
                'Customer confirmation records will appear here when the period is ready.',
              )}</span
            >
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if canGeneratePeriodReports}
    <details class="report-generator">
      <summary>
        <span>
          <strong>{translate('Refresh period reports')}</strong>
          <small>{translate('Finance / Owner action · creates reviewed period files')}</small>
        </span>
      </summary>
      <div class="report-generator-copy">
        <p>
          {translate(
            'Refresh customer and internal period summaries from reviewed source records. This does not issue or send an invoice.',
          )}
        </p>
        <button
          type="button"
          class="secondary-button"
          data-report-generator-cta
          onclick={openGenerator}
        >
          {translate('Open period refresh')}
        </button>
      </div>
    </details>
  {/if}

  {#if canGeneratePeriodReports}
    <section
      class="report-period-register"
      aria-label={translate('Generated period report register')}
    >
      <header class="report-period-register-header">
        <div>
          <h3>{translate('Generated period files')}</h3>
          <p>
            {translate('Internal and customer period records available to authorized reviewers.')}
          </p>
        </div>
        <span>{periodReports.length}</span>
      </header>
      {#each periodReports as report}
        <article class="report-period-card">
          <a class="report-register-link" href={`${base}/app/reports/period/${String(report.id)}`}>
            <strong
              >{rowText(report, 'project_number')} · {translate(
                String(report.report_type ?? 'Period summary'),
              )}</strong
            >
            <small
              >{rowText(report, 'period_start')} → {rowText(report, 'period_end')} · {controlledValue(
                'artifactState',
                report.state,
              ) || translate(String(report.state ?? 'Unknown'))}</small
            >
            <span class="report-register-open">{translate('Open period record →')}</span>
          </a>
          {#if report.pdf_storage_key}
            <a
              class="report-period-pdf"
              href={`${base}/app/api/reports/${String(report.id)}/pdf`}
              target="_blank"
              rel="noreferrer">{translate('PDF')}</a
            >
          {/if}
        </article>
      {:else}
        <div class="report-empty" role="status">{translate('No generated period files yet.')}</div>
      {/each}
    </section>
  {/if}
</section>

<ResponsiveSheet
  open={surface !== null}
  title={surface === 'technical'
    ? translate('New technical report')
    : surface === 'generate'
      ? translate('Refresh period reports')
      : translate('New daily report')}
  description={surface === 'generate'
    ? translate('Authorized Finance / Owner action for reviewed period records.')
    : translate('Operational report entry. Record what happened in the field.')}
  closeLabel={translate('Close report form')}
  class="report-entry-sheet"
  onclose={closeSurface}
>
  {#if surface === 'daily'}
    <form
      method="POST"
      action="?/createDailyReport"
      class="report-entry-form report-form"
      data-report-entry-surface="daily"
      onsubmit={(event) => saveOfflineDraft(event, 'daily_report')}
    >
      <div class="report-entry-intro">
        <strong>{translate('Capture the shift')}</strong>
        <span
          >{translate(
            'Keep this record operational: summary, completed work, blockers and next steps.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Work date')}</span><input
            name="workDate"
            type="date"
            required
          /></label
        >
        <label
          ><span>{translate('Site / shift')}</span><input
            name="siteShift"
            placeholder={translate('Line 4 · first shift')}
          /></label
        >
      </div>
      <label
        ><span>{translate('Shift summary')}</span><textarea name="summary" required
        ></textarea></label
      >
      <label
        ><span>{translate('Tasks completed')}</span><textarea name="tasksCompleted" required
        ></textarea></label
      >
      <div class="report-entry-grid">
        <label
          ><span>{translate('Problems found')}</span><textarea name="problemsFound"
          ></textarea></label
        >
        <label
          ><span>{translate('Corrective actions')}</span><textarea name="correctiveActions"
          ></textarea></label
        >
      </div>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Downtime minutes')}</span><input
            name="downtimeMinutes"
            type="number"
            min="0"
            max="1440"
            value="0"
          /></label
        >
        <label><span>{translate('Standby reason')}</span><input name="standbyReason" /></label>
      </div>
      <label><span>{translate('Open items')}</span><textarea name="openItems"></textarea></label>
      <label
        ><span>{translate('Next-day plan')}</span><textarea name="nextDayPlan"></textarea></label
      >
      <label class="report-check"
        ><input name="safetyRelated" type="checkbox" />
        <span>{translate('Safety-related change')}</span></label
      >
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save daily report')}</button>
      </div>
    </form>
  {:else if surface === 'technical'}
    <form
      method="POST"
      action="?/createTechnicalReport"
      class="report-entry-form report-form"
      data-report-entry-surface="technical"
      onsubmit={(event) => saveOfflineDraft(event, 'technical_report')}
    >
      <div class="report-entry-intro">
        <strong>{translate('Document the technical change')}</strong>
        <span
          >{translate(
            'Describe the system, validation result, production impact and rollback detail.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
        <label
          ><span>{translate('System / machine')}</span><input
            name="systemName"
            placeholder={translate('Line 4 main conveyor')}
            required
          /></label
        >
        <label><span>{translate('Plant / site')}</span><input name="plantSite" /></label>
      </div>
      <div class="report-entry-grid report-entry-grid-three">
        <label><span>{translate('Area / line')}</span><input name="areaLine" /></label>
        <label><span>{translate('Station / machine')}</span><input name="stationMachine" /></label>
        <label><span>{translate('System type')}</span><input name="systemType" /></label>
      </div>
      <div class="report-entry-grid report-entry-grid-three">
        <label
          ><span>{translate('PLC platform')}</span><input
            name="plcPlatform"
            placeholder={translate('Rockwell Automation')}
          /></label
        >
        <label
          ><span>{translate('Controller')}</span><input
            name="controller"
            placeholder={translate('ControlLogix 5580')}
          /></label
        >
        <label><span>{translate('HMI / SCADA')}</span><input name="hmiScada" /></label>
      </div>
      <div class="report-entry-grid">
        <label><span>{translate('Network / protocol')}</span><input name="networkProtocol" /></label
        >
        <label><span>{translate('Software version')}</span><input name="softwareVersion" /></label>
      </div>
      <label
        ><span>{translate('Program / project reference')}</span><input
          name="programReference"
        /></label
      >
      <label
        ><span>{translate('Problem and change performed')}</span><textarea
          name="changeSummary"
          required
        ></textarea></label
      >
      <label
        ><span>{translate('Production impact')}</span><textarea name="productionImpact"
        ></textarea></label
      >
      <div class="report-entry-grid">
        <label
          ><span>{translate('Validation performed')}</span><textarea name="validation"
          ></textarea></label
        >
        <label
          ><span>{translate('Validation result')}</span><textarea name="validationResult"
          ></textarea></label
        >
      </div>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Open risk / issue')}</span><textarea name="openRisk"></textarea></label
        >
        <label
          ><span>{translate('Rollback plan')}</span><textarea name="rollbackPlan"></textarea></label
        >
      </div>
      <label class="report-check report-check-warning">
        <input name="safetyRelated" type="checkbox" />
        <span
          >{translate(
            'Safety impact: technical lead review, validation and rollback detail required',
          )}</span
        >
      </label>
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save PLC report')}</button>
      </div>
    </form>
  {:else if surface === 'generate' && canGeneratePeriodReports}
    <form
      method="POST"
      action="?/generatePeriodReports"
      class="report-entry-form report-generator-form"
    >
      <div class="report-entry-intro">
        <strong>{translate('Refresh reviewed period records')}</strong>
        <span
          >{translate(
            'Generate customer and internal summaries from the canonical reviewed source records.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select project')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
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
      </div>
      <label>
        <span>{translate('Report language')}</span>
        <select name="reportLocale">
          <option value="en">{translate('English')}</option>
          <option value="es">{translate('Spanish')}</option>
          <option value="pt">{translate('Portuguese')}</option>
        </select>
      </label>
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Refresh reports')}</button>
      </div>
    </form>
  {/if}
</ResponsiveSheet>
