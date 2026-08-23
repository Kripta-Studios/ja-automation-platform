<script lang="ts">
  import { base } from '$app/paths';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';

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
</script>

<div class="report-workspace">
  <div class="report-compose-column">
    {#if !isAuditor}
      <div class="report-forms">
        <details open>
          <summary>
            <span>01</span>
            <div>
              <strong>{translate('Daily field report')}</strong>
              <small>{translate('Shift summary, blockers and next-day plan')}</small>
            </div>
          </summary>
          <form
            method="POST"
            action="?/createDailyReport"
            class="entry-panel report-form"
            onsubmit={(event) => saveOfflineDraft(event, 'daily_report')}
          >
            <label
              >{translate('Project')}
              <select name="projectId" required>
                <option value="">{translate('Select assignment')}</option>
                {#each availableProjects as project}
                  <option value={project.id}>{project.project_number} — {project.name}</option>
                {/each}
              </select>
            </label>
            <div class="two-up">
              <label>{translate('Work date')}<input name="workDate" type="date" required /></label>
              <label
                >{translate('Site / shift')}<input name="siteShift" placeholder={translate('Line 4 · first shift')} /></label
              >
            </div>
            <label>{translate('Shift summary')}<textarea name="summary" required></textarea></label>
            <label>{translate('Tasks completed')}<textarea name="tasksCompleted" required></textarea></label>
            <div class="two-up">
              <label>{translate('Problems found')}<textarea name="problemsFound"></textarea></label>
              <label>{translate('Corrective actions')}<textarea name="correctiveActions"></textarea></label>
            </div>
            <div class="two-up">
              <label
                >{translate('Downtime minutes')}<input
                  name="downtimeMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value="0"
                /></label
              >
              <label>{translate('Standby reason')}<input name="standbyReason" /></label>
            </div>
            <label>{translate('Open items')}<textarea name="openItems"></textarea></label>
            <label>{translate('Next-day plan')}<textarea name="nextDayPlan"></textarea></label>
            <label class="check"
              ><input name="safetyRelated" type="checkbox" /> {translate('Safety-related change')}</label
            >
            <button>{translate('Save daily report')}</button>
          </form>
        </details>
        <details>
          <summary>
            <span>02</span>
            <div>
              <strong>{translate('PLC / technical report')}</strong>
              <small>{translate('Controls-specific change and validation record')}</small>
            </div>
          </summary>
          <form
            method="POST"
            action="?/createTechnicalReport"
            class="entry-panel report-form"
            onsubmit={(event) => saveOfflineDraft(event, 'technical_report')}
          >
            <label
              >{translate('Project')}
              <select name="projectId" required>
                <option value="">{translate('Select assignment')}</option>
                {#each availableProjects as project}
                  <option value={project.id}>{project.project_number} — {project.name}</option>
                {/each}
              </select>
            </label>
            <div class="two-up">
              <label
                >{translate('System / machine')}<input
                  name="systemName"
                  placeholder={translate('Line 4 main conveyor')}
                  required
                /></label
              >
              <label>{translate('Plant / site')}<input name="plantSite" /></label>
            </div>
            <div class="three-up">
              <label>{translate('Area / line')}<input name="areaLine" /></label>
              <label>{translate('Station / machine')}<input name="stationMachine" /></label>
              <label>{translate('System type')}<input name="systemType" /></label>
            </div>
            <div class="three-up">
              <label
                >{translate('PLC platform')}<input name="plcPlatform" placeholder={translate('Rockwell Automation')} /></label
              >
              <label>{translate('Controller')}<input name="controller" placeholder={translate('ControlLogix 5580')} /></label>
              <label>{translate('HMI / SCADA')}<input name="hmiScada" /></label>
            </div>
            <div class="two-up">
              <label>{translate('Network / protocol')}<input name="networkProtocol" /></label>
              <label>{translate('Software version')}<input name="softwareVersion" /></label>
            </div>
            <label>{translate('Program / project reference')}<input name="programReference" /></label>
            <label
              >{translate('Problem and change performed')}<textarea name="changeSummary" required
              ></textarea></label
            >
            <label>{translate('Production impact')}<textarea name="productionImpact"></textarea></label>
            <div class="two-up">
              <label>{translate('Validation performed')}<textarea name="validation"></textarea></label>
              <label>{translate('Validation result')}<textarea name="validationResult"></textarea></label>
            </div>
            <div class="two-up">
              <label>{translate('Open risk / issue')}<textarea name="openRisk"></textarea></label>
              <label>{translate('Rollback plan')}<textarea name="rollbackPlan"></textarea></label>
            </div>
            <label class="check safety-check">
              <input name="safetyRelated" type="checkbox" /> {translate('Safety impact: technical lead review, validation and rollback detail required')}
            </label>
            <button>{translate('Save PLC report')}</button>
          </form>
        </details>
      </div>
      {#if data.user.role === 'owner_admin' || data.user.role === 'finance_admin'}
        <form
          method="POST"
          action="?/generatePeriodReports"
          class="admin-form-grid report-generation-form"
        >
          <h2>{translate('Generate reports')}</h2>
          <p class="form-help">
            {translate('Refresh customer and internal period summaries from reviewed source records and create the PDF downloads. This does not issue or send an invoice.')}
          </p>
          <label
            >{translate('Project')}
            <select name="projectId" required>
              <option value="">{translate('Select project')}</option>
              {#each availableProjects as project}
                <option value={project.id}>{project.project_number} — {project.name}</option>
              {/each}
            </select>
          </label>
          <label
            >{translate('Period start')}<input name="periodStart" type="date" value="2026-08-01" required /></label
          >
          <label>{translate('Period end')}<input name="periodEnd" type="date" value="2026-08-31" required /></label
          >
          <label
            >{translate('Report language')}
            <select name="reportLocale">
              <option value="en">{translate('English')}</option>
              <option value="es">{translate('Spanish')}</option>
              <option value="pt">{translate('Portuguese')}</option>
            </select>
          </label>
          <button>{translate('Refresh PDF reports')}</button>
        </form>
      {/if}
    {/if}
    <section class="record-list full period-report-list">
      <div class="panel-title">
        <div>
          <h2>{translate('Period report register')}</h2>
          <p class="form-help">
            {translate('Customer and internal summaries are generated after a reviewed billing-period close.')}
          </p>
        </div>
        <span>{data.periodReports?.length ?? 0}</span>
      </div>
      {#each data.periodReports ?? [] as report}
        <article class="record-card">
          <a class="record-card-link" href={`${base}/app/reports/period/${String(report.id)}`}>
            <strong
              >{String(report.project_number)} · {translate(String(report.report_type ?? 'period_summary'))} · {translate(String(
                report.audience,
              ).toUpperCase())}</strong
            >
            <small
              >{String(report.period_start)} → {String(report.period_end)} · {controlledValue('artifactState', report.state) || translate(String(
                report.state,
              ))}</small
            >
            <span class="record-card-open">{translate('Open record →')}</span>
          </a>
          {#if report.pdf_storage_key}
            <a
              class="preview-link"
              href={`${base}/app/api/reports/${String(report.id)}/pdf`}
              target="_blank"
              rel="noreferrer">PDF</a
            >
          {/if}
        </article>
      {:else}
        <div class="empty">{translate('No generated period summaries yet.')}</div>
      {/each}
    </section>
  </div>

  <section class="record-list report-history">
    <div class="panel-title">
      <h2>{translate('Report register')}</h2>
      <span>{data.records?.length ?? 0}</span>
    </div>
    {#each data.records ?? [] as row}
      <article class:is-modified={row.approval_state === 'needs_changes'} class="record-card">
        <a class="record-card-link" href={`${base}/app/reports/${String(row.id)}`}>
          <span class:technical={row.type === 'technical'} class="report-type">
            {row.type === 'technical' ? 'PLC' : translate('DAILY')}
          </span>
          <strong>{row.title}</strong>
          <small>{row.date} · {row.project_number} · {controlledValue('status', row.approval_state) || translate(row.approval_state)}</small>
          <span class="record-card-open">{translate('Open record →')}</span>
          {#if row.approval_state === 'needs_changes'}
            <span class="change-summary">{translate('Modified · owner/admin review required')}</span>
          {/if}
        </a>
        {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
          <form method="POST" action="?/submitReport">
            <input type="hidden" name="type" value={row.type} />
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="version" value={row.version} />
            <button>{translate('Submit')}</button>
          </form>
        {/if}
      </article>
    {:else}
      <div class="empty">{translate('No field reports recorded.')}</div>
    {/each}
  </section>
</div>
